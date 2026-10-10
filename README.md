# RouteCast

A weather-aware route planner built with React, TypeScript and Django. Enter a trip, departure time and load weight to compare road routes against the weather the truck is expected to encounter along the way.

The useful distinction is **weather when the truck gets there**, rather than weather everywhere at departure. The route comparison uses checkpoint arrival times; the map's forecast slider lets you separately inspect how the surrounding corridor changes over the following 48 hours.

**Hosted demo:** [routecast-weather-routing.onrender.com](https://routecast-weather-routing.onrender.com/). The sample trip is reliable and explicitly labeled as synthetic. Live trip planning uses public routing and forecast providers; Open-Meteo has returned HTTP 429 to this free host, so live trips may currently show a provider error. The same live flow passed in local browser verification.

## Run it

Requires Python 3.12+ and Node.js 22.12+.

```sh
make setup
```

Start the API and frontend in separate terminals:

```sh
make api
```

```sh
make web
```

Open [localhost:5174](http://localhost:5174). No API keys or database are required. Live planning uses public services, so availability and usage limits apply. The **sample trip** is explicitly labeled and works without those providers; it uses recorded road geometry with synthetic weather to make the risk rules easy to inspect.

For the production build, including the same-origin API:

```sh
make build
make serve
```

Open [localhost:8001](http://localhost:8001). Or run `docker compose up --build`.

## What the application covers

- Origin and destination search, departure time, load weight, and 10/25/50-mile checkpoint spacing.
- Up to three distinct routes from a routing API, with a clear warning if three alternatives cannot be found.
- Checkpoints placed along the road geometry, including the final partial interval and destination.
- Arrival-time wind, liquid rainfall and snowfall, evaluated against the assessment's weather and load rules.
- Route selection, color-coded checkpoints, ETAs, per-risk mileage and an explained recommendation.
- A weather-risk heatmap across the trip corridor, with 49 preloaded snapshots from +0 through +48 hours.
- Input validation, visible provider errors, and an explicit unavailable-weather state.

## How the recommendation works

A route with a **No Travel** checkpoint or incomplete weather coverage is ineligible. Among the remaining routes, compare these values in order:

1. Severe miles.
2. High miles.
3. Distance-weighted average risk.
4. Travel time.

This is an ordered comparison, not a weighted score where saving a few minutes could cancel out severe weather. If every route is ineligible, the app does not recommend one.

Each interval takes the higher risk of its two checkpoint ends. That is conservative, and it keeps the mileage totals meaningful when checkpoint spacing changes. It is still an estimate between samples, not continuous weather coverage.

## A few deliberate decisions

**Threshold boundaries.** The supplied rain and snow ranges overlap at some endpoints. At 0.25 and 0.50 inches of rain, and 1 and 2 inches of snow, the higher band wins. Exactly 1 inch of rain or 3 inches of snow remains Severe; the brief says *greater than* those values is No Travel. Load rules retain their strict greater-than conditions: exactly 30,000 or 40,000 lb does not trigger its corresponding override.

**Time and units.** The browser converts the entered local departure time to a timezone-aware ISO timestamp. The backend works in UTC. Hourly precipitation is an accumulation ending at its timestamp, so a 12:30 ETA uses the interval ending at 13:00. Wind is interpolated between neighboring hours. Liquid rain includes rain plus showers, and snowfall is converted from the provider's declared units.

**Three real routes.** Routing services cannot guarantee three alternatives for every pair of locations. The adapter requests alternatives and tries a bounded set of corridor waypoints. It does not duplicate a route to fill the UI. Fewer valid routes are shown honestly, with a warning.

**Slider behavior.** Moving the slider changes the corridor weather layer. It does not recalculate the trip's arrival-time recommendation. The forecast is fetched once for the plan, so dragging the slider does not create more weather requests. The heatmap uses its own bounded sampling strip, extending eight miles to either side of the routes, independently of the selected checkpoint spacing.

**Small deployment.** Django serves both the JSON API and built frontend. There is no login, persistent trip store, database, or background worker. That keeps the assessment easy to run and review. Provider responses are cached in process; multiple workers would have separate caches. Forecast points are deduplicated at roughly 110-meter resolution and cached for 15 minutes, routes for one hour, and city searches for one day.

## Limits

The planner accepts departures within the next five days, loads from 0 to 80,000 lb, and trips up to 3,500 miles or 48 driving hours. A request is bounded to 600 forecast locations.

This is an assessment prototype. OSRM's standard driving profile does not enforce truck height, weight restrictions, hazmat rules or road closures. Travel times exclude live traffic, rest stops and hours-of-service rules. Wind direction, crosswind exposure, gusts and road surface conditions are outside the supplied scoring rules. The heatmap interpolates sparse forecast samples; it is not radar imagery.

A production version would need a truck-aware route provider, supported forecast capacity, and operational monitoring before it could guide an actual dispatch decision. Missing forecasts are never treated as calm weather.

## Checks and deployment

```sh
make test
make build
```

The backend suite exercises risk boundaries, load overrides, route sampling, forecast alignment, ranking and API failures. Frontend checks cover presentation helpers and TypeScript compilation. GitHub Actions repeats the checks and builds the production Docker image.

- [Deployment guide](docs/DEPLOYMENT.md)
- [Walkthrough notes](docs/WALKTHROUGH.md)
- [API contract](docs/API_CONTRACT.md)
- [Assessment checklist](docs/ASSESSMENT_CHECKLIST.md)

## Data sources

Routing: [OSRM](https://project-osrm.org/docs/v5.24.0/api/) and [OpenStreetMap](https://www.openstreetmap.org/copyright). Weather and place search: [Open-Meteo](https://open-meteo.com/en/docs) and its [geocoding API](https://open-meteo.com/en/docs/geocoding-api). See the map's attribution for the basemap provider. Open-Meteo's public endpoint is for eligible non-commercial use; review its [terms](https://open-meteo.com/en/terms) before operating beyond this assessment.
