import { formatBalance } from "@/lib/format-utils";
import { addMonths, monthLabel, monthShort } from "@/components/payments/salary-utils";
import { tashkentWallClock } from "@/lib/tashkent-time";
import { RECURRING_LABELS, type ExpenseCategoryKey } from "./expenses-labels";
import type { ExpensePreset, MissingRow } from "./expenses-types";

// Words and dates of the «Xarajatlar» page. Every amount is the server's.

const lowerMonth = (month: string) => monthShort(month).toLowerCase();

/** «Ijara», or «Ijara · Shimol» when the scope holds several branches (spec B6 §3.3). */
export function missingTitle(row: MissingRow, multiBranch: boolean): string {
  const name = RECURRING_LABELS[row.key];
  return multiBranch ? `${name} · ${row.branchName}` : name;
}

/** «avgustda 17 800 000 so'm edi», plus «, sentabrda hozircha 70 000 so'm» when part is recorded. */
export function missingText(row: MissingRow, month: string): string {
  const was = `${lowerMonth(addMonths(month, -1))}da ${formatBalance(row.lastMonthAmount)} edi`;
  return row.thisMonthAmount > 0 ? `${was}, ${lowerMonth(month)}da hozircha ${formatBalance(row.thisMonthAmount)}` : was;
}

/** «Shimol filiali», unless the name already says it. */
export const emptyBranchTitle = (name: string): string => (/filial/i.test(name) ? name : `${name} filiali`);

/** «Yozish»: the row's category, what is still missing, «Ijara — oktabr 2026», the row's branch (spec B6 §2.2, §3.3). */
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
  const t = tashkentWallClock(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}, ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export const SAME_AS_PROFIT = "Foydadagi «Boshqa xarajatlar» qatorining o'zi";
export const CATEGORY_HINT = "Turkumni bosing — pastdagi ro'yxat shu turkumga filtrlanadi.";
export const MISSING_FOOTNOTE = "Bular yozilmaguncha foyda haqiqiydan katta ko'rinadi.";
export const ADVANCE_NOTE = "Ustozlarga avans — Ish haqi → Avanslar bo'limida. Xodimlar oyligi — Ish haqida; bu yerga yozilmaydi, aks holda foydadan ikki marta ayiriladi.";
