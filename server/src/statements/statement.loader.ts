import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeEnrollmentCoverage,
  type CoveragePrismaLike,
} from '../billing/lesson-coverage.helper';
import { tashkentDateStr } from '../common/date/tashkent';
import type { AttendanceMark, StatementInput } from './statement.types';

/**
 * The app's own group label (receipts, group names): '#036'. A group with no
 * number falls back to its name.
 */
export const groupLabel = (
  groupNumber: number | null,
  name?: string | null,
): string =>
  groupNumber !== null
    ? `#${String(groupNumber).padStart(3, '0')}`
    : name?.trim() || '—';

/** Reads what the statement needs for one student. Read-only. */
@Injectable()
export class StatementLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    studentId: number,
    companyId: number,
    asOf: string = tashkentDateStr(new Date()),
  ): Promise<StatementInput> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        balance: true,
        discountPercent: true,
      },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        startDate: true,
        createdAt: true,
        statusChangedAt: true,
        deletedAt: true,
        group: {
          select: {
            groupNumber: true,
            name: true,
            branch: { select: { name: true } },
            course: {
              select: {
                name: true,
                price: true,
                lessonPaymentCount: true,
                paymentModel: true,
              },
            },
          },
        },
      },
    });
    const rows = await this.prisma.transaction.findMany({
      where: { studentId, type: { not: TransactionType.LESSON_CONSUMPTION } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        description: true,
        metadata: true,
        enrollmentId: true,
        paymentId: true,
        reversedAt: true,
        reversedTransactionId: true,
        payment: { select: { method: true } },
      },
    });
    const deductionEnrollments = [
      ...new Set(
        rows
          .filter(
            (r) =>
              r.type === TransactionType.LESSON_DEDUCTION && r.enrollmentId,
          )
          .map((r) => r.enrollmentId as string),
      ),
    ];
    const { byDeduction } = await computeEnrollmentCoverage(
      this.prisma as unknown as CoveragePrismaLike,
      deductionEnrollments,
    );
    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: { studentId, status: 'CHARGED' },
      select: {
        enrollmentId: true,
        periodYear: true,
        periodMonth: true,
        plannedLessons: true,
        coveredDates: true,
        frozenOutDates: true,
        creditLessons: true,
        creditAmount: true,
        excusedLessons: true,
      },
    });
    const attendance = await this.prisma.attendance.findMany({
      where: { studentId, cancellationId: null },
      select: {
        date: true,
        status: true,
        group: { select: { groupNumber: true, name: true } },
      },
    });

    return {
      asOf,
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        firstName: student.firstName,
        lastName: student.lastName,
        balance: student.balance,
        discountPercent: student.discountPercent ?? 0,
      },
      enrollments: enrollments.map((e) => ({
        id: e.id,
        group: groupLabel(e.group.groupNumber, e.group.name),
        status: e.status,
        start: tashkentDateStr(e.startDate ?? e.createdAt),
        end:
          e.status !== 'ACTIVE' && e.statusChangedAt
            ? tashkentDateStr(e.statusChangedAt)
            : null,
        deleted: e.deletedAt !== null,
        course: {
          name: e.group.course.name,
          price: e.group.course.price,
          lessonPaymentCount: e.group.course.lessonPaymentCount,
          paymentModel: e.group.course.paymentModel,
        },
        branch: e.group.branch.name,
      })),
      rows: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        day: tashkentDateStr(r.createdAt),
        at: r.createdAt.toISOString(),
        description: r.description,
        metadata:
          r.metadata &&
          typeof r.metadata === 'object' &&
          !Array.isArray(r.metadata)
            ? (r.metadata as Record<string, unknown>)
            : null,
        enrollmentId: r.enrollmentId,
        paymentId: r.paymentId,
        paymentMethod: r.payment?.method ?? null,
        reversed: r.reversedAt !== null,
        reversal: r.reversedTransactionId !== null,
        consumedDays:
          r.type === TransactionType.LESSON_DEDUCTION
            ? (byDeduction.get(r.id)?.consumedDates ?? []).map((d) =>
                tashkentDateStr(d),
              )
            : null,
      })),
      charges: charges.map((c) => ({
        enrollmentId: c.enrollmentId,
        period: `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}`,
        plannedLessons: c.plannedLessons,
        coveredDates: c.coveredDates,
        frozenOutDates: c.frozenOutDates,
        creditLessons: c.creditLessons,
        creditAmount: c.creditAmount,
        excusedLessons: c.excusedLessons,
      })),
      attendance: attendance.map((a) => ({
        day: tashkentDateStr(a.date),
        group: groupLabel(a.group.groupNumber, a.group.name),
        status: a.status as AttendanceMark,
      })),
    };
  }
}
