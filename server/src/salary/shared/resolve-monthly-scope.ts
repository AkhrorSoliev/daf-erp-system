import { PrismaService } from '../../prisma/prisma.service';
import {
  resolvePayrollBranchScope,
  scopeToBranchFilter,
} from './payroll-branch-scope';
import {
  parseTashkentDateStart,
  resolveCurrentPeriod,
} from './resolve-current-period';

export interface SalaryMonthlyQuery {
  month?: string;
  search?: string;
  /**
   * Narrow the report to a single user. Powers the per-teacher views (profile
   * "Ish haqi" tab, profile card, lehrer portal) so they read the SAME row the
   * `/payments/salary` table renders instead of computing their own figure.
   */
  userId?: number;
  /**
   * Narrow the report to one branch. It can only ever NARROW: a caller already
   * confined to a branch cannot use this to look at another one. Needed so the
   * «Foyda» card subtracts THAT branch's payroll from THAT branch's revenue —
   * it used to subtract the whole company's.
   */
  branchId?: number;
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
  /** True when the caller is branch-confined but has no branch — show nothing. */
  blocked: boolean;
  search: string | undefined;
  searchId: number | null;
  /** Single-user scope; undefined = the full roster. */
  userId: number | undefined;
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
  // Looking at your own row is always allowed: an id-exact lookup of yourself
  // must not come back empty because your UserBranch rows disagree with your
  // `mainBranch`. Everyone else keeps the normal branch confinement.
  const selfView = query.userId !== undefined && query.userId === performedById;
  const scope = await resolvePayrollBranchScope(prisma, performedById, {
    selfView,
  });
  // Fail CLOSED. A confined caller whose branch is unknown previously fell
  // through to "no filter" and saw every branch's payroll.
  let blocked = scope.kind === 'none';
  let branchId = scopeToBranchFilter(scope);
  if (scope.kind === 'branch') {
    // A requested branch may only match the one the caller is confined to.
    if (query.branchId != null && query.branchId !== scope.branchId) {
      blocked = true;
    }
  } else if (scope.kind === 'all' && query.branchId != null) {
    branchId = query.branchId;
  }

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
    blocked,
    search: search || undefined,
    searchId,
    userId: query.userId,
  };
}
