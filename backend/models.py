"""
Pydantic request/response models for the NoorGrid API.
"""

from pydantic import BaseModel, Field


# ── Request models ────────────────────────────────────────────────────────────

class WindRequest(BaseModel):
    wind_speed: float = Field(..., gt=0, description="Wind speed in m/s")
    rotor_area: float = Field(..., gt=0, description="Rotor swept area in m²")
    efficiency: float = Field(..., gt=0, le=1, description="Turbine efficiency (0–1)")


class SolarRequest(BaseModel):
    irradiance: float = Field(..., gt=0, description="Solar irradiance in W/m²")
    panel_area: float = Field(..., gt=0, description="Total panel area in m²")
    efficiency: float = Field(..., gt=0, le=1, description="Panel efficiency (0–1)")


class HydroRequest(BaseModel):
    flow_rate: float = Field(..., gt=0, description="Water flow rate in m³/s")
    head_height: float = Field(..., gt=0, description="Head height in metres")
    efficiency: float = Field(..., gt=0, le=1, description="Turbine efficiency (0–1)")


class CarbonRequest(BaseModel):
    region: str = Field(..., description="Region / governorate name")
    consumption_kwh: float = Field(..., ge=0, description="Total energy consumed in kWh")
    renewable_kwh: float = Field(..., ge=0, description="Renewable energy produced in kWh")


# ── Response models ───────────────────────────────────────────────────────────

class PowerResponse(BaseModel):
    power_mw: float = Field(..., description="Power output in MW")


class CarbonResponse(BaseModel):
    region: str
    carbon_score_kg: float = Field(..., description="Carbon score in kg CO₂")


class WeatherEntry(BaseModel):
    region: str
    latitude: float
    longitude: float
    wind_speed_ms: float = Field(..., description="Wind speed at 10 m in m/s")
    solar_irradiance_wm2: float = Field(..., description="Global horizontal irradiance in W/m²")


class WeatherResponse(BaseModel):
    data: list[WeatherEntry]


# ── Blackout prediction models ────────────────────────────────────────────────

class BlackoutRequest(BaseModel):
    region: str = Field(..., description="Governorate name")
    forecast_hours: int = Field(default=24, ge=1, le=72)


class HourlyPrediction(BaseModel):
    hour: int = Field(..., description="Forecast hour index (0 = first forecast hour)")
    time_label: str = Field(..., description="Local time label e.g. '14:00'")
    temperature: float = Field(..., description="Air temperature in °C")
    estimated_demand_mw: float
    available_mw: float
    stress_ratio: float
    risk_level: str
    blackout_probability: float = Field(..., description="0–100 %")
    prevention_action: str


class BlackoutResponse(BaseModel):
    region: str
    predictions: list[HourlyPrediction]
