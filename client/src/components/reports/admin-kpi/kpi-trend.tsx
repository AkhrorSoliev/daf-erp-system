import { cn } from "@/lib/utils";
import { KPI_START_DAY, compareText, deltaLine, deltaTone, type DeltaUnit } from "./kpi-format";

const TONE = { good: "text-green-600", bad: "text-destructive", flat: "text-muted-foreground" } as const;

/**
 * «▲ 3 — taqqoslanayotgan oyga nisbatan», green when better, red when worse.
 * Renders nothing when the compare month has no KPI data (`compareAvailable` false), and only the
 * compare figure with a note while that month was recorded in part (`compareRecorded` false).
 * Both are required on purpose: forgetting one must not compile.
 */
export function TrendLine({
  value,
  compare,
  unit,
  higherIsBetter = true,
  suffix = " — taqqoslanayotgan oyga nisbatan",
  compareAvailable,
  compareRecorded,
}: {
  value: number;
  compare: number;
  unit: DeltaUnit;
  higherIsBetter?: boolean;
  suffix?: string;
  compareAvailable: boolean;
  compareRecorded: boolean;
}) {
  if (!compareAvailable) return null;
  if (!compareRecorded) {
    return (
      <p className="text-xs text-muted-foreground">
        taqqoslanayotgan oyda {compareText(compare, unit)} — u oy {KPI_START_DAY} dan hisoblangan
      </p>
    );
  }
  return (
    <p className={cn("text-xs", TONE[deltaTone(value, compare, higherIsBetter)])}>
      {deltaLine(value, compare, unit)}
      {suffix}
    </p>
  );
}

/** The arrow alone, for a table cell; none while the compare month was recorded in part. Both flags required, as on `TrendLine`. */
export function TrendMark({
  value,
  compare,
  unit,
  higherIsBetter = true,
  compareAvailable,
  compareRecorded,
}: {
  value: number;
  compare: number;
  unit: DeltaUnit;
  higherIsBetter?: boolean;
  compareAvailable: boolean;
  compareRecorded: boolean;
}) {
  if (!compareAvailable || !compareRecorded || value === compare) return null;
  return (
    <span
      className={cn("ml-1 text-xs", TONE[deltaTone(value, compare, higherIsBetter)])}
      aria-label={`taqqoslanayotgan oyda ${compareText(compare, unit)}`}
    >
      {value > compare ? "▲" : "▼"}
    </span>
  );
}
