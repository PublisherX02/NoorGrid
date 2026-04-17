# All-24 Governorate Live Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `mock_mw`/`mock_risk` in 19 of 24 governorates with live weather-derived output via a new `/weather/all` endpoint.

**Architecture:** Backend fetches real weather for all 24 regions in parallel, computes energy output per source type (Wind/Solar/Hydro/Mixed), derives risk level from output vs demand ratio, and returns a rich response. Frontend `useWeather` hook calls `/weather/all`, merges `output_mw`/`risk_level` into GOVERNORATES at runtime; `mock_mw`/`mock_risk` remain static fallbacks only when the backend is offline.

**Tech Stack:** FastAPI, httpx (already present), Pydantic, React, axios

---

## File Map

| File | Change |
|---|---|
| `backend/weather.py` | Expand `GOVERNORATES` from 5 → 24 entries |
| `backend/models.py` | Add `WeatherAllEntry`, `WeatherAllResponse` |
| `backend/main.py` | Expand `_REGION_CFG` to 24 entries; add `_compute_region_output()` helper; add `GET /weather/all` endpoint |
| `frontend-react/src/constants/grid.js` | Add `rotor_area` + `efficiency` to 6 Mixed-source governorates |
| `frontend-react/src/services/api.js` | Add `getWeatherAll()` with mock fallback |
| `frontend-react/src/hooks/useWeather.js` | Call `getWeatherAll()`, merge live data into GOVERNORATES |
| `frontend-react/src/pages/Dashboard.jsx` | Replace `gov.mock_mw`/`gov.mock_risk` with `gov.live_mw ?? gov.mock_mw` etc. |
| `tests/test_weather_all.py` | New: backend unit + integration tests |

---

## Task 1: Expand `weather.py` to all 24 governorates

**Files:**
- Modify: `backend/weather.py`
- Create: `tests/test_weather_all.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd C:\Users\moham\NoorGrid
python -m pytest tests/test_weather_all.py -v
```
Expected: FAIL — `AssertionError: assert 5 == 24`

- [ ] **Step 3: Expand `GOVERNORATES` in `backend/weather.py`**

Replace the existing `GOVERNORATES` list (lines 9–15) with:

```python
GOVERNORATES: list[dict] = [
    # ── Real backend (existing) ──
    {"region": "Bizerte",     "lat": 37.2744, "lon": 9.8739},
    {"region": "Nabeul",      "lat": 36.4561, "lon": 10.7376},
    {"region": "Tozeur",      "lat": 33.9197, "lon": 8.1335},
    {"region": "Béja",        "lat": 36.7256, "lon": 9.1817},
    {"region": "Sidi Bouzid", "lat": 35.0382, "lon": 9.4858},
    # ── Newly added ──
    {"region": "Tunis",       "lat": 36.8190, "lon": 10.1658},
    {"region": "Ariana",      "lat": 36.8665, "lon": 10.1647},
    {"region": "Ben Arous",   "lat": 36.7533, "lon": 10.2281},
    {"region": "Manouba",     "lat": 36.8092, "lon": 9.9885},
    {"region": "Zaghouan",    "lat": 36.4029, "lon": 10.1427},
    {"region": "Jendouba",    "lat": 36.5012, "lon": 8.7803},
    {"region": "Kef",         "lat": 36.1820, "lon": 8.7046},
    {"region": "Siliana",     "lat": 36.0842, "lon": 9.3748},
    {"region": "Sousse",      "lat": 35.8256, "lon": 10.6368},
    {"region": "Monastir",    "lat": 35.7643, "lon": 10.8113},
    {"region": "Mahdia",      "lat": 35.5047, "lon": 11.0622},
    {"region": "Sfax",        "lat": 34.7398, "lon": 10.7600},
    {"region": "Kairouan",    "lat": 35.6781, "lon": 10.0963},
    {"region": "Kasserine",   "lat": 35.1721, "lon": 8.8302},
    {"region": "Gabès",       "lat": 33.8881, "lon": 10.0975},
    {"region": "Médenine",    "lat": 33.3549, "lon": 10.5055},
    {"region": "Tataouine",   "lat": 32.9211, "lon": 10.4518},
    {"region": "Gafsa",       "lat": 34.4311, "lon": 8.7757},
    {"region": "Kebili",      "lat": 33.7046, "lon": 8.9715},
]
```

