# Summit Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six visible features before the national summit: corrected stats, auto-ingestion, hourly demand curves, and the Crisis Response Simulator (backend + frontend).

**Architecture:** Backend-first — each backend task is self-contained and tested before the next begins. Frontend tasks follow in dependency order. All frontend tasks share one pattern: new components in `frontend-react/src/components/Crisis/`, new hook in `hooks/`, API calls added to `services/api.js`.

**Tech Stack:** FastAPI · SQLAlchemy Core · APScheduler (`AsyncIOScheduler`) · React 18 · Recharts · Leaflet

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `backend/calculations.py` | Modify | `CARBON_INTENSITY` 0.468 → 0.423 |
| `backend/main.py` | Modify | Carbon docstring, RAG prompt stats, APScheduler startup/shutdown, hourly demand curves, `_PREVENTION_ACTIONS`, `/alerts/simulate`, `/alerts/feed` |
| `backend/db.py` | Modify | `alerts_log` table in `init_db`, `insert_alert()`, `get_alerts_feed()` |
| `backend/models.py` | Modify | `probability_low/high` on `HourlyPrediction`, new `AlertSimulateRequest`, `AlertSimulateResponse` |
| `tests/test_calculations.py` | Modify | Add constant-value test |
| `tests/test_db.py` | Modify | Add alerts_log table + helpers tests |
| `tests/test_alerts.py` | Create | Endpoint tests for `/alerts/simulate` and `/alerts/feed` |
| `frontend-react/src/services/api.js` | Modify | Add `simulateAlert`, `getAlertsFeed` |
| `frontend-react/src/hooks/useAlerts.js` | Create | Alert feed polling + simulation trigger |
| `frontend-react/src/components/Crisis/CrisisModal.jsx` | Create | Scenario picker overlay |
| `frontend-react/src/components/Crisis/AlertFeed.jsx` | Create | Sliding alert notification panel |
| `frontend-react/src/pages/Dashboard.jsx` | Modify | Crisis button, `activeAlert` state, `AlertFeed` integration |
| `frontend-react/src/components/Map/TunisiaMap.jsx` | Modify | `activeAlert` prop → marker pulse override |

---

## Task 1: Fix CARBON_INTENSITY constant

**Files:**
- Modify: `backend/calculations.py:12`
- Modify: `tests/test_calculations.py`

- [ ] **Step 1: Add failing constant-value test**

Append to `tests/test_calculations.py`:

```python
class TestConstants:
    def test_carbon_intensity_is_verified_2024_value(self):
        from calculations import CARBON_INTENSITY
        assert CARBON_INTENSITY == 0.423, (
            f"CARBON_INTENSITY should be 0.423 (verified 2024 ONEM figure), got {CARBON_INTENSITY}"
        )
```

- [ ] **Step 2: Run — expect FAIL**

```bash
python -m pytest tests/test_calculations.py::TestConstants -v
```

Expected: `FAILED — AssertionError: CARBON_INTENSITY should be 0.423`

- [ ] **Step 3: Fix the constant**

In `backend/calculations.py`, change line 12:

```python
# Carbon intensity factor (kg CO₂ per kWh)
CARBON_INTENSITY = 0.423  # 423 gCO2eq/kWh — verified 2024 ONEM figure
```

- [ ] **Step 4: Run — expect PASS**

```bash
python -m pytest tests/test_calculations.py -v
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/calculations.py tests/test_calculations.py
git commit -m "fix: update CARBON_INTENSITY to 0.423 — verified 2024 ONEM figure"
```

---

## Task 2: Update RAG system prompt with verified 2025 statistics

**Files:**
- Modify: `backend/main.py` (lines ~121 and ~432–462)

- [ ] **Step 1: Fix the carbon docstring on `/energy/carbon`**

In `backend/main.py`, find:

```python
    Formula: C = (E_consumed − E_renewable) × 0.468
```

Replace with:

```python
    Formula: C = (E_consumed − E_renewable) × 0.423
```

- [ ] **Step 2: Replace the _SYSTEM_PROMPT carbon and independence lines**

Find and replace the two lines in `_SYSTEM_PROMPT`:

```python
▸ Carbon & emissions: 0.468 kg CO₂/kWh grid factor, NDC target 1.80 kg CO₂/cap/day by 2030
▸ Generation mix: 93.7% fossil, 6.0% renewable — gap vs 35% target by 2030
▸ Energy independence: 41% (2024), down from 48% (2023)
```

Replace with:

```python
▸ Carbon & emissions: 0.423 kg CO₂/kWh grid factor (verified 2024 ONEM), NDC target 1.80 kg CO₂/cap/day by 2030
▸ Generation mix: 93.7% fossil, 6.0% renewable — gap vs 35% target by 2030
▸ Energy independence: 39% Q1 2025 (was 41% in 2024, 48% in 2023) — accelerating decline
▸ Energy trade deficit: 2.92 billion TND by end 2025
▸ Total 2025 generation: 20,535 GWh (+6% vs 2024)
▸ Nawara gas field: production down 27% in early 2025 — southern grid stress driver
▸ Algeria gas imports: up 23% in 2025; electricity imports cover 11% of August peak demand
```

