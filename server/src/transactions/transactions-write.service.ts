import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransactionType,
  LessonDeductionMode,
  Prisma,
} from '@prisma/client';

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
   * Deduct an upfront lesson-batch fee from the student's balance.
   *
   * The new prepaid model (Faza 3) uses this on the FIRST attended lesson
   * of a cycle (or first attendance after running out of prepaid). The
   * Enrollment.prepaidLessonsRemaining counter then absorbs subsequent
   * lessons via recordLessonConsumption (no balance impact).
   *
   * `mode` distinguishes:
   *   - FULL_CYCLE: balance covered the whole course price (lessonPaymentCount × perLessonCost)
   *   - PARTIAL:    balance only covered some lessons; fewer prepaid units bought
   * Stored in metadata so reports/audit can tell the two apart.
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
      mode?: LessonDeductionMode;
      perLessonCost?: number;
      lessonsCovered?: number;
      discountPercent?: number;
      fullAmount?: number;
      // SINGLE_UNCOVERED rows ride the same deduction path but defer the
      // teacher's salary accrual until a payment lands and `uncoveredAmount`
      // drains to zero. Stored in metadata so the retroactive-billing
      // walker can find and settle them oldest-first.
      salaryDeferred?: boolean;
      uncoveredAmount?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;

      const metadata: Prisma.InputJsonValue | undefined = params.mode
        ? {
            mode: params.mode,
            ...(params.perLessonCost !== undefined && {
              perLessonCost: params.perLessonCost,
            }),
            ...(params.lessonsCovered !== undefined && {
              lessonsCovered: params.lessonsCovered,
            }),
            ...(params.discountPercent !== undefined && {
              discountPercent: params.discountPercent,
            }),
            ...(params.fullAmount !== undefined && {
              fullAmount: params.fullAmount,
            }),
            ...(params.salaryDeferred !== undefined && {
              salaryDeferred: params.salaryDeferred,
            }),
            ...(params.uncoveredAmount !== undefined && {
              uncoveredAmount: params.uncoveredAmount,
            }),
          }
        : undefined;

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
          ...(metadata && { metadata }),
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
   * Audit-only ledger row written each time an attended lesson burns one
   * unit of `Enrollment.prepaidLessonsRemaining`. Balance is unchanged
   * (amount=0, balanceBefore == balanceAfter): the money was already
   * deducted by an earlier LESSON_DEDUCTION batch.
   *
   * Idempotency is enforced at the DB level by a partial unique index on
   * `(attendanceId) WHERE type = 'LESSON_CONSUMPTION' AND reversedTransactionId IS NULL`,
   * so calling this twice for the same attendance throws P2002 — the
   * billing service catches that and treats it as a no-op.
   */
  async recordLessonConsumption(
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
    return this.runInTx(async (client) => {
      const student = await client.student.findUnique({
        where: { id: params.studentId },
        select: { balance: true },
      });
      const balance = student?.balance ?? 0;

      return client.transaction.create({
        data: {
          type: TransactionType.LESSON_CONSUMPTION,
          amount: 0,
          balanceBefore: balance,
          balanceAfter: balance,
          studentId: params.studentId,
          attendanceId: params.attendanceId,
          enrollmentId: params.enrollmentId,
          contractId: params.contractId,
          branchId: params.branchId,
          companyId: params.companyId,
          description: 'Oldindan to`langan dars iste`mol qilindi',
          metadata: { perLessonCost: params.perLessonCost },
        },
      });
    }, tx);
  }

  /**
   * Reverse a LESSON_CONSUMPTION row (used when an attendance flips back
   * to ABSENT/EXCUSED, or when a lesson is cancelled with attendance
   * already taken). Just delegates to reverseTransaction — the parent
   * handles ledger linkage. Caller is responsible for the prepaid +1
   * and salary accrual reversal in the same tx.
   */
  async reverseLessonConsumption(
    consumptionTransactionId: string,
    params: { performedById?: number; reason?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return this.reverseTransaction(consumptionTransactionId, params, tx);
  }

  /**
   * Record a one-time INITIAL_BALANCE row for a student. Used when an
   * existing center transitions to the new finance system: instead of
   * importing every historical payment, an admin enters the student's
   * current outstanding balance and the system tracks lesson-by-lesson
   * from there.
   *
   * Enforced at the DB level by a partial unique index — only one
   * INITIAL_BALANCE per student. Re-running throws P2002, which we
   * translate into a clear domain error.
   */
  async recordInitialBalance(
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
    if (params.amount < 0) {
      throw new BadRequestException("Boshlang'ich balans manfiy bo'la olmaydi");
    }

    return this.runInTx(async (client) => {
      // Multi-tenant guard.
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

      try {
        const transaction = await client.transaction.create({
          data: {
            type: TransactionType.INITIAL_BALANCE,
            amount: params.amount,
            balanceBefore,
            balanceAfter,
            studentId: params.studentId,
            branchId: params.branchId,
            companyId: params.companyId,
            performedById: params.performedById,
            description: params.note ?? "Boshlang'ich balans kiritildi",
          },
        });

        await client.student.update({
          where: { id: params.studentId },
          data: { balance: balanceAfter },
        });

        return transaction;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BadRequestException(
            "Boshlang'ich balans bu o'quvchi uchun allaqachon kiritilgan",
          );
        }
        throw err;
      }
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
      // The new reversedAt marker is the source of truth for "is this row
      // still active?". A pre-existing value here means we already reversed
      // it; the older `reversalEntries` check below kept around as a
      // belt-and-braces guard for legacy rows that pre-date the column.
      if (original.reversedAt) {
        throw new Error(
          `Transaction ${originalId} uchun reversal allaqachon mavjud`,
        );
      }
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

      const reversal = await client.transaction.create({
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

      // Mark the original as reversed so all "still-active?" filters and
      // partial unique indexes (LESSON_CONSUMPTION idempotency,
      // INITIAL_BALANCE per student, etc) see it as gone in O(1). Without
      // this, ABSENT→PRESENT after a reverse would no-op because the
      // idempotency check would still find the original consumption row.
      await client.transaction.update({
        where: { id: original.id },
        data: {
          reversedAt: new Date(),
          reversedById: params.performedById,
        },
      });

      return reversal;
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
   * Retroactive discount-rebalance entry. Written by StudentsWriteService
   * when an admin changes `Student.discountPercent`. `amount` is signed:
   * positive = credit the student (they were over-charged under the old
   * discount), negative = debit (they were under-charged). The accompanying
   * metadata records the old/new discount and the totals used to compute
   * the delta, so the audit trail is self-describing.
   */
  async recordDiscountAdjustment(
    params: {
      studentId: number;
      amount: number;
      oldDiscountPercent: number;
      newDiscountPercent: number;
      totalFullAmount: number;
      targetCharge: number;
      previousNetDeducted: number;
      companyId: number;
      branchId?: number;
      performedById?: number;
      description?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore + params.amount;

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.DISCOUNT_ADJUSTMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          branchId: params.branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description:
            params.description ??
            `Chegirma o'zgartirildi: ${params.oldDiscountPercent}% → ${params.newDiscountPercent}%`,
          metadata: {
            oldDiscountPercent: params.oldDiscountPercent,
            newDiscountPercent: params.newDiscountPercent,
            totalFullAmount: params.totalFullAmount,
            targetCharge: params.targetCharge,
            previousNetDeducted: params.previousNetDeducted,
          },
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
