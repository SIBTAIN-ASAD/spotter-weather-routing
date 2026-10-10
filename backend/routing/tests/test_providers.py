from datetime import datetime, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase

from routing.errors import ProviderError
from routing.planning import weather_at
from routing.providers import forecasts, geocode, parse_forecast


def forecast_payload():
    return {
        "hourly_units": {
            "wind_speed_10m": "mp/h",
            "rain": "inch",
            "showers": "inch",
            "snowfall": "cm",
        },
        "hourly": {
            "time": ["2026-10-10T12:00", "2026-10-10T13:00"],
            "wind_speed_10m": [20, 40],
            "rain": [0.1, 0.2],
            "showers": [0.01, 0.02],
            "snowfall": [0, 2.54],
        },
    }


class ProviderTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_units_and_liquid_rain_add_showers_without_snow(self):
        result = parse_forecast(forecast_payload())
        end = result["2026-10-10T13:00:00Z"]
        self.assertEqual(end["wind_mph"], 40)
        self.assertAlmostEqual(end["rain_in"], 0.22)
        self.assertAlmostEqual(end["snow_in"], 1)

    def test_eta_uses_ending_hour_precipitation_and_interpolated_wind(self):
        series = parse_forecast(forecast_payload())
        data, hour = weather_at(
            series, datetime(2026, 10, 10, 12, 30, tzinfo=timezone.utc)
        )
        self.assertEqual(data["wind_mph"], 30)
        self.assertEqual(data["snow_in"], 1)
        self.assertEqual(hour, "2026-10-10T13:00:00Z")
        exact, hour = weather_at(
            series, datetime(2026, 10, 10, 12, tzinfo=timezone.utc)
        )
        self.assertEqual(exact["snow_in"], 0)
        self.assertEqual(hour, "2026-10-10T12:00:00Z")

    def test_missing_hour_never_reuses_last_forecast(self):
        data, _ = weather_at(
            parse_forecast(forecast_payload()),
            datetime(2026, 10, 10, 15, tzinfo=timezone.utc),
        )
        self.assertEqual(data, {"wind_mph": None, "rain_in": None, "snow_in": None})

    def test_null_measurement_remains_unknown(self):
        payload = forecast_payload()
        payload["hourly"]["rain"][0] = None
        self.assertIsNone(parse_forecast(payload)["2026-10-10T12:00:00Z"]["rain_in"])

    def test_unrecognized_units_raise_clear_provider_error(self):
        payload = forecast_payload()
        payload["hourly_units"]["snowfall"] = "unrecognized"
        with self.assertRaises(ProviderError):
            parse_forecast(payload)

    def test_malformed_payload_raises_provider_error(self):
        for payload in [
            {"hourly": None},
            {"error": True},
            [],
            {"hourly": {"time": [None]}},
        ]:
            with self.subTest(payload=payload), self.assertRaises(ProviderError):
                parse_forecast(payload)

    @patch("routing.providers.request_json")
    def test_forecast_batch_deduplicates_points_and_caches(self, fetch):
        fetch.return_value = [forecast_payload(), forecast_payload()]
        first = forecasts([(41, -87), (41, -87), (42, -86)])
        self.assertEqual(len(first), 2)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[1]["latitude"], "41,42")
        self.assertEqual(fetch.call_args.args[1]["forecast_days"], 9)
        self.assertEqual(forecasts([(41, -87), (42, -86)]), first)
        self.assertEqual(fetch.call_count, 1)

    @patch("routing.providers.request_json", return_value=[])
    def test_incomplete_batch_is_an_error(self, fetch):
        with self.assertRaises(ProviderError):
            forecasts([(41, -87)])

    @patch(
        "routing.providers.request_json",
        return_value={
            "results": [
                {
                    "name": "Chicago",
                    "admin1": "Illinois",
                    "country": "United States",
                    "latitude": 41.88,
                    "longitude": -87.63,
                }
            ]
        },
    )
    def test_place_search_cached(self, fetch):
        self.assertEqual(
            geocode("Chicago")[0]["name"], "Chicago, Illinois, United States"
        )
        geocode("chicago")
        self.assertEqual(fetch.call_count, 1)

    @patch("routing.providers.request_json")
    def test_malformed_place_labels_fail_as_provider_error(self, fetch):
        for invalid in [1, [], {}]:
            fetch.return_value = {
                "results": [
                    {
                        "name": "Chicago",
                        "admin1": invalid,
                        "latitude": 41,
                        "longitude": -87,
                    }
                ]
            }
            with self.subTest(invalid=invalid), self.assertRaises(ProviderError):
                geocode("Chicago")
