import importlib

from fastapi.testclient import TestClient


def test_grid_simulation_nominal_case(monkeypatch, tmp_path):
    db_path = tmp_path / "test_noorgrid.db"
    monkeypatch.setenv("NOORGRID_DB_PATH", str(db_path))
    import main
    importlib.reload(main)
    client = TestClient(main.app)

    resp = client.post(
        "/grid/simulate",
        json={
            "renewable_output_mw": 320.0,
            "demand_delta_pct": 0,
            "temperature_c": 25,
            "include_peak_hour_factor": False,
            "reserve_capacity_mw": 0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_demand_mw"] > 0
    assert data["effective_capacity_mw"] >= 4636.0
    assert data["risk_level"] in {"NOMINAL", "ELEVATED", "HIGH", "CRITICAL"}


def test_grid_simulation_critical_import_case(monkeypatch, tmp_path):
    db_path = tmp_path / "test_noorgrid.db"
    monkeypatch.setenv("NOORGRID_DB_PATH", str(db_path))
    import main
    importlib.reload(main)
    client = TestClient(main.app)

    resp = client.post(
        "/grid/simulate",
        json={
            "renewable_output_mw": 120.0,
            "demand_delta_pct": 35,
            "temperature_c": 46,
            "include_peak_hour_factor": True,
            "reserve_capacity_mw": 0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["import_required_mw"] >= 0
    assert data["import_reliance_pct"] >= 0
    assert data["risk_level"] in {"HIGH", "CRITICAL"}


def test_grid_simulation_validation(monkeypatch, tmp_path):
    db_path = tmp_path / "test_noorgrid.db"
    monkeypatch.setenv("NOORGRID_DB_PATH", str(db_path))
    import main
    importlib.reload(main)
    client = TestClient(main.app)

    resp = client.post(
        "/grid/simulate",
        json={
            "renewable_output_mw": -1,
            "demand_delta_pct": 0,
            "temperature_c": 25,
            "include_peak_hour_factor": True,
            "reserve_capacity_mw": 0,
        },
    )
    assert resp.status_code == 422
