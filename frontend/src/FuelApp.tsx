import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  ArrowRight,
  Fuel,
  LoaderCircle,
  MapPin,
  Route,
  Truck,
} from "lucide-react";

type Stop = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  route_mile: number;
  straight_line_offset_miles: number;
  price_per_gallon: number;
  gallons: number;
  cost_usd: number;
};

type FuelPlan = {
  origin: { city: string; state: string };
  destination: { city: string; state: string };
  route: {
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: { distance_miles: number; duration_minutes: number };
  };
  fuel_stops: Stop[];
  total_fuel_spend_usd: number;
  estimated_trip_fuel_cost_usd: number;
  gallons_consumed: number;
  gallons_purchased: number;
  fuel_on_arrival_gallons: number;
};

const dollars = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );

function FuelMap({ plan }: { plan: FuelPlan | null }) {
  const target = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!target.current) return;
    const instance = L.map(target.current, {
      center: [39.6, -96.5],
      zoom: 4,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(instance);
    map.current = instance;
    overlay.current = L.layerGroup().addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
      overlay.current = null;
    };
  }, []);
  useEffect(() => {
    if (!plan || !map.current || !overlay.current) return;
    overlay.current.clearLayers();
    const coordinates = plan.route.geometry.coordinates;
    const path = L.polyline(
      coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
      { color: "#087e91", weight: 5, opacity: 0.9 },
    ).addTo(overlay.current);
    for (const [index, stop] of plan.fuel_stops.entries()) {
      const marker = L.circleMarker([stop.lat, stop.lon], {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: "#ed8a35",
        fillOpacity: 1,
      }).addTo(overlay.current);
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `Stop ${index + 1} · ${stop.name}`;
      const detail = document.createElement("p");
      detail.textContent = `${stop.city}, ${stop.state} · mile ${stop.route_mile} · ${dollars(stop.price_per_gallon)}/gal`;
      popup.append(title, detail);
      marker.bindPopup(popup);
    }
    map.current.fitBounds(path.getBounds(), { padding: [25, 25] });
  }, [plan]);
  return (
    <div className="fuel-map-wrap">
      <div
        ref={target}
        className="fuel-map"
        role="img"
        aria-label={
          plan
            ? `Map of the route from ${plan.origin.city} to ${plan.destination.city} with ${plan.fuel_stops.length} fuel stops`
            : "Map waiting for a route"
        }
      />
      {!plan && (
        <div className="fuel-map-empty">
          <Route size={28} />
          <strong>Your route appears here</strong>
          <span>Plan a trip to see the road and suggested fuel stops.</span>
        </div>
      )}
    </div>
  );
}