- [ ] **Step 4: Run tests — confirm passing**

```
python -m pytest tests/test_weather_all.py -v
```
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/weather.py tests/test_weather_all.py
git commit -m "feat: expand weather.py GOVERNORATES to all 24 Tunisian regions"
```

---

## Task 2: Add `WeatherAllEntry` and `WeatherAllResponse` models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_weather_all.py`:

```python
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
```

- [ ] **Step 2: Run test to confirm it fails**

```
python -m pytest tests/test_weather_all.py::test_weather_all_entry_fields -v
```
Expected: FAIL — `ImportError: cannot import name 'WeatherAllEntry'`

- [ ] **Step 3: Add models to `backend/models.py`**

After the `WeatherResponse` class (after line 77), add:

```python
class WeatherAllEntry(BaseModel):
    region: str
    wind_ms: float = Field(..., description="Wind speed at 10 m in m/s")
    irradiance: float = Field(..., description="Solar irradiance in W/m²")
    output_mw: float = Field(..., description="Computed energy output in MW")
    risk_level: str = Field(..., description="NOMINAL | ELEVATED | HIGH | CRITICAL")
    source: str = Field(..., description="Wind | Solar | Hydro | Mixed")


class WeatherAllResponse(BaseModel):
    data: list[WeatherAllEntry]
```

- [ ] **Step 4: Run tests — confirm passing**

```
python -m pytest tests/test_weather_all.py -k "weather_all_entry or weather_all_response" -v
```
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add backend/models.py tests/test_weather_all.py
git commit -m "feat: add WeatherAllEntry and WeatherAllResponse models"
```

---

## Task 3: Expand `_REGION_CFG` to all 24 governorates in `main.py`

**Files:**
- Modify: `backend/main.py` (lines 143–158, `_REGION_CFG` dict)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_weather_all.py`:

```python
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
```

- [ ] **Step 2: Run test to confirm it fails**

```
python -m pytest tests/test_weather_all.py::test_region_cfg_has_24_entries -v
```
Expected: FAIL — `assert 5 == 24`

- [ ] **Step 3: Replace `_REGION_CFG` in `backend/main.py`**

Replace the entire `_REGION_CFG` dict (lines 143–158) with:

