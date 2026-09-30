import { formatPrice } from "@/lib/format-utils";
import { monthLabel } from "./salary-utils";

/** Mirror of `ProfitComposition` (server `reports-profit-composition.service.ts`). */
export interface ProfitComposition {
  month: string;
  status: {
    isOpen: boolean;
    daysPassed: number;
    daysInMonth: number;
    todayStr: string;
  };
  netProfit: number;
  teacherSalaryBasis: "hisoblangan" | "naqd";
  staffSalaryBasis: "hisoblangan" | "naqd";
  revenue: {
    total: number;
    studentCount: number;
    byCourse: NamedRows;
    byBranch: { id: number; name: string; amount: number }[];
  };
  /** «Yechib olish» booked this month (ADR-0055). Absent from a server that predates it (a rollback). */
  withdrawals?: {
    total: number;
    teacherCredited: number;
    count: number;
  } & NamedRows;
  teachers: { total: number; count: number; advances: number } & NamedRows;
  staff: { total: number; count: number } & NamedRows;
  expenses: {
    total: number;
    categories: {
      category: string;
      amount: number;
      items: { description: string; amount: number }[];
    }[];
  };
  refunds: number;
  forecast: {
    expectedNetProfit: number;
    remainingLessons: { count: number; value: number };
    remainingTeacherPay: number;
    missingExpenses: {
      key: "RENT" | "UTILITIES" | "TAXES";
      amount: number;
      lastMonthAmount: number;
      lastMonthDay: number;
    }[];
  } | null;
  unpaidLeft: { students: number; lessons: number; amount: number } | null;
  branchesWithoutExpenses: { id: number; name: string }[];
}

export interface NamedRows {
  rows: { name: string; detail?: string | null; amount: number }[];
  rest: { count: number; amount: number };
}

/** 47 598 862 → "47,6 mln"; below a million the plain figure. */
export function mln(amount: number): string {
  if (Math.abs(amount) < 1_000_000)
    return `${formatPrice(Math.round(amount))} so'm`;
  return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} mln`;
}

/** "Sentabr 2026 · 26 kun o'tdi, 4 kun qoldi" / "Avgust 2026 · oy yakunlangan". */
export function statusLabel(c: Pick<ProfitComposition, "month" | "status">) {
  const name = monthLabel(c.month);
  if (!c.status.isOpen) {
    return c.status.daysPassed === 0
      ? `${name} · hali boshlanmagan`
      : `${name} · oy yakunlangan`;
  }
  const left = c.status.daysInMonth - c.status.daysPassed;
  return left > 0
    ? `${name} · ${c.status.daysPassed} kun o'tdi, ${left} kun qoldi`
    : `${name} · oxirgi kun`;
}

/** The one sentence under the big number, in plain words. */
export function headline(
  revenue: number,
  netProfit: number,
  withdrawn = 0,
): string {
  const spent = "ustozlar, xodimlar va xarajatlardan keyin";
  const came =
    withdrawn > 0
      ? `Darslardan ${mln(revenue)}, balansdan ${mln(withdrawn)} tushdi`
      : `Darslardan ${mln(revenue)} tushdi`;
  return netProfit >= 0
    ? `${came} — ${spent} ${mln(netProfit)} qoldi.`
    : `${came} — ${spent} ${mln(-netProfit)} zarar.`;
}

/** "2 o'quvchi balansidan · 200 000 so'mi ustozlar haqiga yozilgan". */
export function withdrawalSub(
  w: NonNullable<ProfitComposition["withdrawals"]>,
): string {
  const who = `${w.count} o'quvchi balansidan`;
  return w.teacherCredited > 0
    ? `${who} · ${formatPrice(w.teacherCredited)} so'mi ustozlar haqiga yozilgan`
    : who;
}

/**
 * Same words as the expenses page (`EXPENSE_CATEGORY_LABELS` in
 * `expenses-filter-bar.tsx`), plus the categories that page does not offer
 * but old rows may carry. Not imported from there: that module is a React
 * component file, and this one is kept free of UI so it can be unit-tested.
 */
const EXPENSE_LABELS: Record<string, string> = {
  RENT: "Ijara",
  UTILITIES: "Kommunal",
  SUPPLIES: "Ta'minot",
  MARKETING: "Marketing",
  OTHER: "Boshqa",
  TAXES: "Soliq",
  EQUIPMENT: "Jihozlar",
  MAINTENANCE: "Ta'mirlash",
};

export function expenseLabel(category: string): string {
  return EXPENSE_LABELS[category] ?? category;
}

export function recurringLabel(key: "RENT" | "UTILITIES" | "TAXES"): string {
  return {
    RENT: "Ijara",
    TAXES: "Soliq",
    UTILITIES: "Kommunal (svet va h.k.)",
  }[key];
}

/** "Reklama 5,8 mln · Boshqa 4,3 mln · Ta'minot 2,1 mln" — the top three. */
export function expenseSummary(
  categories: ProfitComposition["expenses"]["categories"],
): string {
  return categories
    .slice(0, 3)
    .map((c) => `${expenseLabel(c.category)} ${mln(c.amount)}`)
    .join(" · ");
}

/** The footer that proves the lines add up to the card. */
export function reconciliation(c: ProfitComposition): string {
  const f = formatPrice;
  const w = c.withdrawals?.total ?? 0;
  const withdrawn = w !== 0 ? ` + ${f(w)}` : "";
  return `${f(c.revenue.total)}${withdrawn} − ${f(c.teachers.total)} − ${f(c.staff.total)} − ${f(c.expenses.total)} − ${f(c.refunds)} = ${f(c.netProfit)}`;
}
