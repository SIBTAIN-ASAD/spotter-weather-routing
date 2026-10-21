"""Offline US place lookup and the supplied fuel prices.

The price CSV has no coordinates. GeoNames postal-code place coordinates are
city-level estimates, never exact truckstop locations.
"""

import csv
import statistics
import unicodedata
import zipfile
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data"


def key(value):
    plain = unicodedata.normalize("NFKD", value.casefold().strip())
    return " ".join(
        "".join(
            c if c.isalnum() else " " for c in plain if not unicodedata.combining(c)
        ).split()
    )


@lru_cache(maxsize=1)
def load_catalog():
    grouped = defaultdict(list)
    with zipfile.ZipFile(DATA / "US.zip") as archive, archive.open("US.txt") as source:
        for raw in source:
            fields = raw.decode("utf-8").rstrip("\r\n").split("\t")
            if len(fields) < 12 or fields[0] != "US":
                continue
            try:
                lat, lon = float(fields[9]), float(fields[10])
            except ValueError:
                continue
            grouped[(key(fields[2]), fields[4].upper())].append((lat, lon, fields[2]))
    places = {
        identity: {
            "city": values[0][2],
            "state": identity[1],
            "lat": round(statistics.median(v[0] for v in values), 5),
            "lon": round(statistics.median(v[1] for v in values), 5),
        }
        for identity, values in grouped.items()
    }
    cheapest = {}
    with (DATA / "fuel-prices.csv").open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            identity = (key(row["City"]), row["State"].strip().upper())
            place = places.get(identity)
            if place is None:
                continue  # Canadian and unmatched locations cannot be located safely.
            try:
                price = float(row["Retail Price"])
            except (TypeError, ValueError):
                continue
            if not 0 < price < 20:
                continue
            station = {
                **place,
                "id": row["OPIS Truckstop ID"].strip(),
                "name": row["Truckstop Name"].strip(),
                "address": row["Address"].strip(),
                "price_per_gallon": price,
            }
            if (
                identity not in cheapest
                or price < cheapest[identity]["price_per_gallon"]
            ):
                cheapest[identity] = station
    return places, tuple(cheapest.values())


def resolve_place(raw):
    if isinstance(raw, str):
        parts = [part.strip() for part in raw.rsplit(",", 1)]
        if len(parts) != 2:
            return None
        city, state = parts
    elif isinstance(raw, dict):
        city, state = raw.get("city"), raw.get("state")
    else:
        return None
    if (
        not isinstance(city, str)
        or not isinstance(state, str)
        or not 1 <= len(city) <= 100
        or len(state) != 2
    ):
        return None
    return load_catalog()[0].get((key(city), state.upper()))


def search_places(query, limit=8):
    target = key(query)
    if len(target) < 2:
        return []
    places = load_catalog()[0].values()
    matches = [p for p in places if key(p["city"]).startswith(target)]
    matches.sort(
        key=lambda p: (key(p["city"]) != target, len(p["city"]), p["city"], p["state"])
    )
    return matches[:limit]