```python
_REGION_CFG: dict[str, dict] = {
    # ── Wind ──
    "Bizerte":     {"lat": 37.2744, "lon": 9.8739,  "source": "Wind",  "baseline_mw": 97.0,
                    "rotor_area": 7854.0,  "efficiency": 0.40,
                    "installed_capacity_mw": 120.0,  "avg_demand_mw": 178.0},
    "Nabeul":      {"lat": 36.4561, "lon": 10.7376, "source": "Wind",  "baseline_mw": 55.0,
                    "rotor_area": 4418.0,  "efficiency": 0.40,
                    "installed_capacity_mw": 75.0,   "avg_demand_mw": 142.0},
    "Kef":         {"lat": 36.1820, "lon": 8.7046,  "source": "Wind",  "baseline_mw": 45.0,
                    "rotor_area": 3590.0,  "efficiency": 0.40,
                    "installed_capacity_mw": 60.0,   "avg_demand_mw": 68.0},
    "Siliana":     {"lat": 36.0842, "lon": 9.3748,  "source": "Wind",  "baseline_mw": 38.0,
                    "rotor_area": 3016.0,  "efficiency": 0.40,
                    "installed_capacity_mw": 50.0,   "avg_demand_mw": 62.0},
    "Mahdia":      {"lat": 35.5047, "lon": 11.0622, "source": "Wind",  "baseline_mw": 60.0,
                    "rotor_area": 4712.0,  "efficiency": 0.40,
                    "installed_capacity_mw": 80.0,   "avg_demand_mw": 128.0},
    "Kasserine":   {"lat": 35.1721, "lon": 8.8302,  "source": "Wind",  "baseline_mw": 75.0,
                    "rotor_area": 5890.0,  "efficiency": 0.40,
                    "installed_capacity_mw": 95.0,   "avg_demand_mw": 108.0},
    # ── Solar ──
    "Tozeur":      {"lat": 33.9197, "lon": 8.1335,  "source": "Solar", "baseline_mw": 20.0,
                    "panel_area": 120_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 25.0,   "avg_demand_mw": 44.0},
    "Sidi Bouzid": {"lat": 35.0382, "lon": 9.4858,  "source": "Solar", "baseline_mw": 100.0,
                    "panel_area": 600_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 130.0,  "avg_demand_mw": 92.0},
    "Monastir":    {"lat": 35.7643, "lon": 10.8113, "source": "Solar", "baseline_mw": 85.0,
                    "panel_area": 510_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 100.0,  "avg_demand_mw": 174.0},
    "Kairouan":    {"lat": 35.6781, "lon": 10.0963, "source": "Solar", "baseline_mw": 110.0,
                    "panel_area": 660_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 135.0,  "avg_demand_mw": 168.0},
    "Gabès":       {"lat": 33.8881, "lon": 10.0975, "source": "Solar", "baseline_mw": 90.0,
                    "panel_area": 540_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 110.0,  "avg_demand_mw": 132.0},
    "Médenine":    {"lat": 33.3549, "lon": 10.5055, "source": "Solar", "baseline_mw": 65.0,
                    "panel_area": 390_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 80.0,   "avg_demand_mw": 124.0},
    "Tataouine":   {"lat": 32.9211, "lon": 10.4518, "source": "Solar", "baseline_mw": 40.0,
                    "panel_area": 240_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 50.0,   "avg_demand_mw": 50.0},
    "Gafsa":       {"lat": 34.4311, "lon": 8.7757,  "source": "Solar", "baseline_mw": 55.0,
                    "panel_area": 330_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 70.0,   "avg_demand_mw": 124.0},
    "Kebili":      {"lat": 33.7046, "lon": 8.9715,  "source": "Solar", "baseline_mw": 35.0,
                    "panel_area": 210_000.0, "efficiency": 0.18,
                    "installed_capacity_mw": 45.0,   "avg_demand_mw": 48.0},
    # ── Hydro ──
    "Béja":        {"lat": 36.7256, "lon": 9.1817,  "source": "Hydro", "baseline_mw": 33.0,
                    "installed_capacity_mw": 40.0,   "avg_demand_mw": 74.0},
    "Zaghouan":    {"lat": 36.4029, "lon": 10.1427, "source": "Hydro", "baseline_mw": 28.0,
                    "installed_capacity_mw": 35.0,   "avg_demand_mw": 54.0},
    "Jendouba":    {"lat": 36.5012, "lon": 8.7803,  "source": "Hydro", "baseline_mw": 42.0,
                    "installed_capacity_mw": 55.0,   "avg_demand_mw": 96.0},
    # ── Mixed (60% fossil baseline + 40% wind offset) ──
    "Tunis":       {"lat": 36.8190, "lon": 10.1658, "source": "Mixed", "baseline_mw": 450.0,
                    "rotor_area": 15708.0, "efficiency": 0.35,
                    "installed_capacity_mw": 500.0,  "avg_demand_mw": 820.0},
    "Ariana":      {"lat": 36.8665, "lon": 10.1647, "source": "Mixed", "baseline_mw": 120.0,
                    "rotor_area": 7854.0,  "efficiency": 0.35,
                    "installed_capacity_mw": 135.0,  "avg_demand_mw": 182.0},
    "Ben Arous":   {"lat": 36.7533, "lon": 10.2281, "source": "Mixed", "baseline_mw": 180.0,
                    "rotor_area": 7854.0,  "efficiency": 0.35,
                    "installed_capacity_mw": 200.0,  "avg_demand_mw": 225.0},
    "Manouba":     {"lat": 36.8092, "lon": 9.9885,  "source": "Mixed", "baseline_mw": 95.0,
                    "rotor_area": 5027.0,  "efficiency": 0.35,
                    "installed_capacity_mw": 100.0,  "avg_demand_mw": 132.0},
    "Sousse":      {"lat": 35.8256, "lon": 10.6368, "source": "Mixed", "baseline_mw": 220.0,
                    "rotor_area": 10000.0, "efficiency": 0.35,
                    "installed_capacity_mw": 250.0,  "avg_demand_mw": 258.0},
    "Sfax":        {"lat": 34.7398, "lon": 10.7600, "source": "Mixed", "baseline_mw": 280.0,
                    "rotor_area": 12000.0, "efficiency": 0.35,
                    "installed_capacity_mw": 320.0,  "avg_demand_mw": 382.0},
}
```

