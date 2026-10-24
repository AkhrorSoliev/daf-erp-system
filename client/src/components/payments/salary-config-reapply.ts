import { formatPrice } from "@/lib/format-utils";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "./record-payment-admission";

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
  t: Translate = interpolate,
): { main: string | null; notes: string[] } {
  const main =
    s.lessons > 0
      ? t(
          "{from} dan beri yozilgan {n} ta dars yangi stavka bilan qayta hisoblanadi: {before} → {after} so'm ({delta} so'm).",
          {
            from: fromLabel,
            n: s.lessons,
            before: formatPrice(s.before),
            after: formatPrice(s.after),
            delta: signed(s.delta),
          },
        )
      : null;
  const notes: string[] = [];
  if (s.settled > 0) {
    notes.push(
      t("{n} ta dars oyligi hisoblangan oyga tushadi — ular o'zgarmaydi.", { n: s.settled }),
    );
  }
  if (s.unpriced > 0) {
    notes.push(
      t("{n} ta darsni bu stavka bilan hisoblab bo'lmadi — ular o'zgarmaydi.", { n: s.unpriced }),
    );
  }
  if (main === null && notes.length === 0) {
    notes.push(t("Oldingi darslarning summasi o'zgarmaydi."));
  }
  return { main, notes };
}

/** The success toast after a save or a deactivation. */
export function savedToastText(
  base: string,
  s: RateReapplySummary | undefined,
  t: Translate = interpolate,
): string {
  if (!s || s.lessons === 0) return base;
  return t("{base}. {n} ta dars qayta hisoblandi ({delta} so'm)", { base, n: s.lessons, delta: signed(s.delta) });
}
