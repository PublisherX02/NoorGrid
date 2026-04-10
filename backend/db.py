"""
SQLite storage helpers for NoorGrid historical weather snapshots.
"""

import os
import sqlite3
from pathlib import Path

_DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "noorgrid.db"


def get_db_path() -> Path:
    configured = os.getenv("NOORGRID_DB_PATH")
    if configured:
        return Path(configured).expanduser().resolve()
    return _DEFAULT_DB_PATH


def _get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                wind_speed_ms REAL NOT NULL,
                solar_irradiance_wm2 REAL NOT NULL,
                recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def insert_weather_entries(entries: list[dict]) -> int:
    init_db()
    if not entries:
        return 0

    payload = [
        (
            entry["region"],
            float(entry["latitude"]),
            float(entry["longitude"]),
            float(entry["wind_speed_ms"]),
            float(entry["solar_irradiance_wm2"]),
        )
        for entry in entries
    ]
    with _get_connection() as conn:
        cursor = conn.executemany(
            """
            INSERT INTO weather_history (
                region,
                latitude,
                longitude,
                wind_speed_ms,
                solar_irradiance_wm2
            ) VALUES (?, ?, ?, ?, ?)
            """,
            payload,
        )
    return cursor.rowcount


def get_region_history(region: str, days: int) -> list[dict]:
    init_db()
    with _get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                region,
                latitude,
                longitude,
                wind_speed_ms,
                solar_irradiance_wm2,
                recorded_at
            FROM weather_history
            WHERE region = ?
              AND recorded_at >= datetime('now', ?)
            ORDER BY recorded_at DESC
            """,
            (region, f"-{days} days"),
        ).fetchall()

    return [dict(row) for row in rows]
