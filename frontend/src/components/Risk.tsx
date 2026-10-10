import type { RiskLevel, Route } from "../types";
import { number, RISK, RISK_LEVELS } from "../utils";

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-badge risk-${level}`}>
      <i style={{ background: RISK[level].color }} />
      {RISK[level].label}
    </span>
  );
}
export function Legend() {
  return (
    <div className="risk-legend" aria-label="Weather risk legend">
      {RISK_LEVELS.map((level) => (
        <span key={level}>
          <i style={{ background: RISK[level].color }} />
          {RISK[level].label}
        </span>
      ))}
    </div>
  );
}
export function RiskBar({
  route,
  detailed = false,
}: {
  route: Route;
  detailed?: boolean;
}) {
  const total = Object.values(route.risk_miles).reduce(
    (sum, miles) => sum + miles,
    0,
  );
  const description = RISK_LEVELS.filter((level) => route.risk_miles[level] > 0)
    .map(
      (level) =>
        `${number(route.risk_miles[level], 1)} miles ${RISK[level].label.toLowerCase()}`,
    )
    .join(", ");
  return (
    <div className="risk-distribution">
      <div
        className="risk-bar"
        role="img"
        aria-label={`Weather exposure: ${description}`}
      >
        {RISK_LEVELS.map(
          (level) =>
            route.risk_miles[level] > 0 && (
              <span
                key={level}
                title={`${RISK[level].label}: ${number(route.risk_miles[level], 1)} mi`}
                style={{
                  width: `${total ? (route.risk_miles[level] / total) * 100 : 0}%`,
                  background: RISK[level].color,
                }}
              />
            ),
        )}
      </div>
      {detailed && (
        <div className="risk-mile-values">
          {RISK_LEVELS.map((level) => (
            <span key={level}>
              <i style={{ background: RISK[level].color }} />
              <span>{RISK[level].label}</span>
              <strong>
                {number(route.risk_miles[level], 1)} <small>mi</small>
              </strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
