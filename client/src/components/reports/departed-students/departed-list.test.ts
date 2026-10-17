import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatBalance } from "@/lib/format-utils";
import { DepartedList } from "./departed-list";
import type { DepartedList as DepartedListData, ListRow } from "./departed-types";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const noop = () => {};

// Made-up students.
const ROWS: ListRow[] = [
  { studentId: 101, fullName: "Ali Valiyev", phone: "901112233", group: { id: "g1", name: "A1-01" }, departedAt: "2026-10-05T07:00:00.000Z", studyMonths: 3.4,
    reason: { id: "r1", name: "Narx qimmat" }, comment: null, state: "ketgan", debt: 450_000 },
  { studentId: 102, fullName: "Dilnoza Karimova", phone: "902223344", group: null, departedAt: "2026-10-09T07:00:00.000Z", studyMonths: null,
    reason: { id: "r2", name: "Boshqa sabab" }, comment: "Boshqa shaharga ko'chdi", state: "kutilmoqda", debt: 0 },
  { studentId: 103, fullName: "Sardor Aliyev", phone: "903334455", group: { id: "g2", name: "B1-02" }, departedAt: "2026-10-12T07:00:00.000Z", studyMonths: 6,
    reason: { id: null, name: "Sabab yozilmagan" }, comment: null, state: "qaytgan", debt: 120_000 },
];
const LIST: DepartedListData = { data: ROWS, total: 23, page: 1, pageSize: 10, confirmed: 15, returned: 3, pending: 8 };
const REASONS = [{ reasonId: "r1", name: "Narx qimmat", count: 4 }, { reasonId: null, name: "Sabab yozilmagan", count: 1 }];
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(DepartedList, {
    list: LIST, loading: false, stale: false, reasons: REASONS,
    filters: { q: "", reason: "", state: "", debtors: "" }, page: 1, pageSize: 10,
    onFilter: noop, onPage: noop, onPageSize: noop, ...over,
  } as never));

describe("DepartedList", () => {
  it("the column heads", () => {
    expect(norm(render())).toContain("O'quvchi Oxirgi guruh Ketgan sana O'qidi Sabab Holat Qarzi");
  });
  it("a row: name and phone linking to the student, group link, day, study months, reason", () => {
    const html = render();
    expect(html).toContain('href="/students/101"');
    expect(html).toContain('href="/groups/g1"');
    const text = norm(html);
    expect(text).toContain("Ali Valiyev +998 90 111 22 33");
    expect(text).toContain("A1-01");
    expect(text).toContain("05.10.2026");
    expect(text).toContain("3,4 oy");
    expect(text).toContain("Narx qimmat");
  });
  it("no group and no study months are dashes", () => {
    expect(norm(render())).toContain("Dilnoza Karimova +998 90 222 33 44 — 09.10.2026 — Boshqa sabab");
  });
  it("the comment sits under the reason", () => {
    expect(norm(render())).toContain("Boshqa sabab Boshqa shaharga ko'chdi");
  });
  it("three holat badges in three tones", () => {
    const html = render();
    expect(html).toContain("bg-muted");
    expect(html).toContain("bg-amber-500/25");
    expect(html).toContain("bg-emerald-500/20");
    const text = norm(html);
    expect(text).toContain("Ketgan");
    expect(text).toContain("Kutilmoqda");
    expect(text).toContain("Qaytgan");
  });
  it("debt: so'm and a link to the debt page for a debtor, a dash otherwise", () => {
    const html = render();
    expect(norm(html)).toContain(norm(formatBalance(450_000)));
    expect(html).toContain('href="/payments/debt?tab=chiqqan&amp;search=101"');
    // a student who has come back is not in the «O'qimayotganlar» tab
    expect(html).toContain('href="/payments/debt?search=103"');
    expect(html).not.toContain("search=102");
  });
  it("the footer line counts the whole filtered list, not the page", () => {
    expect(norm(render())).toContain("15 ketgan, shundan 3 qaytgan · 8 kutilmoqda");
  });
  it("the pager with 10–50 rows", () => {
    const text = norm(render());
    expect(text).toContain("1–10 / 23");
    expect(text).toContain("10 ta");
  });
  it("the filters: search, reason from the overview, holat, debtors only", () => {
    const html = render({ filters: { q: "ali", reason: "", state: "", debtors: "1" } });
    expect(html).toContain('value="ali"');
    expect(html).toContain('aria-label="Sabab"');
    expect(html).toContain('aria-label="Holat"');
    expect(norm(html)).toContain("Faqat qarzi borlar");
    expect(html).toContain('aria-checked="true"');
  });
  it("empty: says there is nobody; with a filter set, that nothing was found; no pager", () => {
    const empty = { ...LIST, data: [], total: 0, confirmed: 0, returned: 0, pending: 0 };
    const none = render({ list: empty });
    expect(norm(none)).toContain("Bu davrda ketgan o'quvchi yo'q");
    expect(norm(none)).not.toContain("0–0");
    expect(norm(render({ list: empty, filters: { q: "zzz", reason: "", state: "", debtors: "" } }))).toContain("Hech narsa topilmadi");
  });
  it("loading draws skeleton rows, never the empty text", () => {
    const html = render({ list: undefined, loading: true });
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("Bu davrda ketgan o'quvchi yo'q");
  });
  it("a kept answer is dimmed and inert, and the pager is hidden", () => {
    const html = render({ stale: true });
    expect(html).toContain("opacity-60");
    expect(html).toContain("inert");
    expect(norm(html)).not.toContain("1–10 / 23");
  });
});
