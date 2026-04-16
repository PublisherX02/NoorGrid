# Crisis Simulator Upgrade (A+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Crisis Response Simulator with redesigned scenario cards (source, magnitude, preview actions), ARM→FIRE two-step trigger, a 4th scenario, cascade region propagation on the map, elapsed timer, interactive prevention checklists, and a forecast navigation link — no backend changes.

**Architecture:** All changes are purely frontend. SCENARIOS constant gains `cascade_regions`, `magnitude_mw`, `source`, and `preview_actions` fields. Dashboard gains `cascadeAlerts` state that feeds both TunisiaMap (multi-marker override) and AlertFeed (cascade section). AlertFeed manages its own elapsed-timer interval and per-alert checkbox state.

**Tech Stack:** React 18, react-router-dom `useNavigate`/`useLocation`, existing inline-style design system, no new packages.

---

## File Map

| File | Change |
|------|--------|
| `frontend-react/src/components/Crisis/CrisisModal.jsx` | Full rewrite — enriched SCENARIOS, new card layout, ARM→FIRE, cascade preview, custom label |
| `frontend-react/src/pages/Dashboard.jsx` | Add `cascadeAlerts` state; thread it to TunisiaMap + AlertFeed; update `onTrigger` signature |
| `frontend-react/src/components/Map/TunisiaMap.jsx` | Accept `cascadeAlerts` prop, apply multi-marker override |
| `frontend-react/src/components/Crisis/AlertFeed.jsx` | Elapsed timer, cascade chips, checkbox prevention actions, forecast link |
| `frontend-react/src/pages/Analytics.jsx` | Read `location.state.region` on mount to pre-select governorate |

---

### Task 1: Rewrite CrisisModal — enriched SCENARIOS + new card design

**Files:**
- Modify: `frontend-react/src/components/Crisis/CrisisModal.jsx`

No test for this task — it is pure UI. Verify visually: open the modal, see 4 cards each showing risk badge, source badge, MW magnitude, description, and 3 preview action bullets.

- [ ] **Step 1: Replace CrisisModal.jsx with the new implementation**

```jsx
import { useState } from 'react'
import { GOVERNORATES } from '../../constants/grid'
import { useTranslation } from 'react-i18next'

const RISK_COLOR = { CRITICAL: '#ff3333', HIGH: '#ff9500', ELEVATED: '#ffd700', NOMINAL: '#00ff88' }
const SOURCE_COLOR = { Wind: '#06b6d4', Solar: '#ffd700', Hydro: '#3b82f6', Mixed: '#a78bfa' }

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
  const [selected, setSelected]       = useState(null)   // index | 'custom'
  const [armed, setArmed]             = useState(false)
  const [customRegion, setCustomRegion] = useState(GOVERNORATES[0]?.name || '')
  const [customRisk, setCustomRisk]   = useState('CRITICAL')
  const [customLabel, setCustomLabel] = useState('')

  const isCustom   = selected === 'custom'
  const canArm     = selected !== null
  const scenario   = typeof selected === 'number' ? SCENARIOS[selected] : null

  // Selecting a card resets armed state
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
      region         = customRegion
      risk_level     = customRisk
      scenario_label = customLabel.trim() || `Custom — ${region} ${risk_level}`
      cascade_regions = []
    } else {
      const s        = SCENARIOS[selected]
      region         = s.region
      risk_level     = s.risk_level
      scenario_label = s.label
      cascade_regions = s.cascade_regions
    }
    try {
      await onTrigger(region, risk_level, scenario_label, cascade_regions)
      onClose()
    } catch (_) {
      setArmed(false) // let user retry
    }
  }

  const accentColor = scenario
    ? RISK_COLOR[scenario.risk_level]
    : isCustom ? RISK_COLOR[customRisk]
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
            const riskColor = RISK_COLOR[s.risk_level]
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
                {/* Risk + Source badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: riskColor, letterSpacing: '0.06em' }}>
                    {s.risk_level}
                  </span>
                  <span style={{ fontSize: '0.58rem', fontWeight: 600, color: srcColor, background: `${srcColor}18`, padding: '2px 6px', borderRadius: '3px' }}>
                    {s.source}
                  </span>
                </div>

                {/* Region + MW */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0' }}>{s.region}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', color: riskColor, fontWeight: 700 }}>
                    {s.magnitude_mw} MW
                  </span>
                </div>

                {/* Scenario label */}
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#c0ccd8', marginBottom: '6px', lineHeight: 1.3 }}>
                  {s.label}
                </div>

                {/* Description */}
                <div style={{ fontSize: '0.65rem', color: '#8899aa', lineHeight: 1.4, marginBottom: '10px' }}>
                  {s.description}
                </div>

                {/* Preview actions */}
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
                  placeholder="Scenario label…"
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
                Pick any region + risk level.<br />No cascade.
              </div>
            )}
          </div>
        </div>

        {/* Cascade preview — shown when a preset scenario is selected */}
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
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: RISK_COLOR[c.risk_level] || '#8899aa',
                  background: `${RISK_COLOR[c.risk_level] || '#8899aa'}14`,
                  border: `1px solid ${RISK_COLOR[c.risk_level] || '#8899aa'}33`,
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

        {/* ARM → FIRE button */}
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
            ARM SCENARIO
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
            {loading ? (t('crisis.triggering') || 'TRIGGERING…') : '⚡ CONFIRM — TRIGGER CRISIS'}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app still builds**

```bash
cd frontend-react && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in Xs` — no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/Crisis/CrisisModal.jsx
git commit -m "feat: redesign CrisisModal — enriched scenario cards, ARM→FIRE, cascade preview, 4th scenario"
```

