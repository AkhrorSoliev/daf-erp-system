import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATABLE_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_HINT_LABELS, EXPENSE_METHOD_LABELS, RECURRING_LABELS } from "./expenses-labels";

// The client used to know 5 of the 8 categories, so tax went under «Boshqa» (spec B6 §1).
const SCHEMA = join(__dirname, "../../../../../server/prisma/schema.prisma");
function serverCategories(): string[] {
  const block = readFileSync(SCHEMA, "utf8").match(/enum ExpenseCategory \{([^}]*)\}/);
  if (!block) throw new Error("enum ExpenseCategory not found in schema.prisma");
  return block[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

describe("expense labels (spec B6 §3.7, §4.4)", () => {
  it("the nine categories are the server's, without the advance, in its order", () => {
    expect([...EXPENSE_CATEGORIES]).toEqual(serverCategories().filter((c) => c !== "TEACHER_ADVANCE"));
  });
  it("every category has its Uzbek label", () => {
    expect(Object.keys(EXPENSE_CATEGORY_LABELS)).toEqual([...EXPENSE_CATEGORIES]);
    expect(EXPENSE_CATEGORY_LABELS.TAXES).toBe("Soliqlar");
    expect(EXPENSE_CATEGORY_LABELS.EQUIPMENT).toBe("Jihozlar");
    expect(EXPENSE_CATEGORY_LABELS.MAINTENANCE).toBe("Ta'mirlash");
    expect(EXPENSE_CATEGORY_LABELS.BANK_FEES).toBe("Bank xizmati");
  });
  it("a bank fee is shown and filtered, but «Xarajat qo'shish» does not offer it", () => {
    expect(EXPENSE_CATEGORIES).toContain("BANK_FEES");
    expect(CREATABLE_EXPENSE_CATEGORIES).not.toContain("BANK_FEES");
    expect(CREATABLE_EXPENSE_CATEGORIES).toEqual(EXPENSE_CATEGORIES.filter((c) => c !== "BANK_FEES"));
  });
  it("cash is «Naqd», never «Naqt»", () => {
    expect(EXPENSE_METHOD_LABELS).toEqual({ CASH: "Naqd", CARD: "Karta" });
  });
  it("the three hint texts and the warning's names", () => {
    expect(EXPENSE_HINT_LABELS).toEqual({ SALARY: "Xodimlar oyligida ham bormi?", EQUIPMENT: "Jihozlar turkumi emasmi?", UTILITIES: "Kommunal turkumi emasmi?" });
    expect(RECURRING_LABELS).toEqual({ RENT: "Ijara", UTILITIES: "Kommunal", TAXES: "Soliq" });
  });
});
