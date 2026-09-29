import { formatPrice } from "@/lib/format-utils";

/**
 * What a rate save does to the lessons already written from its start date
 * (server: `RateReapplySummary`, ADR-0050). The sheet asks the server for it
 * before saving (`POST /salary/config/preview`) and the save returns it again.
 */
export interface RateReapplySummary {
  lessons: number;
  before: number;
  after: number;
  delta: number;
  settled: number;
  unpriced: number;
}

/** Ask before saving only when the save reaches past lessons at all. */
export function needsReapplyConfirmation(s: RateReapplySummary): boolean {
  return s.lessons > 0 || s.settled > 0 || s.unpriced > 0;
}

function signed(n: number): string {
  if (n > 0) return `+${formatPrice(n)}`;
  if (n < 0) return `-${formatPrice(-n)}`;
  return "0";
}

/** The dialog's body: one main line, then what is left as it is and why. */
export function reapplyLines(
  s: RateReapplySummary,
  fromLabel: string,
): { main: string | null; notes: string[] } {
  const main =
    s.lessons > 0
      ? `${fromLabel} dan beri yozilgan ${s.lessons} ta dars yangi stavka bilan qayta hisoblanadi: ${formatPrice(s.before)} → ${formatPrice(s.after)} so'm (${signed(s.delta)} so'm).`
      : null;
  const notes: string[] = [];
  if (s.settled > 0) {
    notes.push(
      `${s.settled} ta dars oyligi hisoblangan oyga tushadi — ular o'zgarmaydi.`,
    );
  }
  if (s.unpriced > 0) {
    notes.push(
      `${s.unpriced} ta darsni bu stavka bilan hisoblab bo'lmadi — ular o'zgarmaydi.`,
    );
  }
  if (main === null && notes.length === 0) {
    notes.push("Oldingi darslarning summasi o'zgarmaydi.");
  }
  return { main, notes };
}

/** The success toast after a save or a deactivation. */
export function savedToastText(
  base: string,
  s: RateReapplySummary | undefined,
): string {
  if (!s || s.lessons === 0) return base;
  return `${base}. ${s.lessons} ta dars qayta hisoblandi (${signed(s.delta)} so'm)`;
}