- [ ] **Step 3: Verify server starts without error**

```bash
cd backend && uvicorn main:app --port 8001 --timeout-graceful-shutdown 1
```

Press Ctrl+C after seeing `Application startup complete.`

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "fix: update RAG system prompt with verified 2025 energy statistics"
```

---

## Task 3: APScheduler background weather ingestion

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add AsyncIOScheduler import**

At the top of `backend/main.py`, after the existing imports, add:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
```

- [ ] **Step 2: Add module-level scheduler instance**

After the `app = FastAPI(...)` block (after the CORS middleware), add:

```python
_scheduler = AsyncIOScheduler()
```

- [ ] **Step 3: Add the scheduled_ingest coroutine**

Add this function before the `startup_event` handler:

```python
async def scheduled_ingest() -> None:
    """Fetch weather for all 24 regions, compute output_mw, persist to DB."""
    try:
        raw = await fetch_all_weather()
        enriched = []
        for entry in raw:
            cfg = _REGION_CFG.get(entry["region"])
            if cfg:
                computed = _compute_region_output(
                    cfg,
                    entry["wind_speed_ms"],
                    entry["solar_irradiance_wm2"],
                )
                entry["output_mw"] = computed["output_mw"]
            enriched.append(entry)
        count = insert_weather_entries(enriched)
        print(f"[scheduler] ingested {count} weather records")
    except Exception as exc:
        print(f"[scheduler] ingest error: {exc}")
```

- [ ] **Step 4: Change startup_event to async and add scheduler**

Find:

```python
@app.on_event("startup")
def startup_event():
    init_db()
```

Replace with:

```python
@app.on_event("startup")
async def startup_event():
    init_db()
    _scheduler.add_job(scheduled_ingest, "interval", minutes=15, id="weather_ingest")
    _scheduler.start()
    print("[scheduler] weather ingestion scheduled every 15 minutes")


@app.on_event("shutdown")
async def shutdown_event():
    _scheduler.shutdown(wait=False)
    print("[scheduler] stopped")
```

- [ ] **Step 5: Verify server starts and scheduler logs appear**

```bash
cd backend && uvicorn main:app --port 8001
```

Expected in stdout:
```
[scheduler] weather ingestion scheduled every 15 minutes
INFO:     Application startup complete.
```

Press Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "feat: add APScheduler background weather ingestion every 15 minutes"
```

---

## Task 4: Hourly demand curves + confidence interval in blackout prediction

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add confidence interval fields to HourlyPrediction**

In `backend/models.py`, find `HourlyPrediction`:

```python
class HourlyPrediction(BaseModel):
    hour: int = Field(..., description="Forecast hour index (0 = first forecast hour)")
    time_label: str = Field(..., description="Local time label e.g. '14:00'")
    temperature: float = Field(..., description="Air temperature in °C")
    estimated_demand_mw: float
    available_mw: float
    stress_ratio: float
    risk_level: str
    blackout_probability: float = Field(..., description="0–100 %")
    prevention_action: str
```

Replace with:

```python
class HourlyPrediction(BaseModel):
    hour: int = Field(..., description="Forecast hour index (0 = first forecast hour)")
    time_label: str = Field(..., description="Local time label e.g. '14:00'")
    temperature: float = Field(..., description="Air temperature in °C")
    estimated_demand_mw: float
    available_mw: float
    stress_ratio: float
    risk_level: str
    blackout_probability: float = Field(..., description="0–100 %")
    probability_low: float = Field(..., description="Lower bound of ±12% confidence interval")
    probability_high: float = Field(..., description="Upper bound of ±12% confidence interval")
    prevention_action: str
```

- [ ] **Step 2: Add datetime import to main.py**

In `backend/main.py`, add after the existing stdlib imports:

```python
import datetime
```

- [ ] **Step 3: Replace the flat demand estimate with hourly curves**

In `backend/main.py`, find:

```python
        # Cooling demand factor — rises sharply above 25 °C
        cooling_factor = max(0.0, (temp - 25) * 0.08)
        avg_demand = cfg["avg_demand_mw"]
        estimated_demand_mw = avg_demand * (1 + cooling_factor)
```

Replace with:

```python
        # Cooling demand factor — rises sharply above 25 °C
        cooling_factor = max(0.0, (temp - 25) * 0.08)
        avg_demand = cfg["avg_demand_mw"]

        # Hour-of-day peak factor
        hour = int(label[:2]) if label and len(label) >= 2 else 12
        if (8 <= hour <= 12) or (18 <= hour <= 22):
            peak_factor = 1.15   # morning and evening peaks
        elif 1 <= hour <= 5:
            peak_factor = 0.75   # overnight trough
        else:
            peak_factor = 1.0

        # Seasonal factor
        month = datetime.datetime.now().month
        if month in (6, 7, 8, 9):
            seasonal_factor = 1.12   # summer cooling load
        elif month in (12, 1, 2):
            seasonal_factor = 1.08   # winter heating load
        else:
            seasonal_factor = 1.0

        estimated_demand_mw = avg_demand * (1 + cooling_factor) * peak_factor * seasonal_factor
