"""Assessment thresholds. Values stay unrounded until they reach the UI."""
import math

LEVELS = ("low", "moderate", "high", "severe", "no_travel")


def valid_measurement(value):
    try:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0
    except OverflowError:
        return False


def risk_for(weather, load_lbs):
    values = [weather.get(key) for key in ("wind_mph", "rain_in", "snow_in")]
    if not all(valid_measurement(value) for value in values):
        return {"risk_level": "unknown", "risk_score": None, "reasons": ["Weather unavailable for this place or hour"]}
    wind, rain, snow = values
    wind_risk = sum(wind >= boundary for boundary in (25, 35, 45, 55))
    rain_risk = 4 if rain > 1 else sum(rain >= boundary for boundary in (0.10, 0.25, 0.50))
    snow_risk = 4 if snow > 3 else sum(snow >= boundary for boundary in (0.5, 1, 2))
    reasons = []
    if wind_risk:
        reasons.append(f"Wind {wind:.1f} mph")
    if rain_risk:
        reasons.append(f"Rain {rain:.2f} in/hr")
    if snow_risk:
        reasons.append(f"Snow {snow:.2f} in/hr")
    if 45 <= wind < 55 and load_lbs > 30_000:
        wind_risk = 4
        reasons.append("Load above 30,000 lb with 45–54.99 mph wind: no travel")
    elif 35 <= wind < 45 and load_lbs > 40_000:
        wind_risk = 3
        reasons.append("Load above 40,000 lb with 35–44.99 mph wind: severe")
    score = max(wind_risk, rain_risk, snow_risk)
    return {"risk_level": LEVELS[score], "risk_score": score, "reasons": reasons or ["Within low-risk thresholds"]}


def summarize(checkpoints):
    miles = dict.fromkeys((*LEVELS, "unknown"), 0.0)
    for start, end in zip(checkpoints, checkpoints[1:]):
        distance = end["mile"] - start["mile"]
        score = None if start["risk_score"] is None or end["risk_score"] is None else max(start["risk_score"], end["risk_score"])
        miles["unknown" if score is None else LEVELS[score]] += distance
    total = sum(miles.values())
    average = None if miles["unknown"] else sum(miles[level] * score for score, level in enumerate(LEVELS)) / total if total else 0.0
    level = "unknown" if miles["unknown"] else next((level for level in reversed(LEVELS) if miles[level] > 0), "low")
    return {"risk_miles": miles, "average_risk": average, "risk_level": level, "eligible": not (miles["unknown"] or miles["no_travel"])}


def recommend(routes):
    eligible = [r for r in routes if r["eligible"]]
    if not eligible:
        return None
    return min(eligible, key=lambda r: (r["risk_miles"]["severe"], r["risk_miles"]["high"], r["average_risk"], r["duration_minutes"]))["id"]
