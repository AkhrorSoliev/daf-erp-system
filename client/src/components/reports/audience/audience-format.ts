import { formatNumber } from "@/lib/format-utils";

/** A share the server left out (too few known) reads as a dash, never as 0%. */
export const pctText = (v: number | null) => (v === null ? "—" : `${formatNumber(v)}%`);

/** Average age with a decimal comma, or a dash when the server had too few ages. */
export const ageText = (v: number | null) => (v === null ? "—" : v.toFixed(1).replace(".", ","));

/** «197 / 516 (38%)» — how much of the page a figure stands on. The share is the page's own arithmetic on two server counts. */
export function coverageText(known: number, total: number): string {
  const share = total === 0 ? 0 : Math.round((known / total) * 100);
  return `${formatNumber(known)} / ${formatNumber(total)} (${share}%)`;
}

/** Bar width in percent; the server's share, or empty. */
export const barWidth = (pct: number | null) => `${pct ?? 0}%`;
