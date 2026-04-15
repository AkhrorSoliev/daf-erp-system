import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType, Prisma } from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Record a student payment (money in).
   * Atomically increments student balance and creates a Transaction record.
   */
  async recordPayment(params: {
    studentId: number;
    amount: number;
    paymentId: string;
    branchId?: number;
    companyId: number;
    performedById?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const student = await this.lockStudent(tx, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore + params.amount;

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.PAYMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          paymentId: params.paymentId,
          branchId: params.branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: "To'lov qabul qilindi",
        },
      });

      await tx.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Deduct per-lesson fee from student balance on attendance.
   * Balance CAN go negative (deduction always succeeds).
   */
  async deductLessonFee(params: {
    studentId: number;
    amount: number;
    attendanceId: string;
    enrollmentId: string;
    companyId: number;
    branchId?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const student = await this.lockStudent(tx, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.LESSON_DEDUCTION,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          attendanceId: params.attendanceId,
          enrollmentId: params.enrollmentId,
          branchId: params.branchId,
          companyId: params.companyId,
          description: 'Dars uchun yechildi',
        },
      });

      await tx.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Record a refund (money out to student).
   */
  async recordRefund(params: {
    studentId: number;
    amount: number;
    refundId: string;
    companyId: number;
    performedById?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const student = await this.lockStudent(tx, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.REFUND,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          refundId: params.refundId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: 'Pul qaytarildi',
        },
      });

      await tx.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Record teacher salary payment (money out from center).
   */
  async recordSalaryPayment(params: {
    teacherId: number;
    amount: number;
    salaryPaymentId: string;
    companyId: number;
    performedById?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const teachers = await tx.$queryRaw<{ id: number; balance: number }[]>`
        SELECT id, balance FROM "User" WHERE id = ${params.teacherId} FOR UPDATE
      `;
      if (!teachers.length) {
        throw new Error(`Teacher ${params.teacherId} topilmadi`);
      }
      const teacher = teachers[0];
      const balanceBefore = teacher.balance;
      const balanceAfter = balanceBefore - params.amount;

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.SALARY_PAYMENT,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          teacherId: params.teacherId,
          salaryPaymentId: params.salaryPaymentId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: "Oylik to'landi",
        },
      });

      await tx.user.update({
        where: { id: params.teacherId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Manual balance adjustment (correction by admin).
   */
  async createAdjustment(params: {
    studentId: number;
    amount: number;
    description: string;
    branchId?: number;
    companyId: number;
    performedById: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const student = await this.lockStudent(tx, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore + params.amount;

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.ADJUSTMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          branchId: params.branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: params.description,
        },
      });

      await tx.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * Get paginated transaction history for a student.
   */
  async findByStudent(studentId: number, query: TransactionQueryDto, companyId?: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      studentId,
      ...(companyId && { companyId }),
      ...(query.type && { type: query.type }),
      ...(query.startDate && query.endDate && {
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
          attendanceId: true,
          enrollmentId: true,
          performedBy: { select: { id: true, firstName: true, lastName: true } },
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
  async findByTeacher(teacherId: number, query: TransactionQueryDto, companyId?: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.TransactionWhereInput = {
      teacherId,
      ...(companyId && { companyId }),
      ...(query.type && { type: query.type }),
      ...(query.startDate && query.endDate && {
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
          performedBy: { select: { id: true, firstName: true, lastName: true } },
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
      ...(query.startDate && query.endDate && {
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
          performedBy: { select: { id: true, firstName: true, lastName: true } },
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

  /**
   * Lock a student row for atomic balance update (SELECT FOR UPDATE).
   */
  private async lockStudent(
    tx: Prisma.TransactionClient,
    studentId: number,
  ): Promise<{ id: number; balance: number }> {
    const [student] = await tx.$queryRaw<{ id: number; balance: number }[]>`
      SELECT id, balance FROM "Student" WHERE id = ${studentId} FOR UPDATE
    `;
    if (!student) {
      throw new Error(`Student ${studentId} topilmadi`);
    }
    return student;
  }
}
