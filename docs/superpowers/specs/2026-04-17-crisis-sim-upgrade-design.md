# Crisis Simulation Upgrade — Design Spec
**Date:** 2026-04-17  
**Branch:** ops-room-ui  
**Scope:** Drone tracking on map, diagnosis report generation, corporate email template preview and simulated dispatch

---

## Overview

Extend the existing crisis simulation (CrisisModal → AlertFeed → TunisiaMap) with three new capabilities that fire sequentially when a crisis is triggered:

1. **Drone Layer** — animated drones dispatched to affected regions on the live map
2. **Crisis Report** — AI-generated diagnosis triggered when drones return to base
3. **Diagnosis Report Modal** — structured report + corporate email preview + recipient editor + simulated send

---

## Architecture

### New files
| File | Purpose |
|---|---|
| `frontend-react/src/components/Map/DroneLayer.jsx` | Self-contained Leaflet drone overlay |
| `frontend-react/src/hooks/useCrisisReport.js` | Manages background report generation state |
| `frontend-react/src/components/Crisis/DiagnosisReportModal.jsx` | Report + email preview + send UI |
| `backend/report.py` | NIM prompt builder + report endpoint logic |

### Modified files
| File | Change |
|---|---|
| `frontend-react/src/components/Map/TunisiaMap.jsx` | Accept `droneState` prop, render `<DroneLayer>` |
| `frontend-react/src/components/Crisis/AlertFeed.jsx` | Show report status badge + "VIEW REPORT" button |
| `frontend-react/src/pages/Dashboard.jsx` | Wire `useCrisisReport`, pass props, render `DiagnosisReportModal` |
| `backend/main.py` | Register `POST /report/generate` and `POST /report/send` endpoints |
| `backend/models.py` | Add `ReportRequest`, `ReportResponse`, `ReportSendRequest`, `ReportSendResponse` |

---

## Section 1: DroneLayer

### Component: `DroneLayer.jsx`
Rendered inside `TunisiaMap` as a child, receives the Leaflet map instance via a ref callback.

**Props:**
```js
DroneLayer({ map, activeAlert, cascadeAlerts, onDronesReturned })
```

**Drone data shape:**
```js
{
  id: string,           // e.g. "drone-Gabès-0"
  origin: [lat, lon],   // STEG base coordinates (fixed per region cluster)
  target: [lat, lon],   // affected governorate lat/lon
  progress: 0–1,        // 0=at origin, 1=at target (en-route phase)
  returnProgress: 0–1,  // 0=at target, 1=back at origin (return phase)
  status: 'en-route' | 'patrolling' | 'returning' | 'returned',
  patrolAngle: 0–360,   // degrees, increments during patrol phase
  riskColor: string,    // from RISK_COLORS[region.risk_level]
}
```

**STEG base locations (simulated, one per cardinal cluster):**
- North base: [37.5, 9.5] (near Bizerte)
- Centre base: [35.5, 9.8] (near Kairouan)
- South base: [33.2, 10.2] (near Gabès)

**Drone count per risk level:**
- CRITICAL region → 3 drones
- HIGH / cascade region → 2 drones

**Phase timings (all configurable via constants):**
- En-route: 8 seconds (progress 0→1)
- Patrol: 12 seconds (patrolAngle 0→360, orbit radius 0.04°)
- Return: 8 seconds (returnProgress 0→1)

**Three visual behaviors applied simultaneously:**

1. **Animated flight marker** — `L.divIcon` with `✈` SVG in risk-colored ring. Position interpolated between origin and target using `progress`. Updated every 100ms via `setInterval`.

2. **Trajectory polyline** — `L.polyline([origin, target])` drawn when drone spawns. Solid segment behind drone (traveled), dashed segment ahead (remaining). ETA `L.divIcon` label near drone: `~Xs` counting down.

3. **Patrol sweep** — when status is `patrolling`, drone orbits target at radius 0.04° using `patrolAngle`. A faint `L.circle` outline (dashed, risk color, 0.3 opacity) shows the patrol perimeter.

**Callback:** `onDronesReturned()` fires when all drones across all active groups reach `status === 'returned'`.

**Cleanup:** All markers, polylines, and circles removed when `activeAlert` becomes null.

---

## Section 2: `useCrisisReport` Hook

```js
useCrisisReport({ activeAlert, cascadeAlerts }) 
→ { reportStatus, report, onDronesReturned, openReport, setOpenReport }
```

**State:**
- `reportStatus: 'idle' | 'generating' | 'ready' | 'error'`
- `report: null | ReportData`
- `openReport: boolean` — controls DiagnosisReportModal visibility

**Behavior:**
- `onDronesReturned` — callback passed to DroneLayer. When called, sets `reportStatus = 'generating'` and fires `POST /report/generate`.
- Resets to `idle` when `activeAlert` changes to null (acknowledged).

**ReportData shape (returned by backend):**
```js
{
  scenario_label: string,
  region: string,
  risk_level: string,
  source: string,
  magnitude_mw: number,
  cascade_regions: Array<{ name, risk_level }>,
  prevention_actions: string[],
  root_cause: string,        // NIM-generated
  technical_fix: string,     // NIM-generated
  impact_summary: string,    // NIM-generated
  recommended_actions: string[], // NIM-generated
  generated_at: string,      // ISO timestamp
}
```

