import datetime
import importlib
import json

import pytest


@pytest.fixture()
def db_mod(tmp_path, monkeypatch):
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test_analytics.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
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
    db_mod.insert_alert("Tunis", "CRITICAL", "Scenario A", [], cascade_regions=["Médenine"])
    db_mod.insert_alert("Sfax", "HIGH", "Scenario B", [], cascade_regions=[])
    result = db_mod.get_crisis_analytics(7)
    assert result["total_incidents"] == 2
    assert result["critical_count"] == 1
    assert result["high_count"] == 1
    assert result["cascade_hits_total"] == 1


def test_get_crisis_analytics_report_dispatch_count(db_mod):
    db_mod.init_db()
    aid = db_mod.insert_alert("Tunis", "HIGH", "Scenario", [], cascade_regions=[])
    db_mod.insert_report_send(
        "Scenario",
        "Tunis",
        "HIGH",
        ["a@b.com"],
        datetime.datetime.now(datetime.timezone.utc).isoformat(),
        alert_id=aid,
    )
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
