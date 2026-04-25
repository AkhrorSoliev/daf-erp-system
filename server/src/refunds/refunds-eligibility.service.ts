import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus, ContractStatus, RefundStatus } from '@prisma/client';

@Injectable()
export class RefundsEligibilityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Compute the refund breakdown for a student without creating anything.
   * Powers the "Pulni qaytarish" dialog — the admin types the refund amount
   * manually, this endpoint just gives them the numbers to decide on:
   * paid, attendance-based consumption, max refundable, suggested amount.
   *
   * Note on `attendanceConsumed` vs `ledgerConsumed`: the ledger deducts a
   * full cycle (N lessons) upfront at enrollment. If the student attends
   * only some lessons before quitting, the ledger still shows the whole
   * cycle as consumed. The attendance-based number is what the operator
   * should care about when deciding the refund — the ledger delta is
   * compensated automatically inside quickRefund().
   */
  async previewRefund(studentId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { balance: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    const contract = await this.prisma.contract.findFirst({
      where: {
        studentId,
        companyId,
        deletedAt: null,
        status: ContractStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        contractNumber: true,
        totalAmount: true,
        paidAmount: true,
        startDate: true,
        groupId: true,
        course: { select: { name: true, lessonPaymentCount: true } },
      },
    });
    if (!contract) {
      throw new NotFoundException("O'quvchida faol shartnoma yo'q");
    }

    let lessonsCompleted = 0;
    if (contract.groupId) {
      lessonsCompleted = await this.prisma.attendance.count({
        where: {
          groupId: contract.groupId,
          studentId,
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      });
    }

    const totalLessons = contract.course.lessonPaymentCount;
    const perLessonCost =
      totalLessons > 0 ? Math.round(contract.totalAmount / totalLessons) : 0;
    const attendanceConsumed = lessonsCompleted * perLessonCost;

    const ledgerAgg = await this.prisma.transaction.aggregate({
      where: {
        contractId: contract.id,
        type: 'LESSON_DEDUCTION',
        reversedTransactionId: null,
      },
      _sum: { amount: true },
    });
    const ledgerConsumed = Math.abs(ledgerAgg._sum.amount ?? 0);

    const priorRefunds = await this.prisma.refund.aggregate({
      where: {
        contractId: contract.id,
        status: {
          in: [
            RefundStatus.APPROVED,
            RefundStatus.PROCESSING,
            RefundStatus.COMPLETED,
          ],
        },
      },
      _sum: { approvedAmount: true },
    });
    const previousRefundsTotal = priorRefunds._sum.approvedAmount ?? 0;

    // Cycle-deduction at enrollment can leave the ledger showing more
    // "consumed" than the student actually attended. The unused portion
    // is still money we owe back — add it to the max alongside the
    // current balance to compute what a full close-out looks like.
    const overDeducted = Math.max(0, ledgerConsumed - attendanceConsumed);
    const maxRefundable = Math.max(0, student.balance + overDeducted);
    const suggestedAmount = maxRefundable;

    const halfCourseAttended =
      totalLessons > 0 && lessonsCompleted / totalLessons >= 0.5;
    const warning = halfCourseAttended
      ? "Diqqat: kursning 50% dan ortig'i o'tilgan"
      : null;

    return {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      courseName: contract.course.name,
      paidAmount: contract.paidAmount,
      studentBalance: student.balance,
      lessonsCompleted,
      totalLessons,
      perLessonCost,
      attendanceConsumed,
      ledgerConsumed,
      overDeducted,
      previousRefunds: previousRefundsTotal,
      maxRefundable,
      suggestedAmount,
      warning,
    };
  }

  async findAll(companyId: number) {
    return this.prisma.refund.findMany({
      where: { companyId },
      select: {
        id: true,
        requestedAmount: true,
        approvedAmount: true,
        lessonsCompleted: true,
        totalLessons: true,
        status: true,
        reason: true,
        createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
        contract: { select: { id: true, contractNumber: true } },
        processedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
