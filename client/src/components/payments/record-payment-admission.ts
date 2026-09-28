import { formatPrice } from "@/lib/format-utils";

/** GET /payments/preview → monthly.admission (ADR-0047, contract 3.2). */
export interface PaymentReach {
  /** The last lesson from today the new balance admits; null when not even the next one. */
  paidThrough: string | null;
  /** The first lesson from today the new balance does not admit, and what it still needs. */
  next: { date: string; groupName: string; needed: number } | null;
  /** The payment leaves no debt: no promise is needed. */
  clearsDebt: boolean;
}

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

export function reachLines(reach: PaymentReach): string[] {
  if (reach.clearsDebt) {
    return ["Qarz to'liq yopiladi: oyning oxirigacha qatnashadi."];
  }
  if (!reach.paidThrough && reach.next) {
    return [
      `Bu pul bugungi darsga yetmaydi: kamida yana ${formatPrice(reach.next.needed)} so'm kerak (${ddmm(reach.next.date)}, ${reach.next.groupName}).`,
    ];
  }
  const lines: string[] = [];
  if (reach.paidThrough) {
    lines.push(
      `Bu pul ${ddmm(reach.paidThrough)} gacha yetadi: bugungi darsga kiradi.`,
    );
  }
  if (reach.next) {
    lines.push(
      `Keyingi dars ${ddmm(reach.next.date)} (${reach.next.groupName}): yana kamida ${formatPrice(reach.next.needed)} so'm kerak.`,
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
