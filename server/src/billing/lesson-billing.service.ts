import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  LessonDeductionMode,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';

// Business rule: a lesson held = a lesson paid. The student's prepaid
// quota is consumed (and the teacher earns) for any status that confirms
// the lesson actually took place — regardless of whether the student
// physically attended. Only EXCUSED ("uzrli sabab — kechirildi") and
// cancelled lessons skip billing entirely.
const BILLABLE: ReadonlySet<AttendanceStatus> = new Set([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.ABSENT,
]);

function clampDiscount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function applyDiscount(fullAmount: number, discountPercent: number): number {
  if (discountPercent <= 0) return fullAmount;
  if (discountPercent >= 100) return 0;
  return Math.round((fullAmount * (100 - discountPercent)) / 100);
}

export interface ProcessAttendanceBillingParams {
  attendanceId: string;
  enrollmentId: string;
  studentId: number;
  groupId: string;
  branchId: number;
  lessonDate: Date;
  oldStatus: AttendanceStatus | null; // null = brand-new attendance
  newStatus: AttendanceStatus;
  companyId: number;
  performedById?: number;
}

/**
 * The single source of truth for "what happens to balances + prepaid +
 * salary accruals when an attendance is saved or edited?".
 *
 * Both manual (`attendance-save`) and QR (`qr-attendance-scan`) flows
 * delegate here so they stay byte-for-byte identical.
 *
 * Always called from inside an outer `prisma.$transaction(Serializable)` —
 * the `tx` parameter is REQUIRED.
 *
 * Status transition matrix:
 *   eski        →  yangi              →  harakat
 *   ────────────────────────────────────────────
 *   (yo'q)      →  EXCUSED            →  hech narsa
 *   (yo'q)      →  PRESENT/LATE/ABSENT →  bill (consume yoki refill)
 *   EXC         →  EXC                →  hech narsa
 *   EXC         →  PRESENT/LATE/ABSENT →  bill
 *   billable    →  billable (turli)   →  hech narsa
 *   PRES/LATE/ABS →  EXCUSED          →  reverse (consumption + prepaid +1 + accrual reverse)
 *
 * "Billable" — dars haqiqatda o'tdi degani. PRESENT (keldi), LATE (kech keldi)
 * va ABSENT (kelmadi) — uchchalasi ham talabaning prepaid kvotasini sarflaydi
 * va ustozga oylik yozadi: dars o'tdi, talabaning paketdan 1 ta dars ketdi,
 * ustoz mehnat qildi. EXCUSED faqat uzrli sabab bilan rad etilgan vaqt — bu
 * holatda dars hisoblanmaydi.
 */
@Injectable()
export class LessonBillingService {
  private readonly logger = new Logger(LessonBillingService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private salaryAccrualService: SalaryAccrualService,
  ) {}

  async processAttendanceBilling(
    tx: Prisma.TransactionClient,
    params: ProcessAttendanceBillingParams,
  ): Promise<void> {
    const wasBillable =
      params.oldStatus !== null && BILLABLE.has(params.oldStatus);
    const isBillable = BILLABLE.has(params.newStatus);

    if (!wasBillable && isBillable) {
      await this.bill(tx, params);
    } else if (wasBillable && !isBillable) {
      await this.reverse(tx, params);
    }
    // Other transitions: no-op.
  }

