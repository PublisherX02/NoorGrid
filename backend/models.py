"""
Pydantic request/response models for the NoorGrid API.
"""

from typing import Literal
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


class GridSimulationRequest(BaseModel):
    renewable_output_mw: float = Field(..., ge=0, description="Current total renewable output in MW")
    demand_delta_pct: float = Field(default=0, ge=-50, le=100, description="Demand adjustment in %")
    temperature_c: float = Field(default=25, ge=-10, le=60, description="Ambient temperature in °C")
    include_peak_hour_factor: bool = Field(default=True)
    reserve_capacity_mw: float = Field(default=0, ge=0, description="Dispatchable reserve capacity in MW")


# ── Response models ───────────────────────────────────────────────────────────

class PowerResponse(BaseModel):
    power_mw: float = Field(..., description="Power output in MW")


class CarbonResponse(BaseModel):
    region: str
    carbon_score_kg: float = Field(..., description="Carbon score in kg CO₂")


class GridSimulationResponse(BaseModel):
    total_demand_mw: float
    renewable_output_mw: float
    effective_capacity_mw: float
    deficit_mw: float
    import_required_mw: float
    import_reliance_pct: float
    renewable_share_pct: float
    headroom_pct: float
    risk_level: str
    risk_score: float
    recommended_action: str
    drivers: dict


class WeatherEntry(BaseModel):
    region: str
    latitude: float
    longitude: float
    wind_speed_ms: float = Field(..., description="Wind speed at 10 m in m/s")
    solar_irradiance_wm2: float = Field(..., description="Global horizontal irradiance in W/m²")


class WeatherResponse(BaseModel):
    data: list[WeatherEntry]


class WeatherAllEntry(BaseModel):
    region: str
    wind_ms: float = Field(..., description="Wind speed at 10 m in m/s")
    irradiance: float = Field(..., description="Solar irradiance in W/m²")
    output_mw: float = Field(..., description="Computed energy output in MW")
    risk_level: str = Field(..., description="NOMINAL | ELEVATED | HIGH | CRITICAL")
    source: str = Field(..., description="Wind | Solar | Hydro | Mixed")


class WeatherAllResponse(BaseModel):
    data: list[WeatherAllEntry]


# ── History models ──────────────────────────────────────────────────────────────

class HistoryRecord(BaseModel):
    region: str
    latitude: float
    longitude: float
    wind_speed_ms: float
    solar_irradiance_wm2: float
    recorded_at: str


class RegionHistoryResponse(BaseModel):
    region: str
    days: int
    records: list[HistoryRecord]


class HistoryRecordRequest(BaseModel):
    data: list[WeatherEntry]


class HistoryRecordResponse(BaseModel):
    inserted: int


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
    probability_low: float = Field(..., description="Lower bound of ±12% confidence interval")
    probability_high: float = Field(..., description="Upper bound of ±12% confidence interval")
    prevention_action: str



class BlackoutResponse(BaseModel):
    region: str
    predictions: list[HourlyPrediction]


# ── RAG chatbot models ────────────────────────────────────────────────────────

class RAGRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User query")
    context: dict = Field(
        default_factory=dict,
        description="Optional grid context from the frontend (simResult, simParams, selectedGov, isReplay)",
    )


class RAGResponse(BaseModel):
    response: str = Field(..., description="AI-generated answer")
    model: str = Field(..., description="LLM model identifier used")
    mock: bool = Field(default=False, description="True when this is a local fallback response")
    rejected: bool = Field(default=False, description="True when the query was outside the STEG domain")


class NationalStatsResponse(BaseModel):
    source: str
    installed_capacity_mw: float
    installed_capacity_upper_mw: float
    steg_capacity_share_pct: float
    steg_generation_share_pct_2024: float
    steg_generation_share_pct_2025: float
    total_generation_gwh_2024: float
    total_generation_gwh_2025: float
    fossil_generation_share_pct: float
    natural_gas_share_pct: float
    heavy_fuel_oil_share_pct: float
    energy_independence_q1_2025_pct: float
    trade_deficit_tnd_billion_2025: float
    nawara_output_change_pct_2025: float
    algeria_gas_imports_change_pct_2025: float
    electricity_import_coverage_summer_2025_pct: float
    grid_carbon_intensity_gco2_per_kwh: float


# ── Alert simulation models ───────────────────────────────────────────────────

class AlertSimulateRequest(BaseModel):
    region: str = Field(..., description="Governorate name — must exist in _REGION_CFG")
    risk_level: str = Field(..., description="CRITICAL or HIGH")
    scenario_label: str = Field(..., min_length=1, max_length=200)


class AlertSimulateResponse(BaseModel):
    id: int
    region: str
    risk_level: str
    scenario_label: str
    prevention_actions: list[str]
    triggered_at: str
    is_test: bool


# ── Report generation ─────────────────────────────────────────────────────────

class CascadeRegionItem(BaseModel):
    name: str = Field(..., min_length=1)
    risk_level: Literal["CRITICAL", "HIGH", "ELEVATED", "NOMINAL"]


class ReportRequest(BaseModel):
    region: str = Field(..., min_length=1)
    risk_level: Literal["CRITICAL", "HIGH", "ELEVATED", "NOMINAL"]
    scenario_label: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    magnitude_mw: float = Field(..., ge=0)
    cascade_regions: list[CascadeRegionItem] = []
    prevention_actions: list[str] = []


class ReportResponse(BaseModel):
    region: str = Field(..., min_length=1)
    risk_level: Literal["CRITICAL", "HIGH", "ELEVATED", "NOMINAL"]
    scenario_label: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    magnitude_mw: float = Field(..., ge=0)
    cascade_regions: list[CascadeRegionItem] = []
    prevention_actions: list[str] = []
    root_cause: str
    technical_fix: str
    impact_summary: str
    recommended_actions: list[str]
    generated_at: str


class ReportSendRequest(BaseModel):
    recipients: list[str]
    report: ReportResponse


class ReportSendResponse(BaseModel):
    sent: bool
    recipients: list[str]
    sent_at: str
