# NoorGrid — Summit Sprint Design
**Spec date:** 2026-04-16  
**Status:** Approved for implementation  
**Scope:** 1.5-week sprint targeting NRTF/INSAT national summit  
**Branch:** ops-room-ui  

---

## Strategic Context

Summit audience is INSAT judges — serious energy engineers who will know verified figures, probe the chatbot, and notice English-only UI. Every item in this sprint is either directly visible to judges or enables a visible feature. Backend plumbing (Alembic, PostgreSQL migration, test fixes) is deferred.

---

## Sprint Priorities (Ordered)

| # | Feature | Visibility | Effort |
|---|---------|------------|--------|
| 1 | Fix CARBON_INTENSITY + RAG stats | Chatbot answers, carbon index | 1h |
| 2 | APScheduler background ingestion | Analytics history populates without client | 2h |
| 3 | French localisation | Full UI in FR | 1 day |
| 4 | Hourly demand curves in blackout prediction | Prediction chart credibility | 3h |
| 5 | Crisis Response Simulator (this spec) | Killer demo moment | 1 day |
| 6 | Analytics KPI row + carbon trend line | NDC target visual | 3h |

---

## Feature: Crisis Response Simulator

### Problem

NoorGrid shows live risk levels but there is no way to demonstrate the alerting response during a planned demo. Waiting for a real CRITICAL event is not a viable demo strategy. Judges need to see the full loop: risk detected → alert fires → engineer knows what to do.

### Approach

Backend-driven injection. A `POST /alerts/simulate` endpoint accepts a scenario payload, uses real region config and live weather context to compute prevention actions, writes a test record to the DB, and returns the full alert object. The frontend reacts to the real API response — map marker, alert feed, and banner all fire from live data, not mocked state.

Real email/SMS delivery is deferred post-summit. The demo moment is the in-app response, not the delivery channel.

---

## Architecture

```
[Dashboard]
  └─ "⚡ SIMULATE CRISIS" button (ops room header, top-right)
       └─ Opens CrisisModal (full-screen overlay)
            └─ User picks preset scenario → clicks "Trigger Crisis"
                 └─ POST /alerts/simulate → FastAPI backend
                      ├─ Validates region against _REGION_CFG
                      ├─ Derives prevention_actions from region source type
                      ├─ Writes to alerts_log (is_test=true)
                      └─ Returns alert object
                 └─ Frontend receives response:
                      ├─ AlertFeed panel slides in from right edge
                      ├─ Map marker for region pulses red (CRITICAL) or amber (HIGH)
                      └─ Alert card renders with scenario + prevention actions
```

---

## Backend Changes

### New table — `alerts_log`

```sql
CREATE TABLE IF NOT EXISTS alerts_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    region       TEXT NOT NULL,
    risk_level   TEXT NOT NULL,          -- CRITICAL | HIGH
    scenario_label TEXT NOT NULL,
    prevention_actions TEXT NOT NULL,    -- JSON array stored as text
    triggered_at TEXT NOT NULL,          -- ISO8601
    is_test      INTEGER NOT NULL DEFAULT 1  -- 1=simulated, 0=real
);
```

Added to `backend/db.py` `init_db()`.

### New endpoint — `POST /alerts/simulate`

**File:** `backend/main.py`

**Request model** (`AlertSimulateRequest` in `models.py`):
```python
class AlertSimulateRequest(BaseModel):
    region: str
    risk_level: str        # "CRITICAL" | "HIGH"
    scenario_label: str
```

**Response model** (`AlertSimulateResponse` in `models.py`):
```python
class AlertSimulateResponse(BaseModel):
    id: int
    region: str
    risk_level: str
    scenario_label: str
    prevention_actions: list[str]
    triggered_at: str
    is_test: bool
```

**Logic:**
1. Validate `region` is in `_REGION_CFG` → 422 if not
2. Look up `source` for that region
3. Derive `prevention_actions` from source × risk_level lookup table (see below)
4. Write to `alerts_log` via `db.insert_alert()`
5. Return full alert object

**Prevention actions by source type:**

| Source | CRITICAL | HIGH |
|--------|----------|------|
| Wind | ["Activate reserve capacity at nearest thermal plant", "Shed non-critical industrial load (20%)", "Alert STEG National Dispatch Center"] | ["Monitor wind forecast — potential capacity drop", "Pre-position reserve capacity", "Notify regional operators"] |
| Solar | ["Switch affected region to fossil baseline", "Reduce cross-region export allocation", "Alert STEG National Dispatch Center"] | ["Increase cloud-cover monitoring interval", "Prepare fossil baseline switchover", "Notify regional operators"] |
| Hydro | ["Open spillway reserve — maintain minimum head", "Reduce downstream water allocation", "Alert STEG National Dispatch Center"] | ["Review reservoir levels against seasonal baseline", "Coordinate with SONEDE on flow reduction", "Notify regional operators"] |
| Mixed | ["Activate Ghannouch backup generation", "Reduce industrial load by 20% in affected zone", "Alert STEG National Dispatch Center"] | ["Increase gas supply monitoring", "Pre-activate renewable supplement", "Notify regional operators"] |

