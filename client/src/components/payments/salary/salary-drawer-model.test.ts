import { describe, expect, it } from "vitest";
import {
  advanceAheadNote,
  calcLines,
  csvFromLessons,
  drawerButtons,
  drawerHint,
  drawerTotalLabel,
  payoutLines,
  rateText,
  splitLine,
} from "./salary-drawer-model";
import type { BreakdownLine, RowPayment, SalaryDetail, StaffRow, TeacherRow } from "./salary-types";
import { staffRow, teacher } from "./salary-fixture";

// Intl writes a no-break space between thousands; the expectations use a plain one.
const plain = (s: string | null) => s?.replace(/ /g, " ") ?? null;

const pay = (status: RowPayment["status"], amount = 7_840_000): RowPayment => ({
  id: "pay-1",
  amount,
  status,
  paidAt: null,
});

function detail(row: TeacherRow | StaffRow, over: Partial<SalaryDetail> = {}): SalaryDetail {
  return {
    month: "2026-09",
    period: { periodStart: "2026-08-31T19:00:00.000Z", periodEnd: "2026-09-30T18:59:59.999Z", cycleStartDay: 1 },
    kind: "fullDeserved" in row ? "teacher" : "staff",
    row,
    afterCalcDiff: null,
    payout: null,
    cashAccounts: [],
    payeeBranchMissing: false,
    ...over,
  };
}

const madina = (over: Partial<TeacherRow> = {}) =>
  teacher({
    id: 10001,
    firstName: "Madina",
    fullDeserved: 9_840_000,
    covered: 8_120_000,
    centerFunded: 1_720_000,
    advances: 2_000_000,
    netToPay: 7_840_000,
    payment: null,
    ...over,
  });

describe("rateText", () => {
  it("names a percentage rate", () => {
    expect(rateText({ salaryType: "PERCENTAGE", value: 45 }, "teacher")).toBe("Foiz: o'quvchi to'lovining 45%");
  });

  it("names a per-student rate by the month", () => {
    expect(plain(rateText({ salaryType: "FIXED_PER_STUDENT", value: 200_000 }, "teacher", undefined, "2026-09"))).toBe(
      "Har o'quvchi uchun oyiga 200 000 so'm",
    );
  });

  it("names a per-student rate by the cycle in a month before monthly billing", () => {
    expect(plain(rateText({ salaryType: "FIXED_PER_STUDENT", value: 200_000 }, "teacher", undefined, "2026-08"))).toBe(
      "Har o'quvchi uchun tsikliga 200 000 so'm",
    );
  });

  it("adds the days to a fixed salary on for part of the month only", () => {
    const rate = { salaryType: "FIXED_MONTHLY", value: 1_500_000 } as const;
    expect(plain(rateText(rate, "staff", { activeDays: 22, cycleDays: 30 }))).toBe(
      "Oyiga 1 500 000 so'm; oyning 30 kunidan 22 tasi",
    );
    expect(plain(rateText(rate, "staff", { activeDays: 30, cycleDays: 30 }))).toBe("Oyiga 1 500 000 so'm");
    // A row that exists only for its payment has 0 days, not a 0-day salary.
    expect(plain(rateText(rate, "staff", { activeDays: 0, cycleDays: 30 }))).toBe("Oyiga 1 500 000 so'm");
  });

  it("sends a teacher without a general rate to the groups, and says a staff member has none", () => {
    expect(rateText(null, "teacher")).toBe("Guruhlar bo'yicha — pastda");
    expect(rateText(undefined, "teacher")).toBe("Guruhlar bo'yicha — pastda");
    expect(rateText(null, "staff")).toBe("Stavka qo'yilmagan");
  });
});

describe("drawerTotalLabel", () => {
  it("follows the month, then the payment", () => {
    expect(drawerTotalLabel("OPEN", null)).toBe("Oy oxirida beriladi");
    expect(drawerTotalLabel("PARTLY_PAID", pay("PAID"))).toBe("Berildi");
    expect(drawerTotalLabel("CALCULATED", pay("CALCULATED"))).toBe("Beriladi");
    expect(drawerTotalLabel("NOT_CALCULATED", null)).toBe("Beriladi");
  });
});

