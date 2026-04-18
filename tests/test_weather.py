import asyncio

from weather import fetch_all_weather, fetch_weather_for_governorate


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    async def get(self, *_args, **_kwargs):
        return _FakeResponse(
            {
                "current": {
                    "wind_speed_10m": 7.1234,
                    "shortwave_radiation": 456.7891,
                }
            }
        )


def test_fetch_weather_for_governorate_maps_response():
    gov = {"region": "Bizerte", "lat": 37.2744, "lon": 9.8739}
    result = asyncio.run(fetch_weather_for_governorate(_FakeClient(), gov))
    assert result["region"] == "Bizerte"
    assert result["latitude"] == 37.2744
    assert result["longitude"] == 9.8739
    assert result["wind_speed_ms"] == 7.123
    assert result["solar_irradiance_wm2"] == 456.789


def test_fetch_all_weather_falls_back_to_zero_on_exception(monkeypatch):
    async def _ok(_client, gov):
        return {
            "region": gov["region"],
            "latitude": gov["lat"],
            "longitude": gov["lon"],
            "wind_speed_ms": 1.0,
            "solar_irradiance_wm2": 2.0,
        }

    async def _boom(_client, _gov):
        raise RuntimeError("network fail")

    async def _side_effect(_client, gov):
        if gov["region"] == "Bizerte":
            return await _boom(_client, gov)
        return await _ok(_client, gov)

    monkeypatch.setattr("weather.fetch_weather_for_governorate", _side_effect)

    data = asyncio.run(fetch_all_weather())
    assert len(data) == 24

    bizerte = next(x for x in data if x["region"] == "Bizerte")
    assert bizerte["wind_speed_ms"] == 0.0
    assert bizerte["solar_irradiance_wm2"] == 0.0

    nabeul = next(x for x in data if x["region"] == "Nabeul")
    assert nabeul["wind_speed_ms"] == 1.0
    assert nabeul["solar_irradiance_wm2"] == 2.0
