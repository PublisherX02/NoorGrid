import { useState } from 'react'
import { GOVERNORATES, RISK_COLORS, SOURCE_COLOR } from '../../constants/grid'
import { useTranslation } from 'react-i18next'

// preview_actions match what backend/main.py _PREVENTION_ACTIONS returns for that source+risk_level
export const SCENARIOS = [
  {
    label: 'Nawara Field Failure',
    region: 'Gabès',
    risk_level: 'CRITICAL',
    source: 'Solar',
    magnitude_mw: 620,
    description: 'Gas output −27% — cascade risk to southern grid.',
    cascade_regions: [
      { name: 'Médenine', risk_level: 'HIGH' },
      { name: 'Tataouine', risk_level: 'HIGH' },
    ],
    preview_actions: [
      'Switch affected region to fossil baseline',
      'Reduce cross-region export allocation',
      'Alert STEG National Dispatch Center',
    ],
  },
  {
    label: 'Summer Peak Demand Surge',
    region: 'Tunis',
    risk_level: 'CRITICAL',
    source: 'Mixed',
    magnitude_mw: 820,
    description: 'August demand +23% above baseline — thermal reserve at limit.',
    cascade_regions: [
      { name: 'Ariana',    risk_level: 'HIGH' },
      { name: 'Ben Arous', risk_level: 'HIGH' },
      { name: 'Manouba',   risk_level: 'HIGH' },
    ],
    preview_actions: [
      'Activate Ghannouch backup generation',
      'Reduce industrial load by 20% in affected zone',
      'Alert STEG National Dispatch Center',
    ],
  },
  {
    label: 'Algerian Pipeline Disruption',
    region: 'Bizerte',
    risk_level: 'HIGH',
    source: 'Wind',
    magnitude_mw: 380,
    description: 'Import gas pressure drop — 11% of national supply at risk.',
    cascade_regions: [
      { name: 'Béja',     risk_level: 'ELEVATED' },
      { name: 'Jendouba', risk_level: 'ELEVATED' },
    ],
    preview_actions: [
      'Monitor wind forecast — potential capacity drop',
      'Pre-position reserve capacity',
      'Notify regional operators',
    ],
  },
  {
    label: 'Cap Bon Wind Farm Outage',
    region: 'Nabeul',
    risk_level: 'HIGH',
    source: 'Wind',
    magnitude_mw: 210,
    description: 'Storm damage — Cap Bon wind corridor offline.',
    cascade_regions: [
      { name: 'Zaghouan', risk_level: 'ELEVATED' },
      { name: 'Sousse',   risk_level: 'ELEVATED' },
    ],
    preview_actions: [
      'Monitor wind forecast — potential capacity drop',
      'Pre-position reserve capacity',
      'Notify regional operators',
    ],
  },
]

