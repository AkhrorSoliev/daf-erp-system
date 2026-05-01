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
        teachers: { select: { teacherId: true } },
        contracts: {
          where: { studentId: p.studentId, status: 'ACTIVE', deletedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!group) return;

    const lessonPaymentCount = group.course.lessonPaymentCount || 12;
    const fullCycleCost = group.course.price;
    const perLessonCost = Math.round(fullCycleCost / lessonPaymentCount);
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

      if (balance >= fullCycleCost) {
        const deduction = await this.transactionsService.deductLessonFee(
          {
            studentId: p.studentId,
            amount: fullCycleCost,
            attendanceId: p.attendanceId,
            enrollmentId: p.enrollmentId,
            contractId,
            companyId: p.companyId,
            branchId: p.branchId,
            mode: LessonDeductionMode.FULL_CYCLE,
            perLessonCost,
            lessonsCovered: lessonPaymentCount,
          },
          tx,
        );
        await tx.enrollment.update({
          where: { id: p.enrollmentId },
          data: { prepaidLessonsRemaining: lessonPaymentCount - 1 },
        });
        coverageTransactionId = deduction.id;
      } else if (balance >= perLessonCost) {
        const lessonsCovered = Math.floor(balance / perLessonCost);
        const partialAmount = lessonsCovered * perLessonCost;
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
          },
          tx,
        );
        await tx.enrollment.update({
          where: { id: p.enrollmentId },
          data: { prepaidLessonsRemaining: lessonsCovered - 1 },
        });
        coverageTransactionId = deduction.id;
      } else {
        // Not enough to cover even one lesson. The attendance is recorded
        // but nothing is charged and the teacher does NOT accrue salary
        // for this lesson (B.1). The student will need to top up before
        // the next attended lesson is paid.
        this.logger.warn(
          `Insufficient balance for student ${p.studentId} (${balance} < ${perLessonCost}) — no consumption written`,
        );
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

    // Salary accruals — one per teacher attached to the group. The
    // accrual service handles version lookup, FIXED_PER_STUDENT semantics,
    // closed-period guard. Coverage tx is the upstream LESSON_DEDUCTION.
    if (coverageTransactionId) {
      for (const t of group.teachers) {
        try {
          await this.salaryAccrualService.createAccrual({
            teacherId: t.teacherId,
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
            `Salary accrual failed for teacher ${t.teacherId}`,
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
    // hand out free lessons.
    const teachers = await tx.groupTeacher.findMany({
      where: { groupId: p.groupId },
      select: { teacherId: true },
    });
    for (const t of teachers) {
      await this.salaryAccrualService.reverseAccrualForAttendance({
        teacherId: t.teacherId,
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
}
