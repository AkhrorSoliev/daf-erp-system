// Shared helpers for the salary page (matrix + period workflow views).

import { formatNumber } from "@/lib/format-utils";

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
  CALCULATED: "Hisoblangan",
  APPROVED: "Tasdiqlangan",
  PAID: "To'langan",
  CANCELLED: "Bekor qilingan",
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
  1: "Direktor",
  2: "Filial direktori",
  3: "Administrator",
  4: "O'qituvchi",
  5: "Kassir",
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
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Tashkent calendar month ("YYYY-MM") of an ISO timestamp. */
export function monthKeyOf(iso: string): string {
  const t = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-06" → "Iyun 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${UZ_MONTHS[(m - 1 + 12) % 12]} ${y}`;
}

/** "2026-06" → "Iyun" (no year). */
export function monthShort(key: string): string {
  const [, m] = key.split("-").map(Number);
  return UZ_MONTHS[(m - 1 + 12) % 12];
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
