import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
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
        findFirst: jest.fn().mockResolvedValue({ id: 'txn-uuid-1' }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get(PaymentsService);
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

    it('should resolve branchId from contract when not provided in dto', async () => {
      prisma.contract.findFirst.mockResolvedValue({
        id: 'contract-uuid-1',
        branchId: 3,
      });

      await service.create({ ...dto, branchId: undefined }, userId, companyId);

      const createCall = prisma.payment.create.mock.calls[0][0];
      expect(createCall.data.branchId).toBe(3);
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
      await service.findAll({} as any, 1001);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          status: { not: PaymentStatus.REVERSED },
        }),
      );
    });

    it('should allow filtering by REVERSED status explicitly', async () => {
      await service.findAll({ status: PaymentStatus.REVERSED } as any, 1001);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          status: PaymentStatus.REVERSED,
        }),
      );
    });

    it('should include source field in select', async () => {
      await service.findAll({} as any, 1001);

      const findManyCall = prisma.payment.findMany.mock.calls[0][0];
      expect(findManyCall.select.source).toBe(true);
    });

    it('should return paginated results', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPaymentWithRelations]);
      prisma.payment.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 1, pageSize: 10 } as any,
        1001,
      );

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
      );

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

      const result = await service.findOne('payment-uuid-1', 1001);

      expect(result).toEqual(mockPaymentWithRelations);
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment-uuid-1', companyId: 1001 },
        }),
      );
    });

    it('should throw NotFoundException when payment is not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 1001)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByStudent()', () => {
    it('should exclude REVERSED payments by default', async () => {
      await service.findByStudent(10001, {} as any, 1001);

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
      );

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
      );

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

      const result = await service.getDebtors(1001, {});

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

      await service.getDebtors(1001, { branchId: 5 });

      const findManyCall = prisma.student.findMany.mock.calls[0][0];
      expect(findManyCall.where.branches).toEqual({
        some: { branchId: 5 },
      });
    });
  });

  describe('getPending()', () => {
    it('should query students with balance < 0 and active enrollments', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      const result = await service.getPending(1001, {});

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
});
