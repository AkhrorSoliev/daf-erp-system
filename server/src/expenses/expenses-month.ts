import { BadRequestException } from '@nestjs/common';
import type { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import {
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  missingRecurringExpenses,
  type ExpenseRow,
  type RecurringExpenseKey,
} from '../reports/profit-composition';
import { capitalizeUz, uzMonthName } from '../telegram-digest/uzbek-calendar';

/**
 * Pure rules of the «Xarajatlar» month page (spec B6 §4). No database here;
 * `ExpensesMonthService` feeds them the rows it loaded.
 */

/** The page starts in May 2026 (spec B6 §4.1). */
export const EXPENSE_FIRST_MONTH = '2026-05';

/** The eight categories the page shows, in the CEO's fixed order; the advance is never one (spec B6 §2.3). */
export const PAGE_CATEGORIES = [
  'RENT',
  'UTILITIES',
  'SUPPLIES',
  'MARKETING',
  'EQUIPMENT',
  'MAINTENANCE',
  'TAXES',
  'OTHER',
] as const satisfies readonly ExpenseCategory[];
export type PageCategory = (typeof PAGE_CATEGORIES)[number];

const RECURRING_CATEGORIES = new Set<string>(['RENT', 'UTILITIES', 'TAXES']);

/** One expense as the month summary loads it: in scope, live, never an advance. */
export interface MonthExpenseRow {
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  date: Date;
  branchId: number;
  createdById: number;
}

export interface CategoryRow {
  category: PageCategory;
  amount: number;
  count: number;
  lastMonthAmount: number;
  notRecorded: boolean;
}
export interface MissingRow {
  key: RecurringExpenseKey;
  branchId: number;
  branchName: string;
  amount: number;
  lastMonthAmount: number;
  thisMonthAmount: number;
}
export interface BranchRef {
  id: number;
  name: string;
  status: string;
  deletedAt: Date | null;
}

/** `GET /expenses/month-summary` (spec B6 §5.2). */
export interface MonthSummary {
  month: string;
  isCurrentMonth: boolean;
  total: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  lastMonthTotal: number;
  byCategory: CategoryRow[];
  missing: MissingRow[];
  multiBranch: boolean;
  emptyBranches: { id: number; name: string }[];
  creators: { id: number; firstName: string; lastName: string }[];
}

/** `oy` as the page reads it: empty = the current Tashkent month; May 2026 up to it. */
export function parseExpenseMonth(oy: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!oy) return current;
  if (oy < EXPENSE_FIRST_MONTH)
    throw new BadRequestException(
      "Xarajatlar may 2026 dan boshlab ko'rsatiladi",
    );
  if (oy > current)
    throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  return oy;
}

/** `Expense.date` is `@db.Date`: plain UTC midnights, the next month's 1st exclusive. */
export function expenseMonthWindow(month: string): { gte: Date; lt: Date } {
  return {
    gte: utcMidnightFromDateStr(`${month}-01`),
    lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
  };
}

/** '2026-10' → 'Oktabr 2026' (the PDF's «Davr» line). */
export function expenseMonthTitle(month: string): string {
  return `${capitalizeUz(uzMonthName(Number(month.slice(5, 7))))} ${month.slice(0, 4)}`;
}

export function summarize(rows: readonly MonthExpenseRow[]) {
  let total = 0;
  let cashTotal = 0;
  let cardTotal = 0;
  for (const r of rows) {
    total += r.amount;
    if (r.paymentMethod === 'CASH') cashTotal += r.amount;
    if (r.paymentMethod === 'CARD') cardTotal += r.amount;
  }
  return { total, count: rows.length, cashTotal, cardTotal };
}

function byCategory(rows: readonly MonthExpenseRow[]) {
  const out = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const cur = out.get(r.category) ?? { amount: 0, count: 0 };
    cur.amount += r.amount;
    cur.count += 1;
    out.set(r.category, cur);
  }
  return out;
}

/** Eight rows in the fixed order; `notRecorded` = current month, rent/utilities/tax, 0 now, more than 0 last month. */
export function buildCategoryRows(
  thisMonth: readonly MonthExpenseRow[],
  lastMonth: readonly MonthExpenseRow[],
  isCurrentMonth: boolean,
): CategoryRow[] {
  const now = byCategory(thisMonth);
  const last = byCategory(lastMonth);
  return PAGE_CATEGORIES.map((category) => {
    const amount = now.get(category)?.amount ?? 0;
    const lastMonthAmount = last.get(category)?.amount ?? 0;
    return {
      category,
      amount,
      count: now.get(category)?.count ?? 0,
      lastMonthAmount,
      notRecorded:
        isCurrentMonth &&
        RECURRING_CATEGORIES.has(category) &&
        amount === 0 &&
        lastMonthAmount > 0,
    };
  });
}

const toExpenseRow = (r: MonthExpenseRow): ExpenseRow => ({
  category: r.category,
  description: r.description,
  amount: r.amount,
  dateStr: tashkentDateStr(r.date),
});

/**
 * The Foyda forecast's rule (`missingRecurringExpenses`), called once per
 * branch (spec B6 §4.3): «Yozish» writes ONE branch's expense (D4), and a sum
 * over branches would let one branch's surplus hide another's gap.
 */
export function missingByBranch(
  lastMonth: readonly MonthExpenseRow[],
  thisMonth: readonly MonthExpenseRow[],
  branchNames: ReadonlyMap<number, string>,
): MissingRow[] {
  const name = (id: number) => branchNames.get(id) ?? '';
  const ids = [...new Set(lastMonth.map((r) => r.branchId))].sort(
    (a, b) => name(a).localeCompare(name(b)) || a - b,
  );
  return ids.flatMap((branchId) =>
    missingRecurringExpenses(
      lastMonth.filter((r) => r.branchId === branchId).map(toExpenseRow),
      thisMonth.filter((r) => r.branchId === branchId).map(toExpenseRow),
    ).map((m) => ({
      key: m.key,
      branchId,
      branchName: name(branchId),
      amount: m.amount,
      lastMonthAmount: m.lastMonthAmount,
      thisMonthAmount: m.lastMonthAmount - m.amount,
    })),
  );
}

/** A live ACTIVE branch with no expense this month (spec B6 §4.3). */
export function emptyBranches(
  branches: readonly BranchRef[],
  thisMonth: readonly MonthExpenseRow[],
): { id: number; name: string }[] {
  const recorded = new Set(thisMonth.map((r) => r.branchId));
  return branches
    .filter(
      (b) =>
        b.deletedAt === null && b.status === 'ACTIVE' && !recorded.has(b.id),
    )
    .map(({ id, name }) => ({ id, name }));
}
