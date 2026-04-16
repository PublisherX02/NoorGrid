import { useState } from 'react'
import { GOVERNORATES } from '../../constants/grid'

const SCENARIOS = [
  {
    label: 'Nawara Field Failure',
    region: 'Gabès',
    risk_level: 'CRITICAL',
    description: 'Gas output −27% — cascade risk to southern grid.',
  },
  {
    label: 'Summer Peak Demand Surge',
    region: 'Tunis',
    risk_level: 'CRITICAL',
    description: 'August demand +23% above baseline — thermal reserve at limit.',
  },
  {
    label: 'Algerian Pipeline Disruption',
    region: 'Bizerte',
    risk_level: 'HIGH',
    description: 'Import gas pressure drop — 11% of national supply at risk.',
  },
]

export default function CrisisModal({ onClose, onTrigger, loading, error }) {
  const [selected, setSelected] = useState(null)
  const [customRegion, setCustomRegion] = useState(GOVERNORATES[0]?.name || '')
  const [customRisk, setCustomRisk] = useState('CRITICAL')

  const isCustom = selected === 'custom'
  const canTrigger = selected !== null

  const handleTrigger = async () => {
    let region, risk_level, scenario_label
    if (isCustom) {
      region = customRegion
      risk_level = customRisk
      scenario_label = `Custom — ${region} ${risk_level}`
    } else {
      const s = SCENARIOS[selected]
      region = s.region
      risk_level = s.risk_level
      scenario_label = s.label
    }
    try {
      await onTrigger(region, risk_level, scenario_label)
      onClose()
    } catch (_) {
      // error displayed via `error` prop
    }
  }

  const cardBase = {
    border: '1px solid rgba(255,51,51,0.2)',
    borderRadius: '8px',
    padding: '14px 16px',
    cursor: 'pointer',
    background: 'rgba(255,51,51,0.04)',
    transition: 'all 0.15s',
    flex: 1,
  }

  const cardSelected = {
    ...cardBase,
    border: '1px solid rgba(255,51,51,0.7)',
    background: 'rgba(255,51,51,0.1)',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
          maxWidth: '720px',
          width: '100%',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#ff3333',
              letterSpacing: '0.1em',
            }}
          >
            CRISIS SCENARIO — SELECT EVENT
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            ×
          </button>
        </div>

        {/* Scenario cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {SCENARIOS.map((s, i) => (
            <div
              key={i}
              style={selected === i ? cardSelected : cardBase}
              onClick={() => setSelected(i)}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: s.risk_level === 'CRITICAL' ? '#ff3333' : '#ff9500', marginBottom: '4px' }}>
                {s.risk_level} — {s.region}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '0.68rem', color: '#8899aa', lineHeight: 1.4 }}>{s.description}</div>
            </div>
          ))}

          {/* Custom card */}
          <div
            style={selected === 'custom' ? cardSelected : cardBase}
            onClick={() => setSelected('custom')}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8899aa', marginBottom: '8px' }}>CUSTOM</div>
            {isCustom ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <select
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#0d1526',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: '4px',
                    color: '#e2e8f0',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    width: '100%',
                  }}
                >
                  {GOVERNORATES.map((g) => (
                    <option key={g.name} value={g.name}>{g.name}</option>
                  ))}
                </select>
                <select
                  value={customRisk}
                  onChange={(e) => setCustomRisk(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#0d1526',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: '4px',
                    color: '#e2e8f0',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    width: '100%',
                  }}
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
            ) : (
              <div style={{ fontSize: '0.68rem', color: '#8899aa' }}>Pick any region + risk level</div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: '0.72rem', color: '#ff3333', marginBottom: '12px', padding: '8px 12px', background: 'rgba(255,51,51,0.08)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {/* Trigger button */}
        <button
          onClick={handleTrigger}
          disabled={!canTrigger || loading}
          style={{
            width: '100%',
            padding: '12px',
            background: canTrigger && !loading ? 'rgba(255,51,51,0.15)' : 'rgba(255,51,51,0.05)',
            border: `1px solid ${canTrigger && !loading ? 'rgba(255,51,51,0.6)' : 'rgba(255,51,51,0.2)'}`,
            borderRadius: '6px',
            color: canTrigger && !loading ? '#ff3333' : '#4a3333',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: canTrigger && !loading ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {loading ? 'TRIGGERING...' : 'TRIGGER CRISIS'}
        </button>
      </div>
    </div>
  )
}
