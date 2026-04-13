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
