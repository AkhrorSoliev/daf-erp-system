import { Injectable } from '@nestjs/common';
import { LessonDeductionMode, Prisma } from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionsWriteService } from './transactions-write.service';
import { TransactionsReadService } from './transactions-read.service';

@Injectable()
export class TransactionsService {
  constructor(
    private write: TransactionsWriteService,
    private read: TransactionsReadService,
  ) {}

  // Writes
  recordPayment(
    params: {
      studentId: number;
      amount: number;
      paymentId: string;
      contractId?: string;
      branchId?: number;
      companyId: number;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordPayment(params, tx);
  }
  deductLessonFee(
    params: {
      studentId: number;
      amount: number;
      attendanceId: string;
      enrollmentId: string;
      contractId?: string;
      companyId: number;
      branchId?: number;
      mode?: LessonDeductionMode;
      perLessonCost?: number;
      lessonsCovered?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.deductLessonFee(params, tx);
  }
  recordLessonConsumption(
    params: {
      studentId: number;
      attendanceId: string;
      enrollmentId: string;
      perLessonCost: number;
      contractId?: string;
      companyId: number;
      branchId?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordLessonConsumption(params, tx);
  }
  reverseLessonConsumption(
    consumptionTransactionId: string,
    params: { performedById?: number; reason?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.reverseLessonConsumption(
      consumptionTransactionId,
      params,
      tx,
    );
  }
  recordInitialBalance(
    params: {
      studentId: number;
      amount: number;
      note?: string;
      companyId: number;
      branchId?: number;
      performedById: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordInitialBalance(params, tx);
  }
  recordRefund(
    params: {
      studentId: number;
      amount: number;
      refundId: string;
      contractId?: string;
      companyId: number;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordRefund(params, tx);
  }
  recordSalaryPayment(
    params: {
      userId: number;
      amount: number;
      salaryPaymentId: string;
      companyId: number;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordSalaryPayment(params, tx);
  }
  reverseTransaction(
    originalId: string,
    params: { performedById?: number; reason?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.reverseTransaction(originalId, params, tx);
  }
  recordExpense(
    params: {
      expenseId: string;
      amount: number;
      companyId: number;
      branchId?: number;
      performedById?: number;
      relatedUserId?: number;
      description?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordExpense(params, tx);
  }
  createAdjustment(
    params: {
      studentId: number;
      amount: number;
      description: string;
      branchId?: number;
      companyId: number;
      performedById: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.createAdjustment(params, tx);
  }

  // Reads
  findByStudent(
    studentId: number,
    query: TransactionQueryDto,
    companyId: number,
  ) {
    return this.read.findByStudent(studentId, query, companyId);
  }
  getLessonTrail(
    studentId: number,
    companyId: number,
    options?: {
      contractId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.read.getLessonTrail(studentId, companyId, options);
  }
  findByTeacher(
    teacherId: number,
    query: TransactionQueryDto,
    companyId: number,
  ) {
    return this.read.findByTeacher(teacherId, query, companyId);
  }
  findAll(query: TransactionQueryDto, companyId: number) {
    return this.read.findAll(query, companyId);
  }
}
