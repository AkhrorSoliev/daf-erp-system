import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  SalaryPaymentStatus,
  SalaryType,
  TransactionType,
} from '@prisma/client';
import { resolveCurrentPeriod } from './shared/resolve-current-period';

/**
 * Emitted (collected, not sent) when an accrual is carried over into the
 * current open period because its `lessonDate` fell in an already-closed
 * (APPROVED/PAID) period — e.g. a student paid late. The billing layer
 * bubbles these up so the payment pipeline can notify the teacher AFTER the
 * financial transaction commits (never inside it).
 */
export interface CarriedOverAccrual {
  teacherId: number;
  studentId: number;
  groupId: string;
  amount: number;
  lessonDate: Date;
  creditPeriodDate: Date;
  companyId: number;
}

/**
 * Aggregate event payload emitted (post-commit) by the payment pipeline when
 * one or more accruals were carried over for a student's late payment.
 * Consumed by `NotificationEventsListener`, which groups by teacher and tells
 * each affected teacher how much of their current payslip came from a prior,
 * already-closed month.
 */
export interface SalaryCarriedOverPayload {
  companyId: number;
  items: CarriedOverAccrual[];
}

@Injectable()
export class SalaryAccrualService {
  private readonly logger = new Logger(SalaryAccrualService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Write a salary accrual for one teacher on one lesson for one student.
   *
   * Coverage rule (Phase B.1): the lesson must be backed by a paid
   * LESSON_DEDUCTION transaction. Callers pass `deductionTransactionId` of the
   * cycle deduction the student is currently consuming. Without it, no accrual
   * is written — teachers don't earn for unpaid lessons.
   *
   * Versioning: the active EmployeeSalaryConfigVersion at `lessonDate`
   * determines the rate. Per-group version takes priority over global; this
   * is enforced via two separate queries because Postgres NULL ordering on
   * `groupId DESC` is not portable across drivers.
   *
   * FIXED_PER_STUDENT semantics: the configured `value` represents what the
   * teacher earns from one student over one full cycle (lessonPaymentCount
   * lessons). Per-lesson is `value / lessonPaymentCount` — NOT `value`,
   * which would over-pay by N×.
   */
  async createAccrual(params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    attendanceId: string;
    lessonDate: Date;
    perLessonCost: number;
    companyId: number;
    deductionTransactionId?: string | null;
    tx?: Prisma.TransactionClient;
    // When provided, a carry-over (closed-period redirect) pushes an event
    // here so the caller can notify the teacher post-commit.
    carriedOverSink?: CarriedOverAccrual[];
    // Faza 2 — center-funded top-up accrual for an uncovered ("gap") lesson.
    // Bypasses the B.1 coverage gate (no student deduction backs it — the
    // center fronts the teacher's full deserved pay) and marks the row
    // `isCenterTopUp=true`. Never carried over: the calc writes it into the
    // (still-open) period it is settling. When the student later pays, the
    // normal covered path upserts the SAME natural-key row and flips the flag
    // back to FALSE (recovered) — the teacher is never paid twice.
    centerFunded?: boolean;
    // BR-09b — a center-funded BACKFILL for a new-student lesson whose own
    // period has already closed (the student was below the threshold when that
    // period settled, and has since crossed it). Only valid with
    // `centerFunded=true`: credits the accrual to this explicit period start
    // instead of bucketing by lessonDate, so the current open settlement pays
    // it. Left undefined for an ordinary in-period top-up.
    creditPeriodDateOverride?: Date;
  }) {
    const centerFunded = params.centerFunded ?? false;
    if (!centerFunded && !params.deductionTransactionId) {
      // Student has no active payment cycle — teacher does not earn for this lesson.
      return null;
    }

    const db = params.tx ?? this.prisma;

    // Period-closed policy: if the lesson date falls inside a SalaryPayment
    // period that has ALREADY BEEN SETTLED for this teacher — i.e. the payroll
    // cron has run for it and created a payment (CALCULATED, or later APPROVED/
    // PAID) — that month is done and a late accrual dated there must NOT leak
    // back into it (it would either strand unpaid or wrongly re-fold into the
    // old draft). Note: CALCULATED counts as settled here even before the CEO
    // approves it, because the cron settles a period the instant the next one
    // begins, and the business rule is "a lesson paid for AFTER its month closed
    // is paid in the CURRENT open month".
    // Instead of refusing (which silently lost late-payment earnings), we
    // CARRY THE ACCRUAL OVER to the current open period: keep `lessonDate`
    // (so the rate version + breakdown still reflect the real lesson) but set
    // `creditPeriodDate` to the current period start so the calc buckets it
    // there. The teacher is paid in the next cycle, labelled "oldingi oydan".
    //
    // Center-funded accruals skip this entirely — the calc writes them into the
    // open period it is currently settling, so there is never anything to carry.
    let creditPeriodDate: Date | undefined;
    if (!centerFunded) {
      const closedPeriod = await db.salaryPayment.findFirst({
        where: {
          userId: params.teacherId,
          companyId: params.companyId,
          // CALCULATED included: a settled month is "closed" for new late
          // accruals even before the CEO approves it. (The safety-net check
          // below stays APPROVED/PAID-only — the CURRENT open period can still
          // receive the carry-over into its draft.)
          status: {
            in: [
              SalaryPaymentStatus.CALCULATED,
              SalaryPaymentStatus.APPROVED,
              SalaryPaymentStatus.PAID,
            ],
          },
          periodStart: { lte: params.lessonDate },
          periodEnd: { gte: params.lessonDate },
        },
        select: { id: true, status: true },
      });

      if (closedPeriod) {
        const current = await resolveCurrentPeriod(
          db,
          params.companyId,
          new Date(),
        );

        // Safety net: if the CURRENT period is itself already APPROVED/PAID
        // (should never happen — payroll closes at period end, not mid-cycle),
        // there is no open period to credit. Preserve the old refuse-and-log
        // behaviour so the accrual isn't dumped into another closed window.
        const currentClosed = await db.salaryPayment.findFirst({
          where: {
            userId: params.teacherId,
            companyId: params.companyId,
            status: {
              in: [SalaryPaymentStatus.APPROVED, SalaryPaymentStatus.PAID],
            },
            periodStart: { lte: current.periodEnd },
            periodEnd: { gte: current.periodStart },
          },
          select: { id: true, status: true },
        });
        if (currentClosed) {
          this.logger.error(
            `Cannot carry over accrual: both the lesson period and the current period are closed. teacher ${params.teacherId}, lessonDate ${params.lessonDate.toISOString()}, current [${current.periodStart.toISOString()}..${current.periodEnd.toISOString()}] (SalaryPayment ${currentClosed.id} is ${currentClosed.status}). Admin must credit manually (Balance Withdrawal).`,
          );
          return null;
        }

        creditPeriodDate = current.periodStart;
        this.logger.log(
          `Carrying over accrual for teacher ${params.teacherId}: lessonDate ${params.lessonDate.toISOString()} is in closed SalaryPayment ${closedPeriod.id} (${closedPeriod.status}); crediting current period starting ${creditPeriodDate.toISOString()}.`,
        );
      }
    } else if (params.creditPeriodDateOverride) {
      // BR-09b backfill: a center-funded top-up for a withheld new-student
      // lesson whose own period has closed → credit it to the current open
      // period explicitly so this settlement pays it.
      creditPeriodDate = params.creditPeriodDateOverride;
    }

    // Two-query lookup. Per-group beats global at the same effective range.
    // Postgres NULL ordering with `groupId DESC` happens to put non-null first
    // but that's not contractual; explicit two-step is portable and obvious.
    const version = await this.findActiveVersion(db, {
      teacherId: params.teacherId,
      groupId: params.groupId,
      companyId: params.companyId,
      lessonDate: params.lessonDate,
    });

    if (!version) return null;

    let amount: number;
    if (version.salaryType === SalaryType.PERCENTAGE) {
      amount = Math.round((params.perLessonCost * version.value) / 100);
    } else {
      // FIXED_PER_STUDENT: `value` is the per-cycle amount. Divide by the
      // course's lessonPaymentCount to get per-lesson. This used to write
      // the full value per lesson, which silently multiplied teacher pay
      // by lessonPaymentCount — fixed in Faza 2.
      const lessonCount = await this.getCourseLessonCount(db, params.groupId);
      amount = lessonCount > 0
        ? Math.round(version.value / lessonCount)
        : version.value;
    }

    // Carry-over notification must fire only for a genuinely NEW accrual. When
    // a lesson was already paid via a center top-up, this covered-path write
    // just UPDATES that existing row (recovery) — carrying over / notifying the
    // teacher then would be wrong. Detect existence up front, but only on the
    // (rare) carry-over path so the hot billing path pays no extra query.
    let carryOverIsFresh = false;
    if (creditPeriodDate) {
      const already = await db.salaryAccrual.findUnique({
        where: {
          userId_studentId_groupId_lessonDate_attendanceId: {
            userId: params.teacherId,
            studentId: params.studentId,
            groupId: params.groupId,
            lessonDate: params.lessonDate,
            attendanceId: params.attendanceId,
          },
        },
        select: { id: true },
      });
      carryOverIsFresh = !already;
    }

    const accrual = await db.salaryAccrual.upsert({
      where: {
        userId_studentId_groupId_lessonDate_attendanceId: {
          userId: params.teacherId,
          studentId: params.studentId,
          groupId: params.groupId,
          lessonDate: params.lessonDate,
          attendanceId: params.attendanceId,
        },
      },
      create: {
        userId: params.teacherId,
        studentId: params.studentId,
        groupId: params.groupId,
        attendanceId: params.attendanceId,
        lessonDate: params.lessonDate,
        amount,
        perLessonCost: params.perLessonCost,
        companyId: params.companyId,
        deductionTransactionId: params.deductionTransactionId,
        salaryConfigVersionId: version.id,
        // Center-funded gap accrual vs. ordinary student-covered accrual.
        isCenterTopUp: centerFunded,
        // Sticky mirror — set TRUE on a center-funded create, never cleared, so
        // a later recovery (flag flip below) can't erase "this was a top-up".
        wasCenterTopUp: centerFunded,
        // Write-once: only set on the initial create. `undefined` here means
        // "no carry-over" (column stays NULL → bucket by lessonDate as usual).
        creditPeriodDate,
      },
      update: {
        amount,
        perLessonCost: params.perLessonCost,
        attendanceId: params.attendanceId,
        deductionTransactionId: params.deductionTransactionId,
        salaryConfigVersionId: version.id,
        // Re-asserting the row after an undo/edit clears stale reversal audit.
        reversedAt: null,
        reversedById: null,
        reversalReason: null,
        // Recovery flip: when a real student-covered deduction later settles a
        // lesson the center had fronted, the accrual becomes genuinely covered
        // → clear the flag. A re-run of the gap sweep (centerFunded) leaves it
        // untouched so a still-uncovered lesson stays marked as a top-up.
        ...(centerFunded ? {} : { isCenterTopUp: false }),
        // Sticky top-up history: a gap-sweep re-run (centerFunded) asserts it
        // TRUE; the recovery path leaves it untouched (already TRUE from the
        // original top-up create). Never set back to FALSE.
        ...(centerFunded ? { wasCenterTopUp: true } : {}),
        // `creditPeriodDate` intentionally NOT updated here — the carry-over
        // target is decided exactly once, on first write, so re-running
        // retroactive billing can never drift the accrual to a later period.
      },
    });

    // Surface a fresh carry-over so the caller can notify the teacher after
    // the financial transaction commits. The upstream idempotency guards
    // (LESSON_CONSUMPTION check in bill(), salaryDeferred flag in
    // settleDeferredAccruals) ensure this branch runs once per accrual, so we
    // don't double-notify on re-runs. `carryOverIsFresh` additionally suppresses
    // the notification when this write merely RECOVERED a row the center had
    // already paid via top-up (the row existed → nothing was carried over).
    if (creditPeriodDate && carryOverIsFresh && params.carriedOverSink) {
      params.carriedOverSink.push({
        teacherId: params.teacherId,
        studentId: params.studentId,
        groupId: params.groupId,
        amount,
        lessonDate: params.lessonDate,
        creditPeriodDate,
        companyId: params.companyId,
      });
    }

    // Mirror the accrual into User.balance via a SALARY_ACCRUAL Transaction.
    // Idempotent: skip if a non-reversed transaction already exists for this
    // (attendanceId, teacherId) — accrual upsert may run multiple times when
    // an attendance is edited/un-reversed.
    await this.applyAccrualToBalance(db, {
      teacherId: params.teacherId,
      attendanceId: params.attendanceId,
      amount,
      companyId: params.companyId,
      groupId: params.groupId,
    });

    return accrual;
  }

