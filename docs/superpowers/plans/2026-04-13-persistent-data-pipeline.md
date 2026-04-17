# Phase 1.2 — Persistent Real-Time Data Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the request-triggered SQLite write path with a scheduled background ingestion job, add WAL mode + composite index for query performance, extend the schema with `output_mw`, add a `/weather/history/summary` aggregation endpoint, and wire up Alembic + SQLAlchemy so the database can switch from SQLite (local dev) to PostgreSQL (production) via a single `DATABASE_URL` env var.

**Architecture:** `db.py` is refactored to use SQLAlchemy Core as the unified connection layer for both SQLite and PostgreSQL — this gives Alembic compatibility and eliminates placeholder-style differences between drivers. `main.py` gains an `AsyncIOScheduler` (APScheduler) job that calls `fetch_all_weather()` + `_compute_region_output()` every 15 minutes and stores `output_mw` alongside raw weather fields. Alembic lives in `alembic/` at the repo root and its `env.py` imports `get_engine()` from `backend/db.py`.

**Tech Stack:** `apscheduler[asyncio]>=3.10`, `sqlalchemy>=2.0`, `psycopg2-binary>=2.9`, `alembic>=1.13`, Python 3.11, FastAPI, pytest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `requirements.txt` | Modify | Add apscheduler, sqlalchemy, psycopg2-binary, alembic |
| `backend/db.py` | Rewrite | SQLAlchemy engine, WAL mode, composite index, `output_mw` column, `get_daily_summary()` |
| `backend/models.py` | Modify | Add `DailySummaryEntry`, `DailySummaryResponse` |
| `backend/main.py` | Modify | AsyncIOScheduler startup/shutdown, `_ingest_weather()` job, `/weather/history/summary` endpoint, update `/weather/all` to store `output_mw` |
| `.env.example` | Modify | Document `DATABASE_URL` |
| `alembic.ini` | Create | Alembic config (script_location = alembic) |
| `alembic/env.py` | Create | Wire `get_engine()` into Alembic migration runner |
| `alembic/versions/0001_initial_schema.py` | Create | Initial migration: full `weather_history` schema with `output_mw` |
| `tests/test_db.py` | Create | WAL mode, index, insert with `output_mw`, `get_daily_summary()` |
| `tests/test_scheduler.py` | Create | Scheduler job fires, records inserted with `output_mw` |
| `tests/test_summary_endpoint.py` | Create | `GET /weather/history/summary` response shape and aggregates |
| `tests/test_history.py` | Modify | Update fixture to reset SQLAlchemy engine cache |

---

## Task 1: Add new dependencies to requirements.txt

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add packages**

Open `requirements.txt` and add these lines under the `# Backend` section, after `python-dotenv==1.0.1`:

```
apscheduler[asyncio]>=3.10
sqlalchemy>=2.0
psycopg2-binary>=2.9
alembic>=1.13
```

- [ ] **Step 2: Install**

```bash
cd C:/Users/moham/NoorGrid
pip install "apscheduler[asyncio]>=3.10" "sqlalchemy>=2.0" "psycopg2-binary>=2.9" "alembic>=1.13"
```

Expected: all four packages install without conflict.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: add apscheduler, sqlalchemy, psycopg2-binary, alembic deps"
```

---

## Task 2: Rewrite backend/db.py with SQLAlchemy Core

**Files:**
- Modify: `backend/db.py`

This task replaces the raw `sqlite3` driver with SQLAlchemy Core. The public API (`init_db`, `insert_weather_entries`, `get_region_history`) is preserved so no other files need changing yet. Three additions: WAL mode for SQLite connections, a composite index, and an `output_mw` column.

- [ ] **Step 1: Write the failing tests first**

Create `tests/test_db.py`:

```python
"""Tests for db.py SQLAlchemy refactor."""
import importlib
import pytest

# Reset engine cache between tests so NOORGRID_DB_PATH is respected
@pytest.fixture(autouse=True)
def reset_engine(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    importlib.reload(db)
    yield
    db._engine = None


def test_init_db_creates_table():
    import db
    db.init_db()
    with db.get_engine().connect() as conn:
        from sqlalchemy import text
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='weather_history'")
        ).fetchone()
    assert result is not None


