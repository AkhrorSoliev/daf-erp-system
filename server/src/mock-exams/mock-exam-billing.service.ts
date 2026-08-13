import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { resolveStudentBranchId } from '../common/finance/resolve-branch';

/**
 * Statuses past which an exam can no longer bill a balance. GRADING is the
 * cut-off: by then the sitting has happened and whoever turned up was let in
 * on whatever the desk collected, so the ledger cannot infer non-payment from
 * `paid=false` any more.
 */
export const FINISHED_EXAM_STATUSES: MockExamStatus[] = [
  MockExamStatus.GRADING,
  MockExamStatus.ANNOUNCED,
  MockExamStatus.ARCHIVED,
];

interface SettlementOptions {
  studentId: number;
  companyId: number;
  performedById?: number | null;
}

interface SettlementResult {
  /** How many mock registrations got marked paid in this run. */
  paidCount: number;
  /** Sum (so'm) deducted from the student's balance. */
  deductedAmount: number;
}

/**
 * Drains pending mock exam fees from a Student's balance.
 *
 * Mirrors the existing "retroactive billing" pattern used for lesson fees:
 * after any balance top-up (payment land, manual adjustment) we look for
 * unpaid mock registrations linked to this student and settle the oldest
 * ones first while balance covers them. Each settlement writes a
 * `MOCK_EXAM_FEE` Transaction (negative amount) and flips the participant's
 * `paid` flag.
 *
 * Non-DaF participants (no Student row) are NOT touched here — their
 * payments are tracked in MockExamGatewayTransaction and they have no
 * balance to deduct from.
 */
@Injectable()
export class MockExamBillingService {
  private readonly logger = new Logger(MockExamBillingService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private transactions: TransactionsService,
  ) {}

  /**
   * Give back a mock fee that was taken from a Student's balance, when the
   * registration it paid for goes away (participant removed).
   *
   * Removing a participant used to be a bare `deletedAt` stamp: the money
   * stayed gone and the `paid` flag stayed true on the dead row. Because the
   * per-exam unique index is scoped to `deletedAt IS NULL`, the same person
   * could then register again — and be charged a SECOND time. Two students
   * on the August 2026 exam were billed 60 000 so'm each that way, both
   * within six minutes of the admin deleting and re-adding them.
   *
   * Idempotent: an already-reversed fee (or a participant who never paid from
   * balance — cash and gateway payers write no Transaction) is a no-op.
   * Returns the so'm returned, 0 when there was nothing to give back.
   */
  async refundParticipantFee(
    participantId: string,
    performedById?: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const fees = await client.transaction.findMany({
      where: {
        type: TransactionType.MOCK_EXAM_FEE,
        reversedAt: null,
        amount: { lt: 0 },
        metadata: { path: ['mockParticipantId'], equals: participantId },
      },
      select: { id: true, amount: true, studentId: true },
    });

    let returned = 0;
    for (const fee of fees) {
      await this.transactions.reverseTransaction(
        fee.id,
        {
          performedById,
          reason: "Mock imtihon ro'yxati bekor qilindi",
        },
        tx,
      );
      returned += -fee.amount;
      this.logger.log(
        `Mock fee refunded: participant=${participantId} student=${fee.studentId} amount=${-fee.amount}`,
      );
    }
    return returned;
  }

