import { describe, expect, it } from "vitest";
import { mln } from "@/components/payments/salary/salary-page-model";
import { dateText, emptyBranchTitle, enteredText, missingText, missingTitle, presetFor, toggleTurkum } from "./expenses-format";
import type { MissingRow } from "./expenses-types";

const row = (o: Partial<MissingRow> = {}): MissingRow => ({ key: "RENT", branchId: 2, branchName: "Shimol", amount: 17_800_000, lastMonthAmount: 17_800_000, thisMonthAmount: 0, ...o });

describe("the warning's lines (spec B6 §3.3)", () => {
  it("nothing recorded: «avgustda 17,8 mln edi»", () => {
    expect(missingText(row(), "2026-09")).toBe(`avgustda ${mln(17_800_000)} edi`);
  });
  it("part recorded: what was, and what this month holds so far; under 100 000 in full so'm", () => {
    const r = row({ key: "UTILITIES", amount: 4_630_000, lastMonthAmount: 4_700_000, thisMonthAmount: 70_000 });
    expect(missingText(r, "2026-10")).toBe(`sentabrda ${mln(4_700_000)} edi, oktabrda hozircha ${mln(70_000)}`);
    expect(mln(70_000)).toContain("so'm");
  });
  it("the name, with the branch only when the scope holds several", () => {
    expect(missingTitle(row(), false)).toBe("Ijara");
    expect(missingTitle(row({ key: "TAXES" }), true)).toBe("Soliq · Shimol");
  });
  it("an empty branch is «… filiali», never twice", () => {
    expect(emptyBranchTitle("Shimol")).toBe("Shimol filiali");
    expect(emptyBranchTitle("Shimol filiali")).toBe("Shimol filiali");
  });
});

describe("presetFor — «Yozish» fills the dialog (spec B6 §2.2, §3.3)", () => {
  it("the row's category, the missing amount, «Ijara — oktabr 2026», the row's branch", () => {
    expect(presetFor(row({ amount: 4_630_000 }), "2026-10")).toEqual({ category: "RENT", amount: 4_630_000, description: "Ijara — oktabr 2026", branchId: 2 });
    expect(presetFor(row({ key: "TAXES" }), "2026-10").category).toBe("TAXES");
  });
});

describe("toggleTurkum (spec B6 §3.4)", () => {
  it("a click picks that one category; clicking it again when alone clears", () => {
    expect(toggleTurkum([], "RENT")).toEqual(["RENT"]);
    expect(toggleTurkum(["RENT", "TAXES"], "RENT")).toEqual(["RENT"]);
    expect(toggleTurkum(["TAXES"], "RENT")).toEqual(["RENT"]);
    expect(toggleTurkum(["RENT"], "RENT")).toEqual([]);
  });
});

describe("dates", () => {
  it("the expense day is the calendar date the server sent", () => expect(dateText("2026-10-05T00:00:00.000Z")).toBe("05.10.2026"));
  it("the entry time is on the Tashkent clock", () => {
    expect(enteredText("2026-10-05T09:30:00.000Z")).toBe("05.10.2026, 14:30");
    expect(enteredText("2026-10-31T19:30:00.000Z")).toBe("01.11.2026, 00:30");
  });
});
