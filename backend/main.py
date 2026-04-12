"""
NoorGrid FastAPI backend — renewable energy production API.
"""

import os
import sys

# Ensure backend/ is on sys.path so sibling modules resolve regardless of
# which directory uvicorn is launched from.
sys.path.insert(0, os.path.dirname(__file__))

# Load .env from the repo root (one directory above backend/).
# Must happen before any os.getenv() call.
from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=_env_path, override=False)

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from calculations import carbon_score, hydro_power_mw, solar_power_mw, wind_power_mw
from db import get_region_history, init_db, insert_weather_entries
from grid import GridInputs, simulate_national_grid
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
    WeatherResponse,
    WindRequest,
)
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


@app.on_event("startup")
def startup_event():
    init_db()


@app.get("/health")
def health_check():
    return {"status": "ok"}


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

    Formula: C = (E_consumed − E_renewable) × 0.468
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
    "Bizerte":     {"lat": 37.2744, "lon": 9.8739,  "source": "Wind",  "baseline_mw": 97.0,
                    "rotor_area": 7854.0,   "efficiency": 0.40},
    "Nabeul":      {"lat": 36.4561, "lon": 10.7376, "source": "Wind",  "baseline_mw": 55.0,
                    "rotor_area": 4418.0,   "efficiency": 0.40},
    "Tozeur":      {"lat": 33.9197, "lon": 8.1335,  "source": "Solar", "baseline_mw": 20.0,
                    "panel_area": 120_000.0, "efficiency": 0.18},
    "Béja":        {"lat": 36.7256, "lon": 9.1817,  "source": "Hydro", "baseline_mw": 33.0},
    "Sidi Bouzid": {"lat": 35.0382, "lon": 9.4858,  "source": "Solar", "baseline_mw": 100.0,
                    "panel_area": 600_000.0, "efficiency": 0.18},
}

_OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"


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

    for i in range(n):
        temp  = float(temps[i])        if i < len(temps)       else 20.0
        wind  = float(wind_speeds[i])  if i < len(wind_speeds) else 0.0
        irr   = float(irradiances[i])  if i < len(irradiances) else 0.0
        label = times[i][11:16]        if i < len(times)       else f"{i:02d}:00"

        # Cooling demand factor — rises sharply above 25 °C
        cooling_factor = max(0.0, (temp - 25) * 0.08)
        baseline = cfg["baseline_mw"]
        estimated_demand_mw = baseline * (1 + cooling_factor)

        # Available renewable MW from weather forecast
        source = cfg["source"]
        if source == "Wind":
            available_mw = max(0.1, wind_power_mw(wind, cfg["rotor_area"], cfg["efficiency"]))
        elif source == "Solar":
            available_mw = max(0.1, solar_power_mw(irr, cfg["panel_area"], cfg["efficiency"]))
        else:  # Hydro — weather-independent
            available_mw = baseline

        stress_ratio = estimated_demand_mw / max(available_mw, 1.0)

        if stress_ratio > 4.0:
            risk = "CRITICAL"
        elif stress_ratio > 2.5:
            risk = "HIGH"
        elif stress_ratio > 1.5:
            risk = "ELEVATED"
        else:
            risk = "NOMINAL"

        blackout_probability = round(min(100.0, max(0.0, (stress_ratio - 1) * 25)), 1)

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
            prevention_action=action,
        ))

    return BlackoutResponse(region=req.region, predictions=predictions)


# ── RAG chatbot endpoint ──────────────────────────────────────────────────────

_NIM_URL   = "https://integrate.api.nvidia.com/v1/chat/completions"
_NIM_MODEL = "meta/llama-3.1-70b-instruct"

_GUARDRAIL_MARKER = "Outside my operational domain"

_SYSTEM_PROMPT = """\
You are the NoorGrid Operations AI — the intelligence layer for Tunisia's national \
energy grid management platform, built in partnership with STEG \
(Société Tunisienne de l'Electricité et du Gaz).

KNOWLEDGE DOMAINS:
▸ Grid capacity & infrastructure: 5,944 MW installed, 4,636 MW effective, 22% grid losses
▸ August 14, 2024 crisis: 4,888 MW peak demand, 252 MW deficit, Algeria emergency import activated
▸ Renewable resources (24 governorates): solar (Tozeur 820 W/m², Sidi Bouzid 750 W/m²), \
wind (Bizerte 8.2 m/s, Kasserine 8.5 m/s), hydro (Béja 33 MW, Jendouba 42 MW)
▸ Algeria–Tunisia Transmed HVDC: 600 MW capacity, 14% of peak demand dependency
▸ Blackout risk scoring: demand stress 40%, temperature deviation 25%, \
rate-of-change 20%, regional correlation 15%
▸ Maintenance schedules and STEG outage protocols (Q2/Q3 2025)
▸ Investment pipeline 2025–2030: €585M committed — Sidi Bouzid solar 200 MW, \
Bizerte offshore wind 120 MW, Sfax battery 150 MWh
▸ Carbon & emissions: 0.468 kg CO₂/kWh grid factor, NDC target 1.80 kg CO₂/cap/day by 2030
▸ Generation mix: 93.7% fossil, 6.0% renewable — gap vs 35% target by 2030
▸ Energy independence: 41% (2024), down from 48% (2023)

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
    system_content = _SYSTEM_PROMPT
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
