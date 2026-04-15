import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { PaymentStatus, Prisma, StudentStatus } from '@prisma/client';
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
    // Verify student exists
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
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

    // Update student balance via TransactionsService
    await this.transactionsService.recordPayment({
      studentId: dto.studentId,
      amount: dto.amount,
      paymentId: payment.id,
      branchId: dto.branchId,
      companyId,
      performedById: userId,
    });

    // Update contract paidAmount if linked
    if (dto.contractId) {
      await this.prisma.contract.update({
        where: { id: dto.contractId },
        data: { paidAmount: { increment: dto.amount } },
      });
    }

    // Record entity history
    await this.entityHistoryService.recordCreate({
      entityType: 'Payment',
      entityId: payment.id,
      newValues: payment,
      changedById: userId,
      companyId,
    });

    // Return payment with updated student balance
    const updatedStudent = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { balance: true },
    });

    return { ...payment, studentBalance: updatedStudent?.balance };
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

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
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

  async findByStudent(studentId: number, query: PaymentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      studentId,
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
