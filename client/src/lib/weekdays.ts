import { msg } from "@/i18n/msg";

/** Canonical weekday order: Monday → Saturday */
const WEEKDAY_ORDER: string[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_SHORT: Record<string, string> = {
  monday: msg("Du"),
  tuesday: msg("Se"),
  wednesday: msg("Chor"),
  thursday: msg("Pay"),
  friday: msg("Ju"),
  saturday: msg("Sha"),
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Du",
  tuesday: "Se",
  wednesday: "Chor",
  thursday: "Pay",
  friday: "Ju",
  saturday: "Sha",
};

/**
 * Sort weekday strings by Monday→Saturday order.
 * Accepts both lowercase ("monday") and uppercase ("MONDAY") formats.
 */
export function sortWeekdays(days: string[]): string[] {
  return [...days].sort(
    (a, b) =>
      WEEKDAY_ORDER.indexOf(a.toLowerCase()) -
      WEEKDAY_ORDER.indexOf(b.toLowerCase()),
  );
}

/**
 * Sort and format weekdays into short Uzbek labels (Du, Se, Chor, Pay, Ju, Sha).
 * Accepts both lowercase and uppercase day names. `t` translates the short names
 * (default: the Uzbek text unchanged), so a page with a language passes its own.
 */
export function formatWeekdays(days: string[], t: (source: string) => string = (source) => source): string {
  return sortWeekdays(days)
    .map((d) => {
      const short = WEEKDAY_SHORT[d.toLowerCase()];
      return short ? t(short) : d;
    })
    .join(", ");
}

export { WEEKDAY_ORDER, WEEKDAY_SHORT, WEEKDAY_LABELS };