  /**
   * Settle all unpaid mock fees for `studentId` against the student's
   * current balance. Always runs inside a transaction — caller passes
   * `tx` when called from the payment write path so it joins the same
   * Serializable txn that just topped up the balance.
   */
  async tryDeductForStudent(
    options: SettlementOptions,
    tx?: Prisma.TransactionClient,
  ): Promise<SettlementResult> {
    return this.runInTx(async (client) => {
      const unpaid = await client.mockExamParticipant.findMany({
        where: {
          studentId: options.studentId,
          paid: false,
          deletedAt: null,
          // An exam that is OVER must never reach into a balance again. This
          // clause was absent, and `paid=false` alone kept 27 rows of an
          // ARCHIVED August exam armed: every one of those students had paid
          // cash at the desk, and the next lesson payment any of them made
          // would have taken another 30 000 so'm — 810 000 in total. The fee
          // is owed at REGISTRATION time; once the exam is graded and closed,
          // an unpaid row is a bookkeeping gap for an admin to settle, not a
          // debt to collect silently from money meant for lessons.
          exam: {
            deletedAt: null,
            status: { notIn: FINISHED_EXAM_STATUSES },
          },
        },
        orderBy: { registeredAt: 'asc' },
        select: {
          id: true,
          examId: true,
          feeAmount: true,
          telegramChatId: true,
          publicId: true,
          exam: { select: { price: true, title: true } },
        },
      });

      if (unpaid.length === 0) {
        return { paidCount: 0, deductedAmount: 0, settled: [] };
      }

      let paidCount = 0;
      let deductedAmount = 0;
      // Xabar yuborish uchun ro'yxat — hodisalar tranzaksiyadan KEYIN
      // chiqariladi, aks holda rollback bo'lganda yolg'on xabar ketardi.
      const settled: {
        telegramChatId: string | null;
        publicId: number;
        examTitle: string;
        feeAmount: number;
      }[] = [];

      for (const participant of unpaid) {
        // The fee locked in at registration (after any DaF discount);
        // legacy rows fall back to the exam's current price.
        const price = participant.feeAmount ?? participant.exam.price;
        // Free mocks shouldn't ever land here (the bot doesn't show a
        // payment prompt for price=0 and the gateway path skips them),
        // but if they do, just flip the flag without any ledger noise.
        if (price <= 0) {
          await client.mockExamParticipant.update({
            where: { id: participant.id },
            data: { paid: true, paidAt: new Date() },
          });
          paidCount++;
          continue;
        }

        // Lock + read fresh balance for each iteration (a previous mock
        // deduction in this same loop reduces the available balance).
        const student = await this.lockStudent(client, options.studentId);
        if (student.balance < price) {
          // Out of money — leave this and any later mocks pending. They
          // get a second chance the next time balance grows.
          break;
        }

        const balanceBefore = student.balance;
        const balanceAfter = balanceBefore - price;

        // Mock fees leave the student's balance, so they are that student's
        // branch's revenue. Without this the row is invisible to every
        // per-branch total (D4: Σ(branches) must equal the company figure).
        const branchId = await resolveStudentBranchId(
          client,
          options.studentId,
          options.companyId,
        );

        const transaction = await client.transaction.create({
          data: {
            type: TransactionType.MOCK_EXAM_FEE,
            amount: -price,
            balanceBefore,
            balanceAfter,
            studentId: options.studentId,
            branchId,
            companyId: options.companyId,
            description: 'Mock imtihon to\'lovi',
            metadata: {
              mockParticipantId: participant.id,
              mockExamId: participant.examId,
            } as Prisma.InputJsonValue,
          },
        });

        await client.student.update({
          where: { id: options.studentId },
          data: { balance: balanceAfter },
        });

        await client.mockExamParticipant.update({
          where: { id: participant.id },
          data: {
            paid: true,
            paidAt: new Date(),
          },
        });

        this.logger.log(
          `Mock fee settled: participant=${participant.id} student=${options.studentId} ` +
            `amount=${price} tx=${transaction.id}`,
        );

        settled.push({
          telegramChatId: participant.telegramChatId,
          publicId: participant.publicId,
          examTitle: participant.exam.title,
          feeAmount: price,
        });
        paidCount++;
        deductedAmount += price;
      }

      return { paidCount, deductedAmount, settled };
    }, tx).then((res) => {
      // Balansdan yechilganda ham foydalanuvchi xabardor bo'lsin — ilgari
      // faqat admin naqd qabul qilganda xabar ketardi.
      for (const s of res.settled) {
        this.eventEmitter.emit('mock.participant.paid', s);
      }
      return { paidCount: res.paidCount, deductedAmount: res.deductedAmount };
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async runInTx<T>(
    fn: (client: Prisma.TransactionClient) => Promise<T>,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    if (tx) return fn(tx);
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    });
  }

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
