import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentsPager, PaymentsTable, PaymentsTotalsLine } from "./payments-table";
import type { PaymentRow } from "./payments-list-types";

const noop = () => {};
const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const text = (el: ReturnType<typeof createElement>) =>
  raw(el).replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/\s+/g, " ");

function row(id: string, over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id,
    createdAt: "2026-10-09T13:20:00.000Z", // 18:20 in Tashkent
    amount: 450_000,
    method: "CASH",
    source: "ADMIN_MANUAL",
    online: false,
    status: "COMPLETED",
    receiptCode: null,
    receiptNumber: null,
    note: null,
    student: { id: 10001, firstName: "Ism", lastName: "Familiya", phone: "998900000000", archived: false },
    groups: [{ id: "g1", name: "A1-01" }],
    receivedBy: { id: 10002, firstName: "Ahror", lastName: "Test", roleLabel: "admin" },
    parts: [{ kind: "CURRENT", monthKey: "2026-10", label: "Oktabr to'lovi", amount: 450_000 }],
    balanceBefore: null,
    balanceAfter: null,
    reversal: null,
    correctedBy: null,
    correctsPayment: null,
    ...over,
  };
}

const ROWS: PaymentRow[] = [
  row("p1", {
    groups: [{ id: "g1", name: "A1-01" }, { id: "g2", name: "B1-02" }],
    parts: [
      { kind: "LATE", monthKey: "2026-09", label: "Sentabr qarzi", amount: 150_000 },
      { kind: "CURRENT", monthKey: "2026-10", label: "Oktabr to'lovi", amount: 300_000 },
    ],
  }),
  row("p2", { method: "CLICK", source: "GATEWAY_WEBHOOK", online: true, receivedBy: null, student: { id: 10003, firstName: "Ikkinchi", lastName: "Ism", phone: "", archived: false } }),
  row("p3", { status: "REVERSED", parts: null, student: { id: 10004, firstName: "Uchinchi", lastName: "Ism", phone: "", archived: false } }),
  row("p4", { status: "REVERSED", parts: null, correctedBy: { id: "n1", amount: 400_000 }, student: { id: 10005, firstName: "To'rtinchi", lastName: "Ism", phone: "", archived: false } }),
  row("p5", { student: { id: 10006, firstName: "Beshinchi", lastName: "Ism", phone: "", archived: true }, parts: [{ kind: "ADVANCE", monthKey: "2026-11", label: "Noyabr uchun oldindan", amount: 450_000 }] }),
  row("p6", { groups: [], parts: null, student: { id: 10007, firstName: "Oltinchi", lastName: "Ism", phone: "", archived: false } }),
];

const table = (rows: PaymentRow[] | undefined = ROWS, loading = false, offset = 0) =>
  createElement(PaymentsTable, { rows, loading, offset, onOpen: noop });