def test_init_db_creates_index():
    import db
    db.init_db()
    with db.get_engine().connect() as conn:
        from sqlalchemy import text
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_region_time'")
        ).fetchone()
    assert result is not None


def test_wal_mode_enabled():
    import db
    db.init_db()
    with db.get_engine().connect() as conn:
        from sqlalchemy import text
        mode = conn.execute(text("PRAGMA journal_mode")).scalar()
    assert mode == "wal"


def test_insert_and_retrieve_with_output_mw():
    import db
    db.init_db()
    entries = [{
        "region": "Bizerte",
        "latitude": 37.27,
        "longitude": 9.87,
        "wind_speed_ms": 8.2,
        "solar_irradiance_wm2": 420.0,
        "output_mw": 55.3,
    }]
    count = db.insert_weather_entries(entries)
    assert count == 1

    rows = db.get_region_history("Bizerte", days=7)
    assert len(rows) == 1
    assert rows[0]["region"] == "Bizerte"
    assert rows[0]["output_mw"] == pytest.approx(55.3)


def test_insert_without_output_mw_defaults_to_zero():
    import db
    db.init_db()
    entries = [{
        "region": "Nabeul",
        "latitude": 36.45,
        "longitude": 10.73,
        "wind_speed_ms": 6.5,
        "solar_irradiance_wm2": 580.0,
        # no output_mw key
    }]
    db.insert_weather_entries(entries)
    rows = db.get_region_history("Nabeul", days=1)
    assert rows[0]["output_mw"] == 0.0


def test_get_daily_summary_aggregates():
    import db
    db.init_db()
    entries = [
        {
            "region": "Bizerte",
            "latitude": 37.27, "longitude": 9.87,
            "wind_speed_ms": 6.0, "solar_irradiance_wm2": 400.0, "output_mw": 40.0,
        },
        {
            "region": "Bizerte",
            "latitude": 37.27, "longitude": 9.87,
            "wind_speed_ms": 10.0, "solar_irradiance_wm2": 500.0, "output_mw": 80.0,
        },
    ]
    db.insert_weather_entries(entries)

    rows = db.get_daily_summary(days=1)
    assert len(rows) == 1
    row = rows[0]
    assert row["region"] == "Bizerte"
    assert row["min_wind"] == pytest.approx(6.0)
    assert row["max_wind"] == pytest.approx(10.0)
    assert row["avg_wind"] == pytest.approx(8.0)
    assert row["avg_output_mw"] == pytest.approx(60.0)
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd C:/Users/moham/NoorGrid
python -m pytest tests/test_db.py -v
```

Expected: `FAILED` — `db` has no `get_engine`, `_engine`, or `get_daily_summary`.

- [ ] **Step 3: Rewrite backend/db.py**

Replace the entire file:

```python
"""
SQLite / PostgreSQL storage helpers for NoorGrid — SQLAlchemy Core.

Connection driver is selected by DATABASE_URL env var:
  - Not set  → SQLite at NOORGRID_DB_PATH (default: data/noorgrid.db)
  - Set       → PostgreSQL via psycopg2 (use Alembic to initialise schema)
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine

_DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "noorgrid.db"

# Module-level engine cache — reset to None in tests via:  db._engine = None
_engine: Engine | None = None


def get_db_path() -> Path:
    configured = os.getenv("NOORGRID_DB_PATH")
    if configured:
        return Path(configured).expanduser().resolve()
    return _DEFAULT_DB_PATH


def get_engine() -> Engine:
    global _engine
    if _engine is not None:
        return _engine

    database_url = os.getenv("DATABASE_URL")
    if database_url:
        _engine = create_engine(database_url)
    else:
        db_path = get_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
        # Enable WAL mode for every new SQLite connection
        @event.listens_for(_engine, "connect")
        def _set_wal(dbapi_conn, _record):
            dbapi_conn.execute("PRAGMA journal_mode=WAL")

    return _engine


def init_db() -> None:
    """Create schema if using SQLite. PostgreSQL schema is managed by Alembic."""
    engine = get_engine()
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS weather_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                region      TEXT    NOT NULL,
                latitude    REAL    NOT NULL,
                longitude   REAL    NOT NULL,
                wind_speed_ms       REAL NOT NULL,
                solar_irradiance_wm2 REAL NOT NULL,
                output_mw   REAL    NOT NULL DEFAULT 0.0,
                recorded_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_region_time
            ON weather_history(region, recorded_at)
        """))