- [ ] **Step 4: Run tests — confirm passing**

```
python -m pytest tests/test_weather_all.py -k "region_cfg" -v
```
Expected: all 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/test_weather_all.py
git commit -m "feat: expand _REGION_CFG to all 24 governorates with source configs"
```

---

## Task 4: Add `_compute_region_output()` helper and `GET /weather/all` endpoint

**Files:**
- Modify: `backend/main.py`

The helper computes `output_mw` and `risk_level` for a single region given its raw weather reading and config. The risk level uses the demand-coverage ratio:
- `ratio = output_mw / avg_demand_mw`
- `ratio < 0.30` → CRITICAL
- `ratio < 0.50` → HIGH
- `ratio < 0.70` → ELEVATED
- else → NOMINAL

- [ ] **Step 1: Write failing test**

Add to `tests/test_weather_all.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from main import app, _compute_region_output, _REGION_CFG

client = TestClient(app)

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
    # Hydro is weather-independent — must equal baseline_mw
    assert result["output_mw"] == cfg["baseline_mw"]

def test_compute_region_output_mixed():
    cfg = _REGION_CFG["Tunis"]
    result = _compute_region_output(cfg, wind_ms=5.1, irradiance=510.0)
    assert result["source"] == "Mixed"
    # Must be >= 0.60 * baseline_mw
    assert result["output_mw"] >= 0.60 * cfg["baseline_mw"]

def test_weather_all_endpoint_returns_24():
    mock_weather = [
        {"region": g["region"], "wind_speed_ms": 5.0, "solar_irradiance_wm2": 500.0}
        for g in _REGION_CFG.values()
    ]
    # build a list matching the 24 keys
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
```

- [ ] **Step 2: Run to confirm failures**

```
python -m pytest tests/test_weather_all.py -k "compute_region or weather_all_endpoint or weather_all_entry" -v
```
Expected: FAIL — `ImportError: cannot import name '_compute_region_output'`

- [ ] **Step 3: Add helper + endpoint to `backend/main.py`**

Add the following imports at the top of `main.py` (they are already present, just verify):
- `from calculations import carbon_score, hydro_power_mw, solar_power_mw, wind_power_mw` ✓
- `from models import ... WeatherAllEntry, WeatherAllResponse` — add these two to the existing import

Update the models import line (around line 25–43) to include the new models:

```python
from models import (
    BlackoutRequest,
    BlackoutResponse,
    CarbonRequest,
    CarbonResponse,
    GridSimulationRequest,
    GridSimulationResponse,
    HistoryRecordRequest,
    HistoryRecordResponse,
    HourlyPrediction,
    HydroRequest,
    PowerResponse,
    RAGRequest,
    RAGResponse,
    RegionHistoryResponse,
    SolarRequest,
    WeatherAllEntry,
    WeatherAllResponse,
    WeatherResponse,
    WindRequest,
)
```

After `_OPENMETEO_URL = ...` (currently line 160), add:

```python
def _compute_region_output(cfg: dict, wind_ms: float, irradiance: float) -> dict:
    """Compute energy output MW and risk level for one region given current weather."""
    source = cfg["source"]
    avg_demand = cfg["avg_demand_mw"]

    if source == "Wind":
        output_mw = wind_power_mw(wind_ms, cfg["rotor_area"], cfg["efficiency"])
    elif source == "Solar":
        output_mw = solar_power_mw(irradiance, cfg["panel_area"], cfg["efficiency"])
    elif source == "Hydro":
        output_mw = cfg["baseline_mw"]
    else:  # Mixed: 60% fossil baseline + 40% wind offset
        wind_offset = wind_power_mw(wind_ms, cfg["rotor_area"], cfg["efficiency"])
        output_mw = 0.60 * cfg["baseline_mw"] + 0.40 * wind_offset

    output_mw = round(max(0.0, output_mw), 2)
    ratio = output_mw / max(avg_demand, 1.0)

    if ratio < 0.30:
        risk = "CRITICAL"
    elif ratio < 0.50:
        risk = "HIGH"
    elif ratio < 0.70:
        risk = "ELEVATED"
    else:
        risk = "NOMINAL"

    return {"output_mw": output_mw, "risk_level": risk, "source": source}
