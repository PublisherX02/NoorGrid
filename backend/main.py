"""
NoorGrid FastAPI backend — renewable energy production API.
"""

import os
import sys
import json

# Ensure backend/ is on sys.path so sibling modules resolve regardless of
# which directory uvicorn is launched from.
sys.path.insert(0, os.path.dirname(__file__))

# Load .env from the repo root (one directory above backend/).
# Must happen before any os.getenv() call.
from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=_env_path, override=False)

import datetime
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from calculations import carbon_score, hydro_power_mw, solar_power_mw, wind_power_mw
from db import get_alerts_feed, get_region_history, init_db, insert_alert, insert_weather_entries
from grid import GridInputs, simulate_national_grid
from models import (
    AlertSimulateRequest,
    AlertSimulateResponse,
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
    NationalStatsResponse,
    PowerResponse,
    RAGRequest,
    RAGResponse,
    RegionHistoryResponse,
    ReportRequest,
    ReportResponse,
    ReportSendRequest,
    ReportSendResponse,
    SolarRequest,
    WeatherAllEntry,
    WeatherAllResponse,
    WeatherResponse,
    WindRequest,
)
from report import generate_report_from_nim
from weather import fetch_all_weather

app = FastAPI(
    title="NoorGrid API",
    description="Renewable energy production calculations for Tunisia",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


_scheduler = AsyncIOScheduler()

_FACTS_PATH = os.path.join(os.path.dirname(__file__), "data", "tunisia_energy_facts_2024_2025.json")

# Load once at import time — used by _compute_region_output and prediction loop
with open(_FACTS_PATH, "r", encoding="utf-8") as _f:
    _NATIONAL_FACTS: dict = json.load(_f)


def _load_national_facts() -> dict:
    """Return the cached national facts. File is read once at startup."""
    return _NATIONAL_FACTS


async def scheduled_ingest() -> None:
    """Fetch weather for all 24 regions, compute output_mw, persist to DB."""
    try:
        raw = await fetch_all_weather()
        enriched = []
        for entry in raw:
            cfg = _REGION_CFG.get(entry["region"])
            if cfg:
                computed = _compute_region_output(
                    cfg,
                    entry["wind_speed_ms"],
                    entry["solar_irradiance_wm2"],
                )
                entry["output_mw"] = computed["output_mw"]
            enriched.append(entry)
        count = insert_weather_entries(enriched)
        print(f"[scheduler] ingested {count} weather records")
    except Exception as exc:
        print(f"[scheduler] ingest error: {exc}")


@app.on_event("startup")
async def startup_event():
    init_db()
    _scheduler.add_job(scheduled_ingest, "interval", minutes=15, id="weather_ingest")
    _scheduler.start()
    print("[scheduler] weather ingestion scheduled every 15 minutes")


@app.on_event("shutdown")
async def shutdown_event():
    _scheduler.shutdown(wait=False)
    print("[scheduler] stopped")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/stats/national", response_model=NationalStatsResponse, tags=["Stats"])
def get_national_stats():
    return NationalStatsResponse(**_load_national_facts())


# ── Energy calculation endpoints ──────────────────────────────────────────────

@app.post("/energy/wind", response_model=PowerResponse, tags=["Energy"])
def calculate_wind(req: WindRequest):
    """
    Calculate wind power output in MW.

    Formula: P = 0.5 × ρ × A × v³ × η
    """
    try:
        mw = wind_power_mw(req.wind_speed, req.rotor_area, req.efficiency)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PowerResponse(power_mw=mw)


@app.post("/energy/solar", response_model=PowerResponse, tags=["Energy"])
def calculate_solar(req: SolarRequest):
    """
    Calculate solar power output in MW.

    Formula: P = G × A × η
    """
    try:
        mw = solar_power_mw(req.irradiance, req.panel_area, req.efficiency)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PowerResponse(power_mw=mw)


@app.post("/energy/hydro", response_model=PowerResponse, tags=["Energy"])
def calculate_hydro(req: HydroRequest):
    """
    Calculate hydro power output in MW.

    Formula: P = ρ × g × Q × H × η
    """
    try:
        mw = hydro_power_mw(req.flow_rate, req.head_height, req.efficiency)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PowerResponse(power_mw=mw)


@app.post("/energy/carbon", response_model=CarbonResponse, tags=["Carbon"])
def calculate_carbon(req: CarbonRequest):
    """
    Calculate regional carbon score in kg CO₂.

    Formula: C = (E_consumed − E_renewable) × 0.423
    """
    try:
        score = carbon_score(req.consumption_kwh, req.renewable_kwh)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return CarbonResponse(region=req.region, carbon_score_kg=score)


@app.post("/grid/simulate", response_model=GridSimulationResponse, tags=["Grid"])
def simulate_grid(req: GridSimulationRequest):
    result = simulate_national_grid(
        GridInputs(
            renewable_output_mw=req.renewable_output_mw,
            demand_delta_pct=req.demand_delta_pct,
            temperature_c=req.temperature_c,
            include_peak_hour_factor=req.include_peak_hour_factor,
            reserve_capacity_mw=req.reserve_capacity_mw,
        )
    )
    return GridSimulationResponse(**result)


# ── Region config for blackout prediction ────────────────────────────────────
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

# Prevention actions by energy source and risk level
_PREVENTION_ACTIONS: dict[str, dict[str, list[str]]] = {
    "Wind": {
        "CRITICAL": [
            "Activate reserve capacity at nearest thermal plant",
            "Shed non-critical industrial load (20%)",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Monitor wind forecast — potential capacity drop",
            "Pre-position reserve capacity",
            "Notify regional operators",
        ],
    },
    "Solar": {
        "CRITICAL": [
            "Switch affected region to fossil baseline",
            "Reduce cross-region export allocation",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Increase cloud-cover monitoring interval",
            "Prepare fossil baseline switchover",
            "Notify regional operators",
        ],
    },
    "Hydro": {
        "CRITICAL": [
            "Open spillway reserve — maintain minimum head",
            "Reduce downstream water allocation",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Review reservoir levels against seasonal baseline",
            "Coordinate with SONEDE on flow reduction",
            "Notify regional operators",
        ],
    },
    "Mixed": {
        "CRITICAL": [
            "Activate Ghannouch backup generation",
            "Reduce industrial load by 20% in affected zone",
            "Alert STEG National Dispatch Center",
        ],
        "HIGH": [
            "Increase gas supply monitoring",
            "Pre-activate renewable supplement",
            "Notify regional operators",
        ],
    },
}

_OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"


def _compute_region_output(cfg: dict, wind_ms: float, irradiance: float) -> dict:
    """Compute energy output MW and risk level for one region given current weather."""
    source = cfg["source"]
    avg_demand = cfg["avg_demand_mw"]
    facts = _load_national_facts()
    fossil_share = max(0.0, min(1.0, float(facts.get("fossil_generation_share_pct", 93.7)) / 100.0))

    if source == "Wind":
        renewable_mw = wind_power_mw(wind_ms, cfg["rotor_area"], cfg["efficiency"])
        fossil_baseline_mw = avg_demand * fossil_share
        output_mw = renewable_mw + fossil_baseline_mw
    elif source == "Solar":
        renewable_mw = solar_power_mw(irradiance, cfg["panel_area"], cfg["efficiency"])
        fossil_baseline_mw = avg_demand * fossil_share
        output_mw = renewable_mw + fossil_baseline_mw
    elif source == "Hydro":
        # Keep hydro output stable as configured baseline.
        output_mw = cfg["baseline_mw"]
    else:  # Mixed: renewable component from weathered wind offset + fossil backbone
        wind_offset = wind_power_mw(wind_ms, cfg["rotor_area"], cfg["efficiency"])
        renewable_mw = 0.40 * wind_offset
        fossil_baseline_mw = avg_demand * fossil_share
        output_mw = renewable_mw + fossil_baseline_mw

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


# ── Weather data endpoint ─────────────────────────────────────────────────────

@app.get("/weather", response_model=WeatherResponse, tags=["Weather"])
async def get_weather():
    """
    Fetch current wind speed and solar irradiance for all Tunisian
    governorates from the Open-Meteo free API.
    """
    try:
        entries = await fetch_all_weather()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch weather data: {exc}",
        ) from exc

    insert_weather_entries(entries)
    return WeatherResponse(data=entries)


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


