import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatPhone } from "@/lib/format-utils";

const url = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/debt",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock("@/hooks/use-auth", () => {
  const state = { user: { roles: [{ id: 1, name: "CEO" }] } };
  const useAuth = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state, setState: () => {}, subscribe: () => () => {},
  });
  return { useAuth };
});

import { debtListKey, keepWithinTab, retryDrawer } from "./debt-queries";
import { searchBoxAfterUrl } from "./debt-filter-bar";
import { debtListParams, readDebtFilters } from "./debt-url";
import { DebtPage } from "./debt-page";
import type { DebtListItem, DebtListResponse } from "./debt-types";

// Made-up figures; no total equals a sum of others, so an added total would show.
const ROW: DebtListItem = {
  studentId: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233",
  amount: 1_350_000, otherPart: 270_000, debt: 1_620_000, kind: null,
  groups: [{ id: "g1", name: "A1-01", teachers: [{ id: 20001, name: "Olim Karimov" }] }],
  promise: { state: "broken", promiseDate: "2026-10-09", promisedAmount: null },
  months: [{ monthKey: "2026-09", amount: 270_000 }], oldestMonth: "2026-09",
  dueDate: "2026-10-06", lastCall: null, lastPayment: { createdAt: "2026-09-20T09:00:00Z", amount: 400_000 },
};
const RESPONSE: DebtListResponse = {
  data: [ROW], total: 1, page: 1, pageSize: 20, sum: 1_350_000,
  tabs: {
    "shu-oy": { total: 1_350_000, count: 4 },
    eski: { total: 905_000, count: 2 },
    chiqqan: { total: 2_480_000, count: 3, byKind: { ungrouped: { total: 480_000, count: 1 }, frozen: { total: 1_000_000, count: 1 }, left: { total: 1_000_000, count: 1 } } },
  },
  leftThisMonth: 160_000,
  options: { groups: [{ id: "g1", name: "A1-01" }], teachers: [{ id: 20001, name: "Olim Karimov" }] },
  writeOffCount: 6,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

function render(search = "", response: DebtListResponse | null = RESPONSE): string {
  url.search = search;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (response) client.setQueryData(debtListKey(undefined, debtListParams(readDebtFilters(search))), response);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(DebtPage))));
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T07:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("DebtPage — header and tabs (spec §2.1–2.2)", () => {
  it("shows today, and each tab with its own total and count", () => {
    const text = render();
    expect(text).toContain("Bugungi holat · 14.10");
    expect(text).toContain(`Shu oy ${money(1_350_000)} ${num(4)} o'quvchi · oktabr to'lovi`);
    expect(text).toContain(`Eski qarz ${money(905_000)} ${num(2)} o'quvchi · o'tgan oylardan`);
    expect(text).toContain(`O'qimayotganlar ${money(2_480_000)} ${num(3)} kishi · undirish ishi`);
  });

  it("never adds the totals, and prints a dash — never a zero — until the list answers", () => {
    const text = render();
    expect(text).not.toContain(num(1_350_000 + 905_000));
    expect(text).not.toContain(num(1_350_000 + 905_000 + 2_480_000));
    expect(render("", null)).toContain("Shu oy —");
  });
});

describe("DebtPage — the Shu oy tab", () => {
  it("has the spec's columns and the row's cells", () => {
    const text = render();
    expect(text).toContain("# O'quvchi Guruh Qarz To'lov muddati Va'da Oxirgi aloqa");
    expect(text).toContain(`ID 10001 · ${norm(formatPhone("901112233"))}`);
    expect(text).toContain(`+ eski qarz ${num(270_000)}`);
    expect(text).toContain("A1-01 Olim Karimov");
    expect(text).toContain("o'tgan · 06.10");
    expect(text).toContain("buzildi · 09.10");
    expect(text).toContain("aloqa bo'lmagan");
  });

  it("says the row opens, and gives every row a «Batafsil» button beside «To'lov»", () => {
    const text = render();
    expect(text).toContain("O'quvchi ustiga bosing — qarz tafsiloti, aloqa va va'da o'ng tomonda ochiladi");
    expect(text).toContain("To'lov Batafsil");
  });

  it("prints the difference line only when it is above 0, and only here", () => {
    const line = `Shu oy guruhdan chiqqanlarning shu oy qarzi — ${money(160_000)} — «O'qimayotganlar» bo'limida.`;
    expect(render()).toContain(line);
    expect(render("", { ...RESPONSE, leftThisMonth: 0 })).not.toContain("guruhdan chiqqanlarning");
    expect(render("tab=eski")).not.toContain("guruhdan chiqqanlarning");
  });

  it("an empty tab says so plainly; only a filtered one suggests widening the filter", () => {
    const empty = { ...RESPONSE, data: [], total: 0, sum: 0 };
    const plain = render("", empty);
    expect(plain).toContain("Bu bo'limda qarzdor yo'q");
    expect(plain).not.toContain("qidiruvni tozalab");
    expect(render("search=ali", empty)).toContain("Hech kim topilmadi — qidiruvni tozalab yoki filtrni kengaytirib ko'ring");
    expect(render("tab=eski&kind=frozen", empty)).toContain("Bu bo'limda qarzdor yo'q");
  });

  it("«Jami» without a filter, «Topildi» with one", () => {
    expect(render()).toContain(`Jami: ${money(1_350_000)} · ${num(4)} ta`);
    expect(render("search=ali")).toContain(`Topildi: 1 ta · ${money(1_350_000)}`);
  });
});

