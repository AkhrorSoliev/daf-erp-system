// The /salary/monthly and /salary/monthly/user/:userId/detail answers, as the
// server sends them (SalaryMonthlyService, SalaryMonthlyStaffService,
// SalaryMonthlyDetailService). Dates arrive as ISO strings.

export type MonthStateKind =
  | "OPEN"
  | "NOT_CALCULATED"
  | "CALCULATED"
  | "APPROVED"
  | "PARTLY_PAID"
  | "PAID";

/** `payableCount` = rows that have a payment. */
export interface MonthState {
  kind: MonthStateKind;
  paidCount: number;
  payableCount: number;
}

export type SalaryPaymentStatus = "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED";

export interface RowPayment {
  id: string;
  amount: number;
  status: SalaryPaymentStatus;
  paidAt: string | null;
}

export interface RateRef {
  salaryType: "PERCENTAGE" | "FIXED_PER_STUDENT" | "FIXED_MONTHLY";
  value: number;
}

export interface AdvanceItem {
  id: string;
  date: string;
  amount: number;
  paymentMethod: "CASH" | "CARD";
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

export interface GroupBucket {
  groupId: string;
  name: string;
  students: number;
  lessons: number;
  amount: number;
  rate: RateRef | null;
}

export interface TeacherRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    isActive: boolean;
    branch: { id: number; name: string } | null;
  };
  hasLessonData: boolean;
  isFixedMonthly: boolean;
  fullDeserved: number | null;
  covered: number | null;
  centerFunded: number | null;
  carriedIn: number;
  advances: number;
  netToPay: number;
  noConfigUnits: number;
  groupCount: number;
  studentCount: number;
  payment: RowPayment | null;
  /** Single-user calls only (the row drawer). */
  groups?: GroupBucket[];
  advanceItems?: AdvanceItem[];
  rate?: RateRef | null;
}

/** The CEO's manual figure for a staff member's pay in one month (ADR-0112). */
export interface StaffAdjustment {
  amount: number;
  reason: string;
  by: { id: number; firstName: string; lastName: string } | null;
  /** ISO instant of the save. */
  at: string;
}

export interface StaffRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    position: string | null;
    isActive: boolean;
    branch: { id: number; name: string } | null;
  };
  monthly: number;
  /** The formula's figure; `monthly` is the CEO's figure when `adjustment` is set. */
  calculated?: number;
  adjustment?: StaffAdjustment | null;
  advances: number;
  netToPay: number;
  payment: RowPayment | null;
  rate?: RateRef | null;
  /** Days the salary is on, of the period's days. */
  coverage?: { activeDays: number; cycleDays: number };
  advanceItems?: AdvanceItem[];
}

export interface MonthlyResponse {
  month: string;
  floorMonth: string;
  period: { periodStart: string; periodEnd: string; cycleStartDay: number };
  data: TeacherRow[];
  totals: {
    fullDeserved: number;
    covered: number;
    centerFunded: number;
    advances: number;
    advanceCount: number;
    netToPay: number;
    centerAdvanced: number;
    centerRecovered: number;
    centerStillFronted: number;
    centerOwedByStudents: number;
  };
  staff: StaffRow[];
  staffTotals: { monthly: number; advances: number; advanceCount: number; netToPay: number };
  monthState: MonthState;
  attention: {
    lessonsWithoutRate: { userId: number; firstName: string; lastName: string; units: number }[];
    staffWithoutRate: { userId: number; firstName: string; lastName: string }[];
  };
}

/**
 * One accrual of `GET /salary/payments/:id/breakdown` and
 * `GET /salary/monthly/user/:userId/lessons` — the fields the drawer's CSV
 * writes (the server sends more). `lessonDate` is a `@db.Date`.
 */
export interface BreakdownLine {
  lessonDate: string;
  student: { firstName: string; lastName: string };
  group: { name: string; course: { name: string } };
  perLessonCost: number;
  amount: number;
  configVersion: { salaryType: string; value: number; scope: "GROUP" | "GLOBAL" } | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface SalaryDetail {
  month: string;
  period: MonthlyResponse["period"];
  kind: "teacher" | "staff";
  row: TeacherRow | StaffRow;
  afterCalcDiff: number | null;
  payout: {
    paidAt: string | null;
    paidBy: { id: number; firstName: string; lastName: string } | null;
    slices: { amount: number; accountName: string; accountType: "CASH" | "BANK" | "CARD" }[];
  } | null;
  cashAccounts: { id: string; name: string; type: "CASH" | "BANK" | "CARD" }[];
  payeeBranchMissing: boolean;
}