```

After the existing `GET /weather` endpoint (after line ~181), add:

```python
@app.get("/weather/all", response_model=WeatherAllResponse, tags=["Weather"])
async def get_weather_all():
    """
    Fetch current weather for all 24 Tunisian governorates and compute
    energy output + risk level for each. Returns rich per-region data.
    """
    try:
        raw = await fetch_all_weather()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch weather data: {exc}",
        ) from exc

    insert_weather_entries(raw)

    lookup = {entry["region"]: entry for entry in raw}
    results: list[WeatherAllEntry] = []

    for name, cfg in _REGION_CFG.items():
        entry = lookup.get(name, {})
        wind_ms = entry.get("wind_speed_ms", 0.0)
        irradiance = entry.get("solar_irradiance_wm2", 0.0)
        computed = _compute_region_output(cfg, wind_ms, irradiance)
        results.append(WeatherAllEntry(
            region=name,
            wind_ms=round(wind_ms, 3),
            irradiance=round(irradiance, 3),
            output_mw=computed["output_mw"],
            risk_level=computed["risk_level"],
            source=computed["source"],
        ))

    return WeatherAllResponse(data=results)
```

- [ ] **Step 4: Run tests — confirm passing**

```
python -m pytest tests/test_weather_all.py -v
```
Expected: all tests PASS

- [ ] **Step 5: Smoke-test the endpoint manually**

```
cd C:\Users\moham\NoorGrid\backend
uvicorn main:app --reload
# In another terminal:
curl http://localhost:8000/weather/all | python -m json.tool | head -60
```
Expected: JSON with `data` array, 24 entries, each with `region`, `wind_ms`, `irradiance`, `output_mw`, `risk_level`, `source`.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py tests/test_weather_all.py
git commit -m "feat: add /weather/all endpoint with live energy output for all 24 governorates"
```

---

## Task 5: Add `rotor_area` + `efficiency` to Mixed governorates in `grid.js`

**Files:**
- Modify: `frontend-react/src/constants/grid.js`

The 6 Mixed-source entries currently have no `rotor_area` or `efficiency`. These are needed so the frontend can compute output independently when falling back to mock.

- [ ] **Step 1: Add `rotor_area: 15708, efficiency: 0.35` to Tunis**

In `grid.js`, find the Tunis entry (around line 143–156) and add the two fields:

```js
  {
    name: 'Tunis',
    lat: 36.8190, lon: 10.1658,
    source: 'Mixed',
    baseline_mw: 450,
    rotor_area: 15708,
    efficiency: 0.35,
    hasBackend: false,
    ...
  },
```

- [ ] **Step 2: Add `rotor_area` + `efficiency` to the remaining 5 Mixed governorates**

Apply the same pattern — values must match `_REGION_CFG` exactly:

| Governorate | `rotor_area` | `efficiency` |
|---|---|---|
| Ariana | 7854 | 0.35 |
| Ben Arous | 7854 | 0.35 |
| Manouba | 5027 | 0.35 |
| Sousse | 10000 | 0.35 |
| Sfax | 12000 | 0.35 |

- [ ] **Step 3: Verify no lint / parse errors**

```
cd C:\Users\moham\NoorGrid\frontend-react
npm run build 2>&1 | tail -20
```
Expected: build succeeds (or only pre-existing warnings)

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/constants/grid.js
git commit -m "feat: add rotor_area and efficiency to Mixed-source governorates in grid.js"
```

---

## Task 6: Add `getWeatherAll()` to `api.js`

**Files:**
- Modify: `frontend-react/src/services/api.js`

The mock fallback for `/weather/all` must cover all 24 governorates using the static `mock_mw` and `mock_risk` values already in `grid.js`.

- [ ] **Step 1: Add the import and mock at the top of `api.js`**

At line 1 (before `import axios`), add:

```js
import { GOVERNORATES } from '../constants/grid'
```

After the existing `MOCK_WEATHER` constant (after line 21), add:

```js
const MOCK_WEATHER_ALL = GOVERNORATES.map((g) => ({
  region: g.name,
  wind_ms: g.mock_wind,
  irradiance: g.mock_irradiance,
  output_mw: g.mock_mw,
  risk_level: g.mock_risk,
  source: g.source,
}))
```

- [ ] **Step 2: Add `getWeatherAll()` function**

After `getWeather` (after line ~121 in `api.js`), add:

```js
export const getWeatherAll = async () => {
  try {
    const res = await client.get('/weather/all')
    return { data: res.data.data, mock: false }
  } catch {
    return { data: MOCK_WEATHER_ALL, mock: true }
  }
}
```

- [ ] **Step 3: Verify build**

```
npm run build 2>&1 | tail -20
```
Expected: succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/services/api.js
git commit -m "feat: add getWeatherAll() API call with 24-governorate mock fallback"
```