def insert_weather_entries(entries: list[dict]) -> int:
    """Insert weather records. Accepts optional 'output_mw' per entry (defaults to 0.0)."""
    init_db()
    if not entries:
        return 0

    payload = [
        {
            "region": entry["region"],
            "lat":    float(entry["latitude"]),
            "lon":    float(entry["longitude"]),
            "wind":   float(entry["wind_speed_ms"]),
            "irr":    float(entry["solar_irradiance_wm2"]),
            "output_mw": float(entry.get("output_mw", 0.0)),
        }
        for entry in entries
    ]
    with get_engine().begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO weather_history
                    (region, latitude, longitude, wind_speed_ms, solar_irradiance_wm2, output_mw)
                VALUES
                    (:region, :lat, :lon, :wind, :irr, :output_mw)
            """),
            payload,
        )
    return result.rowcount


def get_region_history(region: str, days: int) -> list[dict]:
    init_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT region, latitude, longitude,
                       wind_speed_ms, solar_irradiance_wm2, output_mw, recorded_at
                FROM weather_history
                WHERE region = :region AND recorded_at >= :cutoff
                ORDER BY recorded_at DESC
            """),
            {"region": region, "cutoff": cutoff},
        ).fetchall()
    return [dict(row._mapping) for row in rows]


