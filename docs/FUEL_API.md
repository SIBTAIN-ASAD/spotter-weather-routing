# Fuel API

The fuel exercise is intentionally separate from the original weather planner. It runs on Django 6.1.2 and uses no database or geocoding requests at plan time.

## `GET /api/fuel/places/?q=Chicago`

Returns matching US place names from the bundled GeoNames postal-code dataset. The API accepts full city and two-letter state names from these results. Search is local and returns up to eight matches.

## `POST /api/fuel/plan/`

Request body:

```json
{
  "origin": "Chicago, IL",
  "destination": "Atlanta, GA",
  "starting_fuel_gallons": 50
}
```

`origin` and `destination` may also be objects such as `{"city":"Chicago","state":"IL"}`. Both must resolve to US places. `starting_fuel_gallons` is optional and defaults to a full 50-gallon tank. Fuel economy is fixed at 10 mpg.

The response includes:

- `route`: a GeoJSON LineString Feature with road distance and duration.
- `fuel_stops`: selected stations, city-level map coordinates, projected route mile, price per gallon, gallons purchased and cost.
- `total_fuel_spend_usd`: money spent on fuel **after departure**, rounded to cents.
- `estimated_trip_fuel_cost_usd`: the above plus an estimate for starting fuel consumed, valued at the cheapest listed price in the first 25 route miles (or the listed US median if none is nearby). This is a comparison estimate, not a purchase receipt.
- `gallons_consumed`, `gallons_purchased`, and `fuel_on_arrival_gallons`.
- `assumptions` and `data_sources` so callers can interpret the calculation.

An invalid city or fuel amount returns HTTP 400 and field messages. An upstream routing failure returns HTTP 502. A route with no feasible sequence of priced stops within the available range returns HTTP 422 with `no_feasible_fuel_plan`; it never invents a fill-up. A valid short trip can have no stops and $0 new spend when the starting tank covers it.

## Optimization and performance

The API performs exactly one OSRM route call per uncached plan, requesting full GeoJSON geometry and edge distances. Existing in-process route caching avoids repeated upstream calls for the same endpoints for one hour. It does not request alternatives, a matrix, or a route through every station.

Station candidates come from the supplied CSV, with the lowest listed price retained per city/state because all rows in that city share the same approximate coordinate. A spatial grid narrows the city-to-road comparison. Only cities projected within 12 straight-line miles of the route are eligible. On the ordered route, the fuel algorithm buys enough to reach the next cheaper station within 500 miles; if there is none, it fills toward the next opportunity or destination. It simulates tank consumption between every candidate and rejects an infeasible gap.

Because the CSV lacks coordinates, this is an **approximate fixed-route price optimization**, not a claim that a precise station entrance or road detour has been verified. Actual route-to-pump mileage and truck access would require a richer dataset and a truck-aware router. Price values are a snapshot from the assessment attachment.

## Data attribution

- `backend/fuel/data/fuel-prices.csv`: supplied Spotter assessment attachment, 8,151 price rows.
- `backend/fuel/data/US.zip`: [GeoNames US postal-code data](https://download.geonames.org/export/zip/US.zip), CC BY 4.0. Attribution: GeoNames, www.geonames.org. Place coordinates may be estimates or postal centroids.
- Road geometry: [OSRM](https://project-osrm.org/) using [OpenStreetMap](https://www.openstreetmap.org/copyright) data.
