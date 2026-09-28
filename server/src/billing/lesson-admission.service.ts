import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, MonthlyChargeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMISSION_START_DAY,
  lessonAdmission,
  paymentReach,
  type AdmissionCharge,
  type LessonAdmission,
  type PaymentReach,
} from './lesson-admission';

type Reader = Prisma.TransactionClient | PrismaService;

/**
 * Loads what `lessonAdmission` / `paymentReach` judge (ADR-0047): the
 * student's balance and their CHARGED month charges on ACTIVE enrollments —
 * a departed or frozen enrollment's lessons are not "still held".
 */
@Injectable()
export class LessonAdmissionService {
  constructor(private prisma: PrismaService) {}

  /** Contract 3.2 for every student of one lesson. A student missing from the map is admitted. */
  async forLesson(
    params: { groupId: string; lessonDay: string; studentIds: number[] },
    client: Reader = this.prisma,
  ): Promise<Map<number, LessonAdmission>> {
    const result = new Map<number, LessonAdmission>();
    if (params.studentIds.length === 0) return result;
    if (params.lessonDay < ADMISSION_START_DAY) return result;

    const [year, month] = params.lessonDay.split('-').map(Number);
    const [students, charges] = await Promise.all([
      client.student.findMany({
        where: { id: { in: params.studentIds } },
        select: { id: true, balance: true },
      }),
      this.loadCharges(client, params.studentIds, year, month),
    ]);
    for (const student of students) {
      result.set(
        student.id,
        lessonAdmission({
          lessonDay: params.lessonDay,
          groupId: params.groupId,
          balance: student.balance,
          charges: charges.filter((c) => c.studentId === student.id),
        }),
      );
    }
    return result;
  }

  /** How far a payment reaches this month (payment dialog). Null: the rule does not apply. */
  async reachForPayment(params: {
    studentId: number;
    balanceAfter: number;
    today: string;
  }): Promise<PaymentReach | null> {
    if (params.today < ADMISSION_START_DAY) return null;
    const [year, month] = params.today.split('-').map(Number);
    const charges = await this.loadCharges(
      this.prisma,
      [params.studentId],
      year,
      month,
    );
    return paymentReach({
      today: params.today,
      balanceAfter: params.balanceAfter,
      charges,
    });
  }

  private async loadCharges(
    client: Reader,
    studentIds: number[],
    year: number,
    month: number,
  ): Promise<(AdmissionCharge & { studentId: number; groupName: string })[]> {
    const rows = await client.enrollmentMonthlyCharge.findMany({
      where: {
        studentId: { in: studentIds },
        periodYear: year,
        periodMonth: month,
        status: MonthlyChargeStatus.CHARGED,
        enrollment: { status: EnrollmentStatus.ACTIVE, deletedAt: null },
      },
      select: {
        studentId: true,
        groupId: true,
        coveredDates: true,
        frozenOutDates: true,
        coveredLessons: true,
        perLessonCost: true,
        discountPercent: true,
        chargedAmount: true,
        group: { select: { name: true } },
      },
    });
    return rows.map(({ group, ...row }) => ({
      ...row,
      groupName: group.name,
    }));
  }
}
