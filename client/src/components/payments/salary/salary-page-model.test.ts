import { describe, expect, it } from "vitest";
import {
  centerLine,
  mln,
  segmentLabels,
  filterPeople,
  mergePeople,
  monthStatePill,
  netLabel,
  rowStatus,
  staffFrom,
  summaryNumbers,
} from "./salary-page-model";
import type { RowPayment } from "./salary-types";
import { paid, response, staffRow, state, teacher } from "./salary-fixture";

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

describe("mln", () => {
  it("prints millions with at most one decimal, in the uz-UZ form", () => {
    expect(mln(10_500_000)).toBe("10,5 mln");
    expect(mln(9_700_000)).toBe("9,7 mln");
    expect(mln(3_000_000)).toBe("3 mln");
    expect(mln(1_234_567)).toBe("1,2 mln");
    expect(mln(0)).toBe("0 mln");
  });
});

describe("segmentLabels", () => {
  it("counts everyone, the teachers and the staff", () => {
    expect(segmentLabels(response())).toEqual({
      all: "Hammasi · 3",
      teachers: "Ustozlar · 2",
      staff: "Xodimlar · 1",
    });
  });

  it("leaves the counts out until there is an answer — no «· 0» for a request still waiting", () => {
    expect(segmentLabels(undefined)).toEqual({ all: "Hammasi", teachers: "Ustozlar", staff: "Xodimlar" });
  });
});
