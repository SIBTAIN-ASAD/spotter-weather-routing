export type PrivacyChoice = "essential" | "analytics";

const configuredId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "";
export const measurementId = /^G-[A-Z0-9]+$/.test(configuredId)
  ? configuredId
  : "";
const choiceKey = `routecast-privacy-v1-${measurementId || "unconfigured"}`;
let started = false;

export function readPrivacyChoice(): PrivacyChoice | null {
  try {
    const choice = window.localStorage.getItem(choiceKey);
    return choice === "essential" || choice === "analytics" ? choice : null;
  } catch {
    return null;
  }
}

export function savePrivacyChoice(choice: PrivacyChoice) {
  try {
    window.localStorage.setItem(choiceKey, choice);
  } catch {
    // Browsers that block local storage still let visitors use the planner.
  }
}

export function startAnalytics() {
  if (!measurementId || started) return;
  started = true;
  const analyticsWindow = window as Window & { dataLayer?: unknown[] };
  analyticsWindow.dataLayer ||= [];
  const gtag = (...args: unknown[]) => {
    analyticsWindow.dataLayer?.push(args);
  };
  gtag("js", new Date());
  gtag("config", measurementId, { anonymize_ip: true });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

export function disableAnalytics() {
  if (!measurementId) return;
  (window as unknown as Record<string, boolean>)[
    `ga-disable-${measurementId}`
  ] = true;
  // Reload clears the in-memory tag. Remove first-party GA cookies set on this host.
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name && /^_ga(?:_|$)/.test(name)) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
  window.location.reload();
}
