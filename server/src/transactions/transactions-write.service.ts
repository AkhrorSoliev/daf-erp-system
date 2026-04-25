import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType, Prisma } from '@prisma/client';

@Injectable()
export class TransactionsWriteService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run a callback inside the given transaction client, or open a new one with Serializable isolation.
   */
  private runInTx<T>(
    callback: (client: Prisma.TransactionClient) => Promise<T>,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    if (tx) return callback(tx);
    return this.prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    });
  }

  /**
   * Record a student payment (money in).
   * Atomically increments student balance and creates a Transaction record.
   */
  async recordPayment(
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
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore + params.amount;

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.PAYMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          paymentId: params.paymentId,
          contractId: params.contractId,
          branchId: params.branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: "To'lov qabul qilindi",
        },
      });

      await client.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, tx);
  }

  /**
   * Deduct per-lesson fee from student balance on attendance.
   * Balance CAN go negative (deduction always succeeds).
   */
  async deductLessonFee(
    params: {
      studentId: number;
      amount: number;
      attendanceId: string;
      enrollmentId: string;
      contractId?: string;
      companyId: number;
      branchId?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.LESSON_DEDUCTION,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          attendanceId: params.attendanceId,
          enrollmentId: params.enrollmentId,
          contractId: params.contractId,
          branchId: params.branchId,
          companyId: params.companyId,
          description: 'Dars uchun yechildi',
        },
      });

      await client.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, tx);
  }

  /**
   * Record a refund (money out to student).
   */
  async recordRefund(
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
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.REFUND,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          refundId: params.refundId,
          contractId: params.contractId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: 'Pul qaytarildi',
        },
      });

      await client.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, tx);
  }

  /**
   * Record employee salary payment (money out from center).
   * Works for any employee role — teacher, admin, cashier, branch director.
   */
  async recordSalaryPayment(
    params: {
      userId: number;
      amount: number;
      salaryPaymentId: string;
      companyId: number;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const users = await client.$queryRaw<{ id: number; balance: number }[]>`
        SELECT id, balance FROM "User" WHERE id = ${params.userId} FOR UPDATE
      `;
      if (!users.length) {
        throw new Error(`User ${params.userId} topilmadi`);
      }
      const user = users[0];
      const balanceBefore = user.balance;
      const balanceAfter = balanceBefore - params.amount;

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.SALARY_PAYMENT,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          teacherId: params.userId,
          salaryPaymentId: params.salaryPaymentId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: "Oylik to'landi",
        },
      });

      await client.user.update({
        where: { id: params.userId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, tx);
  }

  /**
   * Write a reversal entry that cancels a posted Transaction.
   *
   * Posted finance rows (PAID salary, COMPLETED refund, recorded expense etc.)
   * must not be destructively edited — the ledger is append-only. This helper
   * writes the inverse transaction, links it to the original via
   * `reversedTransactionId`, and restores the relevant balance.
   */
  async reverseTransaction(
    originalId: string,
    params: { performedById?: number; reason?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const original = await client.transaction.findUnique({
        where: { id: originalId },
      });
      if (!original) {
        throw new Error(`Transaction ${originalId} topilmadi`);
      }
      if (original.reversedTransactionId) {
        throw new Error(`Transaction ${originalId} allaqachon qaytarilgan`);
      }
      // Reject reversing a reversal (keeps the chain flat).
      const alreadyReversed = await client.transaction.findFirst({
        where: { reversedTransactionId: originalId },
        select: { id: true },
      });
      if (alreadyReversed) {
        throw new Error(
          `Transaction ${originalId} uchun reversal allaqachon mavjud`,
        );
      }

      const reversalAmount = -original.amount;
      let balanceBefore = 0;
      let balanceAfter = 0;

      // Restore student balance for student-scoped transactions.
      if (original.studentId) {
        const student = await this.lockStudent(client, original.studentId);
        balanceBefore = student.balance;
        balanceAfter = balanceBefore + reversalAmount;
        await client.student.update({
          where: { id: original.studentId },
          data: { balance: balanceAfter },
        });
      } else if (
        original.teacherId &&
        original.type === TransactionType.SALARY_PAYMENT
      ) {
        // SALARY_PAYMENT touches user balance — reverse it.
        const users = await client.$queryRaw<{ id: number; balance: number }[]>`
          SELECT id, balance FROM "User" WHERE id = ${original.teacherId} FOR UPDATE
        `;
        if (users.length) {
          balanceBefore = users[0].balance;
          balanceAfter = balanceBefore + reversalAmount;
          await client.user.update({
            where: { id: original.teacherId },
            data: { balance: balanceAfter },
          });
        }
      }

      return client.transaction.create({
        data: {
          type: original.type,
          amount: reversalAmount,
          balanceBefore,
          balanceAfter,
          studentId: original.studentId,
          teacherId: original.teacherId,
          paymentId: original.paymentId,
          attendanceId: original.attendanceId,
          enrollmentId: original.enrollmentId,
          contractId: original.contractId,
          expenseId: original.expenseId,
          salaryPaymentId: original.salaryPaymentId,
          refundId: original.refundId,
          branchId: original.branchId,
          companyId: original.companyId,
          performedById: params.performedById,
          reversedTransactionId: original.id,
          description: params.reason
            ? `Bekor qilindi: ${params.reason}`
            : `Bekor qilindi (${original.id})`,
        },
      });
    }, tx);
  }

  /**
   * Record a center expense in the universal ledger.
   *
   * Expenses don't hit a balance column (center cash is not yet modelled as an
   * account), so balanceBefore/balanceAfter are both 0. The entry exists so
   * cash-flow reports and audits can reconstruct every outflow.
   *
   * For TEACHER_ADVANCE, pass relatedUserId — it populates teacherId so the
   * advance shows up on the employee's transaction history.
   */
  async recordExpense(
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
    return this.runInTx(async (client) => {
      return client.transaction.create({
        data: {
          type: TransactionType.EXPENSE,
          amount: -params.amount,
          balanceBefore: 0,
          balanceAfter: 0,
          teacherId: params.relatedUserId,
          expenseId: params.expenseId,
          companyId: params.companyId,
          branchId: params.branchId,
          performedById: params.performedById,
          description: params.description ?? 'Xarajat',
        },
      });
    }, tx);
  }

  /**
   * Manual balance adjustment (correction by admin).
   */
  async createAdjustment(
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
    return this.runInTx(async (client) => {
      // Multi-tenant guard: confirm the target student belongs to the
      // caller's company before mutating the balance ledger.
      const studentCheck = await client.student.findFirst({
        where: { id: params.studentId, companyId: params.companyId },
        select: { id: true },
      });
      if (!studentCheck) {
        throw new NotFoundException("O'quvchi topilmadi");
      }

      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore + params.amount;

      const transaction = await client.transaction.create({
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

      await client.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      return transaction;
    }, tx);
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
