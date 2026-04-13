import { useState, useEffect, useCallback, useMemo } from 'react'
import { getHistory } from '../services/api'
import { GOVERNORATES, RISK_COLORS, RISK_ORDER } from '../constants/grid'
import { useWeather } from '../hooks/useWeather'
import RiskBadge from '../components/UI/RiskBadge'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

const ALL_GOVS = GOVERNORATES
const MACRO_REGIONS = ['North', 'Centre', 'South']

// ─── Synthetic 48h history (deterministic — char-sum seed, no network) ────────
function _mockHistory48h(gov) {
  const seed = gov.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: 48 }, (_, i) => {
    const hour = i % 24
    const daylight = hour >= 6 && hour <= 19
    const solarMultiplier = daylight ? Math.sin(((hour - 6) / 13) * Math.PI) : 0
    const wind = +(gov.mock_wind * (0.7 + 0.3 * Math.sin(i * 0.4 + seed))).toFixed(2)
    const irr  = +(gov.mock_irradiance * solarMultiplier * (0.8 + 0.2 * Math.sin(i * 0.3))).toFixed(0)
    const output_mw =
      gov.source === 'Wind'
        ? +(0.5 * 1.225 * (gov.rotor_area  || 5000)   * Math.pow(wind, 3) * (gov.efficiency || 0.4)  / 1e6).toFixed(2)
        : gov.source === 'Solar'
        ? +(irr * (gov.panel_area || 100000) * (gov.efficiency || 0.18) / 1e6).toFixed(2)
        : gov.mock_mw  // Hydro — constant rated output
    return {
      time: `${String(hour).padStart(2, '0')}:00`,
      wind_ms: wind,
      irradiance: +irr,
      output_mw,
    }
  })
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: '#0d1526',
        border: '1px solid rgba(0,255,136,0.15)',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '0.75rem',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ color: '#8899aa', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ width: '8px', height: '2px', background: p.color }} />
          <span style={{ color: '#8899aa' }}>{p.name}</span>
          <span style={{ color: p.color, fontFamily: "'JetBrains Mono', monospace", marginLeft: 'auto' }}>
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Risk Breakdown ──────────────────────────────────────────────────────────
const RISK_COMPONENTS = [
  { key: 'deviation',   label: 'Output Deviation',    color: '#ff3333', pct: 0 },
  { key: 'rate_change', label: 'Rate of Change',       color: '#ff9500', pct: 0 },
  { key: 'correlation', label: 'Regional Correlation', color: '#06b6d4', pct: 0 },
]

function getRiskComponents(riskLevel) {
  const base = {
    CRITICAL: [78, 65, 82],
    HIGH:     [55, 42, 60],
    ELEVATED: [35, 28, 40],
    NOMINAL:  [12, 9, 15],
  }[riskLevel] || [12, 9, 15]
  return RISK_COMPONENTS.map((c, i) => ({
    ...c,
    pct: base[i] + (Math.random() * 8 - 4) | 0,
  }))
}

