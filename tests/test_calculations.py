"""
Unit tests for NoorGrid calculation functions.
"""

import pytest
from calculations import carbon_score, hydro_power_mw, solar_power_mw, wind_power_mw


class TestWindPowerMw:
    def test_basic_output(self):
        # P = 0.5 * 1.225 * 7854 * (8**3) * 0.4 = ~1.238 MW
        result = wind_power_mw(wind_speed=8.0, rotor_area=7854.0, efficiency=0.40)
        assert result > 0

    def test_known_value(self):
        # P = 0.5 * 1.225 * 1.0 * (1.0**3) * 1.0 = 0.6125 W = 6.125e-7 MW
        result = wind_power_mw(wind_speed=1.0, rotor_area=1.0, efficiency=1.0)
        assert abs(result - 6.125e-7) < 1e-10

    def test_scales_with_cube_of_speed(self):
        r1 = wind_power_mw(wind_speed=2.0, rotor_area=100.0, efficiency=0.4)
        r2 = wind_power_mw(wind_speed=4.0, rotor_area=100.0, efficiency=0.4)
        # doubling speed should give 8x power
        assert abs(r2 / r1 - 8.0) < 0.01

    def test_returns_float(self):
        result = wind_power_mw(wind_speed=5.0, rotor_area=1000.0, efficiency=0.35)
        assert isinstance(result, float)


class TestSolarPowerMw:
    def test_basic_output(self):
        result = solar_power_mw(irradiance=800.0, panel_area=120_000.0, efficiency=0.18)
        assert result > 0

    def test_known_value(self):
        # P = 1000 * 1000 * 0.1 = 100_000 W = 0.1 MW
        result = solar_power_mw(irradiance=1000.0, panel_area=1000.0, efficiency=0.1)
        assert abs(result - 0.1) < 1e-6

    def test_linear_in_irradiance(self):
        r1 = solar_power_mw(irradiance=500.0, panel_area=1000.0, efficiency=0.2)
        r2 = solar_power_mw(irradiance=1000.0, panel_area=1000.0, efficiency=0.2)
        assert abs(r2 / r1 - 2.0) < 0.01

    def test_returns_float(self):
        result = solar_power_mw(irradiance=600.0, panel_area=50_000.0, efficiency=0.18)
        assert isinstance(result, float)


class TestHydroPowerMw:
    def test_basic_output(self):
        result = hydro_power_mw(flow_rate=150.0, head_height=25.0, efficiency=0.88)
        assert result > 0

    def test_known_value(self):
        # P = 1000 * 9.81 * 1.0 * 1.0 * 1.0 = 9810 W = 0.00981 MW
        result = hydro_power_mw(flow_rate=1.0, head_height=1.0, efficiency=1.0)
        assert abs(result - 0.00981) < 1e-6

    def test_scales_linearly_with_flow(self):
        r1 = hydro_power_mw(flow_rate=100.0, head_height=20.0, efficiency=0.85)
        r2 = hydro_power_mw(flow_rate=200.0, head_height=20.0, efficiency=0.85)
        assert abs(r2 / r1 - 2.0) < 0.01

    def test_returns_float(self):
        result = hydro_power_mw(flow_rate=50.0, head_height=10.0, efficiency=0.9)
        assert isinstance(result, float)


class TestCarbonScore:
    def test_positive_when_consumption_exceeds_renewable(self):
        score = carbon_score(consumption_kwh=1000.0, renewable_kwh=400.0)
        assert score > 0
        assert abs(score - 600.0 * 0.423) < 0.001

    def test_zero_when_equal(self):
        score = carbon_score(consumption_kwh=500.0, renewable_kwh=500.0)
        assert score == 0.0

    def test_negative_when_surplus_renewable(self):
        # More renewable than consumed → negative carbon (net export / surplus)
        score = carbon_score(consumption_kwh=300.0, renewable_kwh=500.0)
        assert score < 0

    def test_returns_float(self):
        score = carbon_score(consumption_kwh=1000.0, renewable_kwh=200.0)
        assert isinstance(score, float)


class TestConstants:
    def test_carbon_intensity_is_verified_2024_value(self):
        from calculations import CARBON_INTENSITY
        assert CARBON_INTENSITY == 0.423, (
            f"CARBON_INTENSITY should be 0.423 (verified 2024 ONEM figure), got {CARBON_INTENSITY}"
        )
