import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCallerMayWriteForStudent,
} from '../common/auth/financial-write-scope';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import {
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { QuickRefundDto } from './dto/quick-refund.dto';

const REFUND_METHOD_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "Bank o'tkazmasi",
};

@Injectable()
export class RefundsCreateService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private entityHistoryService: EntityHistoryService,
    private enrollmentBilling: EnrollmentBillingService,
  ) {}

  /**
   * Single-shot refund where the admin types the refund amount manually.
   *
   * A payout is funded from the free balance first. When that is not enough,
   * the shortfall is covered by CANCELLING prepaid lessons — the fewest that
   * cover it — which credits their money and decrements
   * `prepaidLessonsRemaining` in one step. The student leaves with fewer
   * lessons ahead of them, which is what taking the money back means.
   *
   * What this replaced credited `deductions − PRESENT/LATE attendance` to the
   * balance and left the counter alone. That difference is not over-deduction:
   * the ledger deducts exactly `attendance + prepaidLessonsRemaining`, so it is
   * the ABSENT lessons (billable here) plus lessons still reserved. The lessons
   * stayed covered while their money came back, and since neither side of the
   * subtraction changed, the next refund offered the whole thing again.
   * #10393 was credited 266 664 so'm on 2026-08-18, #10655 233 331 before it.
   *
   * All ledger writes happen inside one Serializable transaction.
   */
  async quickRefund(dto: QuickRefundDto, userId: number, companyId: number) {
    await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const enrollment = await this.loadEnrollment(
      dto.enrollmentId,
      dto.studentId,
      companyId,
    );

    // Double-click protection. The dialog disables its own button while a
    // request is in flight, which is no protection at all against a retry, a
    // second tab, or a direct API call — and a refund moves real cash.
    const recentDuplicate = await this.prisma.refund.findFirst({
      where: {
        studentId: dto.studentId,
        enrollmentId: enrollment.id,
        approvedAmount: dto.amount,
        status: RefundStatus.COMPLETED,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
    });
    if (recentDuplicate) {
      throw new BadRequestException(
        "Shu summadagi qaytarish hozirgina yozildi — takror yuborilmadi",
      );
    }

    const lessonsAttended = await this.countAttendance(
      enrollment.groupId,
      dto.studentId,
    );
    const totalLessons = enrollment.group.course.lessonPaymentCount;
    const previousRefundsTotal = await this.sumPriorRefunds(enrollment.id);

    const prepaidLessons = enrollment.prepaidLessonsRemaining;
    const prepaidValue = await this.enrollmentBilling.prepaidRefundValue(
      this.prisma,
      enrollment.id,
      enrollment.group.course,
      prepaidLessons,
    );
    const maxRefundable = Math.max(0, student.balance + prepaidValue);

    if (dto.amount > maxRefundable) {
      throw new BadRequestException(
        `Qaytarish summasi maksimal summadan oshib ketdi (maksimum ${maxRefundable} so'm)`,
      );
    }

    // Free balance first; only what it cannot cover comes out of the lessons.
    // Walk up rather than divide: lesson prices are not uniform — the last
    // lesson of a cycle absorbs the rounding remainder — so `ceil(shortfall /
    // perLesson)` picks the wrong count at the edges. The walk is at most one
    // cycle long.
    const shortfall = dto.amount - student.balance;
    let lessonsToRelease = 0;
    if (shortfall > 0) {
      for (let n = 1; n <= prepaidLessons; n++) {
        const value = await this.enrollmentBilling.prepaidRefundValue(
          this.prisma,
          enrollment.id,
          enrollment.group.course,
          n,
        );
        if (value >= shortfall) {
          lessonsToRelease = n;
          break;
        }
      }
      // The max check above already passed, so the whole prepaid block is worth
      // enough; rounding just kept any single step from crossing the line.
      if (lessonsToRelease === 0) lessonsToRelease = prepaidLessons;
    }

    const deductions = {
      balanceBeforeRefund: student.balance,
      prepaidLessonsBefore: prepaidLessons,
      prepaidValueBefore: prepaidValue,
      lessonsReleased: lessonsToRelease,
      lessonsAttended,
      previousRefunds: previousRefundsTotal,
      tax: 0,
      bankFee: 0,
    };

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 21);

    const refund = await this.prisma.$transaction(
      async (tx) => {
        const refundRow = await tx.refund.create({
          data: {
            studentId: dto.studentId,
            enrollmentId: enrollment.id,
            requestedAmount: dto.amount,
            approvedAmount: dto.amount,
            lessonsCompleted: lessonsAttended,
            totalLessons,
            deductions,
            status: RefundStatus.COMPLETED,
            refundMethod: dto.refundMethod,
            reason: dto.reason,
            processedById: userId,
            processedAt: new Date(),
            dueDate,
            companyId,
          },
        });

        const released =
          lessonsToRelease > 0
            ? await this.enrollmentBilling.releasePrepaidLessons(tx, {
                enrollmentId: enrollment.id,
                lessons: lessonsToRelease,
                reason: `Pul qaytarish: ${lessonsToRelease} ta oldindan to'langan dars bekor qilindi`,
                performedById: userId,
                metadata: {
                  refundId: refundRow.id,
                  lessonsReleased: lessonsToRelease,
                },
              })
            : null;

        await this.transactionsService.recordRefund(
          {
            studentId: dto.studentId,
            amount: dto.amount,
            refundId: refundRow.id,
            companyId,
            performedById: userId,
          },
          tx,
        );

        return { refundRow, releasedAmount: released?.refunded ?? 0 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const balanceAfter =
      student.balance + refund.releasedAmount - dto.amount;
    await this.entityHistoryService.recordStatusChange({
      entityType: 'Student',
      entityId: dto.studentId,
      oldValues: { balans: student.balance },
      newValues: {
        balans: balanceAfter,
        qaytarilgan_summa: dto.amount,
        bekor_qilingan_darslar: lessonsToRelease,
        usul: REFUND_METHOD_LABEL[dto.refundMethod] ?? dto.refundMethod,
        guruh: enrollment.group.name,
        sabab: dto.reason ?? null,
        status: 'PUL_QAYTARILDI',
      },
      changedById: userId,
      companyId,
    });

    return refund.refundRow;
  }

  // -- helpers ---------------------------------------------------------------

  private async loadEnrollment(
    enrollmentId: string,
    studentId: number,
    companyId: number,
  ) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        studentId,
        deletedAt: null,
        group: { companyId },
      },
      select: {
        id: true,
        groupId: true,
        status: true,
        startDate: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            name: true,
            course: {
              select: {
                name: true,
                price: true,
                lessonPaymentCount: true,
              },
            },
          },
        },
      },
    });
    if (!enrollment) {
      throw new NotFoundException("Bu o'quvchining bunday guruhi topilmadi");
    }
    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Faqat faol guruhdan pul qaytarish mumkin',
      );
    }
    return enrollment;
  }

  private async countAttendance(groupId: string, studentId: number) {
    return this.prisma.attendance.count({
      where: {
        groupId,
        studentId,
        status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
      },
    });
  }

  private async sumPriorRefunds(enrollmentId: string) {
    const agg = await this.prisma.refund.aggregate({
      where: {
        enrollmentId,
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
    return agg._sum.approvedAmount ?? 0;
  }
}