```

- [ ] **Step 4: Add confidence interval to the HourlyPrediction append**

Find:

```python
        predictions.append(HourlyPrediction(
            hour=i,
            time_label=label,
            temperature=round(temp, 1),
            estimated_demand_mw=round(estimated_demand_mw, 2),
            available_mw=round(available_mw, 2),
            stress_ratio=round(stress_ratio, 3),
            risk_level=risk,
            blackout_probability=blackout_probability,
            prevention_action=action,
        ))
```

Replace with:

```python
        predictions.append(HourlyPrediction(
            hour=i,
            time_label=label,
            temperature=round(temp, 1),
            estimated_demand_mw=round(estimated_demand_mw, 2),
            available_mw=round(available_mw, 2),
            stress_ratio=round(stress_ratio, 3),
            risk_level=risk,
            blackout_probability=blackout_probability,
            probability_low=round(max(0.0, blackout_probability - 12.0), 1),
            probability_high=round(min(100.0, blackout_probability + 12.0), 1),
            prevention_action=action,
        ))
```

- [ ] **Step 5: Run existing prediction tests**

```bash
python -m pytest tests/ -v -k "not test_history"
```

Expected: all existing tests PASS (the new fields have default values in JSON, so response parsing tests remain valid)

- [ ] **Step 6: Verify evening hours produce higher demand than midday**

```bash
cd backend && python -c "
import datetime, main
# Simulate hour=20 (evening peak) vs hour=14 (midday)
avg = 178.0  # Bizerte avg_demand_mw
cooling = 0.0
peak_evening = avg * (1 + cooling) * 1.15 * 1.0
peak_midday  = avg * (1 + cooling) * 1.0  * 1.0
print(f'Evening 20:00 demand: {peak_evening:.1f} MW')
print(f'Midday  14:00 demand: {peak_midday:.1f} MW')
assert peak_evening > peak_midday, 'Evening should exceed midday'
print('PASS')
"
```

Expected:
```
Evening 20:00 demand: 204.7 MW
Midday  14:00 demand: 178.0 MW
PASS
```

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/models.py
git commit -m "feat: add hourly demand curves and confidence interval to blackout prediction"
```

---

## Task 5: alerts_log table and DB helpers

**Files:**
- Modify: `backend/db.py`
- Modify: `tests/test_db.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_db.py`:

```python
def test_init_db_creates_alerts_log_table():
    import db
    db.init_db()
    with db.get_engine().connect() as conn:
        from sqlalchemy import text
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='alerts_log'")
        ).fetchone()
    assert result is not None, "alerts_log table should exist after init_db()"


def test_insert_alert_returns_id():
    import db
    db.init_db()
    aid = db.insert_alert(
        region="Gabès",
        risk_level="CRITICAL",
        scenario_label="Nawara Field Failure",
        prevention_actions=["Action 1", "Action 2"],
        is_test=True,
    )
    assert isinstance(aid, int)
    assert aid >= 1


def test_get_alerts_feed_returns_inserted_alert():
    import db
    db.init_db()
    db.insert_alert(
        region="Bizerte",
        risk_level="HIGH",
        scenario_label="Test scenario",
        prevention_actions=["Act A"],
        is_test=True,
    )
    feed = db.get_alerts_feed(limit=10)
    assert len(feed) == 1
    row = feed[0]
    assert row["region"] == "Bizerte"
    assert row["risk_level"] == "HIGH"
    assert row["scenario_label"] == "Test scenario"
    assert row["prevention_actions"] == ["Act A"]
    assert row["is_test"] is True


def test_get_alerts_feed_respects_limit():
    import db
    db.init_db()
    for i in range(5):
        db.insert_alert(
            region="Tunis",
            risk_level="CRITICAL",
            scenario_label=f"Scenario {i}",
            prevention_actions=["Act"],
            is_test=True,
        )
    feed = db.get_alerts_feed(limit=3)
    assert len(feed) == 3
```

- [ ] **Step 2: Run — expect FAIL**

```bash
python -m pytest tests/test_db.py::test_init_db_creates_alerts_log_table tests/test_db.py::test_insert_alert_returns_id -v
```

Expected: `FAILED — AttributeError: module 'db' has no attribute 'insert_alert'`

- [ ] **Step 3: Add alerts_log table to init_db**

In `backend/db.py`, inside the `with engine.begin() as conn:` block of `init_db()`, add after the existing `CREATE INDEX` statement:

```python
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS alerts_log (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                region         TEXT    NOT NULL,
                risk_level     TEXT    NOT NULL,
                scenario_label TEXT    NOT NULL,
                prevention_actions TEXT NOT NULL,
                triggered_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_test        INTEGER NOT NULL DEFAULT 1
            )
        """))
```

- [ ] **Step 4: Add insert_alert and get_alerts_feed functions**

Add after `get_daily_summary` in `backend/db.py`:

