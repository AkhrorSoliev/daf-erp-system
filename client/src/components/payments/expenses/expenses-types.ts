import type { ExpenseCategoryKey } from "./expenses-labels";

export type ExpenseMethod = "CASH" | "CARD";
export type ExpenseHint = "SALARY" | "EQUIPMENT" | "UTILITIES";
export type RecurringKey = "RENT" | "UTILITIES" | "TAXES";

/** One row of `GET /expenses` (spec B6 §5.3). */
export interface ExpenseRow {
  id: string;
  category: ExpenseCategoryKey;
  paymentMethod: ExpenseMethod;
  amount: number;
  description: string;
  /** `@db.Date`, sent as UTC midnight. */
  date: string;
  branchId: number;
  receiptUrl: string | null;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string };
  hint: ExpenseHint | null;
  /** The channel a MARKETING expense paid for (ADR-0109); null = not one channel. */
  leadSource: { id: string; name: string } | null;
}

export interface ExpensesListResponse {
  data: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
  /** The whole filtered set, not the page — «Tanlangan» reads it. */
  summary: { totalAmount: number; count: number; cashTotal: number; cardTotal: number; advancesTotal: number };
}

export interface MonthCategoryRow { category: ExpenseCategoryKey; amount: number; count: number; lastMonthAmount: number; notRecorded: boolean }
export interface MissingRow { key: RecurringKey; branchId: number; branchName: string; amount: number; lastMonthAmount: number; thisMonthAmount: number }
export interface ExpenseCreator { id: number; firstName: string; lastName: string }

/** `GET /expenses/month-summary` (spec B6 §5.2). */
export interface MonthSummary {
  month: string;
  isCurrentMonth: boolean;
  total: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  lastMonthTotal: number;
  byCategory: MonthCategoryRow[];
  missing: MissingRow[];
  multiBranch: boolean;
  emptyBranches: { id: number; name: string }[];
  creators: ExpenseCreator[];
}

/** What «Yozish» opens the expense dialog with (spec B6 §3.7). */
export interface ExpensePreset { category: ExpenseCategoryKey; amount: number; description: string; branchId: number }
