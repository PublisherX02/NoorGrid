import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCrisisAnalytics } from '../hooks/useCrisisAnalytics'
import { RISK_COLORS } from '../constants/grid'

const WINDOWS = [
  { label: '7D',  days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: 365 },
]

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return String(iso).slice(0, 16)
  }
}

function MetricCard({ label, value, color = '#e2e8f0', sub }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function IncidentRow({ incident }) {
  const color = RISK_COLORS[incident.risk_level] || '#94a3b8'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${color}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color, fontWeight: 700 }}>{incident.risk_level}</span>
          <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{incident.scenario_label}</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>— {incident.region}</span>
        </div>
        {(incident.cascade_regions?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {(incident.cascade_regions || []).map((r) => (
              <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8' }}>↳ {r}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>{fmtDate(incident.triggered_at)}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 10,
            background: incident.report_sent ? 'rgba(0,196,106,0.12)' : 'rgba(100,116,139,0.12)',
            color: incident.report_sent ? '#00c46a' : '#475569',
            border: `1px solid ${incident.report_sent ? 'rgba(0,196,106,0.3)' : 'rgba(100,116,139,0.2)'}`,
          }}
        >
          {incident.report_sent ? `✓ RAPPORT ENVOYÉ (${incident.recipients_count})` : 'SANS RAPPORT'}
        </span>
      </div>
    </div>
  )
}

function RiskDonut({ critical, high, elevated }) {
  const total = critical + high + elevated
  if (total === 0) return <div style={{ color: '#475569', fontSize: 12, padding: 12 }}>Aucun incident dans cette période</div>
  const R = 54
  const cx = 70
  const cy = 70
  const stroke = 16
  const circ = 2 * Math.PI * R
  const segments = [
    { label: 'CRITICAL', count: critical, color: RISK_COLORS.CRITICAL },
    { label: 'HIGH', count: high, color: RISK_COLORS.HIGH },
    { label: 'ELEVATED', count: elevated, color: RISK_COLORS.ELEVATED },
  ].filter((s) => s.count > 0)
  let offset = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {segments.map(({ label, count, color }) => {
          const pct = count / total
          const dash = pct * circ
          const seg = (
            <circle
              key={label}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ}
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
            />
          )
          offset += pct
          return seg
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#e2e8f0" fontSize={20} fontWeight={700} fontFamily="'JetBrains Mono', monospace">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#64748b" fontSize={9}>TOTAL</text>

      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map(({ label, count, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color, fontWeight: 700, marginLeft: 4 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RegionBars({ regionFrequency }) {
  const top8 = (regionFrequency || []).slice(0, 8)
  if (top8.length === 0) return <div style={{ color: '#475569', fontSize: 12, padding: 12 }}>Pas de données</div>
  const max = top8[0]?.total || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {top8.map((r) => (
        <div key={r.region}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.region}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#e2e8f0' }}>{r.total}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(r.total / max) * 100}%`, background: '#00c46a', borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DailyTrend({ dailyCounts }) {
  if (!dailyCounts || dailyCounts.length === 0) return <div style={{ color: '#475569', fontSize: 12, padding: 12 }}>No data</div>
  const max = Math.max(...dailyCounts.map((d) => d.count), 1)
  const barW = Math.max(4, Math.min(24, Math.floor(200 / dailyCounts.length)))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
      {dailyCounts.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count}`}
          style={{
            width: barW,
            height: `${Math.max(10, (d.count / max) * 100)}%`,
            background: '#00c46a',
            borderRadius: '2px 2px 0 0',
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

export default function CrisisIntelligence() {
  const navigate = useNavigate()
  const [windowDays, setWindowDays] = useState(7)
  const { data, loading, error, isMock, refetch } = useCrisisAnalytics(windowDays)
  const elevated = data ? data.total_incidents - data.critical_count - data.high_count : 0

  return (
    <div style={{ minHeight: '100vh', background: '#060c18', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(10,15,26,0.95)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '0.85rem', color: '#00ff88', letterSpacing: '0.05em' }}>
            ⚡ NoorGrid
          </button>
          {isMock && (
            <span style={{ fontSize: '0.58rem', color: '#ff9500', background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.25)', borderRadius: 3, padding: '1px 6px', fontWeight: 600, letterSpacing: '0.06em' }}>
              DONNÉES SIMULÉES
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { label: 'Salle Ops', path: '/dashboard' },
            { label: 'Analytique', path: '/analytics' },
            { label: 'Simulation', path: '/simulation' },
            { label: 'À propos', path: '/about' },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{ background: 'none', border: '1px solid rgba(0,255,136,0.12)', borderRadius: 4, padding: '2px 10px', fontSize: '0.65rem', color: '#8899aa', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              onMouseEnter={(e) => { e.target.style.color = '#00ff88'; e.target.style.borderColor = 'rgba(0,255,136,0.3)' }}
              onMouseLeave={(e) => { e.target.style.color = '#8899aa'; e.target.style.borderColor = 'rgba(0,255,136,0.12)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: '#00ff88', letterSpacing: '0.08em' }}>INTELLIGENCE DE CRISE</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Journal des incidents et analyse d'exposition régionale</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map(({ label, days }) => (
            <button
              key={label}
              onClick={() => setWindowDays(days)}
              style={{
                border: `1px solid ${windowDays === days ? '#00ff88' : 'rgba(255,255,255,0.1)'}`,
                background: windowDays === days ? 'rgba(0,255,136,0.1)' : 'none',
                color: windowDays === days ? '#00ff88' : '#64748b',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ margin: '12px 20px', padding: '10px 14px', background: 'rgba(255,51,51,0.08)', border: '1px solid rgba(255,51,51,0.25)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#ff3333' }}>Échec du chargement des données analytiques.</span>
          <button onClick={refetch} style={{ border: '1px solid rgba(255,51,51,0.4)', background: 'none', color: '#ff3333', borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer' }}>Réessayer</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, padding: '14px 20px', flexWrap: 'wrap' }}>
        <MetricCard label="Total incidents" value={loading ? '…' : (data?.total_incidents ?? 0)} />
        <MetricCard label="Critique" value={loading ? '…' : (data?.critical_count ?? 0)} color={RISK_COLORS.CRITICAL} />
        <MetricCard label="Plus exposée" value={loading ? '…' : (data?.most_affected_region ?? '—')} color="#f59e0b" sub="par alertes primaires" />
        <MetricCard label="Impacts cascade" value={loading ? '…' : (data?.cascade_hits_total ?? 0)} color="#a78bfa" sub="régions secondaires touchées" />
        <MetricCard label="Rapports envoyés" value={loading ? '…' : (data?.report_dispatch_count ?? 0)} color="#00c46a" />
      </div>

      <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Journal des incidents
          </div>
          {loading && <div style={{ padding: 20, color: '#475569', fontSize: 12 }}>Chargement…</div>}
          {!loading && data?.incidents?.length === 0 && <div style={{ padding: 20, color: '#475569', fontSize: 12, textAlign: 'center' }}>Aucun incident dans cette période.</div>}
          {!loading && data?.incidents?.map((inc) => <IncidentRow key={inc.id} incident={inc} />)}
        </div>

        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Distribution des risques</div>
            {!loading && data && <RiskDonut critical={data.critical_count} high={data.high_count} elevated={elevated} />}
            {loading && <div style={{ fontSize: 12, color: '#475569' }}>Chargement…</div>}
          </div>

          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Exposition régionale</div>
            {!loading && data && <RegionBars regionFrequency={data.region_frequency} />}
            {loading && <div style={{ fontSize: 12, color: '#475569' }}>Chargement…</div>}
          </div>

          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Tendance quotidienne</div>
            {!loading && data && <DailyTrend dailyCounts={data.daily_counts} />}
            {loading && <div style={{ fontSize: 12, color: '#475569' }}>Chargement…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
