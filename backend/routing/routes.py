import bisect
import math
from datetime import timedelta

from .errors import ProviderError, ValidationError
from .providers import osrm_route

METERS_PER_MILE = 1609.344


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


def normalize_route(raw):
    """Full OSRM geometry and annotations have one distance/duration per edge."""
    try:
        coordinates = raw["geometry"]["coordinates"]
        distances = [
            distance
            for leg in raw["legs"]
            for distance in leg["annotation"]["distance"]
        ]
        durations = [
            duration
            for leg in raw["legs"]
            for duration in leg["annotation"]["duration"]
        ]
        total_distance, total_duration = raw["distance"], raw["duration"]
        if (
            len(coordinates) < 2
            or len(distances) != len(coordinates) - 1
            or len(durations) != len(distances)
        ):
            raise ValueError
        numbers = distances + durations + [total_distance, total_duration]
        if (
            any(
                not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0
                for v in numbers
            )
            or min(sum(distances), sum(durations), total_distance, total_duration) <= 0
        ):
            raise ValueError
        if any(
            not isinstance(p, list)
            or len(p) != 2
            or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in p)
            or not -180 <= p[0] <= 180
            or not -90 <= p[1] <= 90
            for p in coordinates
        ):
            raise ValueError
        # The route total includes turn costs; annotations do not. Scaling keeps
        # relative per-edge speed variation and reconciles the destination ETA.
        distance_scale, duration_scale = (
            total_distance / sum(distances),
            total_duration / sum(durations),
        )
        return {
            "geometry": raw["geometry"],
            "distances": [d * distance_scale for d in distances],
            "durations": [d * duration_scale for d in durations],
            "distance": total_distance,
            "duration": total_duration,
        }
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
        raise ProviderError(
            "Routing service returned geometry without usable per-edge travel times."
        ) from exc


def route_cells(route):
    return {
        (round(lon, 2), round(lat, 2)) for lon, lat in route["geometry"]["coordinates"]
    }


def distinct(candidate, routes):
    cells = route_cells(candidate)
    return all(
        len(cells & route_cells(route)) / max(1, len(cells | route_cells(route))) < 0.94
        for route in routes
    )


def get_routes(origin, destination):
    endpoints = [
        (origin["lon"], origin["lat"]),
        (destination["lon"], destination["lat"]),
    ]
    routes = []
    for raw in osrm_route(endpoints):
        candidate = normalize_route(raw)
        if distinct(candidate, routes):
            routes.append(candidate)
        if len(routes) == 3:
            break
    # Some OSRM deployments return fewer alternatives. Two perpendicular
    # midpoint waypoints may find distinct roads, but never invent a route.
    (lon1, lat1), (lon2, lat2) = endpoints
    dx, dy = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)), lat2 - lat1
    norm = math.hypot(dx, dy)
    if norm > 0.1:
        offset = min(norm * 0.18, 0.8)
        for sign in (1, -1):
            if len(routes) == 3:
                break
            lat = (lat1 + lat2) / 2 + sign * dx / norm * offset
            lon = (lon1 + lon2) / 2 - sign * dy / norm * offset / max(
                0.15, math.cos(math.radians(lat))
            )
            if not -85 <= lat <= 85 or not -180 <= lon <= 180:
                continue
            try:
                candidate = normalize_route(
                    osrm_route(
                        [endpoints[0], (lon, lat), endpoints[1]], alternatives=False
                    )[0]
                )
                if candidate["distance"] < routes[0]["distance"] * 1.8 and distinct(
                    candidate, routes
                ):
                    candidate["via"] = (
                        "Alternative road corridor (via intermediate waypoint)"
                    )
                    routes.append(candidate)
            except ProviderError:
                continue
    if not routes:
        raise ProviderError("No usable routes were returned.")
    warnings = (
        []
        if len(routes) >= 3
        else [
            f"The routing provider returned {len(routes)} distinct route{'s' if len(routes) != 1 else ''}; additional alternatives were unavailable."
        ]
    )
    return routes, warnings


def sample_route(route, spacing_miles, departure, route_id):
    distance_miles = route["distance"] / METERS_PER_MILE
    if distance_miles > 3500 or route["duration"] > 48 * 3600:
        raise ValidationError(
            "This prototype supports road trips up to 3,500 miles and 48 driving hours. Choose a shorter trip.",
            {"destination": "Trip exceeds the supported distance or duration."},
        )
    cumulative_distances, cumulative_durations = [0.0], [0.0]
    for distance, duration in zip(route["distances"], route["durations"]):
        cumulative_distances.append(cumulative_distances[-1] + distance)
        cumulative_durations.append(cumulative_durations[-1] + duration)
    target_miles = [
        float(i * spacing_miles)
        for i in range(math.ceil(distance_miles / spacing_miles))
    ] + [distance_miles]
    coordinates = route["geometry"]["coordinates"]
    checkpoints = []
    for index, mile in enumerate(target_miles):
        if index == len(target_miles) - 1:
            lon, lat = coordinates[-1]
            seconds = route["duration"]
        else:
            meters = mile * METERS_PER_MILE
            edge = min(
                bisect.bisect_right(cumulative_distances, meters) - 1,
                len(route["distances"]) - 1,
            )
            fraction = (
                (meters - cumulative_distances[edge]) / route["distances"][edge]
                if route["distances"][edge]
                else 0
            )
            start, end = coordinates[edge], coordinates[edge + 1]
            lon, lat = [a + (b - a) * fraction for a, b in zip(start, end)]
            seconds = cumulative_durations[edge] + route["durations"][edge] * fraction
        checkpoints.append(
            {
                "id": f"{route_id}-cp-{index}",
                "lat": lat,
                "lon": lon,
                "mile": mile,
                "eta": iso(departure + timedelta(seconds=seconds)),
            }
        )
    return checkpoints


def corridor_grid(routes, departure):
    """A bounded three-point-wide strip, sampled independently of checkpoints."""
    spacing = max(50, max(route["distance"] / METERS_PER_MILE for route in routes) / 12)
    points = set()
    for route in routes:
        centers = sample_route(route, spacing, departure, "corridor")
        for i, center in enumerate(centers):
            before, after = (
                centers[max(0, i - 1)],
                centers[min(len(centers) - 1, i + 1)],
            )
            latitude_scale = max(0.15, math.cos(math.radians(center["lat"])))
            dx, dy = (
                (after["lon"] - before["lon"]) * latitude_scale,
                after["lat"] - before["lat"],
            )
            norm = math.hypot(dx, dy) or 1
            for offset_miles in (-8, 0, 8):
                lat = center["lat"] + dx / norm * offset_miles / 69
                lon = center["lon"] - dy / norm * offset_miles / (69 * latitude_scale)
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    points.add((round(lat, 3), round(lon, 3)))
    return sorted(points)
