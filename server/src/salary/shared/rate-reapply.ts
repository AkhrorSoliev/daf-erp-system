import { PaymentModel, Prisma, TransactionType } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import {
  loadFrozenMonthlyCharges,
  loadPackLessonPrices,
  periodsInRange,
  type FrozenMonthlyCharge,
} from '../../common/finance/monthly-per-lesson';
import {
  perLessonAccrual,
  pickActiveVersion,
  type RateVersion,
} from './deserved-math';
import {
  packPriceCandidates,
  resolveLessonPricing,
  type GapCourse,
} from './gap-sweep';

/**
 * A rate saved with a start date re-prices the lessons ALREADY written from
 * that date on, as long as their payroll has not been calculated (ADR-0050).
 *
 * Before this, a version only reached lessons marked after the save: a rate
 * corrected on the 29th for a group that opened on the 24th left the 24th–29th
 * at the old rate, and the month closed on it (#072, September 2026: 24
 * lessons at 9 524 instead of 16 429).
 *
 * The rule is re-resolution, not "apply the new value": every open accrual
 * from `effectiveFrom` is priced again by the version active on its lesson
 * date — group rate first, then the teacher's general one, exactly as
 * `SalaryAccrualService.findActiveVersion` picks it. So a new group rate, a
 * new general rate, and a group rate switched off (its lessons fall back to
 * the general one) all go through the same code, and a lesson whose price
 * does not change is not touched.
 *
 * Runs inside the transaction that writes the rate, so the rate and the pay
 * it implies commit together.
 */

export interface RateReapplyScope {
  userId: number;
  companyId: number;
  /** A group rate re-prices that group only; a general rate, every group. */
  groupId: string | null;
  /** Start of the version just written — a Tashkent midnight instant. */
  effectiveFrom: Date;
  performedById?: number;
}

export interface RateReapplySummary {
  /** Lessons whose pay changed. */
  lessons: number;
  /** Their pay before, and after. */
  before: number;
  after: number;
  delta: number;
  /** Lessons from the start date already inside a calculated payroll. Left as they are. */
  settled: number;
  /**
   * Lessons the rule in force cannot price: no rate at all, a flat monthly
   * rate, a percentage without the lesson's price, or a monthly course with
   * no frozen charge for that month. Left as they are — a price is never
   * guessed on a path that writes money.
   */
  unpriced: number;
}

export const EMPTY_REAPPLY: RateReapplySummary = {
  lessons: 0,
  before: 0,
  after: 0,
  delta: 0,
  settled: 0,
  unpriced: 0,
};

export function addReapplySummaries(
  a: RateReapplySummary,
  b: RateReapplySummary,
): RateReapplySummary {
  return {
    lessons: a.lessons + b.lessons,
    before: a.before + b.before,
    after: a.after + b.after,
    delta: a.delta + b.delta,
    settled: a.settled + b.settled,
    unpriced: a.unpriced + b.unpriced,
  };
}

const REVERSAL_DESCRIPTION = "Stavka o'zgardi — oldingi hisob bekor qilindi";
const REPOST_DESCRIPTION =
  "Dars uchun yig'ildi (stavka o'zgargach qayta hisoblandi)";

type VersionRow = RateVersion & { id: string };

interface OpenAccrual {
  id: string;
  studentId: number;
  groupId: string;
  attendanceId: string | null;
  lessonDate: Date;
  amount: number;
  perLessonCost: number;
  salaryConfigVersionId: string | null;
}

interface Change {
  row: OpenAccrual;
  amount: number;
  versionId: string;
}

