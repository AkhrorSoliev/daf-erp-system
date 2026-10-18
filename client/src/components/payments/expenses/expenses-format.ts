import { interpolate } from "@/i18n/translate";
import { msg } from "@/i18n/msg";
import { som } from "@/components/payments/overview/overview-math";
import type { Translate } from "@/components/payments/record-payment-admission";
import { addMonths, monthLabel, monthShort } from "@/components/payments/salary-utils";
import { tashkentWallClock } from "@/lib/tashkent-time";
import { RECURRING_LABELS, recurringLabel, type ExpenseCategoryKey } from "./expenses-labels";
import type { ExpensePreset, MissingRow } from "./expenses-types";

// Words and dates of the «Xarajatlar» page. Every amount is the server's.

/** Languages whose month names are capitalised in the middle of a sentence (German nouns, English months). */
export const keepsMonthCapital = (locale: string): boolean => locale === "de" || locale === "en";

// The month name in the middle of a sentence: «avgust» in Uzbek and Russian, «August» in German and English.
function lowerMonth(month: string, t: Translate, lower: boolean): string {
  const name = monthShort(month, t);
  return lower ? name.toLowerCase() : name;
}

/** «Ijara», or «Ijara · Shimol» when the scope holds several branches (spec B6 §3.3). The branch name is data. */
export function missingTitle(row: MissingRow, multiBranch: boolean, t: Translate = interpolate): string {
  const name = recurringLabel(row.key, t);
  return multiBranch ? `${name} · ${row.branchName}` : name;
}

/** «avgustda 17 800 000 so'm edi», plus «, sentabrda hozircha 70 000 so'm» when part is recorded. */
export function missingText(row: MissingRow, month: string, t: Translate = interpolate, lower = true): string {
  const prev = lowerMonth(addMonths(month, -1), t, lower);
  const amount = som(row.lastMonthAmount, t);
  if (row.thisMonthAmount <= 0) return t("{month}da {amount} edi", { month: prev, amount });
  return t("{month}da {amount} edi, {now}da hozircha {nowAmount}", {
    month: prev,
    amount,
    now: lowerMonth(month, t, lower),
    nowAmount: som(row.thisMonthAmount, t),
  });
}

/** «Shimol filiali», unless the name already says it. The name is data. */
export const emptyBranchTitle = (name: string, t: Translate = interpolate): string =>
  /filial/i.test(name) ? name : t("{name} filiali", { name });

/**
 * «Yozish»: the row's category, what is still missing, «Ijara — oktabr 2026», the row's branch (spec B6 §2.2, §3.3).
 * The description is saved as data, so it stays Uzbek in every language.
 */
export function presetFor(row: MissingRow, month: string): ExpensePreset {
  return { category: row.key, amount: row.amount, description: `${RECURRING_LABELS[row.key]} — ${monthLabel(month).toLowerCase()}`, branchId: row.branchId };
}

/** A category row click: that one category, or nothing when it alone was picked (spec B6 §3.4). */
export function toggleTurkum(selected: readonly string[], category: ExpenseCategoryKey): string[] {
  return selected.length === 1 && selected[0] === category ? [] : [category];
}

/** `Expense.date` is a calendar date sent as UTC midnight: «05.10.2026». */
export function dateText(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** When the row was entered, on the Tashkent clock: «05.10.2026, 14:30». */
export function enteredText(iso: string): string {
  const w = tashkentWallClock(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(w.getUTCDate())}.${p(w.getUTCMonth() + 1)}.${w.getUTCFullYear()}, ${p(w.getUTCHours())}:${p(w.getUTCMinutes())}`;
}

export const SAME_AS_PROFIT = msg("Foydadagi «Boshqa xarajatlar» qatorining o'zi");
export const CATEGORY_HINT = msg("Turkumni bosing — pastdagi ro'yxat shu turkumga filtrlanadi.");
export const MISSING_FOOTNOTE = msg("Bular yozilmaguncha foyda haqiqiydan katta ko'rinadi.");
export const ADVANCE_NOTE = msg("Ustozlarga avans — Ish haqi → Avanslar bo'limida. Xodimlar oyligi — Ish haqida; bu yerga yozilmaydi, aks holda foydadan ikki marta ayiriladi.");
