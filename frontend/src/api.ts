import type { Place, Plan, PlanRequest } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(
      "We could not reach the planning service. Check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fieldMessages =
      data?.fields && typeof data.fields === "object"
        ? Object.values(data.fields).filter(
            (message): message is string => typeof message === "string",
          )
        : [];
    throw new Error(
      [
        data?.error || "The planning service is unavailable. Please try again.",
        ...new Set(fieldMessages),
      ].join(" "),
    );
  }
  if (!data)
    throw new Error(
      "The planning service returned an unreadable response. Please try again.",
    );
  return data as T;
}
export const findPlaces = (query: string, signal: AbortSignal) =>
  request<{ places: Place[] }>(`/api/places/?q=${encodeURIComponent(query)}`, {
    signal,
  });
export const createPlan = (body: PlanRequest, signal: AbortSignal) =>
  request<Plan>("/api/plan/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
