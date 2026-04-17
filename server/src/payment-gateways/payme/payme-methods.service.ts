import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, PaymentSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
import {
  CANNOT_CANCEL,
  CANNOT_PERFORM,
  INVALID_AMOUNT,
  STUDENT_NOT_FOUND,
  TRANSACTION_NOT_FOUND,
  paymeError,
  paymeSuccess,
} from './payme-errors';
import type {
  CancelTransactionParams,
  CheckPerformParams,
  CheckTransactionParams,
  CreateTransactionParams,
  GetStatementParams,
  PaymeRpcResponse,
  PerformTransactionParams,
  StatementTransaction,
} from './payme.types';

/** Payme auto-cancels after 12 hours */
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** Minimum payment amount: 1000 so'm = 100_000 tiyin */
const MIN_AMOUNT_TIYIN = 100_000;

/**
 * Implements the 6 required Paycom Merchant API methods.
 *
 * Each method receives raw params, validates, executes business logic,
 * and returns a JSON-RPC response object (never throws).
 */
@Injectable()
export class PaymeMethodsService {
  private readonly logger = new Logger(PaymeMethodsService.name);

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  // ─── CheckPerformTransaction ──────────────────────────────────

  async checkPerformTransaction(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as CheckPerformParams;

    // Validate amount (minimum 1000 so'm = 100_000 tiyin)
    if (!p.amount || p.amount < MIN_AMOUNT_TIYIN) {
      return paymeError(rpcId, INVALID_AMOUNT);
    }

    // Validate student
    const studentId = p.account?.student_id;
    if (!studentId) {
      return paymeError(rpcId, STUDENT_NOT_FOUND, undefined, 'student_id');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, companyId },
      select: { id: true },
    });

    if (!student) {
      return paymeError(rpcId, STUDENT_NOT_FOUND, undefined, 'student_id');
    }

    // Verify amount matches a live payment intent (if any exists)
    const intent = await this.prisma.paymentIntent.findFirst({
      where: {
        studentId,
        companyId,
        provider: 'PAYME',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (intent && intent.amountTiyin !== p.amount) {
      return paymeError(rpcId, INVALID_AMOUNT);
    }

    return paymeSuccess(rpcId, { allow: true });
  }

  // ─── CreateTransaction ────────────────────────────────────────

  async createTransaction(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as CreateTransactionParams;

    // Check for existing transaction with this paymeId
    const existing = await this.prisma.paymeTransaction.findUnique({
      where: { unique_payme_transaction: { paymeId: p.id, companyId } },
    });

    if (existing) {
      // Idempotent: same account + amount → return existing
      if (
        existing.studentId === p.account?.student_id &&
        existing.amount === p.amount
      ) {
        // Check if expired
        if (existing.state === 1 && this.isExpired(existing.createTime)) {
          await this.cancelExpired(existing.id);
          return paymeError(rpcId, CANNOT_PERFORM);
        }
        return paymeSuccess(rpcId, {
          create_time: Number(existing.createTime),
          transaction: existing.id,
          state: existing.state,
        });
      }
      // Same paymeId but different account/amount → conflict
      return paymeError(rpcId, CANNOT_PERFORM);
    }

    // Validate via CheckPerformTransaction logic
    const checkResult = await this.checkPerformTransaction(
      params,
      companyId,
      rpcId,
    );
    if ('error' in checkResult) return checkResult;

    const studentId = p.account.student_id;
    const now = BigInt(Date.now());

    // Cancel any existing pending transaction for this student
    await this.prisma.paymeTransaction.updateMany({
      where: { studentId, companyId, state: 1 },
      data: { state: -1, cancelTime: now, reason: 4 },
    });

    // Create new PaymeTransaction
    const txn = await this.prisma.paymeTransaction.create({
      data: {
        paymeId: p.id,
        paymeTime: BigInt(p.time),
        amount: p.amount,
        amountInSom: Math.floor(p.amount / 100),
        state: 1,
        studentId,
        createTime: now,
        companyId,
      },
    });

    return paymeSuccess(rpcId, {
      create_time: Number(txn.createTime),
      transaction: txn.id,
      state: txn.state,
    });
  }

  // ─── PerformTransaction ───────────────────────────────────────

  async performTransaction(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as PerformTransactionParams;

    const txn = await this.prisma.paymeTransaction.findUnique({
      where: { unique_payme_transaction: { paymeId: p.id, companyId } },
    });

    if (!txn) {
      return paymeError(rpcId, TRANSACTION_NOT_FOUND);
    }

    // Already performed → idempotent
    if (txn.state === 2) {
      return paymeSuccess(rpcId, {
        transaction: txn.id,
        perform_time: Number(txn.performTime),
        state: 2,
      });
    }

    // Not in created state → error
    if (txn.state !== 1) {
      return paymeError(rpcId, CANNOT_PERFORM);
    }

    // Check timeout
    if (this.isExpired(txn.createTime)) {
      await this.cancelExpired(txn.id);
      return paymeError(rpcId, CANNOT_PERFORM);
    }

    // Perform: create ERP Payment + update PaymeTransaction atomically
    const now = BigInt(Date.now());

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const erpPayment = await this.payments.createFromExternal(
            {
              studentId: txn.studentId,
              amount: txn.amountInSom,
              method: PaymentMethod.PAYME,
              externalId: txn.paymeId,
              source: PaymentSource.GATEWAY_WEBHOOK,
              companyId,
            },
            tx,
          );

          await tx.paymeTransaction.update({
            where: { id: txn.id },
            data: {
              state: 2,
              performTime: now,
              paymentId: erpPayment.id,
            },
          });

          return erpPayment;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        },
      );

      return paymeSuccess(rpcId, {
        transaction: txn.id,
        perform_time: Number(now),
        state: 2,
      });
    } catch (err) {
      this.logger.error(`PerformTransaction failed for ${txn.paymeId}: ${err}`);
      throw err;
    }
  }

  // ─── CancelTransaction ────────────────────────────────────────

  async cancelTransaction(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as CancelTransactionParams;

    const txn = await this.prisma.paymeTransaction.findUnique({
      where: { unique_payme_transaction: { paymeId: p.id, companyId } },
    });

    if (!txn) {
      return paymeError(rpcId, TRANSACTION_NOT_FOUND);
    }

    // Already cancelled → idempotent
    if (txn.state === -1 || txn.state === -2) {
      return paymeSuccess(rpcId, {
        transaction: txn.id,
        cancel_time: Number(txn.cancelTime),
        state: txn.state,
      });
    }

    const now = BigInt(Date.now());

    // Pending (state=1) → cancel without financial impact
    if (txn.state === 1) {
      await this.prisma.paymeTransaction.update({
        where: { id: txn.id },
        data: { state: -1, cancelTime: now, reason: p.reason },
      });

      return paymeSuccess(rpcId, {
        transaction: txn.id,
        cancel_time: Number(now),
        state: -1,
      });
    }

    // Performed (state=2) → cannot cancel via API (use admin panel)
    if (txn.state === 2) {
      return paymeError(rpcId, CANNOT_CANCEL);
    }

    return paymeError(rpcId, CANNOT_PERFORM);
  }

  // ─── CheckTransaction ─────────────────────────────────────────

  async checkTransaction(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as CheckTransactionParams;

    const txn = await this.prisma.paymeTransaction.findUnique({
      where: { unique_payme_transaction: { paymeId: p.id, companyId } },
    });

    if (!txn) {
      return paymeError(rpcId, TRANSACTION_NOT_FOUND);
    }

    return paymeSuccess(rpcId, {
      create_time: Number(txn.createTime),
      perform_time: Number(txn.performTime ?? 0),
      cancel_time: Number(txn.cancelTime ?? 0),
      transaction: txn.id,
      state: txn.state,
      reason: txn.reason,
    });
  }

  // ─── GetStatement ─────────────────────────────────────────────

  async getStatement(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as GetStatementParams;

    const txns = await this.prisma.paymeTransaction.findMany({
      where: {
        companyId,
        createTime: {
          gte: BigInt(p.from),
          lte: BigInt(p.to),
        },
      },
      orderBy: { createTime: 'asc' },
    });

    const transactions: StatementTransaction[] = txns.map((txn) => ({
      id: txn.paymeId,
      time: Number(txn.paymeTime),
      amount: txn.amount,
      account: { student_id: txn.studentId },
      create_time: Number(txn.createTime),
      perform_time: Number(txn.performTime ?? 0),
      cancel_time: Number(txn.cancelTime ?? 0),
      transaction: txn.id,
      state: txn.state,
      reason: txn.reason,
    }));

    return paymeSuccess(rpcId, { transactions });
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private isExpired(createTime: bigint): boolean {
    return Date.now() - Number(createTime) > TWELVE_HOURS_MS;
  }

  private async cancelExpired(id: string): Promise<void> {
    await this.prisma.paymeTransaction.update({
      where: { id },
      data: { state: -1, cancelTime: BigInt(Date.now()), reason: 4 },
    });
  }
}