export async function reapplyRateToOpenAccruals(
  tx: Prisma.TransactionClient,
  scope: RateReapplyScope,
): Promise<RateReapplySummary> {
  // `lessonDate` is a @db.Date column: compare it with a date, never with
  // the Tashkent-shifted instant (which Postgres truncates to the day before).
  const fromDate = utcMidnightFromDateStr(tashkentDateStr(scope.effectiveFrom));

  const rows = await tx.salaryAccrual.findMany({
    where: {
      userId: scope.userId,
      companyId: scope.companyId,
      reversedAt: null,
      // Withdrawal credits carry no lesson and a hand-typed amount.
      attendanceId: { not: null },
      lessonDate: { gte: fromDate },
      ...(scope.groupId ? { groupId: scope.groupId } : {}),
    },
    select: {
      id: true,
      studentId: true,
      groupId: true,
      attendanceId: true,
      lessonDate: true,
      amount: true,
      perLessonCost: true,
      salaryConfigVersionId: true,
      salaryPaymentId: true,
    },
  });

  const summary: RateReapplySummary = { ...EMPTY_REAPPLY };
  const open: OpenAccrual[] = [];
  for (const r of rows) {
    if (r.salaryPaymentId) summary.settled += 1;
    else open.push(r);
  }
  if (open.length === 0) return summary;

  const resolveRate = await loadRateResolver(tx, scope);
  const courses = await loadCourses(tx, open);
  const frozen = await loadFrozen(tx, scope.companyId, open, courses, fromDate);
  // A monthly-course lesson with no charge was billed by a pack (ADR-0051).
  const pack = await loadPackLessonPrices(
    tx,
    scope.companyId,
    packPriceCandidates(
      open.map((r) => ({
        id: r.attendanceId as string,
        studentId: r.studentId,
        groupId: r.groupId,
        date: r.lessonDate,
      })),
      new Map([...courses].map(([id, course]) => [id, { course }])),
      frozen,
    ),
  );

  const changes: Change[] = [];
  for (const row of open) {
    const version = resolveRate(row.groupId, row.lessonDate);
    const course = courses.get(row.groupId);
    const amount =
      version && course
        ? priceAccrual(
            version,
            row,
            course,
            frozen,
            pack.get(row.attendanceId as string),
          )
        : null;
    if (version === null || amount === null) {
      summary.unpriced += 1;
      continue;
    }
    if (amount === row.amount && version.id === row.salaryConfigVersionId) {
      continue;
    }
    changes.push({ row, amount, versionId: version.id });
  }
  if (changes.length === 0) return summary;

  await rewriteAccruals(tx, changes);

  const moved = changes.filter((c) => c.amount !== c.row.amount);
  for (const c of moved) {
    summary.lessons += 1;
    summary.before += c.row.amount;
    summary.after += c.amount;
  }
  summary.delta = summary.after - summary.before;
  if (moved.length > 0) await swapBalanceMirror(tx, scope, moved);

  return summary;
}

/**
 * The same choice `SalaryAccrualService.findActiveVersion` makes, in memory:
 * the group's own active config first, the teacher's general one after.
 */
