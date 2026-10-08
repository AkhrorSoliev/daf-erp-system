/**
 * Pure pieces of the stats strip above the leads board (spec 2026-10-08).
 * The figures themselves come from `GET /leads/stats`; nothing is counted here.
 */
export type LeadStatsPeriod = "week" | "month" | "last-month";

export interface LeadStats {
  now: { onBoard: number; uncalled: number; uncalledOverWeek: number };
  flow: {
    created: number;
    topSources: { name: string; count: number }[];
    converted: number;
    lost: number;
  };
}

export const LEAD_STATS_PERIODS: { value: LeadStatsPeriod; label: string }[] =
  [
    { value: "week", label: "Bu hafta" },
    { value: "month", label: "Shu oy" },
    { value: "last-month", label: "O'tgan oy" },
  ];

/** `?period=` in the URL; the default month is left out of it. */
export const LEAD_STATS_SCHEMA = {
  period: { type: "string" as const, defaultValue: "month" },
};

/** An unknown or missing value reads as the current month. */
export function parseStatsPeriod(raw: string): LeadStatsPeriod {
  return LEAD_STATS_PERIODS.some((p) => p.value === raw)
    ? (raw as LeadStatsPeriod)
    : "month";
}

/**
 * «Yangi» + «Aloqaga chiqilmagan»: the list the uncalled card opens. On the
 * board every lead that is not a student is NEW, so its rows equal the card.
 */
export const UNCALLED_HOLATI = ["NEW", "uncalled"];

/** «Tanishlar 70 · Instagram 37», or null when no lead had a source. */
export function topSourcesLine(sources: LeadStats["flow"]["topSources"]) {
  if (sources.length === 0) return null;
  return sources.map((s) => `${s.name} ${s.count}`).join(" · ");
}