  /**
   * Retroactively settle every billable attendance for a student that has
   * no active LESSON_CONSUMPTION row yet (B.1: lesson held but balance was
   * insufficient at the time). Called from the payments pipeline right after
   * a top-up lands so the new balance immediately covers past unpaid lessons
   * and accrues the corresponding teacher salary.
   *
   * Iteration is per-enrollment, oldest attendance first. For each unpaid
   * attendance we delegate to `bill()` which re-reads the live balance and
   * picks full / partial / insufficient — exactly the same branching the
   * normal attendance flow uses. Idempotent via the LESSON_CONSUMPTION guard
   * inside `bill()`, so calling it twice is harmless.
   *
   * Caller is expected to hand us a Serializable tx (the payment write
   * transaction). When invoked from outside a payment, use
   * `runRetroactiveBilling()` which opens its own Serializable tx.
   */
  async processRetroactiveBillingForStudent(
    tx: Prisma.TransactionClient,
    params: {
      studentId: number;
      companyId: number;
      performedById?: number;
      // Optional date floor — when set, only unpaid attendances on/after
      // this date are billed. Used by the backfill script to scope the
      // catch-up to a specific month (e.g. May 2026 only, skipping older
      // unpaid lessons admins decided to write off).
      fromDate?: Date;
    },
  ): Promise<{ billedAttendances: number }> {
    const enrollments = await tx.enrollment.findMany({
      where: {
        studentId: params.studentId,
        deletedAt: null,
        status: 'ACTIVE',
        group: { companyId: params.companyId, deletedAt: null },
      },
      select: {
        id: true,
        groupId: true,
        group: { select: { branchId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (enrollments.length === 0) {
      return { billedAttendances: 0 };
    }

    let billedCount = 0;

    for (const enr of enrollments) {
      // Unpaid = PRESENT/LATE/ABSENT attendance with no active
      // LESSON_CONSUMPTION row. Order by date so we settle the oldest first
      // (FIFO) — matches what an admin would do manually.
      const fromFilter = params.fromDate
        ? Prisma.sql`AND a.date >= ${params.fromDate}`
        : Prisma.empty;
      const unpaidRows = await tx.$queryRaw<
        { id: string; date: Date }[]
      >`
        SELECT a.id, a.date
        FROM "Attendance" a
        WHERE a."studentId" = ${params.studentId}
          AND a."groupId" = ${enr.groupId}
          AND a.status::text IN ('PRESENT', 'LATE', 'ABSENT')
          AND NOT EXISTS (
            SELECT 1 FROM "Transaction" t
            WHERE t."attendanceId" = a.id
              AND t.type = 'LESSON_CONSUMPTION'
              AND t."reversedAt" IS NULL
          )
          ${fromFilter}
        ORDER BY a.date ASC
      `;

      for (const att of unpaidRows) {
        // Every unpaid attendance gets billed — `bill()` picks the right
        // branch (full cycle / partial / SINGLE_UNCOVERED) based on the
        // live balance + prepaid snapshot it reads internally. If balance
        // runs out, Path D writes a SINGLE_UNCOVERED row and balance goes
        // negative so the real debt is preserved in the ledger (this is
        // the whole point of the change — "aniq raqamlar"). The previous
        // `break` on insufficient balance hid the debt and led to the
        // single-lesson display ceiling bug.
        await this.bill(tx, {
          attendanceId: att.id,
          enrollmentId: enr.id,
          studentId: params.studentId,
          groupId: enr.groupId,
          branchId: enr.group.branchId,
          lessonDate: att.date,
          oldStatus: null,
          newStatus: AttendanceStatus.PRESENT,
          companyId: params.companyId,
          performedById: params.performedById,
        });

        // bill() always writes a LESSON_CONSUMPTION now (audit row), so
        // the count reflects every settled attendance. The only case
        // where consumption is skipped is the defensive zero-price guard
        // — treat that as "couldn't bill, stop trying for this enrollment".
        const consumed = await tx.transaction.findFirst({
          where: {
            attendanceId: att.id,
            type: TransactionType.LESSON_CONSUMPTION,
            reversedAt: null,
          },
          select: { id: true },
        });
        if (!consumed) break;
        billedCount += 1;
      }
    }

    // Phase 2: settle deferred teacher salary accruals for SINGLE_UNCOVERED
    // deductions whose debt has now been covered (FIFO).
    //
    // Each SINGLE_UNCOVERED row records an uncovered slice in metadata.
    // After a payment lands, walk those rows oldest-first and apply the
    // newly-available coverage. A row is fully covered → write the missing
    // SalaryAccrual + flip the metadata flags. A row is partially covered →
    // shrink uncoveredAmount only; the teacher still waits.
    await this.settleDeferredAccruals(tx, params);

    return { billedAttendances: billedCount };
  }

  private async settleDeferredAccruals(
    tx: Prisma.TransactionClient,
    params: {
      studentId: number;
      companyId: number;
      performedById?: number;
    },
  ): Promise<void> {
    const deferredRows = await tx.transaction.findMany({
      where: {
        studentId: params.studentId,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        metadata: { path: ['salaryDeferred'], equals: true },
      },
      select: {
        id: true,
        attendanceId: true,
        enrollmentId: true,
        branchId: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (deferredRows.length === 0) return;

    let totalUncovered = 0;
    for (const row of deferredRows) {
      const md = (row.metadata ?? {}) as Record<string, unknown>;
      const uncovered = Number(md.uncoveredAmount ?? 0);
      if (Number.isFinite(uncovered) && uncovered > 0) {
        totalUncovered += uncovered;
      }
    }

    const studentRow = await tx.student.findUnique({
      where: { id: params.studentId },
      select: { balance: true },
    });
    const finalBalance = studentRow?.balance ?? 0;
    const currentDebt = finalBalance < 0 ? -finalBalance : 0;
    let amountToApply = Math.max(0, totalUncovered - currentDebt);

    if (amountToApply <= 0) return;

    for (const row of deferredRows) {
      if (amountToApply <= 0) break;
      if (!row.attendanceId) continue;

      const md = (row.metadata ?? {}) as Record<string, unknown>;
      const rowUncovered = Number(md.uncoveredAmount ?? 0);
      if (!Number.isFinite(rowUncovered) || rowUncovered <= 0) continue;

      const applied = Math.min(rowUncovered, amountToApply);
      const newUncovered = rowUncovered - applied;
      amountToApply -= applied;

      if (newUncovered > 0) {
        // Partial coverage — keep deferred, just shrink the remaining debt.
        await tx.transaction.update({
          where: { id: row.id },
          data: {
            metadata: { ...md, uncoveredAmount: newUncovered },
          },
        });
        continue;
      }

      // Fully covered: write the missing SalaryAccrual rows + clear flags.
      const attendance = await tx.attendance.findUnique({
        where: { id: row.attendanceId },
        select: { date: true, groupId: true },
      });
      if (!attendance) {
        // Defensive — attendance shouldn't disappear, but if it did, just
        // clear the flag and move on. Without the lesson context we can't
        // resolve teachers anyway.
        await tx.transaction.update({
          where: { id: row.id },
          data: {
            metadata: { ...md, uncoveredAmount: 0, salaryDeferred: false },
          },
        });
        continue;
      }

      const perLessonCost = Number(md.perLessonCost ?? 0);
      const teacherIds = await this.resolveTeachersForLesson(
        tx,
        attendance.groupId,
        attendance.date,
      );
      for (const teacherId of teacherIds) {
        try {
          await this.salaryAccrualService.createAccrual({
            teacherId,
            studentId: params.studentId,
            groupId: attendance.groupId,
            attendanceId: row.attendanceId,
            lessonDate: attendance.date,
            perLessonCost,
            companyId: params.companyId,
            deductionTransactionId: row.id,
            tx,
          });
        } catch (err) {
          this.logger.error(
            `Deferred salary accrual failed for teacher ${teacherId}`,
            err,
          );
        }
      }

      await tx.transaction.update({
        where: { id: row.id },
        data: {
          metadata: { ...md, uncoveredAmount: 0, salaryDeferred: false },
        },
      });
    }
  }

  /**
   * Public entry point for the manual "qaytadan hisobla" admin endpoint.
   * Opens its own Serializable transaction (matching the rest of the
   * financial layer) and delegates to `processRetroactiveBillingForStudent`.
   */
  async runRetroactiveBilling(params: {
    studentId: number;
    companyId: number;
    performedById?: number;
  }): Promise<{ billedAttendances: number }> {
    return this.prisma.$transaction(
      (tx) => this.processRetroactiveBillingForStudent(tx, params),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15_000,
        timeout: 60_000,
      },
    );
  }

  // ===== BILL (charge a lesson) =====
  private async bill(
    tx: Prisma.TransactionClient,
    p: ProcessAttendanceBillingParams,
  ): Promise<void> {
    // Idempotency: if a non-reversed LESSON_CONSUMPTION already exists for
    // this attendance, the lesson was already billed. Re-saves of the same
    // attendance must NOT decrement prepaid a second time.
    // "Still active" = reversedAt IS NULL. After a PRESENT→ABSENT undo,
    // the original consumption row is marked reversedAt, so re-billing on
    // ABSENT→PRESENT correctly proceeds to write a fresh consumption.
    const existing = await tx.transaction.findFirst({
      where: {
        attendanceId: p.attendanceId,
        type: TransactionType.LESSON_CONSUMPTION,
        reversedAt: null,
      },
      select: { id: true },
    });
    if (existing) return;

    // Lock the enrollment row so two concurrent attendance writes can't
    // both decrement prepaid. Serializable + this lock is the
    // belt-and-braces concurrency guard.
    const enrollments = await tx.$queryRaw<
      { id: string; prepaidLessonsRemaining: number; startDate: Date | null }[]
    >`SELECT id, "prepaidLessonsRemaining", "startDate" FROM "Enrollment" WHERE id = ${p.enrollmentId} FOR UPDATE`;
    if (!enrollments.length) {
      this.logger.warn(`Enrollment ${p.enrollmentId} not found — skipping bill`);
      return;
    }
    const enrollment = enrollments[0];

    // Defense-in-depth: even if attendance UI / QR layers somehow let a
    // not-yet-started enrollment through, the billing layer refuses. The
    // student isn't part of this lesson yet — no consumption, no accrual.
    if (enrollment.startDate && enrollment.startDate > p.lessonDate) {
      this.logger.warn(
        `Enrollment ${p.enrollmentId} startDate ${enrollment.startDate.toISOString()} > lesson ${p.lessonDate.toISOString()} — skipping bill`,
      );
      return;
    }

    const group = await tx.group.findUnique({
      where: { id: p.groupId },
      select: {
        course: { select: { price: true, lessonPaymentCount: true } },
        contracts: {
          where: { studentId: p.studentId, status: 'ACTIVE', deletedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!group) return;

    // Per-student discount (0–100). Applied at billing time: shrinks the
    // amount deducted from balance but keeps `perLessonCost` (and therefore
    // the teacher's salary accrual) at the full, un-discounted rate.
    const studentRowForDiscount = await tx.student.findUnique({
      where: { id: p.studentId },
      select: { discountPercent: true },
    });
    const discountPercent = clampDiscount(
      studentRowForDiscount?.discountPercent ?? 0,
    );

    // Effective teacher list for THIS lesson (override-aware). Falls back to
    // GroupTeacher when no override is set for (groupId, lessonDate).
    const teacherIds = await this.resolveTeachersForLesson(
      tx,
      p.groupId,
      p.lessonDate,
    );

    const lessonPaymentCount = group.course.lessonPaymentCount || 12;
    const fullCycleCost = group.course.price;
    const perLessonCost = Math.round(fullCycleCost / lessonPaymentCount);
    const discountedFullCycleCost = applyDiscount(fullCycleCost, discountPercent);
    const discountedPerLessonCost = applyDiscount(perLessonCost, discountPercent);
    const contractId = group.contracts[0]?.id;

    let coverageTransactionId: string | undefined;

    if (enrollment.prepaidLessonsRemaining > 0) {
      // Prepaid units available — just decrement and write the audit row.
      await tx.enrollment.update({
        where: { id: p.enrollmentId },
        data: { prepaidLessonsRemaining: { decrement: 1 } },
      });
      // Coverage tx for salary accrual (B.1) is the most recent
      // LESSON_DEDUCTION batch on this enrollment.
      const recentBatch = await tx.transaction.findFirst({
        where: {
          enrollmentId: p.enrollmentId,
          type: TransactionType.LESSON_DEDUCTION,
          reversedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      coverageTransactionId = recentBatch?.id;
    } else {
      // Need to refill from balance. SELECT FOR UPDATE on Student.balance is
      // done inside deductLessonFee (lockStudent helper). Here we just check
      // whether to deduct full or partial.
      const student = await tx.student.findUnique({
        where: { id: p.studentId },
        select: { balance: true },
      });
      const balance = student?.balance ?? 0;

      if (balance >= discountedFullCycleCost) {
        const deduction = await this.transactionsService.deductLessonFee(
          {
            studentId: p.studentId,
            amount: discountedFullCycleCost,
            attendanceId: p.attendanceId,
            enrollmentId: p.enrollmentId,
            contractId,
            companyId: p.companyId,
            branchId: p.branchId,
            mode: LessonDeductionMode.FULL_CYCLE,
            perLessonCost,
            lessonsCovered: lessonPaymentCount,
            discountPercent,
            fullAmount: fullCycleCost,
          },
          tx,
        );
        await tx.enrollment.update({
          where: { id: p.enrollmentId },
          data: { prepaidLessonsRemaining: lessonPaymentCount - 1 },
        });
        coverageTransactionId = deduction.id;
      } else if (
        discountedPerLessonCost > 0 &&
        balance >= discountedPerLessonCost
      ) {
        const lessonsCovered = Math.floor(balance / discountedPerLessonCost);
        const partialAmount = lessonsCovered * discountedPerLessonCost;
        const fullAmount = lessonsCovered * perLessonCost;
        const deduction = await this.transactionsService.deductLessonFee(
          {
            studentId: p.studentId,
            amount: partialAmount,
            attendanceId: p.attendanceId,
            enrollmentId: p.enrollmentId,
            contractId,
            companyId: p.companyId,
            branchId: p.branchId,
            mode: LessonDeductionMode.PARTIAL,
            perLessonCost,
            lessonsCovered,
            discountPercent,
            fullAmount,
          },
          tx,
        );
        await tx.enrollment.update({
          where: { id: p.enrollmentId },
          data: { prepaidLessonsRemaining: lessonsCovered - 1 },
        });
        coverageTransactionId = deduction.id;
      } else if (discountedPerLessonCost > 0) {
        // Balance can't cover even one (discounted) lesson. Previously this
        // branch silently no-op'd and the UI showed a static one-lesson
        // shortfall — masking the real debt as more lessons piled up. We now
        // deduct the full per-lesson cost anyway, letting balance go
        // negative, so each unpaid attendance accumulates real debt.
        //
        // B.1 is preserved by deferring the teacher's salary accrual:
        // `salaryDeferred: true` + `uncoveredAmount` mark the deduction so
        // `processRetroactiveBillingForStudent()` can settle it (and write
        // the missing accrual) when a payment lands.
        await this.transactionsService.deductLessonFee(
          {
            studentId: p.studentId,
            amount: discountedPerLessonCost,
            attendanceId: p.attendanceId,
            enrollmentId: p.enrollmentId,
            contractId,
            companyId: p.companyId,
            branchId: p.branchId,
            mode: LessonDeductionMode.SINGLE_UNCOVERED,
            perLessonCost,
            lessonsCovered: 1,
            discountPercent,
            fullAmount: perLessonCost,
            salaryDeferred: true,
            uncoveredAmount: discountedPerLessonCost,
          },
          tx,
        );
        // Leave coverageTransactionId undefined: the consumption row below
        // still gets written (audit + idempotency), but the SalaryAccrual
        // loop short-circuits — accrual is deferred per B.1.
      } else {
        // perLessonCost is zero (free course) — nothing to deduct, nothing
        // to accrue, no consumption row. Defensive guard for edge data.
        return;
      }
    }

    // Audit-only consumption row for this attendance. Partial unique index
    // on (attendanceId) WHERE type=LESSON_CONSUMPTION AND
    // reversedTransactionId IS NULL gives us idempotency at the DB level.
    await this.transactionsService.recordLessonConsumption(
      {
        studentId: p.studentId,
        attendanceId: p.attendanceId,
        enrollmentId: p.enrollmentId,
        perLessonCost,
        contractId,
        companyId: p.companyId,
        branchId: p.branchId,
      },
      tx,
    );

    // Salary accruals — one per teacher resolved for THIS lesson. When a
    // LessonTeacherOverride exists for (groupId, lessonDate), `teacherIds`
    // holds the substitute roster (e.g. Aziz instead of Botir); otherwise
    // it's the standard GroupTeacher list.
    if (coverageTransactionId) {
      for (const teacherId of teacherIds) {
        try {
          await this.salaryAccrualService.createAccrual({
            teacherId,
            studentId: p.studentId,
            groupId: p.groupId,
            attendanceId: p.attendanceId,
            lessonDate: p.lessonDate,
            perLessonCost,
            companyId: p.companyId,
            deductionTransactionId: coverageTransactionId,
            tx,
          });
        } catch (err) {
          this.logger.error(
            `Salary accrual failed for teacher ${teacherId}`,
            err,
          );
        }
      }
    }
  }

  // ===== REVERSE (undo a billed lesson) =====
  private async reverse(
    tx: Prisma.TransactionClient,
    p: ProcessAttendanceBillingParams,
  ): Promise<void> {
    const consumption = await tx.transaction.findFirst({
      where: {
        attendanceId: p.attendanceId,
        type: TransactionType.LESSON_CONSUMPTION,
        reversedAt: null,
      },
      select: { id: true },
    });

    // Even if there's no consumption (Misol 7: insufficient balance, no
    // billing happened), we still try to reverse any accrual that snuck
    // through. Without consumption, prepaid is NOT incremented — we don't
    // hand out free lessons. Resolver picks up the override if one exists
    // for (groupId, lessonDate), so the substitute's accrual is the one
    // that gets reversed — not the regular GroupTeacher list.
    const teacherIds = await this.resolveTeachersForLesson(
      tx,
      p.groupId,
      p.lessonDate,
    );
    for (const teacherId of teacherIds) {
      await this.salaryAccrualService.reverseAccrualForAttendance({
        teacherId,
        studentId: p.studentId,
        groupId: p.groupId,
        lessonDate: p.lessonDate,
        reversedById: p.performedById,
        reversalReason: 'attendance status changed',
        tx,
      });
    }

    if (consumption) {
      await this.transactionsService.reverseLessonConsumption(
        consumption.id,
        {
          performedById: p.performedById,
          reason: 'attendance status changed',
        },
        tx,
      );
      // Restore one prepaid unit — the student gets that lesson back.
      await tx.enrollment.update({
        where: { id: p.enrollmentId },
        data: { prepaidLessonsRemaining: { increment: 1 } },
      });
    }
  }

  /**
   * Reverse an entire LESSON_DEDUCTION batch (Q4 — admin correction). This
   * restores balance, reverses every salary accrual that the batch covered
   * (B.1: teacher only earns on paid lessons), reverses the LESSON_CONSUMPTION
   * audit rows linked to the same enrollment that drew from this batch, and
   * resets the enrollment's prepaid counter so subsequent attendance hits
   * the refill path against the now-restored balance.
   *
   * Use case: admin entered the wrong amount on a payment-driven cycle, or
   * the cycle was triggered for the wrong group. Distinct from a lesson-level
   * attendance flip — this is a "this whole batch never should have been
   * billed" undo, not "this one lesson didn't happen".
   */
  async reverseLessonDeduction(
    deductionTransactionId: string,
    params: { performedById: number; reason?: string; companyId: number },
  ): Promise<{ reversedTransactionId: string; reversedAccruals: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const deduction = await tx.transaction.findFirst({
          where: {
            id: deductionTransactionId,
            type: TransactionType.LESSON_DEDUCTION,
            companyId: params.companyId,
          },
          select: {
            id: true,
            enrollmentId: true,
            reversedAt: true,
            metadata: true,
          },
        });
        if (!deduction) {
          throw new Error("LESSON_DEDUCTION yozuvi topilmadi");
        }
        if (deduction.reversedAt) {
          throw new Error("Bu yozuv allaqachon bekor qilingan");
        }

        // Reverse the deduction itself (balance is restored, original is
        // marked reversedAt by reverseTransaction).
        await this.transactionsService.reverseTransaction(
          deduction.id,
          {
            performedById: params.performedById,
            reason: params.reason ?? "Admin tomonidan bekor qilindi",
          },
          tx,
        );

        // Reverse all SalaryAccrual rows that referenced this deduction.
        const accruals = await tx.salaryAccrual.findMany({
          where: {
            deductionTransactionId: deduction.id,
            reversedAt: null,
          },
          select: { id: true },
        });
        for (const a of accruals) {
          await tx.salaryAccrual.update({
            where: { id: a.id },
            data: {
              reversedAt: new Date(),
              reversedById: params.performedById,
              reversalReason:
                params.reason ?? "Pul yechish bekor qilingani uchun",
            },
          });
        }

        // Reverse all LESSON_CONSUMPTION rows for the same enrollment that
        // were created after this deduction (i.e. the audit rows that drew
        // down its prepaid balance).
        if (deduction.enrollmentId) {
          const consumptions = await tx.transaction.findMany({
            where: {
              enrollmentId: deduction.enrollmentId,
              type: TransactionType.LESSON_CONSUMPTION,
              reversedAt: null,
              createdAt: { gte: (deduction as { createdAt?: Date }).createdAt ?? new Date(0) },
            },
            select: { id: true },
          });
          for (const c of consumptions) {
            await this.transactionsService.reverseTransaction(
              c.id,
              {
                performedById: params.performedById,
                reason: 'LESSON_DEDUCTION reversed',
              },
              tx,
            );
          }

          // Reset prepaid counter — without an active batch, no prepaid.
          await tx.enrollment.update({
            where: { id: deduction.enrollmentId },
            data: { prepaidLessonsRemaining: 0 },
          });
        }

        return {
          reversedTransactionId: deduction.id,
          reversedAccruals: accruals.length,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }

  /**
   * Effective teacher list for a single lesson. If a non-deleted
   * `LessonTeacherOverride` exists for (groupId, lessonDate), its
   * `teacherIds` are the authoritative roster — `Group.teachers` is
   * ignored entirely. Otherwise we fall back to the standard group
   * roster.
   *
   * `lessonDate` is normalised to UTC midnight by the caller, matching
   * the @db.Date column on `LessonTeacherOverride.date`.
   */
  private async resolveTeachersForLesson(
    tx: Prisma.TransactionClient,
    groupId: string,
    lessonDate: Date,
  ): Promise<number[]> {
    const override = await tx.lessonTeacherOverride.findFirst({
      where: { groupId, date: lessonDate, deletedAt: null },
      select: { teacherIds: true },
    });
    if (override) return override.teacherIds;
    const groupTeachers = await tx.groupTeacher.findMany({
      where: { groupId },
      select: { teacherId: true },
    });
    return groupTeachers.map((t) => t.teacherId);
  }
}
