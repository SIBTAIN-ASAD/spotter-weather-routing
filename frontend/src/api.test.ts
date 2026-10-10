import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlan, findPlaces } from "./api";
import { INITIAL_DESTINATION, INITIAL_ORIGIN } from "./utils";

afterEach(() => vi.unstubAllGlobals());

describe("planning service boundary", () => {
  it("preserves useful validation details without repeating identical messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Check the trip details and try again.",
            fields: {
              origin: "Choose a named place.",
              destination: "Choose a named place.",
              departure: "Choose a future departure.",
            },
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(
      findPlaces("Chicago", new AbortController().signal),
    ).rejects.toThrow(
      "Check the trip details and try again. Choose a named place. Choose a future departure.",
    );
  });

  it("does not replace a failed live request with sample data", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Routing provider unavailable." }), {
        status: 502,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const request = {
      origin: INITIAL_ORIGIN,
      destination: INITIAL_DESTINATION,
      departure: "2026-10-11T10:00:00Z",
      load_lbs: 42000,
      spacing_miles: 10,
      demo: false,
    };
    await expect(
      createPlan(request, new AbortController().signal),
    ).rejects.toThrow("Routing provider unavailable.");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(request);
  });

  it("keeps cancelled searches distinguishable from connection failures", async () => {
    const cancelled = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancelled));
    await expect(
      findPlaces("Detroit", new AbortController().signal),
    ).rejects.toBe(cancelled);
  });

  it("encodes city search text as one query parameter", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ places: [] })));
    vi.stubGlobal("fetch", fetch);
    await findPlaces("Baden & Zürich", new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe(
      "/api/places/?q=Baden%20%26%20Z%C3%BCrich",
    );
  });
});
