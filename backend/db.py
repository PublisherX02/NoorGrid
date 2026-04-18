"""
SQLite / PostgreSQL storage helpers for NoorGrid — SQLAlchemy Core.

Connection driver is selected by DATABASE_URL env var:
  - Not set  → SQLite at NOORGRID_DB_PATH (default: data/noorgrid.db)
  - Set       → PostgreSQL via psycopg2 (use Alembic to initialise schema)
"""

import json
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
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS report_send_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario_label TEXT NOT NULL,
                region      TEXT NOT NULL,
                risk_level  TEXT NOT NULL,
                recipients  TEXT NOT NULL,
                sent_at     TEXT NOT NULL
            )
        """))
        # Backward-compatible migration for pre-existing local DBs
        # that were created before output_mw was introduced.
        weather_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(weather_history)")).fetchall()
        }
        if "output_mw" not in weather_cols:
            conn.execute(text(
                "ALTER TABLE weather_history ADD COLUMN output_mw REAL NOT NULL DEFAULT 0.0"
            ))

        # Migration: alerts_log.cascade_regions (JSON array of region names)
        alert_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(alerts_log)")).fetchall()
        }
        if "cascade_regions" not in alert_cols:
            conn.execute(text(
                "ALTER TABLE alerts_log ADD COLUMN cascade_regions TEXT NOT NULL DEFAULT '[]'"
            ))

        # Migration: report_send_log.alert_id (FK to alerts_log.id, NULL for old rows)
        report_cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(report_send_log)")).fetchall()
        }
        if "alert_id" not in report_cols:
            conn.execute(text(
                "ALTER TABLE report_send_log ADD COLUMN alert_id INTEGER"
            ))


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


def get_alert_by_id(alert_id: int) -> dict | None:
    """Return a single alert row by its primary key, or None if not found."""
    init_db()
    with get_engine().connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, region, risk_level, scenario_label,
                       prevention_actions, cascade_regions, triggered_at, is_test
                FROM alerts_log WHERE id = :id
            """),
            {"id": alert_id},
        ).fetchone()
    if not row:
        return None
    d = dict(row._mapping)
    d["prevention_actions"] = json.loads(d["prevention_actions"])
    d["cascade_regions"] = json.loads(d["cascade_regions"] or "[]")
    d["is_test"] = bool(d["is_test"])
    return d


def get_alerts_feed(limit: int = 10) -> list[dict]:
    """Return the most recent alerts ordered by triggered_at DESC."""
    init_db()
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, region, risk_level, scenario_label,
                       prevention_actions, cascade_regions, triggered_at, is_test
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
        d["cascade_regions"] = json.loads(d["cascade_regions"] or "[]")
        d["is_test"] = bool(d["is_test"])
        result.append(d)
    return result


def get_crisis_analytics(days: int) -> dict:
    """Return aggregate crisis analytics for the given time window."""
    init_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    with get_engine().connect() as conn:
        alert_rows = conn.execute(
            text("""
                SELECT id, region, risk_level, scenario_label, cascade_regions, triggered_at
                FROM alerts_log
                WHERE triggered_at >= :cutoff
                ORDER BY triggered_at DESC, id DESC
            """),
            {"cutoff": cutoff},
        ).fetchall()

        report_rows = conn.execute(
            text("""
                SELECT alert_id, recipients
                FROM report_send_log
                WHERE sent_at >= :cutoff
            """),
            {"cutoff": cutoff},
        ).fetchall()

    report_dispatch_count = len(report_rows)
    report_meta: dict[int, dict] = {}
    for row in report_rows:
        alert_id = row._mapping.get("alert_id")
        if alert_id is None:
            continue
        recipients_raw = row._mapping.get("recipients") or "[]"
        try:
            recipients = json.loads(recipients_raw)
            recipients_count = len(recipients) if isinstance(recipients, list) else 0
        except Exception:
            recipients_count = 0
        existing = report_meta.get(alert_id)
        if not existing:
            report_meta[alert_id] = {"report_sent": True, "recipients_count": recipients_count}
        else:
            existing["recipients_count"] = max(existing["recipients_count"], recipients_count)

    incidents: list[dict] = []
    region_primary: dict[str, int] = {}
    region_cascade: dict[str, int] = {}
    daily_counter: dict[str, int] = {}
    critical_count = 0
    high_count = 0
    cascade_hits_total = 0

    for row in alert_rows:
        m = row._mapping
        try:
            cascade_regions = json.loads(m.get("cascade_regions") or "[]")
            if not isinstance(cascade_regions, list):
                cascade_regions = []
        except Exception:
            cascade_regions = []
        cascade_regions = [str(r) for r in cascade_regions]

        risk_level = str(m["risk_level"])
        if risk_level == "CRITICAL":
            critical_count += 1
        if risk_level == "HIGH":
            high_count += 1

        region = str(m["region"])
        region_primary[region] = region_primary.get(region, 0) + 1
        for cr in cascade_regions:
            region_cascade[cr] = region_cascade.get(cr, 0) + 1
        cascade_hits_total += len(cascade_regions)

        triggered_at = str(m["triggered_at"])
        date_key = triggered_at[:10]
        daily_counter[date_key] = daily_counter.get(date_key, 0) + 1

        report = report_meta.get(int(m["id"]), {"report_sent": False, "recipients_count": 0})
        incidents.append(
            {
                "id": int(m["id"]),
                "region": region,
                "risk_level": risk_level,
                "scenario_label": str(m["scenario_label"]),
                "cascade_regions": cascade_regions,
                "triggered_at": triggered_at,
                "report_sent": bool(report["report_sent"]),
                "recipients_count": int(report["recipients_count"]),
            }
        )

    region_names = set(region_primary) | set(region_cascade)
    region_frequency = []
    for name in region_names:
        primary_count = region_primary.get(name, 0)
        cascade_count = region_cascade.get(name, 0)
        region_frequency.append(
            {
                "region": name,
                "primary_count": primary_count,
                "cascade_count": cascade_count,
                "total": primary_count + cascade_count,
            }
        )
    region_frequency.sort(key=lambda r: (-r["total"], -r["primary_count"], r["region"]))

    daily_counts = [{"date": date, "count": count} for date, count in sorted(daily_counter.items())]

    most_affected_region = region_frequency[0]["region"] if region_frequency else None

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
