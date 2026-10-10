# RouteCast API contract

React + TypeScript + Leaflet frontend, Django JSON backend. Same-origin `/api/` in production; Vite proxies in development. No accounts or saved personal trips needed.

## GET /api/health/
Returns `{ "status": "ok" }`.

## GET /api/places/?q=Chicago
Returns `{ "places": [{ "name": "Chicago, Illinois, United States", "lat": 41.88, "lon": -87.63 }] }`. Explicit search action, cached geocoding.

## POST /api/plan/
Request:
```
{
  "origin": {"name":"Chicago, IL", "lat":41.8781,"lon":-87.6298},
  "destination": {"name":"Detroit, MI", "lat":42.3314,"lon":-83.0458},
  "departure": "2026-10-11T13:00:00Z",
  "load_lbs": 35000,
  "spacing_miles": 25,
  "demo": false
}
```
Departure timezone is explicit (frontend converts local datetime to ISO). Demo may use its own stored Chicago-Detroit routes; UI labels this clearly. Limits: departure within next 5 days, load 0–80000 lb, spacing in [10,25,50].

Response:
```
{
  "mode":"live",
  "generated_at":"ISO UTC",
  "departure":"ISO UTC",
  "origin":{"name":"...","lat":0,"lon":0},
  "destination":{"name":"...","lat":0,"lon":0},
  "load_lbs":35000,
  "spacing_miles":25,
  "recommended_route_id":"route-1",
  "recommendation_reason":"Fewest severe miles, then high miles, average risk and travel time.",
  "warnings":[],
  "sources":{"routing":"OSRM / OpenStreetMap","weather":"Open-Meteo","geocoding":"Open-Meteo"},
  "routes":[{
    "id":"route-1","name":"Route 1","via":"Road names or corridor",
    "geometry":{"type":"LineString","coordinates":[[-87.6,41.8],[-83,42.3]]},
    "distance_miles":280,"duration_minutes":265,"arrival":"ISO UTC",
    "eligible":true,"risk_level":"high","average_risk":1.2,
    "risk_miles":{"low":50,"moderate":180,"high":50,"severe":0,"no_travel":0,"unknown":0},
    "checkpoints":[{
      "id":"route-1-cp-0","lat":41.8,"lon":-87.6,"mile":0,
      "eta":"ISO UTC","weather_time":"ISO UTC",
      "weather":{"wind_mph":28,"rain_in":0.02,"snow_in":0},
      "risk_level":"moderate","risk_score":1,"reasons":["Wind 28 mph"]
    }]
  }],
  "corridor":{
    "hours":["49 ISO UTC timestamps, departure hour + 0..48"],
    "points":[{
      "lat":41.8,"lon":-87.6,
      "risk_scores":["49 numbers 0..4 or null for unknown"],
      "wind_mph":["49 numbers or null"],
      "rain_in":["49 numbers or null"],
      "snow_in":["49 numbers or null"]
    }]
  }
}
```
Risk names: low / moderate / high / severe / no_travel / unknown. Scores 0 / 1 / 2 / 3 / 4 / null. Missing weather is unknown, never silently zero. Unknown or no-travel routes are ineligible; if all ineligible, recommended_route_id is null. Rank eligible routes lexicographically by severe miles, high miles, distance-weighted average risk, duration. Segment severity is max of adjacent checkpoint risks; unknown propagates. Full distance (including final partial interval) participates. No rounding until presentation/ranking complete.

Rain shared edges 0.25 and 0.50 and snow shared edges 1.0 and 2.0 take the higher-risk band; rain exactly 1.00 is severe, above is no_travel; snow exactly 3.0 severe, above no_travel. Wind uses continuous cutoffs 25/35/45/55. Load >30000 at wind >=45 <55 => no_travel; load >40000 at wind >=35 <45 => severe.

Live routing requests 3 alternatives from OSRM; bounded waypoint attempts may yield additional distinct real routes. Never clone a route or fake alternatives to hit three; if provider cannot supply three, return the valid routes and an explicit warning. Route geometry and per-edge durations determine sampling/ETAs. OSRM standard driving is a prototype, not truck-clearance/legal routing. No traffic, stops or HOS in ETA.

Open-Meteo rain, showers and snowfall are preceding-hour accumulations. For a fractional-hour ETA use the interval ending at the next UTC hour (ceil); at an exact hour use that hour. Liquid rainfall is rain + showers, never total precipitation including snow. Wind is interpolated between surrounding hours. weather_time identifies the precipitation interval end. Snowfall is converted from cm to inches if provider returns cm. Reject unavailable forecast periods rather than reusing the last hour. Corridor heatmap snapshots use the same rules/load but do not change arrival-time route rankings. Batch/cache forecast points. Slider must work locally without a request per frame.

Errors `{ "error": "Useful message", "code":"validation_error|provider_error", "fields":{} }` with 400/502 status. No silently switching live requests to demo.
