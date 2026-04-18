# tests/test_weather_all.py
from unittest.mock import patch

from fastapi.testclient import TestClient
from main import _REGION_CFG, _compute_region_output, app
from models import WeatherAllEntry, WeatherAllResponse
from weather import GOVERNORATES

client = TestClient(app)


def test_governorates_has_24_entries():
    assert len(GOVERNORATES) == 24

def test_all_governorate_names_unique():
    names = [g["region"] for g in GOVERNORATES]
    assert len(names) == len(set(names))

def test_all_have_required_keys():
    required = {"region", "lat", "lon"}
    for g in GOVERNORATES:
        assert required <= g.keys(), f"{g['region']} missing keys"

EXPECTED_REGIONS = {
    "Bizerte", "Nabeul", "Tozeur", "Béja", "Sidi Bouzid",
    "Tunis", "Ariana", "Ben Arous", "Manouba", "Zaghouan",
    "Jendouba", "Kef", "Siliana", "Sousse", "Monastir",
    "Mahdia", "Sfax", "Kairouan", "Kasserine", "Gabès",
    "Médenine", "Tataouine", "Gafsa", "Kebili",
}

def test_all_24_expected_regions_present():
    names = {g["region"] for g in GOVERNORATES}
    assert names == EXPECTED_REGIONS


def test_weather_all_entry_fields():
    entry = WeatherAllEntry(
        region="Bizerte",
        wind_ms=8.2,
        irradiance=420.0,
        output_mw=87.3,
        risk_level="NOMINAL",
        source="Wind",
    )
    assert entry.region == "Bizerte"
    assert entry.output_mw == 87.3

def test_weather_all_response_wraps_list():
    entries = [
        WeatherAllEntry(region="Bizerte", wind_ms=8.2, irradiance=420.0,
                        output_mw=87.3, risk_level="NOMINAL", source="Wind")
    ]
    resp = WeatherAllResponse(data=entries)
    assert len(resp.data) == 1


def test_region_cfg_has_24_entries():
    assert len(_REGION_CFG) == 24

def test_region_cfg_mixed_have_rotor_area():
    mixed = [name for name, cfg in _REGION_CFG.items() if cfg["source"] == "Mixed"]
    assert len(mixed) == 6
    for name in mixed:
        assert "rotor_area" in _REGION_CFG[name], f"{name} missing rotor_area"
        assert "efficiency" in _REGION_CFG[name], f"{name} missing efficiency"

def test_region_cfg_wind_have_rotor_area():
    wind = [name for name, cfg in _REGION_CFG.items() if cfg["source"] == "Wind"]
    for name in wind:
        assert "rotor_area" in _REGION_CFG[name], f"{name} missing rotor_area"

def test_region_cfg_solar_have_panel_area():
    solar = [name for name, cfg in _REGION_CFG.items() if cfg["source"] == "Solar"]
    for name in solar:
        assert "panel_area" in _REGION_CFG[name], f"{name} missing panel_area"


def test_compute_region_output_wind():
    cfg = _REGION_CFG["Bizerte"]
    result = _compute_region_output(cfg, wind_ms=8.2, irradiance=420.0)
    assert result["source"] == "Wind"
    assert result["output_mw"] > 0
    assert result["risk_level"] in {"NOMINAL", "ELEVATED", "HIGH", "CRITICAL"}

def test_compute_region_output_solar():
    cfg = _REGION_CFG["Tozeur"]
    result = _compute_region_output(cfg, wind_ms=3.1, irradiance=820.0)
    assert result["source"] == "Solar"
    assert result["output_mw"] > 0

def test_compute_region_output_hydro():
    cfg = _REGION_CFG["Béja"]
    result = _compute_region_output(cfg, wind_ms=5.8, irradiance=390.0)
    assert result["source"] == "Hydro"
    assert result["output_mw"] == cfg["baseline_mw"]

def test_compute_region_output_mixed():
    cfg = _REGION_CFG["Tunis"]
    result = _compute_region_output(cfg, wind_ms=5.1, irradiance=510.0)
    assert result["source"] == "Mixed"
    assert result["output_mw"] >= 0.60 * cfg["baseline_mw"]

def test_weather_all_endpoint_returns_24():
    async def _mock_fetch():
        return [
            {"region": name, "latitude": cfg["lat"], "longitude": cfg["lon"],
             "wind_speed_ms": 5.0, "solar_irradiance_wm2": 500.0}
            for name, cfg in _REGION_CFG.items()
        ]
    with patch("main.fetch_all_weather", new=_mock_fetch):
        resp = client.get("/weather/all")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 24

def test_weather_all_entry_has_required_fields():
    async def _mock_fetch():
        return [
            {"region": name, "latitude": cfg["lat"], "longitude": cfg["lon"],
             "wind_speed_ms": 5.0, "solar_irradiance_wm2": 500.0}
            for name, cfg in _REGION_CFG.items()
        ]
    with patch("main.fetch_all_weather", new=_mock_fetch):
        resp = client.get("/weather/all")
    first = resp.json()["data"][0]
    assert {"region", "wind_ms", "irradiance", "output_mw", "risk_level", "source"} <= first.keys()
