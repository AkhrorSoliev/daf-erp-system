import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { breakdownCsvRows } from "./salary-breakdown-drawer";

// A3.2: tegilgan faylda ko'rinadigan inglizcha so'z qolmaydi. Oyna matni Radix
// Sheet ichida — serverda hech narsa chizmaydi — shuning uchun jumlalar manba
// fayldan o'qiladi. CSV esa Excel'da ochiladi.

// Bo'shliqlar bitta probelga keltiriladi: JSX matni qatorga bo'lib yozilsa ham
// pin buzilmaydi.
const source = readFileSync(
  join(__dirname, "salary-breakdown-drawer.tsx"),
  "utf-8",
).replace(/\s+/g, " ");

// Manba uzun: pin buzilsa butun fayl emas, faqat o'sha joy ko'rinadi.
const around = (word: string) => source.match(new RegExp(`.{0,40}${word}.{0,40}`))?.[0];

describe("hisob-kitob oynasining jumlalari o'zbekcha", () => {
  it("bekor qilingan yozuvlar jumlasida «accrual» yo'q", () => {
    expect(source.includes("ta hisoblangan haq bekor qilingan")).toBe(true);
    expect(around("ta accrual")).toBeUndefined();
  });

  it("qo'lda kiritilgan oylik jumlasida «dars-by-dars» yo'q", () => {
    expect(
      source.includes("har bir dars bo&apos;yicha tafsilot yo&apos;q"),
    ).toBe(true);
    expect(around("dars-by-dars")).toBeUndefined();
  });
});

type Rate = { salaryType: string; value: number; scope: "GROUP" | "GLOBAL" };

function line(configVersion: Rate | null) {
  return {
    id: "a1",
    lessonDate: "2026-10-01T00:00:00.000Z",
    student: { id: 10001, firstName: "Ali", lastName: "Valiyev" },
    group: { id: "g1", name: "A1-01", course: { name: "Nemis tili" } },
    rateBasis: "cycle" as const,
    perLessonCost: 37_500,
    amount: 37_500,
    configVersion,
    reversedAt: null,
    reversalReason: null,
    reversedBy: null,
  };
}

describe("CSV Excel'da ochiladi: enum nomlari emas, o'zbekcha matn", () => {
  const cells = (rate: Rate | null) => {
    const [header, row] = breakdownCsvRows([line(rate)]);
    const cell = (name: string) => row[header.indexOf(name)];
    return {
      type: cell("Hisoblash turi"),
      value: cell("Qiymat"),
      scope: cell("Qo'llanilish doirasi"),
      all: row.join("|"),
    };
  };

  it.each([
    ["PERCENTAGE", "GLOBAL", "Foiz", "Umumiy"],
    ["FIXED_PER_STUDENT", "GROUP", "O'quvchi boshiga", "Guruh"],
    ["FIXED_MONTHLY", "GLOBAL", "Oylik", "Umumiy"],
  ] as const)("%s / %s → «%s» / «%s»", (salaryType, scope, typeName, scopeName) => {
    const c = cells({ salaryType, value: 450_000, scope });

    expect(c.type).toBe(typeName);
    expect(c.scope).toBe(scopeName);
    // Qiymat son bo'lib qoladi: Excel uni hisoblay oladi.
    expect(c.value).toBe(450_000);
    expect(c.all).not.toMatch(/[A-Z]{2,}_[A-Z_]+|GROUP|GLOBAL|PERCENTAGE/);
  });

  it("stavkasiz qatorda ikkala katak bo'sh", () => {
    const c = cells(null);

    expect(c.type).toBe("");
    expect(c.scope).toBe("");
  });
});