```python
def insert_alert(
    region: str,
    risk_level: str,
    scenario_label: str,
    prevention_actions: list[str],
    is_test: bool = True,
) -> int:
    """Insert a simulated or real alert into alerts_log. Returns the new row id."""
    import json
    init_db()
    with get_engine().begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO alerts_log (region, risk_level, scenario_label, prevention_actions, is_test)
                VALUES (:region, :risk_level, :scenario_label, :prevention_actions, :is_test)
            """),
            {
                "region": region,
                "risk_level": risk_level,
                "scenario_label": scenario_label,
                "prevention_actions": json.dumps(prevention_actions),
                "is_test": 1 if is_test else 0,
            },
        )
        return result.lastrowid


def get_alerts_feed(limit: int = 10) -> list[dict]:
    """Return the most recent alerts ordered by triggered_at DESC."""
    import json
    init_db()
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, region, risk_level, scenario_label,
                       prevention_actions, triggered_at, is_test
                FROM alerts_log
                ORDER BY triggered_at DESC
                LIMIT :limit
            """),
            {"limit": limit},
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row._mapping)
        d["prevention_actions"] = json.loads(d["prevention_actions"])
        d["is_test"] = bool(d["is_test"])
        result.append(d)
    return result
```

- [ ] **Step 5: Run — expect PASS**

```bash
python -m pytest tests/test_db.py -v
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/db.py tests/test_db.py
git commit -m "feat: add alerts_log table with insert_alert and get_alerts_feed helpers"
```

---

## Task 6: Alert request/response models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add models**

At the end of `backend/models.py`, add:

```python
# ── Alert simulation models ───────────────────────────────────────────────────

class AlertSimulateRequest(BaseModel):
    region: str = Field(..., description="Governorate name — must exist in _REGION_CFG")
    risk_level: str = Field(..., description="CRITICAL or HIGH")
    scenario_label: str = Field(..., min_length=1, max_length=200)


class AlertSimulateResponse(BaseModel):
    id: int
    region: str
    risk_level: str
    scenario_label: str
    prevention_actions: list[str]
    triggered_at: str
    is_test: bool
```

- [ ] **Step 2: Verify models parse correctly**

```bash
cd backend && python -c "
from models import AlertSimulateRequest, AlertSimulateResponse
req = AlertSimulateRequest(region='Gabès', risk_level='CRITICAL', scenario_label='Test')
print('Request OK:', req)
resp = AlertSimulateResponse(
    id=1, region='Gabès', risk_level='CRITICAL',
    scenario_label='Test', prevention_actions=['Act 1'],
    triggered_at='2026-04-16T14:00:00', is_test=True,
)
print('Response OK:', resp)
"
```

Expected: both print without error.

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add AlertSimulateRequest and AlertSimulateResponse models"
```

---

## Task 7: /alerts/simulate and /alerts/feed endpoints

**Files:**
- Modify: `backend/main.py`
- Create: `tests/test_alerts.py`

- [ ] **Step 1: Write failing endpoint tests**

Create `tests/test_alerts.py`:

```python
"""Tests for /alerts/simulate and /alerts/feed endpoints."""
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test_alerts.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    importlib.reload(db)
    yield
    db._engine = None


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


