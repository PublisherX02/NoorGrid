"""
OpenMeteo weather data fetcher for Tunisian governorates.
"""

import asyncio
from typing import Any

import httpx

# Tunisian governorate coordinates (lat, lon)
GOVERNORATES: list[dict] = [
    {"region": "Bizerte",     "lat": 37.2744, "lon": 9.8739},
    {"region": "Nabeul",      "lat": 36.4561, "lon": 10.7376},
    {"region": "Tozeur",      "lat": 33.9197, "lon": 8.1335},
    {"region": "Béja",        "lat": 36.7256, "lon": 9.1817},
    {"region": "Sidi Bouzid", "lat": 35.0382, "lon": 9.4858},
    {"region": "Tunis",       "lat": 36.8190, "lon": 10.1658},
    {"region": "Ariana",      "lat": 36.8665, "lon": 10.1647},
    {"region": "Ben Arous",   "lat": 36.7533, "lon": 10.2281},
    {"region": "Manouba",     "lat": 36.8092, "lon": 9.9885},
    {"region": "Zaghouan",    "lat": 36.4029, "lon": 10.1427},
    {"region": "Jendouba",    "lat": 36.5012, "lon": 8.7803},
    {"region": "Kef",         "lat": 36.1820, "lon": 8.7046},
    {"region": "Siliana",     "lat": 36.0842, "lon": 9.3748},
    {"region": "Sousse",      "lat": 35.8256, "lon": 10.6368},
    {"region": "Monastir",    "lat": 35.7643, "lon": 10.8113},
    {"region": "Mahdia",      "lat": 35.5047, "lon": 11.0622},
    {"region": "Sfax",        "lat": 34.7398, "lon": 10.7600},
    {"region": "Kairouan",    "lat": 35.6781, "lon": 10.0963},
    {"region": "Kasserine",   "lat": 35.1721, "lon": 8.8302},
    {"region": "Gabès",       "lat": 33.8881, "lon": 10.0975},
    {"region": "Médenine",    "lat": 33.3549, "lon": 10.5055},
    {"region": "Tataouine",   "lat": 32.9211, "lon": 10.4518},
    {"region": "Gafsa",       "lat": 34.4311, "lon": 8.7757},
    {"region": "Kebili",      "lat": 33.7046, "lon": 8.9715},
]

OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_weather_for_governorate(
    client: httpx.AsyncClient, gov: dict
) -> dict:
    """
    Fetch current wind speed and solar irradiance for a single governorate
    using the Open-Meteo free API.
    """
    params = {
        "latitude": gov["lat"],
        "longitude": gov["lon"],
        "current": "wind_speed_10m,shortwave_radiation",
        "wind_speed_unit": "ms",
        "timezone": "Africa/Tunis",
    }
    response = await client.get(OPENMETEO_URL, params=params, timeout=10.0)
    response.raise_for_status()
    data = response.json()

    current = data.get("current", {})
    wind_speed = current.get("wind_speed_10m", 0.0) or 0.0
    irradiance = current.get("shortwave_radiation", 0.0) or 0.0

    return {
        "region": gov["region"],
        "latitude": gov["lat"],
        "longitude": gov["lon"],
        "wind_speed_ms": round(float(wind_speed), 3),
        "solar_irradiance_wm2": round(float(irradiance), 3),
    }


async def fetch_all_weather() -> list[dict[str, Any]]:
    """
    Fetch weather data for all Tunisian governorates concurrently.
    """
    async with httpx.AsyncClient() as client:
        tasks = [
            fetch_weather_for_governorate(client, gov) for gov in GOVERNORATES
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    output: list[dict[str, Any]] = []
    for gov, result in zip(GOVERNORATES, results):
        if isinstance(result, Exception):
            # Return zeros on error so the dashboard can still render
            output.append({
                "region": gov["region"],
                "latitude": gov["lat"],
                "longitude": gov["lon"],
                "wind_speed_ms": 0.0,
                "solar_irradiance_wm2": 0.0,
            })
        else:
            output.append(result)  # type: ignore[arg-type]
    return output