export default function CrisisModal({ onClose, onTrigger, loading, error }) {
  const { t } = useTranslation()
  const [selected, setSelected]         = useState(null)   // index | 'custom'
  const [armed, setArmed]               = useState(false)
  const [customRegion, setCustomRegion] = useState(GOVERNORATES[0]?.name || '')
  const [customRisk, setCustomRisk]     = useState('CRITICAL')
  const [customLabel, setCustomLabel]   = useState('')

  const isCustom = selected === 'custom'
  const canArm   = selected !== null
  const scenario = typeof selected === 'number' ? SCENARIOS[selected] : null

  const handleSelect = (key) => {
    setSelected(key)
    setArmed(false)
  }

  const handleArm = () => {
    if (!canArm) return
    setArmed(true)
  }

  const handleFire = async () => {
    let region, risk_level, scenario_label, cascade_regions
    if (isCustom) {
      region          = customRegion
      risk_level      = customRisk
      scenario_label  = customLabel.trim() || `Custom — ${region} ${risk_level}`
      cascade_regions = []
    } else {
      const s         = SCENARIOS[selected]
      region          = s.region
      risk_level      = s.risk_level
      scenario_label  = s.label
      cascade_regions = s.cascade_regions
    }
    try {
      await onTrigger(region, risk_level, scenario_label, cascade_regions)
      onClose()
    } catch (_) {
      setArmed(false)
    }
  }

  const accentColor = scenario
    ? RISK_COLORS[scenario.risk_level]
    : isCustom ? RISK_COLORS[customRisk]
    : 'rgba(255,51,51,0.4)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#0a0f1a',
          border: '1px solid rgba(255,51,51,0.3)',
          borderRadius: '12px',
          padding: '28px',
          maxWidth: '860px',
          width: '100%',
          fontFamily: "'Inter', sans-serif",
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: '#ff3333', letterSpacing: '0.1em' }}>
            {t('crisis.modalTitle') || 'CRISIS SCENARIO — SELECT EVENT'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>

        {/* Scenario grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {SCENARIOS.map((s, i) => {
            const isActive  = selected === i
            const riskColor = RISK_COLORS[s.risk_level]
            const srcColor  = SOURCE_COLOR[s.source] || '#8899aa'
            return (
              <div
                key={i}
                onClick={() => handleSelect(i)}
                style={{
                  border: `1px solid ${isActive ? riskColor + '99' : riskColor + '28'}`,
                  borderRadius: '8px',
                  padding: '14px',
                  cursor: 'pointer',
                  background: isActive ? `${riskColor}10` : `${riskColor}04`,
                  transition: 'all 0.15s',
                  boxShadow: isActive ? `0 0 16px ${riskColor}18` : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: riskColor, letterSpacing: '0.06em' }}>
                    {s.risk_level}
                  </span>
                  <span style={{ fontSize: '0.58rem', fontWeight: 600, color: srcColor, background: `${srcColor}18`, padding: '2px 6px', borderRadius: '3px' }}>
                    {s.source}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0' }}>{s.region}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', color: riskColor, fontWeight: 700 }}>
                    {s.magnitude_mw} MW
                  </span>
                </div>

                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#c0ccd8', marginBottom: '6px', lineHeight: 1.3 }}>
                  {s.label}
                </div>

                <div style={{ fontSize: '0.65rem', color: '#8899aa', lineHeight: 1.4, marginBottom: '10px' }}>
                  {s.description}
                </div>

                <div style={{ borderTop: `1px solid ${riskColor}18`, paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {s.preview_actions.map((a, j) => (
                    <div key={j} style={{ display: 'flex', gap: '5px', fontSize: '0.6rem', color: '#6b7c8d', lineHeight: 1.3 }}>
                      <span style={{ color: riskColor, flexShrink: 0 }}>▸</span>
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Custom card */}
          <div
            onClick={() => handleSelect('custom')}
            style={{
              border: `1px solid ${isCustom ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
              background: isCustom ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8899aa', marginBottom: '10px', letterSpacing: '0.06em' }}>
              {t('crisis.custom') || 'CUSTOM'}
            </div>
            {isCustom ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                <input
                  placeholder="Libellé du scénario…"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  style={{
                    background: '#0d1526', border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: '4px', color: '#e2e8f0', padding: '5px 8px',
                    fontSize: '0.72rem', width: '100%', boxSizing: 'border-box',
                  }}
                />
                <select
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value)}
                  style={{
                    background: '#0d1526', border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: '4px', color: '#e2e8f0', padding: '5px 8px',
                    fontSize: '0.72rem', width: '100%',
                  }}
                >
                  {GOVERNORATES.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                </select>
                <select
                  value={customRisk}
                  onChange={(e) => setCustomRisk(e.target.value)}
                  style={{
                    background: '#0d1526', border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: '4px', color: '#e2e8f0', padding: '5px 8px',
                    fontSize: '0.72rem', width: '100%',
                  }}
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
            ) : (
              <div style={{ fontSize: '0.65rem', color: '#4a5568', lineHeight: 1.5 }}>
                Choisir une région + niveau de risque.<br />Sans cascade.
              </div>
            )}
          </div>
        </div>

        {/* Cascade preview */}
        {scenario && scenario.cascade_regions.length > 0 && (
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '6px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Cascade
            </span>

            {scenario.cascade_regions.map((c) => (
              <span
                key={c.name}
                style={{
                  fontSize: '0.65rem', fontWeight: 600,
                  color: RISK_COLORS[c.risk_level] || '#8899aa',
                  background: `${RISK_COLORS[c.risk_level] || '#8899aa'}14`,
                  border: `1px solid ${RISK_COLORS[c.risk_level] || '#8899aa'}33`,
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}
              >
                {c.name} — {c.risk_level}
              </span>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ fontSize: '0.72rem', color: '#ff3333', marginBottom: '12px', padding: '8px 12px', background: 'rgba(255,51,51,0.08)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {/* ARM → FIRE */}
        {!armed ? (
          <button
            onClick={handleArm}
            disabled={!canArm || loading}
            style={{
              width: '100%', padding: '12px',
              background: canArm ? `${accentColor}14` : 'rgba(255,51,51,0.04)',
              border: `1px solid ${canArm ? accentColor + '60' : 'rgba(255,51,51,0.15)'}`,
              borderRadius: '6px',
              color: canArm ? accentColor : '#4a3333',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em',
              cursor: canArm ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            ARMER LE SCÉNARIO
          </button>
        ) : (
          <button
            onClick={handleFire}
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: 'rgba(255,51,51,0.2)',
              border: '1px solid rgba(255,51,51,0.8)',
              borderRadius: '6px',
              color: '#ff3333',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em',
              cursor: loading ? 'wait' : 'pointer',
              animation: loading ? 'none' : 'livePulse 0.8s ease-in-out infinite',
            }}
          >
            {loading ? (t('crisis.triggering') || 'DÉCLENCHEMENT…') : '⚡ CONFIRMER — DÉCLENCHER LA CRISE'}
          </button>
        )}
      </div>
    </div>
  )
}
