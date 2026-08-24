import { Injectable } from '@nestjs/common';
import {
  ExpensePaymentMethod,
  LessonDeductionMode,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
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
      method?: PaymentMethod;
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
      discountPercent?: number;
      fullAmount?: number;
      salaryDeferred?: boolean;
      uncoveredAmount?: number;
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
      cashSlices?: { cashAccountId: string; amount: number }[];
      description?: string;
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
      paymentMethod?: ExpensePaymentMethod;
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
      // Optional: system-triggered adjustments (status cascades) may have no
      // acting user; the ledger column is nullable.
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.createAdjustment(params, tx);
  }
  recordDebtWriteOff(
    params: {
      studentId: number;
      amount: number;
      enrollmentId: string;
      description: string;
      metadata: Prisma.InputJsonValue;
      branchId?: number;
      companyId: number;
      performedById: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordDebtWriteOff(params, tx);
  }
  // Reads
  findByStudent(
    studentId: number,
    query: TransactionQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.read.findByStudent(studentId, query, companyId, branchIds);
  }
  getBalanceSummary(studentId: number, companyId: number) {
    return this.read.getBalanceSummary(studentId, companyId);
  }
  getLessonTrail(
    studentId: number,
    companyId: number,
    branchIds: ReportBranchIds,
    options?: {
      contractId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.read.getLessonTrail(studentId, companyId, branchIds, options);
  }
  findByTeacher(
    teacherId: number,
    query: TransactionQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.read.findByTeacher(teacherId, query, companyId, branchIds);
  }
  findAll(
    query: TransactionQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.read.findAll(query, companyId, branchIds);
  }
  findDebtWriteOffs(
    companyId: number,
    options?: Parameters<TransactionsReadService['findDebtWriteOffs']>[1],
  ) {
    return this.read.findDebtWriteOffs(companyId, options);
  }
}
