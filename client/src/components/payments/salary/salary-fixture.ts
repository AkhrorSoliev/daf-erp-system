import type { MonthlyResponse, MonthState, RowPayment, StaffRow, TeacherRow } from "./salary-types";

// Test data for the salary page's model and component tests. Invented names,
// ids and amounts only (the repository is public).

/** Tashkent midnight of 05.10.2026. */
export const PAID_AT = "2026-10-04T19:00:00.000Z";

export const paid: RowPayment = { id: "pay-1", amount: 4_200_000, status: "PAID", paidAt: PAID_AT };

export function teacher(over: Partial<TeacherRow> & { id: number; firstName: string }): TeacherRow {
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

export const staffRow: StaffRow = {
  user: { id: 10003, firstName: "Dilnoza", lastName: "Rahimova", position: "Administrator", isActive: true, branch: null },
  monthly: 3_000_000,
  advances: 0,
  netToPay: 3_000_000,
  payment: null,
  coverage: { activeDays: 30, cycleDays: 30 },
};

export function response(over: Partial<MonthlyResponse> = {}): MonthlyResponse {
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

export const state = (kind: MonthState["kind"], paidCount = 0, payableCount = 0): MonthState => ({
  kind,
  paidCount,
  payableCount,
});
