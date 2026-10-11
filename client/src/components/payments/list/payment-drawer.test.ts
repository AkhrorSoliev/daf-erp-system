import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatPrice } from "@/lib/format-utils";

const caps = { keys: new Set<string>(), ceo: false };
vi.mock("@/hooks/use-permissions", () => ({ useCan: (key: string) => caps.keys.has(key) }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: (select: (s: unknown) => unknown) => select({ user: { roles: [{ id: caps.ceo ? 1 : 3, name: caps.ceo ? "CEO" : "Administrator" }] } }),
}));

import { PaymentDrawerBody } from "./payment-drawer";
import type { PaymentRow, PeriodView } from "./payments-list-types";

// Made-up names and figures.
const PERIOD: PeriodView = { start: "2026-10-01", end: "2026-10-31", singleMonth: true, endsOnMonthEnd: true };
const ROW: PaymentRow = {
  id: "p1",
  createdAt: new Date().toISOString(),
  amount: 450_000,
  method: "CLICK",
  source: "GATEWAY_WEBHOOK",
  online: true,
  status: "COMPLETED",
  receiptCode: "R-2026-00001",
  receiptNumber: null,
  note: null,
  student: { id: 10001, firstName: "Ism", lastName: "Familiya", phone: "998900000000", archived: false },
  groups: [{ id: "g1", name: "A1-01" }],
  receivedBy: null,
  parts: [{ kind: "CURRENT", monthKey: "2026-10", label: "Oktabr to'lovi", amount: 450_000 }],
  balanceBefore: -535_714,
  balanceAfter: 0,
  reversal: null,
  correctedBy: null,
  correctsPayment: null,
};

const noop = () => {};
const raw = (row: PaymentRow, keys: string[] = [], ceo = false) => {
  caps.keys = new Set(keys);
  caps.ceo = ceo;
  return renderToStaticMarkup(createElement(PaymentDrawerBody, { row, period: PERIOD, onOpen: noop, onCorrect: noop, onReverse: noop }));
};
const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));

describe("PaymentDrawerBody (spec B4 §3.8)", () => {
  it("a current payment: the facts, the parts with the period note, the balance and the receipt link", () => {
    const html = raw(ROW);
    const text = norm(html);
    expect(text).toContain(`Summa ${price(450_000)} so'm`);
    expect(text).toContain("Usul Click onlayn");
    expect(text).toContain("Manba Onlayn, avtomatik tushgan");
    expect(text).toContain("Kvitansiya R-2026-00001");
    expect(text).toContain("Guruh A1-01");
    expect(text).toContain(`Oktabr to'lovi ${price(450_000)}`);
    expect(text).toContain("Tanlangan davr (01.10–31.10) oxiriga ko'ra.");
    expect(text).toContain(`${price(-535_714)} → ${price(0)} so'm To'lov paytidagi balans`);
    expect(html).toContain("/receipts/payment/p1.pdf");
    expect(html).toContain('href="/students/profile/10001"');
  });

  it("a cancelled payment: no parts, no balance, the cancellation line", () => {
    const text = norm(raw({ ...ROW, status: "REVERSED", parts: null, reversal: { at: "2026-10-09T12:20:00.000Z", reason: "Xato", by: null } }));
    expect(text).toContain("Summa · bekor qilingan");
    expect(text).toContain("To'lov bekor qilingan — pul hech narsaga ketmagan, balans o'zgarmagan.");
    expect(text).toContain("Bekor qilindi 09.10.2026 17:20 · — · Sabab: Xato");
    expect(text).not.toContain("To'lov paytidagi balans");
  });

  it("a corrected payment links to the new one; a correcting one links back; an uncomputable one says so", () => {
    expect(norm(raw({ ...ROW, status: "REVERSED", parts: null, correctedBy: { id: "n1", amount: 400_000 } }))).toContain(
      `To'lov tuzatilgan — o'rniga ${price(400_000)} so'mlik to'lov yozilgan. Yangi to'lovni ochish →`,
    );
    expect(norm(raw({ ...ROW, correctsPayment: { id: "o1", amount: 500_000 } }))).toContain(
      `Bu to'lov ${price(500_000)} so'mlik to'lovni tuzatgan Eski to'lovni ochish →`,
    );
    expect(norm(raw({ ...ROW, parts: null }))).toContain("Bu to'lovni hisoblab bo'lmadi.");
  });

  it("the buttons follow the capabilities, the source, the status and the 72-hour rule", () => {
    const manual = { ...ROW, source: "ADMIN_MANUAL" as const };
    expect(norm(raw(manual))).not.toMatch(/Tuzatish|Bekor qilish/);
    const both = raw(manual, ["payments.correct", "money.undo"]);
    expect(norm(both)).toContain("Tuzatish Bekor qilish");
    expect(norm(both)).toContain("Tuzatish: summa o'zgarsa sabab yozish majburiy.");
    expect(norm(raw(ROW, ["payments.correct"]))).not.toMatch(/ Tuzatish /); // gateway payments are not corrected
    const old = { ...manual, createdAt: "2026-01-01T00:00:00.000Z" };
    const locked = raw(old, ["payments.correct"]);
    expect(locked).toMatch(/<button[^>]*\sdisabled=""[^>]*>Tuzatish/);
    expect(norm(locked)).toContain("72 soatdan oldingi to'lovni faqat CEO tuzatadi");
    expect(raw(old, ["payments.correct"], true)).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Tuzatish/);
    expect(norm(raw({ ...manual, status: "REVERSED", parts: null }, ["payments.correct", "money.undo"]))).not.toContain("Tuzatish Bekor qilish");
  });

  it("an archived student has no profile button", () => {
    const html = raw({ ...ROW, student: { ...ROW.student, archived: true } });
    expect(html).not.toContain("/students/profile/");
  });
});