def get_daily_summary(days: int = 30) -> list[dict]:
    """
    Return per-region daily aggregates for the last `days` days.
    Each row: {region, date, min_wind, max_wind, avg_wind,
               min_irradiance, max_irradiance, avg_output_mw}
    """
    init_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT
                    region,
                    date(recorded_at)                     AS date,
                    MIN(wind_speed_ms)                    AS min_wind,
                    MAX(wind_speed_ms)                    AS max_wind,
                    AVG(wind_speed_ms)                    AS avg_wind,
                    MIN(solar_irradiance_wm2)             AS min_irradiance,
                    MAX(solar_irradiance_wm2)             AS max_irradiance,
                    AVG(output_mw)                        AS avg_output_mw
                FROM weather_history
                WHERE recorded_at >= :cutoff
                GROUP BY region, date(recorded_at)
                ORDER BY region, date(recorded_at) DESC
            """),
            {"cutoff": cutoff},
        ).fetchall()
    return [dict(row._mapping) for row in rows]
```

- [ ] **Step 4: Run tests — expect pass**

```bash
python -m pytest tests/test_db.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 5: Verify existing tests still pass**

```bash
python -m pytest tests/test_history.py -v
```

Expected: both existing history tests pass. If they fail with "engine not reset", go to Task 3 first, then return here.

- [ ] **Step 6: Commit**

```bash
git add backend/db.py tests/test_db.py
git commit -m "refactor: rewrite db.py with SQLAlchemy Core — WAL mode, index, output_mw column"
```

---

## Task 3: Fix test_history.py for SQLAlchemy engine cache

**Files:**
- Modify: `tests/test_history.py`

The existing `test_history.py` tests use `monkeypatch.setenv("NOORGRID_DB_PATH")` + `importlib.reload(main)`. After the db.py refactor, the SQLAlchemy `_engine` cache must also be reset so `get_engine()` picks up the new path.

- [ ] **Step 1: Run test_history.py to observe failure (if any)**

```bash
python -m pytest tests/test_history.py -v
```

If both tests pass, skip to Step 3. If they fail with stale engine errors, apply Step 2.

- [ ] **Step 2: Update test_history.py to reset engine**

Replace the entire file:

```python
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test_noorgrid.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None          # reset SQLAlchemy engine cache
    import main
    importlib.reload(main)
    return TestClient(main.app)


def test_history_record_and_query(client):
    payload = {
        "data": [
            {
                "region": "Bizerte",
                "latitude": 37.2744,
                "longitude": 9.8739,
                "wind_speed_ms": 6.2,
                "solar_irradiance_wm2": 540.1,
            }
        ]
    }
    record_resp = client.post("/history/record", json=payload)
    assert record_resp.status_code == 200
    assert record_resp.json()["inserted"] == 1

    query_resp = client.get("/history/Bizerte", params={"days": 7})
    assert query_resp.status_code == 200

    body = query_resp.json()
    assert body["region"] == "Bizerte"
    assert body["days"] == 7
    assert len(body["records"]) >= 1
    assert body["records"][0]["region"] == "Bizerte"


def test_history_days_validation(client):
    resp = client.get("/history/Bizerte", params={"days": 0})
    assert resp.status_code == 422
    assert "days must be between 1 and 365" in resp.json()["detail"]
```

- [ ] **Step 3: Run both test files**

```bash
python -m pytest tests/test_history.py tests/test_db.py -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test_history.py
git commit -m "test: update test_history fixture to reset SQLAlchemy engine cache"
```

---

## Task 4: Add DailySummaryEntry and DailySummaryResponse to models.py

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Write the failing test**

Add a new file `tests/test_models_summary.py`:

```python
from models import DailySummaryEntry, DailySummaryResponse


def test_daily_summary_entry_fields():
    entry = DailySummaryEntry(
        region="Bizerte",
        date="2026-04-13",
        min_wind=4.0,
        max_wind=10.0,
        avg_wind=7.0,
        min_irradiance=300.0,
        max_irradiance=700.0,
        avg_output_mw=55.3,
    )
    assert entry.region == "Bizerte"
    assert entry.avg_output_mw == 55.3


def test_daily_summary_response_wraps_list():
    entries = [
        DailySummaryEntry(
            region="Bizerte", date="2026-04-13",
            min_wind=4.0, max_wind=10.0, avg_wind=7.0,
            min_irradiance=300.0, max_irradiance=700.0, avg_output_mw=55.3,
        )
    ]
    resp = DailySummaryResponse(data=entries)
    assert len(resp.data) == 1
```

- [ ] **Step 2: Run — expect failure**

```bash
python -m pytest tests/test_models_summary.py -v
```

Expected: `ImportError` — `DailySummaryEntry` not defined.

- [ ] **Step 3: Add models to backend/models.py**

Append these two classes at the end of `backend/models.py` (after the `WeatherAllResponse` class):

```python
# ── Daily summary models ───────────────────────────────────────────────────────

class DailySummaryEntry(BaseModel):
    region:          str
    date:            str   = Field(..., description="Date in YYYY-MM-DD format")
    min_wind:        float = Field(..., description="Min wind speed m/s")
    max_wind:        float = Field(..., description="Max wind speed m/s")
    avg_wind:        float = Field(..., description="Average wind speed m/s")
    min_irradiance:  float = Field(..., description="Min solar irradiance W/m²")
    max_irradiance:  float = Field(..., description="Max solar irradiance W/m²")
    avg_output_mw:   float = Field(..., description="Average computed output MW")


class DailySummaryResponse(BaseModel):
    data: list[DailySummaryEntry]
```

- [ ] **Step 4: Run — expect pass**

```bash
python -m pytest tests/test_models_summary.py -v
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py tests/test_models_summary.py
git commit -m "feat: add DailySummaryEntry and DailySummaryResponse models"
```

---

## Task 5: Add APScheduler background ingestion to main.py

**Files:**
- Modify: `backend/main.py`

The scheduler calls `_ingest_weather()` every 15 minutes. `_ingest_weather()` fetches raw weather, computes `output_mw` per region using the existing `_compute_region_output()`, and inserts everything with `insert_weather_entries()`. Uses `AsyncIOScheduler` so the async `fetch_all_weather()` call works naturally inside FastAPI's event loop.

- [ ] **Step 1: Write the failing test**

Create `tests/test_scheduler.py`:

```python
"""
Test that the scheduler ingest function inserts records with output_mw populated.
We test _ingest_weather() directly (unit test) — no need to spin up APScheduler.
"""
import importlib
import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
def fresh_main(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "scheduler_test.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    import main
    importlib.reload(main)
    return main


def test_ingest_weather_inserts_records_with_output_mw(fresh_main, tmp_path):
    import db
    from main import _REGION_CFG

    mock_raw = [
        {
            "region": name,
            "latitude": cfg["lat"],
            "longitude": cfg["lon"],
            "wind_speed_ms": 6.0,
            "solar_irradiance_wm2": 500.0,
        }
        for name, cfg in list(_REGION_CFG.items())[:3]
    ]

    import asyncio

    async def run():
        with patch("main.fetch_all_weather", new=AsyncMock(return_value=mock_raw)):
            await fresh_main._ingest_weather()

    asyncio.run(run())

    rows = db.get_region_history(mock_raw[0]["region"], days=1)
    assert len(rows) == 1
    assert rows[0]["output_mw"] > 0.0, "output_mw should be computed, not zero"


def test_ingest_weather_logs_count(fresh_main, capsys):
    from unittest.mock import AsyncMock, patch
    from main import _REGION_CFG
    import asyncio

    mock_raw = [
        {
            "region": name,
            "latitude": cfg["lat"],
            "longitude": cfg["lon"],
            "wind_speed_ms": 6.0,
            "solar_irradiance_wm2": 500.0,
        }
        for name, cfg in list(_REGION_CFG.items())[:2]
    ]

    async def run():
        with patch("main.fetch_all_weather", new=AsyncMock(return_value=mock_raw)):
            await fresh_main._ingest_weather()

    asyncio.run(run())
    captured = capsys.readouterr()
    assert "[scheduler]" in captured.out
    assert "2" in captured.out
```

- [ ] **Step 2: Run — expect failure**

```bash
python -m pytest tests/test_scheduler.py -v
```

Expected: `AttributeError` — `main` has no `_ingest_weather`.

- [ ] **Step 3: Add scheduler imports and _ingest_weather to main.py**

At the top of `backend/main.py`, add these imports after the existing import block:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
```

Also add `DailySummaryEntry` and `DailySummaryResponse` to the existing models import:

```python
from models import (
    ...existing imports...,
    DailySummaryEntry,
    DailySummaryResponse,
)
```

After the `app = FastAPI(...)` block and before `@app.on_event("startup")`, add:

```python
# ── Background scheduler ──────────────────────────────────────────────────────

_scheduler = AsyncIOScheduler()


async def _ingest_weather() -> None:
    """Fetch weather for all 24 regions, compute output_mw, persist to DB."""
    try:
        raw = await fetch_all_weather()
        enriched = []
        for entry in raw:
            name = entry["region"]
            cfg  = _REGION_CFG.get(name, {})
            if cfg:
                computed = _compute_region_output(cfg, entry["wind_speed_ms"], entry["solar_irradiance_wm2"])
                entry = {**entry, "output_mw": computed["output_mw"]}
            enriched.append(entry)
        count = insert_weather_entries(enriched)
        print(f"[scheduler] Ingested {count} weather records", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[scheduler] Ingest failed: {exc}", flush=True)
```

- [ ] **Step 4: Update startup and add shutdown event**

Replace the existing `startup_event` function and add `shutdown_event`:

```python
@app.on_event("startup")
def startup_event():
    init_db()
    _scheduler.add_job(_ingest_weather, "interval", minutes=15, id="weather_ingest")
    _scheduler.start()


@app.on_event("shutdown")
def shutdown_event():
    _scheduler.shutdown(wait=False)
```

- [ ] **Step 5: Run — expect pass**

```bash
python -m pytest tests/test_scheduler.py -v
```

Expected: both scheduler tests pass.

- [ ] **Step 6: Run full test suite**

```bash
python -m pytest tests/ -v --ignore=tests/test_summary_endpoint.py
```

Expected: all tests pass (test_summary_endpoint.py doesn't exist yet — ignore it).

- [ ] **Step 7: Commit**

```bash
git add backend/main.py tests/test_scheduler.py
git commit -m "feat: add APScheduler background weather ingestion every 15 minutes"
```

---

## Task 6: Add GET /weather/history/summary endpoint

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/main.py` (also update `/weather/all` to store `output_mw`)

- [ ] **Step 1: Write the failing test**

Create `tests/test_summary_endpoint.py`:

```python
import importlib
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch


@pytest.fixture
def client(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "summary_test.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    import main
    importlib.reload(main)
    return TestClient(main.app)


def _seed_records(client, region="Bizerte", wind=7.0, irr=500.0, output_mw=55.0):
    """Insert a record directly via /history/record for seeding tests."""
    payload = {"data": [{
        "region": region,
        "latitude": 37.27, "longitude": 9.87,
        "wind_speed_ms": wind,
        "solar_irradiance_wm2": irr,
    }]}
    client.post("/history/record", json=payload)


def test_summary_empty_returns_empty_list(client):
    resp = client.get("/weather/history/summary")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_summary_returns_correct_shape(client):
    _seed_records(client, wind=6.0, irr=400.0)
    _seed_records(client, wind=10.0, irr=600.0)

    resp = client.get("/weather/history/summary")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1

    row = data[0]
    assert row["region"] == "Bizerte"
    assert "date" in row
    assert row["min_wind"] == pytest.approx(6.0)
    assert row["max_wind"] == pytest.approx(10.0)
    assert row["avg_wind"] == pytest.approx(8.0)


def test_summary_days_param(client):
    _seed_records(client)
    resp_1  = client.get("/weather/history/summary", params={"days": 1})
    resp_60 = client.get("/weather/history/summary", params={"days": 60})
    assert resp_1.status_code == 200
    assert resp_60.status_code == 200
    # both should return the seeded record
    assert len(resp_1.json()["data"]) >= 1
    assert len(resp_60.json()["data"]) >= 1


def test_weather_all_stores_output_mw(tmp_path, monkeypatch):
    """Verify /weather/all now stores output_mw in DB."""
    import db, importlib
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "wa_test.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    import main
    importlib.reload(main)
    client = TestClient(main.app)

    from main import _REGION_CFG
    mock_raw = [
        {"region": name, "latitude": cfg["lat"], "longitude": cfg["lon"],
         "wind_speed_ms": 8.0, "solar_irradiance_wm2": 600.0}
        for name, cfg in _REGION_CFG.items()
    ]
    with patch("main.fetch_all_weather", new=AsyncMock(return_value=mock_raw)):
        resp = client.get("/weather/all")
    assert resp.status_code == 200

    rows = db.get_region_history("Bizerte", days=1)
    assert len(rows) >= 1
    assert rows[0]["output_mw"] > 0.0
```

- [ ] **Step 2: Run — expect failure**

```bash
python -m pytest tests/test_summary_endpoint.py -v
```

Expected: `test_summary_empty_returns_empty_list` FAIL with 404 (endpoint not yet defined). `test_weather_all_stores_output_mw` FAIL because output_mw is 0.0 (not yet computed in `/weather/all`).

- [ ] **Step 3: Add the summary endpoint to main.py**

In `backend/main.py`, add this endpoint after the `get_weather_all` function (around line 307):

```python
@app.get("/weather/history/summary", response_model=DailySummaryResponse, tags=["Weather"])
def get_weather_history_summary(days: int = 30):
    """
    Return per-region daily aggregates (min/max/avg wind, irradiance, output_mw)
    for the last `days` days. Used by Analytics 30-day chart.
    """
    rows = get_daily_summary(days=days)
    entries = [
        DailySummaryEntry(
            region=r["region"],
            date=r["date"],
            min_wind=round(r["min_wind"] or 0.0, 3),
            max_wind=round(r["max_wind"] or 0.0, 3),
            avg_wind=round(r["avg_wind"] or 0.0, 3),
            min_irradiance=round(r["min_irradiance"] or 0.0, 1),
            max_irradiance=round(r["max_irradiance"] or 0.0, 1),
            avg_output_mw=round(r["avg_output_mw"] or 0.0, 2),
        )
        for r in rows
    ]
    return DailySummaryResponse(data=entries)
```

Also add `get_daily_summary` to the import from `db` at the top of `main.py`:

```python
from db import get_region_history, get_daily_summary, init_db, insert_weather_entries
```

- [ ] **Step 4: Update /weather/all to store output_mw in DB**

In `backend/main.py`, find the `get_weather_all` function. Change the `insert_weather_entries(raw)` call to pass `output_mw` along with each record. Replace the body after `lookup = ...`:

```python
    lookup = {entry["region"]: entry for entry in raw}
    results: list[WeatherAllEntry] = []
    to_insert: list[dict] = []

    for name, cfg in _REGION_CFG.items():
        entry      = lookup.get(name, {})
        wind_ms    = entry.get("wind_speed_ms", 0.0)
        irradiance = entry.get("solar_irradiance_wm2", 0.0)
        computed   = _compute_region_output(cfg, wind_ms, irradiance)

        results.append(WeatherAllEntry(
            region=name,
            wind_ms=round(wind_ms, 3),
            irradiance=round(irradiance, 3),
            output_mw=computed["output_mw"],
            risk_level=computed["risk_level"],
            source=computed["source"],
        ))
        if entry:  # only persist regions with real weather data
            to_insert.append({
                **entry,
                "output_mw": computed["output_mw"],
            })

    insert_weather_entries(to_insert)
    return WeatherAllResponse(data=results)
```

Remove the old `insert_weather_entries(raw)` line that appeared before the loop.

- [ ] **Step 5: Run — expect pass**

```bash
python -m pytest tests/test_summary_endpoint.py -v
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run full test suite**

```bash
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py tests/test_summary_endpoint.py
git commit -m "feat: add GET /weather/history/summary endpoint and store output_mw in /weather/all"
```

---

## Task 7: Set up Alembic for schema versioning

**Files:**
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/script.py.mako`
- Create: `alembic/versions/0001_initial_schema.py`
- Modify: `.env.example`

Alembic lives at the repo root. Its `env.py` imports `get_engine()` from `backend/db.py` to get a live engine. SQLite users don't run migrations (init_db handles it). PostgreSQL users run `alembic upgrade head` before first start.

- [ ] **Step 1: Initialise Alembic**

```bash
cd C:/Users/moham/NoorGrid
alembic init alembic
```

Expected output:
```
  Creating directory .../NoorGrid/alembic ...  done
  Creating directory .../NoorGrid/alembic/versions ...  done
  Generating alembic.ini ...  done
  Generating alembic/env.py ...  done
  Generating alembic/README ...  done
  Generating alembic/script.py.mako ...  done
  Please edit configuration/connection/logging settings
  in .../NoorGrid/alembic.ini before proceeding.
```

- [ ] **Step 2: Configure alembic.ini**

Open `alembic.ini`. Find the line:
```
sqlalchemy.url = driver://user:pass@localhost/dbname
```
Replace it with:
```
# Connection URL is read from DATABASE_URL env var at runtime (see alembic/env.py)
# sqlalchemy.url is intentionally left unset here.
```

- [ ] **Step 3: Replace alembic/env.py**

Replace the generated `alembic/env.py` with:

```python
"""Alembic migration environment — uses NoorGrid's get_engine() from backend/db.py."""
import os
import sys