---

### Task 2: Dashboard — cascadeAlerts state + updated onTrigger

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`

`cascadeAlerts` is `[{name, risk_level}]` from the selected scenario's `cascade_regions`. It lives in Dashboard alongside `activeAlert`. Both are cleared on acknowledge. Both thread down to TunisiaMap and AlertFeed.

- [ ] **Step 1: Add cascadeAlerts state and update handleAlertTriggered**

Find this block in Dashboard.jsx (around line 351):

```js
const [activeAlert, setActiveAlert] = useState(null)
const [showCrisisModal, setShowCrisisModal] = useState(false)

const handleAlertTriggered = (alert) => {
  setActiveAlert(alert)
}
```

Replace with:

```js
const [activeAlert, setActiveAlert]     = useState(null)
const [cascadeAlerts, setCascadeAlerts] = useState([])
const [showCrisisModal, setShowCrisisModal] = useState(false)

const handleAlertTriggered = (alert, cascadeRegions = []) => {
  setActiveAlert(alert)
  setCascadeAlerts(cascadeRegions)
}
```

- [ ] **Step 2: Update handleAcknowledge to also clear cascadeAlerts**

Find:

```js
const handleAcknowledge = () => {
  setActiveAlert(null)
}
```

Replace with:

```js
const handleAcknowledge = () => {
  setActiveAlert(null)
  setCascadeAlerts([])
}
```

*(If handleAcknowledge doesn't exist yet with that body, locate the acknowledge handler and add `setCascadeAlerts([])`)*

- [ ] **Step 3: Update the onTrigger callback in CrisisModal to pass cascadeRegions**

Find:

```js
onTrigger={async (region, risk_level, scenario_label) => {
  const alert = await triggerSimulation(region, risk_level, scenario_label)
  handleAlertTriggered(alert)
}}
```

Replace with:

```js
onTrigger={async (region, risk_level, scenario_label, cascadeRegions) => {
  const alert = await triggerSimulation(region, risk_level, scenario_label)
  handleAlertTriggered(alert, cascadeRegions)
}}
```

- [ ] **Step 4: Pass cascadeAlerts to TunisiaMap**

Find the TunisiaMap usage (around line 737). It currently has `activeAlert={activeAlert}`. Add `cascadeAlerts`:

```jsx
<TunisiaMap
  ...
  activeAlert={activeAlert}
  cascadeAlerts={cascadeAlerts}
  ...
/>
```

- [ ] **Step 5: Pass cascadeAlerts to AlertFeed**

Find the AlertFeed usage (around line 971):

```jsx
<AlertFeed
  activeAlert={activeAlert}
  historicalAlerts={activeAlert ? alerts.filter((a) => a.id !== activeAlert?.id) : []}
  onAcknowledge={handleAcknowledge}
/>
```

Replace with:

```jsx
<AlertFeed
  activeAlert={activeAlert}
  cascadeAlerts={cascadeAlerts}
  historicalAlerts={activeAlert ? alerts.filter((a) => a.id !== activeAlert?.id) : []}
  onAcknowledge={handleAcknowledge}
