import { Test, TestingModule } from '@nestjs/testing';
import { PaymeMethodsService } from './payme-methods.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
import { MockExamGatewayBillingService } from '../../mock-exams/mock-exam-gateway-billing.service';
import {
  ACCOUNT_BUSY,
  CANNOT_CANCEL,
  CANNOT_PERFORM,
  INVALID_AMOUNT,
  STUDENT_NOT_FOUND,
  TRANSACTION_NOT_FOUND,
} from './payme-errors';

describe('PaymeMethodsService', () => {
  let service: PaymeMethodsService;
  let prisma: any;
  let payments: any;

  const COMPANY_ID = 1;
  const STUDENT_ID = 10042;
  const PAYME_ID = '5ef74e7a17cebc3c0eace0d8';

  const mockTxn = (overrides = {}) => ({
    id: 'txn-uuid',
    paymeId: PAYME_ID,
    paymeTime: BigInt(1714000000000),
    amount: 50000000,
    amountInSom: 500000,
    state: 1,
    reason: null,
    studentId: STUDENT_ID,
    createTime: BigInt(Date.now()),
    performTime: null,
    cancelTime: null,
    paymentId: null,
    companyId: COMPANY_ID,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
      },
      paymentIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      paymeTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'txn-uuid',
          ...data,
          createTime: data.createTime ?? BigInt(Date.now()),
        })),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((fn) => {
        // Create a tx proxy that delegates to prisma mock models
        const tx = {
          paymeTransaction: prisma.paymeTransaction,
          student: prisma.student,
          payment: { create: jest.fn() },
          contract: { update: jest.fn() },
        };
        return fn(tx);
      }),
    };

    payments = {
      createFromExternal: jest.fn().mockResolvedValue({
        id: 'payment-uuid',
        studentBalance: 500000,
      }),
      resolveStudentBranchId: jest.fn().mockResolvedValue(5),
      reverse: jest.fn().mockResolvedValue(undefined),
    };

    // Mock fallback billing — default stubs return null so Student path
    // is exercised; tests that hit the mock path can override per-test.
    const mockGateway = {
      resolveTarget: jest.fn().mockResolvedValue(null),
      findByExternalId: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      findOrCreatePending: jest.fn(),
      markCompleted: jest.fn(),
      markCancelled: jest.fn(),
      markErrored: jest.fn(),
      listInTimeRange: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymeMethodsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsService, useValue: payments },
        { provide: MockExamGatewayBillingService, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(PaymeMethodsService);
  });

  // ─── CheckPerformTransaction ────────────────────────────────

  describe('CheckPerformTransaction', () => {
    const params = { amount: 50000000, account: { student_id: STUDENT_ID } };

    it('should return allow: true for valid student and amount', async () => {
      const result = await service.checkPerformTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { allow: true } });
    });

    it('should return STUDENT_NOT_FOUND when student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      const result = await service.checkPerformTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: STUDENT_NOT_FOUND } });
    });

    it('should return INVALID_AMOUNT for zero amount', async () => {
      const result = await service.checkPerformTransaction(
        { amount: 0, account: { student_id: STUDENT_ID } } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: INVALID_AMOUNT } });
    });

    it('should return INVALID_AMOUNT for negative amount', async () => {
      const result = await service.checkPerformTransaction(
        { amount: -100, account: { student_id: STUDENT_ID } } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: INVALID_AMOUNT } });
    });

    it('should return INVALID_AMOUNT for amount below minimum (1000 som = 100_000 tiyin)', async () => {
      const result = await service.checkPerformTransaction(
        { amount: 99999, account: { student_id: STUDENT_ID } } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: INVALID_AMOUNT } });
    });

    it('should return STUDENT_NOT_FOUND when student_id is missing', async () => {
      const result = await service.checkPerformTransaction(
        { amount: 500000000, account: {} } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: STUDENT_NOT_FOUND } });
    });

    it('should return INVALID_AMOUNT when intent exists but amount mismatches', async () => {
      prisma.paymentIntent.findFirst.mockResolvedValue({
        amountTiyin: 50000000,
      });
      const result = await service.checkPerformTransaction(
        { amount: 30000000, account: { student_id: STUDENT_ID } } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: INVALID_AMOUNT } });
    });

    it('should allow when intent amount matches', async () => {
      prisma.paymentIntent.findFirst.mockResolvedValue({
        amountTiyin: 50000000,
      });
      const result = await service.checkPerformTransaction(
        { amount: 50000000, account: { student_id: STUDENT_ID } } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { allow: true } });
    });

    it('should allow when no intent exists (backward compatibility)', async () => {
      prisma.paymentIntent.findFirst.mockResolvedValue(null);
      const result = await service.checkPerformTransaction(
        { amount: 50000000, account: { student_id: STUDENT_ID } } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { allow: true } });
    });
  });

  // ─── CreateTransaction ──────────────────────────────────────

  describe('CreateTransaction', () => {
    const params = {
      id: PAYME_ID,
      time: 1714000000000,
      amount: 50000000,
      account: { student_id: STUDENT_ID },
    };

    it('should create a new transaction with state 1', async () => {
      const result = await service.createTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({
        result: { transaction: 'txn-uuid', state: 1 },
      });
      expect(prisma.paymeTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymeId: PAYME_ID,
            amount: 50000000,
            amountInSom: 500000,
            state: 1,
            studentId: STUDENT_ID,
            companyId: COMPANY_ID,
          }),
        }),
      );
    });

    it('should return existing transaction for idempotent call (same account + amount)', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(mockTxn());
      const result = await service.createTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({
        result: { transaction: 'txn-uuid', state: 1 },
      });
      expect(prisma.paymeTransaction.create).not.toHaveBeenCalled();
    });

    it('should return CANNOT_PERFORM for same paymeId with different account', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(
        mockTxn({ studentId: 99999 }),
      );
      const result = await service.createTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: CANNOT_PERFORM } });
    });

    it('should return CANNOT_PERFORM for same paymeId with different amount', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(
        mockTxn({ amount: 99999 }),
      );
      const result = await service.createTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: CANNOT_PERFORM } });
    });

    it('should return ACCOUNT_BUSY when a non-expired pending transaction exists for same student', async () => {
      const pending = mockTxn({
        paymeId: 'different-payme-id',
        createTime: BigInt(Date.now()),
      });
      prisma.paymeTransaction.findFirst.mockResolvedValue(pending);
      const result = await service.createTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: ACCOUNT_BUSY } });
      expect(prisma.paymeTransaction.create).not.toHaveBeenCalled();
    });

    it('should auto-cancel expired existing transaction', async () => {
      const expired = mockTxn({
        createTime: BigInt(Date.now() - 13 * 60 * 60 * 1000),
      });
      prisma.paymeTransaction.findUnique.mockResolvedValue(expired);
      const result = await service.createTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: CANNOT_PERFORM } });
      expect(prisma.paymeTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: expired.id },
          data: expect.objectContaining({ state: -1, reason: 4 }),
        }),
      );
    });
  });

  // ─── PerformTransaction ─────────────────────────────────────

  describe('PerformTransaction', () => {
    const params = { id: PAYME_ID };

    it('should perform transaction and create ERP payment', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(mockTxn());
      const result = await service.performTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({
        result: { transaction: 'txn-uuid', state: 2 },
      });
      expect(payments.resolveStudentBranchId).toHaveBeenCalledWith(
        STUDENT_ID,
        COMPANY_ID,
        expect.anything(),
      );
      expect(payments.createFromExternal).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: STUDENT_ID,
          amount: 500000,
          method: 'PAYME',
          source: 'GATEWAY_WEBHOOK',
          externalId: PAYME_ID,
          companyId: COMPANY_ID,
          branchId: 5,
        }),
        expect.anything(), // tx client from $transaction
      );
    });

    it('should omit branchId when student has no active enrollment or StudentBranch', async () => {
      payments.resolveStudentBranchId.mockResolvedValueOnce(null);
      prisma.paymeTransaction.findUnique.mockResolvedValue(mockTxn());
      await service.performTransaction(params as any, COMPANY_ID, 1);
      const [call] = payments.createFromExternal.mock.calls[0];
      expect(call).not.toHaveProperty('branchId');
    });

    it('should return idempotent result for already performed transaction', async () => {
      const performed = mockTxn({
        state: 2,
        performTime: BigInt(Date.now()),
      });
      prisma.paymeTransaction.findUnique.mockResolvedValue(performed);
      const result = await service.performTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { state: 2 } });
      expect(payments.createFromExternal).not.toHaveBeenCalled();
    });

    it('should return TRANSACTION_NOT_FOUND when transaction does not exist', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(null);
      const result = await service.performTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: TRANSACTION_NOT_FOUND } });
    });

    it('should return CANNOT_PERFORM for cancelled transaction', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(
        mockTxn({ state: -1 }),
      );
      const result = await service.performTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: CANNOT_PERFORM } });
    });

    it('should auto-cancel and return CANNOT_PERFORM for expired transaction', async () => {
      const expired = mockTxn({
        createTime: BigInt(Date.now() - 13 * 60 * 60 * 1000),
      });
      prisma.paymeTransaction.findUnique.mockResolvedValue(expired);
      const result = await service.performTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: CANNOT_PERFORM } });
      expect(prisma.paymeTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: -1, reason: 4 }),
        }),
      );
    });

    it('should update PaymeTransaction state to 2 with paymentId', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(mockTxn());
      await service.performTransaction(params as any, COMPANY_ID, 1);
      expect(prisma.paymeTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-uuid' },
          data: expect.objectContaining({
            state: 2,
            paymentId: 'payment-uuid',
          }),
        }),
      );
    });
  });

  // ─── CancelTransaction ─────────────────────────────────────

  describe('CancelTransaction', () => {
    const params = { id: PAYME_ID, reason: 3 };

    it('should cancel pending transaction (state 1 → -1)', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(mockTxn());
      const result = await service.cancelTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { state: -1 } });
      expect(prisma.paymeTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: -1, reason: 3 }),
        }),
      );
    });

    it('should refund performed transaction (state 2 → -2) and reverse linked payment', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(
        mockTxn({ state: 2, paymentId: 'payment-uuid' }),
      );
      const result = await service.cancelTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { state: -2 } });
      expect(prisma.paymeTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: -2, reason: 3 }),
        }),
      );
      expect(payments.reverse).toHaveBeenCalledWith(
        'payment-uuid',
        expect.objectContaining({ companyId: COMPANY_ID }),
      );
      // F-40: gateway reversal is a system action — never the fake user id 0.
      expect(payments.reverse.mock.calls[0][1].performedById).toBeUndefined();
    });

    // F-19: if the ERP reversal is blocked (e.g. funds already spent on
    // lessons), we must NOT report the transaction as refunded.
    it('returns CANNOT_CANCEL and does NOT mark -2 when the ERP reversal fails', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(
        mockTxn({ state: 2, paymentId: 'payment-uuid' }),
      );
      payments.reverse.mockRejectedValueOnce(
        new Error("To'lov allaqachon darslarga sarflangan"),
      );

      const result = await service.cancelTransaction(
        params as any,
        COMPANY_ID,
        1,
      );

      expect(result).toMatchObject({ error: { code: CANNOT_CANCEL } });
      // The Payme transaction must stay performed — never flipped to refunded.
      expect(prisma.paymeTransaction.update).not.toHaveBeenCalled();
    });

    it('should return idempotent result for already cancelled transaction', async () => {
      const cancelled = mockTxn({
        state: -1,
        cancelTime: BigInt(Date.now()),
      });
      prisma.paymeTransaction.findUnique.mockResolvedValue(cancelled);
      const result = await service.cancelTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { state: -1 } });
      expect(prisma.paymeTransaction.update).not.toHaveBeenCalled();
    });

    it('should return TRANSACTION_NOT_FOUND when transaction does not exist', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(null);
      const result = await service.cancelTransaction(
        params as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: TRANSACTION_NOT_FOUND } });
    });
  });

  // ─── CheckTransaction ──────────────────────────────────────

  describe('CheckTransaction', () => {
    it('should return full transaction state', async () => {
      const txn = mockTxn({ state: 2, performTime: BigInt(1714000060000) });
      prisma.paymeTransaction.findUnique.mockResolvedValue(txn);
      const result = await service.checkTransaction(
        { id: PAYME_ID } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({
        result: {
          transaction: 'txn-uuid',
          state: 2,
          perform_time: 1714000060000,
          reason: null,
        },
      });
    });

    it('should return TRANSACTION_NOT_FOUND when not found', async () => {
      prisma.paymeTransaction.findUnique.mockResolvedValue(null);
      const result = await service.checkTransaction(
        { id: PAYME_ID } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ error: { code: TRANSACTION_NOT_FOUND } });
    });
  });

  // ─── GetStatement ──────────────────────────────────────────

  describe('GetStatement', () => {
    it('should return transactions in time range', async () => {
      const txn = mockTxn({ state: 2, performTime: BigInt(1714000060000) });
      prisma.paymeTransaction.findMany.mockResolvedValue([txn]);
      const result = await service.getStatement(
        { from: 1713900000000, to: 1714100000000 } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({
        result: {
          transactions: [
            expect.objectContaining({
              id: PAYME_ID,
              transaction: 'txn-uuid',
              state: 2,
              amount: 50000000,
              account: { student_id: STUDENT_ID },
            }),
          ],
        },
      });
    });

    it('should return empty transactions for empty range', async () => {
      prisma.paymeTransaction.findMany.mockResolvedValue([]);
      const result = await service.getStatement(
        { from: 0, to: 1000 } as any,
        COMPANY_ID,
        1,
      );
      expect(result).toMatchObject({ result: { transactions: [] } });
    });

    it('should query with correct time range', async () => {
      await service.getStatement(
        { from: 1713900000000, to: 1714100000000 } as any,
        COMPANY_ID,
        1,
      );
      expect(prisma.paymeTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: COMPANY_ID,
            createTime: {
              gte: BigInt(1713900000000),
              lte: BigInt(1714100000000),
            },
          },
          orderBy: { createTime: 'asc' },
        }),
      );
    });
  });
});