# Make backend/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from logging.config import fileConfig
from alembic import context
from sqlalchemy import pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # we use raw SQL DDL, not ORM metadata


def run_migrations_offline() -> None:
    """Run migrations against a URL string (no live connection)."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL env var is required for offline Alembic migrations")
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with a live engine (normal usage)."""
    from db import get_engine
    connectable = get_engine()

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Create the initial migration**

Create `alembic/versions/0001_initial_schema.py`:

```python
"""Initial schema: weather_history with output_mw column.

Revision ID: 0001
Revises:
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weather_history",
        sa.Column("id",                   sa.Integer,  primary_key=True, autoincrement=True),
        sa.Column("region",               sa.Text,     nullable=False),
        sa.Column("latitude",             sa.Float,    nullable=False),
        sa.Column("longitude",            sa.Float,    nullable=False),
        sa.Column("wind_speed_ms",        sa.Float,    nullable=False),
        sa.Column("solar_irradiance_wm2", sa.Float,    nullable=False),
        sa.Column("output_mw",            sa.Float,    nullable=False, server_default="0.0"),
        sa.Column(
            "recorded_at",
            sa.Text,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "idx_region_time",
        "weather_history",
        ["region", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_region_time", table_name="weather_history")
    op.drop_table("weather_history")
```

