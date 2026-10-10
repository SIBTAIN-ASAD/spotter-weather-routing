# Assessment checklist

The brief asks for a React + Django implementation and three submission links. The questionnaire has separate required fields for GitHub code, Loom video and hosted version; it does not include extra multiple-choice selections.

| Requirement | Implementation / review evidence |
| --- | --- |
| Origin, destination, departure and load | Trip form with explicit place selection and input validation |
| Three route options from an API | OSRM alternatives plus bounded waypoint candidates; honest warning when fewer are available |
| 10 / 25 / 50-mile sampling | Server-side distance sampling including the destination |
| Forecast at checkpoint ETA | UTC arrival mapping, hourly precipitation interval alignment and interpolated wind |
| Weather and load rules | Pure risk calculation plus threshold and strict-load boundary tests |
| Recommendation order | Eligibility filter, then severe miles, high miles, weighted average risk and duration |
| Routes, checkpoints, ETAs, risk and summaries on map | Selectable route lines, risk markers, popup details and route comparison |
| Corridor weather heatmap | Preloaded risk snapshots for +0 through +48 hours |
| Code quality | Separate provider, geometry, risk and API responsibilities; TypeScript UI; error states |
| Documentation | README, API contract, deployment instructions and walkthrough notes |
| Commits | Meaningful implementation commits with actual changes and timestamps |
| GitHub link | Verify the final repository is accessible to reviewers |
| Hosted application link | Requires successful deployment and public URL check |
| 5–10-minute Loom | Requires an actual recording and verified share link |

The published evaluation categories are 40% routing/weather/risk/recommendation, 35% UI/map/heatmap, 10% code quality and 5% documentation/walkthrough. These add to 90%; the brief does not specify the remaining 10%.

The email's limits are at most four days and sixteen work hours. Do not invent a work log or claim a duration that was not tracked. A bonus is conditional on the employer's evaluation, not guaranteed by delivering the files.
