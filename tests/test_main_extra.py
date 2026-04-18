import importlib

import httpx
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test_main_extra.db"
    monkeypatch.setenv("NOORGRID_DB_PATH", str(db_path))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import db
    db._engine = None
    import main
    importlib.reload(db)
    importlib.reload(main)
    return TestClient(main.app)


def test_weather_endpoint_returns_502_on_fetch_error(client, monkeypatch):
    import main

    async def _boom():
        raise RuntimeError("weather source down")

    monkeypatch.setattr(main, "fetch_all_weather", _boom)
    resp = client.get("/weather")
    assert resp.status_code == 502
    assert "Failed to fetch weather data" in resp.json()["detail"]


def test_weather_all_endpoint_returns_502_on_fetch_error(client, monkeypatch):
    import main

    async def _boom():
        raise RuntimeError("weather source down")

    monkeypatch.setattr(main, "fetch_all_weather", _boom)
    resp = client.get("/weather/all")
    assert resp.status_code == 502
    assert "Failed to fetch weather data" in resp.json()["detail"]


def test_predict_blackout_unknown_region_404(client):
    resp = client.post("/predict/blackout", json={"region": "Atlantis", "forecast_hours": 24})
    assert resp.status_code == 404


def test_predict_blackout_weather_failure_502(client, monkeypatch):
    import main

    class _BoomClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            raise RuntimeError("forecast api down")

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda: _BoomClient())
    resp = client.post("/predict/blackout", json={"region": "Gabès", "forecast_hours": 24})
    assert resp.status_code == 502
    assert "Weather forecast unavailable" in resp.json()["detail"]


def test_get_alerts_limit_validation(client):
    resp = client.get("/alerts/feed", params={"limit": 0})
    assert resp.status_code == 422


def test_send_report_persists_dispatch_log(client):
    import db
    report = client.post(
        "/report/generate",
        json={
            "region": "Gabès",
            "risk_level": "CRITICAL",
            "scenario_label": "Nawara Field Failure",
            "source": "Solar",
            "magnitude_mw": 620.0,
            "cascade_regions": [{"name": "Médenine", "risk_level": "HIGH"}],
            "prevention_actions": ["Switch to fossil baseline"],
        },
    ).json()

    send = client.post(
        "/report/send",
        json={"recipients": ["ops@steg.com.tn"], "report": report},
    )
    assert send.status_code == 200

    with db.get_engine().connect() as conn:
        from sqlalchemy import text

        row = conn.execute(
            text("SELECT scenario_label, region, risk_level, recipients FROM report_send_log LIMIT 1")
        ).fetchone()

    assert row is not None
    assert row[0] == "Nawara Field Failure"
    assert row[1] == "Gabès"
    assert row[2] == "CRITICAL"
    assert "ops@steg.com.tn" in row[3]


def test_build_context_block_with_minimal_context(client):
    import main
    out = main._build_context_block({})
    assert out == ""


def test_rag_query_returns_503_when_key_missing(client, monkeypatch):
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "")
    resp = client.post("/rag/query", json={"message": "status?", "context": {}})
    assert resp.status_code == 503


def test_health_check_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_get_national_stats_returns_expected_fields(client):
    resp = client.get("/stats/national")
    assert resp.status_code == 200
    body = resp.json()
    assert "source" in body
    assert "installed_capacity_mw" in body


def test_energy_wind_endpoint_returns_power(client):
    resp = client.post(
        "/energy/wind",
        json={"wind_speed": 8.0, "rotor_area": 7854.0, "efficiency": 0.4},
    )
    assert resp.status_code == 200
    assert resp.json()["power_mw"] > 0


def test_energy_solar_endpoint_returns_power(client):
    resp = client.post(
        "/energy/solar",
        json={"irradiance": 700.0, "panel_area": 100000.0, "efficiency": 0.2},
    )
    assert resp.status_code == 200
    assert resp.json()["power_mw"] > 0


