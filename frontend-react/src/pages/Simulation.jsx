import { useEffect } from 'react'
import { useGridSim } from '../hooks/useGridSim'
import { STEG, RISK_COLORS, AUG14_SCENARIO } from '../constants/grid'
import RiskBadge from '../components/UI/RiskBadge'
import STEGChatbot from '../components/AI/STEGChatbot'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

// ─── Build 24-hour demand chart from simulation result ───────────────────────
function buildDemandChart(result, params) {
  if (!result) return []
  const points = []
  for (let h = 0; h < 24; h++) {
    const peak = h >= 8 && h <= 19
    const cooling = Math.max(0, (params.temperature_c - 25) * 0.04)
    const peakF = params.include_peak_hour_factor && peak ? 1.05 : 1.0
    const base = STEG.Q3_AVG_DEMAND_MW * peakF * (1 + cooling)
    const demand = base * (1 + params.demand_delta_pct / 100) * (0.85 + 0.15 * Math.sin((h - 8) * Math.PI / 12))
    const daylight = h >= 6 && h <= 19
    const renewable = daylight
      ? params.renewable_output_mw * (0.6 + 0.4 * Math.sin((h - 6) * Math.PI / 13))
      : params.renewable_output_mw * 0.1
    points.push({
      hour: `${String(h).padStart(2, '0')}:00`,
      demand: +demand.toFixed(0),
      capacity: STEG.EFFECTIVE_CAPACITY_MW + params.reserve_capacity_mw,
      renewable: +renewable.toFixed(0),
    })
  }
  return points
}

