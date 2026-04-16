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
