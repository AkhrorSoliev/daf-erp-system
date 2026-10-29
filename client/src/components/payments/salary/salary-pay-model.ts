import { interpolate } from "@/i18n/translate";
import { formatPrice } from "@/lib/format-utils";
import type { Translate } from "../record-payment-admission";
import { monthShort } from "../salary-utils";
import type { SalaryDetail } from "./salary-types";

// The «Berildi» dialog's rules as pure functions (spec §5.1), so the money
// that goes into the request body is tested without rendering anything.
// The words take an optional last `t` (default: the Uzbek source).

/** The live line under the amounts: green when cash + card close the sum, red with both numbers when not. */
export function sliceCheck(
  total: number,
  cash: number,
  card: number,
  t: Translate = interpolate,
): { ok: boolean; text: string } {
  const sum = cash + card;
  return sum === total
    ? { ok: true, text: t("✓ Naqd + karta = {total} so'm", { total: formatPrice(total) }) }
    : {
        ok: false,
        text: t("Naqd + karta {total} so'm bo'lishi kerak, hozir {sum} so'm", {
          total: formatPrice(total),
          sum: formatPrice(sum),
        }),
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

/** The line under a bank amount (spec 2026-10-28 §4): the numbers are rounded like the server's. */
export function bankPayLine(
  amount: number,
  rates: SalaryDetail["bankTax"],
  t: Translate = interpolate,
): string | null {
  const w = rates?.withholdingPercent;
  const s = rates?.employerSocialPercent;
  if (amount <= 0 || w == null || s == null) return null;
  const withheld = Math.round((amount * w) / 100);
  return t("Kartaga tushadi: {toCard} so'm · Ushlanadi: {withheld} so'm · Korxona solig'i: {social} so'm (alohida)", {
    toCard: formatPrice(amount - withheld),
    withheld: formatPrice(withheld),
    social: formatPrice(Math.round((amount * s) / 100)),
  });
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
export function payToast(notified: boolean, t: Translate = interpolate): string {
  return notified ? t("Berildi — xodimga xabar yuborildi") : t("Berildi");
}

/**
 * «Madina — sentabr oyligi berildi».
 * `lowerMonth`: the month name inside the sentence is lower-cased (Uzbek, Russian), not in de/en.
 */
export function payTitle(firstName: string, month: string, t: Translate = interpolate, lowerMonth = true): string {
  const name = monthShort(month, t);
  return t("{name} — {month} oyligi berildi", { name: firstName, month: lowerMonth ? name.toLowerCase() : name });
}
