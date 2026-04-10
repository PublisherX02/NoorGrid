import importlib

from fastapi.testclient import TestClient


def test_history_record_and_query(tmp_path, monkeypatch):
    db_path = tmp_path / "test_noorgrid.db"
    monkeypatch.setenv("NOORGRID_DB_PATH", str(db_path))

    import main

    importlib.reload(main)
    client = TestClient(main.app)

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


def test_history_days_validation(tmp_path, monkeypatch):
    db_path = tmp_path / "test_noorgrid.db"
    monkeypatch.setenv("NOORGRID_DB_PATH", str(db_path))

    import main

    importlib.reload(main)
    client = TestClient(main.app)

    resp = client.get("/history/Bizerte", params={"days": 0})
    assert resp.status_code == 422
    assert "days must be between 1 and 365" in resp.json()["detail"]
