"""
NoorGrid FastAPI backend — renewable energy production API.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from calculations import carbon_score, hydro_power_mw, solar_power_mw, wind_power_mw
from models import (
    CarbonRequest,
    CarbonResponse,
    HydroRequest,
    PowerResponse,
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
    return WeatherResponse(data=entries)
