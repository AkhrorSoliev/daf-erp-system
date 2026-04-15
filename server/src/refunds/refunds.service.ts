import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AttendanceStatus, ContractStatus, Prisma, RefundStatus } from '@prisma/client';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ProcessRefundDto } from './dto/process-refund.dto';
import {
  assertValidTransition,
  REFUND_TRANSITIONS,
} from '../common/finance/status-transitions';

@Injectable()
export class RefundsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
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
      throw new BadRequestException('Faqat faol shartnomadan refund so\'rash mumkin');
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
          in: [RefundStatus.APPROVED, RefundStatus.PROCESSING, RefundStatus.COMPLETED],
        },
      },
      _sum: { approvedAmount: true },
    });
    const previousRefundsTotal = priorRefunds._sum.approvedAmount ?? 0;

    // Check refund eligibility
    let requestedAmount: number;

    if (!contract.startDate || (contract.startDate > new Date())) {
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

  /**
   * Approve or reject a refund request, then process the actual refund.
   */
  async process(id: string, dto: ProcessRefundDto, userId: number, companyId: number) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        requestedAmount: true,
        status: true,
        companyId: true,
      },
    });
    if (!refund) throw new NotFoundException('Refund topilmadi');

    if (dto.status === RefundStatus.REJECTED) {
      assertValidTransition('Refund', REFUND_TRANSITIONS, refund.status, RefundStatus.REJECTED);
      return this.prisma.refund.update({
        where: { id },
        data: {
          status: RefundStatus.REJECTED,
          reason: dto.reason,
          processedById: userId,
          processedAt: new Date(),
        },
      });
    }

    if (dto.status === RefundStatus.COMPLETED) {
      assertValidTransition('Refund', REFUND_TRANSITIONS, refund.status, RefundStatus.COMPLETED);

      const approvedAmount = dto.approvedAmount ?? refund.requestedAmount;

      // Calculate due date (15 business days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 21); // ~15 business days

      // Atomic: balance deduction + contract update + refund update all-or-nothing
      return this.prisma.$transaction(
        async (tx) => {
          await this.transactionsService.recordRefund(
            {
              studentId: refund.studentId,
              amount: approvedAmount,
              refundId: refund.id,
              contractId: refund.contractId,
              companyId: refund.companyId,
              performedById: userId,
            },
            tx,
          );

          await tx.contract.update({
            where: { id: refund.contractId },
            data: {
              status: ContractStatus.REFUNDED,
              paidAmount: { decrement: approvedAmount },
            },
          });

          return tx.refund.update({
            where: { id },
            data: {
              status: RefundStatus.COMPLETED,
              approvedAmount,
              processedById: userId,
              processedAt: new Date(),
              dueDate,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }

    // For APPROVED/PROCESSING status
    assertValidTransition('Refund', REFUND_TRANSITIONS, refund.status, dto.status);
    return this.prisma.refund.update({
      where: { id },
      data: {
        status: dto.status,
        approvedAmount: dto.approvedAmount,
        processedById: userId,
        processedAt: new Date(),
      },
    });
  }
}
