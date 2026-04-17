import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
  Prisma,
  StudentStatus,
} from '@prisma/client';
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

        const methodLabel: Record<string, string> = {
          CASH: 'Naqd',
          PAYME: 'Payme',
          CLICK: 'Click',
          UZUM: 'Uzum',
          TRANSFER: "Bank o'tkazmasi",
        };
        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: dto.studentId,
          oldValues: { balans: updatedStudent!.balance - dto.amount },
          newValues: {
            balans: updatedStudent!.balance,
            summa: dto.amount,
            usul: methodLabel[dto.method] ?? dto.method,
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

        const methodLabel: Record<string, string> = {
          CASH: 'Naqd',
          PAYME: 'Payme',
          CLICK: 'Click',
          UZUM: 'Uzum',
          TRANSFER: "Bank o'tkazmasi",
        };
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

      const methodLabel: Record<string, string> = {
        CASH: 'Naqd',
        PAYME: 'Payme',
        CLICK: 'Click',
        UZUM: 'Uzum',
        TRANSFER: "Bank o'tkazmasi",
      };
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Student',
        entityId: params.studentId,
        oldValues: { balans: updatedStudent!.balance - params.amount },
        newValues: {
          balans: updatedStudent!.balance,
          summa: params.amount,
          usul: methodLabel[params.method] ?? params.method,
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

  async findAll(query: PaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      companyId,
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.method && { method: query.method }),
      ...(query.status
        ? { status: query.status }
        : { status: { not: PaymentStatus.REVERSED } }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.startDate &&
        query.endDate && {
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
          source: true,
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
        source: true,
        externalId: true,
        providerFee: true,
        providerFeePercent: true,
        receiptNumber: true,
        note: true,
        branchId: true,
        companyId: true,
        createdAt: true,
        student: {
          select: { id: true, firstName: true, lastName: true, balance: true },
        },
        contract: { select: { id: true, contractNumber: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }
    return payment;
  }

  async findByStudent(
    studentId: number,
    query: PaymentQueryDto,
    companyId: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      studentId,
      companyId,
      ...(query.method && { method: query.method }),
      ...(query.status
        ? { status: query.status }
        : { status: { not: PaymentStatus.REVERSED } }),
      ...(query.startDate &&
        query.endDate && {
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
          source: true,
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

  async getDebtors(
    companyId: number,
    query: { branchId?: number; page?: number; pageSize?: number },
  ) {
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

  async getPending(
    companyId: number,
    query: { branchId?: number; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      balance: { lt: 0 },
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
