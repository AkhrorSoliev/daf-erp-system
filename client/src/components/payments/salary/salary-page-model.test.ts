import { describe, expect, it } from "vitest";
import {
  centerLine,
  filterPeople,
  mergePeople,
  monthStatePill,
  netLabel,
  rowStatus,
  staffFrom,
  summaryNumbers,
} from "./salary-page-model";
import type { MonthlyResponse, MonthState, RowPayment, StaffRow, TeacherRow } from "./salary-types";

// Tashkent midnight of 05.10.2026.
const PAID_AT = "2026-10-04T19:00:00.000Z";

const paid: RowPayment = { id: "pay-1", amount: 4_200_000, status: "PAID", paidAt: PAID_AT };

function teacher(over: Partial<TeacherRow> & { id: number; firstName: string }): TeacherRow {
  return {
    user: { id: over.id, firstName: over.firstName, lastName: "Karimova", isActive: true, branch: null },
    hasLessonData: true,
    isFixedMonthly: false,
    fullDeserved: 5_000_000,
    covered: 4_000_000,
    centerFunded: 1_000_000,
    carriedIn: 0,
    advances: 800_000,
    netToPay: 4_200_000,
    noConfigUnits: 0,
    groupCount: 4,
    studentCount: 38,
    payment: paid,
    ...over,
  };
}

const staffRow: StaffRow = {
  user: { id: 10003, firstName: "Dilnoza", lastName: "Rahimova", position: "Administrator", isActive: true, branch: null },
  monthly: 3_000_000,
  advances: 0,
  netToPay: 3_000_000,
  payment: null,
  coverage: { activeDays: 30, cycleDays: 30 },
};

function response(over: Partial<MonthlyResponse> = {}): MonthlyResponse {
  return {
    month: "2026-09",
    floorMonth: "2026-05",
    period: { periodStart: "2026-08-31T19:00:00.000Z", periodEnd: "2026-09-30T18:59:59.999Z", cycleStartDay: 1 },
    data: [
      teacher({ id: 10001, firstName: "Madina" }),
      teacher({ id: 10002, firstName: "Zarina", fullDeserved: 2_500_000, advances: 0, netToPay: 2_500_000, groupCount: 2, studentCount: 17, payment: null }),
    ],
    totals: {
      fullDeserved: 7_500_000,
      covered: 6_000_000,
      centerFunded: 1_500_000,
      advances: 800_000,
      advanceCount: 2,
      netToPay: 6_700_000,
      centerAdvanced: 0,
      centerRecovered: 0,
      centerStillFronted: 0,
      centerOwedByStudents: 0,
    },
    staff: [staffRow],
    staffTotals: { monthly: 3_000_000, advances: 0, advanceCount: 0, netToPay: 3_000_000 },
    monthState: { kind: "CALCULATED", paidCount: 0, payableCount: 2 },
    attention: { lessonsWithoutRate: [], staffWithoutRate: [] },
    ...over,
  };
}

const state = (kind: MonthState["kind"], paidCount = 0, payableCount = 0): MonthState => ({
  kind,
  paidCount,
  payableCount,
});

describe("mergePeople", () => {
  const rows = mergePeople(response());

  it("lists the teachers in server order, then the staff", () => {
    expect(rows.map((r) => [r.kind, r.userId])).toEqual([
      ["teacher", 10001],
      ["teacher", 10002],
      ["staff", 10003],
    ]);
  });

  it("describes a teacher by groups and students, and calls them «Ustoz»", () => {
    expect(rows[0]).toMatchObject({
      name: "Madina Karimova",
      role: "Ustoz",
      from: "4 guruh · 38 o'quvchi",
      worked: 5_000_000,
      advances: 800_000,
      net: 4_200_000,
      payment: paid,
    });
  });

  it("shows a dash instead of «0 guruh» for a month without lesson data", () => {
    const [row] = mergePeople(
      response({ data: [teacher({ id: 10001, firstName: "Madina", hasLessonData: false, fullDeserved: null, groupCount: 0, studentCount: 0 })] }),
    );
    expect(row.from).toBe("—");
    expect(row.worked).toBeNull();
  });

  it("calls a staff member by position, «Xodim» without one, worked = monthly", () => {
    expect(rows[2]).toMatchObject({
      name: "Dilnoza Rahimova",
      role: "Administrator",
      from: "qat'iy oylik",
      worked: 3_000_000,
      net: 3_000_000,
      payment: null,
    });
    const [noPosition] = mergePeople(
      response({ data: [], staff: [{ ...staffRow, user: { ...staffRow.user, position: null } }] }),
    );
    expect(noPosition.role).toBe("Xodim");
  });
});

