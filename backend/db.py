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
