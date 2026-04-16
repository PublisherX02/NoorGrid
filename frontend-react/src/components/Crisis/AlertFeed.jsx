import { useTranslation } from 'react-i18next'
const RISK_ICON = { CRITICAL: '⚠', HIGH: '▲', ELEVATED: '●', NOMINAL: '○' }
const RISK_COLOR = { CRITICAL: '#ff3333', HIGH: '#ff9500', ELEVATED: '#ffd700', NOMINAL: '#00ff88' }


function formatTime(isoStr) {
  if (!isoStr) return '—'
  try {
    return new Date(isoStr).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  } catch (_) {
    return isoStr.slice(11, 19) || '—'
  }
}

function ActiveAlertCard({ alert, onAcknowledge }) {
  const { t } = useTranslation()
  const color = RISK_COLOR[alert.risk_level] || '#ff3333'
  return (
    <div
      style={{
        background: '#0a0f1a',
        border: `1px solid ${color}55`,
        borderRadius: '8px',
        padding: '14px 16px',
        marginBottom: '10px',
        boxShadow: `0 0 20px ${color}20`,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color, fontSize: '1rem' }}>{RISK_ICON[alert.risk_level] || '⚠'}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', fontWeight: 700, color }}>
            {t(`risk.${alert.risk_level}`)} — {alert.region}
          </span>
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#8899aa' }}>
          {formatTime(alert.triggered_at)}
        </span>
      </div>

      {/* Scenario label */}
      <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '8px' }}>
        {alert.scenario_label}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: `${color}22`, marginBottom: '8px' }} />

      {/* Prevention actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
        {(alert.prevention_actions || []).map((action, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', fontSize: '0.68rem', color: '#c0ccd8', lineHeight: 1.4 }}>
            <span style={{ color, flexShrink: 0 }}>▸</span>
            <span>{action}</span>
          </div>
        ))}
      </div>

      {/* Acknowledge */}
      <button
        onClick={onAcknowledge}
        style={{
          width: '100%',
          padding: '6px',
          background: 'transparent',
          border: `1px solid ${color}44`,
          borderRadius: '4px',
          color,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        {t('crisis.acknowledge') || 'ACKNOWLEDGE'}
      </button>
    </div>
  )
}

function HistoricalAlertRow({ alert }) {
  const color = RISK_COLOR[alert.risk_level] || '#8899aa'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '4px',
        marginBottom: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color, fontSize: '0.65rem' }}>{RISK_ICON[alert.risk_level]}</span>
        <span style={{ fontSize: '0.68rem', color: '#8899aa' }}>{alert.region}</span>
        <span style={{ fontSize: '0.62rem', color: '#4a5568' }}>—</span>
        <span style={{ fontSize: '0.62rem', color: '#4a5568' }}>{alert.scenario_label}</span>
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#4a5568' }}>
        {formatTime(alert.triggered_at)}
      </span>
    </div>
  )
}

export default function AlertFeed({ activeAlert, historicalAlerts = [], onAcknowledge }) {
  const { t } = useTranslation()
  if (!activeAlert && historicalAlerts.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '280px',
        background: 'rgba(10,15,26,0.97)',
        borderLeft: '1px solid rgba(255,51,51,0.2)',
        padding: '14px',
        overflowY: 'auto',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          fontWeight: 700,
          color: '#ff3333',
          letterSpacing: '0.1em',
          marginBottom: '12px',
        }}
      >
        {t('crisis.alertFeedTitle') || 'ALERT FEED'}
      </div>

      {activeAlert && (
        <ActiveAlertCard alert={activeAlert} onAcknowledge={onAcknowledge} />
      )}

      {historicalAlerts.length > 0 && (
        <>
          <div style={{ fontSize: '0.58rem', color: '#4a5568', letterSpacing: '0.08em', marginBottom: '6px' }}>
            PREVIOUS
          </div>
          {historicalAlerts.slice(0, 5).map((a) => (
            <HistoricalAlertRow key={a.id} alert={a} />
          ))}
        </>
      )}
    </div>
  )
}
