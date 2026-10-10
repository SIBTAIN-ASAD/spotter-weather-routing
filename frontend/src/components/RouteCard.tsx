import { ArrowUpRight, Ban, Check } from "lucide-react";
import type { Route } from "../types";
import { dateTime, duration, number, ROUTE_COLORS } from "../utils";
import { RiskBadge, RiskBar } from "./Risk";

type Props = {
  route: Route;
  index: number;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
};
export function RouteCard({
  route,
  index,
  selected,
  recommended,
  onSelect,
}: Props) {
  return (
    <button
      className={`route-card ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="route-card-top">
        <span className="route-name">
          <i
            className="route-number"
            style={{ background: ROUTE_COLORS[index % ROUTE_COLORS.length] }}
          >
            {index + 1}
          </i>
          {route.name}
        </span>
        {recommended ? (
          <span className="recommended">
            <Check size={12} /> Recommended
          </span>
        ) : !route.eligible ? (
          <span className="not-eligible">
            <Ban size={12} /> Not eligible
          </span>
        ) : (
          <ArrowUpRight size={16} className="route-arrow" />
        )}
      </span>
      <span className="route-via" title={route.via}>
        {route.via || "Road route"}
      </span>
      <span className="route-metrics">
        <strong>{duration(route.duration_minutes)}</strong>
        <span>{number(route.distance_miles)} mi</span>
        <RiskBadge level={route.risk_level} />
      </span>
      <span className="arrival">Arrive {dateTime(route.arrival)}</span>
      <RiskBar route={route} />
    </button>
  );
}
