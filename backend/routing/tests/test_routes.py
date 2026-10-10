from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.test import SimpleTestCase

from routing.errors import ProviderError
from routing.routes import METERS_PER_MILE, get_routes, normalize_route, sample_route


def raw_route():
    return {"distance": 20 * METERS_PER_MILE, "duration": 2400, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 0], [2, 0]]}, "legs": [{"annotation": {"distance": [10 * METERS_PER_MILE] * 2, "duration": [300, 900]}}]}


class RouteTests(SimpleTestCase):
    def test_sampling_uses_edge_speeds_and_turn_adjusted_total(self):
        departure = datetime(2026, 10, 10, tzinfo=timezone.utc)
        points = sample_route(normalize_route(raw_route()), 10, departure, "route-1")
        self.assertEqual(len(points), 3)
        self.assertEqual(points[1]["eta"], "2026-10-10T00:10:00Z")
        self.assertEqual(points[-1]["eta"], "2026-10-10T00:40:00Z")
        self.assertEqual(points[-1]["mile"], 20)
        self.assertEqual(points[-1]["lon"], 2)

    def test_final_partial_interval_and_interpolation(self):
        raw = raw_route()
        raw["distance"] = 23 * METERS_PER_MILE
        points = sample_route(normalize_route(raw), 10, datetime.now(timezone.utc), "route-1")
        self.assertEqual([p["mile"] for p in points], [0, 10, 20, 23])
        self.assertAlmostEqual(points[1]["lon"], 10 / 11.5)

    def test_incomplete_annotations_are_rejected(self):
        raw = raw_route()
        raw["legs"][0]["annotation"]["duration"] = [1]
        with self.assertRaises(ProviderError):
            normalize_route(raw)

    @patch("routing.routes.osrm_route")
    def test_fewer_routes_are_honest_and_duplicates_not_cloned(self, fetch):
        fetch.return_value = [raw_route(), raw_route()]
        routes, warnings = get_routes({"lat": 0, "lon": 0}, {"lat": 0, "lon": 2})
        self.assertEqual(len(routes), 1)
        self.assertIn("1 distinct route", warnings[0])
        self.assertEqual(fetch.call_count, 3)

    @patch("routing.routes.osrm_route", side_effect=ProviderError("offline"))
    def test_provider_failure_propagates(self, fetch):
        with self.assertRaises(ProviderError):
            get_routes({"lat": 0, "lon": 0}, {"lat": 0, "lon": 2})