- [ ] **Step 5: Document DATABASE_URL in .env.example**

Open `.env.example`. Add this block at the top:

```
# ── Database ──────────────────────────────────────────────────────────────────
# Leave unset to use SQLite (default, local dev):
#   data/noorgrid.db  (or override with NOORGRID_DB_PATH)
#
# Set to a PostgreSQL URL for production (Supabase recommended):
#   DATABASE_URL=postgresql+psycopg2://user:password@host:5432/noorgrid
#
# When using PostgreSQL, run schema migrations before first start:
#   alembic upgrade head
DATABASE_URL=
```

- [ ] **Step 6: Verify Alembic can connect (SQLite)**

```bash
cd C:/Users/moham/NoorGrid
python -c "from backend.db import get_engine; print(get_engine())"
```

Expected: prints `Engine(sqlite:///...noorgrid.db)`.

```bash
alembic current
```

Expected: prints `(head)` or the current revision with no errors. If it prints an error about no `DATABASE_URL` in offline mode, that's expected — Alembic needs a URL to run. Set a temp SQLite URL and verify:

```bash
DATABASE_URL=sqlite:///data/alembic_test.db alembic upgrade head
```

Expected: `Running upgrade  -> 0001, Initial schema`.

- [ ] **Step 7: Commit**

```bash
git add alembic.ini alembic/ .env.example
git commit -m "feat: add Alembic schema versioning with initial weather_history migration"
```

