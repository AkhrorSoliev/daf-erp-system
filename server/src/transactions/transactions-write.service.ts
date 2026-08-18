import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransactionType,
  LessonDeductionMode,
  PaymentMethod,
  ExpensePaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  CashMovementsService,
  cashTypeForPaymentMethod,
  cashTypeForExpenseMethod,
} from '../cash-accounts/cash-movements.service';
import {
  resolveStudentBranchId,
  tryResolveUserBranchId,
} from '../common/finance/resolve-branch';

// Transaction types that represent REAL money in/out of the center and so
// must mirror onto a cash account. Everything else (lesson deduction /
// consumption / adjustment / initial balance / discount / write-off /
// withdrawal / mock fee) is an internal balance allocation — no cash moves.
const CASH_FLOW_TYPES: ReadonlySet<TransactionType> = new Set([
  TransactionType.PAYMENT,
  TransactionType.EXPENSE,
  TransactionType.SALARY_PAYMENT,
  TransactionType.REFUND,
]);

@Injectable()
export class TransactionsWriteService {
  constructor(
    private prisma: PrismaService,
    private cashMovements: CashMovementsService,
  ) {}

  /**
   * Every student-scoped ledger row must carry a branch.
   *
   * This service is the ONLY path that writes `Transaction` rows, so resolving
   * the branch here fixes every caller at once — previously each call site had
   * to remember to pass `branchId` and most did not, which is how ~8 900
   * branch-less rows accumulated. A branch-less row is unrecoverable by any
   * report filter, so `Σ(branches)` silently stops matching the company total.
   *
   * Fail-closed on purpose (see `resolveStudentBranchId`): refusing to write is
   * cheaper than writing a row nobody can attribute later. D5 guarantees every
   * student has exactly one branch, so this only throws on genuinely broken data.
   */
  private async branchForStudent(
    client: Prisma.TransactionClient,
    studentId: number,
    companyId: number,
    explicit?: number | null,
  ): Promise<number> {
    if (explicit != null) return explicit;
    return resolveStudentBranchId(client, studentId, companyId);
  }

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
      // Drives which cash account receives the money (CASH → kassa,
      // gateway/transfer → bank). Defaults to CASH when omitted.
      method?: PaymentMethod;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore + params.amount;
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.PAYMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          paymentId: params.paymentId,
          contractId: params.contractId,
          branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: "To'lov qabul qilindi",
        },
      });

      await client.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      // Mirror real money into a cash account (no-op if none configured).
      await this.cashMovements.recordInflow(
        {
          companyId: params.companyId,
          branchId,
          amount: params.amount,
          preferType: cashTypeForPaymentMethod(
            params.method ?? PaymentMethod.CASH,
          ),
          transactionId: transaction.id,
          description: "To'lov qabul qilindi",
          performedById: params.performedById,
        },
        client,
      );

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
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

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
          branchId,
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

      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

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
          branchId,
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
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      try {
        const transaction = await client.transaction.create({
          data: {
            type: TransactionType.INITIAL_BALANCE,
            amount: params.amount,
            balanceBefore,
            balanceAfter,
            studentId: params.studentId,
            branchId,
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
      branchId?: number;
      companyId: number;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.REFUND,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          refundId: params.refundId,
          contractId: params.contractId,
          branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: 'Pul qaytarildi',
        },
      });

      await client.student.update({
        where: { id: params.studentId },
        data: { balance: balanceAfter },
      });

      // Cash out of the center to the student — from THAT student's branch
      // kassa, never the company-wide one (D2/D4: no cross-branch money).
      await this.cashMovements.recordOutflow(
        {
          companyId: params.companyId,
          branchId,
          amount: params.amount,
          transactionId: transaction.id,
          description: 'Pul qaytarildi',
          performedById: params.performedById,
        },
        client,
      );

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
      branchId?: number | null;
      companyId: number;
      performedById?: number;
      /**
       * Which kassa account(s) the money left, and how much from each.
       *
       * Without it `resolveAccountId` picks the branch's OLDEST CASH account,
       * which in production is an empty «Asosiy kassa» rather than the drawer
       * the money actually left. A LIST rather than one id because a payout is
       * routinely part cash and part card — the July payroll was — and the cash
       * journal has to say so. `CashMovement.transactionId` is a plain column
       * with no unique constraint, and `reverseByTransactionId` already unwinds
       * every movement it finds, so several slices per payout are safe.
       *
       * Slices must sum to `amount`; a mismatch throws rather than silently
       * booking a different figure to the journal than to the ledger.
       */
      cashSlices?: { cashAccountId: string; amount: number }[];
      /** Ledger + cash-journal text. Defaults to the plain payout wording. */
      description?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const description = params.description ?? "Oylik to'landi";
    const slices = params.cashSlices?.filter((s) => s.amount > 0) ?? [];
    if (slices.length) {
      const sliced = slices.reduce((s, x) => s + x.amount, 0);
      if (sliced !== params.amount) {
        throw new Error(
          `Kassa taqsimoti to'lov summasiga teng emas: ${sliced} ≠ ${params.amount}`,
        );
      }
    }
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
      // D6 gives every employee exactly one branch, so the payee's own branch
      // is the branch that bears the cost. Not fail-closed: a CEO is
      // deliberately branch-less, and blocking their payout would be worse
      // than an unattributed row — those are handled explicitly in Batch 5.
      const branchId =
        params.branchId ?? (await tryResolveUserBranchId(client, params.userId));

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.SALARY_PAYMENT,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          teacherId: params.userId,
          salaryPaymentId: params.salaryPaymentId,
          branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description,
        },
      });

      await client.user.update({
        where: { id: params.userId },
        data: { balance: balanceAfter },
      });

      // Salary leaves the PAYEE'S BRANCH kassa — under D4 each branch carries
      // its own payroll cost, so one branch's cash must never settle another's.
      // One movement per named account, else a single resolved one as before.
      const outflows = slices.length
        ? slices.map((s) => ({ cashAccountId: s.cashAccountId, amount: s.amount }))
        : [{ cashAccountId: undefined, amount: params.amount }];
      for (const out of outflows) {
        await this.cashMovements.recordOutflow(
          {
            companyId: params.companyId,
            branchId,
            amount: out.amount,
            cashAccountId: out.cashAccountId,
            transactionId: transaction.id,
            description,
            performedById: params.performedById,
          },
          client,
        );
      }

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

      // Mark the original reversed FIRST so the partial unique indexes
      // (`tx_consumption_per_attendance_unique` on attendanceId,
      // `tx_initial_balance_per_student_unique` on studentId, both scoped
      // to `reversedAt IS NULL`) see only the new reversal row when we
      // insert it below. If we created the reversal first, both the
      // original and the reversal would be active for an instant and the
      // partial unique would reject the insert with P2002 — the bug that
      // bit the backfill reverse script the first time it had real data
      // to undo.
      await client.transaction.update({
        where: { id: original.id },
        data: {
          reversedAt: new Date(),
          reversedById: params.performedById,
        },
      });

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

      // Unwind any cash movement linked to the original — but only for types
      // that actually moved real money. Lesson/adjustment/etc. reversals have
      // no cash movement, so we skip the lookup on those hot paths.
      if (CASH_FLOW_TYPES.has(original.type)) {
        await this.cashMovements.reverseByTransactionId(
          original.id,
          { performedById: params.performedById, reason: params.reason },
          client,
        );
      }

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
      // CASH → kassa, CARD → bank. Defaults to CASH when omitted.
      paymentMethod?: ExpensePaymentMethod;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const transaction = await client.transaction.create({
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

      // Real money leaving the center → cash account outflow.
      await this.cashMovements.recordOutflow(
        {
          companyId: params.companyId,
          branchId: params.branchId,
          amount: params.amount,
          preferType: cashTypeForExpenseMethod(
            params.paymentMethod ?? ExpensePaymentMethod.CASH,
          ),
          transactionId: transaction.id,
          description: params.description ?? 'Xarajat',
          performedById: params.performedById,
        },
        client,
      );

      return transaction;
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
      // Optional: system-triggered adjustments (status cascades) may have no
      // acting user; the ledger column is nullable.
      performedById?: number;
      /**
       * Optional audit trail. A refund that frees prepaid lessons posts an
       * ADJUSTMENT for the money it releases and has to find that same row
       * again to reverse it — Transaction carries no refund FK, so the link
       * travels here as `{ refundId, lessonsReleased }`.
       */
      metadata?: Prisma.InputJsonValue;
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
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.ADJUSTMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: params.description,
          ...(params.metadata !== undefined && { metadata: params.metadata }),
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
   * Write off a "yo'qolgan o'quvchi" debt: the current-cycle portion of a
   * student's negative balance, when the student never attended any lesson
   * in the current billing cycle. `amount` is always positive (credit) —
   * the caller (DebtWriteOffService) computes it as
   * `min(currentCycleAbsentCount × perLessonCost, |currentBalance|)` and
   * surfaces the breakdown via `metadata` so the audit trail is self-
   * describing. Distinct from a generic ADJUSTMENT so reports/filters can
   * isolate write-offs cleanly.
   */
  async recordDebtWriteOff(
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
    return this.runInTx(async (client) => {
      if (params.amount <= 0) {
        throw new BadRequestException(
          "Hisobdan chiqarish summasi musbat bo'lishi kerak",
        );
      }

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
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.DEBT_WRITE_OFF,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          description: params.description,
          metadata: params.metadata,
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
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.DISCOUNT_ADJUSTMENT,
          amount: params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          branchId,
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