describe("drawerHint", () => {
  it("says what opens the buttons, per state", () => {
    expect(drawerHint("OPEN", null, "2026-09")).toBe(
      "Tasdiqlash va «Berildi» — oy hisoblangach (1-oktabr) ochiladi.",
    );
    expect(drawerHint("NOT_CALCULATED", null, "2026-09")).toBe("Bu oy uchun oylik hisoblanmagan.");
    expect(drawerHint("NOT_CALCULATED", pay("CANCELLED"), "2026-09")).toBe("Bu oy uchun oylik hisoblanmagan.");
    expect(drawerHint("CALCULATED", pay("CALCULATED"), "2026-09")).toBe(
      "Avval CEO tasdiqlaydi, keyin «Berildi» ochiladi.",
    );
    expect(drawerHint("APPROVED", pay("APPROVED"), "2026-09")).toBe("«Berildi» — CEO yoki filial direktori.");
    expect(drawerHint("PAID", pay("PAID"), "2026-09")).toBe("Berilgan oylik o'zgartirilmaydi.");
  });

  it("names the month after December as January", () => {
    expect(drawerHint("OPEN", null, "2026-12")).toBe(
      "Tasdiqlash va «Berildi» — oy hisoblangach (1-yanvar) ochiladi.",
    );
  });
});

describe("calcLines", () => {
  it("closes «Ishladi − Avans = Beriladi» in an open month", () => {
    expect(calcLines(detail(madina()))).toEqual([
      { label: "Ishladi", value: 9_840_000, sign: "+" },
      { label: "Avans (ushlanadi)", value: 2_000_000, sign: "-" },
      { label: "Beriladi", value: 7_840_000, sign: "=" },
    ]);
  });

  it("closes on the frozen payment when the data changed after the cron", () => {
    const row = madina({ netToPay: 7_790_000, payment: pay("CALCULATED", 7_790_000) });
    expect(calcLines(detail(row, { afterCalcDiff: -50_000 }))).toEqual([
      { label: "Ishladi", value: 9_840_000, sign: "+" },
      { label: "Avans (ushlanadi)", value: 2_000_000, sign: "-" },
      { label: "Hisoblangandan keyin o'zgardi", value: -50_000, sign: "±" },
      { label: "Beriladi", value: 7_790_000, sign: "=" },
    ]);
  });

  it("shows the change in a month before full pay too (the server's «Ishladi» is the pay base there)", () => {
    const row = madina({ fullDeserved: 8_120_000, centerFunded: 0, netToPay: 6_070_000, payment: pay("PAID", 6_070_000) });
    const lines = calcLines(detail(row, { month: "2026-06", afterCalcDiff: -50_000 }));
    expect(lines).toEqual([
      { label: "Ishladi", value: 8_120_000, sign: "+" },
      { label: "Avans (ushlanadi)", value: 2_000_000, sign: "-" },
      { label: "Hisoblangandan keyin o'zgardi", value: -50_000, sign: "±" },
      { label: "Beriladi", value: 6_070_000, sign: "=" },
    ]); // 8 120 000 − 2 000 000 − 50 000 = 6 070 000: the equation closes.
  });

  it("shows a staff member's change too", () => {
    const row: StaffRow = { ...staffRow, netToPay: 3_100_000, payment: pay("CALCULATED", 3_100_000) };
    expect(calcLines(detail(row, { afterCalcDiff: 100_000 })).map((l) => l.sign)).toEqual(["+", "-", "±", "="]);
  });

  it("shows no change line for a zero difference", () => {
    const row = madina({ payment: pay("CALCULATED") });
    expect(calcLines(detail(row, { afterCalcDiff: 0 })).map((l) => l.sign)).toEqual(["+", "-", "="]);
  });

  it("takes a staff member's «Ishladi» from the monthly salary", () => {
    const row: StaffRow = { ...staffRow, advances: 500_000, netToPay: 2_500_000 };
    expect(calcLines(detail(row))).toEqual([
      { label: "Ishladi", value: 3_000_000, sign: "+" },
      { label: "Avans (ushlanadi)", value: 500_000, sign: "-" },
      { label: "Beriladi", value: 2_500_000, sign: "=" },
    ]);
  });

  it("leaves «Ishladi» out for a month without lesson data", () => {
    const row = madina({ hasLessonData: false, fullDeserved: null, covered: null, centerFunded: null });
    expect(calcLines(detail(row)).map((l) => l.label)).toEqual(["Avans (ushlanadi)", "Beriladi"]);
  });
});

