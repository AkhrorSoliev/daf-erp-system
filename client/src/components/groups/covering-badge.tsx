import { cn } from "@/lib/utils";

const MONTHS = [
  "yanv",
  "fevr",
  "mart",
  "apr",
  "may",
  "iyun",
  "iyul",
  "avg",
  "sent",
  "okt",
  "noyab",
  "dek",
];

/**
 * `2026-08-25` → `25-avg`.
 *
 * Parsed by hand on purpose. `new Date("2026-08-25")` is UTC midnight, and
 * rendering that in a browser west of UTC shows the 24th — a lesson date that
 * silently moves a day is worse than no badge.
 *
 * Exported for its test: a test that re-implements the formatter only proves
 * the copy agrees with itself.
 */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day}-${MONTHS[month - 1] ?? month}`;
}

/**
 * Marks a group the teacher is only COVERING, and says which day.
 *
 * A substitute's group now appears in their list beside their own, and until
 * this badge it looked identical to them. The question that leaves unanswered
 * is not "why is this here" — it is "WHICH DAY is mine", because every other
 * day of that group belongs to someone else and is closed to them.
 * So the badge carries the date, not just a label.
 *
 * Dashed, in the neutral ink rather than a colour: a cover is provisional, and
 * a dashed edge says that without another hue. The six level badges have taken
 * emerald / teal / blue / violet / amber / rose, and a seventh colour two
 * columns away would read as a level.
 */
export function CoveringBadge({
  dates,
  className,
}: {
  dates: string[];
  className?: string;
}) {
  if (dates.length === 0) return null;

  const label =
    dates.length === 1
      ? `O'rinbosar · ${shortDate(dates[0])}`
      : `O'rinbosar · ${dates.length} kun`;

  return (
    <span
      // The full list on hover: with several dates the badge can only carry a
      // count, and the count alone is not actionable.
      title={
        dates.length === 1
          ? undefined
          : `O'rinbosar bo'lgan kunlar: ${dates.map(shortDate).join(", ")}`
      }
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-md border border-dashed",
        "border-muted-foreground/40 px-1.5 text-[11px] font-medium",
        "text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
