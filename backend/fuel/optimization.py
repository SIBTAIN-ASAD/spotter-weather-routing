"""Project approximate city locations onto one road route and buy fuel cheaply."""

import math
from collections import defaultdict
from itertools import accumulate, pairwise

from .catalog import load_catalog

MILES_PER_METER = 1 / 1609.344
TANK_GALLONS = 50.0
MPG = 10.0
MAX_OFFSET_MILES = 12.0


class FuelPlanError(Exception):
    pass


def nearby_stations(route):
    """A spatial grid avoids comparing every CSV city with every route edge."""
    coords = route["geometry"]["coordinates"]
    lengths = [0.0, *accumulate(d * MILES_PER_METER for d in route["distances"])]
    grid = defaultdict(list)
    cell = 0.5
    for i, (a, b) in enumerate(pairwise(coords)):
        # Expanded boxes allow a 12-mile city-to-road offset at US latitudes.
        for x in range(
            math.floor((min(a[0], b[0]) - 0.5) / cell),
            math.floor((max(a[0], b[0]) + 0.5) / cell) + 1,
        ):
            for y in range(
                math.floor((min(a[1], b[1]) - 0.3) / cell),
                math.floor((max(a[1], b[1]) + 0.3) / cell) + 1,
            ):
                grid[(x, y)].append(i)
    result = []
    for station in load_catalog()[1]:
        lon, lat = station["lon"], station["lat"]
        edges = grid.get((math.floor(lon / cell), math.floor(lat / cell)), ())
        if not edges:
            continue
        east_scale = 69.172 * math.cos(math.radians(lat))
        best = (float("inf"), 0.0)
        for i in edges:
            a, b = coords[i], coords[i + 1]
            ax, ay = (a[0] - lon) * east_scale, (a[1] - lat) * 69.0
            dx, dy = (b[0] - a[0]) * east_scale, (b[1] - a[1]) * 69.0
            fraction = (
                max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
                if dx or dy
                else 0.0
            )
            offset = math.hypot(ax + fraction * dx, ay + fraction * dy)
            if offset < best[0]:
                best = (offset, lengths[i] + (lengths[i + 1] - lengths[i]) * fraction)
        if best[0] <= MAX_OFFSET_MILES and 0 < best[1] < lengths[-1]:
            result.append(
                {
                    **station,
                    "route_mile": best[1],
                    "straight_line_offset_miles": best[0],
                }
            )
    return sorted(result, key=lambda s: (s["route_mile"], s["price_per_gallon"]))


def optimize_fuel(distance_miles, stations, starting_gallons=TANK_GALLONS):
    """Greedy minimum-price fill strategy on a fixed route with a 50-gal tank.

    Buy only enough to reach the next cheaper stop when possible; otherwise
    fill the tank. The destination acts like a zero-price terminal station.
    """
    if not 0 <= starting_gallons <= TANK_GALLONS:
        raise FuelPlanError("Starting fuel must be between 0 and 50 gallons.")
    fuel, mile, purchases = starting_gallons, 0.0, []
    route_stations = [s for s in stations if 0 < s["route_mile"] < distance_miles]
    for index, station in enumerate(route_stations):
        delta = station["route_mile"] - mile
        if delta < -0.001:
            raise FuelPlanError("Fuel stops must be ordered along the route.")
        # A station outside the current range is unreachable, but a later one
        # may still be reached only if this one was already beyond range: fail.
        if delta > fuel * MPG + 0.001:
            raise FuelPlanError(
                "The supplied stations leave a gap beyond the vehicle's fuel range."
            )
        fuel -= delta / MPG
        mile = station["route_mile"]
        cheaper = next(
            (
                s
                for s in route_stations[index + 1 :]
                if s["route_mile"] - mile <= TANK_GALLONS * MPG
                and s["price_per_gallon"] < station["price_per_gallon"]
            ),
            None,
        )
        target = cheaper["route_mile"] if cheaper else mile + TANK_GALLONS * MPG
        if distance_miles - mile <= TANK_GALLONS * MPG and (
            cheaper is None or distance_miles < cheaper["route_mile"]
        ):
            target = distance_miles
        needed = max(0.0, min(TANK_GALLONS, (target - mile) / MPG) - fuel)
        if needed > 1e-7:
            cost = needed * station["price_per_gallon"]
            purchases.append(
                {
                    **station,
                    "gallons": round(needed, 3),
                    "cost_usd": round(cost, 2),
                    "fuel_after_gallons": round(fuel + needed, 3),
                }
            )
            fuel += needed
    if distance_miles - mile > fuel * MPG + 0.001:
        raise FuelPlanError(
            "The supplied stations leave a gap beyond the vehicle's fuel range."
        )
    return {
        "stops": purchases,
        "total_fuel_spend_usd": round(sum(stop["cost_usd"] for stop in purchases), 2),
        "gallons_purchased": round(sum(stop["gallons"] for stop in purchases), 3),
        "gallons_consumed": round(distance_miles / MPG, 3),
        "fuel_on_arrival_gallons": round(fuel - (distance_miles - mile) / MPG, 3),
    }