describe("staffFrom", () => {
  it("adds the days only when the salary was on for part of the period", () => {
    expect(staffFrom({ ...staffRow, coverage: { activeDays: 23, cycleDays: 30 } })).toBe("qat'iy oylik · 23/30 kun");
    expect(staffFrom({ ...staffRow, coverage: { activeDays: 30, cycleDays: 30 } })).toBe("qat'iy oylik");
  });

  it("ignores a coverage of 0 days (a row that exists only for its payment) and a missing one", () => {
    expect(staffFrom({ ...staffRow, coverage: { activeDays: 0, cycleDays: 30 } })).toBe("qat'iy oylik");
    expect(staffFrom({ ...staffRow, coverage: undefined })).toBe("qat'iy oylik");
  });
});

describe("filterPeople", () => {
  const rows = mergePeople(response());

  it("keeps everyone, only teachers or only staff", () => {
    expect(filterPeople(rows, "all")).toHaveLength(3);
    expect(filterPeople(rows, "teachers").map((r) => r.userId)).toEqual([10001, 10002]);
    expect(filterPeople(rows, "staff").map((r) => r.userId)).toEqual([10003]);
  });
});

describe("monthStatePill", () => {
  it("an open month names the last day it is calculated after", () => {
    expect(monthStatePill(state("OPEN"), "2026-09")).toEqual({
      text: "Oy davom etmoqda · 30.09 dan keyin hisoblanadi",
      tone: "muted",
    });
    expect(monthStatePill(state("OPEN"), "2027-02").text).toBe("Oy davom etmoqda · 28.02 dan keyin hisoblanadi");
  });

  it("one pill per state", () => {
    expect(monthStatePill(state("NOT_CALCULATED"), "2026-09")).toEqual({ text: "Hisoblanmagan", tone: "muted" });
    expect(monthStatePill(state("CALCULATED", 0, 3), "2026-09")).toEqual({
      text: "Hisoblandi · tasdiqlash kutilmoqda",
      tone: "amber",
    });
    expect(monthStatePill(state("APPROVED", 0, 3), "2026-09")).toEqual({
      text: "Tasdiqlandi · berish kutilmoqda",
      tone: "blue",
    });
    expect(monthStatePill(state("PARTLY_PAID", 12, 22), "2026-09")).toEqual({
      text: "Qisman berildi · 12 / 22",
      tone: "blue",
    });
    expect(monthStatePill(state("PAID", 22, 22), "2026-09")).toEqual({ text: "Berildi", tone: "green" });
  });
});

