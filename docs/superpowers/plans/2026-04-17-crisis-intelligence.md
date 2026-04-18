# Crisis Intelligence Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/crisis-intelligence` page that surfaces full historical incident analytics — region exposure, risk distribution, daily trend, and incident log — backed by a new `GET /analytics/crisis` endpoint and two DB schema extensions.

**Architecture:** SQLite schema gains two columns (`alerts_log.cascade_regions`, `report_send_log.alert_id`); a single `get_crisis_analytics(days)` Python function runs three queries; a new FastAPI route serialises the response; and a new React page (`CrisisIntelligence.jsx`) + hook (`useCrisisAnalytics.js`) consume it. Existing `simulateAlert` / `sendReport` callers are updated to pass the new fields so all future incidents are captured correctly.

**Tech Stack:** Python 3.11, FastAPI, Pydantic v2, SQLAlchemy Core, SQLite; React 18, Vite, Axios; pytest, TestClient

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/db.py` | Schema migrations, updated insert fns, new analytics query |
| Modify | `backend/models.py` | Add `cascade_regions` to `AlertSimulateRequest`, `alert_id` to `ReportSendRequest`, add analytics response models |
| Modify | `backend/main.py` | Thread new fields through endpoint handlers, register `GET /analytics/crisis` |
| Modify | `frontend-react/src/services/api.js` | Update `simulateAlert`/`sendReport` signatures, add `getCrisisAnalytics` |
| Modify | `frontend-react/src/pages/Dashboard.jsx` | Pass `cascade_regions` + `alertId` to API calls; add Crisis Intel nav link |
| Modify | `frontend-react/src/components/Crisis/DiagnosisReportModal.jsx` | Accept `alertId` prop, pass it to `sendReport` |
| Create | `frontend-react/src/hooks/useCrisisAnalytics.js` | Data fetching hook |
| Create | `frontend-react/src/pages/CrisisIntelligence.jsx` | Full analytics page |
| Modify | `frontend-react/src/App.jsx` | Register `/crisis-intelligence` route |
| Modify | `tests/test_main_extra.py` | New tests for analytics endpoint |

---

## Task 1: DB Schema Migrations

**Files:**
- Modify: `backend/db.py`
- Test: `tests/test_db_analytics.py` (create new)

- [ ] **Step 1: Write the failing test**

Create `tests/test_db_analytics.py`:

```python
import json
import pytest
from pathlib import Path

@pytest.fixture()
def db_mod(tmp_path, monkeypatch):
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test_analytics.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import importlib
    import db
    db._engine = None
    importlib.reload(db)
    return db


def test_alerts_log_has_cascade_regions_column(db_mod):
    db_mod.init_db()
    from sqlalchemy import text
    with db_mod.get_engine().connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(alerts_log)")).fetchall()}
    assert "cascade_regions" in cols


def test_report_send_log_has_alert_id_column(db_mod):
    db_mod.init_db()
    from sqlalchemy import text
    with db_mod.get_engine().connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(report_send_log)")).fetchall()}
    assert "alert_id" in cols


def test_insert_alert_stores_cascade_regions(db_mod):
    db_mod.init_db()
    aid = db_mod.insert_alert(
        region="Tunis",
        risk_level="HIGH",
        scenario_label="Test",
        prevention_actions=["action1"],
        cascade_regions=["Médenine", "Tataouine"],
    )
    from sqlalchemy import text
    with db_mod.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT cascade_regions FROM alerts_log WHERE id = :id"), {"id": aid}
        ).fetchone()
    assert json.loads(row[0]) == ["Médenine", "Tataouine"]


def test_insert_alert_defaults_cascade_regions_empty(db_mod):
    db_mod.init_db()
    aid = db_mod.insert_alert(
        region="Sfax",
        risk_level="NOMINAL",
        scenario_label="None",
        prevention_actions=[],
    )
    from sqlalchemy import text
    with db_mod.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT cascade_regions FROM alerts_log WHERE id = :id"), {"id": aid}
        ).fetchone()
    assert json.loads(row[0]) == []


def test_insert_report_send_stores_alert_id(db_mod):
    db_mod.init_db()
    rid = db_mod.insert_report_send(
        scenario_label="Test",
        region="Tunis",
        risk_level="HIGH",
        recipients=["a@b.com"],
        sent_at="2026-04-17T10:00:00",
        alert_id=42,
    )
    from sqlalchemy import text
    with db_mod.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT alert_id FROM report_send_log WHERE id = :id"), {"id": rid}
        ).fetchone()
    assert row[0] == 42


def test_insert_report_send_null_alert_id(db_mod):
    db_mod.init_db()
    rid = db_mod.insert_report_send(
        scenario_label="Old",
        region="Sfax",
        risk_level="NOMINAL",
        recipients=["x@y.com"],
        sent_at="2026-04-17T11:00:00",
        alert_id=None,
    )
    from sqlalchemy import text
    with db_mod.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT alert_id FROM report_send_log WHERE id = :id"), {"id": rid}
        ).fetchone()
    assert row[0] is None
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_db_analytics.py -v
```

Expected: FAIL — `cascade_regions` column missing, `insert_alert` does not accept `cascade_regions` kwarg, `insert_report_send` does not accept `alert_id` kwarg.

- [ ] **Step 3: Apply schema migrations and update insert functions in `backend/db.py`**

In `init_db`, inside the `with engine.begin() as conn:` block, after the existing `output_mw` migration block, add:

```python
        # Migration: alerts_log.cascade_regions (JSON array of region name strings)
        alert_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(alerts_log)")).fetchall()
        }
        if "cascade_regions" not in alert_cols:
            conn.execute(text(
                "ALTER TABLE alerts_log ADD COLUMN cascade_regions TEXT NOT NULL DEFAULT '[]'"
            ))

        # Migration: report_send_log.alert_id (FK to alerts_log.id, NULL for old rows)
        rsl_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(report_send_log)")).fetchall()
        }
        if "alert_id" not in rsl_cols:
            conn.execute(text(
                "ALTER TABLE report_send_log ADD COLUMN alert_id INTEGER"
            ))
