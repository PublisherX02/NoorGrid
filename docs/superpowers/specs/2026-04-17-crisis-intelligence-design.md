# Crisis Intelligence Page — Design Spec
**Date:** 2026-04-17
**Branch:** ops-room-ui
**Scope:** New `/crisis-intelligence` route — historical incident log, regional exposure analytics, risk distribution, daily trend, backed by two new backend endpoints and a DB schema extension.

---

## Overview

A dedicated ops-intelligence page that surfaces the full history of simulated crisis events: which regions are most exposed, how often cascades occur, whether reports are being dispatched, and how incident frequency trends over time. All data lives in the existing `alerts_log` and `report_send_log` SQLite tables, extended with two new columns.

---

## Architecture

### New files
| File | Purpose |
|---|---|
| `frontend-react/src/pages/CrisisIntelligence.jsx` | Page root — layout, date-window filter, data wiring |
| `frontend-react/src/hooks/useCrisisAnalytics.js` | Fetches `GET /analytics/crisis`, exposes loading/data/error |

### Modified files
| File | Change |
|---|---|
| `frontend-react/src/App.jsx` | Add `/crisis-intelligence` route |
| `frontend-react/src/pages/Dashboard.jsx` | Pass `cascade_regions` + `alert_id` when firing simulation; add nav link |
| `frontend-react/src/services/api.js` | Update `simulateAlert` to send `cascade_regions`; update `sendReport` to send `alert_id`; add `getCrisisAnalytics` |
| `backend/models.py` | `AlertSimulateRequest` gains `cascade_regions`; `ReportSendRequest` gains `alert_id`; add `CrisisAnalyticsResponse` + sub-models |
| `backend/db.py` | Schema migration for two new columns; update `insert_alert` / `insert_report_send`; add `get_crisis_analytics` query |
| `backend/main.py` | Pass `cascade_regions` through `simulate_alert`; pass `alert_id` through `send_report`; register `GET /analytics/crisis` |

---

## Section 1: Schema Extensions

### `alerts_log` — add `cascade_regions`
```sql
ALTER TABLE alerts_log
  ADD COLUMN cascade_regions TEXT NOT NULL DEFAULT '[]';
```
Stored as a JSON array of region name strings: `["Médenine", "Tataouine"]`.
Added to `init_db` as a backward-compatible `ALTER TABLE … ADD COLUMN` migration (same pattern as the existing `output_mw` migration).

### `report_send_log` — add `alert_id`
```sql
ALTER TABLE report_send_log
  ADD COLUMN alert_id INTEGER;   -- NULL for rows written before this migration
```
Allows the analytics query to join alerts to their dispatched reports exactly, rather than fuzzy-matching by scenario label.

---

## Section 2: Backend Changes

### `models.py`
```python
class AlertSimulateRequest(BaseModel):
    region: str
    risk_level: Literal["CRITICAL", "HIGH", "ELEVATED", "NOMINAL"]
    scenario_label: str = Field(..., min_length=1, max_length=200)
    cascade_regions: list[str] = []          # ← new, optional

class ReportSendRequest(BaseModel):
    recipients: list[str] = Field(..., min_length=1, max_length=20)
    report: ReportResponse
    alert_id: int | None = None              # ← new, optional

# Analytics response
class RegionFrequencyItem(BaseModel):
    region: str
    primary_count: int
    cascade_count: int
    total: int

class DailyCountItem(BaseModel):
    date: str          # "YYYY-MM-DD"
    count: int

class IncidentItem(BaseModel):
    id: int
    region: str
    risk_level: str
    scenario_label: str
    cascade_regions: list[str]
    triggered_at: str
    report_sent: bool
    recipients_count: int

class CrisisAnalyticsResponse(BaseModel):
    window_days: int
    total_incidents: int
    critical_count: int
    high_count: int
    most_affected_region: str | None
    report_dispatch_count: int
    cascade_hits_total: int
    incidents: list[IncidentItem]
    region_frequency: list[RegionFrequencyItem]
    daily_counts: list[DailyCountItem]
```

