import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryPaymentStatus, SalaryType } from '@prisma/client';

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
  }) {
    if (!params.deductionTransactionId) {
      // Student has no active payment cycle — teacher does not earn for this lesson.
      return null;
    }

    // Period-closed policy (audit #17): if the lesson date falls inside a
    // SalaryPayment period that is already APPROVED or PAID for this teacher,
    // the period is closed and a new accrual would never be picked up by
    // any salary run. Refuse to write and log — admins should use an
    // explicit correction flow instead of silently leaving orphan rows.
    const closedPeriod = await this.prisma.salaryPayment.findFirst({
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

    const config = await this.prisma.employeeSalaryConfig.findFirst({
      where: {
        userId: params.teacherId,
        isActive: true,
        salaryType: {
          in: [SalaryType.PERCENTAGE, SalaryType.FIXED_PER_STUDENT],
        },
        OR: [{ groupId: params.groupId }, { groupId: null }],
      },
      orderBy: { groupId: 'desc' }, // group-specific takes priority (non-null first)
    });

    if (!config) return null;

    let amount: number;
    if (config.salaryType === SalaryType.PERCENTAGE) {
      amount = Math.round((params.perLessonCost * config.value) / 100);
    } else {
      amount = config.value;
    }

    return this.prisma.salaryAccrual.upsert({
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
        companyId: params.companyId,
        deductionTransactionId: params.deductionTransactionId,
      },
      update: {
        amount,
        attendanceId: params.attendanceId,
        deductionTransactionId: params.deductionTransactionId,
      },
    });
  }

  async getAccruals(userId: number, companyId: number) {
    return this.prisma.salaryAccrual.findMany({
      where: {
        userId,
        companyId,
        salaryPaymentId: null,
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        lessonDate: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { lessonDate: 'desc' },
    });
  }
}
