# Loom walkthrough

Aim for about 7 minutes. Record the application and a few focused code views in your own voice. Read through the implementation first, then use these notes as prompts rather than reciting every sentence. Keep the final recording between the requested 5 and 10 minutes.

## Before recording

- Run the application or open its verified hosted URL. A local recording is useful for rehearsal; show the hosted version in the final submission.
- Close unrelated tabs and hide notifications or personal information.
- Open the GitHub repository, `backend/routing/risk.py`, `backend/routing/planning.py`, and the passing test output in nearby tabs.
- Use a departure time about one hour in the future, 35,000 lb and 25-mile spacing.
- The prefilled trip starts in **Sample trip** mode. Select **Explore sample routes** once. It demonstrates three recorded road routes with synthetic weather and is visibly labeled. Rehearse one **Live weather** plan as well; public APIs can occasionally be unavailable.
- Test the Loom share link in a signed-out window after recording. Check that the video plays and is 5–10 minutes long.

## 0:00–0:40 — Introduce the problem

Show the application.

“Hi, I'm Muhammad Sibtain. This is RouteCast, my implementation of the weather-aware truck routing assessment. It uses React and TypeScript on the frontend, and Django for the routing and weather calculations.

The main question I wanted the app to answer is: given this departure time and load, which route has the least weather exposure? The important detail is that the forecast follows the truck's expected arrival time along the route.”

## 0:40–1:30 — Explain the inputs

Point to the origin, destination, departure, load and spacing controls. Search for a city and select a result so the geocoding interaction is visible.

“The driver selects an origin and destination, enters the departure time and load, and chooses the checkpoint spacing. The three options here are 10, 25 and 50 miles. The form shows the browser's local time; the API receives an explicit UTC timestamp, so the calculation isn't dependent on the server's timezone.

Live planning asks the routing provider for alternatives. For a repeatable demonstration, I'll use the sample trip. Its road geometry comes from OSRM, but the weather is synthetic and labeled that way. This lets me show the risk behavior without depending on today's weather.”

Click **Explore sample routes**. Let the map settle.

## 1:30–2:40 — Compare routes and inspect a checkpoint

Point to the three route summaries. Select another route, then return to the recommended route. Click a checkpoint with elevated risk.

“All three routes are visible on the map. Selecting one brings it forward and shows its checkpoints. Each route has a distance, travel time, arrival time and a breakdown of how many miles fall into each risk band.

A checkpoint shows its position along the route, the truck's ETA, the forecast values and the reason for its risk level. The weather comes from the time the truck is expected to reach this point, not just the departure time.

I included the destination even when the last segment is shorter than the selected spacing. Otherwise the last part of a trip could disappear from the risk totals.”

Read one actual checkpoint's values and explanation from the screen. Do not memorize a number that might change when the departure or spacing changes.

## 2:40–3:35 — Explain the recommendation

Point to the recommendation and risk-mile summaries. Briefly show `risk.py`.

“The recommendation follows the order in the brief. First, any route with No Travel conditions is excluded. A route with unavailable weather is also excluded, because missing data shouldn't look like good weather.

For the remaining routes, the comparison looks at severe miles first, then high miles, then the distance-weighted average risk, then travel time. This is an ordered comparison. A shorter drive can't outweigh a worse result on an earlier safety criterion.

For each interval, I use the higher risk of its two checkpoint ends. That's a conservative estimate between samples. If no route qualifies, the interface explains that instead of selecting the least bad route and calling it safe.”

## 3:35–4:30 — Show the heatmap and forecast slider

Return to the map. Move the slider to +12, +24 and +48. Toggle the weather overlay off and on. Point to the absolute timestamp and legend.

“The shaded layer shows weather risk across the route corridor. The slider has hourly snapshots from zero to 48 hours. These values are loaded with the plan, so dragging the slider redraws the layer locally without making a weather request for each movement.

The map makes two different things visible: the checkpoint dots are the conditions at the truck's arrival time, while the shaded layer is the hour I've selected. Moving this slider doesn't change the trip recommendation. To assess a different departure, I change the departure field and plan the trip again.”

## 4:30–5:25 — Show load and spacing behavior

Change the load to 45,000 lb and rerun the sample trip. Inspect the new summaries and one affected checkpoint if present. Then change the spacing to 10 or 50 miles and recalculate.

“The load overrides are applied after the weather thresholds. At 55 miles per hour of wind, no load may travel. At 45 to below 55, a load above 30,000 pounds is No Travel. At 35 to below 45, a load above 40,000 pounds becomes Severe.

The strict boundaries matter. Exactly 30,000 or 40,000 pounds doesn't trigger a rule written as greater than that amount. I covered those cases in tests.

Changing the spacing changes where forecasts are sampled. The total route distance is still accounted for, including the final partial interval.”

Describe the actual visible change. If the recommended route remains the same, say so; the rule can change exposure without changing which route wins.

## 5:25–6:30 — Show the implementation and checks

Show the backend's geometry/provider/planning separation and the test output, then the frontend map component.

“The Django side separates external provider calls from the geometry and risk logic. That makes it possible to test threshold boundaries and route ranking without relying on the network.

There are a few details I paid attention to. The route's per-edge travel times are normalized to the provider's total time so the destination checkpoint matches the displayed arrival. Rain includes showers. Snow is converted from the units returned by the weather provider.

Open-Meteo's hourly precipitation values describe the preceding hour. For a 12:30 arrival, the calculation uses the interval ending at 13:00. Wind is interpolated between the surrounding hours. Missing or out-of-range data stays unknown.

The checks cover those boundaries, ranking priorities and error paths. The frontend also goes through TypeScript checking and a production build. The CI workflow repeats the checks and builds the same Docker image used for deployment.”

Show current passing output. State only the actual test count and checks that ran.

## 6:30–7:15 — Explain tradeoffs and close

Show the README and deployment files, then return to the app.

“I kept this as one deployable service: Django serves the API and the built React app. There is no database or account setup because the assessment doesn't need saved trips.

The main limitation is the route provider. OSRM's standard driving profile doesn't enforce truck clearance, hazmat or legal weight restrictions, and these ETAs don't include live traffic or rest stops. The interface calls that out. A production dispatch tool would need a truck-aware provider and supported weather capacity.

The repository includes the setup instructions, the documented assumptions, tests and deployment files. That's the implementation. Thank you for taking the time to review it.”

## Questions worth being ready to answer

- Why an ordered comparison instead of a single weighted score? Because that preserves the explicit priority order in the brief.
- Why exclude missing forecasts? Unknown conditions must not win by being scored as zero.
- Why can a live trip return fewer than three routes? The upstream routing API may not find three distinct alternatives. The app tries bounded waypoint alternatives, then reports the shortfall rather than fabricating routes.
- Why can the heatmap and checkpoint colors differ? One is a selected clock hour; the other is the checkpoint's arrival time.
- How would this scale? Shared provider caching, request limits, a supported routing/weather plan and background preparation for expensive plans. Those are future changes, not claims about this prototype.
- What would you improve next? Truck restrictions and better operational forecast guarantees, before adding cosmetic features.
