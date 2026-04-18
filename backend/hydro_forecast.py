"""
SARIMAX hydropower forecasting for Sidi Salem Dam (Béja).
"""

from __future__ import annotations

from typing import Any

import httpx
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
BEJA_LAT = 36.7256
BEJA_LON = 9.1817

WATER_DENSITY = 1000.0
GRAVITY = 9.81
HEAD_HEIGHT_M = 25.0
TURBINE_EFFICIENCY = 0.88
BASELINE_CAPACITY_MW = 33.0
DROUGHT_THRESHOLD_MW = BASELINE_CAPACITY_MW * 0.5
RUNOFF_COEFFICIENT = 0.30
MEDJERDA_BASIN_AREA_KM2 = 23600.0
SECONDS_PER_DAY = 86400
DROUGHT_WARNING_STREAK_MEAN_FACTOR = 0.95

SARIMAX_ORDER = (0, 1, 1)
SARIMAX_SEASONAL_ORDER = (1, 0, 1, 12)


def compute_hydro_mw(
    flow_rate: float,
    head_height_m: float = HEAD_HEIGHT_M,
    efficiency: float = TURBINE_EFFICIENCY,
) -> float:
    power_w = WATER_DENSITY * GRAVITY * float(flow_rate) * head_height_m * efficiency
    return float(np.clip(power_w * 1e-6, 0.0, BASELINE_CAPACITY_MW))


def _season_from_month(month: int) -> str:
    if month in (12, 1, 2):
        return "WINTER"
    if month in (3, 4, 5):
        return "SPRING"
    if month in (6, 7, 8):
        return "SUMMER"
    return "AUTUMN"


def _date_window(months_back: int = 24) -> tuple[str, str]:
    now_utc = pd.Timestamp.now(tz="UTC").tz_localize(None)
    end_month = (now_utc.to_period("M") - 1).to_timestamp(how="end")
    start_month = (end_month.to_period("M") - (months_back - 1)).to_timestamp(how="start")
    return start_month.strftime("%Y-%m-%d"), end_month.strftime("%Y-%m-%d")


def _safe_get(values: list[Any], index: int) -> float:
    if index >= len(values):
        return float("nan")
    value = values[index]
    if value is None:
        return float("nan")
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _runoff_proxy_flow_rate(precip_mm: float, date: pd.Timestamp, interval: str) -> float:
    if not np.isfinite(precip_mm) or precip_mm <= 0.0:
        return 0.0

    precip_m = float(precip_mm) / 1000.0
    runoff_volume_m3 = precip_m * MEDJERDA_BASIN_AREA_KM2 * 1_000_000.0 * RUNOFF_COEFFICIENT

    if interval == "daily":
        seconds = SECONDS_PER_DAY
    else:
        days = int(date.days_in_month) if not pd.isna(date) else 30
        seconds = max(1, days) * SECONDS_PER_DAY

    return runoff_volume_m3 / seconds


def _build_monthly_df(monthly: dict[str, Any], *, interval: str) -> pd.DataFrame:
    dates = monthly.get("time", []) or []
    precipitation = monthly.get("precipitation_sum", []) or []
    temperature = monthly.get("temperature_2m_mean", []) or []
    discharge = monthly.get("river_discharge_mean", []) or monthly.get("river_discharge", []) or []

    rows: list[dict[str, Any]] = []
    for i, d in enumerate(dates):
        date = pd.to_datetime(d, errors="coerce")
        precip = _safe_get(precipitation, i)
        temp = _safe_get(temperature, i)
        flow = _safe_get(discharge, i)
        if np.isnan(precip):
            precip = 0.0
        if np.isnan(temp):
            temp = 0.0
        if np.isnan(flow):
            flow = _runoff_proxy_flow_rate(precip, date, interval)
        rows.append(
            {
                "date": date,
                "precipitation": float(precip),
                "temperature": float(temp),
                "flow_rate": float(flow),
            }
        )

    df = pd.DataFrame(rows, columns=["date", "precipitation", "temperature", "flow_rate"])
    if df.empty:
        return df
    return df.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)


