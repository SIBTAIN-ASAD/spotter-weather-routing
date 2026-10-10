"""Small, bounded HTTP adapters. Upstream failures never become demo data."""

import hashlib
import json
import logging
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from .errors import ProviderError
from .risk import valid_measurement
from .validation import number

logger = logging.getLogger(__name__)


def request_json(url, params, provider):
    try:
        response = requests.get(
            url,
            params=params,
            timeout=(4, 20),
            headers={
                "User-Agent": "RouteCast-assessment/1.0",
                "Accept": "application/json",
            },
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("%s request failed: %s", provider, exc)
        raise ProviderError(
            f"{provider} is unavailable or timed out. Please try again, or choose the labeled demo."
        ) from exc
    if not isinstance(payload, (dict, list)):
        raise ProviderError(f"{provider} returned an unexpected response.")
    return payload


def geocode(query):
    key = "places:" + hashlib.sha256(query.casefold().encode()).hexdigest()
    stored = cache.get(key)
    if stored is not None:
        return stored
    payload = request_json(
        f"{settings.GEOCODING_BASE_URL}/v1/search",
        {"name": query, "count": 6, "language": "en", "format": "json"},
        "Place search",
    )
    if not isinstance(payload, dict) or payload.get("error"):
        raise ProviderError("Place search could not complete this query.")
    places = []
    results = payload.get("results", [])
    if not isinstance(results, list):
        raise ProviderError("Place search returned an unexpected response.")
    for place in results:
        if not isinstance(place, dict) or not isinstance(place.get("name"), str):
            continue
        lat, lon = place.get("latitude"), place.get("longitude")
        if (
            not number(lat)
            or not number(lon)
            or not -90 <= lat <= 90
            or not -180 <= lon <= 180
        ):
            continue
        labels = (place.get("name"), place.get("admin1"), place.get("country"))
        if any(label is not None and not isinstance(label, str) for label in labels):
            raise ProviderError("Place search returned an invalid place name.")
        parts = dict.fromkeys(label for label in labels if label)
        places.append({"name": ", ".join(parts), "lat": lat, "lon": lon})
    cache.set(key, places, 24 * 60 * 60)
    return places


def osrm_route(coordinates, alternatives=True):
    params = {
        "alternatives": "3" if alternatives else "false",
        "overview": "full",
        "geometries": "geojson",
        "annotations": "distance,duration",
        "steps": "false",
    }
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/" + ";".join(
        f"{lon:.6f},{lat:.6f}" for lon, lat in coordinates
    )
    key = (
        "routes:"
        + hashlib.sha256(
            (url + json.dumps(params, sort_keys=True)).encode()
        ).hexdigest()
    )
    payload = cache.get(key)
    if payload is None:
        payload = request_json(url, params, "Routing service")
        if (
            not isinstance(payload, dict)
            or payload.get("code") != "Ok"
            or not payload.get("routes")
        ):
            raise ProviderError(
                "No drivable route was found between those places. Try nearby cities or different endpoints."
            )
        cache.set(key, payload, 60 * 60)
    return payload["routes"]


def point_key(lat, lon):
    # About 110 m resolution. Adjacent routes can share forecasts without one
    # request per checkpoint or one request per animation frame.
    return (round(lat, 3), round(lon, 3))


def _quantity(value, unit, kind):
    if value is None or not valid_measurement(value):
        return None
    divisors = {
        "wind": {"mp/h": 1, "mph": 1, "km/h": 1.609344, "m/s": 0.44704},
        "precip": {"inch": 1, "in": 1, "mm": 25.4, "cm": 2.54},
    }
    divisor = divisors[kind].get(unit)
    if divisor is None:
        raise ProviderError(f"Weather service returned unsupported {kind} units.")
    return value / divisor


def parse_forecast(payload):
    if not isinstance(payload, dict) or payload.get("error"):
        raise ProviderError("Weather service returned an invalid forecast.")
    hourly = payload.get("hourly", {})
    units = payload.get("hourly_units", {})
    if not isinstance(hourly, dict) or not isinstance(units, dict):
        raise ProviderError("Weather service did not return hourly data.")
    times = hourly.get("time", [])
    if not isinstance(times, list) or not times:
        raise ProviderError("Weather service did not return hourly data.")
    result = {}
    for i, time in enumerate(times):
        try:
            timestamp = datetime.fromisoformat(time.replace("Z", "+00:00"))
            timestamp = (
                timestamp.replace(tzinfo=timezone.utc)
                if timestamp.tzinfo is None
                else timestamp.astimezone(timezone.utc)
            )
            key = timestamp.isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError, AttributeError):
            raise ProviderError("Weather service returned invalid hourly timestamps.")

        def value(name, kind="precip"):
            values = hourly.get(name, [])
            item = values[i] if isinstance(values, list) and i < len(values) else None
            return _quantity(item, units.get(name), kind)

        wind, rain, showers, snow = (
            value("wind_speed_10m", "wind"),
            value("rain"),
            value("showers"),
            value("snowfall"),
        )
        result[key] = {
            "wind_mph": wind,
            "rain_in": None if rain is None or showers is None else rain + showers,
            "snow_in": snow,
        }
    return result


def forecasts(points, now=None):
    unique = sorted(set(point_key(lat, lon) for lat, lon in points))
    today = (now or datetime.now(timezone.utc)).date().isoformat()
    keys = {point: f"forecast:{today}:{point[0]}:{point[1]}" for point in unique}
    cached = cache.get_many(keys.values())
    result = {point: cached[key] for point, key in keys.items() if key in cached}
    missing = [point for point in unique if point not in result]

    def fetch_batch(batch):
        payload = request_json(
            f"{settings.WEATHER_BASE_URL}/v1/forecast",
            {
                "latitude": ",".join(str(p[0]) for p in batch),
                "longitude": ",".join(str(p[1]) for p in batch),
                "hourly": "wind_speed_10m,rain,showers,snowfall",
                "wind_speed_unit": "mph",
                "precipitation_unit": "inch",
                "timezone": "GMT",
                "forecast_days": 9,
            },
            "Weather service",
        )
        items = payload if isinstance(payload, list) else [payload]
        if len(items) != len(batch):
            raise ProviderError(
                "Weather service returned an incomplete forecast batch."
            )
        return {point: parse_forecast(item) for point, item in zip(batch, items)}

    batches = [missing[i : i + 40] for i in range(0, len(missing), 40)]
    with ThreadPoolExecutor(max_workers=3) as executor:
        for fetched in executor.map(fetch_batch, batches):
            result.update(fetched)
            cache.set_many(
                {keys[point]: data for point, data in fetched.items()}, 15 * 60
            )
    return result