### New endpoint — `GET /alerts/feed`

Returns last 10 records from `alerts_log` ordered by `triggered_at DESC`.

**Response:** `list[AlertSimulateResponse]`

**File:** `backend/main.py`

### DB helper functions (`backend/db.py`)

- `insert_alert(region, risk_level, scenario_label, prevention_actions, is_test) → int` — returns new row id
- `get_alerts_feed(limit=10) → list[dict]`

---

## Frontend Changes

### `Dashboard.jsx`

- Add `⚡ SIMULATE CRISIS` button to the ops room header (top-right, next to TunisiaClock)
- Button styling: red-tinted border, monospace, subtle pulse when no active alert, solid red when alert is live
- `useState` for `activeAlert` (null | alert object) and `showModal` (bool)
- Pass `activeAlert` down to `AlertFeed` and `TunisiaMap`

### New component — `CrisisModal.jsx`

**Location:** `frontend-react/src/components/Crisis/CrisisModal.jsx`

Full-screen dark overlay (`position: fixed, inset: 0, z-index: 1000`).

**Preset scenarios:**

```js
const SCENARIOS = [
  {
    label: "Nawara Field Failure",
    region: "Gabès",
    risk_level: "CRITICAL",
    description: "Gas output −27% — cascade risk to southern grid."
  },
  {
    label: "Summer Peak Demand Surge",
    region: "Tunis",
    risk_level: "CRITICAL",
    description: "August demand +23% above baseline — thermal reserve at limit."
  },
  {
    label: "Algerian Pipeline Disruption",
    region: "Bizerte",
    risk_level: "HIGH",
    description: "Import gas pressure drop — 11% of national supply at risk."
  },
  {
    label: "Custom",
    region: null,   // user picks from dropdown
    risk_level: null,
    description: null
  }
]
```

**Layout:**
- Title: `CRISIS SCENARIO — SELECT EVENT` (monospace, red)
- 3 preset cards in a row + 1 custom card
- Selected card gets a red border highlight
- For Custom: region dropdown (all 24 govs) + risk level selector
- Bottom: `TRIGGER CRISIS` button (full-width red) → calls `POST /alerts/simulate`
- Button label changes to `TRIGGERING...` during API call
- On success: closes modal, fires `onAlertTriggered(alertObject)` callback

### New component — `AlertFeed.jsx`

**Location:** `frontend-react/src/components/Crisis/AlertFeed.jsx`

Slides in from the right edge of the Dashboard when `activeAlert` is non-null.

**Alert card layout:**
```
⚠ CRITICAL — Gabès                    14:32:07
Nawara Field Failure
─────────────────────────────────────────────
▸ Activate reserve capacity at nearest thermal plant
▸ Reduce cross-region export allocation
▸ Alert STEG National Dispatch Center
                                 [ACKNOWLEDGE]
```

- `[ACKNOWLEDGE]` button clears `activeAlert` state and removes the map pulse
- Feed keeps last 5 alerts stacked below the active card (historical, greyed out)
- Feed populated from `GET /alerts/feed` on mount and after each new alert

### New hook — `useAlerts.js`

**Location:** `frontend-react/src/hooks/useAlerts.js`

- Fetches `GET /alerts/feed` on mount
- Re-fetches every 15 seconds
- Returns `{ alerts, loading, triggerSimulation }`
- `triggerSimulation(payload)` calls `POST /alerts/simulate` and prepends the result to local state (no re-fetch needed)

### `TunisiaMap.jsx`

- Accept `activeAlert` prop (nullable)
- When non-null: the marker for `activeAlert.region` overrides its live risk color with CRITICAL red + CSS pulse animation
- When `activeAlert` is cleared (acknowledged): marker reverts to live data color

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Region not in `_REGION_CFG` | Backend returns 422 — modal shows inline error, does not close |
| DB write fails | Backend logs error, still returns alert object — demo continues |
| `/alerts/feed` unavailable | `useAlerts` returns empty array, silently — alert feed shows nothing rather than crashing |
| API call in flight | Button shows `TRIGGERING...` and is disabled — prevents double-submit |

---

## Stats & Constants Update (Priority 1)

