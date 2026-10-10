from django.test import SimpleTestCase

from routing.risk import recommend, risk_for, summarize


class RiskTests(SimpleTestCase):
    def score(self, wind=0, rain=0, snow=0, load=0):
        return risk_for({"wind_mph": wind, "rain_in": rain, "snow_in": snow}, load)["risk_score"]

    def test_wind_continuous_boundaries(self):
        for wind, expected in [(0, 0), (24.999, 0), (25, 1), (34.999, 1), (35, 2), (44.999, 2), (45, 3), (54.999, 3), (55, 4)]:
            with self.subTest(wind=wind):
                self.assertEqual(self.score(wind=wind), expected)

    def test_rain_shared_edges_choose_higher_band(self):
        for rain, expected in [(0.0999, 0), (0.10, 1), (0.2499, 1), (0.25, 2), (0.4999, 2), (0.50, 3), (1, 3), (1.0001, 4)]:
            with self.subTest(rain=rain):
                self.assertEqual(self.score(rain=rain), expected)

    def test_snow_shared_edges_choose_higher_band(self):
        for snow, expected in [(0.4999, 0), (0.5, 1), (0.9999, 1), (1, 2), (1.9999, 2), (2, 3), (3, 3), (3.0001, 4)]:
            with self.subTest(snow=snow):
                self.assertEqual(self.score(snow=snow), expected)

    def test_load_rules_are_strict_at_weight_boundaries(self):
        self.assertEqual(self.score(wind=45, load=30000), 3)
        self.assertEqual(self.score(wind=45, load=30000.1), 4)
        self.assertEqual(self.score(wind=35, load=40000), 2)
        self.assertEqual(self.score(wind=35, load=40000.1), 3)
        self.assertEqual(self.score(wind=34.999, load=80000), 1)
        self.assertEqual(self.score(wind=44.999, load=40001), 3)
        self.assertEqual(self.score(wind=55, load=0), 4)

    def test_worst_condition_wins(self):
        self.assertEqual(self.score(wind=10, rain=0.3, snow=2.4), 3)

    def test_missing_invalid_or_negative_measurement_is_unknown(self):
        for invalid in [None, float("nan"), float("inf"), -1, True, "20"]:
            self.assertIsNone(self.score(wind=invalid))

    def test_summary_weights_miles_including_final_partial_segment(self):
        result = summarize([{"mile": 0, "risk_score": 0}, {"mile": 25, "risk_score": 0}, {"mile": 50, "risk_score": 2}, {"mile": 52, "risk_score": 3}])
        self.assertEqual(result["risk_miles"]["low"], 25)
        self.assertEqual(result["risk_miles"]["high"], 25)
        self.assertEqual(result["risk_miles"]["severe"], 2)
        self.assertEqual(result["average_risk"], 56 / 52)

    def test_unknown_and_no_travel_propagate_and_exclude_route(self):
        for score in [None, 4]:
            result = summarize([{"mile": 0, "risk_score": 0}, {"mile": 10, "risk_score": score}, {"mile": 11, "risk_score": 0}])
            self.assertFalse(result["eligible"])
            self.assertEqual(result["risk_miles"]["unknown" if score is None else "no_travel"], 11)
        self.assertIsNone(summarize([{"mile": 0, "risk_score": None}, {"mile": 11, "risk_score": 0}])["average_risk"])

    def test_ranking_prioritizes_severe_then_high_miles_over_shorter_time(self):
        routes = [
            {"id": "fast", "eligible": True, "risk_miles": {"severe": 1, "high": 0}, "average_risk": 0.1, "duration_minutes": 10},
            {"id": "best", "eligible": True, "risk_miles": {"severe": 0, "high": 2}, "average_risk": 0.5, "duration_minutes": 60},
            {"id": "high", "eligible": True, "risk_miles": {"severe": 0, "high": 3}, "average_risk": 0.1, "duration_minutes": 10},
            {"id": "excluded", "eligible": False, "risk_miles": {"severe": 0, "high": 0}, "average_risk": 0, "duration_minutes": 1},
        ]
        self.assertEqual(recommend(routes), "best")
        self.assertIsNone(recommend([routes[-1]]))

    def test_ties_use_weighted_average_then_duration(self):
        template = {"eligible": True, "risk_miles": {"severe": 0, "high": 0}}
        routes = [{**template, "id": "a", "average_risk": 0.6, "duration_minutes": 20}, {**template, "id": "b", "average_risk": 0.5, "duration_minutes": 30}, {**template, "id": "c", "average_risk": 0.5, "duration_minutes": 25}]
        self.assertEqual(recommend(routes), "c")
