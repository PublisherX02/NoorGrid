import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RISK_COLORS } from '../../constants/grid'

const RISK_ICON = { CRITICAL: '⚠', HIGH: '▲', ELEVATED: '●', NOMINAL: '○' }


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

function useElapsed(isoStr) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (!isoStr) return
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
      if (diff < 60)        setElapsed(`${diff}s ago`)
      else if (diff < 3600) setElapsed(`${Math.floor(diff / 60)}m ago`)
      else                  setElapsed(`${Math.floor(diff / 3600)}h ago`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [isoStr])
  return elapsed
}

function ActiveAlertCard({ alert, cascadeAlerts = [], onAcknowledge }) {
  const { t } = useTranslation()
  const color   = RISK_COLORS[alert.risk_level] || '#ff3333'
  const elapsed = useElapsed(alert.triggered_at)

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#8899aa' }}>
            {formatTime(alert.triggered_at)}
          </span>
          {elapsed && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', color: `${color}99` }}>
              {elapsed}
            </span>
          )}
        </div>
      </div>

      {/* Scenario label */}
      <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '8px' }}>
        {alert.scenario_label}
      </div>

      {/* Cascade chips */}
      {cascadeAlerts.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.58rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center' }}>
            Cascade:
          </span>
          {cascadeAlerts.map((c) => {
            const cc = RISK_COLORS[c.risk_level] || '#8899aa'
            return (
              <span
                key={c.name}
                style={{
                  fontSize: '0.6rem', fontWeight: 600,
                  color: cc,
                  background: `${cc}14`,
                  border: `1px solid ${cc}33`,
                  borderRadius: '3px',
                  padding: '1px 6px',
                }}
              >
                {c.name}
              </span>
            )
          })}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: `${color}22`, marginBottom: '8px' }} />

      {/* Prevention actions — plain list (checkboxes added in Task 5) */}
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
          width: '100%', padding: '6px',
          background: 'transparent',
          border: `1px solid ${color}44`,
          borderRadius: '4px',
          color,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        {t('crisis.acknowledge') || 'ACKNOWLEDGE'}
      </button>
    </div>
  )
}

function HistoricalAlertRow({ alert }) {
  const color = RISK_COLORS[alert.risk_level] || '#8899aa'
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

export default function AlertFeed({ activeAlert, cascadeAlerts = [], historicalAlerts = [], onAcknowledge }) {
  const { t } = useTranslation()
  if (!activeAlert && historicalAlerts.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '280px',
        background: 'rgba(10,15,26,0.97)',
        borderLeft: '1px solid rgba(255,51,51,0.2)',
        padding: '14px', overflowY: 'auto', zIndex: 100,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem', fontWeight: 700,
          color: '#ff3333', letterSpacing: '0.1em', marginBottom: '12px',
        }}
      >
        {t('crisis.alertFeedTitle') || 'ALERT FEED'}
      </div>

      {activeAlert && (
        <ActiveAlertCard
          alert={activeAlert}
          cascadeAlerts={cascadeAlerts}
          onAcknowledge={onAcknowledge}
        />
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