```

Update `insert_alert` signature and body:

```python
def insert_alert(
    region: str,
    risk_level: str,
    scenario_label: str,
    prevention_actions: list[str],
    is_test: bool = True,
    cascade_regions: list[str] | None = None,
) -> int:
    """Insert a simulated or real alert into alerts_log. Returns the new row id."""
    init_db()
    with get_engine().begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO alerts_log
                    (region, risk_level, scenario_label, prevention_actions, is_test, cascade_regions)
                VALUES
                    (:region, :risk_level, :scenario_label, :prevention_actions, :is_test, :cascade_regions)
            """),
            {
                "region": region,
                "risk_level": risk_level,
                "scenario_label": scenario_label,
                "prevention_actions": json.dumps(prevention_actions),
                "is_test": 1 if is_test else 0,
                "cascade_regions": json.dumps(cascade_regions or []),
            },
        )
        return result.lastrowid
```

Update `insert_report_send` signature and body:

```python
def insert_report_send(
    scenario_label: str,
    region: str,
    risk_level: str,
    recipients: list[str],
    sent_at: str,
    alert_id: int | None = None,
) -> int:
    """Persist a simulated report dispatch event for audit/logging."""
    init_db()
    with get_engine().begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO report_send_log
                    (scenario_label, region, risk_level, recipients, sent_at, alert_id)
                VALUES
                    (:scenario_label, :region, :risk_level, :recipients, :sent_at, :alert_id)
            """),
            {
                "scenario_label": scenario_label,
                "region": region,
                "risk_level": risk_level,
                "recipients": json.dumps(recipients),
                "sent_at": sent_at,
                "alert_id": alert_id,
            },
        )
        return result.lastrowid
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_db_analytics.py -v
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_db_analytics.py
git commit -m "feat: add cascade_regions to alerts_log and alert_id to report_send_log"
```

---

## Task 2: Backend Models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add `cascade_regions` to `AlertSimulateRequest`, `alert_id` to `ReportSendRequest`, and all analytics models**

In `backend/models.py`, update the alert and report request models, then append analytics models at the end:

Change `AlertSimulateRequest`:
```python
class AlertSimulateRequest(BaseModel):
    region: str = Field(..., description="Governorate name — must exist in _REGION_CFG")
    risk_level: Literal["CRITICAL", "HIGH", "ELEVATED", "NOMINAL"] = Field(..., description="Risk level")
    scenario_label: str = Field(..., min_length=1, max_length=200)
    cascade_regions: list[str] = Field(default_factory=list)  # ← new
```

Change `ReportSendRequest`:
```python
class ReportSendRequest(BaseModel):
    recipients: list[str] = Field(..., min_length=1, max_length=20, description="1–20 recipient email addresses")
    report: ReportResponse
    alert_id: int | None = None  # ← new
```

Append at the bottom of `models.py`:
```python

# ── Crisis Analytics models ───────────────────────────────────────────────────

class RegionFrequencyItem(BaseModel):
    region: str
    primary_count: int
    cascade_count: int
    total: int


class DailyCountItem(BaseModel):
    date: str   # "YYYY-MM-DD"
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

- [ ] **Step 2: Verify models import cleanly (no runtime error)**

```bash
cd C:/Users/moham/NoorGrid/backend && python -c "from models import CrisisAnalyticsResponse, AlertSimulateRequest, ReportSendRequest; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add analytics models and extend alert/report request models"
```

---

## Task 3: `get_crisis_analytics` DB Function

**Files:**
- Modify: `backend/db.py`
- Modify: `tests/test_db_analytics.py`

- [ ] **Step 1: Add tests for `get_crisis_analytics`**

Append to `tests/test_db_analytics.py`:

