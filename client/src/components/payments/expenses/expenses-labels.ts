import type { ExpenseHint, RecurringKey } from "./expenses-types";

/** The eight categories the page shows, in the CEO's order (spec B6 §2.3); the advance is never one. */
export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "SUPPLIES", "MARKETING", "EQUIPMENT", "MAINTENANCE", "TAXES", "OTHER"] as const;
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryKey, string> = {
  RENT: "Ijara",
  UTILITIES: "Kommunal",
  SUPPLIES: "Ta'minot",
  MARKETING: "Marketing",
  EQUIPMENT: "Jihozlar",
  MAINTENANCE: "Ta'mirlash",
  TAXES: "Soliqlar",
  OTHER: "Boshqa",
};

/** Keyed by string: the salary advance screens index it with a plain string. */
export const EXPENSE_METHOD_LABELS: Record<string, string> = { CASH: "Naqd", CARD: "Karta" };

/** The server sends the code (`expense-hints.ts`); the words live here. */
export const EXPENSE_HINT_LABELS: Record<ExpenseHint, string> = {
  SALARY: "Xodimlar oyligida ham bormi?",
  EQUIPMENT: "Jihozlar turkumi emasmi?",
  UTILITIES: "Kommunal turkumi emasmi?",
};

/** The warning's names (spec B6 §3.3). */
export const RECURRING_LABELS: Record<RecurringKey, string> = { RENT: "Ijara", UTILITIES: "Kommunal", TAXES: "Soliq" };

export const isExpenseCategory = (v: string): v is ExpenseCategoryKey => (EXPENSE_CATEGORIES as readonly string[]).includes(v);
