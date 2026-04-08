"""
OpenMeteo weather data fetcher for Tunisian governorates.
"""

import httpx

# Tunisian governorate coordinates (lat, lon)
GOVERNORATES: list[dict] = [
    {"region": "Bizerte",     "lat": 37.2744, "lon": 9.8739},
    {"region": "Nabeul",      "lat": 36.4561, "lon": 10.7376},
    {"region": "Tozeur",      "lat": 33.9197, "lon": 8.1335},
    {"region": "Béja",        "lat": 36.7256, "lon": 9.1817},
    {"region": "Sidi Bouzid", "lat": 35.0382, "lon": 9.4858},
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


async def fetch_all_weather() -> list[dict]:
    """
    Fetch weather data for all Tunisian governorates concurrently.
    """
    import asyncio

    async with httpx.AsyncClient() as client:
        tasks = [
            fetch_weather_for_governorate(client, gov) for gov in GOVERNORATES
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
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
            output.append(result)
    return output