/>
```

- [ ] **Step 6: Build check**

```bash
cd frontend-react && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in Xs`.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/pages/Dashboard.jsx
git commit -m "feat: add cascadeAlerts state to Dashboard — threads to TunisiaMap and AlertFeed"
```

---

### Task 3: TunisiaMap — cascadeAlerts multi-marker override

**Files:**
- Modify: `frontend-react/src/components/Map/TunisiaMap.jsx`

The current logic overrides a single region's risk when `activeAlert.region === gov.name`. We extend it to also check `cascadeAlerts`.

- [ ] **Step 1: Read TunisiaMap.jsx to find the marker risk override logic**

Look for the line that reads like:

```js
(activeAlert?.region === gov.name) ? activeAlert.risk_level : (live_risk || ...)
```

- [ ] **Step 2: Update function signature to accept cascadeAlerts**

Find:

```js
export default function TunisiaMap({ ..., activeAlert = null, ... }) {
```

Add `cascadeAlerts = []`:

```js
export default function TunisiaMap({ ..., activeAlert = null, cascadeAlerts = [], ... }) {
```

- [ ] **Step 3: Build a cascadeMap lookup for O(1) access**

Immediately inside the component body, before the return, add:

```js
const cascadeMap = Object.fromEntries(cascadeAlerts.map(c => [c.name, c.risk_level]))
```

- [ ] **Step 4: Update the marker risk override to include cascade**

Find the existing override line. It looks like:

```js
const overrideRisk = (activeAlert?.region === gov.name) ? activeAlert.risk_level : null
const markerRisk = overrideRisk || live_risk || liveRiskMap?.[gov.name] || gov.mock_risk
```

*(exact variable names may differ — find the ternary that checks activeAlert.region)*

Replace with:

```js
const overrideRisk =
  activeAlert?.region === gov.name ? activeAlert.risk_level :
  cascadeMap[gov.name]            ? cascadeMap[gov.name] :
  null
const markerRisk = overrideRisk || live_risk || liveRiskMap?.[gov.name] || gov.mock_risk
```

- [ ] **Step 5: Add cascadeAlerts to the useEffect dependency array that redraws markers**

Find the `useEffect` that has `activeAlert` in its dependency array. Add `cascadeAlerts`:

```js
}, [..., activeAlert, cascadeAlerts])
```

- [ ] **Step 6: Build check**

