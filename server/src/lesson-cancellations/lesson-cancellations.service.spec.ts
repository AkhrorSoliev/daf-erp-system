import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
      lessonReschedule: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      lessonTeacherOverride: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      enrollment: { findFirst: jest.fn() },
      // Cancelling reverses a lesson's billing, so the caller is now checked
      // against the GROUP's branch (`assertCallerMayTouchGroup`). A CEO spans
      // every branch, which is the shape these existing cases assume.
      groupTeacher: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto, 1, 99)).rejects.toThrow(BadRequestException);
    });

    it('creates cancellation when no attendance was recorded (Misol 5)', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
        exactDays: ['wednesday'],
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
        exactDays: ['wednesday'],
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
        exactDays: ['wednesday'],
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

    // ── Yangi cascade va validatsiya ──────────────────────────────────

    it('Stsenariy B: cascades to soft-delete an active override on the date', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({ id: 'cancel-1' });
      tx.lessonTeacherOverride.findFirst.mockResolvedValue({
        id: 'override-1',
        teacherIds: [10042],
      });

      await service.create(dto, 1, 99);

      expect(tx.lessonTeacherOverride.update).toHaveBeenCalledWith({
        where: { id: 'override-1' },
        data: expect.objectContaining({ deletedById: 99 }),
      });
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({ orinbosarBekorQilindi: 'ha' }),
        }),
      );
    });

    it('Stsenariy D: rejects when the date is the originalDate of an active reschedule', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonReschedule.findFirst.mockResolvedValue({
        newDate: new Date('2026-04-22T00:00:00Z'),
      });

      await expect(service.create(dto, 1, 99)).rejects.toThrow(
        /boshqa kunga ko'chirilgan/,
      );
      expect(tx.lessonCancellation.create).not.toHaveBeenCalled();
    });

    it('Stsenariy C: accepts when the date is a reschedule.newDate (lesson moved here)', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
        exactDays: ['monday'], // 2026-04-15 is Wednesday — NOT in exactDays
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonReschedule.findFirst
        // first call: was this date moved AWAY? no
        .mockResolvedValueOnce(null)
        // second call: was a lesson moved HERE? yes
        .mockResolvedValueOnce({ id: 'rs-1' });
      tx.lessonCancellation.create.mockResolvedValue({ id: 'cancel-1' });

      await service.create(dto, 1, 99);

      expect(tx.lessonCancellation.create).toHaveBeenCalled();
    });

    it('rejects a non-lesson day that is neither in exactDays nor a reschedule.newDate', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
        exactDays: ['monday'], // 2026-04-15 is Wednesday
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonReschedule.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, 1, 99)).rejects.toThrow(
        /dars kuni emas/,
      );
      expect(tx.lessonCancellation.create).not.toHaveBeenCalled();
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
      // Deleting the record is what lets the lesson be re-taken, so it carries
      // the same authority as creating the cancellation — and therefore the
      // same group lookup.
      tx.group.findFirst.mockResolvedValue({ branchId: 1 });
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
