import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import type { AdvanceRow } from "../salary-advances-tab";
import { SalaryAdvancesTable } from "./salary-advances-table";

// Static markup in the node environment (no DOM), as salary-oyliklar.test.ts.
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replaceAll("&#x27;", "'").replaceAll("&quot;", '"');

function advance(over: Partial<AdvanceRow> & { id: string; date: string }): AdvanceRow {
  return {
    amount: 500_000,
    paymentMethod: "CASH",
    description: "",
    createdAt: `${over.date}T08:00:00.000Z`,
    settled: false,
    settledPeriodStart: null,
    settledPeriodEnd: null,
    deductMonth: over.date.slice(0, 7),
    user: { id: 10001, firstName: "Madina", lastName: "Karimova", roles: [{ id: 4, name: "Teacher" }] },
    createdBy: { id: 10009, firstName: "Sardor", lastName: "Aliyev" },
    ...over,
  };
}

// Handed over in September and taken from September's pay; one given on 3 October, still waiting.
const settled = advance({ id: "a1", date: "2026-09-12", settled: true, deductMonth: "2026-09", amount: 800_000 });
const unsettled = advance({
  id: "a2",
  date: "2026-10-03",
  deductMonth: "2026-10",
  paymentMethod: "CARD",
  amount: 300_000,
  user: { id: 10002, firstName: "Zarina", lastName: "Rahimova", roles: [{ id: 4, name: "Teacher" }] },
  createdBy: null,
});

const render = (advances: AdvanceRow[]) => html(createElement(SalaryAdvancesTable, { advances }));

describe("SalaryAdvancesTable", () => {
  it("has the six columns after the # column, in order", () => {
    const out = render([settled, unsettled]);
    const heads = [...out.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(heads).toEqual(["#", "Sana", "Kimga", "Summa", "Naqd / karta", "Kim berdi", "Holat"]);
    expect(out).toMatch(/<th[^>]*border-r[^>]*>#<\/th>/);
  });

  it("says which month's salary each advance is taken from", () => {
    const out = render([settled, unsettled]);
    expect(out).toContain("sentabr oyligidan ushlangan");
    expect(out).toContain("oktabr oyligidan ushlanadi");
  });

  it("lists the newest first, numbered from 1, whatever order it was given", () => {
    const out = render([settled, unsettled]);
    expect(out.indexOf("03.10.2026")).toBeGreaterThan(-1);
    expect(out.indexOf("03.10.2026")).toBeLessThan(out.indexOf("12.09.2026"));
    expect(out.indexOf("Zarina Rahimova")).toBeLessThan(out.indexOf("Madina Karimova"));
    expect(out).toMatch(/<td[^>]*border-r[^>]*>1<\/td>/);
    expect(out).toMatch(/<td[^>]*border-r[^>]*>2<\/td>/);
  });

  it("shows the amount, the method and who gave it (a dash when unknown)", () => {
    const out = render([settled, unsettled]);
    expect(out).toContain(formatPrice(800_000));
    expect(out).toContain("Naqd");
    expect(out).toContain("Karta");
    expect(out).toContain("Sardor Aliyev");
    expect(out).toContain(">—<");
  });

  it("carries the footnote under the table", () => {
    const out = render([settled]);
    expect(out).toContain("Avans berilgan oyining oyligidan ushlanadi.");
    expect(out.indexOf("</table>")).toBeLessThan(out.indexOf("Avans berilgan oyining oyligidan ushlanadi."));
  });

  it("pages ten rows at a time", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      advance({ id: `n${i}`, date: `2026-10-${String(i + 1).padStart(2, "0")}` }),
    );
    const out = render(many);
    // Newest first: days 12 down to 3 on page one; the 1st and 2nd wait on page two.
    expect(out).toContain("12.10.2026");
    expect(out).toContain("03.10.2026");
    expect(out).not.toContain("02.10.2026");
    expect(out).toContain("1 / 2");
    expect(out).toContain("Jami: 12 ta yozuv");
    expect(out.match(/<tbody[\s\S]*<\/tbody>/)![0].match(/<tr/g)).toHaveLength(10);
  });
});