def test_energy_hydro_endpoint_returns_power(client):
    resp = client.post(
        "/energy/hydro",
        json={"flow_rate": 20.0, "head_height": 25.0, "efficiency": 0.85},
    )
    assert resp.status_code == 200
    assert resp.json()["power_mw"] > 0


def test_energy_carbon_endpoint_returns_score(client):
    resp = client.post(
        "/energy/carbon",
        json={"region": "Tunis", "consumption_kwh": 1000.0, "renewable_kwh": 250.0},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["region"] == "Tunis"
    assert body["carbon_score_kg"] > 0


def test_predict_blackout_success_returns_predictions(client, monkeypatch):
    import main

    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "hourly": {
                    "time": ["2026-04-17T08:00", "2026-04-17T14:00", "2026-04-17T20:00"],
                    "temperature_2m": [27.0, 33.0, 30.0],
                    "wind_speed_10m": [7.0, 8.5, 6.8],
                    "shortwave_radiation": [300.0, 850.0, 120.0],
                }
            }

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            return _Resp()

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda: _Client())
    resp = client.post("/predict/blackout", json={"region": "Gabès", "forecast_hours": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["region"] == "Gabès"
    assert len(body["predictions"]) == 3
    assert body["predictions"][0]["risk_level"] in {"NOMINAL", "ELEVATED", "HIGH", "CRITICAL"}


def test_build_context_block_with_rich_context(client):
    import main

    context = {
        "simResult": {
            "risk_level": "HIGH",
            "risk_score": 78,
            "total_demand_mw": 4600,
            "effective_capacity_mw": 4300,
            "headroom_pct": -7.0,
            "renewable_share_pct": 24.5,
            "import_required_mw": 300,
            "recommended_action": "IMPORT",
        },
        "simParams": {"temperature_c": 42, "demand_delta_pct": 15},
        "selectedGov": {
            "name": "Gabès",
            "region": "South",
            "source": "Solar",
            "mock_mw": 90,
            "mock_risk": "HIGH",
        },
        "isReplay": True,
    }
    out = main._build_context_block(context)
    assert "ACTIVE SIMULATION STATE:" in out
    assert "SELECTED GOVERNORATE:" in out
    assert "REPLAY MODE:" in out


def test_rag_query_success_with_guardrail_marker_sets_rejected(client, monkeypatch):
    import main

    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "model": "test-model",
                "choices": [
                    {
                        "message": {
                            "content": (
                                "Outside my operational domain. I am specialized for STEG grid operations, "
                                "renewable energy, and Tunisia's electricity sector."
                            )
                        }
                    }
                ],
            }

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return _Resp()

    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-key")
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda: _Client())
    resp = client.post("/rag/query", json={"message": "Tell me football scores", "context": {"isReplay": True}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["model"] == "test-model"
    assert body["rejected"] is True


def test_rag_query_returns_502_on_http_status_error(client, monkeypatch):
    import main

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            request = httpx.Request("POST", "https://example.test")
            response = httpx.Response(429, request=request, text="rate limited")
            raise httpx.HTTPStatusError("boom", request=request, response=response)

    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-key")
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda: _Client())
    resp = client.post("/rag/query", json={"message": "status?", "context": {}})
    assert resp.status_code == 502
    assert "NIM API returned 429" in resp.json()["detail"]


def test_rag_query_returns_502_on_network_error(client, monkeypatch):
    import main

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            raise RuntimeError("network down")

    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "test-key")
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda: _Client())
    resp = client.post("/rag/query", json={"message": "status?", "context": {}})
    assert resp.status_code == 502
    assert "NIM API unreachable" in resp.json()["detail"]


def test_analytics_crisis_returns_empty_for_fresh_db(client):
    resp = client.get("/analytics/crisis?days=7")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_incidents"] == 0
    assert data["window_days"] == 7
    assert data["incidents"] == []


def test_analytics_crisis_records_cascade_regions(client):
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
    sim = client.post("/alerts/simulate", json={
        "region": "Tunis",
        "risk_level": "HIGH",
        "scenario_label": "Test",
        "cascade_regions": [],
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
