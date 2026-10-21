# Fuel assessment walkthrough (aim for 4 minutes)

Record this yourself in Loom, using Postman or an equivalent API client. Keep the finished recording under five minutes. The script is a guide, not a claim that a recording exists.

1. **0:00–0:35 — Introduce the contract.** Show `POST /api/fuel/plan/` with `origin`, `destination`, and optional `starting_fuel_gallons`. Mention US place lookup at `GET /api/fuel/places/?q=Chicago`.
2. **0:35–1:40 — Show a real request.** Send Chicago, IL to Atlanta, GA from the included Postman collection. Point out route GeoJSON, road distance, fuel stops with prices, gallons bought and `total_fuel_spend_usd`. Responses depend on the current OSRM route; avoid quoting hard-coded values.
3. **1:40–2:20 — Explain fuel accounting.** A full tank is the default; only purchases during the drive are charged. A short route may show $0 new spending even though it consumes fuel already in the tank. The response reports consumed and purchased gallons separately.
4. **2:20–3:20 — Show the code.** Open `backend/fuel/catalog.py` for local price and place loading; `optimization.py` for spatial filtering and the next-cheaper-stop strategy; `views.py` for input validation, one OSRM call and response shape. Mention the CSV has no coordinates, so pins are city-level estimates.
5. **3:20–4:00 — Show a boundary case and tests.** Send an invalid US city to show HTTP 400, then show the automated tests, including the assertion that planning uses one route call. End with the repository URL and the known station-position limitation.

Do a quick rehearsal, check the audio and API response in the recording, then submit the actual Loom URL with the GitHub code URL in the [Backend Django Engineer questionnaire](https://careers.spotter.ai/questionnaires/5e772381-fc43-4db2-a36a-6e2c19f64418/fa7a4d67-f0c8-4382-9450-aea4740c6f0c). This is a different questionnaire from the earlier full-stack assessment.
