import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { TransactionsService } from '../transactions/transactions.service';
import { Prisma, RefundStatus } from '@prisma/client';

@Injectable()
export class RefundsProcessService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
  ) {}

  /**
   * Reverse a COMPLETED refund — posted-row-immutable rule: we don't edit
   * the Refund row, we walk back the ledger entry and restore the contract
   * state it mutated. Intended for "we approved by mistake" scenarios.
   *
   * A quick refund funds itself by cancelling prepaid lessons, so undoing it
   * means undoing that too: reverse the release ADJUSTMENT and put the lessons
   * back on the enrollment. Without this the student kept the credit and lost
   * the lessons — which is how one student's phantom balance had to be cleaned up by
   * hand in July 2026.
   *
   * Guardrails:
   *   - Refund must belong to caller's company
   *   - Refund must be COMPLETED (no-op on earlier states)
   *   - Underlying REFUND Transaction must exist and not already be reversed
   */
  async reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId: params.companyId },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        enrollmentId: true,
        approvedAmount: true,
        status: true,
      },
    });
    if (!refund) throw new NotFoundException('Refund topilmadi');

    await assertCallerMayWriteForStudent(
      this.prisma,
      params.performedById,
      refund.studentId,
      params.companyId,
    );

    if (refund.status !== RefundStatus.COMPLETED) {
      throw new BadRequestException(
        'Faqat yakunlangan refundni bekor qilish mumkin',
      );
    }

    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        refundId: id,
        type: 'REFUND',
        reversedTransactionId: null,
        reversedAt: null,
      },
      select: { id: true },
    });
    if (!ledgerEntry) {
      throw new BadRequestException(
        'Refund ledger yozuvi topilmadi yoki avvalroq bekor qilingan',
      );
    }

    // Transaction carries no refund FK, so the release adjustment is found by
    // the tag `releasePrepaidLessons` wrote into its metadata.
    const releaseEntry = await this.prisma.transaction.findFirst({
      where: {
        studentId: refund.studentId,
        type: 'ADJUSTMENT',
        reversedTransactionId: null,
        reversedAt: null,
        metadata: { path: ['refundId'], equals: id },
      },
      select: { id: true, metadata: true },
    });

    const approvedAmount = refund.approvedAmount ?? 0;

    return this.prisma.$transaction(
      async (tx) => {
        await this.transactionsService.reverseTransaction(
          ledgerEntry.id,
          {
            performedById: params.performedById,
            reason: params.reason ?? 'Refund bekor qilindi',
          },
          tx,
        );

        if (releaseEntry) {
          await this.transactionsService.reverseTransaction(
            releaseEntry.id,
            {
              performedById: params.performedById,
              reason: params.reason ?? 'Refund bekor qilindi',
            },
            tx,
          );

          const meta = releaseEntry.metadata as {
            lessonsReleased?: number;
          } | null;
          const lessons = Number(meta?.lessonsReleased ?? 0);
          if (lessons > 0 && refund.enrollmentId) {
            await tx.enrollment.update({
              where: { id: refund.enrollmentId },
              data: { prepaidLessonsRemaining: { increment: lessons } },
            });
          }
        }

        // Undo the contract paidAmount decrement done by the original
        // refund. Contract status stays REFUNDED — operators change it
        // explicitly if they want to reopen the contract. Only runs for
        // legacy refunds tied to a Contract; enrollment-based refunds skip
        // this step.
        if (approvedAmount > 0 && refund.contractId) {
          await tx.contract.update({
            where: { id: refund.contractId },
            data: { paidAmount: { increment: approvedAmount } },
          });
        }

        return { reversedRefundId: id, amount: approvedAmount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
