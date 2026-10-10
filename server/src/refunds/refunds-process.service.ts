import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashAccountType,
  PaymentMethod,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { TransactionsService } from '../transactions/transactions.service';
import { CashMovementsService } from '../cash-accounts/cash-movements.service';
import { EntityHistoryService } from '../common/entity-history';
import { REFUND_TRANSITIONS } from '../common/finance/status-transitions';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { refundView } from './refund-view';

/** A hand-over or cancel that finds the request already handed over or cancelled. */
export const REFUND_CLOSED_MESSAGE = "So'rov allaqachon yopilgan";

const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

@Injectable()
export class RefundsProcessService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private cashMovements: CashMovementsService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * «Berildi» (ADR-0076): the money leaves the chosen drawer of the student's
   * branch. The balance already went to 0 at the request; this writes only the
   * cash movement (linked to the request's REFUND row, so `reverse` unwinds
   * it), closes the request and makes the receipt available.
   */
  async handOver(
    id: string,
    cashAccountId: string,
    userId: number,
    companyId: number,
  ) {
    const refund = await this.loadForWrite(id, userId, companyId);
    const account = await this.prisma.cashAccount.findFirst({
      where: {
        id: cashAccountId,
        companyId,
        branchId: refund.branchId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, type: true },
    });
    if (!account) {
      throw new BadRequestException("Kassa o'quvchining filialida topilmadi");
    }
    const refundMethod =
      account.type === CashAccountType.CASH
        ? PaymentMethod.CASH
        : PaymentMethod.TRANSFER;

    const saved = await this.prisma
      .$transaction(async (tx) => {
        const row = await this.openRequest(
          tx,
          id,
          companyId,
          RefundStatus.COMPLETED,
        );
        const ledger = await tx.transaction.findFirst({
          where: {
            refundId: id,
            type: 'REFUND',
            reversedAt: null,
            reversedTransactionId: null,
          },
          select: { id: true },
        });
        if (!ledger) {
          throw new BadRequestException(
            'Refund ledger yozuvi topilmadi yoki avvalroq bekor qilingan',
          );
        }
        const amount = row.approvedAmount ?? row.requestedAmount;
        await this.cashMovements.recordOutflow(
          {
            companyId,
            branchId: refund.branchId,
            amount,
            cashAccountId: account.id,
            transactionId: ledger.id,
            description: 'Pul qaytarildi',
            performedById: userId,
          },
          tx,
        );
        const now = new Date();
        const updated = await tx.refund.update({
          where: { id },
          data: {
            status: RefundStatus.COMPLETED,
            handedOverAt: now,
            handedOverById: userId,
            cashAccountId: account.id,
            refundMethod,
            // Old readers (receipt, legacy lists) keep reading these.
            processedAt: now,
            processedById: userId,
          },
        });
        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: refund.studentId,
          oldValues: {},
          newValues: {
            status: 'PUL_QAYTARIB_BERILDI',
            summa: amount,
            kassa: account.name,
            usul: refundMethod === PaymentMethod.CASH ? 'Naqd' : 'Karta',
          },
          changedById: userId,
          companyId,
          tx,
        });
        return updated;
      }, TX)
      .catch(rethrowAsConflict);
    return refundView(saved);
  }

  /**
   * «Bekor qilish» (ADR-0076): a request not yet handed over is undone — the
   * REFUND row and the release adjustment are reversed (balance and lessons
   * back) and the request becomes REJECTED. The pair counts in neither month
   * (ADR-0058).
   */
  async cancel(id: string, reason: string, userId: number, companyId: number) {
    const refund = await this.loadForWrite(id, userId, companyId);
    const saved = await this.prisma
      .$transaction(async (tx) => {
        const row = await this.openRequest(
          tx,
          id,
          companyId,
          RefundStatus.REJECTED,
        );
        const lessons = await this.unwindLedger(
          tx,
          { id, studentId: refund.studentId, enrollmentId: row.enrollmentId },
          { performedById: userId, reason },
        );
        const updated = await tx.refund.update({
          where: { id },
          data: {
            status: RefundStatus.REJECTED,
            cancelledAt: new Date(),
            cancelledById: userId,
            cancelReason: reason,
          },
        });
        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: refund.studentId,
          oldValues: {},
          newValues: {
            status: 'PUL_QAYTARISH_BEKOR_QILINDI',
            summa: row.approvedAmount ?? row.requestedAmount,
            qaytgan_darslar: lessons,
            sabab: reason,
          },
          changedById: userId,
          companyId,
          tx,
        });
        return updated;
      }, TX)
      .catch(rethrowAsConflict);
    return refundView(saved);
  }

  /**
   * Reverse a COMPLETED refund (CEO). Ledger-first: the Refund row stays, the
   * REFUND row (and its hand-over cash movement) and the release adjustment
   * are reversed, the lessons go back. A request is cancelled, not reversed.
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

    const approvedAmount = refund.approvedAmount ?? 0;
    return this.prisma.$transaction(
      async (tx) => {
        await this.unwindLedger(tx, refund, {
          performedById: params.performedById,
          reason: params.reason ?? 'Refund bekor qilindi',
        });
        // Legacy refunds tied to a Contract: undo the paidAmount decrement.
        // The contract stays REFUNDED — operators reopen it explicitly.
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

  /** The refund, company-confined, and the caller's right to move its student's money. */
  private async loadForWrite(id: string, userId: number, companyId: number) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId },
      select: { id: true, studentId: true },
    });
    if (!refund) throw new NotFoundException("So'rov topilmadi");
    const branchId = await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      refund.studentId,
      companyId,
    );
    return { ...refund, branchId };
  }

  /** Re-reads the row in the transaction: only a request may move on. */
  private async openRequest(
    tx: Prisma.TransactionClient,
    id: string,
    companyId: number,
    to: RefundStatus,
  ) {
    const row = await tx.refund.findFirst({
      where: { id, companyId },
      select: {
        status: true,
        requestedAmount: true,
        approvedAmount: true,
        enrollmentId: true,
      },
    });
    if (!row || !REFUND_TRANSITIONS[row.status].includes(to)) {
      throw new ConflictException(REFUND_CLOSED_MESSAGE);
    }
    return row;
  }

  /**
   * Walks a refund's ledger back: the REFUND row (with any cash movement linked
   * to it — `reverseTransaction` unwinds those) and the release ADJUSTMENT,
   * found by the `refundId` tag `releasePrepaidLessons` wrote, with its lessons.
   * Shared by `reverse` and `cancel`. Returns the lessons given back.
   */
  private async unwindLedger(
    tx: Prisma.TransactionClient,
    refund: { id: string; studentId: number; enrollmentId: string | null },
    params: { performedById: number; reason: string },
  ): Promise<number> {
    const ledgerEntry = await tx.transaction.findFirst({
      where: {
        refundId: refund.id,
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
    const releaseEntry = await tx.transaction.findFirst({
      where: {
        studentId: refund.studentId,
        type: 'ADJUSTMENT',
        reversedTransactionId: null,
        reversedAt: null,
        metadata: { path: ['refundId'], equals: refund.id },
      },
      select: { id: true, metadata: true },
    });

    await this.transactionsService.reverseTransaction(
      ledgerEntry.id,
      params,
      tx,
    );
    if (!releaseEntry) return 0;

    await this.transactionsService.reverseTransaction(
      releaseEntry.id,
      params,
      tx,
    );
    const meta = releaseEntry.metadata as { lessonsReleased?: number } | null;
    const lessons = Number(meta?.lessonsReleased ?? 0);
    if (lessons > 0 && refund.enrollmentId) {
      await tx.enrollment.update({
        where: { id: refund.enrollmentId },
        data: { prepaidLessonsRemaining: { increment: lessons } },
      });
    }
    return lessons;
  }
}