---

## Task 7: Update `useWeather.js` to call `/weather/all`

**Files:**
- Modify: `frontend-react/src/hooks/useWeather.js`

The hook must:
1. Call `getWeatherAll()` instead of `getWeather()`
2. Return a map of `{ [regionName]: { output_mw, risk_level, wind_ms, irradiance } }` so consumers can merge it with `GOVERNORATES` by name

- [ ] **Step 1: Rewrite `useWeather.js`**

Replace the entire file content:

```js
import { useState, useEffect, useCallback, useRef } from 'react'
import { getWeatherAll, getHealth } from '../services/api'

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useWeather() {
  const [weatherMap, setWeatherMap] = useState({})
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [isMock, setIsMock]         = useState(false)
  const [backendOnline, setBackend] = useState(null)
  const timerRef = useRef(null)

  const fetchWeather = useCallback(async () => {
    try {
      const health = await getHealth()
      setBackend(health.online)

      const result = await getWeatherAll()
      // Build lookup map: { "Bizerte": { output_mw, risk_level, wind_ms, irradiance, source }, ... }
      const map = {}
      for (const entry of result.data) {
        map[entry.region] = {
          output_mw:  entry.output_mw,
          risk_level: entry.risk_level,
          wind_ms:    entry.wind_ms,
          irradiance: entry.irradiance,
          source:     entry.source,
        }
      }
      setWeatherMap(map)
      setIsMock(result.mock)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to fetch weather')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWeather()
    timerRef.current = setInterval(fetchWeather, POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchWeather])

  return { weatherMap, loading, error, isMock, backendOnline, refetch: fetchWeather }
}
```

- [ ] **Step 2: Verify build (will fail until Dashboard is updated — check for errors not warnings)**

