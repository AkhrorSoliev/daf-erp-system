import { Test, TestingModule } from '@nestjs/testing';
import { ClickMethodsService } from './click-methods.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
import {
  CLICK_ALREADY_PAID,
  CLICK_INVALID_AMOUNT,
  CLICK_TRANSACTION_CANCELLED,
  CLICK_TRANSACTION_NOT_FOUND,
  CLICK_USER_NOT_FOUND,
} from './click-errors';

describe('ClickMethodsService', () => {
  let service: ClickMethodsService;
  let prisma: any;
  let payments: any;

  const COMPANY_ID = 1;
  const STUDENT_ID = 10042;

  const mockClickTxn = (overrides = {}) => ({
    id: 'txn-uuid',
    clickTransId: BigInt(12345),
    clickPaydocId: BigInt(67890),
    amount: 50000.0,
    amountInSom: 50000,
    status: 1,
    error: 0,
    errorNote: null,
    studentId: STUDENT_ID,
    prepareTime: new Date(),
    completeTime: null,
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
      clickTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'txn-uuid',
          ...data,
        })),
        update: jest.fn().mockImplementation(({ data }) => data),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => {
        const tx = {
          clickTransaction: prisma.clickTransaction,
          student: prisma.student,
          payment: { create: jest.fn() },
          contract: { update: jest.fn() },
        };
        return fn(tx);
      }),
    };

    payments = {
      createFromExternal: jest.fn().mockResolvedValue({ id: 'payment-uuid' }),
      resolveStudentBranchId: jest.fn().mockResolvedValue(7),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClickMethodsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();

    service = module.get(ClickMethodsService);
  });

  // ─── Prepare ─────────────────────────────────────────────────

  describe('prepare', () => {
    const prepareBody = (overrides = {}) => ({
      click_trans_id: 12345,
      service_id: 100,
      click_paydoc_id: 67890,
      merchant_trans_id: String(STUDENT_ID),
      amount: 50000,
      action: 0 as const,
      error: 0,
      error_note: '',
      sign_time: '2026-04-16 12:00:00',
      sign_string: 'valid',
      ...overrides,
    });

    it('should create a ClickTransaction and return merchant_prepare_id', async () => {
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(0);
      expect(result.merchant_prepare_id).toBe('txn-uuid');
      expect(prisma.clickTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clickTransId: BigInt(12345),
            studentId: STUDENT_ID,
            status: 1,
            companyId: COMPANY_ID,
          }),
        }),
      );
    });

    it('should return USER_NOT_FOUND for non-existent student', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_USER_NOT_FOUND);
    });

    it('should return USER_NOT_FOUND for invalid studentId', async () => {
      const result = await service.prepare(
        prepareBody({ merchant_trans_id: 'not-a-number' }),
        COMPANY_ID,
      );
      expect(result.error).toBe(CLICK_USER_NOT_FOUND);
    });

    it('should return INVALID_AMOUNT for zero amount', async () => {
      const result = await service.prepare(
        prepareBody({ amount: 0 }),
        COMPANY_ID,
      );
      expect(result.error).toBe(CLICK_INVALID_AMOUNT);
    });

    it('should return INVALID_AMOUNT for negative amount', async () => {
      const result = await service.prepare(
        prepareBody({ amount: -100 }),
        COMPANY_ID,
      );
      expect(result.error).toBe(CLICK_INVALID_AMOUNT);
    });

    it('should return INVALID_AMOUNT for amount below minimum (1000 som)', async () => {
      const result = await service.prepare(
        prepareBody({ amount: 999 }),
        COMPANY_ID,
      );
      expect(result.error).toBe(CLICK_INVALID_AMOUNT);
    });

    it('should return INVALID_AMOUNT when intent exists but amount mismatches', async () => {
      prisma.paymentIntent.findFirst.mockResolvedValue({ amount: 100000 });
      const result = await service.prepare(
        prepareBody({ amount: 50000 }),
        COMPANY_ID,
      );
      expect(result.error).toBe(CLICK_INVALID_AMOUNT);
    });

    it('should allow when intent amount matches', async () => {
      prisma.paymentIntent.findFirst.mockResolvedValue({ amount: 50000 });
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(0);
    });

    it('should return ALREADY_PAID for completed transaction with same clickTransId', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: 2 }),
      );
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_ALREADY_PAID);
    });

    it('should return TRANSACTION_CANCELLED for cancelled transaction', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: -1 }),
      );
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_TRANSACTION_CANCELLED);
    });

    it('should return existing prepared transaction idempotently', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: 1 }),
      );
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(0);
      expect(result.merchant_prepare_id).toBe('txn-uuid');
      expect(prisma.clickTransaction.create).not.toHaveBeenCalled();
    });

    it('should auto-cancel expired prepared transaction and return CANCELLED', async () => {
      const oldPrepareTime = new Date(Date.now() - 31 * 60 * 1000);
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: 1, prepareTime: oldPrepareTime }),
      );
      const result = await service.prepare(prepareBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_TRANSACTION_CANCELLED);
      expect(prisma.clickTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-uuid' },
          data: expect.objectContaining({ status: -1, error: -9 }),
        }),
      );
      expect(prisma.clickTransaction.create).not.toHaveBeenCalled();
    });
  });

  // ─── Complete ────────────────────────────────────────────────

  describe('complete', () => {
    const completeBody = (overrides = {}) => ({
      click_trans_id: 12345,
      service_id: 100,
      click_paydoc_id: 67890,
      merchant_trans_id: String(STUDENT_ID),
      merchant_prepare_id: 'txn-uuid',
      amount: 50000,
      action: 1 as const,
      error: 0,
      error_note: '',
      sign_time: '2026-04-16 12:01:00',
      sign_string: 'valid',
      ...overrides,
    });

    it('should complete payment and return merchant_confirm_id', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(mockClickTxn());
      const result = await service.complete(completeBody(), COMPANY_ID);
      expect(result.error).toBe(0);
      expect(result.merchant_confirm_id).toBe('txn-uuid');
      expect(payments.resolveStudentBranchId).toHaveBeenCalledWith(
        STUDENT_ID,
        COMPANY_ID,
        expect.anything(),
      );
      expect(payments.createFromExternal).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: STUDENT_ID,
          amount: 50000,
          method: 'CLICK',
          source: 'GATEWAY_WEBHOOK',
          companyId: COMPANY_ID,
          branchId: 7,
        }),
        expect.anything(), // tx client from $transaction
      );
    });

    it('should omit branchId when student has no branch', async () => {
      payments.resolveStudentBranchId.mockResolvedValueOnce(null);
      prisma.clickTransaction.findUnique.mockResolvedValue(mockClickTxn());
      await service.complete(completeBody(), COMPANY_ID);
      const [call] = payments.createFromExternal.mock.calls[0];
      expect(call).not.toHaveProperty('branchId');
    });

    it('should return TRANSACTION_NOT_FOUND for non-existent prepare', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(null);
      const result = await service.complete(completeBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_TRANSACTION_NOT_FOUND);
    });

    it('should return TRANSACTION_NOT_FOUND for wrong companyId', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ companyId: 999 }),
      );
      const result = await service.complete(completeBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_TRANSACTION_NOT_FOUND);
    });

    it('should return idempotent success for already completed transaction', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: 2 }),
      );
      const result = await service.complete(completeBody(), COMPANY_ID);
      expect(result.error).toBe(0);
      expect(result.merchant_confirm_id).toBe('txn-uuid');
      expect(payments.createFromExternal).not.toHaveBeenCalled();
    });

    it('should return TRANSACTION_CANCELLED for cancelled transaction', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: -1 }),
      );
      const result = await service.complete(completeBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_TRANSACTION_CANCELLED);
    });

    it('should reject late Complete on stale Prepare and auto-cancel', async () => {
      const oldPrepareTime = new Date(Date.now() - 31 * 60 * 1000);
      prisma.clickTransaction.findUnique.mockResolvedValue(
        mockClickTxn({ status: 1, prepareTime: oldPrepareTime }),
      );
      const result = await service.complete(completeBody(), COMPANY_ID);
      expect(result.error).toBe(CLICK_TRANSACTION_CANCELLED);
      expect(prisma.clickTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-uuid' },
          data: expect.objectContaining({ status: -1, error: -9 }),
        }),
      );
      expect(payments.createFromExternal).not.toHaveBeenCalled();
    });

    it('should cancel transaction when Click sends error < 0', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(mockClickTxn());
      const result = await service.complete(
        completeBody({ error: -4, error_note: 'Payment cancelled by user' }),
        COMPANY_ID,
      );
      expect(result.error).toBe(0);
      expect(prisma.clickTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: -1,
            error: -4,
          }),
        }),
      );
      expect(payments.createFromExternal).not.toHaveBeenCalled();
    });

    it('should return INVALID_AMOUNT for amount mismatch', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(mockClickTxn());
      const result = await service.complete(
        completeBody({ amount: 99999 }),
        COMPANY_ID,
      );
      expect(result.error).toBe(CLICK_INVALID_AMOUNT);
    });

    it('should update ClickTransaction with paymentId on success', async () => {
      prisma.clickTransaction.findUnique.mockResolvedValue(mockClickTxn());
      await service.complete(completeBody(), COMPANY_ID);
      expect(prisma.clickTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-uuid' },
          data: expect.objectContaining({
            status: 2,
            paymentId: 'payment-uuid',
          }),
        }),
      );
    });
  });
});
