from datetime import datetime, timedelta, timezone

from .demo import demo_forecasts, demo_routes
from .errors import ValidationError
from .providers import forecasts, point_key
from .risk import recommend, risk_for, summarize
from .routes import METERS_PER_MILE, corridor_grid, get_routes, iso, sample_route

UNKNOWN_WEATHER = {"wind_mph": None, "rain_in": None, "snow_in": None}


def weather_at(series, eta):
    """Wind is instantaneous; precipitation is accumulated through hour end."""
    lower = eta.replace(minute=0, second=0, microsecond=0)
    upper = lower if eta == lower else lower + timedelta(hours=1)
    previous = series.get(iso(lower), UNKNOWN_WEATHER)
    following = series.get(iso(upper), UNKNOWN_WEATHER)
    wind0, wind1 = previous["wind_mph"], following["wind_mph"]
    fraction = (eta - lower).total_seconds() / 3600
    wind = (
        None if wind0 is None or wind1 is None else wind0 + (wind1 - wind0) * fraction
    )
    return {
        "wind_mph": wind,
        "rain_in": following["rain_in"],
        "snow_in": following["snow_in"],
    }, iso(upper)


def build_plan(trip):
    departure = trip["departure"]
    origin, destination = trip["origin"], trip["destination"]
    if trip["demo"]:
        origin, destination, raw_routes = demo_routes()
        warnings = [
            "Demo: Chicago–Detroit road geometry is recorded from OSRM; all weather is synthetic and changes relative to departure."
        ]
    else:
        raw_routes, warnings = get_routes(origin, destination)
    warnings += [
        "Prototype only: OSRM driving routes do not account for truck clearance, weight restrictions, closures, traffic, rest stops, or hours-of-service. Verify conditions before travel."
    ]
    hour0 = departure.replace(minute=0, second=0, microsecond=0)
    hours = [hour0 + timedelta(hours=i) for i in range(49)]
    routes, points = [], []
    for index, raw in enumerate(raw_routes):
        route_id = f"route-{index + 1}"
        checkpoints = sample_route(raw, trip["spacing_miles"], departure, route_id)
        points.extend((cp["lat"], cp["lon"]) for cp in checkpoints)
        routes.append(
            {
                "id": route_id,
                "name": f"Route {index + 1}",
                "via": raw.get(
                    "via",
                    "Primary road corridor"
                    if index == 0
                    else "Alternative road corridor",
                ),
                "geometry": raw["geometry"],
                "distance_miles": raw["distance"] / METERS_PER_MILE,
                "duration_minutes": raw["duration"] / 60,
                "arrival": iso(departure + timedelta(seconds=raw["duration"])),
                "checkpoints": checkpoints,
            }
        )
    corridor_locations = corridor_grid(raw_routes, departure)
    points.extend(corridor_locations)
    if len(set(point_key(*p) for p in points)) > 600:
        raise ValidationError(
            "This trip needs too many forecast locations. Choose 25 or 50 mile spacing, or a shorter trip.",
            {
                "spacing_miles": "Increase spacing to keep this request within the forecast budget."
            },
        )
    # One extra hour covers the final interpolation for departures off the hour.
    weather = (
        demo_forecasts(points, hours + [hours[-1] + timedelta(hours=1)])
        if trip["demo"]
        else forecasts(points)
    )
    for route in routes:
        for cp in route["checkpoints"]:
            data, weather_time = weather_at(
                weather.get(point_key(cp["lat"], cp["lon"]), {}),
                datetime.fromisoformat(cp["eta"].replace("Z", "+00:00")),
            )
            cp.update(
                {
                    "weather": data,
                    "weather_time": weather_time,
                    **risk_for(data, trip["load_lbs"]),
                }
            )
        route.update(summarize(route["checkpoints"]))
    corridor_points = []
    for lat, lon in corridor_locations:
        series = weather.get((lat, lon), {})
        values = [series.get(iso(hour), UNKNOWN_WEATHER) for hour in hours]
        corridor_points.append(
            {
                "lat": lat,
                "lon": lon,
                "risk_scores": [
                    risk_for(value, trip["load_lbs"])["risk_score"] for value in values
                ],
                **{key: [value[key] for value in values] for key in UNKNOWN_WEATHER},
            }
        )
    if any(route["risk_miles"]["unknown"] for route in routes):
        warnings.append(
            "Some arrival-time weather is unavailable. Routes with unknown weather are excluded from recommendations; no last-hour forecast has been reused."
        )
    if any(None in p["risk_scores"] for p in corridor_points):
        warnings.append(
            "Some corridor forecast hours are unavailable and are shown as unknown."
        )
    recommendation = recommend(routes)
    return {
        "mode": "demo" if trip["demo"] else "live",
        "generated_at": iso(datetime.now(timezone.utc)),
        "departure": iso(departure),
        "origin": origin,
        "destination": destination,
        "load_lbs": trip["load_lbs"],
        "spacing_miles": trip["spacing_miles"],
        "routes": routes,
        "recommended_route_id": recommendation,
        "recommendation_reason": "Fewest severe miles, then high miles, distance-weighted average risk, and travel time. Routes with no-travel or unknown segments are excluded."
        if recommendation
        else "No route qualifies: every option includes no-travel conditions or unknown weather. Change the trip and recalculate.",
        "warnings": warnings,
        "sources": {
            "routing": "Recorded OSRM / OpenStreetMap routes"
            if trip["demo"]
            else "OSRM / OpenStreetMap",
            "weather": "Synthetic demonstration weather"
            if trip["demo"]
            else "Open-Meteo",
            "geocoding": "Open-Meteo",
        },
        "corridor": {"hours": [iso(hour) for hour in hours], "points": corridor_points},
    }