---

## Section 3: AlertFeed — Report Status Badge

On the `ActiveAlertCard`, below the prevention actions list and above the ACKNOWLEDGE button:

- `reportStatus === 'idle'` → nothing shown (drones still flying)
- `reportStatus === 'generating'` → `⟳ ANALYZING…` badge in amber, pulsing
- `reportStatus === 'ready'` → `VIEW REPORT ▶` button in green, single pulse animation
- `reportStatus === 'error'` → `⚠ REPORT FAILED` in red with retry link

---

## Section 4: `DiagnosisReportModal`

**Props:**
```js
DiagnosisReportModal({ report, onClose, defaultRecipients })
```

**Layout:** Two-column modal (max-width 960px), dark header + two white-ish inner columns.

### Left column — Ops Summary
- Scenario metadata row: region chip, source badge, magnitude MW, triggered_at
- Cascade regions chips (reuse existing chip style)
- Prevention actions checklist (pre-ticked checkboxes)
- **Root Cause** callout box (amber border, NIM text)
- **Technical Fix** callout box (cyan border, NIM text)
- Impact summary paragraph (muted text)

### Right column — Email Preview
`<iframe sandbox="allow-same-origin">` containing the full HTML email string (generated client-side from `report` data).

**Email HTML template** (corporate style):
- White background (`#ffffff`)
- Header bar: NoorGrid green (`#00c46a`) with "⚡ NoorGrid — STEG Grid Operations" white text
- Risk severity banner: full-width colored bar with risk level text (uses RISK_COLORS palette)
- Sections with gray dividers:
  - **Incident Overview** — region, time, magnitude, source
  - **Cascade Impact** — list of affected regions
  - **Root Cause Analysis** — NIM paragraph
  - **Recommended Actions** — numbered list
  - **Technical Resolution** — NIM paragraph
- Footer: "Auto-generated by NoorGrid Crisis Intelligence System · [timestamp]"
- All inline styles (no external CSS) for email-client compatibility

### Recipient row (below iframe)
- Editable chip list initialized from `defaultRecipients` (read from env/config)
- `+ Add` input field (email validation before adding)
- `SEND REPORT` button → `POST /report/send` → shows `✓ REPORT SENT` on success

---

## Section 5: Backend Endpoints

### `POST /report/generate`
**Request:**
```json
{
  "region": "Gabès",
  "risk_level": "CRITICAL",
  "scenario_label": "Nawara Field Failure",
  "source": "Solar",
  "magnitude_mw": 620,
  "cascade_regions": [{"name": "Médenine", "risk_level": "HIGH"}],
  "prevention_actions": ["Switch to fossil baseline", "...]
}
```

**NIM prompt:** Structured system prompt asking for JSON output with keys `root_cause`, `technical_fix`, `impact_summary`, `recommended_actions`. Uses the existing `_SYSTEM_PROMPT_TEMPLATE` facts context. Temperature 0.2 for deterministic output.

**Response:** Full `ReportData` JSON including the NIM fields merged with request data.

**Fallback:** If NIM is unavailable (503/502), returns mock root cause text so the UI still works.

### `POST /report/send`
**Request:**
```json
{
  "recipients": ["eng1@steg.com.tn", "tech1@steg.com.tn"],
  "report": { ...ReportData }
}
```

**Behavior:** Logs the send to stdout and optionally to the alerts DB. Returns `{ sent: true, recipients: [...], sent_at: "ISO" }`. Does not send real email (simulation mode). If `SMTP_*` env vars are configured in future, real send can be wired here.

---

## Data Flow Diagram

```
CrisisModal FIRE
    │
    ▼
Dashboard.triggerSimulation()
    │
    ├──▶ AlertFeed shows active alert
    │
    └──▶ TunisiaMap DroneLayer spawns drones
              │
              │  [8s flight → 12s patrol → 8s return]
              │
              ▼
         onDronesReturned()
              │
              ▼
         useCrisisReport → POST /report/generate
              │
              │  [NIM inference ~3-5s]
              │
              ▼
         reportStatus = 'ready'
              │
              ▼
         AlertFeed shows "VIEW REPORT ▶"
              │
         [user clicks]
              │
              ▼
         DiagnosisReportModal opens
              │
         [user edits recipients, clicks SEND]
              │
              ▼
         POST /report/send → logged
```

---

## Environment Variables

```env
# Optional: pre-populate report recipient list
VITE_REPORT_RECIPIENTS=eng.dispatch@steg.com.tn,ops.lead@steg.com.tn

# Already exists — used by /report/generate
NVIDIA_NIM_API_KEY=...
```

---

## Error Handling

- If `/report/generate` fails → `reportStatus = 'error'`, retry button shown, fallback mock report used so modal can still open
- If NIM key absent → backend returns 503, frontend uses static mock root cause text
- If `/report/send` fails → toast error, button re-enabled for retry

---

## Out of Scope

- Real SMTP email delivery (future, behind `SMTP_HOST` env flag)
- Drone GPS telemetry from real hardware
- Persistent report storage / report history view
- Multi-language report templates (French version deferred)
