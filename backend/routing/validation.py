import math
from datetime import datetime, timedelta, timezone
from .errors import ValidationError


def number(value):
    try:
        return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)
    except OverflowError:
        return False


def validate_plan(data, now=None):
    if not isinstance(data, dict):
        raise ValidationError("Send a JSON object.")
    fields = {}
    for key in ("origin", "destination"):
        place = data.get(key)
        if not isinstance(place, dict) or not isinstance(place.get("name"), str) or not 1 <= len(place["name"].strip()) <= 200:
            fields[key] = "Choose a named place from search results."
        elif not number(place.get("lat")) or not number(place.get("lon")) or not -90 <= place["lat"] <= 90 or not -180 <= place["lon"] <= 180:
            fields[key] = "Latitude and longitude must be valid coordinates."
    now = now or datetime.now(timezone.utc)
    departure = None
    try:
        raw = data.get("departure")
        if not isinstance(raw, str):
            raise ValueError
        departure = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if departure.tzinfo is None or departure.utcoffset() is None:
            raise ValueError
        departure = departure.astimezone(timezone.utc)
        if not now <= departure <= now + timedelta(days=5):
            fields["departure"] = "Choose a departure from now through the next 5 days."
    except (ValueError, TypeError, OverflowError):
        fields["departure"] = "Provide an ISO date and time with an explicit timezone."
    load = data.get("load_lbs")
    if not number(load) or not 0 <= load <= 80_000:
        fields["load_lbs"] = "Load must be between 0 and 80,000 lb."
    spacing = data.get("spacing_miles", 25)
    if not number(spacing) or spacing not in (10, 25, 50):
        fields["spacing_miles"] = "Choose a spacing of 10, 25, or 50 miles."
    demo = data.get("demo", False)
    if not isinstance(demo, bool):
        fields["demo"] = "Demo must be true or false."
    if not fields and abs(data["origin"]["lat"] - data["destination"]["lat"]) + abs(data["origin"]["lon"] - data["destination"]["lon"]) < 0.001:
        fields["destination"] = "Choose a destination different from the origin."
    if fields:
        raise ValidationError("Check the highlighted trip details.", fields)
    return {"origin": {key: data["origin"][key] for key in ("name", "lat", "lon")}, "destination": {key: data["destination"][key] for key in ("name", "lat", "lon")}, "departure": departure, "load_lbs": load, "spacing_miles": int(spacing), "demo": demo}