  /**
   * Increase teacher's balance by the accrual amount and write an
   * SALARY_ACCRUAL Transaction (audit + ledger). Skips if a non-reversed
   * transaction for this (attendanceId, teacherId) already exists.
   */
  private async applyAccrualToBalance(
    db: Prisma.TransactionClient | PrismaService,
    params: {
      teacherId: number;
      attendanceId: string;
      amount: number;
      companyId: number;
      groupId: string;
    },
  ) {
    const existing = await db.transaction.findFirst({
      where: {
        attendanceId: params.attendanceId,
        teacherId: params.teacherId,
        type: TransactionType.SALARY_ACCRUAL,
        reversedAt: null,
      },
      select: { id: true },
    });
    if (existing) return;

    const users = await db.$queryRaw<{ id: number; balance: number }[]>`
      SELECT id, balance FROM "User" WHERE id = ${params.teacherId} FOR UPDATE
    `;
    if (!users.length) return;
    const balanceBefore = users[0].balance;
    const balanceAfter = balanceBefore + params.amount;

    // D3: a lesson's pay belongs to the branch of the GROUP it was held in,
    // never the teacher's home branch. Stamped (frozen) here rather than joined
    // live at read time, so a group that later moves branch cannot rewrite
    // settled payroll history. This single line is what stops ~4 300
    // branch-less SALARY_ACCRUAL rows a month.
    const group = await db.group.findUnique({
      where: { id: params.groupId },
      select: { branchId: true },
    });

    await db.transaction.create({
      data: {
        type: TransactionType.SALARY_ACCRUAL,
        amount: params.amount,
        balanceBefore,
        balanceAfter,
        teacherId: params.teacherId,
        attendanceId: params.attendanceId,
        branchId: group?.branchId ?? null,
        companyId: params.companyId,
        description: "Dars uchun yig'ildi",
      },
    });
    await db.user.update({
      where: { id: params.teacherId },
      data: { balance: balanceAfter },
    });
  }

