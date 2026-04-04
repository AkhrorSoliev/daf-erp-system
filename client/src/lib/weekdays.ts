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
  monday: "Du",
  tuesday: "Se",
  wednesday: "Chor",
  thursday: "Pay",
  friday: "Ju",
  saturday: "Sha",
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
 * Accepts both lowercase and uppercase day names.
 */
export function formatWeekdays(days: string[]): string {
  return sortWeekdays(days)
    .map((d) => WEEKDAY_SHORT[d.toLowerCase()] ?? d)
    .join(", ");
}

export { WEEKDAY_ORDER, WEEKDAY_SHORT, WEEKDAY_LABELS };