```python
def test_get_crisis_analytics_empty_window(db_mod):
    db_mod.init_db()
    result = db_mod.get_crisis_analytics(7)
    assert result["total_incidents"] == 0
    assert result["critical_count"] == 0
    assert result["high_count"] == 0
    assert result["most_affected_region"] is None
    assert result["report_dispatch_count"] == 0
    assert result["cascade_hits_total"] == 0
    assert result["incidents"] == []
    assert result["region_frequency"] == []
    assert result["daily_counts"] == []
    assert result["window_days"] == 7


def test_get_crisis_analytics_counts_incidents(db_mod):
    db_mod.init_db()
    aid1 = db_mod.insert_alert("Tunis", "CRITICAL", "Scenario A", [], cascade_regions=["Médenine"])
    aid2 = db_mod.insert_alert("Sfax", "HIGH", "Scenario B", [], cascade_regions=[])
    result = db_mod.get_crisis_analytics(7)
    assert result["total_incidents"] == 2
    assert result["critical_count"] == 1
    assert result["high_count"] == 1
    assert result["cascade_hits_total"] == 1


def test_get_crisis_analytics_report_dispatch_count(db_mod):
    db_mod.init_db()
    import datetime
    aid = db_mod.insert_alert("Tunis", "HIGH", "Scenario", [], cascade_regions=[])
    db_mod.insert_report_send("Scenario", "Tunis", "HIGH", ["a@b.com"],
                               datetime.datetime.utcnow().isoformat(), alert_id=aid)
    result = db_mod.get_crisis_analytics(7)
    assert result["report_dispatch_count"] == 1
    assert result["incidents"][0]["report_sent"] is True
    assert result["incidents"][0]["recipients_count"] == 1


def test_get_crisis_analytics_most_affected_region(db_mod):
    db_mod.init_db()
    db_mod.insert_alert("Tunis", "HIGH", "A", [], cascade_regions=[])
    db_mod.insert_alert("Tunis", "CRITICAL", "B", [], cascade_regions=[])
    db_mod.insert_alert("Sfax", "HIGH", "C", [], cascade_regions=[])
    result = db_mod.get_crisis_analytics(7)
    assert result["most_affected_region"] == "Tunis"


def test_get_crisis_analytics_region_frequency_includes_cascade(db_mod):
    db_mod.init_db()
    db_mod.insert_alert("Tunis", "HIGH", "A", [], cascade_regions=["Médenine"])
    result = db_mod.get_crisis_analytics(7)
    freq = {r["region"]: r for r in result["region_frequency"]}
    assert freq["Tunis"]["primary_count"] == 1
    assert freq["Tunis"]["cascade_count"] == 0
    assert freq["Médenine"]["primary_count"] == 0
    assert freq["Médenine"]["cascade_count"] == 1
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_db_analytics.py::test_get_crisis_analytics_empty_window -v
```

Expected: FAIL — `db` has no attribute `get_crisis_analytics`.

- [ ] **Step 3: Implement `get_crisis_analytics` in `backend/db.py`**

Add the following function (after `get_alerts_feed`):

```python
def get_crisis_analytics(days: int) -> dict:
    """
    Return aggregate crisis analytics for the given time window.
    Queries alerts_log LEFT JOIN report_send_log on alert_id.
    """
    init_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with get_engine().connect() as conn:
        # 1. Incident list with report join
        rows = conn.execute(text("""
            SELECT a.id, a.region, a.risk_level, a.scenario_label,
                   a.cascade_regions, a.triggered_at,
                   (r.id IS NOT NULL) AS report_sent,
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

        # 2. Daily counts
        daily_rows = conn.execute(text("""
            SELECT date(triggered_at) AS date, COUNT(*) AS count
            FROM alerts_log
            WHERE triggered_at >= :cutoff
            GROUP BY date(triggered_at)
            ORDER BY date ASC
        """), {"cutoff": cutoff}).fetchall()

    # Build incident list and aggregate counters
    incidents = []
    critical_count = 0
    high_count = 0
    report_dispatch_count = 0
    cascade_hits_total = 0
    region_primary: dict[str, int] = {}
    region_cascade: dict[str, int] = {}

    for row in rows:
        d = dict(row._mapping)
        cascade = json.loads(d["cascade_regions"] or "[]")
        d["cascade_regions"] = cascade
        d["report_sent"] = bool(d["report_sent"])
        d["recipients_count"] = int(d["recipients_count"])

        if d["risk_level"] == "CRITICAL":
            critical_count += 1
        elif d["risk_level"] == "HIGH":
            high_count += 1

        if d["report_sent"]:
            report_dispatch_count += 1

        cascade_hits_total += len(cascade)

        # Primary region count
        region_primary[d["region"]] = region_primary.get(d["region"], 0) + 1
        # Cascade region counts
        for cr in cascade:
            region_cascade[cr] = region_cascade.get(cr, 0) + 1

        incidents.append({
            "id": d["id"],
            "region": d["region"],
            "risk_level": d["risk_level"],
            "scenario_label": d["scenario_label"],
            "cascade_regions": cascade,
            "triggered_at": d["triggered_at"],
            "report_sent": d["report_sent"],
            "recipients_count": d["recipients_count"],
        })

    # Build region frequency list — union of primary and cascade regions
    all_regions = set(region_primary) | set(region_cascade)
    region_frequency = []
    for region in all_regions:
        primary = region_primary.get(region, 0)
        cascade = region_cascade.get(region, 0)
        region_frequency.append({
            "region": region,
            "primary_count": primary,
            "cascade_count": cascade,
            "total": primary + cascade,
        })
    region_frequency.sort(key=lambda x: x["total"], reverse=True)

    most_affected_region = region_frequency[0]["region"] if region_frequency else None

    daily_counts = [{"date": row[0], "count": row[1]} for row in daily_rows]

    return {
        "window_days": days,
        "total_incidents": len(incidents),
        "critical_count": critical_count,
        "high_count": high_count,
        "most_affected_region": most_affected_region,
        "report_dispatch_count": report_dispatch_count,
        "cascade_hits_total": cascade_hits_total,
        "incidents": incidents,
        "region_frequency": region_frequency,
        "daily_counts": daily_counts,
    }
```