  /**
   * Mark a previously-written accrual as reversed (does not delete the row;
   * the calculation query filters by `reversedAt: null` so reversed accruals
   * are excluded from salary runs without losing the audit trail).
   *
   * Called by lesson cancellations and by the lesson-consumption reversal
   * flow when an attendance flips PRESENT→ABSENT.
   */
  async reverseAccrualForAttendance(params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    lessonDate: Date;
    reversedById?: number;
    reversalReason?: string;
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;
    // Lesson-based accruals always have attendanceId set; withdrawal accruals
    // (attendanceId IS NULL) are not the target of this reversal flow.
    const existing = await db.salaryAccrual.findFirst({
      where: {
        userId: params.teacherId,
        studentId: params.studentId,
        groupId: params.groupId,
        lessonDate: params.lessonDate,
        attendanceId: { not: null },
      },
      select: { id: true, reversedAt: true, attendanceId: true, amount: true },
    });
    if (!existing || existing.reversedAt) return null;

    const updated = await db.salaryAccrual.update({
      where: { id: existing.id },
      data: {
        reversedAt: new Date(),
        reversedById: params.reversedById,
        reversalReason: params.reversalReason,
      },
    });

    // Mirror reversal: undo the SALARY_ACCRUAL Transaction's effect on User.balance.
    if (existing.attendanceId) {
      await this.reverseAccrualBalance(db, {
        teacherId: params.teacherId,
        attendanceId: existing.attendanceId,
        amount: existing.amount,
        companyId: undefined,
        reversedById: params.reversedById,
        reversalReason: params.reversalReason,
      });
    }

    return updated;
  }

