import { cn } from "@/lib/utils";
import { compareText, deltaLine, deltaTone, type DeltaUnit } from "./kpi-format";

const TONE = { good: "text-green-600", bad: "text-destructive", flat: "text-muted-foreground" } as const;

/**
 * «▲ 3 — taqqoslanayotgan oyga nisbatan», green when better, red when worse.
 * Renders nothing when the compare month has no KPI data (`compareAvailable` false).
 * `compareAvailable` is required on purpose: forgetting it must not compile.
 */
export function TrendLine({
  value,
  compare,
  unit,
  higherIsBetter = true,
  suffix = " — taqqoslanayotgan oyga nisbatan",
  compareAvailable,
}: {
  value: number;
  compare: number;
  unit: DeltaUnit;
  higherIsBetter?: boolean;
  suffix?: string;
  compareAvailable: boolean;
}) {
  if (!compareAvailable) return null;
  return (
    <p className={cn("text-xs", TONE[deltaTone(value, compare, higherIsBetter)])}>
      {deltaLine(value, compare, unit)}
      {suffix}
    </p>
  );
}

/** The arrow alone, for a table cell; `compareAvailable` is required, as on `TrendLine`. */
export function TrendMark({
  value,
  compare,
  unit,
  higherIsBetter = true,
  compareAvailable,
}: {
  value: number;
  compare: number;
  unit: DeltaUnit;
  higherIsBetter?: boolean;
  compareAvailable: boolean;
}) {
  if (!compareAvailable || value === compare) return null;
  return (
    <span
      className={cn("ml-1 text-xs", TONE[deltaTone(value, compare, higherIsBetter)])}
      aria-label={`taqqoslanayotgan oyda ${compareText(compare, unit)}`}
    >
      {value > compare ? "▲" : "▼"}
    </span>
  );
}
