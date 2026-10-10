export type RiskLevel =
  "low" | "moderate" | "high" | "severe" | "no_travel" | "unknown";
export type Place = { name: string; lat: number; lon: number };
export type Weather = {
  wind_mph: number | null;
  rain_in: number | null;
  snow_in: number | null;
};
export type Checkpoint = {
  id: string;
  lat: number;
  lon: number;
  mile: number;
  eta: string;
  weather_time: string | null;
  weather: Weather | null;
  risk_level: RiskLevel;
  risk_score: number | null;
  reasons: string[];
};
export type Route = {
  id: string;
  name: string;
  via: string;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distance_miles: number;
  duration_minutes: number;
  arrival: string;
  eligible: boolean;
  risk_level: RiskLevel;
  average_risk: number | null;
  risk_miles: Record<RiskLevel, number>;
  checkpoints: Checkpoint[];
};
export type CorridorPoint = {
  lat: number;
  lon: number;
  risk_scores: (number | null)[];
  wind_mph: (number | null)[];
  rain_in: (number | null)[];
  snow_in: (number | null)[];
};
export type Plan = {
  mode: "live" | "demo";
  generated_at: string;
  departure: string;
  origin: Place;
  destination: Place;
  load_lbs: number;
  spacing_miles: number;
  recommended_route_id: string | null;
  recommendation_reason: string;
  warnings: string[];
  sources: { routing: string; weather: string; geocoding: string };
  routes: Route[];
  corridor: { hours: string[]; points: CorridorPoint[] };
};
export type PlanRequest = {
  origin: Place;
  destination: Place;
  departure: string;
  load_lbs: number;
  spacing_miles: number;
  demo: boolean;
};
