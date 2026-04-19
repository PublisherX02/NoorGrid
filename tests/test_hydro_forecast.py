import warnings

import hydro_forecast
import httpx
import pandas as pd
import pytest


class _FakeResponse:
    def __init__(self, payload, status_code: int = 200):
        self._payload = payload
        request = httpx.Request("GET", hydro_forecast.ARCHIVE_URL)
        self._response = httpx.Response(status_code, request=request, json=payload)

    def raise_for_status(self):
        self._response.raise_for_status()

    def json(self):
        return self._payload


def _monthly_payload(months: int, with_discharge: bool = True) -> dict:
    dates = pd.date_range("2024-01-01", periods=months, freq="MS").strftime("%Y-%m-%d").tolist()
    precipitation = [40.0 + (i % 12) * 3.5 for i in range(months)]
    temperature = [10.0 + (i % 12) * 1.2 for i in range(months)]
    discharge = [90.0 + (i % 6) * 2.4 for i in range(months)] if with_discharge else [None] * months
    return {
        "monthly": {
            "time": dates,
            "precipitation_sum": precipitation,
            "temperature_2m_mean": temperature,
            "river_discharge_mean": discharge,
        }
    }


def test_hydro_physics_calculation():
    mw = hydro_forecast.compute_hydro_mw(flow_rate=10.0, head_height_m=25.0, efficiency=0.88)
    assert mw == pytest.approx(2.157, abs=0.01)


def test_forecast_response_shape(monkeypatch):
    payload = _monthly_payload(24, with_discharge=True)

    def _fake_get(*_args, **_kwargs):
        return _FakeResponse(payload)

    monkeypatch.setattr(hydro_forecast.httpx, "get", _fake_get)
    result = hydro_forecast.build_forecast(months=6)

    assert {
        "model_rmse",
        "model_mae",
        "confidence",
        "data_points_used",
        "forecast_months",
        "predictions",
    } <= result.keys()
    assert len(result["predictions"]) == 6
    assert {"month", "predicted_mw", "confidence_lower", "confidence_upper", "risk", "season"} <= result["predictions"][0].keys()


def test_forecast_suppresses_statsmodels_fit_warnings(monkeypatch):
    payload = _monthly_payload(24, with_discharge=True)

    def _fake_get(*_args, **_kwargs):
        return _FakeResponse(payload)

    monkeypatch.setattr(hydro_forecast.httpx, "get", _fake_get)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        hydro_forecast.build_forecast(months=12)

    warning_text = " | ".join(str(w.message) for w in caught)
    assert "Too few observations to estimate starting parameters for seasonal ARMA" not in warning_text
    assert "Maximum Likelihood optimization failed to converge" not in warning_text


def test_cold_start_fallback(monkeypatch):
    payload = _monthly_payload(10, with_discharge=False)

    def _fake_get(*_args, **_kwargs):
        return _FakeResponse(payload)

    monkeypatch.setattr(hydro_forecast.httpx, "get", _fake_get)
    result = hydro_forecast.build_forecast(months=4)

    assert result["confidence"] == "LOW"
    assert result["forecast_months"] == 4
    assert len(result["predictions"]) == 4


def test_drought_warning_trigger():
    predictions = [
        {"month": "2026-01", "predicted_mw": 18.0},
        {"month": "2026-02", "predicted_mw": 15.9},
        {"month": "2026-03", "predicted_mw": 14.5},
        {"month": "2026-04", "predicted_mw": 15.1},
        {"month": "2026-05", "predicted_mw": 20.0},
    ]
    assert hydro_forecast.get_drought_warning(predictions) is True


def test_drought_warning_ignores_borderline_lows():
    predictions = [
        {"month": "2026-01", "predicted_mw": 16.3},
        {"month": "2026-02", "predicted_mw": 16.1},
        {"month": "2026-03", "predicted_mw": 16.0},
        {"month": "2026-04", "predicted_mw": 17.2},
    ]
    assert hydro_forecast.get_drought_warning(predictions) is False


def test_archive_request_retries_without_discharge(monkeypatch):
    payload = _monthly_payload(24, with_discharge=False)
    payload["monthly"].pop("river_discharge_mean", None)
    monthly_params_used: list[str] = []

    def _fake_get(*_args, **kwargs):
        params = kwargs.get("params", {})
        monthly_arg = params.get("monthly", "")
        if monthly_arg:
            monthly_params_used.append(monthly_arg)
        if "river_discharge_mean" in monthly_arg:
            return _FakeResponse({"error": "unsupported variable"}, status_code=400)
        return _FakeResponse(payload)

    monkeypatch.setattr(hydro_forecast.httpx, "get", _fake_get)
    df = hydro_forecast._fetch_historical_weather(months_back=24)

    assert len(df) == 24
    assert monthly_params_used == [
        "precipitation_sum,temperature_2m_mean,river_discharge_mean",
        "precipitation_sum,temperature_2m_mean",
    ]
    expected_flow = hydro_forecast._runoff_proxy_flow_rate(
        float(df.iloc[0]["precipitation"]),
        pd.Timestamp(df.iloc[0]["date"]),
        "monthly",
    )
    assert float(df.iloc[0]["flow_rate"]) == pytest.approx(expected_flow)