### `backend/calculations.py`
```python
CARBON_INTENSITY = 0.423  # 423 gCO2eq/kWh — verified 2024 ONEM figure (was 0.468)
```

### `backend/main.py`
- Update formula docstring on `/energy/carbon`: `0.468` → `0.423`
- Update RAG system prompt context block with verified 2025 figures:
  - Total 2025 generation: 20,535 GWh (+6% from 2024)
  - Energy independence: 39% in Q1 2025
  - Energy trade deficit: 2.92 billion TND by end 2025
  - Nawara field production: −27% in early 2025
  - Direct gas imports from Algeria: +23% in 2025
  - Electricity imports covering 11% of summer demand (August 2025)
  - Grid carbon intensity: 423 gCO2eq/kWh (2024 verified)

---

## APScheduler Background Ingestion

### `backend/main.py`
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup_event():
    init_db()
    scheduler.add_job(scheduled_ingest, "interval", minutes=15, id="weather_ingest")
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()

async def scheduled_ingest():
    entries = await fetch_all_weather()
    count = insert_weather_entries(entries)
    print(f"[scheduler] ingested {count} records")
```

---

## Hourly Demand Curves (Blackout Prediction Upgrade)

In `backend/main.py` prediction loop, replace flat `estimated_demand_mw`:

```python
import datetime

hour = datetime.datetime.now().hour
peak_factor = 1.15 if (8 <= hour <= 12 or 18 <= hour <= 22) else (0.75 if 1 <= hour <= 5 else 1.0)

month = datetime.datetime.now().month
seasonal_factor = 1.12 if month in (6, 7, 8, 9) else (1.08 if month in (12, 1, 2) else 1.0)

estimated_demand_mw = avg_demand_mw * (1 + cooling_factor) * peak_factor * seasonal_factor
```

Add `probability_low` and `probability_high` to `HourlyPrediction` model:
```python
probability_low: float   # max(0, prob - 12)
probability_high: float  # min(100, prob + 12)
```

Display as shaded band in the blackout probability chart on the frontend.

---

## Analytics KPI Row + Carbon Trend (Stretch Goal)

**If time allows after priorities 1–5:**

- KPI summary row at top of Analytics page: Total MWh · Peak output day · Avg blackout probability · Days above ELEVATED
- Carbon trend line chart: daily national CO₂/cap/day with NDC target line at 1.80 kg CO₂/cap/day overlay

---

## Files Modified

| File | Change |
|------|--------|
| `backend/calculations.py` | CARBON_INTENSITY: 0.468 → 0.423 |
| `backend/main.py` | RAG system prompt stats, APScheduler, hourly demand curves, `/alerts/simulate`, `/alerts/feed` |
| `backend/db.py` | `alerts_log` table, `insert_alert()`, `get_alerts_feed()` |
| `backend/models.py` | `AlertSimulateRequest`, `AlertSimulateResponse`, `HourlyPrediction` confidence interval |
| `frontend-react/src/pages/Dashboard.jsx` | Crisis button, `activeAlert` state, AlertFeed integration |
| `frontend-react/src/components/Crisis/CrisisModal.jsx` | New |
| `frontend-react/src/components/Crisis/AlertFeed.jsx` | New |
| `frontend-react/src/hooks/useAlerts.js` | New |
| `frontend-react/src/components/Map/TunisiaMap.jsx` | `activeAlert` prop, region pulse override |

---

## Acceptance Criteria

- [ ] CARBON_INTENSITY is 0.423 in calculations and all docstrings/prompts
- [ ] RAG chatbot answers correctly on: trade deficit, energy independence %, Nawara −27%
- [ ] Weather records accumulate in DB every 15 minutes with no client connected
- [ ] Blackout prediction evening hours (18:00–22:00) show higher probability than midday
- [ ] "⚡ SIMULATE CRISIS" button visible on Dashboard
- [ ] Clicking Nawara Field Failure scenario → Gabès map marker pulses red
- [ ] Alert card shows 3 correct prevention actions for Gabès (Solar source)
- [ ] `[ACKNOWLEDGE]` clears the alert and reverts the map marker
- [ ] `/alerts/simulate` returns 422 for an unknown region
- [ ] DB contains `alerts_log` records after simulation runs

---

## Deferred (Post-Summit)

- Real email delivery (Resend API)
- SMS delivery (Vonage)
- JWT authentication (Phase 1.3)
- Docker Compose (Phase 1.4)
- French localisation (Phase 1.5) — Priority 3 in the sprint; cut only if priorities 1–2 + 5 run over time
- Alembic migrations
- PostgreSQL production path
- Test suite fixes
