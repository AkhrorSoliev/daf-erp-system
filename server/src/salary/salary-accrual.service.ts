import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';

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
  }) {
    if (!params.deductionTransactionId) {
      // Student has no active payment cycle — teacher does not earn for this lesson.
      return null;
    }

    const db = params.tx ?? this.prisma;

    // Period-closed policy (audit #17): if the lesson date falls inside a
    // SalaryPayment period that is already APPROVED or PAID for this teacher,
    // the period is closed and a new accrual would never be picked up by
    // any salary run. Refuse to write and log — admins should use an
    // explicit correction flow instead of silently leaving orphan rows.
    const closedPeriod = await db.salaryPayment.findFirst({
      where: {
        userId: params.teacherId,
        companyId: params.companyId,
        status: {
          in: [SalaryPaymentStatus.APPROVED, SalaryPaymentStatus.PAID],
        },
        periodStart: { lte: params.lessonDate },
        periodEnd: { gte: params.lessonDate },
      },
      select: { id: true, status: true },
    });
    if (closedPeriod) {
      this.logger.warn(
        `Refusing accrual for closed period: teacher ${params.teacherId}, lessonDate ${params.lessonDate.toISOString()} (SalaryPayment ${closedPeriod.id} is ${closedPeriod.status})`,
      );
      return null;
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

    return db.salaryAccrual.upsert({
      where: {
        userId_studentId_groupId_lessonDate: {
          userId: params.teacherId,
          studentId: params.studentId,
          groupId: params.groupId,
          lessonDate: params.lessonDate,
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
      },
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
    const existing = await db.salaryAccrual.findUnique({
      where: {
        userId_studentId_groupId_lessonDate: {
          userId: params.teacherId,
          studentId: params.studentId,
          groupId: params.groupId,
          lessonDate: params.lessonDate,
        },
      },
      select: { id: true, reversedAt: true },
    });
    if (!existing || existing.reversedAt) return null;

    return db.salaryAccrual.update({
      where: { id: existing.id },
      data: {
        reversedAt: new Date(),
        reversedById: params.reversedById,
        reversalReason: params.reversalReason,
      },
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
