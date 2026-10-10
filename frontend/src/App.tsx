import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Check,
  CloudSun,
  Compass,
  Cookie,
  FlaskConical,
  Info,
  LoaderCircle,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Wind,
  X,
} from "lucide-react";
import { createPlan } from "./api";
import {
  disableAnalytics,
  measurementId,
  readPrivacyChoice,
  savePrivacyChoice,
  startAnalytics,
  type PrivacyChoice,
} from "./analytics";
import { MapView } from "./components/MapView";
import { PlaceSearch } from "./components/PlaceSearch";
import { Legend, RiskBadge, RiskBar } from "./components/Risk";
import { RouteCard } from "./components/RouteCard";
import type { Checkpoint, Place, Plan } from "./types";
import {
  city,
  dateTime,
  duration,
  INITIAL_DESTINATION,
  INITIAL_ORIGIN,
  localDateInput,
  nextDeparture,
  number,
  timeOnly,
  weatherValue,
} from "./utils";

type Toast = {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  message: string;
};

export default function App() {
  const [origin, setOrigin] = useState<Place | null>(INITIAL_ORIGIN);
  const [destination, setDestination] = useState<Place | null>(
    INITIAL_DESTINATION,
  );
  const [departure, setDeparture] = useState(nextDeparture);
  const [load, setLoad] = useState("35000");
  const [spacing, setSpacing] = useState(25);
  const [forecastMode, setForecastMode] = useState<"demo" | "live">("demo");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [hour, setHour] = useState(0);
  const [loading, setLoading] = useState<"live" | "demo" | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacyChoice, setPrivacyChoice] = useState<PrivacyChoice | null>(
    readPrivacyChoice,
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const privacyModal = useRef<HTMLDialogElement>(null);
  const active = plan?.routes.find((route) => route.id === activeId) || null;
  const maxDeparture = localDateInput(new Date(Date.now() + 5 * 86400000));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (showRules) modal.current?.showModal();
    else modal.current?.close();
  }, [showRules]);
  useEffect(() => {
    if (showPrivacy) privacyModal.current?.showModal();
    else privacyModal.current?.close();
  }, [showPrivacy]);
  useEffect(() => {
    if (privacyChoice === "analytics") startAnalytics();
  }, [privacyChoice]);
  function notify(kind: Toast["kind"], title: string, message: string) {
    const id = ++nextToastId.current;
    setToasts((current) => [
      ...current.slice(-2),
      { id, kind, title, message },
    ]);
    window.setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      kind === "error" ? 9000 : 6000,
    );
  }

  function reportError(message: string) {
    notify("error", "We couldn't plan this trip", message);
  }

  function choosePrivacy(choice: PrivacyChoice) {
    const previous = privacyChoice;
    savePrivacyChoice(choice);
    setPrivacyChoice(choice);
    setShowPrivacy(false);
    if (choice === "essential" && previous === "analytics") {
      disableAnalytics();
    } else {
      notify(
        "info",
        "Privacy preference saved",
        choice === "analytics"
          ? "Anonymous visit analytics are now enabled."
          : "Only your privacy preference is stored on this device.",
      );
    }
  }

  async function planTrip(demo: boolean) {
    if (!demo && (!origin || !destination)) {
      reportError(
        "Select a matching city for both your origin and destination.",
      );
      return;
    }
    const when = new Date(departure);
    if (
      Number.isNaN(when.getTime()) ||
      when.getTime() < Date.now() ||
      when.getTime() > Date.now() + 5 * 86400000
    ) {
      reportError("Choose a departure time in the next five days.");
      return;
    }
    const pounds = Number(load);
    if (
      load.trim() === "" ||
      !Number.isFinite(pounds) ||
      pounds < 0 ||
      pounds > 80000
    ) {
      reportError("Enter a truck load between 0 and 80,000 lb.");
      return;
    }
    if (
      !demo &&
      origin &&
      destination &&
      origin.lat === destination.lat &&
      origin.lon === destination.lon
    ) {
      reportError("Choose a destination different from your origin.");
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(demo ? "demo" : "live");
    try {
      const result = await createPlan(
        {
          origin: demo ? INITIAL_ORIGIN : origin!,
          destination: demo ? INITIAL_DESTINATION : destination!,
          departure: when.toISOString(),
          load_lbs: pounds,
          spacing_miles: spacing,
          demo,
        },
        abort.signal,
      );
      setPlan(result);
      setActiveId(result.recommended_route_id || result.routes[0]?.id || null);
      setHour(0);
      setCheckpoint(null);
      if (demo) {
        setOrigin(result.origin);
        setDestination(result.destination);
      }
      notify(
        "success",
        demo ? "Sample trip ready" : "Route comparison ready",
        demo
          ? "Explore the prepared routes and weather checkpoints below."
          : `${result.routes.length} route${result.routes.length === 1 ? "" : "s"} checked against the forecast.`,
      );
      window.setTimeout(
        () => resultHeading.current?.focus({ preventScroll: true }),
        0,
      );
    } catch (cause) {
      if (!abort.signal.aborted)
        reportError(
          cause instanceof Error
            ? cause.message
            : "The trip could not be planned. Please try again.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(null);
    }
  }
  const selectRoute = (id: string) => {
    setActiveId(id);
    setCheckpoint(null);
  };

  return (
    <>
      <a className="skip-link" href="#planner">
        Skip to trip planner
      </a>
      <header className="site-header">
        <a className="brand" href="#planner" aria-label="RouteCast home">
          <img src="/favicon.svg" alt="" />
          <span>
            Route<span>Cast</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#planner" className="nav-active">
            Trip planner
          </a>
          <button type="button" onClick={() => setShowRules(true)}>
            How risk works <ArrowUpRight size={13} />
          </button>
        </nav>
        <span className="header-caption">
          <Truck size={15} /> Built for the road ahead
        </span>
      </header>

      <main id="planner">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span /> WEATHER-AWARE ROUTING
            </div>
            <h1>A clearer route through the weather.</h1>
            <p>Compare the road ahead. Make a more informed call.</p>
          </div>
          <div className="heading-mark" aria-hidden="true">
            <CloudSun size={48} strokeWidth={1.1} />
            <span>
              Every mile.
              <br />A little more clarity.
            </span>
          </div>
        </div>

        <div className="planner-grid">
          <aside className="sidebar">
            <section className="trip-panel" aria-labelledby="trip-title">
              <div className="panel-heading">
                <h2 id="trip-title">
                  <SlidersHorizontal size={17} /> Plan your trip
                </h2>
                <span>01</span>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void planTrip(forecastMode === "demo");
                }}
              >
                <div className="places">
                  <PlaceSearch
                    label="Origin"
                    id="origin"
                    value={origin}
                    onChange={(place) => {
                      setOrigin(place);
                      setForecastMode("live");
                    }}
                    disabled={!!loading}
                  />
                  <button
                    className="swap-button"
                    type="button"
                    aria-label="Swap origin and destination"
                    disabled={!!loading || !origin || !destination}
                    onClick={() => {
                      setOrigin(destination);
                      setDestination(origin);
                      setForecastMode("live");
                    }}
                  >
                    <ArrowDownUp size={14} />
                  </button>
                  <PlaceSearch
                    label="Destination"
                    id="destination"
                    value={destination}
                    onChange={(place) => {
                      setDestination(place);
                      setForecastMode("live");
                    }}
                    disabled={!!loading}
                  />
                </div>
                <label className="form-field" htmlFor="departure">
                  Departure
                  <input
                    type="datetime-local"
                    id="departure"
                    value={departure}
                    onChange={(event) => setDeparture(event.target.value)}
                    disabled={!!loading}
                    min={localDateInput(new Date())}
                    max={maxDeparture}
                    required
                  />
                </label>
                <p className="field-hint timezone">
                  Your time zone · {zone.replaceAll("_", " ")}
                </p>
                <label className="form-field load-label" htmlFor="load">
                  Truck load
                  <span className="input-with-unit">
                    <input
                      id="load"
                      type="number"
                      min="0"
                      max="80000"
                      step="1"
                      value={load}
                      onChange={(event) => setLoad(event.target.value)}
                      disabled={!!loading}
                      required
                    />
                    <span>lb</span>
                  </span>
                </label>
                <p className="field-hint">
                  Load weight changes wind risk thresholds.
                </p>
                <fieldset className="spacing-field" disabled={!!loading}>
                  <legend>Weather checkpoint spacing</legend>
                  <div className="segmented">
                    {[10, 25, 50].map((miles) => (
                      <label
                        key={miles}
                        className={spacing === miles ? "checked" : ""}
                      >
                        <input
                          type="radio"
                          name="spacing"
                          value={miles}
                          checked={spacing === miles}
                          onChange={() => setSpacing(miles)}
                        />
                        <span>
                          {miles} <small>mi</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="forecast-mode" disabled={!!loading}>
                  <legend>Forecast source</legend>
                  <div className="segmented">
                    <label className={forecastMode === "demo" ? "checked" : ""}>
                      <input
                        type="radio"
                        name="forecast-mode"
                        checked={forecastMode === "demo"}
                        onChange={() => {
                          setForecastMode("demo");
                          setOrigin(INITIAL_ORIGIN);
                          setDestination(INITIAL_DESTINATION);
                        }}
                      />
                      <span>Sample trip</span>
                    </label>
                    <label className={forecastMode === "live" ? "checked" : ""}>
                      <input
                        type="radio"
                        name="forecast-mode"
                        checked={forecastMode === "live"}
                        onChange={() => setForecastMode("live")}
                      />
                      <span>Live weather</span>
                    </label>
                  </div>
                </fieldset>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!!loading}
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={17} className="spin" /> Checking the
                      road ahead…
                    </>
                  ) : (
                    <>
                      {forecastMode === "demo"
                        ? "Explore sample routes"
                        : "Compare live routes"}{" "}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <p className="provider-note">
                  {forecastMode === "demo"
                    ? "Recorded routes · synthetic weather · no sign-in"
                    : "Live routes & forecasts. Provider availability may vary."}
                </p>
              </form>
              <div className="sample-section">
                <FlaskConical size={18} />
                <div>
                  <strong>Take a quick look around</strong>
                  <p>Prepared Chicago–Detroit routes and weather.</p>
                  <button
                    type="button"
                    disabled={!!loading}
                    onClick={() => {
                      setForecastMode("demo");
                      void planTrip(true);
                    }}
                  >
                    {loading === "demo" ? (
                      <>
                        <LoaderCircle size={13} className="spin" /> Loading
                        sample…
                      </>
                    ) : (
                      <>
                        Explore sample trip <ArrowUpRight size={13} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
            <div className="planning-note">
              <ShieldCheck size={19} />
              <p>
                Weather is one part of the decision. Check road restrictions and
                local advisories before you go.
              </p>
            </div>
          </aside>

          <section className="workspace" aria-label="Route comparison">
            {plan?.mode === "demo" && (
              <div className="notice sample-notice">
                <FlaskConical size={17} />
                <p>
                  <strong>Sample trip.</strong> Recorded road routes and
                  synthetic weather, for exploring the app. This is not a live
                  forecast.
                </p>
              </div>
            )}
            {plan?.warnings
              .filter(
                (warning) =>
                  !warning.startsWith("Demo:") &&
                  !warning.startsWith("Prototype only:"),
              )
              .map((warning, index) => (
                <div key={index} className="notice warning-notice">
                  <Info size={17} />
                  <p>{warning}</p>
                </div>
              ))}
            <div
              className={`map-panel ${loading ? "is-loading" : ""}`}
              aria-busy={!!loading}
            >
              <MapView
                plan={plan}
                activeId={activeId}
                checkpoint={checkpoint}
                hour={hour}
                onSelect={selectRoute}
                onCheckpoint={setCheckpoint}
              />
              {loading && (
                <div className="loading-overlay" role="status">
                  <span>
                    <LoaderCircle className="spin" size={22} />
                    <strong>
                      {loading === "demo"
                        ? "Opening the sample trip"
                        : "Connecting the route and the forecast"}
                    </strong>
                    <small>
                      {loading === "demo"
                        ? "Preparing routes and weather snapshots…"
                        : "Finding alternatives and checking weather at each arrival time…"}
                    </small>
                  </span>
                </div>
              )}
              <div className="timeline">
                <div className="timeline-heading">
                  <div>
                    <span className="section-kicker">
                      <CloudSun size={15} /> CORRIDOR FORECAST
                    </span>
                    <strong>
                      {plan?.corridor.hours[hour]
                        ? dateTime(plan.corridor.hours[hour], true)
                        : "Explore the next 48 hours"}
                    </strong>
                  </div>
                  <span className="forecast-offset">+{hour}h</span>
                </div>
                <input
                  aria-label="Forecast hours after departure hour"
                  aria-valuetext={
                    plan?.corridor.hours[hour]
                      ? dateTime(plan.corridor.hours[hour], true)
                      : "Plan a trip to explore forecasts"
                  }
                  type="range"
                  min="0"
                  max={Math.max(0, (plan?.corridor.hours.length || 49) - 1)}
                  step="1"
                  value={hour}
                  disabled={!plan || !plan.corridor.hours.length}
                  onChange={(event) => setHour(Number(event.target.value))}
                />
                <div className="timeline-ticks">
                  <span>Departure hour</span>
                  <span>+12h</span>
                  <span>+24h</span>
                  <span>+36h</span>
                  <span>+48h</span>
                </div>
                <div className="timeline-bottom">
                  <Legend />
                  <button
                    type="button"
                    onClick={() => setShowRules(true)}
                    aria-label="Explain weather risk levels"
                  >
                    <Info size={14} />
                  </button>
                </div>
                {plan && (
                  <p className="timeline-note">
                    Explore weather over time. Route scores stay tied to your
                    arrival at each checkpoint.
                  </p>
                )}
              </div>
            </div>

            <div className="results-heading">
              <div>
                <span className="section-kicker">YOUR OPTIONS</span>
                <h2 ref={resultHeading} tabIndex={-1}>
                  {plan
                    ? `${plan.routes.length} route${plan.routes.length === 1 ? "" : "s"}, a clearer choice.`
                    : "One trip. A few ways forward."}
                </h2>
              </div>
              {plan ? (
                <span className="result-summary">
                  {number(plan.load_lbs)} lb · Every {plan.spacing_miles} mi
                </span>
              ) : (
                <RouteIcon size={24} className="muted-icon" />
              )}
            </div>

            {!plan ? (
              <div className="empty-results">
                <div>
                  <span>01</span>
                  <strong>Compare alternatives</strong>
                  <p>
                    Distance and travel time,
                    <br />
                    side by side.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <strong>Check arrival-time weather</strong>
                  <p>
                    Wind, rain and snow,
                    <br />
                    along your actual route.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Choose with context</strong>
                  <p>
                    A recommendation based
                    <br />
                    on weather exposure.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="trip-result-context">
                  <MapPin size={13} />
                  <span>
                    {city(plan.origin)} <ArrowRight size={12} />{" "}
                    {city(plan.destination)}
                  </span>
                  <span className="context-divider" />
                  <span>Leaving {dateTime(plan.departure, true)}</span>
                </div>
                {!plan.recommended_route_id && (
                  <div className="notice blocked-notice" role="status">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>No route can be recommended</strong>
                      <p>
                        {plan.recommendation_reason ||
                          "Each route includes no-travel conditions or unavailable weather. Review the checkpoints and choose another departure time."}
                      </p>
                    </div>
                  </div>
                )}
                {!plan.routes.length && (
                  <div className="no-routes">
                    <Compass size={24} />
                    <p>
                      No usable routes were returned. Try nearby cities or a
                      shorter trip.
                    </p>
                  </div>
                )}
                <div className="route-cards">
                  {plan.routes.map((route, index) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      index={index}
                      selected={route.id === activeId}
                      recommended={route.id === plan.recommended_route_id}
                      onSelect={() => selectRoute(route.id)}
                    />
                  ))}
                </div>
                {plan.recommended_route_id && (
                  <p className="recommendation-copy">
                    <Check size={15} />
                    <span>{plan.recommendation_reason}</span>
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        {active && plan && (
          <section className="detail-section" aria-labelledby="detail-title">
            <div className="detail-overview">
              <span className="section-kicker">A CLOSER LOOK</span>
              <h2 id="detail-title">{active.name}, mile by mile.</h2>
              <p>Weather where you'll be, when you get there.</p>
              <div className="detail-stat">
                <span>Travel time</span>
                <strong>{duration(active.duration_minutes)}</strong>
              </div>
              <div className="detail-stat">
                <span>Total distance</span>
                <strong>{number(active.distance_miles, 1)} mi</strong>
              </div>
              <div className="detail-stat">
                <span>Expected arrival</span>
                <strong>{dateTime(active.arrival)}</strong>
              </div>
              <div className="exposure-title">Weather exposure</div>
              <RiskBar route={active} detailed />
              {!active.eligible && (
                <p className="ineligible-copy">
                  <Info size={15} />
                  This route includes no-travel conditions or missing weather
                  and is excluded from recommendations.
                </p>
              )}
            </div>
            <div className="checkpoint-section">
              <div className="checkpoint-heading">
                <h3>
                  <MapPin size={17} /> Arrival-time checkpoints
                </h3>
                <span>{active.checkpoints.length} stops to inspect</span>
              </div>
              <p className="checkpoint-help">
                Select a checkpoint to find it on the map. Rain and snow are
                hourly accumulations. Risk uses unrounded forecast values.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Mile</th>
                      <th scope="col">Arrival</th>
                      <th scope="col">Wind</th>
                      <th scope="col">Rain</th>
                      <th scope="col">Snow</th>
                      <th scope="col">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.checkpoints.map((point) => (
                      <tr
                        key={point.id}
                        className={
                          checkpoint?.id === point.id
                            ? "selected-checkpoint"
                            : ""
                        }
                      >
                        <th scope="row">
                          <button
                            onClick={() => {
                              setCheckpoint({ ...point });
                              document
                                .querySelector(".map-panel")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                            }}
                            aria-label={`Inspect checkpoint at mile ${number(point.mile, 1)}`}
                            aria-pressed={checkpoint?.id === point.id}
                          >
                            <MapPin size={12} />
                            {number(point.mile, 1)}
                          </button>
                        </th>
                        <td title={dateTime(point.eta, true)}>
                          {timeOnly(point.eta)}
                          <small>
                            {new Date(point.eta).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </small>
                        </td>
                        <td>
                          {weatherValue(point.weather?.wind_mph, "mph", 2)}
                        </td>
                        <td>{weatherValue(point.weather?.rain_in, "in", 3)}</td>
                        <td>{weatherValue(point.weather?.snow_in, "in", 3)}</td>
                        <td>
                          <RiskBadge level={point.risk_level} />
                          {point.reasons.length > 0 && (
                            <small className="checkpoint-reason">
                              {point.reasons.join(" · ")}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <footer className="footer">
          <div>
            <span className="footer-brand">RouteCast</span>
            <span>Weather-aware decisions. Human judgment.</span>
          </div>
          <p>
            OSRM driving routes do not check truck clearance, weight limits,
            closures or legal restrictions. ETAs exclude traffic, breaks and
            hours of service.
          </p>
          {plan && (
            <p className="source-line">
              {plan.mode === "demo"
                ? "Sample data"
                : `${plan.sources.routing} · ${plan.sources.weather}`}{" "}
              · Generated {dateTime(plan.generated_at, true)}
            </p>
          )}
          <button
            type="button"
            className="privacy-link"
            onClick={() => setShowPrivacy(true)}
          >
            <Cookie size={14} /> Privacy & cookies
          </button>
        </footer>
      </main>

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            className={`toast toast-${toast.kind}`}
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            <span className="toast-icon" aria-hidden="true">
              {toast.kind === "success" ? (
                <Check size={19} />
              ) : (
                <Info size={19} />
              )}
            </span>
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button
              type="button"
              aria-label={`Dismiss ${toast.title}`}
              onClick={() =>
                setToasts((current) =>
                  current.filter((item) => item.id !== toast.id),
                )
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {privacyChoice === null && (
        <section
          className="cookie-banner"
          aria-label="Privacy and cookie notice"
        >
          <span className="cookie-banner-icon" aria-hidden="true">
            <Cookie size={22} />
          </span>
          <div className="cookie-banner-copy">
            <strong>Your privacy, clearly explained.</strong>
            <p>
              We store your notice choice on this device.{" "}
              {measurementId
                ? "Optional visit analytics run only if you allow them."
                : "No visitor analytics service is connected yet."}{" "}
              Maps and fonts may contact their providers.
            </p>
          </div>
          <div className="cookie-banner-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setShowPrivacy(true)}
            >
              Details
            </button>
            {measurementId ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => choosePrivacy("essential")}
                >
                  Essential only
                </button>
                <button
                  type="button"
                  className="banner-primary"
                  onClick={() => choosePrivacy("analytics")}
                >
                  Allow analytics
                </button>
              </>
            ) : (
              <button
                type="button"
                className="banner-primary"
                onClick={() => choosePrivacy("essential")}
              >
                Understood
              </button>
            )}
          </div>
        </section>
      )}

      <dialog
        ref={privacyModal}
        className="risk-dialog privacy-dialog"
        onClose={() => setShowPrivacy(false)}
        onClick={(event) => {
          if (event.target === privacyModal.current) setShowPrivacy(false);
        }}
        aria-labelledby="privacy-title"
      >
        <div className="dialog-heading">
          <span className="section-kicker">
            <Cookie size={16} /> PRIVACY & COOKIES
          </span>
          <button
            aria-label="Close privacy details"
            onClick={() => setShowPrivacy(false)}
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="privacy-title">A straightforward privacy note.</h2>
        <p>
          RouteCast does not require an account. We use browser storage only to
          remember your privacy choice. Route inputs are sent to our server to
          request routes and forecasts. Map tiles and fonts load from external
          providers, which can receive standard connection information.
        </p>
        <div className="privacy-facts">
          <div>
            <strong>Necessary storage</strong>
            <p>
              Your choice is kept in local storage on this device. It is not a
              cookie, and clearing browser data removes it.
            </p>
          </div>
          <div>
            <strong>Visitor analytics</strong>
            <p>
              {measurementId
                ? "If you allow it, Google Analytics measures visits using its own cookies. You can change your choice here at any time."
                : "No visitor analytics service is connected. We will ask again if one is configured later."}
            </p>
          </div>
          <div>
            <strong>Routing data</strong>
            <p>
              The server uses your selected cities, departure and truck load to
              calculate a trip. We do not create a personal trip history.
            </p>
          </div>
        </div>
        <div className="privacy-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => choosePrivacy("essential")}
          >
            Essential only
          </button>
          {measurementId && (
            <button
              type="button"
              className="banner-primary"
              onClick={() => choosePrivacy("analytics")}
            >
              Allow analytics
            </button>
          )}
        </div>
      </dialog>

      <dialog
        ref={modal}
        className="risk-dialog"
        onClose={() => setShowRules(false)}
        onClick={(event) => {
          if (event.target === modal.current) setShowRules(false);
        }}
        aria-labelledby="risk-title"
      >
        <div className="dialog-heading">
          <span className="section-kicker">
            <Wind size={16} /> THE WEATHER MODEL
          </span>
          <button
            aria-label="Close risk explanation"
            onClick={() => setShowRules(false)}
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="risk-title">How we read the road ahead.</h2>
        <p>
          At each checkpoint, the highest risk from wind, rain or snow wins.
          Weather is evaluated for your expected arrival time.
        </p>
        <div className="table-scroll">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Risk</th>
                <th>Wind (mph)</th>
                <th>Rain (in/hr)</th>
                <th>Snow (in/hr)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <RiskBadge level="low" />
                </td>
                <td>&lt;25</td>
                <td>&lt;0.10</td>
                <td>&lt;0.5</td>
              </tr>
              <tr>
                <td>
                  <RiskBadge level="moderate" />
                </td>
                <td>25 to &lt;35</td>
                <td>0.10 to &lt;0.25</td>
                <td>0.5 to &lt;1</td>
              </tr>
              <tr>
                <td>
                  <RiskBadge level="high" />
                </td>
                <td>35 to &lt;45</td>
                <td>0.25 to &lt;0.50</td>
                <td>1 to &lt;2</td>
              </tr>
              <tr>
                <td>
                  <RiskBadge level="severe" />
                </td>
                <td>45 to &lt;55</td>
                <td>0.50 to 1.00</td>
                <td>2 to 3</td>
              </tr>
              <tr>
                <td>
                  <RiskBadge level="no_travel" />
                </td>
                <td>≥55</td>
                <td>&gt;1.00</td>
                <td>&gt;3</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="rules-notes">
          <p>
            <strong>Risk uses unrounded forecast values.</strong> Displayed
            measurements are rounded for readability, after risk is calculated.
          </p>
          <p>
            <strong>Load matters.</strong> Above 30,000 lb, wind of 45 to &lt;55
            mph means no travel. Above 40,000 lb, wind of 35 to &lt;45 mph means
            severe risk.
          </p>
          <p>
            <strong>Missing is unknown.</strong> Routes with missing weather or
            no-travel conditions cannot be recommended.
          </p>
          <p>
            <strong>Distance matters, too.</strong> Each road segment takes the
            higher risk of its two checkpoints. We compare eligible routes by
            severe miles, then high miles, average risk and travel time.
          </p>
          <p>
            <strong>The forecast slider is a separate view.</strong> Its 49
            hourly snapshots show the corridor over time. Your route's
            recommendation always uses weather at each checkpoint's arrival
            time.
          </p>
        </div>
        <button className="primary-button" onClick={() => setShowRules(false)}>
          Back to the trip <ArrowRight size={16} />
        </button>
      </dialog>
    </>
  );
}