export default function FuelApp() {
  useEffect(() => {
    document.title = "RouteCast — Fuel-aware trip planning";
  }, []);
  const [origin, setOrigin] = useState("Chicago, IL");
  const [destination, setDestination] = useState("Atlanta, GA");
  const [startingFuel, setStartingFuel] = useState("50");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<FuelPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/fuel/plan/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: origin.trim(),
          destination: destination.trim(),
          starting_fuel_gallons: Number(startingFuel),
        }),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The route could not be planned.");
      setPlan(data as FuelPlan);
      setMessage(
        `Route ready · ${data.fuel_stops.length} fuel stop${data.fuel_stops.length === 1 ? "" : "s"} selected.`,
      );
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "The route could not be planned.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="fuel-page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="RouteCast home">
          <img src="/favicon.svg" alt="" />
          <span>
            Route<span>Cast</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Weather planner</a>
          <a href="/fuel/" className="nav-active" aria-current="page">
            Fuel planner
          </a>
        </nav>
        <span className="header-caption">
          <Truck size={15} /> Built for the road ahead
        </span>
      </header>

      <main className="fuel-main">
        <div className="fuel-hero">
          <div>
            <div className="eyebrow">
              <span /> FUEL-AWARE ROUTING
            </div>
            <h1>Plan the miles. Pay less at the pump.</h1>
            <p>
              One road route, nearby fuel prices, and a clear plan for a
              500-mile tank.
            </p>
          </div>
          <div className="fuel-hero-mark" aria-hidden="true">
            <Fuel size={36} />
          </div>
        </div>

        <div className="fuel-layout">
          <section className="fuel-controls" aria-labelledby="fuel-form-title">
            <div className="panel-heading">
              <h2 id="fuel-form-title">
                <MapPin size={18} /> Plan a fuel trip
              </h2>
              <span>01</span>
            </div>
            <form onSubmit={(event) => void submit(event)}>
              <label className="form-field" htmlFor="fuel-origin">
                Start city, state
                <input
                  id="fuel-origin"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  placeholder="Chicago, IL"
                  required
                  disabled={loading}
                />
              </label>
              <label className="form-field" htmlFor="fuel-destination">
                Finish city, state
                <input
                  id="fuel-destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Atlanta, GA"
                  required
                  disabled={loading}
                />
              </label>
              <label className="form-field" htmlFor="fuel-starting">
                Fuel already in the tank
                <span className="input-with-unit">
                  <input
                    id="fuel-starting"
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={startingFuel}
                    onChange={(event) => setStartingFuel(event.target.value)}
                    required
                    disabled={loading}
                  />
                  <span>gal</span>
                </span>
              </label>
              <p className="fuel-field-note">
                50 gallons is a full tank. The actual price of fuel already in
                the tank is unknown; we estimate its value separately from new
                purchases.
              </p>
              <button className="fuel-submit" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle size={17} className="spin" /> Finding a fuel
                    plan…
                  </>
                ) : (
                  <>
                    Find fuel stops <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
            {message && (
              <div
                className={`fuel-message ${plan && !loading && message.startsWith("Route ready") ? "is-success" : ""}`}
                role="status"
              >
                {message}
              </div>
            )}
            <div className="fuel-source">
              <span>Price data</span>
              <strong>Spotter assessment CSV</strong>
              <span>Routing</span>
              <strong>OSRM / OpenStreetMap</strong>
            </div>
          </section>

          <section
            className="fuel-results"
            aria-labelledby="fuel-results-title"
          >
            <div className="fuel-map-heading">
              <div>
                <span className="fuel-kicker">YOUR ROUTE</span>
                <h2 id="fuel-results-title">
                  {plan
                    ? `${plan.origin.city} to ${plan.destination.city}`
                    : "A better stop is ahead."}
                </h2>
              </div>
              {plan && (
                <span className="fuel-route-length">
                  {plan.route.properties.distance_miles.toLocaleString()} mi
                </span>
              )}
            </div>
            <FuelMap plan={plan} />
            <p className="fuel-map-note">
              Pins use city-level coordinates from GeoNames, not verified
              station entrances. Check the actual stop and road detour before
              driving.
            </p>
          </section>
        </div>

        {plan && (
          <>
            <section className="fuel-summary" aria-label="Fuel plan summary">
              <div className="fuel-stat">
                <span>Estimated trip fuel cost</span>
                <strong>{dollars(plan.estimated_trip_fuel_cost_usd)}</strong>
              </div>
              <div className="fuel-stat">
                <span>Estimated drive</span>
                <strong>
                  {plan.route.properties.distance_miles.toLocaleString()} mi
                </strong>
              </div>
              <div className="fuel-stat">
                <span>Fuel bought en route</span>
                <strong>{dollars(plan.total_fuel_spend_usd)}</strong>
              </div>
              <div className="fuel-stat">
                <span>Fuel stops</span>
                <strong>{plan.fuel_stops.length}</strong>
              </div>
            </section>
            <p className="fuel-estimate-note">
              The trip estimate values fuel already in the tank at a listed
              price near the start. New fuel purchases are shown separately.
            </p>
          </>
        )}

        {plan && (
          <section className="fuel-stops" aria-labelledby="fuel-stops-title">
            <div className="fuel-section-heading">
              <div>
                <span className="fuel-kicker">THE PLAN</span>
                <h2 id="fuel-stops-title">Where to fill up</h2>
              </div>
              <p>
                Stops are ranked by price while keeping each driving segment
                within the available tank range.
              </p>
            </div>
            {plan.fuel_stops.length === 0 ? (
              <div className="fuel-no-stops">
                Your starting fuel covers this route. No purchase is needed
                before arrival.
              </div>
            ) : (
              <div className="fuel-stop-grid">
                {plan.fuel_stops.map((stop, index) => (
                  <article
                    className="fuel-stop-card"
                    key={`${stop.id}-${index}`}
                  >
                    <div className="fuel-stop-index">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <span className="fuel-stop-mile">
                        MILE {stop.route_mile}
                      </span>
                      <h3>{stop.name}</h3>
                      <p>
                        {stop.city}, {stop.state} · {stop.address}
                      </p>
                      <div className="fuel-stop-price">
                        <strong>{dollars(stop.price_per_gallon)} / gal</strong>
                        <span>
                          {stop.gallons.toFixed(1)} gal ·{" "}
                          {dollars(stop.cost_usd)}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="fuel-footer">
          An assessment prototype. City-level station positions and car-profile
          routing are not truck navigation.{" "}
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            GeoNames
          </a>{" "}
          place data is licensed CC BY 4.0.
        </footer>
      </main>
    </div>
  );
}
