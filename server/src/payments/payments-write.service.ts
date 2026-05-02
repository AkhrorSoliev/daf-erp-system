import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PAYMENT_METHOD_LABEL } from './shared/method-label';

/**
 * Emitted after a successful payment commit (manual or gateway). Consumed
 * by `PaymentEventsListener` to send a Telegram receipt to the student.
 */
export interface PaymentReceivedPayload {
  paymentId: string;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  studentBalance: number | null;
  companyId: number;
  performedById?: number;
}

@Injectable()
export class PaymentsWriteService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreatePaymentDto, userId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, deletedAt: null, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    let resolvedBranchId = dto.branchId;

    if (dto.contractId) {
      const contract = await this.prisma.contract.findFirst({
        where: {
          id: dto.contractId,
          studentId: dto.studentId,
          deletedAt: null,
          companyId,
        },
        select: { id: true, branchId: true },
      });
      if (!contract) {
        throw new NotFoundException(
          "Shartnoma topilmadi yoki bu o'quvchiga tegishli emas",
        );
      }
      if (dto.branchId && contract.branchId !== dto.branchId) {
        throw new BadRequestException(
          "To'lov filiali shartnoma filialiga mos kelmaydi",
        );
      }
      resolvedBranchId = contract.branchId;
    }

    const { payment, studentBalance } = await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.create({
          data: {
            studentId: dto.studentId,
            contractId: dto.contractId,
            amount: dto.amount,
            method: dto.method,
            status: PaymentStatus.COMPLETED,
            receiptNumber: dto.receiptNumber,
            note: dto.note,
            receivedById: userId,
            branchId: resolvedBranchId,
            companyId,
          },
        });

        await this.transactionsService.recordPayment(
          {
            studentId: dto.studentId,
            amount: dto.amount,
            paymentId: payment.id,
            contractId: dto.contractId,
            branchId: resolvedBranchId,
            companyId,
            performedById: userId,
          },
          tx,
        );

        if (dto.contractId) {
          await tx.contract.update({
            where: { id: dto.contractId },
            data: { paidAmount: { increment: dto.amount } },
          });
        }

        const updatedStudent = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { balance: true },
        });

        await this.entityHistoryService.recordCreate({
          entityType: 'Payment',
          entityId: payment.id,
          newValues: payment,
          changedById: userId,
          companyId,
          tx,
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: dto.studentId,
          oldValues: { balans: updatedStudent!.balance - dto.amount },
          newValues: {
            balans: updatedStudent!.balance,
            summa: dto.amount,
            usul: PAYMENT_METHOD_LABEL[dto.method] ?? dto.method,
            status: "TO'LOV_QABUL_QILINDI",
          },
          changedById: userId,
          companyId,
          tx,
        });

        return { payment, studentBalance: updatedStudent?.balance };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

    // Fire-and-forget Telegram receipt to the student. The listener uses
    // SmsService so the message also lands in the student profile "SMS"
    // tab (the SMS module is already Telegram-backed).
    this.eventEmitter.emit('payment.received', {
      paymentId: payment.id,
      studentId: dto.studentId,
      amount: dto.amount,
      method: dto.method,
      source: payment.source,
      studentBalance: studentBalance ?? null,
      companyId,
      performedById: userId,
    } satisfies PaymentReceivedPayload);

    return { ...payment, studentBalance };
  }

  async reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId: params.companyId },
      select: {
        id: true,
        studentId: true,
        amount: true,
        contractId: true,
        status: true,
      },
    });
    if (!payment) throw new NotFoundException("To'lov topilmadi");

    if (payment.status === PaymentStatus.REVERSED) {
      throw new BadRequestException("Bu to'lov allaqachon bekor qilingan");
    }

    // "Active original" = not a reversal entry (reversedTransactionId IS NULL)
    // and not been reversed (reversedAt IS NULL). Both filters are needed
    // because either alone leaks the wrong row in some flows.
    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        paymentId: id,
        type: 'PAYMENT',
        reversedTransactionId: null,
        reversedAt: null,
      },
      select: { id: true, createdAt: true },
    });
    if (!ledgerEntry) {
      throw new BadRequestException(
        "To'lovning ledger yozuvi topilmadi — bu yozuv avvalroq bekor qilingan yoki yaratilmagan",
      );
    }

    // Faza 5: don't let a refund-via-reverse short-circuit the formal
    // refund path once the money has actually been spent on lessons. If
    // any active LESSON_CONSUMPTION exists for this student dated AFTER
    // the payment landed, we treat the funds as already-consumed and force
    // the user through the Refund flow (which has the proper math for
    // partial completion, deductions, eligibility, etc).
    const downstreamConsumption = await this.prisma.transaction.count({
      where: {
        studentId: payment.studentId,
        type: 'LESSON_CONSUMPTION',
        reversedAt: null,
        createdAt: { gt: ledgerEntry.createdAt },
      },
    });
    if (downstreamConsumption > 0) {
      throw new BadRequestException(
        "To'lov allaqachon darslarga sarflangan. Bekor qilish o'rniga refund'dan foydalaning.",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await this.transactionsService.reverseTransaction(
          ledgerEntry.id,
          {
            performedById: params.performedById,
            reason: params.reason ?? "To'lov bekor qilindi",
          },
          tx,
        );

        if (payment.contractId) {
          await tx.contract.update({
            where: { id: payment.contractId },
            data: { paidAmount: { decrement: payment.amount } },
          });
        }

        await tx.payment.update({
          where: { id },
          data: { status: PaymentStatus.REVERSED },
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Payment',
          entityId: id,
          oldValues: { status: payment.status },
          newValues: {
            status: PaymentStatus.REVERSED,
            reason: params.reason ?? null,
          },
          changedById: params.performedById,
          companyId: params.companyId,
          tx,
        });

        const updatedStudent = await tx.student.findUnique({
          where: { id: payment.studentId },
          select: { balance: true },
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: payment.studentId,
          oldValues: {
            balans: (updatedStudent?.balance ?? 0) + payment.amount,
          },
          newValues: {
            balans: updatedStudent?.balance ?? 0,
            summa: -payment.amount,
            status: "TO'LOV_BEKOR_QILINDI",
          },
          changedById: params.performedById,
          companyId: params.companyId,
          tx,
        });

        return { reversedPaymentId: id, amount: payment.amount };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );
  }

  /**
   * Resolves a student's branch for gateway payments that don't carry branch context.
   *
   * Priority:
   *   1. Active enrollment's group.branchId (the branch where the student is studying)
   *   2. First StudentBranch record (registered branch)
   *   3. null (no branch linkage — will still create the payment but branch-filtered
   *      views won't show it)
   */
  async resolveStudentBranchId(
    studentId: number,
    companyId: number,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number | null> {
    const db = outerTx ?? this.prisma;

    const activeEnrollment = await db.enrollment.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: 'ACTIVE',
        group: { companyId, deletedAt: null },
      },
      select: { group: { select: { branchId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (activeEnrollment?.group?.branchId) {
      return activeEnrollment.group.branchId;
    }

    const studentBranch = await db.studentBranch.findFirst({
      where: { studentId, student: { companyId } },
      select: { branchId: true },
    });
    return studentBranch?.branchId ?? null;
  }

  async createFromExternal(
    params: {
      studentId: number;
      contractId?: string;
      amount: number;
      method: PaymentMethod;
      externalId: string;
      source: PaymentSource;
      providerFee?: number;
      providerFeePercent?: number;
      companyId: number;
      branchId?: number;
      performedById?: number;
      note?: string;
    },
    outerTx?: Prisma.TransactionClient,
  ) {
    const db = outerTx ?? this.prisma;

    const student = await db.student.findFirst({
      where: {
        id: params.studentId,
        deletedAt: null,
        companyId: params.companyId,
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    let resolvedBranchId = params.branchId;

    if (params.contractId) {
      const contract = await db.contract.findFirst({
        where: {
          id: params.contractId,
          studentId: params.studentId,
          deletedAt: null,
          companyId: params.companyId,
        },
        select: { id: true, branchId: true },
      });
      if (!contract) {
        throw new NotFoundException(
          "Shartnoma topilmadi yoki bu o'quvchiga tegishli emas",
        );
      }
      if (params.branchId && contract.branchId !== params.branchId) {
        throw new BadRequestException(
          "To'lov filiali shartnoma filialiga mos kelmaydi",
        );
      }
      resolvedBranchId = contract.branchId;
    }

    const executeInTx = async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.create({
        data: {
          studentId: params.studentId,
          contractId: params.contractId,
          amount: params.amount,
          method: params.method,
          status: PaymentStatus.COMPLETED,
          source: params.source,
          externalId: params.externalId,
          providerFee: params.providerFee,
          providerFeePercent: params.providerFeePercent,
          note: params.note,
          receivedById: params.performedById,
          branchId: resolvedBranchId,
          companyId: params.companyId,
        },
      });

      await this.transactionsService.recordPayment(
        {
          studentId: params.studentId,
          amount: params.amount,
          paymentId: payment.id,
          contractId: params.contractId,
          branchId: resolvedBranchId,
          companyId: params.companyId,
          performedById: params.performedById,
        },
        tx,
      );

      if (params.contractId) {
        await tx.contract.update({
          where: { id: params.contractId },
          data: { paidAmount: { increment: params.amount } },
        });
      }

      const updatedStudent = await tx.student.findUnique({
        where: { id: params.studentId },
        select: { balance: true },
      });

      await this.entityHistoryService.recordStatusChange({
        entityType: 'Student',
        entityId: params.studentId,
        oldValues: { balans: updatedStudent!.balance - params.amount },
        newValues: {
          balans: updatedStudent!.balance,
          summa: params.amount,
          usul: PAYMENT_METHOD_LABEL[params.method] ?? params.method,
          status: "TO'LOV_QABUL_QILINDI",
        },
        changedById: params.performedById,
        companyId: params.companyId,
        tx,
      });

      return { payment, studentBalance: updatedStudent?.balance };
    };

    try {
      // If an outer transaction was provided, run within it; otherwise create our own
      const { payment, studentBalance } = outerTx
        ? await executeInTx(outerTx)
        : await this.prisma.$transaction(executeInTx, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 15000,
          });

      // Telegram receipt — only when we owned the tx (i.e. it has
      // committed by now). When the caller passed `outerTx` they're
      // responsible for emitting after their own commit, so we skip to
      // avoid notifying for a payment that may still be rolled back.
      if (!outerTx) {
        this.eventEmitter.emit('payment.received', {
          paymentId: payment.id,
          studentId: params.studentId,
          amount: params.amount,
          method: params.method,
          source: params.source,
          studentBalance: studentBalance ?? null,
          companyId: params.companyId,
          performedById: params.performedById,
        } satisfies PaymentReceivedPayload);
      }

      return { ...payment, studentBalance };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Payment with externalId=${params.externalId} for ${params.method} allaqachon mavjud`,
        );
      }
      throw err;
    }
  }
}