def _fetch_historical_weather(months_back: int = 24) -> pd.DataFrame:
    start_date, end_date = _date_window(months_back)
    base_params: dict[str, str] = {
        "latitude": str(BEJA_LAT),
        "longitude": str(BEJA_LON),
        "start_date": start_date,
        "end_date": end_date,
        "timezone": "Africa/Tunis",
    }

    for monthly_vars in (
        "precipitation_sum,temperature_2m_mean,river_discharge_mean",
        "precipitation_sum,temperature_2m_mean",
    ):
        monthly_params = dict(base_params)
        monthly_params["monthly"] = monthly_vars
        try:
            resp = httpx.get(ARCHIVE_URL, params=monthly_params, timeout=30.0)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in (400, 422):
                raise
            continue

        monthly = resp.json().get("monthly", {})
        df = _build_monthly_df(monthly, interval="monthly")
        if not df.empty:
            return df

    for daily_vars in (
        "precipitation_sum,temperature_2m_mean,river_discharge_mean",
        "precipitation_sum,temperature_2m_mean",
    ):
        daily_params = dict(base_params)
        daily_params["daily"] = daily_vars
        try:
            daily_resp = httpx.get(ARCHIVE_URL, params=daily_params, timeout=30.0)
            daily_resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in (400, 422):
                raise
            continue

        daily = daily_resp.json().get("daily", {})
        day_df = _build_monthly_df(daily, interval="daily")
        if day_df.empty:
            continue

        day_df["month"] = day_df["date"].dt.to_period("M")
        month_df = (
            day_df.groupby("month", as_index=False)
            .agg(
                precipitation=("precipitation", "sum"),
                temperature=("temperature", "mean"),
                flow_rate=("flow_rate", "mean"),
            )
        )
        month_df["date"] = month_df["month"].dt.to_timestamp(how="start")
        month_df = month_df[["date", "precipitation", "temperature", "flow_rate"]]
        return month_df.sort_values("date").reset_index(drop=True)

    return pd.DataFrame(columns=["date", "precipitation", "temperature", "flow_rate"])


def _forecast_start_date(df: pd.DataFrame) -> pd.Timestamp:
    if df.empty or df["date"].isna().all():
        return pd.Timestamp.now(tz="UTC").tz_localize(None).to_period("M").to_timestamp(how="start")
    return (df["date"].max().to_period("M") + 1).to_timestamp(how="start")


def _seasonal_fallback_mw(month: int) -> float:
    season_defaults = {
        "WINTER": 24.0,
        "SPRING": 20.0,
        "SUMMER": 11.0,
        "AUTUMN": 17.0,
    }
    return season_defaults[_season_from_month(month)]


def _confidence_from_points(data_points: int) -> str:
    if data_points >= 24:
        return "HIGH"
    if data_points >= 18:
        return "MEDIUM"
    return "LOW"


def _build_predictions(forecast_dates: pd.DatetimeIndex, values: np.ndarray) -> list[dict[str, Any]]:
    predictions: list[dict[str, Any]] = []
    for date, value in zip(forecast_dates, values):
        predicted_mw = float(np.clip(value, 0.0, BASELINE_CAPACITY_MW))
        season = _season_from_month(int(date.month))
        predictions.append(
            {
                "month": date.strftime("%Y-%m"),
                "predicted_mw": round(predicted_mw, 3),
                "confidence_lower": round(max(0.0, predicted_mw * 0.85), 3),
                "confidence_upper": round(min(BASELINE_CAPACITY_MW, predicted_mw * 1.15), 3),
                "risk": "DROUGHT_RISK" if predicted_mw < DROUGHT_THRESHOLD_MW else "NORMAL",
                "season": season,
            }
        )
    return predictions


def _history_seasonal_proxy(weather_df: pd.DataFrame, forecast_dates: pd.DatetimeIndex) -> np.ndarray:
    if weather_df.empty or weather_df["hydro_mw"].dropna().empty:
        return np.array([_seasonal_fallback_mw(int(d.month)) for d in forecast_dates], dtype=float)

    month_medians = weather_df.groupby(weather_df["date"].dt.month)["hydro_mw"].median().to_dict()
    fallback_center = float(np.clip(weather_df["hydro_mw"].median(), 0.0, BASELINE_CAPACITY_MW))
    return np.array(
        [
            float(np.clip(month_medians.get(int(d.month), fallback_center), 0.0, BASELINE_CAPACITY_MW))
            for d in forecast_dates
        ],
        dtype=float,
    )