---

## Task 8: Run full test suite and verify acceptance criteria

- [ ] **Step 1: Run all tests**

```bash
cd C:/Users/moham/NoorGrid
python -m pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 2: Manual smoke test — scheduler fires**

Start the server:
```bash
cd C:/Users/moham/NoorGrid/backend
uvicorn main:app --reload
```

Watch stdout. Within 15 minutes you should see:
```
[scheduler] Ingested 24 weather records
```

For an immediate test without waiting, the scheduler fires on an interval starting from server start. You can temporarily change `minutes=15` to `seconds=10` in `startup_event`, observe the log line, then revert.

- [ ] **Step 3: Verify summary endpoint**

```bash
curl http://localhost:8000/weather/history/summary | python -m json.tool
```

Expected: JSON with `{"data": [...]}` — entries per region per day with all 8 fields.

- [ ] **Step 4: Verify DATABASE_URL switch (optional — requires PostgreSQL)**

If Supabase credentials are available:
```bash
DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/noorgrid alembic upgrade head
DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/noorgrid uvicorn backend.main:app
```

Expected: server starts, `/health` returns 200, `/weather/history/summary` returns 200.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1.2 complete — persistent data pipeline, WAL mode, APScheduler, Alembic"
```

---

## Acceptance Criteria Checklist

| Criterion | Verified by |
|---|---|
| Weather records accumulate every 15 min with no client | `test_ingest_weather_inserts_records_with_output_mw` + smoke test |
| After server restart, historical data intact | SQLite WAL mode + persistent file path (not in-memory) |
| Analytics 30-day query < 500ms | `idx_region_time` composite index on `(region, recorded_at)` |
| `DATABASE_URL` switches SQLite → PostgreSQL | `get_engine()` in `db.py` + Alembic migration |
