import { formatNumber } from "@/lib/format-utils";

/** A share the server left out (too few known) reads as a dash, never as 0%. */
export const pctText = (v: number | null) => (v === null ? "—" : `${formatNumber(v)}%`);

/** Whole percent of `part` in `whole`; a dash while nothing stands behind it. The page's own arithmetic on two server counts. */
export const shareText = (part: number, whole: number) =>
  whole === 0 ? "—" : `${formatNumber(Math.round((part / whole) * 100))}%`;

/** People whose gender is not known: the rest of the row, never negative. */
export const unknownCount = (total: number, known: number) => Math.max(0, total - known);
