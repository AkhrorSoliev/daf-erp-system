import { cn } from "@/lib/utils";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/context";
import { interpolate, type Params } from "@/i18n/translate";

type Translate = (source: string, params?: Params) => string;

const MONTHS = [
  msg("yanv"),
  msg("fevr"),
  msg("mart"),
  msg("apr"),
  msg("may"),
  msg("iyun"),
  msg("iyul"),
  msg("avg"),
  msg("sent"),
  msg("okt"),
  msg("noyab"),
  msg("dek"),
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
export function shortDate(iso: string, t: Translate = interpolate): string {
  const [, month, day] = iso.split("-").map(Number);
  const name = MONTHS[month - 1];
  return name ? t("{day}-{month}", { day, month: t(name) }) : `${day}-${month}`;
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
  const t = useT();
  if (dates.length === 0) return null;

  const single = dates.length === 1;
  const label = single
    ? t("Faqat {date}", { date: shortDate(dates[0], t) })
    : t("Faqat {n} kun", { n: dates.length });

  return (
    <span
      // Hover carries what the label deliberately drops: WHY the group is in
      // this list, and — when there are several days — which ones, since a
      // count on its own is not actionable.
      title={
        single
          ? t("Bu guruhga faqat {date} kuni o'rinbosar sifatida kirasiz", { date: shortDate(dates[0], t) })
          : t("O'rinbosar sifatida kirasiz: {dates}", { dates: dates.map((d) => shortDate(d, t)).join(", ") })
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