describe("advanceAheadNote", () => {
  const note = "Avans hozircha ishlanganidan ko'p — qolgani oy oxirigacha ishlanganidan ushlanadi.";

  it("explains a 0 «Beriladi» when the advances outrun the earnings so far", () => {
    const row = madina({ fullDeserved: 1_500_000, advances: 2_000_000, netToPay: 0 });
    expect(advanceAheadNote(detail(row))).toBe(note);
  });

  it("says nothing when the earnings cover the advances, or once a payment exists", () => {
    expect(advanceAheadNote(detail(madina()))).toBeNull();
    expect(advanceAheadNote(detail(madina({ fullDeserved: 2_000_000, netToPay: 0 })))).toBeNull();
    const calculated = madina({ fullDeserved: 1_500_000, netToPay: 0, payment: pay("CALCULATED", 0) });
    expect(advanceAheadNote(detail(calculated))).toBeNull();
  });

  it("says nothing without lesson data", () => {
    const row = madina({ hasLessonData: false, fullDeserved: null, covered: null, centerFunded: null });
    expect(advanceAheadNote(detail(row))).toBeNull();
  });
});

describe("drawerButtons", () => {
  it("draws both shut in the open month", () => {
    expect(drawerButtons("OPEN", null, true, true)).toEqual({ approve: "disabled", pay: "disabled" });
  });

  it("opens «Tasdiqlash» for a calculated payment, «Berildi» still shut", () => {
    expect(drawerButtons("CALCULATED", pay("CALCULATED"), true, true)).toEqual({ approve: "enabled", pay: "disabled" });
  });

  it("opens «Berildi» for an approved payment; «Tasdiqlash» is behind it", () => {
    expect(drawerButtons("APPROVED", pay("APPROVED"), true, true)).toEqual({ approve: null, pay: "enabled" });
  });

  it("draws neither for a paid month, a month with no payment, or a cancelled one", () => {
    expect(drawerButtons("PAID", pay("PAID"), true, true)).toEqual({ approve: null, pay: null });
    expect(drawerButtons("NOT_CALCULATED", null, true, true)).toEqual({ approve: null, pay: null });
    expect(drawerButtons("CALCULATED", pay("CANCELLED"), true, true)).toEqual({ approve: null, pay: null });
  });

  it("never draws a button the viewer has no capability for", () => {
    expect(drawerButtons("OPEN", null, false, false)).toEqual({ approve: null, pay: null });
    expect(drawerButtons("CALCULATED", pay("CALCULATED"), false, true)).toEqual({ approve: null, pay: "disabled" });
    expect(drawerButtons("APPROVED", pay("APPROVED"), true, false)).toEqual({ approve: null, pay: null });
  });
});

describe("splitLine", () => {
  it("splits the pay into the students' money and the center's", () => {
    expect(plain(splitLine(madina()))).toBe(
      "shundan o'quvchilar to'lagan 8 120 000 · markaz qo'shdi 1 720 000 (o'quvchilar hali to'lamagan)",
    );
  });

  it("says the students paid it all when the center added nothing", () => {
    expect(splitLine(madina({ centerFunded: 0 }))).toBe("hammasini o'quvchilar to'lagan");
  });

  it("has nothing to say for a month without lesson data", () => {
    expect(splitLine(madina({ hasLessonData: false, fullDeserved: null, covered: null, centerFunded: null }))).toBeNull();
  });
});