- [ ] **Step 4: Run all analytics DB tests**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_db_analytics.py -v
```

Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/db.py tests/test_db_analytics.py
git commit -m "feat: implement get_crisis_analytics with region frequency and daily counts"
```

---

## Task 4: `GET /analytics/crisis` Endpoint + Wire cascade_regions / alert_id Through

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_main_extra.py`

- [ ] **Step 1: Write failing endpoint tests**

Append to `tests/test_main_extra.py`:

```python
def test_analytics_crisis_returns_empty_for_fresh_db(client):
    resp = client.get("/analytics/crisis?days=7")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_incidents"] == 0
    assert data["window_days"] == 7
    assert data["incidents"] == []


def test_analytics_crisis_records_cascade_regions(client):
    # Simulate an alert with cascade regions
    sim = client.post("/alerts/simulate", json={
        "region": "Tunis",
        "risk_level": "HIGH",
        "scenario_label": "Test cascade",
        "cascade_regions": ["Médenine", "Tataouine"],
    })
    assert sim.status_code == 200

    resp = client.get("/analytics/crisis?days=7")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_incidents"] == 1
    incident = data["incidents"][0]
    assert incident["cascade_regions"] == ["Médenine", "Tataouine"]
    assert data["cascade_hits_total"] == 2


def test_analytics_crisis_days_validation(client):
    assert client.get("/analytics/crisis?days=0").status_code == 422
    assert client.get("/analytics/crisis?days=366").status_code == 422
    assert client.get("/analytics/crisis?days=1").status_code == 200
    assert client.get("/analytics/crisis?days=365").status_code == 200


def test_simulate_alert_accepts_cascade_regions(client):
    resp = client.post("/alerts/simulate", json={
        "region": "Sfax",
        "risk_level": "CRITICAL",
        "scenario_label": "Storm surge",
        "cascade_regions": ["Gabès"],
    })
    assert resp.status_code == 200


def test_send_report_accepts_alert_id(client):
    # First simulate an alert
    sim = client.post("/alerts/simulate", json={
        "region": "Tunis", "risk_level": "HIGH",
        "scenario_label": "Test", "cascade_regions": [],
    })
    alert_id = sim.json()["id"]

    resp = client.post("/report/send", json={
        "recipients": ["ops@steg.tn"],
        "report": {
            "region": "Tunis",
            "risk_level": "HIGH",
            "scenario_label": "Test",
            "source": "Wind",
            "magnitude_mw": 50.0,
            "cascade_regions": [],
            "prevention_actions": [],
            "root_cause": "Test cause",
            "technical_fix": "Test fix",
            "impact_summary": "Test impact",
            "recommended_actions": ["Do X"],
            "generated_at": "2026-04-17T10:00:00",
        },
        "alert_id": alert_id,
    })
    assert resp.status_code == 200
    assert resp.json()["sent"] is True
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_main_extra.py::test_analytics_crisis_returns_empty_for_fresh_db tests/test_main_extra.py::test_analytics_crisis_records_cascade_regions -v
```

Expected: FAIL — `/analytics/crisis` route does not exist yet; `cascade_regions` field rejected by validator.

- [ ] **Step 3: Update `main.py`**

Add `get_crisis_analytics` to the db imports at the top of `main.py`:

```python
from db import (
    get_alert_by_id,
    get_alerts_feed,
    get_crisis_analytics,
    get_region_history,
    init_db,
    insert_alert,
    insert_report_send,
    insert_weather_entries,
)
```

Add `CrisisAnalyticsResponse` to the models imports:

```python
from models import (
    AlertSimulateRequest,
    AlertSimulateResponse,
    BlackoutRequest,
    BlackoutResponse,
    CarbonRequest,
    CarbonResponse,
    CrisisAnalyticsResponse,
    GridSimulationRequest,
    GridSimulationResponse,
    HistoryRecordRequest,
    HistoryRecordResponse,
    HourlyPrediction,
    HydroRequest,
    NationalStatsResponse,
    PowerResponse,
    RAGRequest,
    RAGResponse,
    RegionHistoryResponse,
    ReportRequest,
    ReportResponse,
    ReportSendRequest,
    ReportSendResponse,
    SolarRequest,
    WeatherAllEntry,
    WeatherAllResponse,
    WeatherResponse,
    WindRequest,
)
```

Update `simulate_alert` to pass `cascade_regions` to `insert_alert` (replace the existing `insert_alert(...)` call):

```python
    alert_id = 0
    triggered_at = datetime.datetime.utcnow().isoformat()
    try:
        alert_id = insert_alert(
            region=req.region,
            risk_level=req.risk_level,
            scenario_label=req.scenario_label,
            prevention_actions=actions,
            is_test=True,
            cascade_regions=req.cascade_regions,
        )
        stored = get_alert_by_id(alert_id)
        if stored:
            triggered_at = stored["triggered_at"]
    except Exception as exc:
        print(f"[alerts] failed to persist simulated alert: {exc}")
```

Update `send_report` to pass `alert_id` to `insert_report_send`:

```python
    try:
        insert_report_send(
            scenario_label=req.report.scenario_label,
            region=req.report.region,
            risk_level=req.report.risk_level,
            recipients=req.recipients,
            sent_at=sent_at,
            alert_id=req.alert_id,
        )
    except Exception as exc:
        print(f"[report] failed to persist send log: {exc}")
