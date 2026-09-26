import type { LessonStatus, ModelAllocation } from "./statement-types";

/** Non-CEO operators may correct a payment only within 72h of it landing. */
export const CORRECTION_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Whether "Summani to'g'rilash" is offered on a statement payment row. Same
 * rule as before the statement: CEO at any time, roles 1-3 within 72 hours.
 * The server re-checks it (`POST /payments/:id/correct`).
 */
export function canCorrectPayment(
  a: ModelAllocation,
  who: { isCeo: boolean; canCorrect: boolean },
  now: number,
): boolean {
  if (a.kind !== "payment" || !a.paymentId || a.amount <= 0) return false;
  if (!who.canCorrect) return false;
  if (who.isCeo) return true;
  if (!a.at) return false;
  return now - Date.parse(a.at) <= CORRECTION_WINDOW_MS;
}

/** The next ledger page, without rows a previous page already showed. */
export function appendLedgerPage<T extends { id: string }>(
  shown: T[],
  next: T[],
): T[] {
  const seen = new Set(shown.map((r) => r.id));
  return [...shown, ...next.filter((r) => !seen.has(r.id))];
}

/** "DaF Sprachzentrum · 26.09.2026 holatiga" → "26.09.2026 holatiga". */
export function asOfText(asOfLine: string): string {
  const cut = asOfLine.lastIndexOf(" · ");
  return cut === -1 ? asOfLine : asOfLine.slice(cut + 3);
}

/** '2026-09-07' → '07.09'. */
export function dayMonth(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

export const LESSON_STATUS: Record<
  LessonStatus,
  { label: string; className: string }
> = {
  keldi: {
    label: "keldi",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  kelmagan: {
    label: "kelmagan",
    className:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
  },
  uzrli: {
    label: "uzrli",
    className:
      "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
  },
  belgilanmagan: {
    label: "belgilanmagan",
    className:
      "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-300",
  },
  kelgusi: {
    label: "hali o'tilmagan",
    className: "border-dashed bg-muted/40 text-muted-foreground",
  },
};

export const TONE_TEXT: Record<"red" | "green" | "muted", string> = {
  red: "text-red-600 dark:text-red-400",
  green: "text-emerald-600 dark:text-emerald-400",
  muted: "text-muted-foreground",
};