describe("payoutLines", () => {
  it("dates the handover on the Tashkent day and names each slice's account", () => {
    const out = payoutLines({
      // 04.10 19:30 UTC is 05.10 in Tashkent.
      paidAt: "2026-10-04T19:30:00.000Z",
      paidBy: { id: 10009, firstName: "Aziz", lastName: "Qodirov" },
      slices: [
        { amount: 5_000_000, accountName: "Asosiy kassa", accountType: "CASH" },
        { amount: 2_840_000, accountName: "Korporativ karta", accountType: "CARD" },
      ],
    });
    expect(out.title).toBe("Berildi 05.10.2026");
    expect(out.slices.map(plain)).toEqual(["naqd 5 000 000 — Asosiy kassa", "karta 2 840 000 — Korporativ karta"]);
    expect(out.by).toBe("Kim belgiladi: Aziz Qodirov");
  });

  it("reads «Berildi» alone without a day and leaves out who when unknown", () => {
    expect(payoutLines({ paidAt: null, paidBy: null, slices: [] })).toEqual({ title: "Berildi", slices: [], by: null });
  });
});

type Rate = { salaryType: string; value: number; scope: "GROUP" | "GLOBAL" };

function line(configVersion: Rate | null, over: Partial<BreakdownLine> = {}): BreakdownLine {
  return {
    lessonDate: "2026-10-01T00:00:00.000Z",
    student: { firstName: "Ali", lastName: "Valiyev" },
    group: { name: "A1-01", course: { name: "Nemis tili" } },
    perLessonCost: 37_500,
    amount: 37_500,
    configVersion,
    reversedAt: null,
    reversalReason: null,
    ...over,
  };
}

describe("csvFromLessons", () => {
  const rows = (csv: string) => csv.slice(1).split("\n").map((r) => r.split(","));

  it("starts with a BOM so Excel reads the Uzbek letters", () => {
    expect(csvFromLessons([]).startsWith("﻿")).toBe(true);
  });

  it("keeps the old drawer's columns", () => {
    expect(rows(csvFromLessons([]))[0]).toEqual([
      "Sana",
      "O'quvchi",
      "Guruh",
      "Kurs",
      "Dars narxi",
      "Hisoblash turi",
      "Qiymat",
      "Qo'llanilish doirasi",
      "Summa",
      "Bekor qilingan",
      "Bekor qilingan sabab",
    ]);
  });

  it.each([
    ["PERCENTAGE", "GLOBAL", "Foiz", "Umumiy"],
    ["FIXED_PER_STUDENT", "GROUP", "O'quvchi boshiga", "Guruh"],
    ["FIXED_MONTHLY", "GLOBAL", "Oylik", "Umumiy"],
  ] as const)("writes %s / %s as «%s» / «%s», never the enum", (salaryType, scope, typeName, scopeName) => {
    const [header, row] = rows(csvFromLessons([line({ salaryType, value: 450_000, scope })]));
    const cell = (name: string) => row[header.indexOf(name)];
    expect(cell("Sana")).toBe("2026-10-01");
    expect(cell("Hisoblash turi")).toBe(typeName);
    expect(cell("Qo'llanilish doirasi")).toBe(scopeName);
    expect(cell("Qiymat")).toBe("450000");
    expect(row.join("|")).not.toMatch(/[A-Z]{2,}_[A-Z_]+|GROUP|GLOBAL|PERCENTAGE/);
  });

  it("leaves the rate cells empty for a line without a rate, and marks a reversed one", () => {
    const [header, row] = rows(
      csvFromLessons([line(null, { reversedAt: "2026-10-02T00:00:00.000Z", reversalReason: "Dars bekor" })]),
    );
    const cell = (name: string) => row[header.indexOf(name)];
    expect(cell("Hisoblash turi")).toBe("");
    expect(cell("Qo'llanilish doirasi")).toBe("");
    expect(cell("Bekor qilingan")).toBe("ha");
    expect(cell("Bekor qilingan sabab")).toBe("Dars bekor");
  });

  it("neutralises a cell Excel would read as a formula (names come from Telegram)", () => {
    const [header, row] = rows(
      csvFromLessons([line(null, { student: { firstName: "=HYPERLINK(1)", lastName: "Valiyev" } })]),
    );
    expect(row[header.indexOf("O'quvchi")]).toBe("'=HYPERLINK(1) Valiyev");
    expect(row[header.indexOf("Summa")]).toBe("37500");
  });

  it("quotes a cell that holds a comma", () => {
    const csv = csvFromLessons([line(null, { group: { name: "A1, kechki", course: { name: "Nemis tili" } } })]);
    expect(csv).toContain('"A1, kechki"');
  });
});
