import { Prisma, SalaryType } from '@prisma/client';
import type { MonthlyScope } from './resolve-monthly-scope';

/**
 * A person paid a fixed monthly salary: their company-wide (`groupId: null`)
 * rate is FIXED_MONTHLY. They are reported in the «Xodimlar oyligi» table
 * (`SalaryStaffMonthlyService`) whatever their roles, and never in the teacher
 * table — the payroll cron pays them the fixed amount, not per lesson.
 *
 * It used to be split by the Teacher ROLE instead, which left an employee who
 * has the role but teaches no lesson (prod: a 6 000 000 so'm monthly) in the
 * teacher table with no lesson data: the row showed the payment but added
 * nothing to `fullDeserved`, so the net profit never subtracted the salary.
 * Both sides read this one clause, so a person is in exactly one of them.
 */
export const GLOBAL_FIXED_MONTHLY_CONFIG = {
  groupId: null,
  salaryType: SalaryType.FIXED_MONTHLY,
} satisfies Prisma.EmployeeSalaryConfigWhereInput;

/**
 * The teacher roster a monthly-salary surface reports on, as ONE where-clause.
 *
 * `SalaryMonthlyService.getMonthly` (the `/payments/salary` table and its
 * "Markaz qo'shimchasi" card) and `SalaryCenterTopUpService` (the card's
 * drill-down) must agree on this set exactly: the card shows Σ still-fronted
 * over these teachers, and the drill-down lists the students behind that same
 * sum. Two copies of the clause is the one way those two figures can drift, so
 * there is one.
 *
 * `blocked` means the caller is branch-confined but has no branch — an
 * impossible filter is used so they see nothing, rather than falling through to
 * every branch.
 */
export function buildTeacherRosterWhere(
  scope: Pick<
    MonthlyScope,
    'companyId' | 'blocked' | 'userId' | 'branchId' | 'search' | 'searchId'
  >,
): Prisma.UserWhereInput {
  const { companyId, blocked, userId, branchId, search, searchId } = scope;
  return {
    deletedAt: null,
    companyId,
    roles: { some: { role: { name: 'Teacher' } } },
    salaryConfigs: { none: GLOBAL_FIXED_MONTHLY_CONFIG },
    ...(blocked && { id: -1 }),
    ...(userId !== undefined && { id: userId }),
    ...(branchId !== undefined && { branches: { some: { branchId } } }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
        ...(searchId !== null ? [{ id: searchId }] : []),
      ],
    }),
  };
}

/**
 * Accruals belonging to a payroll period, including carry-overs.
 *
 * `creditPeriodDate` set → the accrual is bucketed HERE regardless of its
 * `lessonDate` (a late payment credited into an open period). Unset → bucket by
 * `lessonDate`, which is a `@db.Date` column and therefore needs the unshifted
 * date bounds with an EXCLUSIVE upper bound (see `MonthlyScope`).
 */
export function accrualPeriodWhere(
  scope: Pick<
    MonthlyScope,
    'periodStart' | 'periodEnd' | 'periodStartDate' | 'periodEndDateExclusive'
  >,
): Prisma.SalaryAccrualWhereInput {
  return {
    OR: [
      {
        creditPeriodDate: { gte: scope.periodStart, lte: scope.periodEnd },
      },
      {
        creditPeriodDate: null,
        lessonDate: {
          gte: scope.periodStartDate,
          lt: scope.periodEndDateExclusive,
        },
      },
    ],
  };
}
