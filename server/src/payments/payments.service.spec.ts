import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentsService } from './payments.service';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { DebtAgeService } from './debt-age.service';
import { PaymentsPreviewService } from './payments-preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from '../mock-exams/mock-exam-billing.service';
import { PaymentStatus, Prisma } from '@prisma/client';

const mockStudent = {
  id: 10001,
  firstName: 'Ali',
  lastName: 'Valiyev',
};

const mockContract = { id: 'contract-uuid-1', branchId: 1 };

const mockPayment = {
  id: 'payment-uuid-1',
  studentId: 10001,
  contractId: 'contract-uuid-1',
  amount: 500000,
  method: 'CASH',
  status: PaymentStatus.COMPLETED,
  receiptNumber: 'R-001',
  note: null,
  receivedById: 1,
  branchId: 1,
  companyId: 1001,
  createdAt: new Date(),
  source: 'MANUAL',
};

const mockPaymentWithRelations = {
  ...mockPayment,
  student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' },
  receivedBy: { id: 1, firstName: 'Admin', lastName: 'User' },
  contract: { id: 'contract-uuid-1', contractNumber: 'C-001' },
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let transactionsService: any;
  let entityHistoryService: any;
  let lessonBillingService: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
        findUnique: jest.fn().mockResolvedValue({ balance: 500000 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      contract: {
        findFirst: jest.fn().mockResolvedValue(mockContract),
        update: jest.fn().mockResolvedValue({}),
      },
      // The payment branch is resolved from the STUDENT, not from the client —
      // `create()` calls the fail-closed resolver before anything else.
      // `mockContract.branchId` is 1, so this keeps the two consistent.
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      // Debtor reads resolve the caller's branch ceiling from their record.
      // Default caller here is a CEO, i.e. unrestricted.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      payment: {
        create: jest.fn().mockResolvedValue(mockPayment),
        findFirst: jest.fn().mockResolvedValue(mockPayment),
        findMany: jest.fn().mockResolvedValue([mockPaymentWithRelations]),
        findUnique: jest.fn().mockResolvedValue(mockPayment),
        update: jest.fn().mockResolvedValue({
          ...mockPayment,
          status: PaymentStatus.REVERSED,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      transaction: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'txn-uuid-1', createdAt: new Date() }),
        // Default to 0 — meaning no LESSON_CONSUMPTION downstream of the
        // reversed payment, so the reverse() guard lets the test through.
        count: jest.fn().mockResolvedValue(0),
      },
      paymentPromise: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((fn) => {
        if (typeof fn === 'function') return fn(prisma);
        return Promise.all(fn);
      }),
    };

    transactionsService = {
      recordPayment: jest.fn().mockResolvedValue({}),
      reverseTransaction: jest.fn().mockResolvedValue({}),
    };

    entityHistoryService = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordUpdate: jest.fn().mockResolvedValue(undefined),
      recordDelete: jest.fn().mockResolvedValue(undefined),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordRestore: jest.fn().mockResolvedValue(undefined),
    };

    lessonBillingService = {
      processRetroactiveBillingForStudent: jest
        .fn()
        .mockResolvedValue({ billedAttendances: 0, carriedOver: [] }),
      runRetroactiveBilling: jest
        .fn()
        .mockResolvedValue({ billedAttendances: 0, carriedOver: [] }),
    };

    const mockExamBilling = {
      tryDeductForStudent: jest
        .fn()
        .mockResolvedValue({ paidCount: 0, deductedAmount: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        PaymentsWriteService,
        PaymentsReadService,
        PaymentsDebtorsService,
        {
          provide: DebtAgeService,
          useValue: { getDebtAges: jest.fn().mockResolvedValue(new Map()) },
        },
        PaymentsPreviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: LessonBillingService, useValue: lessonBillingService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MockExamBillingService, useValue: mockExamBilling },
      ],
    }).compile();

    service = module.get(PaymentsService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('create()', () => {
    const dto = {
      studentId: 10001,
      contractId: 'contract-uuid-1',
      amount: 500000,
      method: 'CASH' as any,
      receiptNumber: 'R-001',
      branchId: 1,
    };
    const userId = 1;
    const companyId = 1001;

    it('should create a payment successfully', async () => {
      const result = await service.create(dto, userId, companyId);

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: dto.studentId, deletedAt: null, companyId },
        }),
      );
      expect(prisma.contract.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: dto.contractId,
            studentId: dto.studentId,
            deletedAt: null,
            companyId,
          },
        }),
      );
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: dto.studentId,
            amount: dto.amount,
            status: PaymentStatus.COMPLETED,
          }),
        }),
      );
      expect(transactionsService.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: dto.studentId,
          amount: dto.amount,
          paymentId: mockPayment.id,
        }),
        prisma,
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: dto.contractId },
        data: { paidAmount: { increment: dto.amount } },
      });
      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Payment',
          entityId: mockPayment.id,
        }),
      );
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: dto.studentId,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: mockPayment.id,
          studentBalance: 500000,
        }),
      );
    });

    it('should skip contract validation and contract.update when contractId is not provided', async () => {
      const dtoNoContract = { ...dto, contractId: undefined };

      await service.create(dtoNoContract, userId, companyId);

      expect(prisma.contract.findFirst).not.toHaveBeenCalled();
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when student is not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, userId, companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when contract does not belong to student', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, userId, companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when branchId mismatches contract branch', async () => {
      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-uuid-1',
        branchId: 2,
      });

      await expect(
        service.create({ ...dto, branchId: 1 }, userId, companyId),
      ).rejects.toThrow(BadRequestException);
    });

    // The branch a payment is booked to comes from the STUDENT. It used to come
    // from whatever the client sent (the header switcher's current pick), which
    // meant recording a Fargona student's payment while viewing Namangan booked
    // the cash to Namangan while that student's lesson deductions stayed in
    // Fargona — income in one branch's books, its cost in the other's (D2).
    it('resolves branchId from the student, not from the dto', async () => {
      prisma.studentBranch.findFirst.mockResolvedValue({ branchId: 2 });
      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-uuid-1',
        branchId: 2,
      });

      await service.create({ ...dto, branchId: undefined }, userId, companyId);

      expect(prisma.payment.create.mock.calls[0][0].data.branchId).toBe(2);
    });

    it('rejects a payment whose dto branch disagrees with the student', async () => {
      prisma.studentBranch.findFirst.mockResolvedValue({ branchId: 1 });

      await expect(
        service.create({ ...dto, branchId: 2 }, userId, companyId),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects a contract belonging to a different branch than the student', async () => {
      prisma.studentBranch.findFirst.mockResolvedValue({ branchId: 1 });
      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-uuid-1',
        branchId: 3,
      });

      await expect(
        service.create({ ...dto, branchId: undefined }, userId, companyId),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a payment for a student with no resolvable branch', async () => {
      // Fail-closed: a row nobody can attribute later is worse than a refusal.
      prisma.studentBranch.findFirst.mockResolvedValue(null);
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ ...dto, branchId: undefined }, userId, companyId),
      ).rejects.toThrow();
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('should trigger retroactive billing inside the payment tx', async () => {
      await service.create(dto, userId, companyId);

      // `processRetroactiveBillingForStudent` must run with the student id
      // and the tx the payment opened — same tx, same atomic boundary.
      expect(
        lessonBillingService.processRetroactiveBillingForStudent,
      ).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          studentId: dto.studentId,
          companyId,
          performedById: userId,
        }),
      );
    });
  });

  describe('reverse()', () => {
    const paymentId = 'payment-uuid-1';
    const params = { reason: "Xato to'lov", performedById: 1, companyId: 1001 };

    it('should reverse a payment successfully', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        studentId: 10001,
        amount: 500000,
        contractId: 'contract-uuid-1',
        status: PaymentStatus.COMPLETED,
      });

      const result = await service.reverse(paymentId, params);

      expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
        'txn-uuid-1',
        expect.objectContaining({ performedById: params.performedById }),
        prisma,
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-uuid-1' },
        data: { paidAmount: { decrement: 500000 } },
      });
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: PaymentStatus.REVERSED },
      });
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledTimes(2);
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Payment',
          entityId: paymentId,
          newValues: expect.objectContaining({
            status: PaymentStatus.REVERSED,
          }),
        }),
      );
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
        }),
      );
      expect(result).toEqual({ reversedPaymentId: paymentId, amount: 500000 });
    });

    it('should skip contract.update when payment has no contractId', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        studentId: 10001,
        amount: 500000,
        contractId: null,
        status: PaymentStatus.COMPLETED,
      });

      await service.reverse(paymentId, params);

      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    // Faza 5.1 — when this payment funded LESSON_CONSUMPTION rows (i.e.
    // the money is already spent on lessons), reverse() must refuse so the
    // user is forced down the formal Refund path with proper math.
    it('throws when downstream LESSON_CONSUMPTION exists', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        studentId: 10001,
        amount: 500000,
        contractId: 'contract-uuid-1',
        status: PaymentStatus.COMPLETED,
      });
      prisma.transaction.count.mockResolvedValue(3); // 3 consumption rows

      await expect(service.reverse(paymentId, params)).rejects.toThrow(
        /sarflangan/,
      );
      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    // The guard must count genuine consumption only — reversal entries
    // (reversedTransactionId set) are the undoing of a consumption.
    it('consumption guard query excludes reversal entries', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        studentId: 10001,
        amount: 500000,
        contractId: 'contract-uuid-1',
        status: PaymentStatus.COMPLETED,
      });

      await service.reverse(paymentId, params);

      const consumptionCall = prisma.transaction.count.mock.calls.find(
        (call: any) => call[0]?.where?.type === 'LESSON_CONSUMPTION',
      );
      expect(consumptionCall?.[0].where).toEqual(
        expect.objectContaining({
          reversedAt: null,
          reversedTransactionId: null,
        }),
      );
    });

    it('should throw NotFoundException when payment is not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.reverse(paymentId, params)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when payment is already reversed', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        studentId: 10001,
        amount: 500000,
        contractId: 'contract-uuid-1',
        status: PaymentStatus.REVERSED,
      });

      await expect(service.reverse(paymentId, params)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when no ledger entry is found', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        studentId: 10001,
        amount: 500000,
        contractId: 'contract-uuid-1',
        status: PaymentStatus.COMPLETED,
      });
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.reverse(paymentId, params)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createFromExternal()', () => {
    const externalParams = {
      studentId: 10001,
      contractId: 'contract-uuid-1',
      amount: 300000,
      method: 'PAYME' as any,
      externalId: 'ext-12345',
      source: 'PAYME' as any,
      companyId: 1001,
    };

    it('should create an external payment successfully', async () => {
      const result = await service.createFromExternal(externalParams);

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalId: externalParams.externalId,
            source: externalParams.source,
            status: PaymentStatus.COMPLETED,
          }),
        }),
      );
      expect(transactionsService.recordPayment).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          id: mockPayment.id,
          studentBalance: 500000,
        }),
      );
    });

    it('should throw NotFoundException when contract does not belong to student', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.createFromExternal(externalParams)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when student is not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.createFromExternal(externalParams)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException on duplicate externalId (P2002)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      prisma.$transaction.mockRejectedValue(prismaError);

      await expect(service.createFromExternal(externalParams)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should rethrow non-P2002 errors', async () => {
      const genericError = new Error('DB connection failed');
      prisma.$transaction.mockRejectedValue(genericError);

      await expect(service.createFromExternal(externalParams)).rejects.toThrow(
        'DB connection failed',
      );
    });
  });

  describe('findAll()', () => {
    it('should exclude REVERSED payments by default when no status filter', async () => {
      await service.findAll({} as any, 1001, null);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          status: { not: PaymentStatus.REVERSED },
        }),
      );
    });

    it('should allow filtering by REVERSED status explicitly', async () => {
      await service.findAll({ status: PaymentStatus.REVERSED } as any, 1001, null);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          status: PaymentStatus.REVERSED,
        }),
      );
    });

    it('should include source field in select', async () => {
      await service.findAll({} as any, 1001, null);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.select.source).toBe(true);
    });

    it('should return paginated results', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPaymentWithRelations]);
      prisma.payment.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, pageSize: 10 } as any,
        1001,
       null);

      expect(result).toEqual({
        data: [mockPaymentWithRelations],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });

    it('should apply date range filters when both startDate and endDate provided', async () => {
      await service.findAll(
        { startDate: '2026-01-01', endDate: '2026-01-31' } as any,
        1001,
       null);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.createdAt).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-01-31T23:59:59.999Z'),
      });
    });
  });

  describe('findOne()', () => {
    it('should return a payment by id', async () => {
      prisma.payment.findFirst.mockResolvedValue(mockPaymentWithRelations);

      const result = await service.findOne('payment-uuid-1', 1001, null);

      expect(result).toEqual(mockPaymentWithRelations);
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment-uuid-1', companyId: 1001 },
        }),
      );
    });

    it('should throw NotFoundException when payment is not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 1001, null)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByStudent()', () => {
    it('should exclude REVERSED payments by default', async () => {
      await service.findByStudent(10001, {} as any, 1001, null);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          studentId: 10001,
          companyId: 1001,
          status: { not: PaymentStatus.REVERSED },
        }),
      );
    });

    it('should allow filtering by REVERSED status explicitly', async () => {
      await service.findByStudent(
        10001,
        { status: PaymentStatus.REVERSED } as any,
        1001,
       null);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toBe(PaymentStatus.REVERSED);
    });

    it('should return paginated results', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPaymentWithRelations]);
      prisma.payment.count.mockResolvedValue(1);

      const result = await service.findByStudent(
        10001,
        { page: 2, pageSize: 5 } as any,
        1001,
       null);

      expect(result).toEqual({
        data: [mockPaymentWithRelations],
        total: 1,
        page: 2,
        pageSize: 5,
      });
      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(5);
      expect(findManyCall.take).toBe(5);
    });
  });

  describe('getDebtors()', () => {
    it('should query students with negative balance', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      const result = await service.getDebtors(1001, {
        userId: 1,
        roles: ['CEO'],
      });

      const findManyCall = prisma.student.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          companyId: 1001,
          deletedAt: null,
          balance: { lt: 0 },
        }),
      );
      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
    });

    it('should filter by branchId when provided', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.getDebtors(1001, { branchId: 5, userId: 1, roles: ['CEO'] });

      const findManyCall = prisma.student.findMany.mock.calls[0][0];
      expect(findManyCall.where.branches).toEqual({
        some: { branchId: { in: [5] } },
      });
    });
  });

  describe('getPending()', () => {
    it('should query students with balance < 0 and active enrollments', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      const result = await service.getPending(1001, { branchIds: null });

      const findManyCall = prisma.student.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          companyId: 1001,
          deletedAt: null,
          balance: { lt: 0 },
          enrollments: { some: { status: 'ACTIVE', deletedAt: null } },
        }),
      );
      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
    });
  });

  describe('correctAmount()', () => {
    // A recent, admin-entered cash payment of 5 000 000 — the typo we want
    // to correct down to 400 000.
    const recentPayment = {
      id: 'payment-uuid-1',
      studentId: 10001,
      amount: 5000000,
      method: 'CASH',
      contractId: 'contract-uuid-1',
      branchId: 1,
      status: PaymentStatus.COMPLETED,
      source: 'ADMIN_MANUAL',
      createdAt: new Date(),
    };
    const dto = { correctAmount: 400000, reason: 'Ortiqcha nol kiritilgan' };

    beforeEach(() => {
      prisma.payment.findFirst.mockResolvedValue(recentPayment);
    });

    it('reverses the wrong payment and re-posts at the correct amount', async () => {
      const result = await service.correctAmount(
        'payment-uuid-1',
        dto,
        99,
        1001,
        ['Administrator'],
      );

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid-1' },
        data: { status: PaymentStatus.REVERSED },
      });
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 400000 }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ reversedPaymentId: 'payment-uuid-1' }),
      );
    });

    it('emits payment.corrected when a non-CEO performs the correction', async () => {
      await service.correctAmount('payment-uuid-1', dto, 99, 1001, [
        'Administrator',
      ]);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.corrected',
        expect.objectContaining({
          studentId: 10001,
          oldAmount: 5000000,
          newAmount: 400000,
          oldMethod: 'CASH',
          newMethod: 'CASH',
          performedById: 99,
        }),
      );
    });

    it('re-posts with the new method when method is changed', async () => {
      await service.correctAmount(
        'payment-uuid-1',
        { correctAmount: 400000, method: 'TRANSFER' as any, reason: 'Usul xato' },
        99,
        1001,
        ['Administrator'],
      );

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 400000,
            method: 'TRANSFER',
          }),
        }),
      );
    });

    it('keeps the original method when method is omitted', async () => {
      await service.correctAmount('payment-uuid-1', dto, 99, 1001, [
        'Administrator',
      ]);

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ method: 'CASH' }),
        }),
      );
    });

    it('relabels the method in place for a method-only correction (no reverse/re-post)', async () => {
      await service.correctAmount(
        'payment-uuid-1',
        {
          correctAmount: 5000000,
          method: 'TRANSFER' as any,
          reason: 'Naqd emas, o’tkazma edi',
        },
        99,
        1001,
        ['Administrator'],
      );

      // In-place method update — NOT a reverse + re-post.
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid-1' },
        data: { method: 'TRANSFER' },
      });
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
      expect(entityHistoryService.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Payment',
          oldValues: { method: 'CASH' },
          newValues: { method: 'TRANSFER' },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.corrected',
        expect.objectContaining({ oldMethod: 'CASH', newMethod: 'TRANSFER' }),
      );
    });

    it('allows a method-only correction without a reason', async () => {
      await expect(
        service.correctAmount(
          'payment-uuid-1',
          { correctAmount: 5000000, method: 'TRANSFER' as any },
          99,
          1001,
          ['Administrator'],
        ),
      ).resolves.toBeDefined();

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid-1' },
        data: { method: 'TRANSFER' },
      });
    });

    it('allows a method-only correction even when funds were spent on lessons', async () => {
      // A method relabel never moves money, so the "funds already spent on
      // lessons" guard must NOT block it (the reverse-block bug we fixed).
      prisma.transaction.count.mockResolvedValue(5);

      await expect(
        service.correctAmount(
          'payment-uuid-1',
          { correctAmount: 5000000, method: 'TRANSFER' as any },
          99,
          1001,
          ['Administrator'],
        ),
      ).resolves.toBeDefined();

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid-1' },
        data: { method: 'TRANSFER' },
      });
    });

    it('throws when the amount changes but no reason is given', async () => {
      await expect(
        service.correctAmount(
          'payment-uuid-1',
          { correctAmount: 400000 },
          99,
          1001,
          ['Administrator'],
        ),
      ).rejects.toThrow(/sabab/i);
    });

    it('does NOT emit payment.corrected when a CEO performs the correction', async () => {
      await service.correctAmount('payment-uuid-1', dto, 1, 1001, ['CEO']);

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'payment.corrected',
        expect.anything(),
      );
    });

    it('throws when the payment is a gateway payment (not admin-entered)', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...recentPayment,
        source: 'GATEWAY_WEBHOOK',
      });

      await expect(
        service.correctAmount('payment-uuid-1', dto, 99, 1001, [
          'Administrator',
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the payment is already reversed', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...recentPayment,
        status: PaymentStatus.REVERSED,
      });

      await expect(
        service.correctAmount('payment-uuid-1', dto, 99, 1001, [
          'Administrator',
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the new amount equals the current amount', async () => {
      await expect(
        service.correctAmount(
          'payment-uuid-1',
          { correctAmount: 5000000, reason: 'x' },
          99,
          1001,
          ['Administrator'],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks a non-CEO from correcting a payment older than 72h', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...recentPayment,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      });

      await expect(
        service.correctAmount('payment-uuid-1', dto, 99, 1001, [
          'Administrator',
        ]),
      ).rejects.toThrow(/72 soat/);
    });

    it('allows a CEO to correct a payment older than 72h', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...recentPayment,
        createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000),
      });

      await expect(
        service.correctAmount('payment-uuid-1', dto, 1, 1001, ['CEO']),
      ).resolves.toBeDefined();
    });

    it('blocks correction when the funds were already spent on lessons', async () => {
      prisma.transaction.count.mockResolvedValue(2);

      await expect(
        service.correctAmount('payment-uuid-1', dto, 99, 1001, [
          'Administrator',
        ]),
      ).rejects.toThrow(/sarflangan/);
    });

    // Regression: a prior lesson-deduction unwind leaves reversal-entry
    // consumption rows. The guard must NOT count them, or the correction
    // is wrongly blocked. Query must filter reversedTransactionId: null.
    it('consumption pre-check query excludes reversal entries', async () => {
      await service.correctAmount('payment-uuid-1', dto, 99, 1001, [
        'Administrator',
      ]);

      const consumptionCall = prisma.transaction.count.mock.calls.find(
        (call: any) => call[0]?.where?.type === 'LESSON_CONSUMPTION',
      );
      expect(consumptionCall?.[0].where).toEqual(
        expect.objectContaining({
          reversedAt: null,
          reversedTransactionId: null,
        }),
      );
    });

    it('throws NotFoundException when the payment does not exist', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.correctAmount('nope', dto, 99, 1001, ['Administrator']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
