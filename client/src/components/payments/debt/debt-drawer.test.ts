import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format-utils";
import { DebtDrawerBody, PromiseForm } from "./debt-drawer";
import type { DebtDrawer, PromiseMonthState } from "./debt-types";

const DRAWER: DebtDrawer = {
  student: { id: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233" },
  kind: null, groups: [{ id: "g1", name: "A1-01", teachers: [{ id: 10020, name: "Olim Karimov" }] }], debt: 140_000,
  months: [
    { month: "2026-08", label: null, charged: null, paid: null, left: 30_000 },
    { month: "2026-09", label: null, charged: 450_000, paid: 380_000, left: 70_000 },
    { month: null, label: "Sinov imtihoni", charged: null, paid: null, left: 40_000 },
  ],
  lastPayment: null, lastCall: null, promise: null,
};
const FREE: PromiseMonthState = { monthPromise: null, create: { from: "2026-10-14", to: "2026-10-21" }, edit: null };
const TAKEN: PromiseMonthState = {
  monthPromise: { id: "p1", status: "KEPT", promiseDate: "2026-10-05T18:00:00Z", promisedAmount: null, createdAt: "2026-10-02T05:00:00Z" },
  create: null, edit: null,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const noop = () => {};
const html = (over: Partial<Parameters<typeof DebtDrawerBody>[0]> = {}) =>
  renderToStaticMarkup(createElement(DebtDrawerBody, { drawer: DRAWER, promiseState: FREE, canLogCalls: true, canPdf: true, onPay: noop, onLogCall: noop, ...over }));

describe("DebtDrawerBody (spec §2.5)", () => {
  it("prints the contacts, the debt with its span, the months as columns, and the empty payment and contact lines", () => {
    const text = norm(html());
    expect(text).toContain(norm(formatPhone("901112233")));
    expect(text).toContain("A1-01 · Olim Karimov");
    expect(text).toContain(`Umumiy qarz ${num(140_000)} so'm 2 oy bo'yicha · eng eskisi avgust`);
    expect(text).toContain("Oy Hisoblandi To'landi Qoldi");
    expect(text).toContain(`Avgust 2026 — — ${num(30_000)}`);
    expect(text).toContain(`Sentabr 2026 ${num(450_000)} ${num(380_000)} ${num(70_000)}`);
    expect(text).toContain(`Jami ${num(140_000)}`);
    expect(text).toContain("Va'da yo'q");
    expect(text).toContain("Hali to'lov qilmagan");
    expect(text).toContain("Hali aloqa bo'lmagan");
  });

  it("the last payment and the last call: method, amount, who called, when, and the note", () => {
    const text = norm(html({ drawer: { ...DRAWER,
      lastPayment: { createdAt: "2026-08-12T06:00:00Z", amount: 350_000, method: "CASH" },
      lastCall: { createdAt: "2026-10-03T09:20:00Z", outcome: "WILL_PAY", note: "Maosh olgach to'laydi", calledByName: "Kamola" } } }));
    expect(text).toContain(`12.08.2026 · Naqd ${num(350_000)} so'm`);
    expect(text).toContain("To'laydi 03.10.2026, 14:20 · Kamola «Maosh olgach to'laydi»");
  });

  it("no month lines (they would not add up to the debt): no «Oylar bo'yicha» block at all", () => {
    expect(norm(html())).toContain("Oylar bo'yicha");
    const text = norm(html({ drawer: { ...DRAWER, months: [] } }));
    expect(text).not.toContain("Oylar bo'yicha");
    expect(text).toContain(`Umumiy qarz ${num(140_000)} so'm`);
  });

  it("a line that is not a month's lessons keeps its label and shows only what is left", () => {
    expect(norm(html())).toContain(`Sinov imtihoni — — ${num(40_000)}`);
  });

  it("the promise card: open with its amount, broken with «edi»", () => {
    const open = norm(html({ drawer: { ...DRAWER, promise: { state: "open", promiseDate: "2026-10-17", promisedAmount: 350_000 } } }));
    expect(open).toContain(`Va'da berilgan ${num(350_000)} so'm · 17.10 gacha`);
    const broken = norm(html({ drawer: { ...DRAWER, promise: { state: "broken", promiseDate: "2026-10-05", promisedAmount: null } } }));
    expect(broken).toContain("Va'da buzildi 05.10 gacha edi");
  });

  it("the actions follow the roles: a cashier gets neither the call result nor the PDF", () => {
    const admin = norm(html());
    for (const action of ["To'lov qayd qilish", "Va'da yozish", "Qo'ng'iroq natijasi", "To'lovlar hisoboti (PDF)"]) expect(admin).toContain(action);
    const cashier = norm(html({ canLogCalls: false, canPdf: false }));
    expect(cashier).toContain("Va'da yozish");
    expect(cashier).not.toContain("Qo'ng'iroq natijasi");
    expect(cashier).not.toContain("To'lovlar hisoboti (PDF)");
  });

  it("a promise already this month disables «Va'da yozish» and says why", () => {
    const raw = html({ promiseState: TAKEN });
    expect(norm(raw)).toContain("Bu o'quvchiga shu oy va'da yozilgan");
    // The attribute itself — every Button's class also says `disabled:…`.
    expect(raw).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Va&#x27;da yozish/);
    expect(html()).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Va&#x27;da yozish/);
  });

  it("a failed promise lookup disables «Va'da yozish» and says so", () => {
    const raw = html({ promiseState: null, promiseFailed: true });
    expect(norm(raw)).toContain("Va'da holatini yuklab bo'lmadi");
    expect(raw).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Va&#x27;da yozish/);
    expect(norm(html())).not.toContain("Va'da holatini yuklab bo'lmadi");
  });
});

describe("PromiseForm", () => {
  it("has the three fields and the rule note, never «shartnoma bo'yicha»", () => {
    const text = norm(renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(PromiseForm, { studentId: 10001, debt: 500_000, range: FREE.create!, onClose: noop }))));
    for (const label of ["Summa", "Qachongacha", "Izoh", "Ko'pi bilan 7 kunga, oyiga 1 marta."]) expect(text).toContain(label);
    expect(text).not.toContain("shartnoma bo'yicha");
  });
});
