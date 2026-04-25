import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';

@Injectable()
export class TransactionsReadService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get paginated transaction history for a student.
   */
  async findByStudent(
    studentId: number,
    query: TransactionQueryDto,
    companyId: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      studentId,
      companyId,
      ...(query.type && { type: query.type }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          paymentId: true,
          // Join Payment.method so the frontend can render a unified ledger
          // without a second round-trip — PAYMENT rows show Payme/Click/Cash,
          // other types get null.
          payment: {
            select: { method: true },
          },
          attendanceId: true,
          enrollmentId: true,
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Get paginated transaction history for a teacher.
   */
  async findByTeacher(
    teacherId: number,
    query: TransactionQueryDto,
    companyId: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      teacherId,
      companyId,
      ...(query.type && { type: query.type }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          salaryPaymentId: true,
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Get all transactions (admin view) with filters.
   */
  async findAll(query: TransactionQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      companyId,
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.teacherId && { teacherId: query.teacherId }),
      ...(query.type && { type: query.type }),
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
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          branchId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
