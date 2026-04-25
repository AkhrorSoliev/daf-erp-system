import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  AttendanceStatus,
  ContractStatus,
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
   * Calculate refund amount and create a refund request.
   */
  async create(dto: CreateRefundDto, userId: number, companyId: number) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, deletedAt: null, companyId },
      select: {
        id: true,
        studentId: true,
        courseId: true,
        groupId: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        startDate: true,
        course: {
          select: { price: true, lessonPaymentCount: true },
        },
      },
    });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    if (contract.studentId !== dto.studentId) {
      throw new BadRequestException("Shartnoma bu o'quvchiga tegishli emas");
    }
    if (contract.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException(
        "Faqat faol shartnomadan refund so'rash mumkin",
      );
    }

    // Count completed lessons (PRESENT or LATE) — kept for the 50% gate,
    // which remains policy-driven. Not used for consumed-amount math anymore.
    let lessonsCompleted = 0;
    if (contract.groupId) {
      lessonsCompleted = await this.prisma.attendance.count({
        where: {
          groupId: contract.groupId,
          studentId: dto.studentId,
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      });
    }

    const totalLessons = contract.course.lessonPaymentCount;
    const perLessonCost = Math.round(contract.totalAmount / totalLessons);

    // Contract-level consumption from the ledger — source of truth for how
    // much of the paid amount has already been spent on delivered lessons
    // (Phase C.1 populated Transaction.contractId for LESSON_DEDUCTION). The
    // amount is negative in the ledger, so we negate the sum.
    const consumed = await this.prisma.transaction.aggregate({
      where: {
        contractId: contract.id,
        type: 'LESSON_DEDUCTION',
        reversedTransactionId: null,
      },
      _sum: { amount: true },
    });
    const consumedAmount = Math.abs(consumed._sum.amount ?? 0);

    // Prior refunds on the same contract — prevents a second request from
    // reclaiming an amount that was already refunded.
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

    let requestedAmount: number;

    if (!contract.startDate || contract.startDate > new Date()) {
      // Kurs boshlanmagan — 100% qaytarish (minus oldingi refundlar)
      requestedAmount = Math.max(0, contract.paidAmount - previousRefundsTotal);
    } else if (lessonsCompleted / totalLessons >= 0.5) {
      // 50% dan ko'pi o'tilgan — qaytarilMAYDI
      throw new BadRequestException(
        "Kursning 50% dan ortiq qismi o'tilgan. Pul qaytarilmaydi",
      );
    } else {
      // refundableAmount = paidAmount - consumedAmount (from ledger) - previousRefunds
      requestedAmount = Math.max(
        0,
        contract.paidAmount - consumedAmount - previousRefundsTotal,
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
        contractId: dto.contractId,
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
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, deletedAt: null, companyId },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        course: {
          select: { lessonPaymentCount: true },
        },
      },
    });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    if (contract.studentId !== dto.studentId) {
      throw new BadRequestException("Shartnoma bu o'quvchiga tegishli emas");
    }
    if (contract.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException(
        'Faqat faol shartnomadan refund qilish mumkin',
      );
    }

    let lessonsCompleted = 0;
    if (contract.groupId) {
      lessonsCompleted = await this.prisma.attendance.count({
        where: {
          groupId: contract.groupId,
          studentId: dto.studentId,
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
            contractId: dto.contractId,
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
            contractId: dto.contractId,
            companyId,
            performedById: userId,
          },
          tx,
        );

        await tx.contract.update({
          where: { id: dto.contractId },
          data: {
            status: ContractStatus.REFUNDED,
            paidAmount: { decrement: dto.amount },
          },
        });

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
        shartnoma: contract.id,
        sabab: dto.reason ?? null,
        status: 'PUL_QAYTARILDI',
      },
      changedById: userId,
      companyId,
    });

    return refund;
  }
}
