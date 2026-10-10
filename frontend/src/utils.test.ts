import { describe, expect, it } from "vitest";
import { duration, localDateInput, riskFromScore, weatherValue } from "./utils";

describe("weather presentation", () => {
  it("keeps unavailable weather distinct from zero precipitation", () => {
    expect(weatherValue(null, "in")).toBe("Unavailable");
    expect(weatherValue(undefined, "mph")).toBe("Unavailable");
    expect(weatherValue(0, "in")).toBe("0 in");
    expect(riskFromScore(null)).toBe("unknown");
    expect(riskFromScore(0)).toBe("low");
    expect(riskFromScore(4)).toBe("no_travel");
  });
  it("carries minute rounding into the next hour", () => {
    expect(duration(119.7)).toBe("2 hr 0 min");
    expect(duration(30.1)).toBe("30 min");
  });
  it("round-trips the date-time form value in the local timezone", () => {
    const date = new Date(2026, 9, 11, 8, 30);
    expect(localDateInput(date)).toBe("2026-10-11T08:30");
    expect(new Date(localDateInput(date)).getTime()).toBe(date.getTime());
  });
});
