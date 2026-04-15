import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { PaymentMethod, PaymentSource, PaymentStatus, Prisma, StudentStatus } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async create(dto: CreatePaymentDto, userId: number, companyId: number) {
    // Verify student belongs to this company
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, deletedAt: null, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    // Verify contract belongs to this company (if provided)
    if (dto.contractId) {
      const contract = await this.prisma.contract.findFirst({
        where: { id: dto.contractId, deletedAt: null, companyId },
        select: { id: true },
      });
      if (!contract) {
        throw new NotFoundException('Shartnoma topilmadi');
      }
    }

    // Atomic: payment + balance transaction + contract update are all-or-nothing.
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
            branchId: dto.branchId,
            companyId,
          },
        });

        await this.transactionsService.recordPayment(
          {
            studentId: dto.studentId,
            amount: dto.amount,
            paymentId: payment.id,
            contractId: dto.contractId,
            branchId: dto.branchId,
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

        // Audit write inside tx so it can't drift from the payment it
        // describes — if history insert fails, the whole payment rolls back.
        await this.entityHistoryService.recordCreate({
          entityType: 'Payment',
          entityId: payment.id,
          newValues: payment,
          changedById: userId,
          companyId,
          tx,
        });

        return { payment, studentBalance: updatedStudent?.balance };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { ...payment, studentBalance };
  }

  /**
   * Reverse a posted payment — the "posted row immutable" rule in action.
   * Instead of editing the Payment row, we write a reversal of its ledger
   * entry and undo the contract.paidAmount increment in the same tx. The
   * Payment row itself stays for audit; the ledger is the source of truth
   * for whether it counted.
   *
   * Guardrails:
   *   - Payment must belong to caller's company (multi-tenant scope)
   *   - Payment must have a matching PAYMENT Transaction (legacy rows
   *     without one can't be reversed via this path)
   *   - Transaction must not already be reversed
   */
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

    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        paymentId: id,
        type: 'PAYMENT',
        reversedTransactionId: null,
      },
      select: { id: true },
    });
    if (!ledgerEntry) {
      throw new BadRequestException(
        "To'lovning ledger yozuvi topilmadi — bu yozuv avvalroq bekor qilingan yoki yaratilmagan",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await this.transactionsService.reverseTransaction(
          ledgerEntry.id,
          { performedById: params.performedById, reason: params.reason ?? "To'lov bekor qilindi" },
          tx,
        );

        if (payment.contractId) {
          await tx.contract.update({
            where: { id: payment.contractId },
            data: { paidAmount: { decrement: payment.amount } },
          });
        }

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Payment',
          entityId: id,
          oldValues: { status: payment.status },
          newValues: { status: 'REVERSED', reason: params.reason ?? null },
          changedById: params.performedById,
          companyId: params.companyId,
          tx,
        });

        return { reversedPaymentId: id, amount: payment.amount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Create a Payment from a verified gateway webhook or an admin attach-external
   * action. The idempotency guard is the @@unique (method, externalId, companyId)
   * on Payment — duplicate webhook retries fail on insert, not on balance math.
   *
   * Used by:
   *   - PaymentGatewaysModule (source = GATEWAY_WEBHOOK)
   *   - PaymentsController.attachExternal (source = MANUAL_ATTACH)
   */
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
  ) {
    // Verify scope before touching DB.
    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, deletedAt: null, companyId: params.companyId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    if (params.contractId) {
      const contract = await this.prisma.contract.findFirst({
        where: { id: params.contractId, deletedAt: null, companyId: params.companyId },
        select: { id: true },
      });
      if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    }

    try {
      const { payment, studentBalance } = await this.prisma.$transaction(
        async (tx) => {
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
              branchId: params.branchId,
              companyId: params.companyId,
            },
          });

          await this.transactionsService.recordPayment(
            {
              studentId: params.studentId,
              amount: params.amount,
              paymentId: payment.id,
              contractId: params.contractId,
              branchId: params.branchId,
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

          return { payment, studentBalance: updatedStudent?.balance };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return { ...payment, studentBalance };
    } catch (err) {
      // Unique (method, externalId, companyId) collision → duplicate webhook /
      // re-attach. Surface a deterministic error so the caller can decide what
      // to return upstream without re-creating the row.
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

  async findAll(query: PaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      companyId,
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.method && { method: query.method }),
      ...(query.status && { status: query.status }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.startDate && query.endDate && {
        createdAt: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate + 'T23:59:59.999Z'),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          receiptNumber: true,
          note: true,
          branchId: true,
          createdAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string, companyId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        externalId: true,
        providerFee: true,
        providerFeePercent: true,
        receiptNumber: true,
        note: true,
        branchId: true,
        companyId: true,
        createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true, balance: true } },
        contract: { select: { id: true, contractNumber: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }
    return payment;
  }

  async findByStudent(studentId: number, query: PaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      studentId,
      companyId,
      ...(query.method && { method: query.method }),
      ...(query.status && { status: query.status }),
      ...(query.startDate && query.endDate && {
        createdAt: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate + 'T23:59:59.999Z'),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          receiptNumber: true,
          note: true,
          createdAt: true,
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
          contract: { select: { id: true, contractNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Get students with negative balance (debtors).
   */
  async getDebtors(companyId: number, query: { branchId?: number; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      balance: { lt: 0 },
      ...(query.branchId && {
        branches: { some: { branchId: query.branchId } },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: {
              group: {
                select: {
                  name: true,
                  course: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { balance: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Get students with low balance (pending payments - will need payment soon).
   */
  async getPending(companyId: number, query: { branchId?: number; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      balance: { lte: 0 },
      enrollments: {
        some: { status: 'ACTIVE', deletedAt: null },
      },
      ...(query.branchId && {
        branches: { some: { branchId: query.branchId } },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: {
              group: {
                select: {
                  name: true,
                  course: { select: { name: true, price: true } },
                },
              },
            },
          },
        },
        orderBy: { balance: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
