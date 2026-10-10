import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Layers2, Maximize2, Route as RouteIcon } from "lucide-react";
import type { Checkpoint, CorridorPoint, Plan } from "../types";
import {
  city,
  dateTime,
  duration,
  number,
  RISK,
  riskFromScore,
  ROUTE_COLORS,
  weatherValue,
} from "../utils";

class WeatherCanvas extends L.Layer {
  private canvas = L.DomUtil.create("canvas", "weather-canvas");
  private points: CorridorPoint[] = [];
  private hour = 0;
  private visible = true;
  onAdd(map: L.Map): this {
    map.getPane("weather")!.appendChild(this.canvas);
    map.on("moveend zoomend resize", this.draw, this);
    this.draw();
    return this;
  }
  onRemove(map: L.Map): this {
    map.off("moveend zoomend resize", this.draw, this);
    this.canvas.remove();
    return this;
  }
  update(points: CorridorPoint[], hour: number, visible: boolean) {
    this.points = points;
    this.hour = hour;
    this.visible = visible;
    this.draw();
  }
  private draw() {
    if (!this._map) return;
    const map = this._map;
    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = size.x * dpr;
    this.canvas.height = size.y * dpr;
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(this.canvas, map.containerPointToLayerPoint([0, 0]));
    const context = this.canvas.getContext("2d");
    if (!context || !this.visible) return;
    context.scale(dpr, dpr);
    const radius = Math.min(68, Math.max(24, 26 * 2 ** (map.getZoom() - 7)));
    // A fixed set of forecast locations is redrawn locally. Moving the hour slider never fetches.
    for (const point of this.points) {
      const position = map.latLngToContainerPoint([point.lat, point.lon]);
      if (
        position.x < -radius ||
        position.y < -radius ||
        position.x > size.x + radius ||
        position.y > size.y + radius
      )
        continue;
      const color = RISK[riskFromScore(point.risk_scores[this.hour])].color;
      const gradient = context.createRadialGradient(
        position.x,
        position.y,
        1,
        position.x,
        position.y,
        radius,
      );
      gradient.addColorStop(0, `${color}9a`);
      gradient.addColorStop(0.42, `${color}55`);
      gradient.addColorStop(1, `${color}00`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(position.x, position.y, radius, 0, 2 * Math.PI);
      context.fill();
    }
  }
}

function popupFor(checkpoint: Checkpoint): HTMLElement {
  const element = document.createElement("div");
  element.className = "checkpoint-popup";
  const title = document.createElement("strong");
  title.textContent = `${RISK[checkpoint.risk_level].label} risk · mile ${number(checkpoint.mile)}`;
  element.append(title);
  const rows = [
    `Arrive ${dateTime(checkpoint.eta, true)}`,
    `Wind ${weatherValue(checkpoint.weather?.wind_mph, "mph", 2)}`,
    `Rain ${weatherValue(checkpoint.weather?.rain_in, "in", 3)} · Snow ${weatherValue(checkpoint.weather?.snow_in, "in", 3)}`,
    ...(checkpoint.weather_time
      ? [`Forecast hour ending ${dateTime(checkpoint.weather_time)}`]
      : []),
    ...checkpoint.reasons,
  ];
  for (const row of rows) {
    const text = document.createElement("span");
    text.textContent = row;
    element.append(text);
  }
  return element;
}

function textLabel(text: string): HTMLElement {
  const label = document.createElement("span");
  label.textContent = text;
  return label;
}

type Props = {
  plan: Plan | null;
  activeId: string | null;
  checkpoint: Checkpoint | null;
  hour: number;
  onSelect: (id: string) => void;
  onCheckpoint: (checkpoint: Checkpoint) => void;
};
export function MapView({
  plan,
  activeId,
  checkpoint,
  hour,
  onSelect,
  onCheckpoint,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const routes = useRef<L.LayerGroup | null>(null);
  const weather = useRef<WeatherCanvas | null>(null);
  const popupMarkers = useRef(new Map<string, L.Marker>());
  const fittedPlan = useRef<Plan | null>(null);
  const [showWeather, setShowWeather] = useState(true);
  const [tilesFailed, setTilesFailed] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const checkpointRef = useRef(onCheckpoint);
  checkpointRef.current = onCheckpoint;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      center: [41.65, -85.35],
      zoom: 6,
      zoomControl: false,
      scrollWheelZoom: false,
    });
    map.current = instance;
    instance.createPane("weather");
    instance.getPane("weather")!.style.zIndex = "350";
    instance.getPane("weather")!.style.pointerEvents = "none";
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      },
    ).addTo(instance);
    tiles.on("tileerror", () => setTilesFailed(true));
    L.control.zoom({ position: "bottomright" }).addTo(instance);
    L.control
      .scale({ position: "bottomleft", imperial: true, metric: false })
      .addTo(instance);
    routes.current = L.layerGroup().addTo(instance);
    weather.current = new WeatherCanvas().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      fittedPlan.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !routes.current) return;
    const instance = map.current;
    const layers = routes.current;
    layers.clearLayers();
    popupMarkers.current.clear();
    if (!plan) return;
    const ordered = [...plan.routes].sort(
      (a, b) => Number(a.id === activeId) - Number(b.id === activeId),
    );
    for (const route of ordered) {
      const index = plan.routes.findIndex(
        (candidate) => candidate.id === route.id,
      );
      const positions: L.LatLngTuple[] = route.geometry.coordinates.map(
        ([lon, lat]) => [lat, lon],
      );
      const active = route.id === activeId;
      L.polyline(positions, {
        color: "#ffffff",
        weight: active ? 10 : 7,
        opacity: 0.9,
        interactive: false,
      }).addTo(layers);
      const line = L.polyline(positions, {
        color: ROUTE_COLORS[index % ROUTE_COLORS.length],
        weight: active ? 5 : 3.5,
        opacity: active ? 1 : 0.7,
      }).addTo(layers);
      line.bindTooltip(
        textLabel(
          `${route.name} · ${duration(route.duration_minutes)} · ${number(route.distance_miles)} mi · ${RISK[route.risk_level].label} risk · Arrive ${dateTime(route.arrival)}`,
        ),
        { className: "route-tooltip" },
      );
      line.on("click", () => selectRef.current(route.id));
      if (active)
        for (const point of route.checkpoints) {
          const color = RISK[point.risk_level].color;
          const marker = L.marker([point.lat, point.lon], {
            icon: L.divIcon({
              className: "checkpoint-marker",
              html: `<span style="--marker-color:${color}"></span>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            title: `Mile ${number(point.mile)}: ${RISK[point.risk_level].label} risk`,
            keyboard: true,
            riseOnHover: true,
          }).addTo(layers);
          marker.bindPopup(popupFor(point), {
            closeButton: true,
            maxWidth: 280,
          });
          marker.on("click", () => checkpointRef.current(point));
          popupMarkers.current.set(point.id, marker);
        }
    }
    for (const [place, label] of [
      [plan.origin, "A"],
      [plan.destination, "B"],
    ] as const) {
      L.marker([place.lat, place.lon], {
        icon: L.divIcon({
          className: "place-marker",
          html: `<span>${label}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        }),
        title: place.name,
        zIndexOffset: 100,
      })
        .bindTooltip(textLabel(place.name))
        .addTo(layers);
    }
    if (fittedPlan.current !== plan && plan.routes.length) {
      const bounds = L.latLngBounds(
        plan.routes.flatMap((route) =>
          route.geometry.coordinates.map(([lon, lat]): L.LatLngTuple => [
            lat,
            lon,
          ]),
        ),
      );
      instance.fitBounds(bounds, { padding: [55, 65], maxZoom: 10 });
      fittedPlan.current = plan;
    }
  }, [plan, activeId]);
  useEffect(() => {
    weather.current?.update(plan?.corridor.points || [], hour, showWeather);
  }, [plan, hour, showWeather]);
  useEffect(() => {
    if (!checkpoint) return;
    const marker = popupMarkers.current.get(checkpoint.id);
    marker?.openPopup();
  }, [checkpoint, activeId]);
  function fitRoutes() {
    if (plan?.routes.length)
      map.current?.fitBounds(
        L.latLngBounds(
          plan.routes.flatMap((route) =>
            route.geometry.coordinates.map(([lon, lat]): L.LatLngTuple => [
              lat,
              lon,
            ]),
          ),
        ),
        { padding: [55, 65], maxZoom: 10 },
      );
  }
  return (
    <div className="map-wrap">
      <div
        ref={element}
        className="map"
        aria-label="Route map. Arrow keys pan, plus and minus zoom. Select routes and checkpoints below for keyboard access."
      />
      <div className="map-topline">
        <span className="map-label">
          <span className={`status-dot ${plan ? "has-plan" : ""}`} />
          {plan
            ? `${city(plan.origin)} to ${city(plan.destination)}`
            : "Your next route starts here"}
        </span>
        <div className="map-actions">
          <button
            type="button"
            className={showWeather ? "active" : ""}
            disabled={!plan}
            aria-pressed={showWeather}
            onClick={() => setShowWeather(!showWeather)}
            title="Toggle weather overlay"
          >
            <Layers2 size={16} />
            <span>Weather</span>
          </button>
          <button
            type="button"
            disabled={!plan}
            onClick={fitRoutes}
            aria-label="Fit all routes on the map"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      {!plan && (
        <div className="map-empty">
          <span className="empty-map-icon">
            <RouteIcon size={28} strokeWidth={1.6} />
          </span>
          <h3>See the road ahead.</h3>
          <p>
            Plan a trip to compare routes, arrival times,
            <br />
            and weather along the way.
          </p>
          <span className="empty-map-detail">
            Arrival-time forecasts · Load-aware risk
          </span>
        </div>
      )}
      {plan && (
        <div className="map-note">
          <i />
          Dots: weather at arrival<span>·</span>Shading: selected forecast hour
        </div>
      )}
      {tilesFailed && (
        <div className="map-tile-warning" role="status">
          Some map tiles could not load. Route details remain available below.
        </div>
      )}
    </div>
  );
}
