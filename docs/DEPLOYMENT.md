# Hosting RouteCast

The frontend and Django API run as one service. The repository includes a multi-stage Dockerfile and a Render blueprint. No paid database, API key, storage volume or separate frontend host is required.

### Optional visitor analytics

The deployed assessment has no analytics account connected, so the site does not collect or claim visitor counts. The privacy notice says this directly. If the owner later creates a Google Analytics 4 property, set `VITE_GA_MEASUREMENT_ID=G-...` during the **frontend build** and redeploy. For a local frontend build, place it in `frontend/.env.production`; for a Docker build, pass `--build-arg VITE_GA_MEASUREMENT_ID=G-...`. The tag loads only after a visitor selects **Allow analytics**. Visitors can change that choice under **Privacy & cookies** in the footer. Do not put a measurement ID in `SECRET_KEY` or treat a runtime-only frontend environment variable as enough: Vite embeds it at build time.

## Render free web service

The assessment instance is live at [routecast-weather-routing.onrender.com](https://routecast-weather-routing.onrender.com/) on Render's free Docker web service. It was connected through **Public Git Repository**, so updates require a manual deploy of the latest commit in Render. This route does not use the Blueprint configuration automatically.

The app, sample trip, assets, and `/api/health/` were verified publicly on 2026-10-10. The free host's shared outbound IP received HTTP 429 from Open-Meteo during live trip checks, so live weather planning is not currently reliable on this instance. The UI reports that failure and does not substitute sample weather. Live planning passed in the local browser environment.

For a fresh deployment using the checked-in Blueprint:

1. Push the repository to GitHub.
2. In an existing Render account, select **New → Blueprint** and choose the repository.
3. Review `render.yaml`. It declares one Docker web service on the **free** plan.
4. Deploy and wait for the service to become live. Render generates `SECRET_KEY`; `ALLOWED_HOSTS` accepts the assigned `onrender.com` domain.
5. Open the resulting HTTPS URL and verify `/api/health/`, the sample trip, and a live trip. Use that actual URL in the assessment form.

Render's free service can sleep after inactivity and take time to wake. Open the application before recording the walkthrough. The free public routing/weather endpoints also have limits; the labeled sample trip provides a reproducible demonstration without pretending cached synthetic weather is live.

For a custom domain, update `ALLOWED_HOSTS` to include it. No application secret belongs in the frontend or Git repository.

Official instructions: [Django on Render](https://render.com/docs/deploy-django), [Docker services](https://render.com/docs/docker), [free service limits](https://render.com/docs/free).

## Existing Docker host

Build the image, set a random `SECRET_KEY` and the exact host name, and run it behind the host's HTTPS reverse proxy:

```sh
docker build -t routecast .
docker run --env-file .env -e PORT=8000 -p 127.0.0.1:8001:8000 routecast
```

Use `DEBUG=false` in the host's environment. The container runs as a non-root user. It has no persistent storage requirements.

## Release checks

- `/api/health/` returns `{"status":"ok"}`.
- The main page and bundled CSS/JavaScript load without console errors.
- The sample trip displays three distinct routes and an explained recommendation.
- A live trip identifies its data as live, or gives an actionable provider error.
- Every slider position from +0 through +48 changes only the corridor snapshot.
- The reviewer can open the GitHub repository and deployed app without your login.
- Record and open the actual Loom share link before submission.

Confirm the hosted app and provider behavior again before submitting it.
