import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentEnrollmentService } from './student-enrollment.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import { DebtWriteOffService } from '../billing/debt-write-off.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('StudentEnrollmentService', () => {
  let service: StudentEnrollmentService;
  let prisma: any;

  const mockStudent = {
    id: 1,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
        findUnique: jest.fn().mockResolvedValue(mockStudent),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'enroll-1',
          studentId: 1,
          groupId: 'group-1',
        }),
        update: jest.fn(),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'group-1',
          name: 'A1',
          deletedAt: null,
          statusEnum: 'ACTIVE',
          courseId: 'course-1',
          branchId: 1,
          course: { name: 'Deutsch A1' },
          days: 'ODD',
          exactDays: [],
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
          teachers: [{ teacherId: 5001 }],
        }),
        findUnique: jest.fn().mockResolvedValue({ name: 'A1' }),
      },
      course: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ price: 800000, lessonPaymentCount: 12 }),
      },
      studentExitReason: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      enrollmentTransferReason: {
        findFirst: jest.fn(),
      },
      enrollmentStateLog: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      // Faza 5: enrollToGroup (transfer branch) and removeFromGroup wrap
      // their work in $transaction; the callback receives prisma so all
      // model mocks remain reachable.
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentEnrollmentService,
        { provide: PrismaService, useValue: prisma },
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
        {
          provide: EnrollmentBillingService,
          useValue: { refundPrepaidToBalance: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: DebtWriteOffService,
          useValue: {
            computeEligibility: jest.fn(),
            executeWriteOff: jest.fn().mockResolvedValue({
              transaction: { id: 'tx-1' },
              balanceBefore: -100_000,
              balanceAfter: 0,
            }),
            reverseWriteOff: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentEnrollmentService);
  });

  describe('enrollToGroup', () => {
    it('throws BadRequestException for non-ACTIVE student', async () => {
      prisma.student.findFirst.mockResolvedValue({
        ...mockStudent,
        status: 'FROZEN',
      });
      await expect(
        service.enrollToGroup(1, 'group-1', 2, 1001),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for GRADUATED student', async () => {
      prisma.student.findFirst.mockResolvedValue({
        ...mockStudent,
        status: 'GRADUATED',
      });
      await expect(
        service.enrollToGroup(1, 'group-1', 2, 1001),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for COMPLETED group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'A1',
        deletedAt: null,
        statusEnum: 'COMPLETED',
        course: { name: 'Deutsch A1' },
        teachers: [],
      });
      await expect(
        service.enrollToGroup(1, 'group-1', 2, 1001),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CANCELLED group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'A1',
        deletedAt: null,
        statusEnum: 'CANCELLED',
        course: { name: 'Deutsch A1' },
        teachers: [],
      });
      await expect(
        service.enrollToGroup(1, 'group-1', 2, 1001),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows enrollment to FORMING group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'A1',
        deletedAt: null,
        statusEnum: 'FORMING',
        course: { name: 'Deutsch A1' },
        days: 'ODD',
        exactDays: [],
        lessonStartTime: '09:00',
        lessonEndTime: '10:30',
        teachers: [],
      });
      await expect(
        service.enrollToGroup(1, 'group-1', 2, 1001),
      ).resolves.not.toThrow();
    });

    it('allows enrollment to PAUSED group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'A1',
        deletedAt: null,
        statusEnum: 'PAUSED',
        course: { name: 'Deutsch A1' },
        days: 'ODD',
        exactDays: [],
        lessonStartTime: '09:00',
        lessonEndTime: '10:30',
        teachers: [],
      });
      await expect(
        service.enrollToGroup(1, 'group-1', 2, 1001),
      ).resolves.not.toThrow();
    });

    describe('transfer (already has active enrollment)', () => {
      beforeEach(() => {
        // Target group has teacher 5001 (same as default mock).
        // sameGroup check (findFirst 1st call) → null
        // currentEnrollment check (findFirst 2nd call) → existing enrollment
        //   with old group teachers
      });

      it('allows transfer with same teachers and no reason', async () => {
        prisma.enrollment.findFirst
          .mockResolvedValueOnce(null) // sameGroup check
          .mockResolvedValueOnce({
            id: 'enroll-old',
            studentId: 1,
            groupId: 'old-group',
            group: { teachers: [{ teacherId: 5001 }] }, // same as target
          });

        await expect(
          service.enrollToGroup(1, 'group-1', 2, 1001),
        ).resolves.not.toThrow();

        expect(prisma.enrollment.update).toHaveBeenCalledWith({
          where: { id: 'enroll-old' },
          data: expect.objectContaining({
            status: 'TRANSFERRED',
            transferReasonId: null,
          }),
        });
      });

      it('rejects transfer with different teachers and no reason', async () => {
        prisma.enrollment.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'enroll-old',
            studentId: 1,
            groupId: 'old-group',
            group: { teachers: [{ teacherId: 9999 }] }, // different teacher
          });

        await expect(
          service.enrollToGroup(1, 'group-1', 2, 1001),
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts transfer with different teachers when valid reason provided', async () => {
        prisma.enrollment.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'enroll-old',
            studentId: 1,
            groupId: 'old-group',
            group: { teachers: [{ teacherId: 9999 }] },
          });
        prisma.enrollmentTransferReason.findFirst.mockResolvedValueOnce({
          id: 'reason-1',
          name: 'Daraja past',
          companyId: 1001,
        });

        await expect(
          service.enrollToGroup(1, 'group-1', 2, 1001, {
            transferReasonId: 'reason-1',
          }),
        ).resolves.not.toThrow();

        expect(prisma.enrollment.update).toHaveBeenCalledWith({
          where: { id: 'enroll-old' },
          data: expect.objectContaining({
            status: 'TRANSFERRED',
            transferReasonId: 'reason-1',
          }),
        });
      });

      it('rejects unknown transferReasonId', async () => {
        prisma.enrollment.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'enroll-old',
            studentId: 1,
            groupId: 'old-group',
            group: { teachers: [{ teacherId: 9999 }] },
          });
        prisma.enrollmentTransferReason.findFirst.mockResolvedValueOnce(null);

        await expect(
          service.enrollToGroup(1, 'group-1', 2, 1001, {
            transferReasonId: 'nope',
          }),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('removeFromGroup', () => {
    beforeEach(() => {
      prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enroll-1',
        studentId: 1,
        groupId: 'group-1',
        status: 'ACTIVE',
      });
      prisma.enrollment.update = jest.fn().mockResolvedValue({});
      prisma.student.update = jest.fn().mockResolvedValue({});
    });

    it('uses StudentExitReason name when departureReasonId is provided', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValueOnce({
        id: 'reason-1',
        name: 'Moliyaviy sabablar',
        companyId: 1001,
        appliesTo: ['GROUP_REMOVAL'],
      });

      await service.removeFromGroup(1, 'enroll-1', 10001, 1001, {
        departureReasonId: 'reason-1',
      });

      expect(prisma.studentExitReason.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'reason-1',
          companyId: 1001,
          deletedAt: null,
          appliesTo: { has: 'GROUP_REMOVAL' },
        },
      });
      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'enroll-1' },
          data: expect.objectContaining({
            status: 'DROPPED',
            statusChangeReason: 'Moliyaviy sabablar',
            departureReasonId: 'reason-1',
          }),
        }),
      );
      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            statusChangeReason: 'Moliyaviy sabablar',
          }),
        }),
      );
    });

    it('throws NotFound if departureReasonId is not in company or deleted', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.removeFromGroup(1, 'enroll-1', 10001, 1001, {
          departureReasonId: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects empty reason when configured GROUP_REMOVAL reasons exist', async () => {
      prisma.studentExitReason.count.mockResolvedValueOnce(3);
      await expect(
        service.removeFromGroup(1, 'enroll-1', 10001, 1001, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts free-text reason when no configured reasons exist', async () => {
      prisma.studentExitReason.count.mockResolvedValueOnce(0);
      await service.removeFromGroup(1, 'enroll-1', 10001, 1001, {
        reason: "Ota-ona qarorigora ko'ra",
      });
      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusChangeReason: "Ota-ona qarorigora ko'ra",
            departureReasonId: null,
          }),
        }),
      );
      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusChangeReason: "Ota-ona qarorigora ko'ra",
          }),
        }),
      );
    });

    it('rejects empty reason when no configured reasons exist either', async () => {
      prisma.studentExitReason.count.mockResolvedValueOnce(0);
      await expect(
        service.removeFromGroup(1, 'enroll-1', 10001, 1001, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
