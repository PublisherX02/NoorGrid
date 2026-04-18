import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { predictBlackout } from '../../services/api'
import { RISK_COLORS, RISK_ORDER } from '../../constants/grid'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const HOUR_OPTIONS = [24, 48, 72]

function ForecastTooltip({ active, payload, label }) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const riskColor = RISK_COLORS[d.risk] || '#8899aa'
  return (
    <div
      style={{
        background: '#0d1526',
        border: `1px solid ${riskColor}33`,
        borderRadius: '6px',
        padding: '10px 12px',
        fontSize: '0.72rem',
        fontFamily: "'Inter', sans-serif",
        minWidth: '180px',
      }}
    >
      <div style={{ color: '#8899aa', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#8899aa' }}>{t('forecast.probability')}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: riskColor }}>
          {d.prob?.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#8899aa' }}>{t('forecast.confidence')}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#8899aa', fontSize: '0.65rem' }}>
          {d.ci_low?.toFixed(1)}% – {d.ci_high?.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#8899aa' }}>{t('forecast.risk')}</span>
        <span style={{ fontWeight: 700, color: riskColor }}>{d.risk}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#8899aa' }}>{t('forecast.demand')}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#e2e8f0' }}>{d.demand?.toFixed(0)} MW</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#8899aa' }}>{t('forecast.temp')}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#ffd700' }}>{d.temp?.toFixed(1)}°C</span>
      </div>
    </div>
  )
}

export default function BlackoutForecastPanel({ selectedGov, liveRisk }) {
  const { t } = useTranslation()
  const [forecastData, setForecastData] = useState([])
  const [loading, setLoading] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const [hours, setHours] = useState(24)

  useEffect(() => {
    if (!selectedGov) return
    let cancelled = false
    setLoading(true)
    predictBlackout(selectedGov.name, hours).then(({ data, mock }) => {
      if (cancelled) return
      setForecastData(data.predictions || [])
      setIsMock(mock)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedGov, hours])

  const chartData = forecastData.map(p => ({
    time:      p.time_label,
    prob:      p.blackout_probability,
    ci_low:    p.probability_low,
    ci_high:   p.probability_high,
    // Stacked band: transparent base from 0→low, colored band from low→high
    band_base: p.probability_low,
    band_size: Math.max(0, p.probability_high - p.probability_low),
    risk:      p.risk_level,
    demand:    p.estimated_demand_mw,
    available: p.available_mw,
    temp:      p.temperature,
    action:    p.prevention_action,
  }))

  // Dominant risk = highest-severity risk that appears most
  const dominantRisk = (() => {
    if (!forecastData.length) return liveRisk || 'NOMINAL'
    const counts = forecastData.reduce((acc, p) => {
      acc[p.risk_level] = (acc[p.risk_level] || 0) + 1
      return acc
    }, {})
    return Object.entries(counts)
      .sort((a, b) => (RISK_ORDER[b[0]] || 0) - (RISK_ORDER[a[0]] || 0))[0]?.[0] || liveRisk
  })()

  const peakHour = forecastData.reduce((max, p) =>
    p.blackout_probability > (max?.blackout_probability || -1) ? p : max, null)

  const accentColor = RISK_COLORS[dominantRisk] || '#00ff88'

  // Tick interval: show ~8 labels across the timeline
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8))

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
            {t('forecast.title')}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f0f4f8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedGov?.name} — {hours}h {t('forecast.probability')}
            {isMock && (
              <span style={{ fontSize: '0.65rem', color: '#ff9500', fontWeight: 600 }}>[{t('forecast.simulated')}]</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {loading && <div className="spinner" style={{ width: '14px', height: '14px' }} />}
          {HOUR_OPTIONS.map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: `1px solid ${hours === h ? accentColor + '60' : 'rgba(255,255,255,0.08)'}`,
                background: hours === h ? accentColor + '14' : 'transparent',
                color: hours === h ? accentColor : '#8899aa',
                fontSize: '0.68rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.15s',
              }}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -15 }}>
              <defs>
                <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={accentColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: '#8899aa', fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: '#8899aa' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}%`}
              />

              <Tooltip content={<ForecastTooltip />} />

              {/* 50% danger reference line */}
              <ReferenceLine y={50} stroke="rgba(255,51,51,0.25)" strokeDasharray="4 4" />

              {/* Confidence band — stacked areas */}
              <Area
                type="monotone"
                dataKey="band_base"
                stackId="ci"
                fill="transparent"
                stroke="none"
                dot={false}
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="band_size"
                stackId="ci"
                fill="url(#confGrad)"
                stroke={`${accentColor}30`}
                strokeWidth={1}
                dot={false}
                name={t('forecast.confidenceBand')}
                isAnimationActive={false}
              />

              {/* Main probability line */}
              <Line
                type="monotone"
                dataKey="prob"
                stroke={accentColor}
                strokeWidth={2.5}
                dot={false}
                name={t('forecast.blackoutProbability')}
                activeDot={{ r: 4, fill: accentColor, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.62rem', color: '#8899aa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '16px', height: '2px', background: accentColor }} />
                {t('forecast.blackoutProbability')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '16px', height: '8px', background: `${accentColor}30`, borderRadius: '2px' }} />
                {t('forecast.confidenceBand')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '16px', height: '1px', background: 'rgba(255,51,51,0.5)', borderTop: '1px dashed rgba(255,51,51,0.5)' }} />
                {t('forecast.dangerThreshold')}
              </div>
            </div>

          {/* Peak risk summary */}
          {peakHour && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: `${accentColor}08`,
                border: `1px solid ${accentColor}22`,
                borderRadius: '6px',
                display: 'flex',
                gap: '24px',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
                  {t('forecast.peakHour')}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1rem', fontWeight: 700, color: accentColor }}>
                  {peakHour.time_label}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', color: accentColor, opacity: 0.8 }}>
                  {peakHour.blackout_probability.toFixed(1)}% {t('forecast.risk')}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
                  {t('forecast.demandAvailable')}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', color: '#e2e8f0' }}>
                  {peakHour.estimated_demand_mw?.toFixed(0)} MW / {peakHour.available_mw?.toFixed(0)} MW
                </div>
                <div style={{ fontSize: '0.65rem', color: '#8899aa', marginTop: '2px' }}>
                  {t('forecast.stress')}: ×{peakHour.stress_ratio?.toFixed(2)}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ fontSize: '0.58rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
                  {t('forecast.recommendedAction')}
                </div>
                <div style={{ fontSize: '0.73rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                  {peakHour.prevention_action}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading
            ? <div className="spinner" />
            : <span style={{ color: '#4a5568', fontSize: '0.8rem' }}>{t('forecast.noData')}</span>
          }
        </div>
      )}
    </div>
  )
}
