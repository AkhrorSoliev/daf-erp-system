// Shared helpers for the salary page (matrix + period workflow views).

import { formatNumber } from "@/lib/format-utils";
import { msg } from "@/i18n/msg";

/**
 * The unit a rate is written in: «month» — per student per MONTH, «cycle» —
 * per CYCLE. The server writes it on every breakdown line (`rateBasis`); the
 * client never works out which months were billed monthly.
 */
export type RateBasis = "month" | "cycle";

/**
 * The rate label on a breakdown line. The admin drawer and the teacher's own
 * page both use it, so the two read the same.
 *
 * FIXED_PER_STUDENT: «/o'quvchi/oy» when `rateBasis === "month"`, «/tsikl»
 * when it is `"cycle"`.
 */
export function breakdownRateLabel(
  rate: { salaryType: string; value: number },
  rateBasis: RateBasis,
): string {
  if (rate.salaryType === "PERCENTAGE") return `${rate.value}%`;
  const value = formatNumber(rate.value);
  if (rate.salaryType === "FIXED_PER_STUDENT") {
    return rateBasis === "month" ? `${value}/o'quvchi/oy` : `${value}/tsikl`;
  }
  return `${value}/oy`;
}

/**
 * A salary type's name, never the enum's: the rate sheet's badges and the
 * breakdown drawer's CSV (opened in Excel) both read it.
 */
export const SALARY_TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "Foiz",
  FIXED_PER_STUDENT: "O'quvchi boshiga",
  FIXED_MONTHLY: "Oylik",
};

export const SALARY_STATUS_LABELS: Record<string, string> = {
  CALCULATED: msg("Hisoblangan"),
  APPROVED: msg("Tasdiqlangan"),
  PAID: msg("To'langan"),
  CANCELLED: msg("Bekor qilingan"),
};

// Restrained semantic palette: amber=draft, blue=approved, green=paid.
export const SALARY_STATUS_BADGE: Record<string, string> = {
  CALCULATED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

// Cell tints for the matrix (lighter than badges, used as the cell background).
export const SALARY_STATUS_CELL: Record<string, string> = {
  CALCULATED: "bg-amber-50 text-amber-900",
  APPROVED: "bg-blue-50 text-blue-900",
  PAID: "bg-green-50 text-green-900",
};

const ROLE_LABELS: Record<number, string> = {
  1: msg("Direktor"),
  2: msg("Filial direktori"),
  3: msg("Administrator"),
  4: msg("O'qituvchi"),
  5: msg("Kassir"),
};

/**
 * The employee's "Lavozim" from a flat role list. Lowest role id wins, so a
 * Branch Director who is also an Administrator reads as the senior of the two.
 */
export function roleLabel(roles: { id: number }[] | undefined): string {
  if (!roles?.length) return "—";
  const ids = roles.map((r) => r.id).sort((a, b) => a - b);
  return ROLE_LABELS[ids[0]] ?? "—";
}

const ROLE_IDS_BY_NAME: Record<string, number> = {
  CEO: 1,
  "Branch Director": 2,
  Administrator: 3,
  Teacher: 4,
  Cashier: 5,
};

/**
 * A staff row's `position` as the salary page prints it. The server falls back
 * to the role NAME («Cashier») for an employee with no job title, so a role name
 * is said in Uzbek; any other text is a real job title and passes through.
 */
export function staffRoleText(
  position: string | null | undefined,
  t: (source: string) => string = (source) => source,
): string {
  const p = position?.trim();
  if (!p) return t("Xodim");
  const id = ROLE_IDS_BY_NAME[p];
  // A typed job title is data: only the role names are translated.
  if (!id) return p;
  const label = ROLE_LABELS[id];
  return t(label);
}

/** Same, for the nested `{ role: { id } }` shape the user endpoints return. */
export function primaryRoleLabel(
  roles: { role: { id: number } }[] | undefined,
): string {
  return roleLabel(roles?.map((r) => r.role));
}

/**
 * What to call an employee. The job title wins because it is the only label a
 * role-less employee has — a cleaner carries no role by design. Employees
 * created before the column exists fall back to their role.
 */
export function positionLabel(user: {
  position?: string | null;
  roles?: { id: number }[];
}): string {
  return user.position?.trim() || roleLabel(user.roles);
}

const UZ_MONTHS = [
  msg("Yanvar"),
  msg("Fevral"),
  msg("Mart"),
  msg("Aprel"),
  msg("May"),
  msg("Iyun"),
  msg("Iyul"),
  msg("Avgust"),
  msg("Sentabr"),
  msg("Oktabr"),
  msg("Noyabr"),
  msg("Dekabr"),
];

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Tashkent calendar month ("YYYY-MM") of an ISO timestamp. */
export function monthKeyOf(iso: string): string {
  const t = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-06" → "Iyun 2026". `t` translates the month name (default: the Uzbek text). */
export function monthLabel(
  key: string,
  t: (source: string) => string = (source) => source,
): string {
  const [y, m] = key.split("-").map(Number);
  const month = UZ_MONTHS[(m - 1 + 12) % 12];
  return `${t(month)} ${y}`;
}

/** "2026-06" → "Iyun" (no year). `t` translates the month name (default: the Uzbek text). */
export function monthShort(
  key: string,
  t: (source: string) => string = (source) => source,
): string {
  const [, m] = key.split("-").map(Number);
  const month = UZ_MONTHS[(m - 1 + 12) % 12];
  return t(month);
}

/** Current Tashkent month key. */
export function currentMonthKey(): string {
  const t = new Date(Date.now() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Shift a "YYYY-MM" key by n months (negative = back). */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Inclusive list of month keys from `from` to `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // guard against reversed range / runaway
  for (let i = 0; i < 60 && cur <= to; i++) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}