### `db.py` — `get_crisis_analytics(days: int)`
Single function that runs three queries and assembles the response dict:

1. **Alerts query** — fetch all `alerts_log` rows within the window, LEFT JOIN `report_send_log` on `alert_id` to determine `report_sent` and `recipients_count`.
2. **Region frequency aggregation** — count each region as primary and as cascade appearance, ORDER BY total DESC.
3. **Daily counts** — GROUP BY `date(triggered_at)` for the sparkline.

```python
def get_crisis_analytics(days: int) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with get_engine().connect() as conn:
        # 1. incident list + report join
        rows = conn.execute(text("""
            SELECT a.id, a.region, a.risk_level, a.scenario_label,
                   a.cascade_regions, a.triggered_at,
                   r.id IS NOT NULL AS report_sent,
                   COALESCE(r.recipients_count, 0) AS recipients_count
            FROM alerts_log a
            LEFT JOIN (
                SELECT alert_id, id,
                       json_array_length(recipients) AS recipients_count
                FROM report_send_log
                WHERE alert_id IS NOT NULL
            ) r ON r.alert_id = a.id
            WHERE a.triggered_at >= :cutoff
            ORDER BY a.triggered_at DESC
        """), {"cutoff": cutoff}).fetchall()

        # 2. daily counts
        daily = conn.execute(text("""
            SELECT date(triggered_at) AS date, COUNT(*) AS count
            FROM alerts_log
            WHERE triggered_at >= :cutoff
            GROUP BY date(triggered_at)
            ORDER BY date ASC
        """), {"cutoff": cutoff}).fetchall()

    # Build region frequency map from rows
    ...  # aggregate primary_count + cascade_count per region, sort by total
    return { "incidents": [...], "region_frequency": [...], "daily_counts": [...], ... }
```

### `main.py` — `GET /analytics/crisis`
```python
@app.get("/analytics/crisis", response_model=CrisisAnalyticsResponse, tags=["Analytics"])
def get_crisis_analytics(days: int = 7):
    if days < 1 or days > 365:
        raise HTTPException(status_code=422, detail="days must be between 1 and 365")
    return CrisisAnalyticsResponse(**db.get_crisis_analytics(days))
```

Update `simulate_alert` to pass `cascade_regions=req.cascade_regions` to `insert_alert`.
Update `send_report` to pass `alert_id=req.alert_id` to `insert_report_send`.

---

## Section 3: Frontend — `useCrisisAnalytics`

```js
useCrisisAnalytics(days)
→ { data, loading, error, refetch }
```

- Calls `GET /analytics/crisis?days={days}` on mount and when `days` changes.
- `data` matches `CrisisAnalyticsResponse` shape; `null` while loading or on error.
- Mock fallback: if backend is unreachable, returns a static 7-day mock so the page is always renderable.

```js
// api.js
export const getCrisisAnalytics = async (days = 7) => {
  try {
    const res = await client.get('/analytics/crisis', { params: { days } })
    return { data: res.data, mock: false }
  } catch {
    return { data: _mockCrisisAnalytics(days), mock: true }
  }
}
```

---

## Section 4: Frontend — `CrisisIntelligence.jsx`

### Layout (matches mockup)
```
┌─────────────────────────────────────────────────────────┐
│ TOPBAR  ← existing Dashboard-style top bar w/ nav links │
├─────────────────────────────────────────────────────────┤
│ PAGE HEADER: "CRISIS INTELLIGENCE"       [7D][30D][90D][ALL] │
├─────────────────────────────────────────────────────────┤
│ [Total] [Critical] [Most Exposed] [Cascade Hits] [Sent] │  ← 5 metric cards
├──────────────────────────────┬──────────────────────────┤
│                              │  Risk Distribution donut │
│  Incident Log (scrollable)   │  Regional Exposure bars  │
│  — one row per incident      │  Daily Trend sparkline   │
│  — risk-colored left border  │                          │
│  — cascade chips             │                          │
│  — REPORT SENT / NO REPORT   │                          │
└──────────────────────────────┴──────────────────────────┘
```

