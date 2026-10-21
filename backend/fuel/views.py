"""One-route fuel planning API for the Spotter backend exercise."""

import json
import logging
import math
import statistics

from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from routing.errors import ProviderError
from routing.providers import osrm_route
from routing.routes import normalize_route

from .catalog import load_catalog, resolve_place, search_places
from .optimization import FuelPlanError, nearby_stations, optimize_fuel

logger = logging.getLogger(__name__)


def error(message, status=400, code="validation_error", fields=None):
    return JsonResponse(
        {"error": message, "code": code, "fields": fields or {}}, status=status
    )


@require_GET
def places(request):
    query = request.GET.get("q", "").strip()
    if not 2 <= len(query) <= 100:
        return error(
            "Enter at least two characters.", fields={"q": "Use 2–100 characters."}
        )
    return JsonResponse({"places": search_places(query)})


@require_POST
def plan(request):
    if request.content_type != "application/json":
        return error("Send application/json.")
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError, RequestDataTooBig):
        return error("Send a valid JSON object under the request size limit.")
    if not isinstance(data, dict):
        return error("Send a JSON object.")
    origin = resolve_place(data.get("origin"))
    destination = resolve_place(data.get("destination"))
    fields = {}
    if origin is None:
        fields["origin"] = (
            "Choose a US city and two-letter state from /api/fuel/places/."
        )
    if destination is None:
        fields["destination"] = (
            "Choose a US city and two-letter state from /api/fuel/places/."
        )
    if origin and destination and origin == destination:
        fields["destination"] = "Choose a different destination."
    starting = data.get("starting_fuel_gallons", 50)
    if (
        isinstance(starting, bool)
        or not isinstance(starting, (int, float))
        or not math.isfinite(starting)
        or not 0 <= starting <= 50
    ):
        fields["starting_fuel_gallons"] = (
            "Enter 0–50 gallons. A full tank is the default."
        )
    if fields:
        return error("Check the trip details.", fields=fields)
    try:
        raw_route = osrm_route(
            [(origin["lon"], origin["lat"]), (destination["lon"], destination["lat"])],
            alternatives=False,
        )[0]
        route = normalize_route(raw_route)
        distance_miles = route["distance"] / 1609.344
        if distance_miles > 5000:
            return error(
                "Routes longer than 5,000 miles are not supported.",
                fields={"destination": "Choose a closer destination."},
            )
        candidates = nearby_stations(route)
        result = optimize_fuel(distance_miles, candidates, starting)
        start_prices = [
            station["price_per_gallon"]
            for station in candidates
            if station["route_mile"] <= 25
        ]
        initial_price = (
            min(start_prices)
            if start_prices
            else statistics.median(
                station["price_per_gallon"] for station in load_catalog()[1]
            )
        )
        initial_price_source = (
            "Lowest listed price in the first 25 route miles"
            if start_prices
            else "Median listed US station price"
        )
        estimated_total_cost = (
            result["total_fuel_spend_usd"]
            + min(starting, result["gallons_consumed"]) * initial_price
        )
    except ProviderError as exc:
        logger.warning("Fuel route provider failed: %s", exc)
        return error(str(exc), status=502, code="provider_error")
    except FuelPlanError as exc:
        return error(str(exc), status=422, code="no_feasible_fuel_plan")
    return JsonResponse(
        {
            "origin": origin,
            "destination": destination,
            "route": {
                "type": "Feature",
                "geometry": route["geometry"],
                "properties": {
                    "distance_miles": round(distance_miles, 2),
                    "duration_minutes": round(route["duration"] / 60, 1),
                },
            },
            "fuel_stops": [
                {
                    **stop,
                    "route_mile": round(stop["route_mile"], 1),
                    "straight_line_offset_miles": round(
                        stop["straight_line_offset_miles"], 1
                    ),
                }
                for stop in result["stops"]
            ],
            "total_fuel_spend_usd": result["total_fuel_spend_usd"],
            "estimated_trip_fuel_cost_usd": round(estimated_total_cost, 2),
            "gallons_purchased": result["gallons_purchased"],
            "gallons_consumed": result["gallons_consumed"],
            "fuel_on_arrival_gallons": result["fuel_on_arrival_gallons"],
            "assumptions": {
                "starting_fuel_gallons": starting,
                "tank_capacity_gallons": 50,
                "maximum_range_miles": 500,
                "miles_per_gallon": 10,
                "initial_fuel_cost_included": False,
                "estimated_initial_fuel_price_per_gallon": round(initial_price, 4),
                "estimated_initial_fuel_price_source": initial_price_source,
                "station_position": "City-level GeoNames estimate; straight-line offset is not a verified road detour.",
            },
            "data_sources": {
                "prices": "Supplied Spotter assessment CSV",
                "locations": "GeoNames US postal-code places (CC BY 4.0)",
                "routing": "OSRM / OpenStreetMap",
            },
        },
        json_dumps_params={"allow_nan": False},
    )
