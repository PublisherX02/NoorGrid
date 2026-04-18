"""Tests for /report/generate and /report/send endpoints."""
import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    import db
    monkeypatch.setenv("NOORGRID_DB_PATH", str(tmp_path / "test_report.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db._engine = None
    importlib.reload(db)
    yield
    db._engine = None


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


VALID_REPORT_PAYLOAD = {
    "region": "Gabès",
    "risk_level": "CRITICAL",
    "scenario_label": "Nawara Field Failure",
    "source": "Solar",
    "magnitude_mw": 620.0,
    "cascade_regions": [{"name": "Médenine", "risk_level": "HIGH"}],
    "prevention_actions": ["Switch to fossil baseline", "Alert STEG Dispatch Center"],
}


def test_report_generate_returns_valid_structure(client):
    resp = client.post("/report/generate", json=VALID_REPORT_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["region"] == "Gabès"
    assert data["risk_level"] == "CRITICAL"
    assert data["scenario_label"] == "Nawara Field Failure"
    assert isinstance(data["root_cause"], str) and len(data["root_cause"]) > 10
    assert isinstance(data["technical_fix"], str) and len(data["technical_fix"]) > 10
    assert isinstance(data["impact_summary"], str) and len(data["impact_summary"]) > 10
    assert isinstance(data["recommended_actions"], list)
    assert len(data["recommended_actions"]) >= 2
    assert isinstance(data["generated_at"], str)


def test_report_generate_preserves_request_fields(client):
    resp = client.post("/report/generate", json=VALID_REPORT_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "Solar"
    assert data["magnitude_mw"] == 620.0
    assert len(data["cascade_regions"]) == 1
    assert data["cascade_regions"][0]["name"] == "Médenine"


def test_report_send_returns_sent_true(client):
    report = client.post("/report/generate", json=VALID_REPORT_PAYLOAD).json()
    resp = client.post("/report/send", json={
        "recipients": ["eng1@steg.com.tn", "ops@steg.com.tn"],
        "report": report,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["sent"] is True
    assert data["recipients"] == ["eng1@steg.com.tn", "ops@steg.com.tn"]
    assert isinstance(data["sent_at"], str) and len(data["sent_at"]) > 0


def test_report_send_empty_recipients_rejected(client):
    report = client.post("/report/generate", json=VALID_REPORT_PAYLOAD).json()
    resp = client.post("/report/send", json={"recipients": [], "report": report})
    assert resp.status_code == 422


def test_report_generate_nim_parse_with_code_fence(monkeypatch):
    """Verify the code-fence stripping logic works when NIM wraps JSON in markdown."""
    import report as report_module

    fenced_response = '```json\n{"root_cause":"Solar output dropped","technical_fix":"Switch to fossil","impact_summary":"15% at risk","recommended_actions":["Action 1","Action 2"]}\n```'

    class FakeResp:
        def raise_for_status(self): pass
        def json(self):
            return {"choices": [{"message": {"content": fenced_response}}]}

    class FakeClient:
        async def post(self, *a, **kw): return FakeResp()
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass

    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "fake-key-for-test")
    monkeypatch.setattr(report_module.httpx, "AsyncClient", lambda: FakeClient())

    import asyncio
    result = asyncio.run(report_module.generate_report_from_nim(
        region="Gabès", risk_level="CRITICAL", scenario_label="Test",
        source="Solar", magnitude_mw=100.0, cascade_regions=[], prevention_actions=[],
    ))
    assert result["root_cause"] == "Solar output dropped"
    assert result["technical_fix"] == "Switch to fossil"
    assert result["recommended_actions"] == ["Action 1", "Action 2"]
