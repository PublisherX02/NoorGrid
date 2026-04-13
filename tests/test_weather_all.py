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
