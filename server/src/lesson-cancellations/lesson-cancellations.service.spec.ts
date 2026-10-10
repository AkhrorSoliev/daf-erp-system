import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LessonCancellationsService } from './lesson-cancellations.service';
import { PrismaService } from '../prisma/prisma.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LessonCancellationsService', () => {
  let service: LessonCancellationsService;
  let prisma: any;
  let billing: any;
  let monthly: any;
  let history: any;
  let tx: any;
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    emitter = { emit: jest.fn() };
    tx = {
      group: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
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
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      // «Dars bo'ldimi?» (spec 2026-09-29): a cancellation answers the
      // question, and deleting it asks again.
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
      task: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
      taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
      // `remove` reads the branch's holidays so the re-asked task skips them.
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // The reversal asks which enrollment the lesson was CHARGED to
      // (`resolveBilledEnrollmentId`); null here means "nothing billed" and
      // sends it to the enrollment fallback above.
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
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
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma = {
      ...tx,
      $transaction: jest.fn((cb) => cb(tx)),
    };
    billing = { processAttendanceBilling: jest.fn() };
    monthly = {
      releaseCancelledLesson: jest
        .fn()
        .mockResolvedValue({ students: 0, refunded: 0 }),
      restoreCancelledLesson: jest
        .fn()
        .mockResolvedValue({ students: 0, restored: 0, kept: 0 }),
    };
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
        { provide: MonthlyChargeService, useValue: monthly },
        { provide: EntityHistoryService, useValue: history },
        { provide: EventEmitter2, useValue: emitter },
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
      await expect(service.create(dto, 1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when an active cancellation already exists', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 1,
        name: 'A1',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto, 1, 99)).rejects.toThrow(
        BadRequestException,
      );
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

    // ADR-0053: nobody was marked, yet every monthly charge billed the day —
    // the cancellation gives it back in the same transaction.
    it('releases the day from the monthly charges even with no attendance', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 2,
        name: '#900',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({
        id: 'cancel-1',
        groupId: 'group-1',
        date: new Date(),
        reason: dto.reason,
      });
      monthly.releaseCancelledLesson.mockResolvedValue({
        students: 4,
        refunded: 150_000,
      });

      await service.create(dto, 1, 99);

      expect(monthly.releaseCancelledLesson).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          groupId: 'group-1',
          cancellationId: 'cancel-1',
          performedById: 99,
        }),
      );
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({
            pulQaytganOquvchilar: 4,
            qaytarilganSumma: 150_000,
          }),
        }),
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
      // The enrollment now comes from the row the lesson was CHARGED to, not
      // from a (student, group) guess — a student can hold two live
      // enrollments in the same group and the prepaid unit must go back to the
      // one that paid.
      tx.transaction.findFirst
        .mockResolvedValueOnce({ enrollmentId: 'enroll-1' })
        .mockResolvedValueOnce({ enrollmentId: 'enroll-2' });

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
      // A late arrival's minutes leave with its LATE mark (ADR-0048).
      expect(tx.attendance.update).toHaveBeenCalledWith({
        where: { id: 'att-2' },
        data: {
          status: 'EXCUSED',
          cancellationId: 'cancel-1',
          lateMinutes: null,
        },
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
      tx.transaction.findFirst.mockResolvedValue(null);
      tx.enrollment.findMany.mockResolvedValue([]);

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

    it("answers a lesson waiting for «Dars bo'ldimi?» and tells the group", async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 2,
        name: '#014',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({ id: 'x1' });
      monthly.releaseCancelledLesson.mockResolvedValue({
        students: 4,
        refunded: 150000,
      });
      tx.unmarkedLesson.findUnique.mockResolvedValue({
        id: 'u1',
        companyId: 1,
        branchId: 2,
        groupId: 'group-1',
        date: new Date('2026-04-15T00:00:00.000Z'),
        lessonStartTime: '16:00',
        lessonEndTime: '17:30',
        status: 'PENDING',
        taskId: null,
      });
      tx.group.findUnique.mockResolvedValue({ name: '#014' });

      await service.create(dto, 1, 99);

      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'NOT_HELD',
            cancellationId: 'x1',
          }),
        }),
      );
      expect(emitter.emit).toHaveBeenCalledWith(
        'unmarked-lesson.not-held',
        expect.objectContaining({
          outcome: 'CANCELLED',
          reason: 'Ustoz kasal',
          decidedById: 99,
          refundedStudents: 4,
          refundedAmount: 150000,
          groupName: '#014',
        }),
      );
    });

    it('does not tell the group about an ordinary cancellation', async () => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 2,
        name: '#014',
        exactDays: ['wednesday'],
      });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({ id: 'x1' });
      await service.create(dto, 1, 99);
      expect(emitter.emit).not.toHaveBeenCalledWith(
        'unmarked-lesson.not-held',
        expect.anything(),
      );
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

  describe('a concurrent change', () => {
    const conflict = new ConflictException(
      "Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring",
    );
    const dto = { groupId: 'group-1', date: '2026-04-15', reason: 'x' };
    // The caller-may-touch-group check before the transaction.
    beforeEach(() => tx.group.findFirst.mockResolvedValue({ branchId: 1 }));

    it('create answers a conflict or a concurrent duplicate with 409', async () => {
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
      await expect(service.create(dto, 1, 99)).rejects.toThrow(conflict);
      // The partial unique index on the live cancellation of the day.
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.create(dto, 1, 99)).rejects.toThrow(conflict);
      const boom = new Error('boom');
      prisma.$transaction.mockRejectedValueOnce(boom);
      await expect(service.create(dto, 1, 99)).rejects.toBe(boom);
    });

    it('remove answers a conflict or a concurrent duplicate with 409', async () => {
      prisma.lessonCancellation.findFirst.mockResolvedValue({
        id: 'x1',
        groupId: 'group-1',
        date: new Date('2026-04-15T00:00:00.000Z'),
      });
      tx.group.findUnique.mockResolvedValue({ branchId: 1 });
      prisma.$transaction.mockRejectedValueOnce({ cause: { code: '40P01' } });
      await expect(service.remove('x1', 1, 99)).rejects.toThrow(conflict);
      // UnmarkedLesson(groupId, date): the sweep opened the same question.
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.remove('x1', 1, 99)).rejects.toThrow(conflict);
      const boom = new Error('boom');
      prisma.$transaction.mockRejectedValueOnce(boom);
      await expect(service.remove('x1', 1, 99)).rejects.toBe(boom);
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

    // ADR-0063: a deleted cancellation no longer leaves its lesson free.
    it('takes the released lesson money back in the same transaction', async () => {
      prisma.lessonCancellation.findFirst.mockResolvedValue({
        id: 'cancel-1',
        groupId: 'group-1',
        date: new Date('2026-04-15T00:00:00Z'),
      });
      tx.group.findFirst.mockResolvedValue({ branchId: 1 });
      tx.lessonCancellation.update.mockResolvedValue({});
      monthly.restoreCancelledLesson.mockResolvedValue({
        students: 3,
        restored: 96_429,
        kept: 1,
      });

      const res = await service.remove('cancel-1', 1, 99);

      expect(monthly.restoreCancelledLesson).toHaveBeenCalledWith(tx, {
        cancellationId: 'cancel-1',
        companyId: 1,
        performedById: 99,
        reason: "15.04 darsining bekor qilinishi o'chirildi",
      });
      expect(history.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: expect.objectContaining({
            qaytaYechilganOquvchilar: 3,
            qaytaYechilganSumma: 96_429,
            pulQoldirilganOquvchilar: 1,
          }),
        }),
      );
      expect(res).toEqual({
        id: 'cancel-1',
        restoredStudents: 3,
        restoredAmount: 96_429,
        keptStudents: 1,
      });
    });

    describe("re-asking «Dars bo'ldimi?»", () => {
      // 2026-09-30 13:00 Tashkent (Wednesday). The re-asked task is due on the
      // next working day, and a fixed clock keeps that date from drifting.
      const NOW = new Date('2026-09-30T08:00:00.000Z');
      const answered = {
        id: 'u1',
        companyId: 1,
        branchId: 2,
        groupId: 'group-1',
        date: new Date('2026-04-15T00:00:00.000Z'),
        lessonStartTime: '16:00',
        lessonEndTime: '17:30',
        status: 'NOT_HELD',
        cancellationId: 'x1',
      };

      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(NOW);
        // `prisma` spreads `tx`, so both share these mock objects.
        tx.lessonCancellation.findFirst.mockResolvedValue({
          id: 'x1',
          groupId: 'group-1',
          date: new Date('2026-04-15T00:00:00.000Z'),
        });
        tx.lessonCancellation.update.mockResolvedValue({});
        // The caller-may-touch-group check.
        tx.group.findFirst.mockResolvedValue({ branchId: 2 });
        tx.unmarkedLesson.findFirst.mockResolvedValue(answered);
        tx.group.findUnique.mockResolvedValue({
          name: '#014',
          branchId: 2,
          deletedAt: null,
        });
        tx.user.findMany.mockResolvedValue([{ id: 3 }]);
        tx.task.create.mockResolvedValue({ id: 'c2' });
      });
      afterEach(() => jest.useRealTimers());

      it('re-asks the question of a lesson whose cancellation is deleted', async () => {
        await service.remove('x1', 1, 99, ['CEO']);

        expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'PENDING',
              taskId: 'c2',
            }),
          }),
        );
      });

      // The set is read for the GROUP's branch, from today on, before the
      // transaction opens — a holiday read is not something the Serializable
      // transaction should wait on.
      it('skips the branch holidays when it sets the new due date', async () => {
        // Thursday 01.10 is a holiday, so the task moves to Friday 02.10 10:00.
        tx.holiday.findMany.mockResolvedValue([
          {
            date: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-01T00:00:00.000Z'),
          },
        ]);

        await service.remove('x1', 1, 99, ['CEO']);

        expect(tx.holiday.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: [{ branchId: null }, { branchId: 2 }],
            }),
          }),
        );
        expect(tx.holiday.findMany.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.$transaction.mock.invocationCallOrder[0],
        );
        expect(tx.task.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              dueAt: new Date('2026-10-02T05:00:00.000Z'),
            }),
          }),
        );
      });

      // Human ruling 2026-09-30: a cancellation made after the lesson ended
      // (17:30 Tashkent on 15.04), then deleted, does not pay the teacher.
      it('asks about a lesson cancelled after it ended without the exemption', async () => {
        tx.lessonCancellation.findFirst.mockResolvedValue({
          id: 'x1',
          groupId: 'group-1',
          date: new Date('2026-04-15T00:00:00.000Z'),
          createdAt: new Date('2026-04-15T14:00:00.000Z'),
        });
        tx.unmarkedLesson.findFirst.mockResolvedValue(null);
        tx.group.findUnique.mockResolvedValue({
          name: '#014',
          companyId: 1,
          branchId: 2,
          lessonStartTime: '16:00',
          lessonEndTime: '17:30',
          deletedAt: null,
        });

        await service.remove('x1', 1, 99, ['CEO']);

        expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            groupId: 'group-1',
            teacherPayExempt: false,
            exemptReason: null,
          }),
        });
      });

      // `reopenAfterCancellationRemoved` reads, then creates an UnmarkedLesson
      // row that the Serializable lesson-end sweep also writes.
      it('runs the transaction Serializable, like create', async () => {
        await service.remove('x1', 1, 99, ['CEO']);

        expect(prisma.$transaction).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }),
        );
      });
    });
  });
});
