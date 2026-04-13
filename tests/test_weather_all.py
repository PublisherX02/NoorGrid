# tests/test_weather_all.py
import pytest
from weather import GOVERNORATES, fetch_all_weather

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


from models import WeatherAllEntry, WeatherAllResponse

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


from main import _REGION_CFG

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
