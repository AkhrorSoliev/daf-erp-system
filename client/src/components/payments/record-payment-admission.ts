import { formatPrice } from "@/lib/format-utils";

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

export function reachLines(reach: PaymentReach): string[] {
  if (reach.clearsDebt) {
    return ["Qarz to'liq yopiladi: oyning oxirigacha qatnashadi."];
  }
  const next = reach.next;
  const share =
    next && next.minPaidPercent != null
      ? `oy to'lovining kamida ${next.minPaidPercent}% i to'lanishi kerak — yana ${formatPrice(next.needed)} so'm`
      : null;
  if (!reach.paidThrough && next) {
    const where = `(${ddmm(next.date)}, ${next.groupName})`;
    return [
      share
        ? `Bu pul darsga kirish uchun yetmaydi: ${share} ${where}.`
        : `Bu pul bugungi darsga yetmaydi: kamida yana ${formatPrice(next.needed)} so'm kerak ${where}.`,
    ];
  }
  const lines: string[] = [];
  if (reach.paidThrough) {
    lines.push(
      `Bu pul ${ddmm(reach.paidThrough)} gacha yetadi: bugungi darsga kiradi.`,
    );
  }
  if (next) {
    lines.push(
      `Keyingi dars ${ddmm(next.date)} (${next.groupName}): ${share ?? `yana kamida ${formatPrice(next.needed)} so'm kerak`}.`,
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
