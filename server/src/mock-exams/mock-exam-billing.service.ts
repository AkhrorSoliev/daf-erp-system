import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Refunds mock exam fees. It does NOT charge them — nothing here, or anywhere,
 * takes a mock fee out of a Student's balance any more.
 *
 * It used to. `tryDeductForStudent` drained a DaF student's balance the moment
 * they registered, and again on every later lesson payment, on the assumption
 * that the balance was a general-purpose wallet. It is not: students top it up
 * for LESSONS. Meanwhile the centre collects mock fees in cash at the desk, so
 * the two channels ran blind to each other and 21 students on the August 2026
 * exam paid twice — 690 000 so'm — with a confirmation message ("To'lovingiz
 * qabul qilindi") that read like a receipt for the cash they had just handed
 * over. The registration flow deducted BEFORE it offered a payment menu, so a
 * student with funds was never even asked.
 *
 * Mock fees are now collected only through channels that are visible to both
 * sides: cash (`markPaid`) or Payme/Click against the participant's publicId
 * (`MockExamGatewayBillingService`). Do not reintroduce a balance path.
 *
 * `refundParticipantFee` remains because historical `MOCK_EXAM_FEE` rows still
 * exist and a participant carrying one may yet be removed.
 */
@Injectable()
export class MockExamBillingService {
  private readonly logger = new Logger(MockExamBillingService.name);

  constructor(
    private prisma: PrismaService,
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
}
