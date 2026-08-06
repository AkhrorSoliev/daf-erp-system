import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsReadService } from './students-read.service';
import { StudentsWriteService } from './students-write.service';
import { StudentsStatusService } from './students-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('StudentsService — status methods', () => {
  // The profile reads are branch-gated now, so each one names its caller.
  const CEO_ID = 1;
  let service: StudentsService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;

  const mockStudent = {
    id: 1,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    photo: null,
    deletedAt: null,
  };

  const auditData = {
    statusChangedAt: new Date(),
    statusChangedById: 1,
    statusChangeReason: null,
  };

  const mockStudentSelect = {
    ...mockStudent,
    enrollments: [],
    branches: [],
    deletedBy: null,
    gender: null,
    dateOfBirth: null,
    comment: null,
    balance: 0,
    extraPhone: null,
    parentPhone: null,
    parentName: null,
    telegram: null,
    telegramChatId: null,
    placeOfStudy: null,
    address: null,
    passportSeries: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    statusChangedAt: null,
    statusChangedById: null,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      // The caller is now checked against the student's branch
      // (`assertCallerMayTouchStudent`): editing, expelling or
      // archiving another branch's student was open. A CEO spans all.
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
        update: jest.fn().mockResolvedValue(mockStudentSelect),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 10001 }),
        // Read by the caller-branch guard.
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        // FROZEN cascade walks active enrollments to refund prepaid;
        // default to "no active enrollments" so the path is a no-op.
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'enroll-1',
          studentId: 1,
          groupId: 'group-1',
        }),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'group-1',
          name: 'A1',
          deletedAt: null,
          statusEnum: 'ACTIVE',
          course: { name: 'Deutsch A1' },
          days: 'ODD',
          exactDays: [],
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
          startDate: null,
          endDate: null,
        }),
        findUnique: jest.fn().mockResolvedValue({ name: 'A1' }),
      },
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      studentExitReason: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue(auditData),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        StudentsReadService,
        StudentsWriteService,
        StudentsStatusService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        // FROZEN status cascade now refunds unused prepaid lessons via this
        // service. The students.service tests don't exercise that path, so
        // a no-op mock is sufficient.
        {
          provide: require('../billing/enrollment-billing.service')
            .EnrollmentBillingService,
          useValue: { refundPrepaidWithOverride: jest.fn(), refundPrepaidToBalance: jest.fn() },
        },
        // Discount adjustment path — write tests directly exercise this in the
        // dedicated `update — discountPercent` describe block below.
        {
          provide: require('../transactions/transactions.service')
            .TransactionsService,
          useValue: { recordDiscountAdjustment: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(StudentsService);
  });

  describe('changeStatus', () => {
    it('calls statusHistoryService, updates student, and cascades', async () => {
      await service.changeStatus(
        1,
        { status: 'FROZEN' as any, reason: 'Test sabab' },
        2,
        1001,
      );

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: '1',
          fromStatus: 'ACTIVE',
          toStatus: 'FROZEN',
        }),
      );

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'FROZEN',
            isActive: false,
          }),
        }),
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Student',
        '1',
        'FROZEN',
        2,
      );
    });

    it('sets isActive=true only when status is ACTIVE', async () => {
      await service.changeStatus(1, { status: 'ACTIVE' as any }, 2, 1001);

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('sets isActive=false for non-ACTIVE statuses', async () => {
      await service.changeStatus(
        1,
        { status: 'EXPELLED' as any, reason: 'Test sabab' },
        2,
        1001,
      );

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('throws NotFoundException when student not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(
          999,
          { status: 'FROZEN' as any, reason: 'Test sabab' },
          1,
          1001,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects manual GRADUATED — only set automatically on group completion', async () => {
      await expect(
        service.changeStatus(1, { status: 'GRADUATED' as any }, 2, 1001),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.student.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('archives student: status ARCHIVED + deletedAt + statusHistory + cascade', async () => {
      await service.delete(1, 2, 'Duplikat yozuv', 1001);

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          toStatus: 'ARCHIVED',
          reason: 'Duplikat yozuv',
        }),
      );

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
            deletedById: 2,
            statusChangeReason: 'Duplikat yozuv',
          }),
        }),
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Student',
        '1',
        'ARCHIVED',
        2,
      );
    });

    it('throws NotFoundException when student not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.delete(999, 1, 'Test', 1001)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStatusHistory', () => {
    it('delegates to statusHistoryService.getHistory', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 1 });

      await service.getStatusHistory(1, 1001, CEO_ID);

      expect(statusHistoryService.getHistory).toHaveBeenCalledWith(
        'Student',
        '1',
      );
    });

    it('throws NotFoundException when student not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.getStatusHistory(999, 1001, CEO_ID),
      ).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('multi-tenant filter (companyId)', () => {
    it('findById passes companyId in the where clause', async () => {
      prisma.student.findFirst.mockResolvedValueOnce(mockStudentSelect);
      await service.findById(1, 1001, null);
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1, companyId: 1001 }),
        }),
      );
    });

    it('changeStatus scopes lookup to companyId', async () => {
      await service.changeStatus(
        1,
        { status: 'FROZEN' as any, reason: 'Test sabab' },
        2,
        1001,
      );
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });

    it('delete scopes lookup to companyId', async () => {
      await service.delete(1, 2, 'Duplikat', 1001);
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });

    it('getStatusHistory scopes lookup to companyId', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 1 });
      await service.getStatusHistory(1, 1001, CEO_ID);
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 1, companyId: 1001 }),
        }),
      );
    });

    it('findAll scopes base query to companyId', async () => {
      await service.findAll({ page: 1, pageSize: 10 } as any, 1001, null);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });
  });

  describe('findAll filters', () => {
    it('filters by level via enrollments.some.AND with group.level', async () => {
      await service.findAll(
        { page: 1, pageSize: 10, level: 'B1' } as any,
        1001,
       null);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            enrollments: {
              some: {
                AND: expect.arrayContaining([
                  { deletedAt: null },
                  { group: { deletedAt: null, level: 'B1' } },
                ]),
              },
            },
          }),
        }),
      );
    });

    it('does not attach enrollments filter when level is absent', async () => {
      await service.findAll({ page: 1, pageSize: 10 } as any, 1001, null);

      const findManyCall = prisma.student.findMany.mock.calls[0][0];
      expect(findManyCall.where.enrollments).toBeUndefined();
    });
  });

  describe('createStudentUser', () => {
    it('creates a User with Student role and links to student', async () => {
      const result = await service.createStudentUser(
        1,
        '901234567',
        'Ali',
        'Valiyev',
        1001,
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            login: '901234567',
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901234567',
            companyId: 1001,
            roles: { create: [{ roleId: 6 }] },
          }),
        }),
      );

      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { userId: 10001 },
      });

      expect(result.userId).toBe(10001);
      expect(result.plainPassword).toBeDefined();
      expect(result.plainPassword.length).toBe(8);
    });
  });

  describe('update — discountPercent retroactive adjustment', () => {
    const studentWithDiscount = (oldDiscount: number) => ({
      ...mockStudent,
      photo: null,
      companyId: 1001,
      discountPercent: oldDiscount,
    });

    function setup(opts: {
      oldDiscount: number;
      pastDeductions?: Array<{ amount: number; metadata?: any }>;
    }) {
      prisma.student.findFirst.mockResolvedValue(
        studentWithDiscount(opts.oldDiscount),
      );
      prisma.student.update.mockResolvedValue({
        ...mockStudentSelect,
        discountPercent: opts.oldDiscount,
      });
      prisma.transaction = {
        ...prisma.transaction,
        findMany: jest.fn().mockResolvedValue(opts.pastDeductions ?? []),
      };
      prisma.$transaction = jest.fn((cb: any) => cb(prisma));
    }

    function getTxService() {
      return module.get(
        require('../transactions/transactions.service').TransactionsService,
      );
    }

    let module: TestingModule;
    beforeEach(async () => {
      // Re-import the module reference so each test can read its mocks.
      // The outer beforeEach already built the module; we just grab a reference.
      module = (service as any).constructor.testingModule ?? undefined;
      // Walk back into the parent setup: pull the service's own deps.
      // Simpler: rely on prisma + transactionsService mocks directly via
      // `service` internals — but Nest mocks are scoped to the outer module,
      // so we just need access to the TransactionsService mock.
    });

    // Helper: pull TransactionsService mock from the StudentsWriteService.
    // It's injected as `transactionsService` private field; we access it via
    // bracket notation to avoid type gymnastics.
    function txMock(): { recordDiscountAdjustment: jest.Mock } {
      const writeService = (service as any).write;
      return writeService.transactionsService;
    }

    it('does not write adjustment when discount is unchanged', async () => {
      setup({ oldDiscount: 10 });
      await service.update(
        1,
        { discountPercent: 10 } as any,
        2,
        1001,
      );
      expect(txMock().recordDiscountAdjustment).not.toHaveBeenCalled();
    });

    it('does not write adjustment when student has no past LESSON_DEDUCTIONs', async () => {
      setup({ oldDiscount: 0, pastDeductions: [] });
      await service.update(
        1,
        { discountPercent: 20 } as any,
        2,
        1001,
      );
      expect(txMock().recordDiscountAdjustment).not.toHaveBeenCalled();
    });

    it('writes positive adjustment (refund) when discount increases from 0 to 20', async () => {
      // Past: 2 batches each fullAmount 100_000 charged in full (no discount)
      // previousNetDeducted = 200_000
      // totalFullAmount     = 200_000
      // targetCharge (20%)  = 160_000
      // adjustment          = +40_000  (refund)
      setup({
        oldDiscount: 0,
        pastDeductions: [
          { amount: 100_000, metadata: { fullAmount: 100_000 } },
          { amount: 100_000, metadata: { fullAmount: 100_000 } },
        ],
      });
      await service.update(
        1,
        { discountPercent: 20 } as any,
        2,
        1001,
      );
      expect(txMock().recordDiscountAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 1,
          amount: 40_000,
          oldDiscountPercent: 0,
          newDiscountPercent: 20,
          totalFullAmount: 200_000,
          targetCharge: 160_000,
          previousNetDeducted: 200_000,
          companyId: 1001,
          performedById: 2,
        }),
        expect.anything(),
      );
    });

    it('writes negative adjustment (debit) when discount decreases from 20 to 0', async () => {
      // Past: 2 batches, fullAmount 100_000 each, charged at 20% discount = 80_000
      // previousNetDeducted = 160_000
      // totalFullAmount     = 200_000
      // targetCharge (0%)   = 200_000
      // adjustment          = -40_000  (debit)
      setup({
        oldDiscount: 20,
        pastDeductions: [
          { amount: 80_000, metadata: { fullAmount: 100_000 } },
          { amount: 80_000, metadata: { fullAmount: 100_000 } },
        ],
      });
      await service.update(
        1,
        { discountPercent: 0 } as any,
        2,
        1001,
      );
      expect(txMock().recordDiscountAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: -40_000,
          oldDiscountPercent: 20,
          newDiscountPercent: 0,
          previousNetDeducted: 160_000,
          totalFullAmount: 200_000,
          targetCharge: 200_000,
        }),
        expect.anything(),
      );
    });

    it('falls back to transaction.amount when metadata.fullAmount is missing (legacy rows)', async () => {
      // Pre-discount rows: discount was always 0, so amount = full.
      // previousNetDeducted = 50_000
      // totalFullAmount     = 50_000  (fallback to amount)
      // targetCharge (50%)  = 25_000
      // adjustment          = +25_000
      setup({
        oldDiscount: 0,
        pastDeductions: [{ amount: 50_000, metadata: {} }],
      });
      await service.update(
        1,
        { discountPercent: 50 } as any,
        2,
        1001,
      );
      expect(txMock().recordDiscountAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 25_000,
          totalFullAmount: 50_000,
          previousNetDeducted: 50_000,
          targetCharge: 25_000,
        }),
        expect.anything(),
      );
    });

    it('filters reversed transactions out via where clause', async () => {
      setup({
        oldDiscount: 0,
        pastDeductions: [{ amount: 100_000, metadata: { fullAmount: 100_000 } }],
      });
      await service.update(
        1,
        { discountPercent: 10 } as any,
        2,
        1001,
      );
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 1,
            type: 'LESSON_DEDUCTION',
            reversedAt: null,
          }),
        }),
      );
    });
  });
});
