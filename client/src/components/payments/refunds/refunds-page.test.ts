import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatNumber, formatPhone } from "@/lib/format-utils";

const url = vi.hoisted(() => ({ search: "" }));
const auth = vi.hoisted(() => ({ roles: [{ id: 1 }] as { id: number }[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/refunds",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock("@/hooks/use-auth", () => {
  const state = () => ({ user: { roles: auth.roles } });
  const useAuth = Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()), {
    getState: state, setState: () => {}, subscribe: () => () => {},
  });
  return { useAuth };
});

import { keepWithinRefundTab, refundableListKey } from "./refunds-queries";
import { readRefundsFilters, refundableListParams } from "./refunds-url";
import { RefundsPage } from "./refunds-page";
import type { PendingRefundRow, RefundableListResponse, RefundableRow } from "./refunds-types";

// Made-up names and figures; the summary is the sum of the three tabs, as the server sends it.
const ROW: RefundableRow = {
  studentId: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233", balance: 350_000,
  kind: "muzlatilgan", since: "2026-09-15", days: 25, ageBucket: "upto30", lastGroup: { id: "g1", name: "B1-02" }, notice: null,
};
const PENDING: PendingRefundRow = {
  id: "r1", studentId: 10002, firstName: "Vali", lastName: "Aliyev", phone: "931234567", branchId: 1, amount: 620_000,
  requestedAt: "2026-10-09T06:00:00Z", dueDate: "2026-10-23", due: { overdue: false, bankDays: 9 }, reason: null,
};
const RESPONSE: RefundableListResponse = {
  summary: { total: 2_480_000, count: 7 },
  tabs: { muzlatilgan: { total: 1_150_000, count: 3 }, guruhsiz: { total: 830_000, count: 2 }, ketgan: { total: 500_000, count: 2 } },
  chips: { all: 3, upto30: 1, d31to60: 1, over60: 1 },
  rows: { data: [ROW], total: 1, page: 1, pageSize: 20 },
  pending: { data: [PENDING], total: 1, sum: 620_000, page: 1, pageSize: 10, historyCount: 9, lastHandedOverAt: "2026-10-01T09:00:00Z" },
  cashAccounts: [{ id: "a1", name: "Asosiy kassa", type: "CASH", branchId: 1 }],
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const num = (n: number) => norm(formatNumber(n));
const money = (n: number) => `${num(n)} so'm`;

function render(search = "", response: RefundableListResponse | null = RESPONSE, roleIds = [1]): string {
  url.search = search;
  auth.roles = roleIds.map((id) => ({ id }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (response) client.setQueryData(refundableListKey(undefined, refundableListParams(readRefundsFilters(search))), response);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RefundsPage))));
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T07:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("RefundsPage — header and summary (spec §3.1–3.2)", () => {
  it("shows today, Excel, and the money held with the people count and the rule", () => {
    const text = render();
    expect(text).toContain("Qaytariladigan pul Bugungi holat · 10.10 Excel");
    expect(text).toContain(`O'qimayotganlarning markazda turgan puli ${money(2_480_000)} 7 kishi — muzlatilgan, guruhsiz yoki ketgan`);
    expect(text).toContain("O'qiyotganlarning oldindan to'lagani bu yerga kirmaydi — u keyingi oy hisobiga o'tadi.");
  });

  it("prints a dash, never a zero, until the list answers", () => {
    expect(render("", null)).toContain("O'qimayotganlarning markazda turgan puli —");
  });
});

describe("RefundsPage — Kutilayotgan qaytarishlar (spec §3.3)", () => {
  it("the header, the rule, the columns and the row", () => {
    const text = render();
    expect(text).toContain("Kutilayotgan qaytarishlar Tarix · 9 ta");
    expect(text).toContain(`${money(620_000)} · 1 ta so'rov`);
    expect(text).toContain("Muddat — 10 bank kuni (shanba, yakshanba va bayramlar sanalmaydi).");
    expect(text).toContain("# O'quvchi Summa So'ralgan Muddat Holat Amal");
    expect(text).toContain(`Vali Aliyev ID 10002 · ${norm(formatPhone("931234567"))} ${num(620_000)} 09.10 23.10 gacha 9 bank kuni qoldi`);
  });

  it("«Berildi» for every role of the page, «Bekor qilish» for CEO and Branch Director only", () => {
    expect(render("", RESPONSE, [1])).toContain("9 bank kuni qoldi Berildi Bekor qilish");
    expect(render("", RESPONSE, [2])).toContain("Berildi Bekor qilish");
    for (const role of [3, 5]) {
      const text = render("", RESPONSE, [role]);
      expect(text).toContain("9 bank kuni qoldi Berildi");
      expect(text).not.toContain("Bekor qilish");
    }
  });

  it("no request: says so, with the last hand-over's day", () => {
    const empty = { ...RESPONSE, pending: { ...RESPONSE.pending, data: [], total: 0, sum: 0 } };
    const text = render("", empty);
    expect(text).toContain("Hozir kutilayotgan pul qaytarish yo'q. Oxirgisi 01.10 da berilgan.");
    expect(text).not.toContain("ta so'rov");
  });
});