def _is_unreliable_forecast(history_values: np.ndarray, forecast_values: np.ndarray) -> bool:
    hist = history_values[np.isfinite(history_values)]
    pred = forecast_values[np.isfinite(forecast_values)]
    if len(hist) == 0 or len(pred) == 0:
        return True

    hist_median = float(np.median(hist))
    pred_median = float(np.median(pred))
    if hist_median <= 0.0:
        return False

    if pred_median < hist_median * 0.2:
        return True
    if pred_median > hist_median * 2.2:
        return True
    return False


def build_forecast(months: int = 12) -> dict[str, Any]:
    months = int(months or 12)
    if months < 1:
        months = 1

    weather_df = _fetch_historical_weather(months_back=24)
    if weather_df.empty:
        weather_df = pd.DataFrame(columns=["date", "precipitation", "temperature", "flow_rate"])

    weather_df["hydro_mw"] = weather_df["flow_rate"].apply(compute_hydro_mw)
    weather_df["hydro_mw"] = weather_df["hydro_mw"].clip(0.0, BASELINE_CAPACITY_MW)
    data_points = int(len(weather_df))
    forecast_dates = pd.date_range(_forecast_start_date(weather_df), periods=months, freq="MS")

    if data_points < 13:
        fallback_values = np.array([_seasonal_fallback_mw(int(d.month)) for d in forecast_dates], dtype=float)
        return {
            "model_rmse": 0.0,
            "model_mae": 0.0,
            "confidence": "LOW",
            "data_points_used": data_points,
            "forecast_months": months,
            "predictions": _build_predictions(forecast_dates, fallback_values),
        }

    exog = weather_df[["precipitation", "temperature"]].astype(float)
    endog = weather_df["hydro_mw"].astype(float)

    model = SARIMAX(
        endog=endog,
        exog=exog,
        order=SARIMAX_ORDER,
        seasonal_order=SARIMAX_SEASONAL_ORDER,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)

    fitted_values = np.asarray(fitted.fittedvalues, dtype=float)
    endog_values = np.asarray(endog, dtype=float)
    valid = np.isfinite(fitted_values) & np.isfinite(endog_values)
    if np.any(valid):
        err = endog_values[valid] - fitted_values[valid]
        rmse = float(np.sqrt(np.mean(np.square(err))))
        mae = float(np.mean(np.abs(err)))
    else:
        rmse = 0.0
        mae = 0.0

    pattern = exog.tail(min(12, len(exog))).reset_index(drop=True)
    future_rows = [pattern.iloc[i % len(pattern)].to_dict() for i in range(months)]
    future_exog = pd.DataFrame(future_rows, columns=["precipitation", "temperature"])

    forecast_res = fitted.get_forecast(steps=months, exog=future_exog)
    forecast_values = np.asarray(forecast_res.predicted_mean, dtype=float)
    confidence = _confidence_from_points(data_points)
    if _is_unreliable_forecast(endog_values, forecast_values):
        forecast_values = _history_seasonal_proxy(weather_df, forecast_dates)
        if confidence == "HIGH":
            confidence = "MEDIUM"

    return {
        "model_rmse": round(rmse, 4),
        "model_mae": round(mae, 4),
        "confidence": confidence,
        "data_points_used": data_points,
        "forecast_months": months,
        "predictions": _build_predictions(forecast_dates, forecast_values),
    }


def get_drought_warning(predictions: list[dict[str, Any]]) -> bool:
    consecutive: list[float] = []
    for pred in predictions:
        predicted_mw = float(pred.get("predicted_mw", 0.0))
        if predicted_mw < DROUGHT_THRESHOLD_MW:
            consecutive.append(predicted_mw)
            if len(consecutive) >= 3:
                streak_mean = float(np.mean(consecutive[-3:]))
                if streak_mean < (DROUGHT_THRESHOLD_MW * DROUGHT_WARNING_STREAK_MEAN_FACTOR):
                    return True
        else:
            consecutive.clear()
    return False
