/** Shared shapes for the /payments/debt-history page. Mirrors the API. */

export type DebtStatusFilter = "all" | "active" | "inactive";

export interface DebtMonth {
  monthKey: string;
  label: string;
  isCurrent: boolean;

  /** Debt this month created — the month's own figure, whatever happened
   *  after. */
  monthDebt: number;
  monthDebtorCount: number;
  monthShare: number;
  /** Of `monthDebt`, still unpaid today. */
  monthUnpaid: number;

  /** Today's debt that arose in THIS month and is still unpaid. */
  agedDebt: number;
  agedDebtorCount: number;
  agedShare: number;

  // Roll-forward: opening + added − paid − forgiven − other = closing.
  openingDebt: number;
  debtAdded: number;
  debtPaid: number;
  debtForgiven: number;
  debtOther: number;
  closingDebt: number;
  delta: number;

  // Cohort — never sum these across months.
  debtorCount: number;
  recovered: number;
  writtenOff: number;
  remaining: number;
  remainingDebtorCount: number;
  recoveryRate: number;
  cohortDebtNow: number;
  cohortDebtorsNow: number;
}

export interface DebtStatusSlice {
  status: string;
  label: string;
  amount: number;
  count: number;
  share: number;
}

export interface AgingDebtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  groups: string[];
  status: string;
  isArchived: boolean;
  /** Debt this student ran up in the opened month (paid or not). */
  monthDebt: number;
  /** Of that, still unpaid today. */
  monthUnpaid: number;
  /** Everything this student owes today, across all months. */
  totalDebt: number;
  otherMonths: Array<{ monthKey: string; label: string; amount: number }>;
}

export interface MonthAgingDetail {
  monthKey: string;
  label: string;
  totals: {
    debt: number;
    debtorCount: number;
    unpaid: number;
    unpaidDebtorCount: number;
  };
  debtors: AgingDebtor[];
  writeOffs: Array<{
    id: string;
    studentId: number | null;
    firstName: string;
    lastName: string;
    amount: number;
    reason: string | null;
    performedBy: string | null;
    createdAt: string;
  }>;
}

export interface LongestDebtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  groups: string[];
  debt: number;
  since: string;
  sinceMonthKey: string;
  monthsInDebt: number;
  status: string;
  isArchived: boolean;
}

export interface DebtHistoryResponse {
  months: DebtMonth[];
  /** Flow columns only — the API deliberately omits balance totals. */
  totals: {
    debtAdded: number;
    debtPaid: number;
    debtForgiven: number;
    debtOther: number;
  };
  current: {
    debt: number;
    debtorCount: number;
    delta: number;
    byStatus: DebtStatusSlice[];
  };
  longestDebtors: LongestDebtor[];
  statusFilter: DebtStatusFilter;
}

/** Which statuses count as "still with us" — matches the backend's split. */
export const STATUS_FILTER_LABELS: Record<DebtStatusFilter, string> = {
  all: "Hammasi",
  active: "Faol",
  inactive: "Nofaol",
};

/**
 * One colour per status slice. Literal hex, never `hsl(var(--…))` — CSS
 * variables resolve to nothing inside SVG attributes and the shape falls back
 * to black.
 */
export const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#0ea5e9",
  FROZEN: "#8b5cf6",
  EXPELLED: "#ef4444",
  GRADUATED: "#14b8a6",
  INACTIVE: "#f59e0b",
  ARCHIVED: "#94a3b8",
  ARCHIVED_SOFT: "#94a3b8",
  PROSPECT: "#cbd5e1",
};

/**
 * What each slice means, in the plainest words available. These are read by
 * someone deciding who to chase, so each one says what the status IS and what
 * it implies for collecting — not what the enum is called.
 */
export const STATUS_HINTS: Record<string, string> = {
  ACTIVE: "Hozir o'qiyapti. Bu pulni undirish eng oson.",
  FROZEN: "O'qishni vaqtincha to'xtatgan. Qaytib kelsa to'lashi mumkin.",
  EXPELLED: "Markazdan chetlatilgan. Bu pulning qaytishi qiyin.",
  GRADUATED: "Kursni tugatib ketgan, lekin qarzi qolgan.",
  INACTIVE: "Nofaol o'quvchi.",
  ARCHIVED: "Ro'yxatdan olib tashlangan.",
  ARCHIVED_SOFT:
    "Ro'yxatdan olib tashlangan — tizimning boshqa sahifalarida ko'rinmaydi, lekin qarzi yopilmagan.",
  PROSPECT: "Faqat ro'yxatdan o'tgan, hali guruhga kirmagan.",
};
