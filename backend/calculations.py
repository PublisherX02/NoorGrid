"""
Energy output and carbon score calculation functions.
"""

# Air density (kg/m³) at sea level
AIR_DENSITY = 1.225
# Water density (kg/m³)
WATER_DENSITY = 1000.0
# Gravitational acceleration (m/s²)
GRAVITY = 9.81
# Carbon intensity factor (kg CO₂ per kWh)
CARBON_INTENSITY = 0.468
# Conversion from Watts to Megawatts
W_TO_MW = 1e-6


def wind_power_mw(wind_speed: float, rotor_area: float, efficiency: float) -> float:
    """
    Calculate wind power output in MW.
    P = 0.5 × ρ × A × v³ × η

    Args:
        wind_speed: Wind speed in m/s.
        rotor_area: Rotor swept area in m².
        efficiency: Turbine efficiency (0–1).

    Returns:
        Power output in MW.
    """
    power_w = 0.5 * AIR_DENSITY * rotor_area * (wind_speed ** 3) * efficiency
    return round(power_w * W_TO_MW, 10)


def solar_power_mw(irradiance: float, panel_area: float, efficiency: float) -> float:
    """
    Calculate solar power output in MW.
    P = G × A × η

    Args:
        irradiance: Solar irradiance in W/m².
        panel_area: Total panel area in m².
        efficiency: Panel efficiency (0–1).

    Returns:
        Power output in MW.
    """
    power_w = irradiance * panel_area * efficiency
    return round(power_w * W_TO_MW, 8)


def hydro_power_mw(flow_rate: float, head_height: float, efficiency: float) -> float:
    """
    Calculate hydro power output in MW.
    P = ρ × g × Q × H × η

    Args:
        flow_rate: Water flow rate in m³/s.
        head_height: Head height in metres.
        efficiency: Turbine efficiency (0–1).

    Returns:
        Power output in MW.
    """
    power_w = WATER_DENSITY * GRAVITY * flow_rate * head_height * efficiency
    return round(power_w * W_TO_MW, 8)


def carbon_score(consumption_kwh: float, renewable_kwh: float) -> float:
    """
    Calculate carbon score in kg CO₂.
    C = (E_consumed - E_renewable) × 0.468

    Args:
        consumption_kwh: Total energy consumed in kWh.
        renewable_kwh: Renewable energy produced in kWh.

    Returns:
        Carbon score in kg CO₂.
    """
    return round((consumption_kwh - renewable_kwh) * CARBON_INTENSITY, 4)