```

Add the new endpoint (after `send_report`):

```python
@app.get("/analytics/crisis", response_model=CrisisAnalyticsResponse, tags=["Analytics"])
def get_crisis_analytics_endpoint(days: int = 7):
    """
    Return aggregate crisis analytics for the given time window (default 7 days).
    `days` must be between 1 and 365.
    """
    if days < 1 or days > 365:
        raise HTTPException(status_code=422, detail="days must be between 1 and 365")
    return CrisisAnalyticsResponse(**get_crisis_analytics(days))
```

- [ ] **Step 4: Run all endpoint tests**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/test_main_extra.py -v
```

Expected: All tests PASS (including existing ones).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/test_main_extra.py
git commit -m "feat: add GET /analytics/crisis endpoint, wire cascade_regions and alert_id through"
```

---

## Task 5: Frontend `api.js` Updates

**Files:**
- Modify: `frontend-react/src/services/api.js`

- [ ] **Step 1: Update `simulateAlert` to accept `cascade_regions`**

Replace:
```js
export const simulateAlert = async (region, risk_level, scenario_label) => {
  try {
    const resp = await client.post('/alerts/simulate', { region, risk_level, scenario_label })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Simulation request failed')
  }
}
```

With:
```js
export const simulateAlert = async (region, risk_level, scenario_label, cascade_regions = []) => {
  try {
    const resp = await client.post('/alerts/simulate', { region, risk_level, scenario_label, cascade_regions })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Simulation request failed')
  }
}
```

- [ ] **Step 2: Update `sendReport` to accept `alertId`**

Replace:
```js
export const sendReport = async (recipients, report) => {
  try {
    const resp = await client.post('/report/send', { recipients, report })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Report send failed')
  }
}
```

With:
```js
export const sendReport = async (recipients, report, alertId = null) => {
  try {
    const resp = await client.post('/report/send', { recipients, report, alert_id: alertId ?? null })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Report send failed')
  }
}
```

- [ ] **Step 3: Add `getCrisisAnalytics` with mock fallback**

Append to `api.js` after `sendReport`:

```js
function _mockCrisisAnalytics(days) {
  const now = new Date()
  const incidents = [
    { id: 1, region: 'Tunis', risk_level: 'CRITICAL', scenario_label: 'Grid Overload — Demo',
      cascade_regions: ['Ariana', 'Ben Arous'], triggered_at: new Date(now - 2 * 3600_000).toISOString(),
      report_sent: true, recipients_count: 3 },
    { id: 2, region: 'Sfax', risk_level: 'HIGH', scenario_label: 'Solar Dropout — Demo',
      cascade_regions: ['Mahdia'], triggered_at: new Date(now - 5 * 3600_000).toISOString(),
      report_sent: false, recipients_count: 0 },
    { id: 3, region: 'Bizerte', risk_level: 'ELEVATED', scenario_label: 'Wind Variance — Demo',
      cascade_regions: [], triggered_at: new Date(now - 26 * 3600_000).toISOString(),
      report_sent: false, recipients_count: 0 },
  ]
  return {
    window_days: days,
    total_incidents: incidents.length,
    critical_count: 1,
    high_count: 1,
    most_affected_region: 'Tunis',
    report_dispatch_count: 1,
    cascade_hits_total: 3,
    incidents,
    region_frequency: [
      { region: 'Tunis', primary_count: 1, cascade_count: 0, total: 1 },
      { region: 'Ariana', primary_count: 0, cascade_count: 1, total: 1 },
      { region: 'Ben Arous', primary_count: 0, cascade_count: 1, total: 1 },
      { region: 'Sfax', primary_count: 1, cascade_count: 0, total: 1 },
      { region: 'Mahdia', primary_count: 0, cascade_count: 1, total: 1 },
      { region: 'Bizerte', primary_count: 1, cascade_count: 0, total: 1 },
    ],
    daily_counts: Array.from({ length: Math.min(days, 7) }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (Math.min(days, 7) - 1 - i))
      return { date: d.toISOString().slice(0, 10), count: i === Math.min(days, 7) - 1 ? 2 : Math.floor(Math.random() * 2) }
    }),
  }
}

export const getCrisisAnalytics = async (days = 7) => {
  try {
    const res = await client.get('/analytics/crisis', { params: { days } })
    return { data: res.data, mock: false }
  } catch {
    return { data: _mockCrisisAnalytics(days), mock: true }
  }
}
```

- [ ] **Step 4: Verify the file imports cleanly (no syntax errors)**

```bash
cd C:/Users/moham/NoorGrid/frontend-react && node --input-type=module <<'EOF'
import { simulateAlert, sendReport, getCrisisAnalytics } from './src/services/api.js'
console.log('OK')
EOF
```

If Node ESM has issues with Vite-specific syntax, just confirm no syntax errors by checking Vite doesn't fail on `npm run build` (run in Task 9 anyway).

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/services/api.js
git commit -m "feat: update simulateAlert/sendReport signatures, add getCrisisAnalytics"
```

---