  /**
   * Reverse the SALARY_ACCRUAL Transaction that mirrors the accrual: write a
   * compensating Transaction and decrement User.balance. Idempotent: skips if
   * the original transaction is already reversed or doesn't exist.
   */
  private async reverseAccrualBalance(
    db: Prisma.TransactionClient | PrismaService,
    params: {
      teacherId: number;
      attendanceId: string;
      amount: number;
      companyId?: number;
      reversedById?: number;
      reversalReason?: string;
    },
  ) {
    const original = await db.transaction.findFirst({
      where: {
        attendanceId: params.attendanceId,
        teacherId: params.teacherId,
        type: TransactionType.SALARY_ACCRUAL,
        reversedAt: null,
      },
      select: { id: true, amount: true, companyId: true, branchId: true },
    });
    if (!original) return;

    const users = await db.$queryRaw<{ id: number; balance: number }[]>`
      SELECT id, balance FROM "User" WHERE id = ${params.teacherId} FOR UPDATE
    `;
    if (!users.length) return;
    const balanceBefore = users[0].balance;
    const balanceAfter = balanceBefore - original.amount;

    await db.transaction.create({
      data: {
        type: TransactionType.SALARY_ACCRUAL,
        amount: -original.amount,
        balanceBefore,
        balanceAfter,
        teacherId: params.teacherId,
        attendanceId: params.attendanceId,
        // Inherit the original's branch so a reversal never lands in a
        // different P&L than the row it cancels.
        branchId: original.branchId,
        companyId: original.companyId,
        reversedTransactionId: original.id,
        performedById: params.reversedById,
        description: params.reversalReason ?? 'Dars uchun yig\'ilgan oylik bekor qilindi',
      },
    });
    await db.transaction.update({
      where: { id: original.id },
      data: {
        reversedAt: new Date(),
        reversedById: params.reversedById,
      },
    });
    await db.user.update({
      where: { id: params.teacherId },
      data: { balance: balanceAfter },
    });
  }

