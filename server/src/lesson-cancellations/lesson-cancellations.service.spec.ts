import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LessonCancellationsService } from './lesson-cancellations.service';
import { PrismaService } from '../prisma/prisma.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LessonCancellationsService', () => {
  let service: LessonCancellationsService;
  let prisma: any;
  let billing: any;
  let history: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      group: { findFirst: jest.fn() },
      lessonCancellation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      enrollment: { findFirst: jest.fn() },
    };
    prisma = {
      ...tx,
      $transaction: jest.fn((cb) => cb(tx)),
    };
    billing = { processAttendanceBilling: jest.fn() };
    history = {
      recordCreate: jest.fn(),
      recordDelete: jest.fn(),
      recordUpdate: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonCancellationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LessonBillingService, useValue: billing },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(LessonCancellationsService);
  });

  describe('create', () => {
    const dto = {
      groupId: 'group-1',
      date: '2026-04-15',
      reason: 'Ustoz kasal',
    };

    it('throws when group not found', async () => {
      tx.group.findFirst.mockResolvedValue(null);
      await expect(service.create(dto, 1, 99)).rejects.toThrow(NotFoundException);
    });

    it('throws when an active cancellation already exists', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
      });
      tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto, 1, 99)).rejects.toThrow(BadRequestException);
    });

    it('creates cancellation when no attendance was recorded (Misol 5)', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({
        id: 'cancel-1',
        groupId: 'group-1',
        date: new Date(),
        reason: dto.reason,
      });
      tx.attendance.findMany.mockResolvedValue([]);

      await service.create(dto, 1, 99);

      expect(tx.lessonCancellation.create).toHaveBeenCalled();
      // No attendance — billing reverse path is not invoked.
      expect(billing.processAttendanceBilling).not.toHaveBeenCalled();
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'LessonCancellation' }),
      );
    });

    it('cascades reverse for each PRESENT attendance (Misol 6)', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({
        id: 'cancel-1',
        groupId: 'group-1',
      });
      tx.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 10001, status: 'PRESENT' },
        { id: 'att-2', studentId: 10002, status: 'LATE' },
      ]);
      tx.enrollment.findFirst
        .mockResolvedValueOnce({ id: 'enroll-1' })
        .mockResolvedValueOnce({ id: 'enroll-2' });

      await service.create(dto, 1, 99);

      // Each PRESENT/LATE attendance is flipped to EXCUSED with cancellationId
      expect(tx.attendance.update).toHaveBeenCalledTimes(2);
      expect(tx.attendance.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: expect.objectContaining({
          status: 'EXCUSED',
          cancellationId: 'cancel-1',
        }),
      });
      // Billing reverse path runs for each affected attendance
      expect(billing.processAttendanceBilling).toHaveBeenCalledTimes(2);
      expect(billing.processAttendanceBilling).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          attendanceId: 'att-1',
          oldStatus: 'PRESENT',
          newStatus: 'EXCUSED',
        }),
      );
    });

    it('skips an attendance whose enrollment is missing', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({ id: 'cancel-1' });
      tx.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 10001, status: 'PRESENT' },
      ]);
      tx.enrollment.findFirst.mockResolvedValue(null);

      await service.create(dto, 1, 99);

      // Status flip still happens (audit), but billing is not invoked
      expect(tx.attendance.update).toHaveBeenCalled();
      expect(billing.processAttendanceBilling).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws when cancellation not found', async () => {
      prisma.lessonCancellation.findFirst.mockResolvedValue(null);
      await expect(service.remove('cancel-x', 1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes cancellation and records history', async () => {
      prisma.lessonCancellation.findFirst.mockResolvedValue({
        id: 'cancel-1',
        groupId: 'group-1',
        date: new Date('2026-04-15T00:00:00Z'),
      });
      tx.lessonCancellation.update.mockResolvedValue({});

      await service.remove('cancel-1', 1, 99);

      expect(tx.lessonCancellation.update).toHaveBeenCalledWith({
        where: { id: 'cancel-1' },
        data: expect.objectContaining({ deletedById: 99 }),
      });
      expect(history.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'LessonCancellation' }),
      );
    });
  });
});
