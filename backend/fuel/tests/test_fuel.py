import json
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase
from routing.routes import normalize_route

from fuel.catalog import load_catalog, resolve_place
from fuel.optimization import FuelPlanError, nearby_stations, optimize_fuel


class CatalogTests(SimpleTestCase):
    def test_real_assessment_prices_and_us_locations_load(self):
        places, stations = load_catalog()
        self.assertGreater(len(places), 20_000)
        self.assertGreater(len(stations), 3_000)
        self.assertEqual(resolve_place("Chicago, IL")["state"], "IL")
        self.assertIsNone(resolve_place("Toronto, ON"))


class OptimizationTests(SimpleTestCase):
    def test_cheaper_stop_ahead_limits_purchase(self):
        stations = [
            {"route_mile": 450, "price_per_gallon": 4.0},
            {"route_mile": 700, "price_per_gallon": 3.0},
        ]
        result = optimize_fuel(900, stations)
        self.assertEqual([round(s["gallons"]) for s in result["stops"]], [20, 20])
        self.assertEqual(result["total_fuel_spend_usd"], 140)

    def test_full_starting_tank_requires_no_purchase_on_short_route(self):
        result = optimize_fuel(280, [], starting_gallons=50)
        self.assertEqual(result["total_fuel_spend_usd"], 0)
        self.assertEqual(result["gallons_consumed"], 28)

    def test_gap_over_range_fails_instead_of_inventing_stop(self):
        with self.assertRaises(FuelPlanError):
            optimize_fuel(1100, [{"route_mile": 600, "price_per_gallon": 3}])

    def test_station_search_stays_near_recorded_road(self):
        fixture = (
            Path(__file__).resolve().parents[2]
            / "routing/fixtures/chicago-detroit.json"
        )
        raw = json.loads(fixture.read_text())["routes"][0]
        stations = nearby_stations(normalize_route(raw))
        self.assertGreater(len(stations), 20)
        self.assertTrue(all(s["straight_line_offset_miles"] <= 12 for s in stations))


class FuelApiTests(SimpleTestCase):
    def test_us_city_lookup_and_validation(self):
        response = self.client.get("/api/fuel/places/?q=Chicago")
        self.assertEqual(response.status_code, 200)
        self.assertIn("IL", [p["state"] for p in response.json()["places"]])
        response = self.client.post(
            "/api/fuel/plan/",
            data=json.dumps({"origin": "Toronto, ON", "destination": "Detroit, MI"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("origin", response.json()["fields"])

    @patch("fuel.views.osrm_route")
    def test_api_returns_geojson_cost_and_uses_one_route_call(self, route_call):
        fixture = (
            Path(__file__).resolve().parents[2]
            / "routing/fixtures/chicago-detroit.json"
        )
        route_call.return_value = [json.loads(fixture.read_text())["routes"][0]]
        response = self.client.post(
            "/api/fuel/plan/",
            data=json.dumps({"origin": "Chicago, IL", "destination": "Detroit, MI"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["route"]["geometry"]["type"], "LineString")
        self.assertGreater(body["route"]["properties"]["distance_miles"], 250)
        self.assertEqual(body["assumptions"]["maximum_range_miles"], 500)
        self.assertEqual(body["total_fuel_spend_usd"], 0)
        self.assertGreater(body["estimated_trip_fuel_cost_usd"], 0)
        route_call.assert_called_once()
        self.assertEqual(route_call.call_args.kwargs, {"alternatives": False})