describe("RefundsPage — the three tabs (spec §3.4)", () => {
  it("each tab button has its total, count and small line; the frozen one counts those past 30 days", () => {
    const text = render();
    expect(text).toContain(`Muzlatilganlar ${money(1_150_000)} 3 kishi · 2 tasi 30 kundan oshgan`);
    expect(text).toContain(`Guruhsiz ${money(830_000)} 2 kishi · guruhga qo'shilmagan`);
    expect(text).toContain(`Ketganlar ${money(500_000)} 2 kishi · pulini olib ketmagan`);
  });

  it("Muzlatilganlar: the rule, the age chips with counts, the columns and the row", () => {
    const text = render();
    expect(text).toContain("30 kundan oshgani — shartnoma muddati o'tgan; 60 kundan oshgani tizimda ketgan hisoblanadi.");
    for (const chip of ["Hammasi · 3", "30 kungacha · 1", "31–60 kun · 1", "60 kundan ko'p · 1"]) expect(text).toContain(chip);
    expect(text).toContain("# O'quvchi Muzlatilgan Holat Puli Xabar");
    expect(text).toContain(`Ali Valiyev ID 10001 · ${norm(formatPhone("901112233"))} 15.09 · 25 kun kutilmoqda ${num(350_000)} berilmagan`);
    expect(text).toContain("O'quvchi ustiga bosing — tafsilot va amallar o'ng tomonda ochiladi");
  });

  it("Guruhsiz: its own columns, no age chips, the last group and the notice", () => {
    const row = { ...ROW, kind: "guruhsiz" as const, notice: { date: "2026-10-03", channel: "CALL" as const } };
    const text = render("tab=guruhsiz", { ...RESPONSE, rows: { ...RESPONSE.rows, data: [row] } });
    expect(text).toContain("# O'quvchi Guruhsiz Oxirgi guruh Puli Xabar");
    expect(text).toContain("B1-02");
    expect(text).toContain("03.10 · qo'ng'iroq qilib aytildi");
    expect(text).not.toContain("30 kungacha");
    expect(text).toContain("Statusi faol, lekin hech qaysi guruhda o'qimayotganlar.");
  });

  it("an empty tab says so plainly; only a search suggests clearing it", () => {
    const empty = { ...RESPONSE, rows: { ...RESPONSE.rows, data: [], total: 0 } };
    expect(render("tab=ketgan", empty)).toContain("Bu bo'limda puli qolgan o'quvchi yo'q");
    expect(render("tab=ketgan&search=ali", empty)).toContain("Hech kim topilmadi — qidiruvni tozalab ko'ring");
  });

  it("puts no English word on screen", () => {
    for (const s of ["", "tab=guruhsiz", "tab=ketgan"]) {
      const text = render(s);
      expect(text).not.toMatch(/\b(refund|pending|total|tab|search|frozen|ungrouped|left|notice|history|loading|error)\b/i);
      expect(text).not.toMatch(/\b(BOT|CALL|CASH|BANK|CARD|REQUESTED|COMPLETED)\b/);
    }
  });
});

describe("RefundsPage — between two answers", () => {
  const key = (search: string, branchId?: number) => refundableListKey(branchId, refundableListParams(readRefundsFilters(search)));

  it("keeps the last answer within a tab; a tab switch drops only the rows", () => {
    expect(keepWithinRefundTab("muzlatilgan")(RESPONSE, { queryKey: key("page=2") })).toBe(RESPONSE);
    const across = keepWithinRefundTab("ketgan")(RESPONSE, { queryKey: key("") });
    expect(across).toMatchObject({ rows: { data: [], total: 0 }, pending: RESPONSE.pending, tabs: RESPONSE.tabs });
    expect(keepWithinRefundTab("ketgan")(undefined, undefined)).toBeUndefined();
  });

  it("another branch's answer is never kept, on the same tab or across tabs", () => {
    expect(keepWithinRefundTab("muzlatilgan", 2)(RESPONSE, { queryKey: key("page=2", 1) })).toBeUndefined();
    expect(keepWithinRefundTab("ketgan", 2)(RESPONSE, { queryKey: key("", 1) })).toBeUndefined();
    expect(keepWithinRefundTab("muzlatilgan", undefined)(RESPONSE, { queryKey: key("", 1) })).toBeUndefined();
    // The same branch keeps it as before.
    expect(keepWithinRefundTab("muzlatilgan", 2)(RESPONSE, { queryKey: key("page=2", 2) })).toBe(RESPONSE);
    expect(keepWithinRefundTab("ketgan", 2)(RESPONSE, { queryKey: key("", 2) })).toMatchObject({ rows: { data: [], total: 0 }, tabs: RESPONSE.tabs });
  });

  it("a page past the last one shows the skeleton, not a false «yo'q»", () => {
    const text = render("page=3", { ...RESPONSE, rows: { ...RESPONSE.rows, data: [], total: 25 } });
    expect(text).not.toContain("Bu bo'limda puli qolgan o'quvchi yo'q");
  });
});
