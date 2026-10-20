import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/payments/record-payment-admission";
import type { ExpenseHint, RecurringKey } from "./expenses-types";

/** The eight categories the page shows, in the CEO's order (spec B6 §2.3); the advance is never one. */
export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "SUPPLIES", "MARKETING", "EQUIPMENT", "MAINTENANCE", "TAXES", "OTHER"] as const;
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];

// The labels are `msg()` texts: the components draw them with `t()`.
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryKey, string> = {
  RENT: msg("Ijara"),
  UTILITIES: msg("Kommunal"),
  SUPPLIES: msg("Ta'minot"),
  MARKETING: msg("Marketing"),
  EQUIPMENT: msg("Jihozlar"),
  MAINTENANCE: msg("Ta'mirlash"),
  TAXES: msg("Soliqlar"),
  OTHER: msg("Boshqa"),
};

/** Keyed by string: the salary advance screens index it with a plain string. */
export const EXPENSE_METHOD_LABELS: Record<string, string> = { CASH: msg("Naqd"), CARD: msg("Karta") };

/** The server sends the code (`expense-hints.ts`); the words live here. */
export const EXPENSE_HINT_LABELS: Record<ExpenseHint, string> = {
  SALARY: msg("Xodimlar oyligida ham bormi?"),
  EQUIPMENT: msg("Jihozlar turkumi emasmi?"),
  UTILITIES: msg("Kommunal turkumi emasmi?"),
};

/** The warning's names (spec B6 §3.3). `presetFor` writes them untranslated into the saved description. */
export const RECURRING_LABELS: Record<RecurringKey, string> = { RENT: msg("Ijara"), UTILITIES: msg("Kommunal"), TAXES: msg("Soliq") };

// The scanner only reads `t(name)` with a bare name, so each lookup copies the label into a local first.
export function categoryLabel(key: ExpenseCategoryKey, t: Translate = interpolate): string {
  const label = EXPENSE_CATEGORY_LABELS[key];
  return t(label);
}

/** The method's name; an unknown code prints as it is. */
export function methodLabel(code: string, t: Translate = interpolate): string {
  const label = EXPENSE_METHOD_LABELS[code];
  return label ? t(label) : code;
}

export function hintLabel(hint: ExpenseHint, t: Translate = interpolate): string {
  const label = EXPENSE_HINT_LABELS[hint];
  return t(label);
}

export function recurringLabel(key: RecurringKey, t: Translate = interpolate): string {
  const label = RECURRING_LABELS[key];
  return t(label);
}

export const isExpenseCategory = (v: string): v is ExpenseCategoryKey => (EXPENSE_CATEGORIES as readonly string[]).includes(v);
