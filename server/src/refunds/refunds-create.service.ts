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
import {
  AttendanceStatus,
  EnrollmentStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { CreateRefundDto } from './dto/create-refund.dto';
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
  ) {}

  /**
   * Calculate refund amount and create a refund request. Refund is scoped to
   * an Enrollment — Contract is not used.
   */
  async create(dto: CreateRefundDto, userId: number, companyId: number) {
    // A refund takes money OUT of the branch's kassa, so the caller must own
    // the student's branch. `_userId` was unused here — the id was threaded
    // through and never checked.
    await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );

    const enrollment = await this.loadEnrollment(
      dto.enrollmentId,
      dto.studentId,
      companyId,
    );

    const lessonsCompleted = await this.countAttendance(
      enrollment.groupId,
      dto.studentId,
    );

    const totalLessons = enrollment.group.course.lessonPaymentCount;
    const coursePrice = enrollment.group.course.price;
    const perLessonCost =
      totalLessons > 0 ? Math.round(coursePrice / totalLessons) : 0;

    const paidAmount = await this.sumPayments(dto.studentId, companyId);
    const consumedAmount = await this.sumLessonDeductions(enrollment.id);
    const previousRefundsTotal = await this.sumPriorRefunds(enrollment.id);

    let requestedAmount: number;

    if (
      !enrollment.startDate ||
      enrollment.startDate > new Date() ||
      lessonsCompleted === 0
    ) {
      // Kurs boshlanmagan / hali davomat yo'q — 100% qaytarish
      requestedAmount = Math.max(0, paidAmount - previousRefundsTotal);
    } else if (lessonsCompleted / totalLessons >= 0.5) {
      throw new BadRequestException(
        "Kursning 50% dan ortiq qismi o'tilgan. Pul qaytarilmaydi",
      );
    } else {
      requestedAmount = Math.max(
        0,
        paidAmount - consumedAmount - previousRefundsTotal,
      );
    }

    const deductions = {
      consumedFromLedger: consumedAmount,
      lessonsObserved: lessonsCompleted,
      perLessonCost,
      previousRefunds: previousRefundsTotal,
      tax: 0,
      bankFee: 0,
    };

    const refund = await this.prisma.refund.create({
      data: {
        studentId: dto.studentId,
        enrollmentId: enrollment.id,
        requestedAmount,
        lessonsCompleted,
        totalLessons,
        deductions,
        status: RefundStatus.REQUESTED,
        reason: dto.reason,
        companyId,
      },
    });

    return {
      ...refund,
      perLessonCost,
      consumedAmount: deductions.consumedFromLedger,
    };
  }

  /**
   * Single-shot refund where the admin types the refund amount manually.
   *
   * Ledger compensation: the system deducts a full cycle at enrollment
   * (see AttendanceService), so if the student quits after only a few
   * lessons the ledger shows the whole cycle as consumed. That leaves a
   * gap between "lessons actually attended × perLessonCost" and "amount
   * deducted from balance". Before writing the REFUND entry, we post an
   * ADJUSTMENT that restores the unused portion to the balance so the
   * refund decrement lands on a balance that matches reality. Without this
   * the balance would drift negative by the over-deduction amount.
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

    const lessonsCompleted = await this.countAttendance(
      enrollment.groupId,
      dto.studentId,
    );

    const totalLessons = enrollment.group.course.lessonPaymentCount;
    const coursePrice = enrollment.group.course.price;
    const perLessonCost =
      totalLessons > 0 ? Math.round(coursePrice / totalLessons) : 0;
    const attendanceConsumed = lessonsCompleted * perLessonCost;

    const ledgerConsumed = await this.sumLessonDeductions(enrollment.id);
    const previousRefundsTotal = await this.sumPriorRefunds(enrollment.id);

    const overDeducted = Math.max(0, ledgerConsumed - attendanceConsumed);
    const maxRefundable = Math.max(0, student.balance + overDeducted);

    if (dto.amount > maxRefundable) {
      throw new BadRequestException(
        `Qaytarish summasi maksimal summadan oshib ketdi (maksimum ${maxRefundable} so'm)`,
      );
    }

    const deductions = {
      attendanceConsumed,
      ledgerConsumed,
      overDeductedRestored: overDeducted,
      balanceBeforeRefund: student.balance,
      lessonsObserved: lessonsCompleted,
      perLessonCost,
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
            lessonsCompleted,
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

        if (overDeducted > 0) {
          await this.transactionsService.createAdjustment(
            {
              studentId: dto.studentId,
              amount: overDeducted,
              description:
                'Refund: foydalanilmagan darslar balansga qaytarildi',
              companyId,
              performedById: userId,
            },
            tx,
          );
        }

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

        return refundRow;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const balanceAfter = student.balance + overDeducted - dto.amount;
    await this.entityHistoryService.recordStatusChange({
      entityType: 'Student',
      entityId: dto.studentId,
      oldValues: { balans: student.balance },
      newValues: {
        balans: balanceAfter,
        qaytarilgan_summa: dto.amount,
        usul: REFUND_METHOD_LABEL[dto.refundMethod] ?? dto.refundMethod,
        guruh: enrollment.group.name,
        sabab: dto.reason ?? null,
        status: 'PUL_QAYTARILDI',
      },
      changedById: userId,
      companyId,
    });

    return refund;
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

  private async sumPayments(studentId: number, companyId: number) {
    const agg = await this.prisma.payment.aggregate({
      where: {
        studentId,
        companyId,
        status: PaymentStatus.COMPLETED,
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  private async sumLessonDeductions(enrollmentId: string) {
    const agg = await this.prisma.transaction.aggregate({
      where: {
        enrollmentId,
        type: 'LESSON_DEDUCTION',
        reversedTransactionId: null,
        reversedAt: null,
      },
      _sum: { amount: true },
    });
    return Math.abs(agg._sum.amount ?? 0);
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