@app.post("/history/record", response_model=HistoryRecordResponse, tags=["History"])
def record_history(req: HistoryRecordRequest):
    inserted = insert_weather_entries([entry.model_dump() for entry in req.data])
    return HistoryRecordResponse(inserted=inserted)


@app.get("/history/{region}", response_model=RegionHistoryResponse, tags=["History"])
def get_history(region: str, days: int = 7):
    if days < 1 or days > 365:
        raise HTTPException(status_code=422, detail="days must be between 1 and 365")

    records = get_region_history(region, days)
    return RegionHistoryResponse(region=region, days=days, records=records)


# ── Alert simulation endpoints ────────────────────────────────────────────────

@app.post("/alerts/simulate", response_model=AlertSimulateResponse, tags=["Alerts"])
def simulate_alert(req: AlertSimulateRequest):
    """
    Inject a simulated crisis alert for demo and testing purposes.
    Validates the region, derives prevention actions from its energy source,
    persists to alerts_log, and returns the full alert object.
    """
    cfg = _REGION_CFG.get(req.region)
    if not cfg:
        raise HTTPException(
            status_code=422,
            detail=f"Region '{req.region}' not found. Must be one of the 24 Tunisian governorates.",
        )

    source = cfg["source"]
    level_actions = _PREVENTION_ACTIONS.get(source, {})
    actions = level_actions.get(req.risk_level, [
        "Assess situation and contact STEG Dispatch Center",
        "Review affected region capacity",
        "Alert on-call operations team",
    ])

    alert_id = 0
    triggered_at = datetime.datetime.utcnow().isoformat()
    try:
        alert_id = insert_alert(
            region=req.region,
            risk_level=req.risk_level,
            scenario_label=req.scenario_label,
            prevention_actions=actions,
            is_test=True,
        )
        # Retrieve the stored record to get the DB-generated triggered_at timestamp
        feed = get_alerts_feed(limit=1)
        if feed:
            triggered_at = feed[0]["triggered_at"]
    except Exception as exc:
        print(f"[alerts] failed to persist simulated alert: {exc}")

    return AlertSimulateResponse(
        id=alert_id,
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        prevention_actions=actions,
        triggered_at=triggered_at,
        is_test=True,
    )


