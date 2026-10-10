"""Recorded road geometry with explicitly synthetic, deterministic weather."""

import json
import math
from pathlib import Path

from .providers import point_key
from .routes import iso, normalize_route

FIXTURE = Path(__file__).parent / "fixtures" / "chicago-detroit.json"


def demo_routes():
    payload = json.loads(FIXTURE.read_text())
    routes = [normalize_route(route) for route in payload["routes"]]
    for route, label in zip(
        routes, ("Michigan corridor", "Indiana / Ohio corridor", "Fort Wayne corridor")
    ):
        route["via"] = label
    return payload["origin"], payload["destination"], routes


def demo_forecasts(points, hours):
    result = {}
    for lat, lon in set(point_key(lat, lon) for lat, lon in points):
        values = {}
        for index, hour in enumerate(hours):
            # Two moving weather areas provide stable comparisons and show all
            # risk bands as the corridor time slider moves. These are not forecasts.
            north = math.exp(
                -(
                    ((lon - (-85.8 + index * 0.028)) / 0.8) ** 2
                    + ((lat - 42.20) / 0.27) ** 2
                )
            )
            south = math.exp(
                -(
                    ((lon - (-84.6 + index * 0.012)) / 0.85) ** 2
                    + ((lat - 41.55) / 0.25) ** 2
                )
            )
            pulse = 1 + 0.22 * math.sin(index / 7)
            values[iso(hour)] = {
                "wind_mph": 16 + 46 * north * pulse + 17 * south,
                "rain_in": 0.015 + 0.62 * north * pulse + 0.60 * south,
                "snow_in": max(0, 2.8 * north * pulse - 0.25),
            }
        result[(lat, lon)] = values
    return result