describe("PaymentsTable", () => {
  it("has a # column first, then the seven headers", () => {
    const t = text(table());
    expect(t.trimStart().startsWith("# Sana O'quvchi")).toBe(true);
    for (const h of ["Sana", "O'quvchi", "Guruh", "Summa", "Usul", "Nimaga ketdi", "Qabul qildi"]) expect(t).toContain(h);
  });

  it("numbers the rows from the page offset, in the first cell", () => {
    const html = raw(table(ROWS, false, 50));
    expect(html).toMatch(/<td[^>]*border-r[^>]*>51<\/td>/);
    expect(html).toMatch(/<td[^>]*border-r[^>]*>56<\/td>/);
    expect(raw(table(ROWS.slice(0, 1)))).toMatch(/<td[^>]*border-r[^>]*>1<\/td>/);
  });

  it("prints the Tashkent date and time, the bold name and the ID line", () => {
    const html = raw(table());
    expect(html).toContain("09.10 18:20");
    expect(html).toContain('<div class="font-semibold">Ism Familiya</div>');
    expect(text(table())).toContain("ID 10001");
  });

  it("«+1» next to the first group, a dash for no group, «arxivda» for the archived card (plain name)", () => {
    const t = text(table());
    expect(t).toContain("A1-01 +1");
    expect(raw(table())).toContain('title="A1-01, B1-02"');
    expect(text(table([ROWS[5]]))).toContain("Oltinchi Ism ID 10007 — ");
    expect(t).toContain("Beshinchi Ism arxivda");
    expect(raw(table([ROWS[4]]))).not.toContain("font-semibold\">Beshinchi");
  });

  it("«onlayn» pill by the online method and «Onlayn» as the receiver", () => {
    const t = text(table([ROWS[1]]));
    expect(t).toContain("Click onlayn");
    expect(t).toContain("Onlayn");
  });

  it("parts: one pill per part with the server label and amount; a dash when the engine found none", () => {
    const t = text(table());
    expect(t).toContain("Sentabr qarzi 150 000");
    expect(t).toContain("Oktabr to'lovi 300 000");
    expect(t).toContain("Noyabr uchun oldindan 450 000");
    expect(text(table([ROWS[5]]))).toMatch(/Oltinchi Ism ID 10007 — \S+ [^—]*— /);
  });

  it("a reversed row is muted, its amount struck through, with a red «bekor qilingan» pill", () => {
    const html = raw(table([ROWS[2]]));
    expect(html.match(/<tr[^>]*tabindex="0"[^>]*>/)?.[0]).toContain("text-muted-foreground");
    expect(html).toContain("line-through");
    expect(text(table([ROWS[2]]))).toContain("bekor qilingan");
  });

  it("a corrected row shows «tuzatildi → 400 000» as a button instead of «bekor qilingan»", () => {
    const html = raw(table([ROWS[3]]));
    expect(html).toContain("<button");
    const t = text(table([ROWS[3]]));
    expect(t).toContain("tuzatildi → 400 000");
    expect(t).not.toContain("bekor qilingan");
  });

  it("rows are focusable; a loading table has no payment rows", () => {
    expect(raw(table())).toContain('tabindex="0"');
    const t = text(table(ROWS, true));
    expect(t).not.toContain("Ism Familiya");
    expect(raw(table(undefined, true))).toContain("animate-pulse");
  });

  it("empty: «Bu tanlovda to'lov yo'q», «Tozalash» only when a clear handler is given", () => {
    expect(text(table([]))).toContain("Bu tanlovda to'lov yo'q");
    expect(text(table([]))).not.toContain("Tozalash");
    expect(text(createElement(PaymentsTable, { rows: [], loading: false, offset: 0, onOpen: noop, onClear: noop }))).toContain("Tozalash");
  });
});

describe("PaymentsTotalsLine", () => {
  const totals = { count: 12, amount: 5_400_000, partAmount: 900_000 };
  it("count and sum", () => {
    expect(text(createElement(PaymentsTotalsLine, { totals, holat: "otgan", partLabel: null })).trim()).toBe("Tanlangan: 12 ta to'lov · 5 400 000 so'm");
  });
  it("adds «shundan …» with a part filter", () => {
    const t = text(createElement(PaymentsTotalsLine, { totals, holat: "otgan", partLabel: "Eski qarz" }));
    expect(t).toContain("shundan Eski qarz: 900 000 so'm");
  });
  it("cancelled wording for «bekor»", () => {
    const t = text(createElement(PaymentsTotalsLine, { totals: { ...totals, amount: 0 }, holat: "bekor", partLabel: "Eski qarz" }));
    expect(t).toContain("Tanlangan: 12 ta bekor qilingan to'lov · summaga qo'shilmaydi");
    expect(t).not.toContain("shundan");
  });
});

describe("PaymentsPager", () => {
  const pager = (over: Record<string, unknown> = {}) =>
    createElement(PaymentsPager, { page: 1, pageSize: 50, total: 123, onPage: noop, onPageSize: noop, ...over });
  it("«1–50 / N» and «50 ta»", () => {
    const t = text(pager());
    expect(t).toContain("1–50 / 123");
    expect(t).toContain("50 ta");
  });
  it("the last page ends at the total; «100 ta» when chosen", () => {
    expect(text(pager({ page: 3 }))).toContain("101–123 / 123");
    expect(text(pager({ pageSize: 100 }))).toContain("100 ta");
  });
  it("‹ is off on the first page and › on the last", () => {
    const first = raw(pager());
    expect(first).toMatch(/aria-label="Oldingi sahifa"[^>]*disabled/);
    expect(first).not.toMatch(/aria-label="Keyingi sahifa"[^>]*disabled/);
    expect(raw(pager({ page: 3 }))).toMatch(/aria-label="Keyingi sahifa"[^>]*disabled/);
  });
});