export default function Analytics() {
  const { weatherMap, isMock: weatherMock } = useWeather()
  const [selectedGov, setSelectedGov]     = useState(ALL_GOVS[0])
  const [historyData, setHistoryData]     = useState([])
  const [loading, setLoading]             = useState(true)
  const [isMock, setIsMock]               = useState(false)
  const [tableData, setTableData]         = useState([])
  const [openRegions, setOpenRegions]     = useState(() => new Set(MACRO_REGIONS))
  const [regionFilter, setRegionFilter]   = useState('')
  const [riskFilter, setRiskFilter]       = useState('')

  // National Overview — recalculated when live weatherMap updates
  const overviewData = useMemo(() => [...GOVERNORATES]
    .map(g => {
      const live = weatherMap[g.name]
      return {
        name:   g.name.slice(0, 5).trim(),
        gov:    g,
        output: live ? live.output_mw : g.mock_mw,
        demand: g.avg_demand_mw,
        risk:   live ? live.risk_level : g.mock_risk,
      }
    })
    .sort((a, b) => (RISK_ORDER[b.risk] || 0) - (RISK_ORDER[a.risk] || 0)),
  [weatherMap])

  const loadHistory = useCallback(async (gov) => {
    setLoading(true)
    try {
      if (gov.hasBackend) {
        const result  = await getHistory(gov.name, 2)
        const records = result.data.records || []
        setIsMock(result.mock)

        const sampled = records
          .filter((_, i) => i % Math.max(1, Math.floor(records.length / 48)) === 0)
          .slice(0, 48)

        const series = sampled.map((r) => ({
          time: r.recorded_at
            ? new Date(r.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : '',
          wind_ms:    +r.wind_speed_ms.toFixed(2),
          irradiance: +r.solar_irradiance_wm2.toFixed(0),
          output_mw:
            gov.source === 'Wind'
              ? +(0.5 * 1.225 * (gov.rotor_area  || 5000)   * Math.pow(r.wind_speed_ms, 3) * (gov.efficiency || 0.4)  / 1e6).toFixed(2)
              : gov.source === 'Solar'
              ? +(r.solar_irradiance_wm2 * (gov.panel_area || 100000) * (gov.efficiency || 0.18) / 1e6).toFixed(2)
              : gov.baseline_mw,
        }))

        setHistoryData(series)
        setTableData(
          records.slice(0, 20).map((r) => ({
            time:       r.recorded_at ? new Date(r.recorded_at).toLocaleString('en-GB') : '',
            wind_ms:    r.wind_speed_ms.toFixed(2),
            irradiance: r.solar_irradiance_wm2.toFixed(0),
            region:     r.region,
          }))
        )
      } else {
        // Non-backend: generate synthetic series immediately, no network call
        setHistoryData(_mockHistory48h(gov))
        setTableData([])
        setIsMock(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory(selectedGov)
  }, [selectedGov, loadHistory])

  // Unified 6-column CSV — same schema for both backend and synthetic data
  const exportCSV = () => {
    const rows = [
      ['Timestamp', 'Wind (m/s)', 'Irradiance (W/m²)', 'Output (MW)', 'Region', 'Source'],
      ...historyData.map((r) => [r.time, r.wind_ms, r.irradiance, r.output_mw, selectedGov.name, selectedGov.source]),
    ]
    const csv  = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `noorgrid-${selectedGov.name}-history.csv`
    a.click()
  }

  const selectedLiveRisk = weatherMap[selectedGov?.name]?.risk_level || selectedGov?.mock_risk
  const components = getRiskComponents(selectedLiveRisk)

  // Govs visible in the current filter state
  const visibleGovs = ALL_GOVS.filter((g) => {
    const regionOk = regionFilter === '' || g.region.startsWith(regionFilter)
    const liveRisk = weatherMap[g.name]?.risk_level || g.mock_risk
    const riskOk   = riskFilter   === '' || liveRisk === riskFilter
    return regionOk && riskOk
  })

  const isSelectedVisible = visibleGovs.some((g) => g.name === selectedGov?.name)

  // Select a gov and ensure its region section is open
  const handleSelectGov = (gov) => {
    setSelectedGov(gov)
    const macro = MACRO_REGIONS.find((m) => gov.region.startsWith(m))
    if (macro) {
      setOpenRegions((prev) => {
        const next = new Set(prev)
        next.add(macro)
        return next
      })
    }
  }

  const toggleRegion = (macro) => {
    setOpenRegions((prev) => {
      const next = new Set(prev)
      next.has(macro) ? next.delete(macro) : next.add(macro)
      return next
    })
  }

  return (
    <div className="page-in" style={{ background: '#0a0f1a', minHeight: '100vh', paddingTop: '56px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#00ff88', marginBottom: '6px' }}>
              Analytics
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.02em' }}>
              Grid Performance & Risk Analysis
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#8899aa', marginTop: '6px' }}>
              48-hour trend analysis · Composite risk scoring · Historical data export
              {(isMock || weatherMock) && (
                <span style={{ marginLeft: '8px', color: '#ff9500', fontSize: '0.75rem', fontWeight: 600 }}>
                  [Simulated data]
                </span>
              )}
            </p>
          </div>
          <button onClick={exportCSV} className="btn btn-outline btn-sm">↓ Export CSV</button>
        </div>

        {/* ── National Overview ───────────────────────────────────────────── */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
                National Grid Snapshot
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f0f4f8', marginTop: '2px' }}>
                All 24 Governorates — Output vs Avg Demand
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '0.68rem', color: '#8899aa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', background: '#00ff88', borderRadius: '2px' }} />
                Output MW
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px' }} />
                Avg Demand MW
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={overviewData}
              margin={{ top: 4, right: 4, bottom: 4, left: -20 }}
              barSize={8}
              barGap={2}
              onClick={(data) => {
                if (!data?.activePayload?.[0]) return
                handleSelectGov(data.activePayload[0].payload.gov)
              }}
              style={{ cursor: 'pointer' }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 8, fill: '#8899aa', fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="output" name="Output MW" radius={[2, 2, 0, 0]}>
                {overviewData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={RISK_COLORS[entry.risk] || '#00ff88'}
                    opacity={selectedGov?.name === entry.gov.name ? 1 : 0.6}
                  />
                ))}
              </Bar>
              <Bar dataKey="demand" name="Avg Demand MW" fill="rgba(255,255,255,0.12)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Filter Row ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Region pills */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['', ...MACRO_REGIONS].map((r) => (
              <button
                key={r || 'all-region'}
                onClick={() => setRegionFilter(r)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: `1px solid ${regionFilter === r ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.12)'}`,
                  background: regionFilter === r ? 'rgba(0,255,136,0.1)' : 'transparent',
                  color: regionFilter === r ? '#00ff88' : '#8899aa',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.15s',
                }}
              >
                {r || 'All Regions'}
              </button>
            ))}
          </div>

          {/* Risk pills */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
            {['', 'CRITICAL', 'HIGH', 'ELEVATED', 'NOMINAL'].map((r) => {
              const active = riskFilter === r
              const col    = RISK_COLORS[r]
              return (
                <button
                  key={r || 'all-risk'}
                  onClick={() => setRiskFilter(r)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${active ? (col ? col + '60' : 'rgba(0,255,136,0.4)') : 'rgba(0,255,136,0.08)'}`,
                    background: active ? (col ? col + '14' : 'rgba(0,255,136,0.08)') : 'transparent',
                    color: active ? (col || '#00ff88') : '#8899aa',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.15s',
                  }}
                >
                  {r || 'All Risk'}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Context Chip (when selectedGov is filtered out) ─────────────── */}
        {!isSelectedVisible && selectedGov && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              marginBottom: '10px',
              background: `${RISK_COLORS[selectedLiveRisk] || '#00ff88'}12`,
              border: `1px solid ${RISK_COLORS[selectedLiveRisk] || '#00ff88'}40`,
              borderRadius: '5px',
              fontSize: '0.72rem',
              color: '#e2e8f0',
            }}
          >
            <span style={{ color: '#8899aa' }}>Viewing:</span>
            <span style={{ fontWeight: 700, color: RISK_COLORS[selectedLiveRisk] || '#00ff88' }}>
              {selectedGov.name}
            </span>
            <span style={{ color: '#8899aa', fontSize: '0.65rem' }}>
              [{selectedGov.region} · {selectedLiveRisk}]
            </span>
            <button
              onClick={() => { setRegionFilter(''); setRiskFilter('') }}
              style={{
                background: 'none',
                border: 'none',
                color: '#8899aa',
                cursor: 'pointer',
                fontSize: '0.8rem',
                padding: '0 2px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── Collapsible Region Tabs ─────────────────────────────────────── */}
        <div
          style={{
            marginBottom: '2rem',
            background: '#0d1526',
            borderRadius: '8px',
            border: '1px solid rgba(0,255,136,0.1)',
            overflow: 'hidden',
          }}
        >
          {MACRO_REGIONS.map((macro, idx) => {
            const groupGovs = visibleGovs.filter((g) => g.region.startsWith(macro))
            if (groupGovs.length === 0) return null
            const isOpen = openRegions.has(macro)
            return (
              <div
                key={macro}
                style={{
                  borderBottom: idx < MACRO_REGIONS.length - 1 ? '1px solid rgba(0,255,136,0.06)' : 'none',
                }}
              >
                {/* Region header */}
                <button
                  onClick={() => toggleRegion(macro)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#8899aa',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,255,136,0.03)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>{isOpen ? '▼' : '▶'}</span>
                  {macro}
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.62rem',
                      color: 'rgba(136,153,170,0.5)',
                      fontWeight: 400,
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    ({groupGovs.length})
                  </span>
                </button>

                {/* Tabs */}
                {isOpen && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 10px 10px' }}>
                    {groupGovs.map((g) => {
                      const isActive   = selectedGov?.name === g.name
                      const liveRisk   = weatherMap[g.name]?.risk_level || g.mock_risk
                      const riskColor  = RISK_COLORS[liveRisk] || '#00ff88'
                      return (
                        <button
                          key={g.name}
                          onClick={() => handleSelectGov(g)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '5px',
                            border: `1px solid ${isActive ? riskColor + '60' : 'transparent'}`,
                            background: isActive ? `${riskColor}12` : 'transparent',
                            color: isActive ? riskColor : '#8899aa',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s',
                            fontFamily: "'Inter', sans-serif",
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#e2e8f0' }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#8899aa' }}
                        >
                          {g.name}
                          {g.hasBackend && (
                            <span style={{ color: '#00ff88', fontSize: '0.5rem' }}>●</span>
                          )}
                          <RiskBadge level={liveRisk} size="xs" showDot={false} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Charts Row ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

          {/* 48H Trend */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
                  48H Trend
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f4f8', marginTop: '2px' }}>
                  {selectedGov?.name} — Energy Output
                </div>
              </div>
              {loading && <div className="spinner" />}
            </div>

            {historyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={historyData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="gwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00ff88" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="irrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 9, fill: '#8899aa', fontFamily: "'JetBrains Mono', monospace" }}
                    axisLine={false} tickLine={false}
                    interval={Math.floor(historyData.length / 8)}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#8899aa' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="output_mw" stroke="#00ff88" fill="url(#gwGrad)" strokeWidth={2} name="Output MW" dot={false} />
                  {selectedGov?.source !== 'Hydro' && (
                    <Area type="monotone" dataKey="wind_ms" stroke="#06b6d4" fill="url(#irrGrad)" strokeWidth={1.5} name="Wind m/s" dot={false} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" />
              </div>
            )}
          </div>

          {/* Composite Risk Score */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
                Risk Analysis
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f4f8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Composite Risk Score
                <RiskBadge level={selectedLiveRisk} size="sm" />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              {components.map((c) => (
                <div key={c.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#8899aa', fontWeight: 500 }}>{c.label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 700, color: c.color }}>
                      {c.pct}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${c.pct}%`,
                        background: `linear-gradient(90deg, ${c.color}88, ${c.color})`,
                        borderRadius: '3px',
                        boxShadow: `0 0 8px ${c.color}55`,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '20px',
                padding: '12px',
                background: `${RISK_COLORS[selectedLiveRisk]}08`,
                border: `1px solid ${RISK_COLORS[selectedLiveRisk]}25`,
                borderRadius: '6px',
              }}
            >
              <div style={{ fontSize: '0.6rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                Composite Score
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: RISK_COLORS[selectedLiveRisk],
                    letterSpacing: '-0.02em',
                  }}
                >
                  {Math.round(components.reduce((a, c) => a + c.pct, 0) / 3)}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#8899aa' }}>/ 100</span>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={components} barSize={28} margin={{ top: 5, right: 0, bottom: 5, left: -20 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#8899aa' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="pct" name="Risk %" radius={[3, 3, 0, 0]}>
                    {components.map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Historical Data Table ────────────────────────────────────────── */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
                Historical Records
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f4f8', marginTop: '2px' }}>
                {selectedGov?.name} — Last 48 Hours
              </div>
            </div>
            <button onClick={exportCSV} className="btn btn-secondary btn-sm">↓ CSV</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,255,136,0.1)' }}>
                  {['Timestamp', 'Wind Speed', 'Solar Irradiance', 'Region'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: '#8899aa',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,255,136,0.03)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: '#8899aa', fontSize: '0.72rem' }}>
                      {row.time}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: '#06b6d4' }}>
                      {row.wind_ms} m/s
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: '#ffd700' }}>
                      {row.irradiance} W/m²
                    </td>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{row.region}</td>
                  </tr>
                ))}
                {tableData.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#8899aa', fontSize: '0.8rem' }}>
                      {loading
                        ? 'Loading historical data…'
                        : selectedGov?.hasBackend
                        ? 'No records found'
                        : 'Synthetic data — no raw records for this governorate'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