describe("DebtPage — the other tabs", () => {
  it("Eski qarz: its columns, the «+ shu oy» pill, months and the last payment", () => {
    const text = render("tab=eski");
    expect(text).toContain("# O'quvchi Guruh Eski qarz Qaysi oylardan Oxirgi to'lov Va'da");
    expect(text).toContain(`+ shu oy ${num(270_000)}`);
    expect(text).toContain(`Sentabr ${num(270_000)}`);
    expect(text).toContain(`20.09 · ${num(400_000)}`);
  });

  it("O'qimayotganlar: the kind chips with their counts, Holat and Oxirgi guruh", () => {
    const text = render("tab=chiqqan", { ...RESPONSE, data: [{ ...ROW, kind: "frozen", otherPart: 0 }] });
    for (const chip of [`Hammasi · ${num(3)}`, `Guruhsiz · ${num(1)}`, `Muzlatilgan · ${num(1)}`, `Ketgan · ${num(1)}`]) expect(text).toContain(chip);
    expect(text).toContain("# O'quvchi Holat Oxirgi guruh Qarz Qaysi oylardan Oxirgi aloqa");
    expect(text).toContain("muzlatilgan A1-01");
  });
});

describe("DebtPage — links and language", () => {
  it("links the history, the write-off archive with its count, the frozen balances; names Ish haqi", () => {
    const text = render();
    expect(text).toContain("Oylar bo'yicha qarz tarixi");
    expect(text).toContain(`Kechirilgan qarzlar arxivi · ${num(6)} ta`);
    expect(text).toContain("Muzlatilganlarning puli");
    expect(text).toContain("Markaz qoplagani — Ish haqi sahifasida.");
  });

  it("puts no English word on screen", () => {
    for (const s of ["", "tab=eski", "tab=chiqqan"]) {
      expect(render(s)).not.toMatch(/\b(debt|promise|search|total|tab|ungrouped|frozen|left|open|broken|loading|error)\b/i);
    }
  });
});

describe("DebtPage — between two answers", () => {
  const key = (search: string) => debtListKey(undefined, debtListParams(readDebtFilters(search)));

  it("keeps the last answer while the same tab loads; across tabs only the tab totals", () => {
    expect(keepWithinTab("shu-oy")(RESPONSE, { queryKey: key("page=2") })).toBe(RESPONSE);
    const across = keepWithinTab("eski")(RESPONSE, { queryKey: key("") });
    expect(across).toMatchObject({ data: [], total: 0, sum: 0, tabs: RESPONSE.tabs });
    expect(keepWithinTab("eski")(undefined, undefined)).toBeUndefined();
  });

  it("a page past the last one shows the skeleton, not a false «qarzdor yo'q»", () => {
    const text = render("page=3", { ...RESPONSE, data: [], total: 25 });
    expect(text).not.toContain("Bu bo'limda qarzdor yo'q");
    expect(text).toContain(`Jami: ${money(1_350_000)}`);
  });

  it("the drawer retries a server or network failure at most twice, never a 404", () => {
    expect(retryDrawer(0, { response: { status: 500 } })).toBe(true);
    expect(retryDrawer(1, new Error("Network Error"))).toBe(true);
    expect(retryDrawer(2, { response: { status: 503 } })).toBe(false);
    expect(retryDrawer(0, { response: { status: 404 } })).toBe(false);
    expect(retryDrawer(0, { response: { status: 403 } })).toBe(false);
  });

  it("the search box keeps what was typed when its own write comes back; an outside change replaces it", () => {
    expect(searchBoxAfterUrl("alim", "ali", "ali")).toBe("alim");
    expect(searchBoxAfterUrl("ali ", "ali", "ali")).toBe("ali ");
    expect(searchBoxAfterUrl("alim", "", "ali")).toBe("");
    expect(searchBoxAfterUrl("", "vali", "")).toBe("vali");
  });
});
