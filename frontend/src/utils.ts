import type { RiskLevel } from "./types";

export const RISK_LEVELS: RiskLevel[] = [
  "low",
  "moderate",
  "high",
  "severe",
  "no_travel",
  "unknown",
];
export const RISK: Record<RiskLevel, { label: string; color: string }> = {
  low: { label: "Low", color: "#439e83" },
  moderate: { label: "Moderate", color: "#c2a126" },
  high: { label: "High", color: "#e08431" },
  severe: { label: "Severe", color: "#cc514e" },
  no_travel: { label: "No travel", color: "#782b58" },
  unknown: { label: "Unknown", color: "#7f8999" },
};
export const ROUTE_COLORS = ["#156d76", "#677fc1", "#9973a5"];
export const INITIAL_ORIGIN = {
  name: "Chicago, Illinois, United States",
  lat: 41.8781,
  lon: -87.6298,
};
export const INITIAL_DESTINATION = {
  name: "Detroit, Michigan, United States",
  lat: 42.3314,
  lon: -83.0458,
};
export const number = (value: number, decimals = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: decimals });
export const weatherValue = (
  value: number | null | undefined,
  unit: string,
  decimals = 1,
) => (value == null ? "Unavailable" : `${number(value, decimals)} ${unit}`);
export function duration(minutes: number) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  return `${hours ? `${hours} hr ` : ""}${rounded % 60} min`;
}
export const dateTime = (iso: string, withZone = false) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" as const } : {}),
  }).format(new Date(iso));
export const timeOnly = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
export function localDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
export function nextDeparture() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return localDateInput(date);
}
export const city = (place: { name: string }) => place.name.split(",")[0];
export const riskFromScore = (score: number | null | undefined): RiskLevel =>
  score == null
    ? "unknown"
    : RISK_LEVELS[Math.min(4, Math.max(0, Math.round(score)))];