// ─── Slider Control ──────────────────────────────────────────────────────────
function SliderControl({ label, value, min, max, step, unit, onChange, color = '#00ff88', format }) {
  const display = format ? format(value) : `${value}${unit || ''}`
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: '0.72rem', color: '#8899aa', fontWeight: 500 }}>{label}</label>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.85rem',
            fontWeight: 700,
            color,
          }}
        >
          {display}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, ${color}55 ${pct}%, rgba(0,255,136,0.1) ${pct}%)`,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.58rem', color: '#4a5568' }}>{min}{unit}</span>
        <span style={{ fontSize: '0.58rem', color: '#4a5568' }}>{max}{unit}</span>
      </div>
    </div>
  )
}

// ─── Result Metric ───────────────────────────────────────────────────────────
function ResultMetric({ label, value, unit, color = '#e2e8f0', sub }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: '#0d1526',
        border: '1px solid rgba(0,255,136,0.1)',
        borderRadius: '6px',
      }}
    >
      <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.2rem', fontWeight: 700, color, letterSpacing: '-0.02em' }}>
        {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value}
        {unit && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: '#8899aa', marginLeft: '4px' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: '0.62rem', color: '#6a7a8a', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0d1526', border: '1px solid rgba(0,255,136,0.15)', borderRadius: '6px', padding: '8px 12px', fontSize: '0.72rem' }}>
      <div style={{ color: '#8899aa', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: '8px', color: p.color }}>
          <span style={{ color: '#8899aa' }}>{p.name}:</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.value?.toLocaleString()} MW</span>
        </div>
      ))}
    </div>
  )
}

export default function Simulation() {
  const {
    params, result, loading, error, isMock, isReplay,
    simulate, updateParam, replayAug14, reset,
  } = useGridSim()

  // Run simulation whenever params change
  useEffect(() => {
    const timer = setTimeout(() => simulate(), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.demand_delta_pct, params.temperature_c, params.renewable_output_mw, params.reserve_capacity_mw, params.include_peak_hour_factor])

  const chartData = buildDemandChart(result, params)
  const riskColor = result ? RISK_COLORS[result.risk_level] : '#00ff88'

  return (
    <div className="page-in" style={{ background: '#0a0f1a', minHeight: '100vh', paddingTop: '56px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#00ff88', marginBottom: '6px' }}>
              Simulation Console
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f0f4f8', letterSpacing: '-0.02em' }}>
              National Grid Simulation
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#8899aa', marginTop: '6px' }}>
              Adjust parameters to model grid stress scenarios in real time
              {isMock && ' · Simulated mode'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isReplay && (
              <div
                style={{
                  padding: '6px 12px',
                  background: 'rgba(255,51,51,0.08)',
                  border: '1px solid rgba(255,51,51,0.3)',
                  borderRadius: '5px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#ff3333',
                  letterSpacing: '0.06em',
                  animation: 'livePulse 1.5s infinite',
                }}
              >
                ⚠ REPLAYING AUG 14 2024
              </div>
            )}
            <button onClick={reset} className="btn btn-secondary btn-sm">Reset</button>
            <button onClick={replayAug14} className="btn btn-alert btn-sm">
              ⚠ Replay Aug 14 2024
            </button>
          </div>
        </div>

        {/* Aug 14 banner */}
        {isReplay && (
          <div
            style={{
              padding: '14px 20px',
              background: 'rgba(255,51,51,0.06)',
              border: '1px solid rgba(255,51,51,0.25)',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 700, color: '#ff3333', marginBottom: '4px' }}>{AUG14_SCENARIO.label}</div>
              <div style={{ fontSize: '0.82rem', color: '#8899aa' }}>{AUG14_SCENARIO.description}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* ── Controls ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
                Parameters
              </div>

              <SliderControl
                label="Demand Delta"
                value={params.demand_delta_pct}
                min={-20} max={50} step={1} unit="%"
                color="#ff9500"
                onChange={(v) => updateParam('demand_delta_pct', v)}
                format={(v) => `${v > 0 ? '+' : ''}${v}%`}
              />
              <SliderControl
                label="Temperature"
                value={params.temperature_c}
                min={15} max={55} step={0.5} unit="°C"
                color={params.temperature_c > 38 ? '#ff3333' : params.temperature_c > 30 ? '#ff9500' : '#00ff88'}
                onChange={(v) => updateParam('temperature_c', v)}
              />
              <SliderControl
                label="Renewable Output"
                value={params.renewable_output_mw}
                min={0} max={800} step={10} unit=" MW"
                color="#06b6d4"
                onChange={(v) => updateParam('renewable_output_mw', v)}
              />
              <SliderControl
                label="Reserve Capacity"
                value={params.reserve_capacity_mw}
                min={0} max={1000} step={50} unit=" MW"
                color="#ffd700"
                onChange={(v) => updateParam('reserve_capacity_mw', v)}
              />

              {/* Peak Hour Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '0.72rem', color: '#8899aa', fontWeight: 500 }}>Peak Hour Factor</label>
                <button
                  onClick={() => updateParam('include_peak_hour_factor', !params.include_peak_hour_factor)}
                  style={{
                    width: '40px',
                    height: '22px',
                    borderRadius: '11px',
                    background: params.include_peak_hour_factor ? '#00ff88' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#fff',
                      top: '3px',
                      left: params.include_peak_hour_factor ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>
            </div>

            {/* Risk indicator */}
            {result && (
              <div
                className="card"
                style={{
                  padding: '1.25rem',
                  borderColor: `${riskColor}33`,
                  background: `${riskColor}06`,
                }}
              >
                <div style={{ fontSize: '0.6rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  Current Risk Level
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <RiskBadge level={result.risk_level} size="lg" />
                  <div>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        color: riskColor,
                        lineHeight: 1,
                      }}
                    >
                      {result.risk_score}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#8899aa' }}>/ 100</div>
                  </div>
                </div>
                {/* Risk score bar */}
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${result.risk_score}%`,
                      background: `linear-gradient(90deg, #00ff88, ${riskColor})`,
                      transition: 'width 0.5s ease',
                      borderRadius: '3px',
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: '12px',
                    padding: '8px 10px',
                    background: `${riskColor}10`,
                    border: `1px solid ${riskColor}25`,
                    borderRadius: '4px',
                    fontSize: '0.65rem',
                    color: riskColor,
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {result.recommended_action}
                </div>
              </div>
            )}
          </div>

          {/* ── Results ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Metrics grid */}
            {result && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <ResultMetric
                  label="Total Demand"
                  value={result.total_demand_mw}
                  unit="MW"
                  color={result.total_demand_mw > STEG.EFFECTIVE_CAPACITY_MW ? '#ff3333' : '#e2e8f0'}
                />
                <ResultMetric
                  label="Effective Capacity"
                  value={result.effective_capacity_mw}
                  unit="MW"
                  color="#00ff88"
                />
                <ResultMetric
                  label="Headroom"
                  value={`${result.headroom_pct > 0 ? '+' : ''}${result.headroom_pct.toFixed(1)}%`}
                  color={result.headroom_pct < 0 ? '#ff3333' : result.headroom_pct < 10 ? '#ff9500' : '#00ff88'}
                  sub={result.deficit_mw > 0 ? `Deficit: ${result.deficit_mw.toFixed(0)} MW` : 'Surplus capacity'}
                />
                <ResultMetric
                  label="Import Required"
                  value={result.import_required_mw}
                  unit="MW"
                  color={result.import_required_mw > 0 ? '#ff9500' : '#00ff88'}
                  sub={result.import_reliance_pct > 0 ? `${result.import_reliance_pct.toFixed(1)}% of demand` : 'Self-sufficient'}
                />
                <ResultMetric
                  label="Renewable Share"
                  value={`${result.renewable_share_pct.toFixed(1)}%`}
                  color="#06b6d4"
                  sub={`${result.renewable_output_mw.toFixed(0)} MW output`}
                />
                <ResultMetric
                  label="Temperature"
                  value={`${params.temperature_c}°C`}
                  color={params.temperature_c > 40 ? '#ff3333' : params.temperature_c > 30 ? '#ff9500' : '#e2e8f0'}
                  sub={`Cooling surge: ×${result.drivers?.cooling_surge_factor?.toFixed(2) || '—'}`}
                />
              </div>
            )}

            {/* 24H Demand Chart */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f0f4f8' }}>
                  24H Demand vs Capacity Profile
                </div>
                {loading && <div className="spinner" />}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <defs>
                    <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={riskColor}  stopOpacity={0.2} />
                      <stop offset="95%" stopColor={riskColor}  stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="renewGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 9, fill: '#8899aa', fontFamily: "'JetBrains Mono', monospace" }}
                    axisLine={false} tickLine={false}
                    interval={3}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#8899aa' }}
                    axisLine={false} tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    y={STEG.EFFECTIVE_CAPACITY_MW}
                    stroke="rgba(255,51,51,0.5)"
                    strokeDasharray="6 3"
                    label={{ value: 'Capacity limit', position: 'right', fontSize: 9, fill: '#ff3333' }}
                  />
                  <Area type="monotone" dataKey="capacity"   stroke="rgba(255,51,51,0.3)"  fill="none" strokeDasharray="5 3" strokeWidth={1} name="Capacity MW" dot={false} />
                  <Area type="monotone" dataKey="demand"     stroke={riskColor}             fill={`url(#demandGrad)`} strokeWidth={2} name="Demand MW"   dot={false} />
                  <Area type="monotone" dataKey="renewable"  stroke="#06b6d4"               fill="url(#renewGrad)"   strokeWidth={1.5} name="Renewable MW" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px' }}>
                {[
                  { color: riskColor, label: 'Demand' },
                  { color: '#ff3333', label: 'Capacity', dash: true },
                  { color: '#06b6d4', label: 'Renewable' },
                ].map(({ color, label, dash }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '16px', height: '2px', background: color, borderRadius: '1px', borderTop: dash ? '1px dashed' : 'none' }} />
                    <span style={{ fontSize: '0.65rem', color: '#8899aa' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Drivers breakdown */}
            {result?.drivers && (
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: '12px' }}>
                  Demand Model Drivers
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { k: 'Seasonal Base', v: `${result.drivers.seasonal_base_demand_mw?.toFixed(0)} MW` },
                    { k: 'Cooling Surge', v: `×${(1 + result.drivers.cooling_surge_factor || 1).toFixed(3)}` },
                    { k: 'Peak Factor', v: `×${result.drivers.peak_hour_factor}` },
                    { k: 'Demand Δ', v: `${result.drivers.demand_delta_pct > 0 ? '+' : ''}${result.drivers.demand_delta_pct}%` },
                    { k: 'Reserve', v: `${result.drivers.reserve_capacity_mw} MW` },
                    { k: 'Temperature', v: `${result.drivers.temperature_c}°C` },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '5px' }}>
                      <div style={{ fontSize: '0.58rem', color: '#8899aa', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEG RAG Chatbot — context-aware of current simulation */}
            <STEGChatbot
              context={{ simResult: result, simParams: params, isReplay }}
              height={520}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