describe("rowStatus", () => {
  const withStatus = (status: RowPayment["status"]): RowPayment => ({ ...paid, status });

  it("an open month stays «oy davom etmoqda», even with a payment", () => {
    expect(rowStatus(null, "OPEN")).toEqual({ text: "oy davom etmoqda", tone: "muted" });
    expect(rowStatus(paid, "OPEN")).toEqual({ text: "oy davom etmoqda", tone: "muted" });
  });

  it("a past month without a payment is «hisoblanmagan»", () => {
    expect(rowStatus(null, "NOT_CALCULATED")).toEqual({ text: "hisoblanmagan", tone: "muted" });
  });

  it("follows the payment's status", () => {
    expect(rowStatus(withStatus("CALCULATED"), "CALCULATED")).toEqual({ text: "hisoblandi", tone: "amber" });
    expect(rowStatus(withStatus("APPROVED"), "APPROVED")).toEqual({ text: "tasdiqlandi", tone: "blue" });
    expect(rowStatus(paid, "PARTLY_PAID")).toEqual({ text: "berildi 05.10", tone: "green" });
  });

  it("reads the paid day on the Tashkent clock, not the UTC one", () => {
    expect(rowStatus({ ...paid, paidAt: "2026-10-05T20:00:00.000Z" }, "PAID").text).toBe("berildi 06.10");
  });

  it("a paid row without a date is just «berildi»; a cancelled payment counts as none", () => {
    expect(rowStatus({ ...paid, paidAt: null }, "PAID")).toEqual({ text: "berildi", tone: "green" });
    expect(rowStatus(withStatus("CANCELLED"), "NOT_CALCULATED")).toEqual({ text: "hisoblanmagan", tone: "muted" });
  });
});

describe("summaryNumbers", () => {
  it("adds the staff's monthly pay to the teachers' full deserved pay", () => {
    expect(summaryNumbers(response())).toEqual({
      worked: 10_500_000,
      teachersWorked: 7_500_000,
      staffWorked: 3_000_000,
      advances: 800_000,
      advanceCount: 2,
      net: 9_700_000,
      teacherCount: 2,
      staffCount: 1,
    });
  });

  it("has no teachers' figure (and so no total) while no teacher has lesson data", () => {
    const manual = response({
      data: [teacher({ id: 10001, firstName: "Madina", hasLessonData: false, fullDeserved: null })],
      totals: { ...response().totals, fullDeserved: 0 },
    });
    expect(summaryNumbers(manual)).toMatchObject({ worked: null, teachersWorked: null, staffWorked: 3_000_000, teacherCount: 1 });
  });

  it("a scope without teachers is not a month without lesson data", () => {
    const staffOnly = response({ data: [], totals: { ...response().totals, fullDeserved: 0, advances: 0, advanceCount: 0, netToPay: 0 } });
    expect(summaryNumbers(staffOnly)).toMatchObject({ worked: 3_000_000, teachersWorked: 0, teacherCount: 0 });
  });
});

describe("netLabel", () => {
  it("an open month is paid at its end", () => {
    expect(netLabel(state("OPEN"))).toEqual({ label: "Oy oxirida beriladi", sub: null });
  });

  it("a partly paid month says how many are done and how many are left", () => {
    expect(netLabel(state("PARTLY_PAID", 12, 22))).toEqual({
      label: "Beriladi",
      sub: "12 kishiga berildi · 10 kishi qoldi",
    });
  });

  it("any other state has no sub-line of its own", () => {
    for (const kind of ["NOT_CALCULATED", "CALCULATED", "APPROVED", "PAID"] as const) {
      expect(netLabel(state(kind, 0, 3))).toEqual({ label: "Beriladi", sub: null });
    }
  });
});

describe("centerLine", () => {
  it("names what the center put in and the month the students have not paid for", () => {
    expect(centerLine(response())).toEqual({
      amount: 1_500_000,
      note: "o'quvchilar sentabr to'lovini hali to'lamagan; to'lagan sari kamayadi",
    });
    expect(centerLine(response({ month: "2026-10" }))?.note).toContain("oktabr to'lovini");
  });

  it("is hidden when the center put in nothing", () => {
    expect(centerLine(response({ totals: { ...response().totals, centerFunded: 0 } }))).toBeNull();
  });

  it("is hidden for a month without lesson data", () => {
    const manual = response({ data: [teacher({ id: 10001, firstName: "Madina", hasLessonData: false })] });
    expect(centerLine(manual)).toBeNull();
  });
});
