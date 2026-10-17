import { msg } from "@/i18n/msg";

/**
 * The short month names the server writes on the chart axes
 * (`dashboard-charts.service.ts` UZ_MONTHS, `reports-attendance-analytics`
 * MONTH_LABELS_UZ). The client maps them to words; anything else is passed on.
 */
const SHORT_MONTHS: readonly string[] = [
  msg("Yan"),
  msg("Fev"),
  msg("Mar"),
  msg("Apr"),
  msg("May"),
  msg("Iyn"),
  msg("Iyl"),
  msg("Avg"),
  msg("Sen"),
  msg("Okt"),
  msg("Noy"),
  msg("Dek"),
];

/** «Okt» or «5 Apr» in the current language. Any other label is returned unchanged. */
export function chartMonthLabel(
  label: string,
  t: (source: string) => string,
): string {
  return label
    .split(" ")
    .map((part) => (SHORT_MONTHS.includes(part) ? t(part) : part))
    .join(" ");
}
