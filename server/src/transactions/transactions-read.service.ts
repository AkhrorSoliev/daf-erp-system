import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';
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

    // `types` (comma-separated) takes precedence over single `type` so the
    // student profile's "To'lovlar" tab can ask for {PAYMENT, REFUND,
    // ADJUSTMENT, INITIAL_BALANCE, BALANCE_WITHDRAWAL, LESSON_DEDUCTION} in
    // one call. LESSON_DEDUCTION is a money-flow row (it moves the balance)
    // so it belongs on this tab too — it is the one type intentionally
    // shared with the "Darslar" tab. LESSON_CONSUMPTION (amount=0) is not
    // requested here. Validation already happened in the DTO regex.
    const typesFilter = query.types
      ? (query.types.split(',') as TransactionType[])
      : query.type
        ? [query.type]
        : undefined;

    const where: Prisma.TransactionWhereInput = {
      studentId,
      companyId,
      ...(typesFilter && { type: { in: typesFilter } }),
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
          // LESSON_DEDUCTION rows carry { mode, perLessonCost, lessonsCovered }
          // — the "To'lovlar" tab reads it to label the row ("5 ta dars uchun").
          metadata: true,
          paymentId: true,
          // Join Payment.method so the frontend can render a unified ledger
          // without a second round-trip — PAYMENT rows show Payme/Click/Cash,
          // other types get null.
          payment: {
            select: { id: true, method: true, status: true },
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
   * Lesson-trail report: lesson deductions + per-lesson consumption rows for
   * one student, enriched with attendance metadata. The endpoint is scoped
   * strictly to LESSON_DEDUCTION and LESSON_CONSUMPTION. LESSON_DEDUCTION is
   * intentionally shared with the "To'lovlar" tab (it is a money-flow row);
   * LESSON_CONSUMPTION (amount=0) is exclusive to this "Darslar" tab.
   * Paginated because active students can produce hundreds of
   * LESSON_CONSUMPTION rows.
   */
  async getLessonTrail(
    studentId: number,
    companyId: number,
    options: {
      contractId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    const where: Prisma.TransactionWhereInput = {
      studentId,
      companyId,
      type: {
        in: [TransactionType.LESSON_DEDUCTION, TransactionType.LESSON_CONSUMPTION],
      },
      ...(options.contractId && { contractId: options.contractId }),
      ...(options.from &&
        options.to && {
          createdAt: {
            gte: new Date(options.from),
            lte: new Date(options.to + 'T23:59:59.999Z'),
          },
        }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          description: true,
          metadata: true,
          attendanceId: true,
          contractId: true,
          reversedTransactionId: true,
          createdAt: true,
          payment: {
            select: { method: true, receiptNumber: true },
          },
          contract: {
            select: { contractNumber: true },
          },
          performedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Pull attendance rows in one round-trip so we can enrich LESSON_DEDUCTION
    // and LESSON_CONSUMPTION rows with the lesson date + group name.
    const attendanceIds = rows
      .map((r) => r.attendanceId)
      .filter((id): id is string => !!id);
    const attendances = attendanceIds.length
      ? await this.prisma.attendance.findMany({
          where: { id: { in: attendanceIds } },
          select: {
            id: true,
            date: true,
            group: {
              select: { id: true, name: true, course: { select: { name: true } } },
            },
          },
        })
      : [];
    const attendanceMap = new Map(attendances.map((a) => [a.id, a]));

    const data = rows.map((r) => {
      const attendance = r.attendanceId ? attendanceMap.get(r.attendanceId) : null;
      return {
        id: r.id,
        type: r.type,
        amount: r.amount,
        balanceBefore: r.balanceBefore,
        balanceAfter: r.balanceAfter,
        description: r.description,
        metadata: r.metadata,
        contractNumber: r.contract?.contractNumber ?? null,
        paymentMethod: r.payment?.method ?? null,
        paymentReceipt: r.payment?.receiptNumber ?? null,
        lessonDate: attendance?.date ?? null,
        groupName: attendance?.group.name ?? null,
        courseName: attendance?.group.course.name ?? null,
        isReversal: !!r.reversedTransactionId,
        performedBy: r.performedBy,
        createdAt: r.createdAt,
      };
    });

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