## Task 6: Wire cascade_regions + alertId Through Dashboard and Modal

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`
- Modify: `frontend-react/src/components/Crisis/DiagnosisReportModal.jsx`
- Modify: `frontend-react/src/hooks/useAlerts.js`

- [ ] **Step 1: Update `useAlerts.js` to pass `cascade_regions`**

In `frontend-react/src/hooks/useAlerts.js`, update `triggerSimulation`:

```js
  const triggerSimulation = useCallback(async (region, risk_level, scenario_label, cascade_regions = []) => {
    setLoading(true)
    setError(null)
    try {
      const alert = await simulateAlert(region, risk_level, scenario_label, cascade_regions)
      setAlerts((prev) => [alert, ...prev].slice(0, 10))
      return alert
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])
```

- [ ] **Step 2: Update Dashboard.jsx `onTrigger` handler to pass cascade and capture alertId**

In `frontend-react/src/pages/Dashboard.jsx`, find the `handleAlertTriggered` and related state. Currently `activeAlert` is a plain alert object without `alertId` tracking for the modal. We need to store the alert's `id` so `DiagnosisReportModal` can pass it to `sendReport`.

The alert object returned from `triggerSimulation` already has `.id`. No state change needed — just pass it down. The modal will receive `alertId={activeAlert?.id}`.

Update the `onTrigger` handler inside `CrisisModal`:

```jsx
          onTrigger={async (region, risk_level, scenario_label, cascadeRegions) => {
            const alert = await triggerSimulation(region, risk_level, scenario_label, cascadeRegions)
            handleAlertTriggered(alert, cascadeRegions)
          }}
```

(This is already nearly correct — just ensure `triggerSimulation` receives `cascadeRegions` as 4th arg. Verify Dashboard.jsx line ~978 matches this signature exactly.)

Add `Crisis Intel` nav link to the top bar nav buttons array. Find this block in Dashboard.jsx (around line 553):

```jsx
          <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
            {[
              { label: t('nav.analytics'), path: '/analytics' },
              { label: t('nav.simulation'), path: '/simulation' },
              { label: t('nav.about'), path: '/about' },
            ].map(({ label, path }) => (
```

Replace with:

```jsx
          <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
            {[
              { label: t('nav.analytics'), path: '/analytics' },
              { label: t('nav.simulation'), path: '/simulation' },
              { label: 'Crisis Intel', path: '/crisis-intelligence' },
              { label: t('nav.about'), path: '/about' },
            ].map(({ label, path }) => (
```

Update `DiagnosisReportModal` usage in Dashboard.jsx (around line 997) to pass `alertId`:

```jsx
      {openReport && (
        <DiagnosisReportModal
          report={report}
          alertId={activeAlert?.id ?? null}
          onClose={() => setOpenReport(false)}
          defaultRecipients={defaultRecipients}
        />
      )}
```

- [ ] **Step 3: Update `DiagnosisReportModal.jsx` to accept and use `alertId`**

In `frontend-react/src/components/Crisis/DiagnosisReportModal.jsx`:

Change the component signature:
```jsx
export default function DiagnosisReportModal({ report, onClose, defaultRecipients = [], alertId = null }) {
```

Update `handleSend` to pass `alertId`:
```jsx
  const handleSend = async () => {
    if (!report || recipients.length === 0 || sending) return
    setSending(true)
    try {
      await sendReport(recipients, report, alertId)
      setSent(true)
    } catch {
      setSent(false)
    } finally {
      setSending(false)
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/hooks/useAlerts.js frontend-react/src/pages/Dashboard.jsx frontend-react/src/components/Crisis/DiagnosisReportModal.jsx
git commit -m "feat: thread cascade_regions and alertId through Dashboard and DiagnosisReportModal"
```

---

## Task 7: `useCrisisAnalytics` Hook

**Files:**
- Create: `frontend-react/src/hooks/useCrisisAnalytics.js`

- [ ] **Step 1: Create the hook**

```js
import { useState, useEffect, useCallback } from 'react'
import { getCrisisAnalytics } from '../services/api'

export function useCrisisAnalytics(days = 7) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isMock, setIsMock] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getCrisisAnalytics(days)
      setData(result.data)
      setIsMock(result.mock)
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, isMock, refetch: fetch }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/hooks/useCrisisAnalytics.js
git commit -m "feat: add useCrisisAnalytics hook"
```

---

## Task 8: `CrisisIntelligence.jsx` Page

**Files:**
- Create: `frontend-react/src/pages/CrisisIntelligence.jsx`

- [ ] **Step 1: Create the page with all sub-components**

Create `frontend-react/src/pages/CrisisIntelligence.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCrisisAnalytics } from '../hooks/useCrisisAnalytics'
import { RISK_COLORS } from '../constants/grid'

// ── Helpers ──────────────────────────────────────────────────────────────────

const WINDOWS = [
  { label: '7D',  days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'ALL', days: 3650 },
]

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) }
  catch { return iso.slice(0, 16) }
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, color = '#e2e8f0', sub }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: '#0d1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Incident Row ──────────────────────────────────────────────────────────────
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
        {incident.cascade_regions.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {incident.cascade_regions.map((r) => (
              <span key={r} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8' }}>↳ {r}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>{fmtDate(incident.triggered_at)}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
          background: incident.report_sent ? 'rgba(0,196,106,0.12)' : 'rgba(100,116,139,0.12)',
          color: incident.report_sent ? '#00c46a' : '#475569',
          border: `1px solid ${incident.report_sent ? 'rgba(0,196,106,0.3)' : 'rgba(100,116,139,0.2)'}`,
        }}>
          {incident.report_sent ? `✓ REPORT SENT (${incident.recipients_count})` : 'NO REPORT'}
        </span>
      </div>
    </div>
  )
}

// ── Risk Donut ────────────────────────────────────────────────────────────────
function RiskDonut({ critical, high, elevated }) {
  const total = critical + high + elevated
  if (total === 0) return <div style={{ color: '#475569', fontSize: 12, padding: 12 }}>No incidents in this period</div>

  const R = 54; const cx = 70; const cy = 70; const stroke = 16
  const circ = 2 * Math.PI * R
  const segments = [
    { label: 'CRITICAL', count: critical, color: RISK_COLORS.CRITICAL },
    { label: 'HIGH',     count: high,     color: RISK_COLORS.HIGH },
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
            <circle key={label} cx={cx} cy={cy} r={R} fill="none"
              stroke={color} strokeWidth={stroke}
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

// ── Regional Exposure Bars ────────────────────────────────────────────────────
function RegionBars({ regionFrequency }) {
  const top8 = regionFrequency.slice(0, 8)
  if (top8.length === 0) return <div style={{ color: '#475569', fontSize: 12, padding: 12 }}>No data</div>
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

// ── Daily Trend Sparkline ─────────────────────────────────────────────────────
function DailyTrend({ dailyCounts }) {
  if (dailyCounts.length === 0) return <div style={{ color: '#475569', fontSize: 12, padding: 12 }}>No data</div>
  const max = Math.max(...dailyCounts.map((d) => d.count), 1)
  const barW = Math.max(4, Math.min(24, Math.floor(200 / dailyCounts.length)))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
      {dailyCounts.map((d) => (
        <div key={d.date} title={`${d.date}: ${d.count}`} style={{
          width: barW,
          height: `${Math.max(10, (d.count / max) * 100)}%`,
          background: '#00c46a',
          borderRadius: '2px 2px 0 0',
          opacity: 0.85,
          flexShrink: 0,
        }} />
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CrisisIntelligence() {
  const navigate = useNavigate()
  const [windowDays, setWindowDays] = useState(7)
  const { data, loading, error, isMock, refetch } = useCrisisAnalytics(windowDays)

  const elevated = data
    ? data.total_incidents - data.critical_count - data.high_count
    : 0

  return (
    <div style={{ minHeight: '100vh', background: '#060c18', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid rgba(0,255,136,0.1)', background: 'rgba(10,15,26,0.95)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '0.85rem', color: '#00ff88', letterSpacing: '0.05em' }}>
            ⚡ NoorGrid
          </button>
          {isMock && (
            <span style={{ fontSize: '0.58rem', color: '#ff9500', background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.25)', borderRadius: 3, padding: '1px 6px', fontWeight: 600, letterSpacing: '0.06em' }}>
              SIMULATED DATA
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { label: 'Ops Room', path: '/dashboard' },
            { label: 'Analytics', path: '/analytics' },
            { label: 'Simulation', path: '/simulation' },
            { label: 'About', path: '/about' },
          ].map(({ label, path }) => (
            <button key={path} onClick={() => navigate(path)}
              style={{ background: 'none', border: '1px solid rgba(0,255,136,0.12)', borderRadius: 4, padding: '2px 10px', fontSize: '0.65rem', color: '#8899aa', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
              onMouseEnter={(e) => { e.target.style.color = '#00ff88'; e.target.style.borderColor = 'rgba(0,255,136,0.3)' }}
              onMouseLeave={(e) => { e.target.style.color = '#8899aa'; e.target.style.borderColor = 'rgba(0,255,136,0.12)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: '#00ff88', letterSpacing: '0.08em' }}>CRISIS INTELLIGENCE</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Historical incident log and regional exposure analytics</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map(({ label, days }) => (
            <button key={label} onClick={() => setWindowDays(days)}
              style={{
                border: `1px solid ${windowDays === days ? '#00ff88' : 'rgba(255,255,255,0.1)'}`,
                background: windowDays === days ? 'rgba(0,255,136,0.1)' : 'none',
                color: windowDays === days ? '#00ff88' : '#64748b',
                borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ margin: '12px 20px', padding: '10px 14px', background: 'rgba(255,51,51,0.08)', border: '1px solid rgba(255,51,51,0.25)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#ff3333' }}>Failed to load analytics data.</span>
          <button onClick={refetch} style={{ border: '1px solid rgba(255,51,51,0.4)', background: 'none', color: '#ff3333', borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 20px', flexWrap: 'wrap' }}>
        <MetricCard label="Total Incidents" value={loading ? '…' : (data?.total_incidents ?? 0)} />
        <MetricCard label="Critical" value={loading ? '…' : (data?.critical_count ?? 0)} color={RISK_COLORS.CRITICAL} />
        <MetricCard label="Most Exposed" value={loading ? '…' : (data?.most_affected_region ?? '—')} color="#f59e0b" sub="by primary alerts" />
        <MetricCard label="Cascade Hits" value={loading ? '…' : (data?.cascade_hits_total ?? 0)} color="#a78bfa" sub="secondary regions affected" />
        <MetricCard label="Reports Sent" value={loading ? '…' : (data?.report_dispatch_count ?? 0)} color="#00c46a" />
      </div>

      {/* Body grid */}
      <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Incident log */}
        <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Incident Log
          </div>
          {loading && (
            <div style={{ padding: 20, color: '#475569', fontSize: 12 }}>Loading…</div>
          )}
          {!loading && data?.incidents?.length === 0 && (
            <div style={{ padding: 20, color: '#475569', fontSize: 12, textAlign: 'center' }}>No incidents in this period.</div>
          )}
          {!loading && data?.incidents?.map((inc) => (
            <IncidentRow key={inc.id} incident={inc} />
          ))}
        </div>

        {/* Right panel */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Risk distribution */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Risk Distribution</div>
            {!loading && data && (
              <RiskDonut critical={data.critical_count} high={data.high_count} elevated={elevated} />
            )}
            {loading && <div style={{ fontSize: 12, color: '#475569' }}>Loading…</div>}
          </div>

          {/* Regional exposure */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Regional Exposure</div>
            {!loading && data && <RegionBars regionFrequency={data.region_frequency} />}
            {loading && <div style={{ fontSize: 12, color: '#475569' }}>Loading…</div>}
          </div>

          {/* Daily trend */}
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Daily Trend</div>
            {!loading && data && <DailyTrend dailyCounts={data.daily_counts} />}
            {loading && <div style={{ fontSize: 12, color: '#475569' }}>Loading…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/pages/CrisisIntelligence.jsx
git commit -m "feat: add CrisisIntelligence page with incident log, donut, region bars, trend sparkline"
```

---

## Task 9: Route Registration + Final Build Check

**Files:**
- Modify: `frontend-react/src/App.jsx`

- [ ] **Step 1: Register the route**

In `frontend-react/src/App.jsx`, add the import and route:

```jsx
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Layout/Navbar'
import Landing          from './pages/Landing'
import Dashboard        from './pages/Dashboard'
import Analytics        from './pages/Analytics'
import Simulation       from './pages/Simulation'
import About            from './pages/About'
import CrisisIntelligence from './pages/CrisisIntelligence'

function AppContent() {
  const { pathname } = useLocation()
  const showNav = pathname !== '/dashboard' && pathname !== '/crisis-intelligence'

  return (
    <>
      {showNav && <Navbar />}
      <Routes>
        <Route path="/"                    element={<Landing />}             />
        <Route path="/dashboard"           element={<Dashboard />}           />
        <Route path="/analytics"           element={<Analytics />}           />
        <Route path="/simulation"          element={<Simulation />}          />
        <Route path="/crisis-intelligence" element={<CrisisIntelligence />}  />
        <Route path="/about"               element={<About />}               />
        {/* Fallback */}
        <Route path="*"                    element={<Landing />}             />
      </Routes>
    </>
  )
}
```

- [ ] **Step 2: Run Vite build to confirm no compile errors**

```bash
cd C:/Users/moham/NoorGrid/frontend-react && npm run build 2>&1 | tail -20
```

Expected: `✓ built in` with no errors.

- [ ] **Step 3: Run the full backend test suite**

```bash
cd C:/Users/moham/NoorGrid && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/App.jsx
git commit -m "feat: register /crisis-intelligence route, hide Navbar on intel page"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `alerts_log.cascade_regions` column — Task 1
- [x] `report_send_log.alert_id` column — Task 1
- [x] `insert_alert` updated — Task 1
- [x] `insert_report_send` updated — Task 1
- [x] Analytics models (`RegionFrequencyItem`, `DailyCountItem`, `IncidentItem`, `CrisisAnalyticsResponse`) — Task 2
- [x] `AlertSimulateRequest.cascade_regions` — Task 2
- [x] `ReportSendRequest.alert_id` — Task 2
- [x] `get_crisis_analytics(days)` function — Task 3
- [x] `GET /analytics/crisis` endpoint with `days` validation — Task 4
- [x] `cascade_regions` threaded through `simulate_alert` endpoint — Task 4
- [x] `alert_id` threaded through `send_report` endpoint — Task 4
- [x] `simulateAlert` updated in api.js — Task 5
- [x] `sendReport` updated in api.js — Task 5
- [x] `getCrisisAnalytics` + mock — Task 5
- [x] `useAlerts.triggerSimulation` passes cascade_regions — Task 6
- [x] Dashboard passes cascade_regions on trigger — Task 6
- [x] Dashboard passes `alertId` to `DiagnosisReportModal` — Task 6
- [x] `DiagnosisReportModal` passes `alertId` to `sendReport` — Task 6
- [x] Crisis Intel nav link in Dashboard top bar — Task 6
- [x] `useCrisisAnalytics` hook — Task 7
- [x] `CrisisIntelligence.jsx` page with all panels — Task 8
- [x] Date window filter (7D/30D/90D/ALL) — Task 8
- [x] 5 metric cards — Task 8
- [x] Incident log with cascade chips and report badge — Task 8
- [x] Risk distribution donut — Task 8
- [x] Regional exposure bars (top 8) — Task 8
- [x] Daily trend sparkline — Task 8
- [x] Error banner with retry — Task 8
- [x] Empty state in incident log — Task 8
- [x] SIMULATED DATA badge when mock — Task 8
- [x] `/crisis-intelligence` route in App.jsx — Task 9
- [x] Navbar hidden on crisis-intelligence page — Task 9

**Type consistency:** `cascade_regions: list[str]` in `AlertSimulateRequest` → `json.dumps()` in `insert_alert` → `json.loads()` in `get_crisis_analytics` → `list[str]` in `IncidentItem` → array in JS. Consistent throughout.
