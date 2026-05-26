import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod, PaymentSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
import {
  GATEWAY_STATE,
  MockExamGatewayBillingService,
} from '../../mock-exams/mock-exam-gateway-billing.service';
import {
  ACCOUNT_BUSY,
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
    private mockGateway: MockExamGatewayBillingService,
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

    // Validate student (Payme sends student_id as string)
    const rawStudentId = p.account?.student_id;
    const studentId = Number(rawStudentId);
    if (!rawStudentId || isNaN(studentId)) {
      return paymeError(rpcId, STUDENT_NOT_FOUND, undefined, 'student_id');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null, companyId },
      select: { id: true },
    });

    // Fallback to mock participant when no Student matches — non-DaF
    // mock-only registrants pay via their publicId, which lives in the
    // shared sequence but doesn't have a Student row.
    if (!student) {
      const mockTarget = await this.mockGateway.resolveTarget(studentId);
      if (!mockTarget) {
        return paymeError(rpcId, STUDENT_NOT_FOUND, undefined, 'student_id');
      }
      if (mockTarget.alreadyPaid) {
        return paymeError(rpcId, CANNOT_PERFORM);
      }
      // Mock fees must match the exam price exactly (in tiyin).
      const expectedTiyin = mockTarget.examPrice * 100;
      if (p.amount !== expectedTiyin) {
        return paymeError(rpcId, INVALID_AMOUNT);
      }
      return paymeSuccess(rpcId, { allow: true });
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

    // 1. Idempotency — check BOTH student and mock tables. Payme can
    //    resend CreateTransaction with the same paymeId.
    const existing = await this.prisma.paymeTransaction.findUnique({
      where: { unique_payme_transaction: { paymeId: p.id, companyId } },
    });

    if (existing) {
      if (
        existing.studentId === Number(p.account?.student_id) &&
        existing.amount === p.amount
      ) {
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
      return paymeError(rpcId, CANNOT_PERFORM);
    }

    const existingMock = await this.mockGateway.findByExternalId(
      'PAYME',
      p.id,
      companyId,
    );
    if (existingMock) {
      // Idempotent for mock — return whatever state it's in.
      if (
        existingMock.state === GATEWAY_STATE.PREPARED &&
        existingMock.paymeTime &&
        Date.now() - Number(existingMock.paymeTime) > TWELVE_HOURS_MS
      ) {
        await this.mockGateway.markErrored(
          existingMock.id,
          -1,
          'Transaction expired',
        );
        return paymeError(rpcId, CANNOT_PERFORM);
      }
      return paymeSuccess(rpcId, {
        create_time: Number(existingMock.paymeTime ?? existingMock.createdAt.getTime()),
        transaction: existingMock.id,
        state: existingMock.state,
      });
    }

    // 2. Fresh transaction — validate via CheckPerformTransaction logic.
    const checkResult = await this.checkPerformTransaction(
      params,
      companyId,
      rpcId,
    );
    if ('error' in checkResult) return checkResult;

    const accountId = Number(p.account.student_id);
    const now = BigInt(Date.now());

    // 3. Dispatch: is this account a real Student or a mock participant?
    const student = await this.prisma.student.findFirst({
      where: { id: accountId, deletedAt: null, companyId },
      select: { id: true },
    });

    if (student) {
      // ── Student path (existing) ──
      const pendingTxn = await this.prisma.paymeTransaction.findFirst({
        where: { studentId: accountId, companyId, state: 1 },
      });

      if (pendingTxn) {
        if (this.isExpired(pendingTxn.createTime)) {
          await this.cancelExpired(pendingTxn.id);
        } else {
          return paymeError(rpcId, ACCOUNT_BUSY);
        }
      }

      const txn = await this.prisma.paymeTransaction.create({
        data: {
          paymeId: p.id,
          paymeTime: BigInt(p.time),
          amount: p.amount,
          amountInSom: Math.floor(p.amount / 100),
          state: 1,
          studentId: accountId,
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

    // ── Mock participant path ──
    const target = await this.mockGateway.resolveTarget(accountId);
    if (!target) {
      // Shouldn't happen — checkPerform already validated existence.
      return paymeError(rpcId, STUDENT_NOT_FOUND, undefined, 'student_id');
    }

    const mockTxn = await this.mockGateway.findOrCreatePending({
      provider: 'PAYME',
      externalId: p.id,
      mockParticipantId: target.participantId,
      amount: p.amount,
      amountInSom: Math.floor(p.amount / 100),
      paymeTime: BigInt(p.time),
      companyId,
    });

    return paymeSuccess(rpcId, {
      create_time: Number(now),
      transaction: mockTxn.id,
      state: mockTxn.state,
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
      // Try mock fallback before giving up.
      const mockTxn = await this.mockGateway.findByExternalId(
        'PAYME',
        p.id,
        companyId,
      );
      if (mockTxn) {
        return this.performMockTransaction(mockTxn, rpcId);
      }
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
      await this.prisma.$transaction(
        async (tx) => {
          const branchId = await this.payments.resolveStudentBranchId(
            txn.studentId,
            companyId,
            tx,
          );

          const erpPayment = await this.payments.createFromExternal(
            {
              studentId: txn.studentId,
              amount: txn.amountInSom,
              method: PaymentMethod.PAYME,
              externalId: txn.paymeId,
              source: PaymentSource.GATEWAY_WEBHOOK,
              companyId,
              ...(branchId !== null && { branchId }),
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
      const mockTxn = await this.mockGateway.findByExternalId(
        'PAYME',
        p.id,
        companyId,
      );
      if (mockTxn) {
        return this.cancelMockTransaction(mockTxn, p.reason, rpcId);
      }
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

    // Performed (state=2) → cancel with reversal (state=-2)
    if (txn.state === 2) {
      await this.prisma.paymeTransaction.update({
        where: { id: txn.id },
        data: { state: -2, cancelTime: now, reason: p.reason },
      });

      // Reverse the ERP payment if it was linked
      if (txn.paymentId) {
        try {
          await this.payments.reverse(txn.paymentId, {
            reason: 'Payme CancelTransaction',
            performedById: 0,
            companyId,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to reverse ERP payment ${txn.paymentId} for Payme cancel: ${err}`,
          );
        }
      }

      return paymeSuccess(rpcId, {
        transaction: txn.id,
        cancel_time: Number(now),
        state: -2,
      });
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
      const mockTxn = await this.mockGateway.findByExternalId(
        'PAYME',
        p.id,
        companyId,
      );
      if (mockTxn) {
        return paymeSuccess(rpcId, {
          create_time: mockTxn.paymeTime
            ? Number(mockTxn.paymeTime)
            : mockTxn.createdAt.getTime(),
          perform_time: mockTxn.completedAt
            ? mockTxn.completedAt.getTime()
            : 0,
          cancel_time: mockTxn.cancelledAt
            ? mockTxn.cancelledAt.getTime()
            : 0,
          transaction: mockTxn.id,
          state: mockTxn.state,
          reason: mockTxn.reason ?? null,
        });
      }
      return paymeError(rpcId, TRANSACTION_NOT_FOUND);
    }

    return paymeSuccess(rpcId, {
      create_time: Number(txn.createTime),
      perform_time: txn.performTime ? Number(txn.performTime) : 0,
      cancel_time: txn.cancelTime ? Number(txn.cancelTime) : 0,
      transaction: txn.id,
      state: txn.state,
      reason: txn.reason ?? null,
    });
  }

  // ─── GetStatement ─────────────────────────────────────────────

  async getStatement(
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    const p = params as unknown as GetStatementParams;

    const [txns, mockTxns] = await Promise.all([
      this.prisma.paymeTransaction.findMany({
        where: {
          companyId,
          createTime: { gte: BigInt(p.from), lte: BigInt(p.to) },
        },
        orderBy: { createTime: 'asc' },
      }),
      this.mockGateway.listInTimeRange('PAYME', companyId, p.from, p.to),
    ]);

    const studentTransactions: StatementTransaction[] = txns.map((txn) => ({
      id: txn.paymeId,
      time: Number(txn.paymeTime),
      amount: txn.amount,
      account: { student_id: txn.studentId },
      create_time: Number(txn.createTime),
      perform_time: txn.performTime ? Number(txn.performTime) : 0,
      cancel_time: txn.cancelTime ? Number(txn.cancelTime) : 0,
      transaction: txn.id,
      state: txn.state,
      reason: txn.reason ?? null,
    }));

    const mockTransactions: StatementTransaction[] = mockTxns.map((mtxn) => ({
      id: mtxn.externalId,
      time: mtxn.paymeTime
        ? Number(mtxn.paymeTime)
        : mtxn.createdAt.getTime(),
      amount: mtxn.amount,
      // Mock participants use publicId in the same account field — Payme
      // doesn't distinguish; the publicId / Student.id space is shared.
      account: { student_id: mtxn.mockParticipant.publicId },
      create_time: mtxn.createdAt.getTime(),
      perform_time: mtxn.completedAt ? mtxn.completedAt.getTime() : 0,
      cancel_time: mtxn.cancelledAt ? mtxn.cancelledAt.getTime() : 0,
      transaction: mtxn.id,
      state: mtxn.state,
      reason: mtxn.reason ?? null,
    }));

    const transactions = [...studentTransactions, ...mockTransactions].sort(
      (a, b) => a.create_time - b.create_time,
    );

    return paymeSuccess(rpcId, { transactions });
  }

  // ─── Mock-only fallback paths ──────────────────────────────────

  private async performMockTransaction(
    mockTxn: {
      id: string;
      state: number;
      paymeTime: bigint | null;
      createdAt: Date;
      completedAt: Date | null;
    },
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    // Idempotent
    if (mockTxn.state === GATEWAY_STATE.COMPLETED) {
      return paymeSuccess(rpcId, {
        transaction: mockTxn.id,
        perform_time: mockTxn.completedAt
          ? mockTxn.completedAt.getTime()
          : 0,
        state: GATEWAY_STATE.COMPLETED,
      });
    }
    if (mockTxn.state !== GATEWAY_STATE.PREPARED) {
      return paymeError(rpcId, CANNOT_PERFORM);
    }
    if (
      mockTxn.paymeTime &&
      Date.now() - Number(mockTxn.paymeTime) > TWELVE_HOURS_MS
    ) {
      await this.mockGateway.markErrored(
        mockTxn.id,
        -1,
        'Transaction expired',
      );
      return paymeError(rpcId, CANNOT_PERFORM);
    }

    const now = Date.now();
    await this.mockGateway.markCompleted(mockTxn.id);

    return paymeSuccess(rpcId, {
      transaction: mockTxn.id,
      perform_time: now,
      state: GATEWAY_STATE.COMPLETED,
    });
  }

  private async cancelMockTransaction(
    mockTxn: {
      id: string;
      state: number;
      cancelledAt: Date | null;
    },
    reason: number | undefined,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    // Idempotent — already cancelled or refunded.
    if (
      mockTxn.state === GATEWAY_STATE.CANCELLED ||
      mockTxn.state === GATEWAY_STATE.REFUNDED
    ) {
      return paymeSuccess(rpcId, {
        transaction: mockTxn.id,
        cancel_time: mockTxn.cancelledAt
          ? mockTxn.cancelledAt.getTime()
          : 0,
        state: mockTxn.state,
      });
    }

    const now = Date.now();
    if (mockTxn.state === GATEWAY_STATE.PREPARED) {
      await this.mockGateway.markCancelled(mockTxn.id, {
        wasPerformed: false,
        reason,
      });
      return paymeSuccess(rpcId, {
        transaction: mockTxn.id,
        cancel_time: now,
        state: GATEWAY_STATE.CANCELLED,
      });
    }
    if (mockTxn.state === GATEWAY_STATE.COMPLETED) {
      await this.mockGateway.markCancelled(mockTxn.id, {
        wasPerformed: true,
        reason,
      });
      return paymeSuccess(rpcId, {
        transaction: mockTxn.id,
        cancel_time: now,
        state: GATEWAY_STATE.REFUNDED,
      });
    }
    return paymeError(rpcId, CANNOT_PERFORM);
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