```
npm run build 2>&1 | grep -i "error"
```
Expected: errors about `weather` → `weatherMap` rename in Dashboard/Analytics (that's fine, next task fixes them)

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/hooks/useWeather.js
git commit -m "feat: useWeather now calls /weather/all and exposes weatherMap keyed by region name"
```

---

## Task 8: Update Dashboard to use live `output_mw` and `risk_level`

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`

The Dashboard currently uses `gov.mock_mw` and `gov.mock_risk` directly in several places. The change: merge live data from `weatherMap` at render time so each `gov` object gets `live_mw` and `live_risk` properties, then use those with mock as fallback.

- [ ] **Step 1: Read the full Dashboard file to find all `mock_mw` / `mock_risk` usages**

```
grep -n "mock_mw\|mock_risk" frontend-react/src/pages/Dashboard.jsx
```

Note the line numbers — they will be the exact spots to update.

- [ ] **Step 2: Add `weatherMap` merge in Dashboard**

In `Dashboard.jsx`, locate where `useWeather` is destructured (around line 7 imports, actual usage somewhere in the component body). Change:

```js
const { weather, loading, error, isMock, backendOnline, refetch } = useWeather()
```
to:
```js
const { weatherMap, loading, error, isMock, backendOnline, refetch } = useWeather()
```

Then, just before the first usage of `GOVERNORATES`, add a merged array:

```js
const govs = GOVERNORATES.map((g) => {
  const live = weatherMap[g.name]
  return live
    ? { ...g, live_mw: live.output_mw, live_risk: live.risk_level }
    : g
})
```

- [ ] **Step 3: Replace every `mock_mw` with `live_mw ?? mock_mw` and `mock_risk` with `live_risk ?? mock_risk`**

In `Dashboard.jsx`, apply these substitutions wherever the values are read (not in the constant definitions in `grid.js` — only in JSX/logic):

- `gov.mock_mw` → `gov.live_mw ?? gov.mock_mw`
- `gov.mock_risk` → `gov.live_risk ?? gov.mock_risk`
- `g.mock_mw` → `g.live_mw ?? g.mock_mw`
- `g.mock_risk` → `g.live_risk ?? g.mock_risk`

Also replace every usage of `GOVERNORATES` that iterates the list with `govs` (the merged array), except the import line.

In `ConsumptionChart`, change:
```js
renewable: g.mock_mw,
```
to:
```js
renewable: g.live_mw ?? g.mock_mw,
```

In `GovCard`:
```js
const risk  = effectiveRisk || gov.mock_risk
```
→
```js
const risk  = effectiveRisk || gov.live_risk || gov.mock_risk
```

And:
```js
{gov.mock_mw} MW
```
→
```js
{(gov.live_mw ?? gov.mock_mw)} MW
```

In `GovernorateStats`, replace:
```js
const coveragePct = gov.avg_demand_mw
  ? Math.min((gov.mock_mw / gov.avg_demand_mw) * 100, 150)
  : null
const utilizationPct = gov.installed_capacity_mw
  ? Math.min((gov.mock_mw / gov.installed_capacity_mw) * 100, 100)
  : null
```
with:
```js
const outputMw = gov.live_mw ?? gov.mock_mw
const coveragePct = gov.avg_demand_mw
  ? Math.min((outputMw / gov.avg_demand_mw) * 100, 150)
  : null
const utilizationPct = gov.installed_capacity_mw
  ? Math.min((outputMw / gov.installed_capacity_mw) * 100, 100)
  : null
```

And update the StatCell for "Live Output":
```js
value={`${gov.mock_mw} MW`}
```
→
```js
value={`${gov.live_mw ?? gov.mock_mw} MW`}
```

- [ ] **Step 4: Update `TunisiaMap` prop (if it receives a governorates array)**

Search for where `TunisiaMap` is rendered — if it receives `GOVERNORATES` as a prop, pass `govs` instead:
```jsx
<TunisiaMap governorates={govs} ... />
```

- [ ] **Step 5: Build and verify no errors**

```
cd C:\Users\moham\NoorGrid\frontend-react
npm run build 2>&1 | tail -30
```
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend-react/src/pages/Dashboard.jsx
git commit -m "feat: Dashboard uses live output_mw and risk_level from /weather/all with mock fallback"
```

---

## Task 9: Update Analytics to use `weatherMap`

**Files:**
- Modify: `frontend-react/src/pages/Analytics.jsx`

- [ ] **Step 1: Find all `mock_mw` / `mock_risk` / `weather` usages in Analytics**

```
grep -n "mock_mw\|mock_risk\|useWeather\|\.weather" frontend-react/src/pages/Analytics.jsx
```

- [ ] **Step 2: Apply the same `weatherMap` merge pattern**

In `Analytics.jsx`, wherever `useWeather` is destructured, change `weather` → `weatherMap`. Then build the merged `govs` array the same way as in Task 8:

```js
const { weatherMap, loading, isMock } = useWeather()

const govs = GOVERNORATES.map((g) => {
  const live = weatherMap[g.name]
  return live
    ? { ...g, live_mw: live.output_mw, live_risk: live.risk_level }
    : g
})
```

Replace `gov.mock_mw` → `gov.live_mw ?? gov.mock_mw` and `gov.mock_risk` → `gov.live_risk ?? gov.mock_risk` throughout.

- [ ] **Step 3: Build and verify**

```
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/pages/Analytics.jsx
git commit -m "feat: Analytics uses live weatherMap data with mock fallback"
```

---

## Acceptance Criteria Checklist

- [ ] All 24 governorate map markers show live weather-derived output and risk level
- [ ] `GET /weather/all` returns 24 entries with `{region, wind_ms, irradiance, output_mw, risk_level, source}`
- [ ] Dashboard sidebar risk groupings (CRITICAL/HIGH/ELEVATED/NOMINAL) update from real data
- [ ] When backend is offline, Dashboard falls back to `mock_mw`/`mock_risk` gracefully
- [ ] All backend tests pass: `python -m pytest tests/ -v`
- [ ] Frontend build succeeds: `npm run build`
- [ ] `/weather/all` response time < 3s (24 parallel fetches via `asyncio.gather`)
