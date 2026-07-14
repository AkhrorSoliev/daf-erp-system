import { PrismaService } from '../../prisma/prisma.service';
import {
  parseTashkentDateStart,
  resolveCurrentPeriod,
} from './resolve-current-period';

export interface SalaryMonthlyQuery {
  month?: string;
  search?: string;
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Fallback floor when a company has no `systemStartDate` (May 2026 cutover). */
const DEFAULT_FLOOR_MONTH = '2026-05';

/** Tashkent calendar month key ("YYYY-MM") of an instant. */
export function monthKeyOf(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Shared month + period + branch-scope resolution for the monthly salary
 * report. Both the teacher pass (`SalaryMonthlyService.getMonthly`) and the
 * non-teaching fixed-salary staff pass (`SalaryStaffMonthlyService`) resolve
 * their inputs from THIS single function, so the two can never disagree on the
 * selected month, payroll period, calendar-month bounds, or branch scope.
 */
export interface MonthlyScope {
  companyId: number;
  /** Selected month "YYYY-MM", floored at the company's systemStartDate month. */
  month: string;
  floorMonth: string;
  period: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  periodStart: Date;
  periodEnd: Date;
  /** Calendar-month bounds for advances (accounting date, not the period). */
  monthStart: Date;
  nextMonthStart: Date;
  /** UTC instants for `SalaryPayment.periodStart` bucketing into this month. */
  periodStartLow: Date;
  periodStartHigh: Date;
  /** Branch scope (BD → own branch); undefined = all branches (CEO/Admin). */
  branchId: number | undefined;
  search: string | undefined;
  searchId: number | null;
}

export async function resolveMonthlyScope(
  prisma: PrismaService,
  query: SalaryMonthlyQuery,
  companyId: number,
  performedById: number,
): Promise<MonthlyScope> {
  // ─── month + floor + period bounds ──────────────────────────────────────
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { systemStartDate: true },
  });
  const floorMonth = company?.systemStartDate
    ? monthKeyOf(company.systemStartDate)
    : DEFAULT_FLOOR_MONTH;

  const requested =
    query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
      ? query.month
      : monthKeyOf(new Date());
  const month = requested < floorMonth ? floorMonth : requested;

  // Mid-month reference → the payroll period the month sits in. With
  // cycleStartDay=1 this is exactly the calendar month.
  const asOf = parseTashkentDateStart(`${month}-15`);
  const period = await resolveCurrentPeriod(prisma, companyId, asOf);
  const { periodStart, periodEnd } = period;

  // Calendar-month bounds for advances (accounting date, not the period).
  const [my, mm] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(my, mm - 1, 1));
  const nextMonthStart = new Date(Date.UTC(my, mm, 1));
  // Same bounds as UTC instants, for `SalaryPayment.periodStart` bucketing
  // (mirrors getMatrix's Tashkent-month bucketing for a single month).
  const periodStartLow = new Date(monthStart.getTime() - TASHKENT_OFFSET_MS);
  const periodStartHigh = new Date(nextMonthStart.getTime() - TASHKENT_OFFSET_MS);

  // ─── branch scope ───────────────────────────────────────────────────────
  const caller = await prisma.user.findUnique({
    where: { id: performedById },
    select: {
      mainBranch: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  const roleNames = caller?.roles.map((r) => r.role.name) ?? [];
  const scoped =
    !roleNames.includes('CEO') && !roleNames.includes('Administrator');
  const branchId = scoped ? (caller?.mainBranch ?? undefined) : undefined;

  const search = query.search?.trim();
  const searchId = search && /^\d+$/.test(search) ? Number(search) : null;

  return {
    companyId,
    month,
    floorMonth,
    period,
    periodStart,
    periodEnd,
    monthStart,
    nextMonthStart,
    periodStartLow,
    periodStartHigh,
    branchId,
    search: search || undefined,
    searchId,
  };
}
