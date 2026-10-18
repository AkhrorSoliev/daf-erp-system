import { formatPrice } from "@/lib/format-utils";
import { interpolate, type Params } from "@/i18n/translate";

/** GET /payments/preview → monthly.admission (ADR-0047, contract 3.2). */
export interface PaymentReach {
  /** The last lesson from today the new balance admits; null when not even the next one. */
  paidThrough: string | null;
  /**
   * The first lesson from today the new balance does not admit, and what it
   * still needs. `minPaidPercent` is set when the least share of the month,
   * not the lessons held, is what keeps the student out (ADR-0064); null, or
   * absent on an older server, otherwise.
   */
  next: {
    date: string;
    groupName: string;
    needed: number;
    minPaidPercent?: number | null;
  } | null;
  /** The payment leaves no debt: no promise is needed. */
  clearsDebt: boolean;
}

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** `t` of a page with a language; the default says the Uzbek text. */
export type Translate = (source: string, params?: Params) => string;

export function reachLines(reach: PaymentReach, t: Translate = interpolate): string[] {
  if (reach.clearsDebt) {
    return [t("Qarz to'liq yopiladi: oyning oxirigacha qatnashadi.")];
  }
  const next = reach.next;
  const share = next && next.minPaidPercent != null ? next.minPaidPercent : null;
  const params: Params = next
    ? { amount: formatPrice(next.needed), percent: share ?? 0, date: ddmm(next.date), group: next.groupName }
    : {};
  if (!reach.paidThrough && next) {
    return [
      share !== null
        ? t(
            "Bu pul darsga kirish uchun yetmaydi: oy to'lovining kamida {percent}% i to'lanishi kerak — yana {amount} so'm ({date}, {group}).",
            params,
          )
        : t("Bu pul bugungi darsga yetmaydi: kamida yana {amount} so'm kerak ({date}, {group}).", params),
    ];
  }
  const lines: string[] = [];
  if (reach.paidThrough) {
    lines.push(t("Bu pul {date} gacha yetadi: bugungi darsga kiradi.", { date: ddmm(reach.paidThrough) }));
  }
  if (next) {
    lines.push(
      share !== null
        ? t("Keyingi dars {date} ({group}): oy to'lovining kamida {percent}% i to'lanishi kerak — yana {amount} so'm.", params)
        : t("Keyingi dars {date} ({group}): yana kamida {amount} so'm kerak.", params),
    );
  }
  return lines;
}

/** A payment that leaves a debt carries a promise for the rest. */
export function promiseNeeded(reach: PaymentReach | null | undefined): boolean {
  return !!reach && !reach.clearsDebt;
}

/**
 * The first lesson the money does not reach — the natural promise date — as
 * local midnight, the value `<DatePicker>` works with.
 */
export function promiseDefaultDate(reach: PaymentReach): Date | null {
  if (!reach.next) return null;
  const [y, m, d] = reach.next.date.split("-").map(Number);
  return new Date(y, m - 1, d);
}
