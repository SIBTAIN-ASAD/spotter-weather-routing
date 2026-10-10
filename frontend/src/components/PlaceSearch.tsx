import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";
import { findPlaces } from "../api";
import type { Place } from "../types";

type Props = {
  label: string;
  id: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  disabled: boolean;
};
export function PlaceSearch({ label, id, value, onChange, disabled }: Props) {
  const [query, setQuery] = useState(value?.name || "");
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const firstResult = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Swapping endpoints invalidates searches for the previous field value.
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setPlaces([]);
    setSearched(false);
    setError("");
    if (value) setQuery(value.name);
  }, [value]);
  useEffect(() => () => controller.current?.abort(), []);
  async function search() {
    if (query.trim().length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError("");
    setSearched(false);
    setPlaces([]);
    try {
      const response = await findPlaces(query.trim(), abort.signal);
      if (!abort.signal.aborted && controller.current === abort) {
        setPlaces(response.places);
        setSearched(true);
      }
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "City search failed.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className={`place-field ${id}`}>
      <label htmlFor={id}>{label}</label>
      <div className="search-input">
        <span className="endpoint" aria-hidden="true" />
        <input
          id={id}
          value={query}
          placeholder="Search a city"
          disabled={disabled}
          autoComplete="off"
          aria-describedby={`${id}-hint`}
          aria-controls={places.length ? `${id}-results` : undefined}
          onChange={(event) => {
            controller.current?.abort();
            setLoading(false);
            setQuery(event.target.value);
            onChange(null);
            setPlaces([]);
            setError("");
            setSearched(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
            if (event.key === "ArrowDown" && places.length) {
              event.preventDefault();
              firstResult.current?.focus();
            }
            if (event.key === "Escape") {
              setPlaces([]);
              setSearched(false);
            }
          }}
        />
        <button
          type="button"
          className="search-button"
          aria-label={`Search ${label.toLowerCase()} city`}
          disabled={disabled || loading}
          onClick={() => void search()}
        >
          {loading ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Search size={16} />
          )}
        </button>
      </div>
      <span
        id={`${id}-hint`}
        className={`field-hint ${value ? "selected-place" : ""}`}
      >
        {value ? (
          <>
            <Check size={12} /> City selected
          </>
        ) : (
          "Search, then select a matching city."
        )}
      </span>
      <div aria-live="polite">
        {error && <p className="field-error">{error}</p>}
        {searched && !places.length && (
          <p className="field-error">
            No cities found. Try a nearby city or add a country.
          </p>
        )}
      </div>
      {!!places.length && (
        <ul
          className="place-results"
          id={`${id}-results`}
          aria-label={`${label} matches`}
        >
          {places.map((place, index) => (
            <li key={`${place.lat}-${place.lon}`}>
              <button
                type="button"
                disabled={disabled}
                ref={index === 0 ? firstResult : undefined}
                onClick={() => {
                  onChange(place);
                  setPlaces([]);
                  setSearched(false);
                }}
              >
                <span>{place.name}</span>
                <small>
                  {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
