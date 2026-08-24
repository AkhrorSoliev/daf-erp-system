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
 * A substitute's group appears in their list beside their own, and without
 * this it looks identical to them. The question that leaves unanswered is not
 * "why is this here" — it is WHICH DAY IS MINE, because every other date of
 * that group belongs to someone else and is closed to them.
 *
 * So the badge answers that and nothing else: "Faqat 25-avg". No role noun.
 * "O'rinbosar" describes a PERSON, and the thing being labelled is a group;
 * it also collides with "direktor o'rinbosari". The word that was reaching for
 * accuracy was adding a second reading instead.
 *
 * The "why" it gives up is recovered on hover, where there is room for a
 * sentence and no cost to the row.
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

  const single = dates.length === 1;
  const label = single
    ? `Faqat ${shortDate(dates[0])}`
    : `Faqat ${dates.length} kun`;

  return (
    <span
      // Hover carries what the label deliberately drops: WHY the group is in
      // this list, and — when there are several days — which ones, since a
      // count on its own is not actionable.
      title={
        single
          ? `Bu guruhga faqat ${shortDate(dates[0])} kuni o'rinbosar sifatida kirasiz`
          : `O'rinbosar sifatida kirasiz: ${dates.map(shortDate).join(", ")}`
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
