import { useState, useEffect, useCallback } from 'react'
import { getHistory } from '../services/api'
import { GOVERNORATES, RISK_COLORS } from '../constants/grid'
import RiskBadge from '../components/UI/RiskBadge'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from 'recharts'

const BACKEND_GOVS = GOVERNORATES.filter((g) => g.hasBackend)

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

// ─── Risk Breakdown Bar ──────────────────────────────────────────────────────
const RISK_COMPONENTS = [
  { key: 'deviation',    label: 'Output Deviation',     color: '#ff3333', pct: 0 },
  { key: 'rate_change',  label: 'Rate of Change',       color: '#ff9500', pct: 0 },
  { key: 'correlation',  label: 'Regional Correlation', color: '#06b6d4', pct: 0 },
]

function getRiskComponents(gov) {
  const risk = gov.mock_risk
  const base = {
    CRITICAL: [78, 65, 82],
    HIGH:     [55, 42, 60],
    ELEVATED: [35, 28, 40],
    NOMINAL:  [12, 9, 15],
  }[risk] || [12, 9, 15]
  return RISK_COMPONENTS.map((c, i) => ({
    ...c,
    pct: base[i] + (Math.random() * 8 - 4) | 0,
  }))
}

export default function Analytics() {
  const [selectedGov, setSelectedGov]   = useState(BACKEND_GOVS[0])
  const [historyData, setHistoryData]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [isMock, setIsMock]             = useState(false)
  const [riskComponents]                = useState(() => getRiskComponents(BACKEND_GOVS[0]))
  const [tableData, setTableData]       = useState([])

  const loadHistory = useCallback(async (gov) => {
    setLoading(true)
    try {
      const result = await getHistory(gov.name, 2)
      const records = result.data.records || []
      setIsMock(result.mock)

      // Build 48-point series (or the records we have, sampled to ~48)
      const sampled = records.filter((_, i) => i % Math.max(1, Math.floor(records.length / 48)) === 0).slice(0, 48)

      const series = sampled.map((r) => ({
        time: r.recorded_at ? new Date(r.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
        wind_ms: +r.wind_speed_ms.toFixed(2),
        irradiance: +r.solar_irradiance_wm2.toFixed(0),
        // Estimate MW based on source
        output_mw: gov.source === 'Wind'
          ? +(0.5 * 1.225 * (gov.rotor_area || 5000) * Math.pow(r.wind_speed_ms, 3) * (gov.efficiency || 0.4) / 1e6).toFixed(2)
          : gov.source === 'Solar'
          ? +(r.solar_irradiance_wm2 * (gov.panel_area || 100000) * (gov.efficiency || 0.18) / 1e6).toFixed(2)
          : gov.baseline_mw,
      }))

      setHistoryData(series)
      setTableData(records.slice(0, 20).map((r) => ({
        time: r.recorded_at ? new Date(r.recorded_at).toLocaleString('en-GB') : '',
        wind_ms: r.wind_speed_ms.toFixed(2),
        irradiance: r.solar_irradiance_wm2.toFixed(0),
        region: r.region,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory(selectedGov)
  }, [selectedGov, loadHistory])

  const exportCSV = () => {
    const rows = [
      ['Time', 'Wind (m/s)', 'Irradiance (W/m²)', 'Region'],
      ...tableData.map((r) => [r.time, r.wind_ms, r.irradiance, r.region]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `noorgrid-${selectedGov.name}-history.csv`
    a.click()
  }

  const components = getRiskComponents(selectedGov)

  return (
    <div className="page-in" style={{ background: '#0a0f1a', minHeight: '100vh', paddingTop: '56px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>

        {/* Header */}
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
              {isMock && (
                <span style={{ marginLeft: '8px', color: '#ff9500', fontSize: '0.75rem', fontWeight: 600 }}>
                  [Simulated data — backend offline]
                </span>
              )}
            </p>
          </div>
          <button onClick={exportCSV} className="btn btn-outline btn-sm">
            ↓ Export CSV
          </button>
        </div>

        {/* Governorate Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            marginBottom: '2rem',
            padding: '8px',
            background: '#0d1526',
            borderRadius: '8px',
            border: '1px solid rgba(0,255,136,0.1)',
          }}
        >
          {BACKEND_GOVS.map((g) => (
            <button
              key={g.name}
              onClick={() => setSelectedGov(g)}
              style={{
                padding: '6px 14px',
                borderRadius: '5px',
                border: `1px solid ${selectedGov?.name === g.name ? RISK_COLORS[g.mock_risk] + '60' : 'transparent'}`,
                background: selectedGov?.name === g.name ? `${RISK_COLORS[g.mock_risk]}12` : 'transparent',
                color: selectedGov?.name === g.name ? RISK_COLORS[g.mock_risk] : '#8899aa',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {g.name}
              <RiskBadge level={g.mock_risk} size="xs" showDot={false} />
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.65rem', color: '#8899aa' }}>
              Source: <span style={{ color: '#00ff88', fontWeight: 600 }}>{selectedGov?.source}</span>
            </span>
            <span style={{ fontSize: '0.65rem', color: '#8899aa' }}>
              Baseline: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#06b6d4' }}>{selectedGov?.baseline_mw} MW</span>
            </span>
          </div>
        </div>

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

          {/* 48H Trend Chart */}
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
                    <Area type="monotone" dataKey="wind_ms"   stroke="#06b6d4" fill="url(#irrGrad)" strokeWidth={1.5} name="Wind m/s" dot={false} />
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
                <RiskBadge level={selectedGov?.mock_risk} size="sm" />
              </div>
            </div>

            {/* Score breakdown bars */}
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

            {/* Composite score */}
            <div
              style={{
                marginTop: '20px',
                padding: '12px',
                background: `${RISK_COLORS[selectedGov?.mock_risk]}08`,
                border: `1px solid ${RISK_COLORS[selectedGov?.mock_risk]}25`,
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
                    color: RISK_COLORS[selectedGov?.mock_risk],
                    letterSpacing: '-0.02em',
                  }}
                >
                  {Math.round(components.reduce((a, c) => a + c.pct, 0) / 3)}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#8899aa' }}>/ 100</span>
              </div>
            </div>

            {/* Bar chart breakdown */}
            <div style={{ marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={components} barSize={28} margin={{ top: 5, right: 0, bottom: 5, left: -20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#8899aa' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v.split(' ')[0]} />
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

        {/* Historical Data Table */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
                Historical Records
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f4f8', marginTop: '2px' }}>
                {selectedGov?.name} — Last 7 Days
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
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,255,136,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
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
                      {loading ? 'Loading historical data…' : 'No records found'}
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