  async getAccruals(userId: number, companyId: number) {
    return this.prisma.salaryAccrual.findMany({
      where: {
        userId,
        companyId,
        salaryPaymentId: null,
        reversedAt: null,
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        lessonDate: true,
        amount: true,
        perLessonCost: true,
        createdAt: true,
      },
      orderBy: { lessonDate: 'desc' },
    });
  }

  // ---------- internals ----------

  private async findActiveVersion(
    db: Prisma.TransactionClient | PrismaService,
    params: {
      teacherId: number;
      groupId: string;
      companyId: number;
      lessonDate: Date;
    },
  ) {
    const dateFilter = {
      effectiveFrom: { lte: params.lessonDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: params.lessonDate } },
      ],
    };

    // 1) Per-group config has priority on overlapping ranges.
    const groupVersion = await db.employeeSalaryConfigVersion.findFirst({
      where: {
        ...dateFilter,
        config: {
          userId: params.teacherId,
          groupId: params.groupId,
          companyId: params.companyId,
          isActive: true,
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (groupVersion) return groupVersion;

    // 2) Fallback: global (groupId IS NULL) config for the teacher.
    return db.employeeSalaryConfigVersion.findFirst({
      where: {
        ...dateFilter,
        config: {
          userId: params.teacherId,
          groupId: null,
          companyId: params.companyId,
          isActive: true,
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  private async getCourseLessonCount(
    db: Prisma.TransactionClient | PrismaService,
    groupId: string,
  ): Promise<number> {
    const group = await db.group.findUnique({
      where: { id: groupId },
      select: { course: { select: { lessonPaymentCount: true } } },
    });
    return group?.course.lessonPaymentCount || 12;
  }
}