```bash
cd frontend-react && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in Xs`.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/components/Map/TunisiaMap.jsx
git commit -m "feat: TunisiaMap applies cascadeAlerts to multiple region markers simultaneously"
```

---

### Task 4: AlertFeed — elapsed timer + cascade region chips

**Files:**
- Modify: `frontend-react/src/components/Crisis/AlertFeed.jsx`

`ActiveAlertCard` gains an elapsed timer (updates every second) and a cascade chips row. The panel itself receives the `cascadeAlerts` prop and passes it to `ActiveAlertCard`.

- [ ] **Step 1: Add useEffect and useState imports if not already present**

At the top of AlertFeed.jsx, ensure `useEffect` and `useState` are imported:

```js
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
```

- [ ] **Step 2: Add elapsed time helper**

After the existing `formatTime` function, add:

```js
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
```

- [ ] **Step 3: Update ActiveAlertCard to accept cascadeAlerts and show timer + cascade chips**

Replace the entire `ActiveAlertCard` function with:

```jsx
function ActiveAlertCard({ alert, cascadeAlerts = [], onAcknowledge }) {
  const { t } = useTranslation()
  const color   = RISK_COLOR[alert.risk_level] || '#ff3333'
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
            const cc = RISK_COLOR[c.risk_level] || '#8899aa'
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
```

- [ ] **Step 4: Update AlertFeed export to accept and thread cascadeAlerts**

Find the `AlertFeed` export and update its signature and usage of `ActiveAlertCard`:

```jsx
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
```

- [ ] **Step 5: Build check**

```bash
cd frontend-react && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in Xs`.

- [ ] **Step 6: Commit**

```bash
git add frontend-react/src/components/Crisis/AlertFeed.jsx
git commit -m "feat: AlertFeed elapsed timer and cascade region chips"
```

---

### Task 5: AlertFeed — prevention action checkboxes + forecast navigation link

**Files:**
- Modify: `frontend-react/src/components/Crisis/AlertFeed.jsx`

Prevention actions become interactive checkboxes. Checked items get a strikethrough. A "VIEW FORECAST →" link uses react-router `useNavigate` to navigate to `/analytics` with the region pre-selected.

- [ ] **Step 1: Add useNavigate import**

At the top of AlertFeed.jsx, add the react-router import:

```js
import { useNavigate } from 'react-router-dom'
```

- [ ] **Step 2: Replace the prevention actions section in ActiveAlertCard**

Inside `ActiveAlertCard`, add `const [checked, setChecked] = useState({})` at the top of the function body, and replace the prevention actions JSX block:

Add state at top of ActiveAlertCard (after the `elapsed` line):

```js
const [checked, setChecked] = useState({})
const navigate = useNavigate()
```

Replace the prevention actions block:

```jsx
{/* Prevention actions — interactive checklist */}
<div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
  {(alert.prevention_actions || []).map((action, i) => {
    const done = !!checked[i]
    return (
      <div
        key={i}
        onClick={() => setChecked(prev => ({ ...prev, [i]: !prev[i] }))}
        style={{
          display: 'flex', gap: '7px', fontSize: '0.68rem',
          color: done ? '#4a5568' : '#c0ccd8',
          lineHeight: 1.4, cursor: 'pointer',
          textDecoration: done ? 'line-through' : 'none',
          transition: 'all 0.15s',
        }}
      >
        <span
          style={{
            width: '12px', height: '12px', flexShrink: 0, marginTop: '1px',
            border: `1px solid ${done ? '#4a5568' : color + '88'}`,
            borderRadius: '2px',
            background: done ? `${color}30` : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', color,
          }}
        >
          {done ? '✓' : ''}
        </span>
        <span>{action}</span>
      </div>
    )
  })}
</div>
```

- [ ] **Step 3: Add "VIEW FORECAST →" button above ACKNOWLEDGE**

Between the checklist and the ACKNOWLEDGE button, insert:

```jsx
{/* Forecast link */}
<button
  onClick={() => navigate('/analytics', { state: { region: alert.region } })}
  style={{
    width: '100%', padding: '5px', marginBottom: '6px',
    background: 'transparent',
    border: '1px solid rgba(0,255,136,0.25)',
    borderRadius: '4px', color: '#00ff88',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
    cursor: 'pointer',
  }}
>
  VIEW FORECAST →
</button>
```

- [ ] **Step 4: Update Analytics.jsx to read location.state.region on mount**

In `frontend-react/src/pages/Analytics.jsx`, add the `useLocation` import:

```js
import { useLocation } from 'react-router-dom'
```

Then inside the `Analytics` component, before the `useState` calls, add:

```js
const location = useLocation()
```

Change the `selectedGov` initial value to respect the navigation state:

```js
const [selectedGov, setSelectedGov] = useState(() => {
  const regionName = location.state?.region
  return regionName
    ? ALL_GOVS.find(g => g.name === regionName) || ALL_GOVS[0]
    : ALL_GOVS[0]
})
```

- [ ] **Step 5: Build check**

```bash
cd frontend-react && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in Xs`.

- [ ] **Step 6: Run backend tests to confirm no regressions**

```bash
cd /c/Users/moham/NoorGrid && python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: `53 passed`.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/components/Crisis/AlertFeed.jsx frontend-react/src/pages/Analytics.jsx
git commit -m "feat: AlertFeed prevention checklist + VIEW FORECAST navigation to Analytics"
```

---

## Self-Review

**Spec coverage:**
- ✅ Redesigned scenario cards (source badge, MW, description, preview actions)
- ✅ 4th scenario (Cap Bon Wind Farm Outage)
- ✅ ARM → FIRE two-step confirmation
- ✅ Custom scenario with label field
- ✅ Cascade region propagation on map (TunisiaMap cascadeAlerts)
- ✅ Cascade preview in CrisisModal before triggering
- ✅ Cascade chips in AlertFeed active card
- ✅ Elapsed timer in AlertFeed
- ✅ Prevention actions as interactive checkboxes
- ✅ VIEW FORECAST → navigation link
- ✅ Analytics pre-selects region from navigation state

**Placeholder scan:** None found.

**Type consistency:**
- `cascadeAlerts` is `{name: string, risk_level: string}[]` throughout (Dashboard state → TunisiaMap prop → AlertFeed prop → ActiveAlertCard prop)
- `onTrigger` signature is `(region, risk_level, scenario_label, cascade_regions)` in both CrisisModal (caller) and Dashboard (handler)
- `SCENARIOS` is exported from CrisisModal — no other file imports it yet, but the export is ready if needed