def test_simulate_valid_region_returns_alert(client):
    resp = client.post("/alerts/simulate", json={
        "region": "Gabès",
        "risk_level": "CRITICAL",
        "scenario_label": "Nawara Field Failure",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["region"] == "Gabès"
    assert data["risk_level"] == "CRITICAL"
    assert data["scenario_label"] == "Nawara Field Failure"
    assert len(data["prevention_actions"]) == 3
    assert data["is_test"] is True
    assert isinstance(data["id"], int)


def test_simulate_unknown_region_returns_422(client):
    resp = client.post("/alerts/simulate", json={
        "region": "Atlantis",
        "risk_level": "CRITICAL",
        "scenario_label": "Test",
    })
    assert resp.status_code == 422


def test_alerts_feed_returns_list(client):
    # Trigger one alert first
    client.post("/alerts/simulate", json={
        "region": "Tunis",
        "risk_level": "HIGH",
        "scenario_label": "Peak Demand",
    })
    resp = client.get("/alerts/feed")
    assert resp.status_code == 200
    feed = resp.json()
    assert isinstance(feed, list)
    assert len(feed) == 1
    assert feed[0]["region"] == "Tunis"


def test_alerts_feed_empty_when_no_alerts(client):
    resp = client.get("/alerts/feed")
    assert resp.status_code == 200
    assert resp.json() == []
```

- [ ] **Step 2: Run — expect FAIL**

```bash
python -m pytest tests/test_alerts.py -v
```

Expected: `FAILED — 404 Not Found` (endpoints don't exist yet)

- [ ] **Step 3: Add _PREVENTION_ACTIONS lookup to main.py**

In `backend/main.py`, add after `_REGION_CFG` (after line ~222, before the `_compute_region_output` function):

```python
# Prevention actions by energy source and risk level
_PREVENTION_ACTIONS: dict[str, dict[str, list[str]]] = {
    "Wind": {
        "CRITICAL": [
            "Activate reserve capacity at nearest thermal plant",
            "Shed non-critical industrial load (20%)",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Monitor wind forecast — potential capacity drop",
            "Pre-position reserve capacity",
            "Notify regional operators",
        ],
    },
    "Solar": {
        "CRITICAL": [
            "Switch affected region to fossil baseline",
            "Reduce cross-region export allocation",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Increase cloud-cover monitoring interval",
            "Prepare fossil baseline switchover",
            "Notify regional operators",
        ],
    },
    "Hydro": {
        "CRITICAL": [
            "Open spillway reserve — maintain minimum head",
            "Reduce downstream water allocation",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Review reservoir levels against seasonal baseline",
            "Coordinate with SONEDE on flow reduction",
            "Notify regional operators",
        ],
    },
    "Mixed": {
        "CRITICAL": [
            "Activate Ghannouch backup generation",
            "Reduce industrial load by 20% in affected zone",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Increase gas supply monitoring",
            "Pre-activate renewable supplement",
            "Notify regional operators",
        ],
    },
}
```

- [ ] **Step 4: Add the updated import line for db helpers**

In `backend/main.py`, find:

```python
from db import get_region_history, init_db, insert_weather_entries
```

Replace with:

```python
from db import get_alerts_feed, get_region_history, init_db, insert_alert, insert_weather_entries
```

- [ ] **Step 5: Add the updated import line for models**

In `backend/main.py`, find `from models import (` and add `AlertSimulateRequest, AlertSimulateResponse,` to the imports list:

```python
from models import (
    AlertSimulateRequest,
    AlertSimulateResponse,
    BlackoutRequest,
    BlackoutResponse,
    CarbonRequest,
    CarbonResponse,
    GridSimulationRequest,
    GridSimulationResponse,
    HistoryRecordRequest,
    HistoryRecordResponse,
    HourlyPrediction,
    HydroRequest,
    PowerResponse,
    RAGRequest,
    RAGResponse,
    RegionHistoryResponse,
    SolarRequest,
    WeatherAllEntry,
    WeatherAllResponse,
    WeatherResponse,
    WindRequest,
)
```

- [ ] **Step 6: Add the two alert endpoints**

Add after the `get_history` endpoint (after line ~322) in `backend/main.py`:

```python
# ── Alert simulation endpoints ────────────────────────────────────────────────

@app.post("/alerts/simulate", response_model=AlertSimulateResponse, tags=["Alerts"])
def simulate_alert(req: AlertSimulateRequest):
    """
    Inject a simulated crisis alert for demo and testing purposes.
    Validates the region, derives prevention actions from its energy source,
    persists to alerts_log, and returns the full alert object.
    """
    cfg = _REGION_CFG.get(req.region)
    if not cfg:
        raise HTTPException(
            status_code=422,
            detail=f"Region '{req.region}' not found. Must be one of the 24 Tunisian governorates.",
        )

    source = cfg["source"]
    level_actions = _PREVENTION_ACTIONS.get(source, {})
    actions = level_actions.get(req.risk_level, [
        "Assess situation and contact STEG Dispatch Center",
        "Review affected region capacity",
        "Alert on-call operations team",
    ])

    alert_id = insert_alert(
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        prevention_actions=actions,
        is_test=True,
    )

    # Retrieve the stored record to get the DB-generated triggered_at timestamp
    feed = get_alerts_feed(limit=1)
    triggered_at = feed[0]["triggered_at"] if feed else ""

    return AlertSimulateResponse(
        id=alert_id,
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        prevention_actions=actions,
        triggered_at=triggered_at,
        is_test=True,
    )


@app.get("/alerts/feed", response_model=list[AlertSimulateResponse], tags=["Alerts"])
def get_alerts(limit: int = 10):
    """Return the most recent alerts (real + simulated), newest first."""
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 50")
    rows = get_alerts_feed(limit=limit)
    return [AlertSimulateResponse(**row) for row in rows]
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
python -m pytest tests/test_alerts.py -v
```

Expected: all 4 tests PASS

- [ ] **Step 8: Full test suite**

```bash
python -m pytest tests/ -v -k "not test_history"
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add backend/main.py tests/test_alerts.py
git commit -m "feat: add /alerts/simulate and /alerts/feed endpoints with source-derived prevention actions"
```

---

## Task 8: Alert API service functions

**Files:**
- Modify: `frontend-react/src/services/api.js`

- [ ] **Step 1: Add simulateAlert and getAlertsFeed**

At the end of `frontend-react/src/services/api.js`, add:

```js
export const simulateAlert = async (region, risk_level, scenario_label) => {
  try {
    const resp = await client.post('/alerts/simulate', { region, risk_level, scenario_label })
    return resp.data
  } catch (err) {
    throw new Error(err.response?.data?.detail || 'Simulation request failed')
  }
}

export const getAlertsFeed = async (limit = 10) => {
  try {
    const resp = await client.get('/alerts/feed', { params: { limit } })
    return resp.data
  } catch (_) {
    return []
  }
}
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd frontend-react && npx eslint src/services/api.js --max-warnings 0
```

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/services/api.js
git commit -m "feat: add simulateAlert and getAlertsFeed to API service"
```

---

## Task 9: useAlerts hook

**Files:**
- Create: `frontend-react/src/hooks/useAlerts.js`

- [ ] **Step 1: Create the hook**

Create `frontend-react/src/hooks/useAlerts.js`:

```js
import { useState, useEffect, useCallback } from 'react'
import { simulateAlert, getAlertsFeed } from '../services/api'

export function useAlerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchFeed = useCallback(async () => {
    const feed = await getAlertsFeed(10)
    setAlerts(feed)
  }, [])

  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, 15_000)
    return () => clearInterval(interval)
  }, [fetchFeed])

  const triggerSimulation = useCallback(async (region, risk_level, scenario_label) => {
    setLoading(true)
    setError(null)
    try {
      const alert = await simulateAlert(region, risk_level, scenario_label)
      setAlerts((prev) => [alert, ...prev].slice(0, 10))
      return alert
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { alerts, loading, error, triggerSimulation }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/hooks/useAlerts.js
git commit -m "feat: add useAlerts hook with feed polling and simulation trigger"
```

---

## Task 10: CrisisModal component

**Files:**
- Create: `frontend-react/src/components/Crisis/CrisisModal.jsx`

- [ ] **Step 1: Create the component**

Create `frontend-react/src/components/Crisis/CrisisModal.jsx`:

```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/components/Crisis/CrisisModal.jsx
git commit -m "feat: add CrisisModal scenario picker overlay"
```

---

## Task 11: AlertFeed component

**Files:**
- Create: `frontend-react/src/components/Crisis/AlertFeed.jsx`

- [ ] **Step 1: Create the component**

Create `frontend-react/src/components/Crisis/AlertFeed.jsx`:

```jsx
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
            {alert.risk_level} — {alert.region}
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
        ACKNOWLEDGE
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
        ALERT FEED
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/components/Crisis/AlertFeed.jsx
git commit -m "feat: add AlertFeed sliding notification panel"
```

---

## Task 12: Wire Dashboard.jsx

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`

- [ ] **Step 1: Add imports at the top of Dashboard.jsx**

After the existing import block, add:

```js
import { useAlerts } from '../hooks/useAlerts'
import CrisisModal from '../components/Crisis/CrisisModal'
import AlertFeed from '../components/Crisis/AlertFeed'
```

- [ ] **Step 2: Add state and hook inside the Dashboard component**

Inside the `export default function Dashboard()` body, after the existing `useState` / hook calls, add:

```js
const { alerts, loading: alertLoading, error: alertError, triggerSimulation } = useAlerts()
const [activeAlert, setActiveAlert] = useState(null)
const [showCrisisModal, setShowCrisisModal] = useState(false)

const handleAlertTriggered = (alert) => {
  setActiveAlert(alert)
}

const handleAcknowledge = () => {
  setActiveAlert(null)
}
```

- [ ] **Step 3: Add crisis button to the top bar**

In the top bar, find the existing nav buttons block:

```jsx
          <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
            {[
              { label: 'Analytics', path: '/analytics' },
              { label: 'Simulation', path: '/simulation' },
              { label: 'About', path: '/about' },
            ].map(({ label, path }) => (
```

Add the crisis button immediately BEFORE that block (still inside the right-side flex container):

```jsx
          <button
            onClick={() => setShowCrisisModal(true)}
            style={{
              background: activeAlert ? 'rgba(255,51,51,0.15)' : 'rgba(255,51,51,0.06)',
              border: `1px solid ${activeAlert ? 'rgba(255,51,51,0.6)' : 'rgba(255,51,51,0.25)'}`,
              borderRadius: '4px',
              padding: '2px 10px',
              fontSize: '0.65rem',
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#ff3333',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              animation: activeAlert ? 'none' : 'undefined',
            }}
          >
            ⚡ SIMULATE CRISIS
          </button>
```

- [ ] **Step 4: Pass activeAlert to TunisiaMap**

Find:

```jsx
              <TunisiaMap
                weatherMap={weatherMap}
                selectedGov={selectedGov}
                onSelectGov={handleSelectGov}
                liveRiskMap={liveRiskMap}
                style={{ height: '100%', width: '100%' }}
              />
```

Replace with:

```jsx
              <TunisiaMap
                weatherMap={weatherMap}
                selectedGov={selectedGov}
                onSelectGov={handleSelectGov}
                liveRiskMap={liveRiskMap}
                activeAlert={activeAlert}
                style={{ height: '100%', width: '100%' }}
              />
```

- [ ] **Step 5: Render AlertFeed and CrisisModal**

Find the closing `</div>` of the `ops-room` div (the outermost return div in Dashboard). Add before it:

```jsx
      {/* Crisis modal */}
      {showCrisisModal && (
        <CrisisModal
          onClose={() => setShowCrisisModal(false)}
          onTrigger={async (region, risk_level, scenario_label) => {
            const alert = await triggerSimulation(region, risk_level, scenario_label)
            handleAlertTriggered(alert)
          }}
          loading={alertLoading}
          error={alertError}
        />
      )}

      {/* Alert feed — positioned absolute inside ops-room */}
      <AlertFeed
        activeAlert={activeAlert}
        historicalAlerts={alerts.filter((a) => a.id !== activeAlert?.id)}
        onAcknowledge={handleAcknowledge}
      />
```

- [ ] **Step 6: Ensure ops-room has position: relative**

The `.ops-room` rule in `frontend-react/src/index.css` (line 279) is currently:

```css
.ops-room {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
```

Add `position: relative;` so `AlertFeed`'s `position: absolute` anchors inside the ops room:

```css
.ops-room {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
```

- [ ] **Step 7: Start dev server and manual test**

```bash
cd frontend-react && npm run dev
```

- Open `http://localhost:5173`
- Navigate to Dashboard
- Click `⚡ SIMULATE CRISIS`
- Select "Nawara Field Failure"
- Click `TRIGGER CRISIS`
- Expected: modal closes, AlertFeed slides in from right, Gabès marker is highlighted

- [ ] **Step 8: Commit**

```bash
git add frontend-react/src/pages/Dashboard.jsx
git commit -m "feat: wire crisis simulator into Dashboard — button, modal, alert feed"
```

---

## Task 13: Update TunisiaMap for activeAlert pulse

**Files:**
- Modify: `frontend-react/src/components/Map/TunisiaMap.jsx`

- [ ] **Step 1: Add activeAlert prop to the component signature**

Find:

```js
export default function TunisiaMap({ weatherMap = {}, selectedGov, onSelectGov, liveRiskMap = {}, style = {} }) {
```

Replace with:

```js
export default function TunisiaMap({ weatherMap = {}, selectedGov, onSelectGov, liveRiskMap = {}, activeAlert = null, style = {} }) {
```

- [ ] **Step 2: Override risk for the alerted region in the marker effect**

Find the marker creation line inside the second `useEffect`:

```js
      const risk   = gov.live_risk || liveRiskMap[gov.name] || gov.mock_risk
```

Replace with:

```js
      const risk = (activeAlert?.region === gov.name)
        ? activeAlert.risk_level
        : (gov.live_risk || liveRiskMap[gov.name] || gov.mock_risk)
```

- [ ] **Step 3: Add activeAlert to the effect's dependency array**

Find:

```js
  }, [weatherMap, onSelectGov, liveRiskMap])
```

Replace with:

```js
  }, [weatherMap, onSelectGov, liveRiskMap, activeAlert])
```

- [ ] **Step 4: Manual test**

With dev server running (`npm run dev`):

1. Trigger "Nawara Field Failure" via the crisis modal
2. Find Gabès on the map — its marker should now pulse red (CRITICAL)
3. Click `[ACKNOWLEDGE]` in the AlertFeed — Gabès marker reverts to its live risk color

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/components/Map/TunisiaMap.jsx
git commit -m "feat: TunisiaMap accepts activeAlert prop — overrides region marker to simulated risk level"
```

---

---

## Task 14: French localisation (Priority 3 — attempt before summit, cut if time runs out)

**Files:**
- Create: `frontend-react/src/locales/en.json`
- Create: `frontend-react/src/locales/fr.json`
- Create: `frontend-react/src/i18n.js`
- Modify: `frontend-react/src/main.jsx`
- Modify: `frontend-react/src/pages/Dashboard.jsx`
- Modify: `frontend-react/src/components/Map/TunisiaMap.jsx` (popup risk labels)

- [ ] **Step 1: Install i18n packages**

```bash
cd frontend-react && npm install react-i18next i18next
```

- [ ] **Step 2: Create i18n config**

Create `frontend-react/src/i18n.js`:

```js
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: localStorage.getItem('noorgrid_lang') || 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (lang) => {
  localStorage.setItem('noorgrid_lang', lang)
})

export default i18n
```

- [ ] **Step 3: Create en.json**

Create `frontend-react/src/locales/en.json`:

```json
{
  "nav": {
    "analytics": "Analytics",
    "simulation": "Simulation",
    "about": "About"
  },
  "status": {
    "live": "LIVE",
    "simulated": "SIMULATED DATA",
    "backend": "Backend",
    "weatherApi": "Weather API",
    "predictionEngine": "Prediction Engine"
  },
  "risk": {
    "CRITICAL": "CRITICAL",
    "HIGH": "HIGH",
    "ELEVATED": "ELEVATED",
    "NOMINAL": "NOMINAL"
  },
  "dashboard": {
    "gridOverview": "Grid Overview",
    "activeAnomalies": "Active Anomalies",
    "nationalCarbon": "National Carbon Index",
    "totalOutput": "Total Output",
    "criticalRegions": "Critical Regions",
    "highRiskRegions": "High Risk"
  },
  "crisis": {
    "simulateButton": "SIMULATE CRISIS",
    "modalTitle": "CRISIS SCENARIO — SELECT EVENT",
    "triggerButton": "TRIGGER CRISIS",
    "triggering": "TRIGGERING...",
    "alertFeedTitle": "ALERT FEED",
    "acknowledge": "ACKNOWLEDGE",
    "custom": "CUSTOM"
  }
}
```

- [ ] **Step 4: Create fr.json**

Create `frontend-react/src/locales/fr.json`:

```json
{
  "nav": {
    "analytics": "Analytique",
    "simulation": "Simulation",
    "about": "À propos"
  },
  "status": {
    "live": "EN DIRECT",
    "simulated": "DONNÉES SIMULÉES",
    "backend": "Serveur",
    "weatherApi": "API Météo",
    "predictionEngine": "Moteur de prédiction"
  },
  "risk": {
    "CRITICAL": "CRITIQUE",
    "HIGH": "ÉLEVÉ",
    "ELEVATED": "MODÉRÉ",
    "NOMINAL": "NOMINAL"
  },
  "dashboard": {
    "gridOverview": "Vue du réseau",
    "activeAnomalies": "Anomalies actives",
    "nationalCarbon": "Indice carbone national",
    "totalOutput": "Production totale",
    "criticalRegions": "Régions critiques",
    "highRiskRegions": "Risque élevé"
  },
  "crisis": {
    "simulateButton": "SIMULER CRISE",
    "modalTitle": "SCÉNARIO DE CRISE — SÉLECTIONNER",
    "triggerButton": "DÉCLENCHER",
    "triggering": "DÉCLENCHEMENT...",
    "alertFeedTitle": "ALERTES",
    "acknowledge": "ACQUITTER",
    "custom": "PERSONNALISÉ"
  }
}
```

- [ ] **Step 5: Import i18n in main.jsx**

In `frontend-react/src/main.jsx`, add at the top (before other imports):

```js
import './i18n'
```

- [ ] **Step 6: Add useTranslation hook and language toggle to Dashboard**

In `frontend-react/src/pages/Dashboard.jsx`:

Add import:
```js
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
```

Add inside the `Dashboard` component body:
```js
const { t } = useTranslation()
```

Add language toggle button in the top bar, after the crisis button, before the nav buttons block:
```jsx
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'fr' : 'en')}
            style={{
              background: 'none',
              border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.65rem',
              color: '#00ff88',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            {i18n.language === 'en' ? 'FR' : 'EN'}
          </button>
```

- [ ] **Step 7: Replace key hardcoded strings in Dashboard with t() calls**

Replace the following specific strings (use Find in your editor):

| Hardcoded string | Replace with |
|-----------------|-------------|
| `'LIVE'` (the status label span) | `{t('status.live')}` |
| `'SIMULATED DATA'` | `{t('status.simulated')}` |
| `'Backend'` | `{t('status.backend')}` |
| `'Weather API'` | `{t('status.weatherApi')}` |
| `'Prediction Engine'` | `{t('status.predictionEngine')}` |
| `'Analytics'` (nav button label) | `{t('nav.analytics')}` |
| `'Simulation'` (nav button label) | `{t('nav.simulation')}` |
| `'About'` (nav button label) | `{t('nav.about')}` |

- [ ] **Step 8: Replace risk labels in CrisisModal and AlertFeed**

In `CrisisModal.jsx` and `AlertFeed.jsx`, wrap all direct risk level strings with `t()`.

Add `import { useTranslation } from 'react-i18next'` to each file.

In `CrisisModal.jsx`, add `const { t } = useTranslation()` inside the component and change:
```js
// In each SCENARIO card:
{s.risk_level === 'CRITICAL' ? t('risk.CRITICAL') : t('risk.HIGH')} — {s.region}
```

In `AlertFeed.jsx`, change the header in `ActiveAlertCard`:
```jsx
<span ...>{t(`risk.${alert.risk_level}`)} — {alert.region}</span>
```

And the button:
```jsx
{t('crisis.acknowledge')}
```

And the feed title:
```jsx
{t('crisis.alertFeedTitle')}
```

- [ ] **Step 9: Manual test**

With dev server running:

1. Click the `FR` toggle button in the Dashboard top bar
2. Verify: nav buttons show "Analytique", "Simulation", "À propos"
3. Verify: LIVE badge shows "EN DIRECT"
4. Trigger a crisis — AlertFeed shows "ALERTES" and "ACQUITTER"
5. Click `EN` to switch back — everything reverts

- [ ] **Step 10: Commit**

```bash
git add frontend-react/src/i18n.js frontend-react/src/locales/ frontend-react/src/main.jsx frontend-react/src/pages/Dashboard.jsx frontend-react/src/components/Crisis/
git commit -m "feat: add French localisation with EN/FR toggle — i18next, key Dashboard strings"
```

---

## Self-Review Checklist

Before calling the sprint done, verify:

- [ ] `CARBON_INTENSITY` is 0.423 in `calculations.py` and all docstrings/prompts
- [ ] RAG chatbot answers correctly on: trade deficit 2.92B TND, energy independence 39%, Nawara −27%
- [ ] Backend starts cleanly and logs `[scheduler] weather ingestion scheduled every 15 minutes`
- [ ] After 15 minutes idle, new rows appear in `weather_history` without any client request
- [ ] `POST /predict/blackout` with `region=Bizerte` — hour 20:00 shows higher `estimated_demand_mw` than hour 14:00
- [ ] `probability_low` and `probability_high` appear in prediction response JSON
- [ ] `POST /alerts/simulate` with region `"Atlantis"` returns 422
- [ ] `POST /alerts/simulate` with region `"Gabès"` returns 3 Solar-source prevention actions
- [ ] `GET /alerts/feed` returns the inserted alert
- [ ] `⚡ SIMULATE CRISIS` button visible in Dashboard top bar
- [ ] Selecting "Nawara Field Failure" and triggering: Gabès map marker pulses red
- [ ] AlertFeed slides in with correct scenario label and 3 prevention actions
- [ ] `[ACKNOWLEDGE]` clears the AlertFeed and reverts the Gabès marker
- [ ] Full backend test suite passes: `python -m pytest tests/ -v`