async function loadRateResolver(
  tx: Prisma.TransactionClient,
  scope: RateReapplyScope,
): Promise<(groupId: string, at: Date) => VersionRow | null> {
  const configs = await tx.employeeSalaryConfig.findMany({
    where: { userId: scope.userId, companyId: scope.companyId, isActive: true },
    select: {
      groupId: true,
      versions: {
        select: {
          id: true,
          salaryType: true,
          value: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
    },
  });
  const byGroup = new Map<string, VersionRow[]>();
  const general: VersionRow[] = [];
  for (const c of configs) {
    if (c.groupId === null) general.push(...c.versions);
    else
      byGroup.set(c.groupId, [
        ...(byGroup.get(c.groupId) ?? []),
        ...c.versions,
      ]);
  }
  return (groupId, at) =>
    pickActiveVersion(byGroup.get(groupId), at) ??
    pickActiveVersion(general, at);
}

async function loadCourses(
  tx: Prisma.TransactionClient,
  open: OpenAccrual[],
): Promise<Map<string, GapCourse>> {
  const groups = await tx.group.findMany({
    where: { id: { in: [...new Set(open.map((r) => r.groupId))] } },
    select: {
      id: true,
      course: {
        select: { price: true, lessonPaymentCount: true, paymentModel: true },
      },
    },
  });
  return new Map(groups.map((g) => [g.id, g.course]));
}

async function loadFrozen(
  tx: Prisma.TransactionClient,
  companyId: number,
  open: OpenAccrual[],
  courses: Map<string, GapCourse>,
  fromDate: Date,
): Promise<Map<string, FrozenMonthlyCharge>> {
  const monthly = open.filter(
    (r) => courses.get(r.groupId)?.paymentModel === PaymentModel.MONTHLY,
  );
  if (monthly.length === 0) return new Map();
  const last = monthly.reduce(
    (max, r) => (r.lessonDate > max ? r.lessonDate : max),
    fromDate,
  );
  return loadFrozenMonthlyCharges(tx, {
    companyId,
    studentIds: monthly.map((r) => r.studentId),
    groupIds: monthly.map((r) => r.groupId),
    periods: periodsInRange(
      fromDate,
      utcMidnightFromDateStr(addDaysToDateStr(tashkentDateStr(last), 1)),
    ),
  });
}

/**
 * The lesson's pay under `version`, or null when it cannot be priced.
 *
 * A percentage is taken of the price the lesson was billed at, frozen on the
 * accrual. A per-student sum is split over the cycle — the course's
 * `lessonPaymentCount`, or on a monthly course that month's planned lessons —
 * through `resolveLessonPricing`, the divisor the live and payroll paths use.
 */
function priceAccrual(
  version: VersionRow,
  row: OpenAccrual,
  course: GapCourse,
  frozen: Map<string, FrozenMonthlyCharge>,
  packPrice: number | null | undefined,
): number | null {
  if (version.salaryType === 'PERCENTAGE') {
    return row.perLessonCost > 0
      ? perLessonAccrual(version, row.perLessonCost, 0)
      : null;
  }
  if (version.salaryType === 'FIXED_PER_STUDENT') {
    const pricing = resolveLessonPricing(
      course,
      row.studentId,
      row.groupId,
      row.lessonDate,
      frozen,
      packPrice,
    );
    return pricing
      ? perLessonAccrual(version, row.perLessonCost, pricing.divisor)
      : null;
  }
  return null; // FIXED_MONTHLY pays no lesson.
}

async function rewriteAccruals(
  tx: Prisma.TransactionClient,
  changes: Change[],
): Promise<void> {
  // One update per distinct (amount, version): a rate change produces a
  // handful of distinct amounts, however many lessons it touches.
  const batches = new Map<
    string,
    { amount: number; versionId: string; ids: string[] }
  >();
  for (const c of changes) {
    const key = `${c.amount}|${c.versionId}`;
    const batch = batches.get(key) ?? {
      amount: c.amount,
      versionId: c.versionId,
      ids: [],
    };
    batch.ids.push(c.row.id);
    batches.set(key, batch);
  }
  for (const b of batches.values()) {
    await tx.salaryAccrual.updateMany({
      where: { id: { in: b.ids } },
      data: { amount: b.amount, salaryConfigVersionId: b.versionId },
    });
  }
}

/**
 * Keep `User.balance` and its SALARY_ACCRUAL rows equal to the accruals:
 * each lesson's credit is reversed and posted again at the new amount, the
 * same reverse-and-repost `SalaryAccrualService` uses, so the ledger stays
 * append-only and each (lesson, teacher) keeps exactly one live credit.
 *
 * A lesson with no credit row is left without one — this path corrects the
 * mirror, it does not create history that was never written.
 */
async function swapBalanceMirror(
  tx: Prisma.TransactionClient,
  scope: RateReapplyScope,
  moved: Change[],
): Promise<void> {
  const credits = await tx.transaction.findMany({
    where: {
      teacherId: scope.userId,
      type: TransactionType.SALARY_ACCRUAL,
      reversedAt: null,
      reversedTransactionId: null,
      attendanceId: { in: moved.map((c) => c.row.attendanceId as string) },
    },
    select: {
      id: true,
      attendanceId: true,
      amount: true,
      branchId: true,
      companyId: true,
    },
  });
  const creditByLesson = new Map<string, (typeof credits)[number]>();
  for (const c of credits) {
    if (c.attendanceId && !creditByLesson.has(c.attendanceId)) {
      creditByLesson.set(c.attendanceId, c);
    }
  }
  const withCredit = moved.filter((c) =>
    creditByLesson.has(c.row.attendanceId as string),
  );
  if (withCredit.length === 0) return;

  const users = await tx.$queryRaw<{ balance: number }[]>`
    SELECT balance FROM "User" WHERE id = ${scope.userId} FOR UPDATE
  `;
  if (users.length === 0) return;
  let balance = users[0].balance;

  const data: Prisma.TransactionCreateManyInput[] = [];
  for (const c of withCredit) {
    const credit = creditByLesson.get(c.row.attendanceId as string)!;
    const common = {
      type: TransactionType.SALARY_ACCRUAL,
      teacherId: scope.userId,
      attendanceId: credit.attendanceId,
      // The GROUP's branch, stamped on the original credit (D3).
      branchId: credit.branchId,
      companyId: credit.companyId,
      performedById: scope.performedById,
    };
    data.push({
      ...common,
      amount: -credit.amount,
      balanceBefore: balance,
      balanceAfter: balance - credit.amount,
      reversedTransactionId: credit.id,
      description: REVERSAL_DESCRIPTION,
    });
    balance -= credit.amount;
    data.push({
      ...common,
      amount: c.amount,
      balanceBefore: balance,
      balanceAfter: balance + c.amount,
      description: REPOST_DESCRIPTION,
    });
    balance += c.amount;
  }

  await tx.transaction.createMany({ data });
  await tx.transaction.updateMany({
    where: {
      id: {
        in: withCredit.map(
          (c) => creditByLesson.get(c.row.attendanceId as string)!.id,
        ),
      },
    },
    data: { reversedAt: new Date(), reversedById: scope.performedById },
  });
  await tx.user.update({
    where: { id: scope.userId },
    data: { balance },
  });
}
