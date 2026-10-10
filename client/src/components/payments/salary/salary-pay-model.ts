import { formatPrice } from "@/lib/format-utils";
import { monthShort } from "../salary-utils";
import type { SalaryDetail } from "./salary-types";

// The «Berildi» dialog's rules as pure functions (spec §5.1), so the money
// that goes into the request body is tested without rendering anything.

/** The live line under the amounts: green when cash + card close the sum, red with both numbers when not. */
export function sliceCheck(total: number, cash: number, card: number): { ok: boolean; text: string } {
  const sum = cash + card;
  return sum === total
    ? { ok: true, text: `✓ Naqd + karta = ${formatPrice(total)} so'm` }
    : {
        ok: false,
        text: `Naqd + karta ${formatPrice(total)} so'm bo'lishi kerak, hozir ${formatPrice(sum)} so'm`,
      };
}

/**
 * `POST /salary/payments/:id/pay` body. The server refuses a slice that is not
 * above 0, so a zero amount (or one with no account) is dropped; a 0 so'm
 * payment moves no money and goes with no slices at all.
 */
export function buildPayBody(i: {
  paidAt: string;
  total: number;
  cashAccountId: string | null;
  cash: number;
  cardAccountId: string | null;
  card: number;
  note: string;
}): { paidAt: string; cashSlices: { cashAccountId: string; amount: number }[]; note?: string } {
  const cashSlices: { cashAccountId: string; amount: number }[] = [];
  if (i.total > 0) {
    if (i.cashAccountId && i.cash > 0) cashSlices.push({ cashAccountId: i.cashAccountId, amount: i.cash });
    if (i.cardAccountId && i.card > 0) cashSlices.push({ cashAccountId: i.cardAccountId, amount: i.card });
  }
  const note = i.note.trim();
  return { paidAt: i.paidAt, cashSlices, ...(note ? { note } : {}) };
}

/** «Naqd» takes the CASH accounts; «Karta» takes BANK and CARD. */
export function accountsByKind(accounts: SalaryDetail["cashAccounts"]): {
  cash: SalaryDetail["cashAccounts"];
  card: SalaryDetail["cashAccounts"];
} {
  return {
    cash: accounts.filter((a) => a.type === "CASH"),
    card: accounts.filter((a) => a.type !== "CASH"),
  };
}

/** The server says whether the payee has a bot chat (the send itself is async). */
export function payToast(notified: boolean): string {
  return notified ? "Berildi — xodimga xabar yuborildi" : "Berildi";
}

/** «Madina — sentabr oyligi berildi». */
export function payTitle(firstName: string, month: string): string {
  return `${firstName} — ${monthShort(month).toLowerCase()} oyligi berildi`;
}
