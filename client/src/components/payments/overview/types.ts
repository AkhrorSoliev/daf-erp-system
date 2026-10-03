/**
 * The server shapes «Umumiy ma'lumotlar» reads. Fields that B1 added are
 * optional: the client goes live before the server (spec §7), and an older
 * server sends none of them — the page prints «—» or leaves the line out.
 */

/** «Hisoblandi / To'landi / Qoldi» — server `MonthCharges` (ADR-0058). */
export interface MonthCharges {
  month: string;
  charged: number;
  paid: number;
  unpaid: number;
  paidPct: number | null;
  students: number;
  unpaidStudents?: number;
}

export interface DebtKind {
  total: number;
  count: number;
}

/**
 * «O'qiyotganlar qarzi» and «O'qimayotganlar qarzi» — server `DebtSplit`
 * (ADR-0059, ADR-0067). Two numbers that are never added: the first is the
 * debt of students in an active group (`currentMonth` — the part up to this
 * month's bill, `older` — the rest), the second everyone else's, in three
 * kinds.
 */
export interface DebtSplit {
  studying: {
    total: number;
    count: number;
    currentMonth: number;
    older: number;
    olderCount?: number;
  };
  notStudying: {
    total: number;
    count: number;
    byKind?: { ungrouped: DebtKind; frozen: DebtKind; left: DebtKind };
  };
}

/** `GET /reports/financial-overview` — what the page reads (CEO/BD only). */
export interface FinancialOverview {
  income: {
    actual: number;
    paymentCount: number;
    byMethod: { method: string; amount: number; count: number }[];
    /** Yesterday's payments; only in the current month, null on the 1st. */
    yesterday?: { date: string; amount: number } | null;
  };
  /** Null for a month before monthly billing (2026-09). */
  monthCharges: MonthCharges | null;
  /** Today's debt — the month asked for does not change it. */
  debtSplit: DebtSplit;
  salary: {
    /** `SalaryMonthlyService.getMonthly` for the month; null when it failed. */
    computed?: {
      month: string;
      hasLessonData: boolean;
      fullDeserved?: number;
      netToPay: number;
      advances: number;
      staff?: { monthly: number; advances: number; netToPay: number };
    } | null;
  };
}

/** `GET /reports/income-month-attribution` — the cash in three parts (ADR-0067). */
export interface IncomeAttribution {
  total: number;
  currentMonth: number;
  advance?: number;
  advanceStudents?: number;
  lateTotal: number;
  late: { monthKey: string; label: string; amount: number }[];
  payerCount: number;
  paymentCount?: number;
  latePaymentCount?: number;
  lateStudentCount?: number;
}

/** `GET /reports/profit-composition` — the lines the profit card and its dialog print. */
export interface ProfitComposition {
  month: string;
  netProfit: number;
  /** `naqd` — the teacher leg fell back to cash paid (no computed salary). */
  teacherSalaryBasis?: "hisoblangan" | "naqd";
  revenue: { total: number };
  withdrawals?: { total: number };
  teachers: { total: number };
  staff: { total: number };
  expenses: { total: number };
  refunds: number;
  /** A running month only. */
  forecast: { expectedNetProfit: number } | null;
}

/** One `GET /reports/financial-trend` row; `kassa` — the canonical profit could not be computed. */
export interface TrendRow {
  monthKey: string;
  income: number;
  profit: number;
  profitBasis: "kanonik" | "kassa";
}