@app.get("/alerts/feed", response_model=list[AlertSimulateResponse], tags=["Alerts"])
def get_alerts(limit: int = 10):
    """Return the most recent alerts (real + simulated), newest first."""
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 50")
    rows = get_alerts_feed(limit=limit)
    return [AlertSimulateResponse(**row) for row in rows]


# ── Report generation endpoints ───────────────────────────────────────────────

@app.post("/report/generate", response_model=ReportResponse, tags=["Report"])
async def generate_report(req: ReportRequest):
    """
    Generate an AI-powered incident diagnosis report for a triggered crisis.
    Calls NVIDIA NIM; falls back to mock report if the key is absent.
    """
    nim_result = await generate_report_from_nim(
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        source=req.source,
        magnitude_mw=req.magnitude_mw,
        cascade_regions=[c.model_dump() for c in req.cascade_regions],
        prevention_actions=req.prevention_actions,
    )
    generated_at = datetime.datetime.utcnow().isoformat()
    return ReportResponse(
        region=req.region,
        risk_level=req.risk_level,
        scenario_label=req.scenario_label,
        source=req.source,
        magnitude_mw=req.magnitude_mw,
        cascade_regions=req.cascade_regions,
        prevention_actions=req.prevention_actions,
        root_cause=nim_result.get("root_cause", ""),
        technical_fix=nim_result.get("technical_fix", ""),
        impact_summary=nim_result.get("impact_summary", ""),
        recommended_actions=nim_result.get("recommended_actions", []),
        generated_at=generated_at,
    )


@app.post("/report/send", response_model=ReportSendResponse, tags=["Report"])
def send_report(req: ReportSendRequest):
    """
    Simulate dispatching an incident report email to engineers/technicians.
    Logs the send to stdout. Does not deliver real email (simulation mode).
    """
    sent_at = datetime.datetime.utcnow().isoformat()
    print(
        f"[report] SIMULATED SEND — scenario='{req.report.scenario_label}' "
        f"region={req.report.region} risk={req.report.risk_level} "
        f"recipients={req.recipients} sent_at={sent_at}"
    )
    return ReportSendResponse(sent=True, recipients=req.recipients, sent_at=sent_at)


