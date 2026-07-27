import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  ) {}

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

        const transaction = await client.transaction.create({
          data: {
            type: TransactionType.MOCK_EXAM_FEE,
            amount: -price,
            balanceBefore,
            balanceAfter,
            studentId: options.studentId,
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
