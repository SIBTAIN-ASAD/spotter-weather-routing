import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.test import SimpleTestCase

from routing.errors import ProviderError


def request_data(**overrides):
    return {
        "origin": {"name": "Chicago", "lat": 41.8781, "lon": -87.6298},
        "destination": {"name": "Detroit", "lat": 42.3314, "lon": -83.0458},
        "departure": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "load_lbs": 35000,
        "spacing_miles": 25,
        "demo": True,
        **overrides,
    }


class ApiTests(SimpleTestCase):
    def post(self, data):
        return self.client.post(
            "/api/plan/", json.dumps(data), content_type="application/json"
        )

    def test_health(self):
        self.assertEqual(self.client.get("/api/health/").json(), {"status": "ok"})

    def test_demo_full_contract_three_distinct_routes_and_49_local_frames(self):
        with patch(
            "routing.providers.request_json",
            side_effect=AssertionError("Demo must not use the network"),
        ):
            response = self.post(request_data())
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertEqual(data["mode"], "demo")
        self.assertEqual(len(data["routes"]), 3)
        self.assertEqual(len({json.dumps(r["geometry"]) for r in data["routes"]}), 3)
        self.assertEqual(len(data["corridor"]["hours"]), 49)
        for point in data["corridor"]["points"]:
            self.assertEqual(len(point["risk_scores"]), 49)
        self.assertEqual(
            {
                score
                for point in data["corridor"]["points"]
                for score in point["risk_scores"]
            },
            {0, 1, 2, 3, 4},
        )
        checkpoint_positions = {
            (round(cp["lat"], 3), round(cp["lon"], 3))
            for route in data["routes"]
            for cp in route["checkpoints"]
        }
        self.assertTrue(
            any(
                (p["lat"], p["lon"]) not in checkpoint_positions
                for p in data["corridor"]["points"]
            )
        )
        for route in data["routes"]:
            self.assertEqual(route["checkpoints"][-1]["eta"], route["arrival"])
            self.assertAlmostEqual(
                sum(route["risk_miles"].values()), route["distance_miles"]
            )
        self.assertIn(
            data["recommended_route_id"],
            [r["id"] for r in data["routes"] if r["eligible"]],
        )
        self.assertIn("synthetic", " ".join(data["warnings"]).lower())

    @patch(
        "routing.planning.get_routes", side_effect=ProviderError("Routing unavailable")
    )
    def test_live_failure_never_silently_switches_to_demo(self, fetch):
        response = self.post(request_data(demo=False))
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "provider_error")
        self.assertNotIn("routes", response.json())

    def test_invalid_weight_spacing_and_timezone(self):
        cases = [
            {"load_lbs": -1},
            {"load_lbs": True},
            {"load_lbs": 80001},
            {"load_lbs": "35000"},
            {"spacing_miles": 0},
            {"spacing_miles": 20},
            {"departure": "2026-10-10T12:00:00"},
            {"departure": "bad"},
            {"departure": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()},
            {"departure": (datetime.now(timezone.utc) + timedelta(days=6)).isoformat()},
            {"demo": "true"},
            {"origin": {"name": "Invalid", "lat": 91, "lon": 0}},
        ]
        for overrides in cases:
            with self.subTest(overrides=overrides):
                response = self.post(request_data(**overrides))
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "validation_error")
                self.assertTrue(response.json()["fields"])

    def test_identical_places_are_rejected(self):
        data = request_data()
        data["destination"] = data["origin"]
        self.assertEqual(self.post(data).status_code, 400)

    def test_oversized_numbers_are_validation_errors(self):
        for overrides in [
            {"load_lbs": 10**400},
            {"spacing_miles": 10**400},
            {"origin": {"name": "Invalid", "lat": 10**400, "lon": 0}},
        ]:
            with self.subTest(field=next(iter(overrides))):
                response = self.post(request_data(**overrides))
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "validation_error")

    def test_json_required_and_malformed_json_rejected(self):
        self.assertEqual(
            self.client.post(
                "/api/plan/", "bad", content_type="text/plain"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/plan/", "{", content_type="application/json"
            ).status_code,
            400,
        )
        self.assertEqual(self.post([]).status_code, 400)

    def test_place_query_length_and_unknown_api(self):
        self.assertEqual(self.client.get("/api/places/?q=x").status_code, 400)
        self.assertEqual(self.client.get("/api/missing/").status_code, 404)
