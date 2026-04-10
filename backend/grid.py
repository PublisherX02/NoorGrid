"""
National grid simulation utilities for NoorGrid.
"""

from dataclasses import dataclass

STEG_EFFECTIVE_CAPACITY_MW = 4636.0
STEG_BASELINE_DEMAND_MW = 2800.0
STEG_Q3_AVG_DEMAND_MW = 3800.0


@dataclass
class GridInputs:
    renewable_output_mw: float
    demand_delta_pct: float = 0.0
    temperature_c: float = 25.0
    include_peak_hour_factor: bool = True
    reserve_capacity_mw: float = 0.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _risk_level_from_headroom(headroom_pct: float) -> str:
    if headroom_pct < 0:
        return "CRITICAL"
    if headroom_pct < 5:
        return "CRITICAL"
    if headroom_pct < 10:
        return "HIGH"
    if headroom_pct < 20:
        return "ELEVATED"
    return "NOMINAL"


def _recommended_action(risk_level: str) -> str:
    if risk_level == "CRITICAL":
        return "INITIATE IMPORTS + CONTROLLED LOAD SHEDDING"
    if risk_level == "HIGH":
        return "REDUCE INDUSTRIAL LOAD + DISPATCH RESERVE CAPACITY"
    if risk_level == "ELEVATED":
        return "PREPARE DEMAND RESPONSE + MONITOR GRID FREQUENCY"
    return "NO IMMEDIATE ACTION REQUIRED"


def simulate_national_grid(inputs: GridInputs) -> dict:
    renewable_output_mw = max(0.0, float(inputs.renewable_output_mw))
    reserve_capacity_mw = max(0.0, float(inputs.reserve_capacity_mw))
    demand_delta_pct = _clamp(float(inputs.demand_delta_pct), -50.0, 100.0)
    temperature_c = _clamp(float(inputs.temperature_c), -10.0, 60.0)

    # Demand model: baseline + summer uplift + user delta
    cooling_surge = max(0.0, (temperature_c - 25.0) * 0.04)
    peak_factor = 1.05 if inputs.include_peak_hour_factor else 1.0
    base_demand = STEG_Q3_AVG_DEMAND_MW * peak_factor * (1.0 + cooling_surge)
    total_demand_mw = base_demand * (1.0 + demand_delta_pct / 100.0)

    total_available_mw = STEG_EFFECTIVE_CAPACITY_MW + reserve_capacity_mw
    deficit_mw = max(0.0, total_demand_mw - total_available_mw)
    import_required_mw = deficit_mw

    import_reliance_pct = (
        (import_required_mw / total_demand_mw) * 100.0 if total_demand_mw > 0 else 0.0
    )
    renewable_share_pct = (
        (renewable_output_mw / total_demand_mw) * 100.0 if total_demand_mw > 0 else 0.0
    )
    headroom_pct = (
        ((total_available_mw - total_demand_mw) / total_available_mw) * 100.0
        if total_available_mw > 0
        else -100.0
    )

    risk_level = _risk_level_from_headroom(headroom_pct)
    risk_score = _clamp(100.0 - max(0.0, headroom_pct) * 3.0, 0.0, 100.0)

    return {
        "total_demand_mw": round(total_demand_mw, 2),
        "renewable_output_mw": round(renewable_output_mw, 2),
        "effective_capacity_mw": round(total_available_mw, 2),
        "deficit_mw": round(deficit_mw, 2),
        "import_required_mw": round(import_required_mw, 2),
        "import_reliance_pct": round(import_reliance_pct, 2),
        "renewable_share_pct": round(renewable_share_pct, 2),
        "headroom_pct": round(headroom_pct, 2),
        "risk_level": risk_level,
        "risk_score": round(risk_score, 1),
        "recommended_action": _recommended_action(risk_level),
        "drivers": {
            "baseline_demand_mw": STEG_BASELINE_DEMAND_MW,
            "seasonal_base_demand_mw": STEG_Q3_AVG_DEMAND_MW,
            "cooling_surge_factor": round(cooling_surge, 4),
            "peak_hour_factor": peak_factor,
            "demand_delta_pct": demand_delta_pct,
            "temperature_c": temperature_c,
            "reserve_capacity_mw": reserve_capacity_mw,
        },
    }
