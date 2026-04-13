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
