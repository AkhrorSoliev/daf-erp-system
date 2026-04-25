import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PaymentQueryDto } from './dto/payment-query.dto';

@Injectable()
export class PaymentsReadService {
  constructor(private prisma: PrismaService) {}

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
}