### Date window filter
Four buttons: `7D` (default) / `30D` / `90D` / `ALL` (passes `days=3650` for "all").
Changing the window re-calls `getCrisisAnalytics` with the new value.

### Incident row
Each row displays:
- Timestamp (date + time)
- Scenario label + region + risk level + source + magnitude MW
- Cascade region chips (colored by risk level, reuse existing chip style)
- `REPORT SENT` (green) or `NO REPORT` (muted) badge

Left border color = `RISK_COLORS[risk_level]`.

### Regional exposure bar chart
- Bars sorted by `total` (primary + cascade hits) descending, top 8 regions shown
- Bar color = `RISK_COLORS` of the region's most common risk level
- Single bar per region, total height = primary_count + cascade_count; color = `RISK_COLORS` of the highest risk level that region has appeared at across the window

### Risk distribution
SVG donut — segments for CRITICAL, HIGH, ELEVATED. Shows totals for the selected window.

### Daily trend sparkline
Bar-per-day, height proportional to daily count, colored red if any critical incident that day else amber.

### Navigation wiring
- Add `Crisis Intel` link to the ops-room top bar in `Dashboard.jsx` (alongside Analytics, Simulation)
- Add route in `App.jsx`: `<Route path="/crisis-intelligence" element={<CrisisIntelligence />} />`
- `CrisisIntelligence` renders its own minimal top bar (same pattern as Analytics page — no Navbar component since Dashboard hides it)

---

## Section 5: Data Flow

```
CrisisIntelligence mounts
    │
    ▼
useCrisisAnalytics(days=7)
    │  GET /analytics/crisis?days=7
    ▼
db.get_crisis_analytics(7)
    │  queries alerts_log LEFT JOIN report_send_log
    │  aggregates region_frequency, daily_counts
    ▼
CrisisAnalyticsResponse JSON
    │
    ├──▶ MetricsRow (total, critical, most_exposed, cascade_hits, sent)
    ├──▶ IncidentTimeline (incidents list)
    ├──▶ RiskDonut (critical_count, high_count, ...)
    ├──▶ RegionExposureChart (region_frequency)
    └──▶ DailyTrendSpark (daily_counts)

[User changes date window]
    │
    ▼
useCrisisAnalytics(days=30)  → re-fetch, re-render all panels
```

### Cascade data capture flow (new)
```
CrisisModal FIRE
    │  cascade_regions passed as 4th arg to onTrigger
    ▼
Dashboard.onTrigger
    │  simulateAlert(region, risk_level, scenario_label, cascade_regions)
    ▼
POST /alerts/simulate  { ..., cascade_regions: ["Médenine", "Tataouine"] }
    │
    ▼
insert_alert(..., cascade_regions)  → stored as JSON in alerts_log
```

---

## Section 6: Error Handling

| Scenario | Behaviour |
|---|---|
| Backend unreachable | `useCrisisAnalytics` returns mock data; page renders with `SIMULATED DATA` badge |
| `days` out of range | Backend returns 422; hook sets `error` state; page shows error banner with retry |
| Empty window (no incidents) | All metric cards show `0`; timeline shows "No incidents in this period" empty state; charts hidden |
| `cascade_regions` missing (old DB rows) | Parsed as `[]`; incident row shows no cascade chips — no crash |

---

## Out of Scope

- Real-time push (WebSocket) — page refreshes only on window-change or manual reload
- Per-incident drill-down modal (clicking a row does nothing in v1)
- CSV/PDF export of incident log
- Filtering by region or scenario label
- The AI Upgrades spec (D) — separate document