# ── Blackout prediction endpoint ──────────────────────────────────────────────

@app.post("/predict/blackout", response_model=BlackoutResponse, tags=["Prediction"])
async def predict_blackout(req: BlackoutRequest):
    """
    Forecast hourly blackout probability for a governorate over the next
    N hours using OpenMeteo hourly weather data and grid stress modelling.
    """
    cfg = _REGION_CFG.get(req.region)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Region '{req.region}' not found")

    params = {
        "latitude": cfg["lat"],
        "longitude": cfg["lon"],
        "hourly": "temperature_2m,wind_speed_10m,shortwave_radiation",
        "forecast_hours": req.forecast_hours,
        "wind_speed_unit": "ms",
        "timezone": "Africa/Tunis",
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(_OPENMETEO_URL, params=params, timeout=15.0)
            resp.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weather forecast unavailable: {exc}") from exc

    hourly = resp.json().get("hourly", {})
    times       = hourly.get("time", [])
    temps       = hourly.get("temperature_2m", [])
    wind_speeds = hourly.get("wind_speed_10m", [])
    irradiances = hourly.get("shortwave_radiation", [])

    predictions: list[HourlyPrediction] = []
    n = min(req.forecast_hours, len(temps))

    facts = _load_national_facts()
    fossil_share = max(0.0, min(1.0, float(facts.get("fossil_generation_share_pct", 93.7)) / 100.0))

    for i in range(n):
        temp  = float(temps[i])        if i < len(temps)       else 20.0
        wind  = float(wind_speeds[i])  if i < len(wind_speeds) else 0.0
        irr   = float(irradiances[i])  if i < len(irradiances) else 0.0
        label = times[i][11:16]        if i < len(times)       else f"{i:02d}:00"

        # Cooling demand factor — rises sharply above 25 °C
        cooling_factor = max(0.0, (temp - 25) * 0.08)
        avg_demand = cfg["avg_demand_mw"]

        # Hour-of-day peak factor
        hour = int(label[:2]) if label and len(label) >= 2 else 12
        if (8 <= hour <= 12) or (18 <= hour <= 22):
            peak_factor = 1.15   # morning and evening peaks
        elif 1 <= hour <= 5:
            peak_factor = 0.75   # overnight trough
        else:
            peak_factor = 1.0

        # Seasonal factor
        month = datetime.datetime.now().month
        if month in (6, 7, 8, 9):
            seasonal_factor = 1.12   # summer cooling load
        elif month in (12, 1, 2):
            seasonal_factor = 1.08   # winter heating load
        else:
            seasonal_factor = 1.0

        estimated_demand_mw = avg_demand * (1 + cooling_factor) * peak_factor * seasonal_factor

        # Available renewable MW from weather forecast
        source = cfg["source"]
        installed_capacity = cfg["installed_capacity_mw"]
        if source == "Wind":
            renewable_mw = max(0.1, wind_power_mw(wind, cfg["rotor_area"], cfg["efficiency"]))
        elif source == "Solar":
            renewable_mw = max(0.1, solar_power_mw(irr, cfg["panel_area"], cfg["efficiency"]))
        elif source == "Mixed":
            # 40% renewable wind offset + 60% fossil backbone (mirrors _compute_region_output)
            wind_offset = wind_power_mw(wind, cfg["rotor_area"], cfg["efficiency"])
            renewable_mw = max(0.1, 0.40 * wind_offset)
        else:  # Hydro — weather-independent, runs at rated capacity
            renewable_mw = installed_capacity

        # Tunisia's grid is predominantly fossil-backed; include fossil baseline
        # using avg_demand as the reference (consistent with _compute_region_output).
        fossil_baseline_mw = avg_demand * fossil_share
        available_mw = max(0.1, renewable_mw + fossil_baseline_mw)

        # Stress = demand vs effective available supply (fossil baseline + renewable)
        stress_ratio = estimated_demand_mw / max(available_mw, 1.0)

        if stress_ratio > 1.4:
            risk = "CRITICAL"
        elif stress_ratio > 1.2:
            risk = "HIGH"
        elif stress_ratio > 1.0:
            risk = "ELEVATED"
        else:
            risk = "NOMINAL"

        # Renewable output reduces probability by up to 30%
        renewable_pct = min(1.0, available_mw / max(installed_capacity, 0.1))
        base_prob = (stress_ratio - 0.5) * 50
        blackout_probability = round(min(100.0, max(0.0, base_prob * (1.0 - renewable_pct * 0.3))), 1)

        if risk == "CRITICAL":
            action = ("EMERGENCY LOAD SHEDDING REQUIRED"
                      " — Import from Algeria via Transmed pipeline")
        elif risk == "HIGH":
            action = (f"ACTIVATE RESERVE CAPACITY"
                      f" — Reduce industrial consumption in {req.region}")
        elif risk == "ELEVATED":
            action = "MONITOR CLOSELY — Prepare demand response protocols"
        else:
            action = "NO ACTION REQUIRED"

        predictions.append(HourlyPrediction(
            hour=i,
            time_label=label,
            temperature=round(temp, 1),
            estimated_demand_mw=round(estimated_demand_mw, 2),
            available_mw=round(available_mw, 2),
            stress_ratio=round(stress_ratio, 3),
            risk_level=risk,
            blackout_probability=blackout_probability,
            probability_low=round(max(0.0, blackout_probability - 12.0), 1),
            probability_high=round(min(100.0, blackout_probability + 12.0), 1),
            prevention_action=action,
        ))

    return BlackoutResponse(region=req.region, predictions=predictions)


# ── RAG chatbot endpoint ──────────────────────────────────────────────────────

_NIM_URL   = "https://integrate.api.nvidia.com/v1/chat/completions"
_NIM_MODEL = "meta/llama-3.1-70b-instruct"

_GUARDRAIL_MARKER = "Outside my operational domain"

_SYSTEM_PROMPT_TEMPLATE = """\
You are the NoorGrid Operations AI — the intelligence layer for Tunisia's national \
energy grid management platform, built in partnership with STEG \
(Société Tunisienne de l'Electricité et du Gaz).

KNOWLEDGE DOMAINS:
▸ Grid capacity & infrastructure: {installed_capacity_mw:,.0f}–{installed_capacity_upper_mw:,.0f} MW installed, STEG controls {steg_capacity_share_pct:.1f}% of capacity
▸ August 14, 2024 crisis: 4,888 MW peak demand, 252 MW deficit, Algeria emergency import activated
▸ Renewable resources (24 governorates): solar (Tozeur 820 W/m², Sidi Bouzid 750 W/m²), \
wind (Bizerte 8.2 m/s, Kasserine 8.5 m/s), hydro (Béja 33 MW, Jendouba 42 MW)
▸ Algeria–Tunisia Transmed HVDC: 600 MW capacity, 14% of peak demand dependency
▸ Blackout risk scoring: demand stress 40%, temperature deviation 25%, \
rate-of-change 20%, regional correlation 15%
▸ Maintenance schedules and STEG outage protocols (Q2/Q3 2025)
▸ Investment pipeline 2025–2030: €585M committed — Sidi Bouzid solar 200 MW, \
Bizerte offshore wind 120 MW, Sfax battery 150 MWh
▸ Carbon & emissions: {grid_carbon_intensity_gco2_per_kwh:.0f} gCO₂/kWh grid factor, NDC target 1.80 kg CO₂/cap/day by 2030
▸ Generation mix: {fossil_generation_share_pct:.1f}% fossil (natural gas {natural_gas_share_pct:.1f}%), heavy fuel oil {heavy_fuel_oil_share_pct:.1f}%
▸ STEG generation share: {steg_generation_share_pct_2024:.1f}% in 2024, {steg_generation_share_pct_2025:.1f}% in 2025
▸ Energy independence: {energy_independence_q1_2025_pct:.1f}% in Q1 2025
▸ Energy trade deficit: {trade_deficit_tnd_billion_2025:.2f} billion TND by end 2025
▸ Total generation: {total_generation_gwh_2024:,.0f} GWh (2024), {total_generation_gwh_2025:,.0f} GWh (2025)
▸ Nawara gas field: production down {nawara_output_change_pct_2025_abs:.0f}% in early 2025
▸ Algeria gas imports: up {algeria_gas_imports_change_pct_2025:.0f}% in 2025; electricity imports cover {electricity_import_coverage_summer_2025_pct:.0f}% of August peak demand

RESPONSE FORMAT: Structure your answers with ALL-CAPS section headers where useful, \
▸ bullet points for lists, and precise numerical values (MW, %, °C, m/s). \
Be concise — operational staff need fast, accurate answers. Avoid preamble.

GUARDRAILS: You ONLY answer questions about energy systems, grid operations, STEG policies, \
Tunisia's electricity sector, renewable energy, blackout prediction, maintenance, or investment. \
If a question falls outside this domain (sports, politics, personal topics, general knowledge, \
programming, etc.), your ENTIRE response must be exactly this sentence and nothing else: \
"Outside my operational domain. I am specialized for STEG grid operations, \
renewable energy, and Tunisia's electricity sector."\
"""


def _build_context_block(context: dict) -> str:
    """Serialize frontend grid state into a compact text block for the system prompt."""
    parts: list[str] = []

    sim    = context.get("simResult")
    params = context.get("simParams") or {}

    if sim and isinstance(sim, dict):
        parts.append("ACTIVE SIMULATION STATE:")
        parts.append(f"  Risk level       : {sim.get('risk_level', '—')}  "
                     f"(score {float(sim.get('risk_score', 0)):.0f}/100)")
        parts.append(f"  Total demand     : {float(sim.get('total_demand_mw', 0)):,.0f} MW")
        parts.append(f"  Effective cap.   : {float(sim.get('effective_capacity_mw', 0)):,.0f} MW")
        parts.append(f"  Headroom         : {float(sim.get('headroom_pct', 0)):.1f}%")
        parts.append(f"  Renewable share  : {float(sim.get('renewable_share_pct', 0)):.1f}%")
        parts.append(f"  Import required  : {float(sim.get('import_required_mw', 0)):.0f} MW")
        if params:
            parts.append(f"  Temperature      : {params.get('temperature_c', '—')}°C")
            delta = params.get('demand_delta_pct', 0)
            parts.append(f"  Demand delta     : {delta:+}%")
        parts.append(f"  Recommended      : {sim.get('recommended_action', '—')}")

    gov = context.get("selectedGov")
    if gov and isinstance(gov, dict):
        parts.append(f"SELECTED GOVERNORATE: {gov.get('name', '—')} "
                     f"({gov.get('region', '—')})")
        parts.append(f"  Energy source    : {gov.get('source', '—')}")
        parts.append(f"  Live output      : {gov.get('mock_mw', '—')} MW")
        parts.append(f"  Risk status      : {gov.get('mock_risk', '—')}")

    if context.get("isReplay"):
        parts.append("REPLAY MODE: August 14, 2024 crisis scenario is active.")

    return "\n".join(parts) if parts else ""


@app.post("/rag/query", response_model=RAGResponse, tags=["RAG"])
async def rag_query(req: RAGRequest):
    """
    Query the NoorGrid/STEG knowledge base via NVIDIA NIM LLM.
    Raises 503 if the API key is absent, 502 on NIM network/HTTP errors.
    The frontend falls back to its local mock on any non-2xx response.
    """
    nim_key = os.getenv("NVIDIA_NIM_API_KEY", "").strip()
    if not nim_key:
        raise HTTPException(status_code=503, detail="NVIDIA_NIM_API_KEY not configured")

    # Build dynamic system prompt with injected grid context
    context_block = _build_context_block(req.context)
    system_content = _SYSTEM_PROMPT_TEMPLATE.format(**_load_national_facts())
    if context_block:
        system_content += (
            "\n\nCURRENT PLATFORM STATE (live data from the frontend dashboard):\n"
            + context_block
        )

    payload = {
        "model": _NIM_MODEL,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user",   "content": req.message},
        ],
        "temperature": 0.25,
        "top_p": 0.90,
        "max_tokens": 700,
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {nim_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as http:
            nim_resp = await http.post(
                _NIM_URL, json=payload, headers=headers, timeout=30.0
            )
            nim_resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NIM API returned {exc.response.status_code}: "
                   f"{exc.response.text[:300]}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NIM API unreachable: {exc}",
        ) from exc

    data     = nim_resp.json()
    content  = data["choices"][0]["message"]["content"].strip()
    rejected = content.startswith(_GUARDRAIL_MARKER)

    return RAGResponse(
        response=content,
        model=data.get("model", _NIM_MODEL),
        mock=False,
        rejected=rejected,
    )
