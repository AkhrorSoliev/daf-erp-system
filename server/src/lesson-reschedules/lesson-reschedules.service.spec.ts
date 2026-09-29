import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { PrismaService } from '../prisma/prisma.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LessonReschedulesService', () => {
  let service: LessonReschedulesService;
  let prisma: any;
  let tx: any;
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    emitter = { emit: jest.fn() };
    tx = {
      group: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ name: 'A1' }),
      },
      room: { findFirst: jest.fn(), findMany: jest.fn() },
      lessonCancellation: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      lessonReschedule: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      lessonTeacherOverride: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: { findFirst: jest.fn() },
      // «Dars bo'ldimi?» (spec 2026-09-29): moving a lesson answers the
      // question, editing the make-up lesson reads its row, and deleting the
      // move asks again (which writes the task).
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      comment: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
      // A reschedule rewrites a group's timetable, so the caller is now checked
      // against that group's branch (`assertCallerMayTouchGroup`). A CEO spans
      // every branch — the shape these cases assume.
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
      group: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      // A reschedule rewrites a group's timetable, so the caller is now checked
      // against that group's branch (`assertCallerMayTouchGroup`). A CEO spans
      // every branch — the shape these cases assume.
      groupTeacher: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      room: { findMany: jest.fn() },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      lessonReschedule: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // `remove` reads the branch's holidays before its transaction opens, so
      // the re-asked task skips them.
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonReschedulesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: LessonBillingService,
          useValue: { processAttendanceBilling: jest.fn() },
        },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get(LessonReschedulesService);
  });

  describe('findAvailableRooms', () => {
    const baseQuery = {
      groupId: 'group-1',
      date: '2026-05-12', // Tuesday
      startTime: '10:00',
      endTime: '11:30',
    };

    it('rejects bad date format', async () => {
      await expect(
        service.findAvailableRooms({ ...baseQuery, date: 'nope' }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when endTime is not after startTime', async () => {
      await expect(
        service.findAvailableRooms(
          { ...baseQuery, startTime: '11:00', endTime: '10:00' },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when group is missing', async () => {
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(service.findAvailableRooms(baseQuery, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns all branch rooms when nothing in branch conflicts', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([]); // no candidate conflicts
      prisma.lessonReschedule.findMany.mockResolvedValue([]); // no other reschedules
      prisma.room.findMany.mockResolvedValue([
        { id: 'room-a', name: 'A' },
        { id: 'room-b', name: 'B' },
      ]);

      const result = await service.findAvailableRooms(baseQuery, 1);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: 7,
            companyId: 1,
            deletedAt: null,
          }),
        }),
      );
      // Prisma's `notIn: []` excludes every row — when nothing's busy we
      // must omit the `id` filter entirely.
      const where = prisma.room.findMany.mock.calls[0][0].where;
      expect(where.id).toBeUndefined();
      expect(result).toEqual([
        { id: 'room-a', name: 'A' },
        { id: 'room-b', name: 'B' },
      ]);
    });

    it('omits rooms occupied by another group running its regular schedule', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([
        { id: 'group-x', roomId: 'room-a' },
      ]);
      prisma.lessonCancellation.findMany.mockResolvedValue([]);
      prisma.lessonReschedule.findMany
        // first call: groups that moved AWAY from this date
        .mockResolvedValueOnce([])
        // second call: other reschedules landing on this date
        .mockResolvedValueOnce([]);
      prisma.room.findMany.mockResolvedValue([{ id: 'room-b', name: 'B' }]);

      await service.findAvailableRooms(baseQuery, 1);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['room-a'] },
          }),
        }),
      );
    });

    it('treats a cancelled lesson on that date as freeing the room', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([
        { id: 'group-x', roomId: 'room-a' },
      ]);
      prisma.lessonCancellation.findMany.mockResolvedValue([
        { groupId: 'group-x' },
      ]);
      prisma.lessonReschedule.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.room.findMany.mockResolvedValue([
        { id: 'room-a', name: 'A' },
        { id: 'room-b', name: 'B' },
      ]);

      await service.findAvailableRooms(baseQuery, 1);

      // room-a is NOT in busy set because group-x's lesson was cancelled
      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ id: expect.anything() }),
        }),
      );
    });

    it('treats a group rescheduled AWAY from this date as freeing the room', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([
        { id: 'group-x', roomId: 'room-a' },
      ]);
      prisma.lessonCancellation.findMany.mockResolvedValue([]);
      prisma.lessonReschedule.findMany
        .mockResolvedValueOnce([{ groupId: 'group-x' }])
        .mockResolvedValueOnce([]);
      prisma.room.findMany.mockResolvedValue([{ id: 'room-a', name: 'A' }]);

      await service.findAvailableRooms(baseQuery, 1);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ id: expect.anything() }),
        }),
      );
    });

    it('marks a room busy when another reschedule lands on this date in it', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([]); // no candidate conflicts → skips cancelled/movedAway lookups
      prisma.lessonReschedule.findMany.mockResolvedValue([
        {
          newRoomId: 'room-a',
          newLessonStartTime: '10:30',
          newLessonEndTime: '12:00',
          group: {
            roomId: 'room-z',
            lessonStartTime: '08:00',
            lessonEndTime: '09:30',
          },
        },
      ]);
      prisma.room.findMany.mockResolvedValue([{ id: 'room-b', name: 'B' }]);

      await service.findAvailableRooms(baseQuery, 1);

      // overlaps 10:30–12:00 vs 10:00–11:30 → room-a busy
      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: ['room-a'] } }),
        }),
      );
    });

    it('falls back to the source group default room/time when reschedule has no override', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([]);
      prisma.lessonReschedule.findMany.mockResolvedValue([
        {
          newRoomId: null,
          newLessonStartTime: null,
          newLessonEndTime: null,
          group: {
            roomId: 'room-c',
            lessonStartTime: '11:00',
            lessonEndTime: '12:30',
          },
        },
      ]);
      prisma.room.findMany.mockResolvedValue([]);

      await service.findAvailableRooms(baseQuery, 1);

      // 11:00–12:30 overlaps 10:00–11:30 → room-c busy
      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: ['room-c'] } }),
        }),
      );
    });
  });

  describe('update', () => {
    const existingReschedule = {
      id: 'rs-1',
      groupId: 'group-1',
      originalDate: new Date('2026-04-15T00:00:00.000Z'),
      newDate: new Date('2026-04-22T00:00:00.000Z'),
      newRoomId: null,
      newLessonStartTime: null,
      newLessonEndTime: null,
    };
    const groupRow = {
      id: 'group-1',
      branchId: 7,
      roomId: 'room-default',
      lessonStartTime: '10:00',
      lessonEndTime: '11:30',
    };

    it('throws NotFoundException when reschedule is missing', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue(null);
      await expect(
        service.update('rs-missing', { reason: 'x' }, 1, 99),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects newDate that is on or before originalDate', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue(existingReschedule);
      tx.group.findFirst.mockResolvedValue(groupRow);
      await expect(
        service.update('rs-1', { newDate: '2026-04-15' }, 1, 99),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when only one of start/end times is provided', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue(existingReschedule);
      tx.group.findFirst.mockResolvedValue(groupRow);
      await expect(
        service.update('rs-1', { newLessonStartTime: '12:00' }, 1, 99),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an end time that is not after start time', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue(existingReschedule);
      tx.group.findFirst.mockResolvedValue(groupRow);
      await expect(
        service.update(
          'rs-1',
          { newLessonStartTime: '12:00', newLessonEndTime: '11:00' },
          1,
          99,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the new date already has a different reschedule', async () => {
      tx.lessonReschedule.findFirst
        .mockResolvedValueOnce(existingReschedule) // initial load
        .mockResolvedValueOnce({ id: 'rs-other' }); // duplicate destination
      tx.group.findFirst.mockResolvedValue(groupRow);
      await expect(
        service.update('rs-1', { newDate: '2026-04-29' }, 1, 99),
      ).rejects.toThrow(/Yangi sanada boshqa/);
    });

    it('rejects when the new date is a cancelled lesson', async () => {
      tx.lessonReschedule.findFirst
        .mockResolvedValueOnce(existingReschedule)
        .mockResolvedValueOnce(null); // no duplicate destination
      tx.group.findFirst.mockResolvedValue(groupRow);
      tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'cancel-1' });
      await expect(
        service.update('rs-1', { newDate: '2026-04-29' }, 1, 99),
      ).rejects.toThrow(/bekor qilingan/);
    });

    it('rejects an unknown room override', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue(existingReschedule);
      tx.group.findFirst.mockResolvedValue(groupRow);
      tx.room.findFirst.mockResolvedValue(null);
      await expect(
        service.update('rs-1', { newRoomId: 'room-x' }, 1, 99),
      ).rejects.toThrow(/xona/);
    });

    it('updates only the fields named in the dto', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue(existingReschedule);
      tx.group.findFirst.mockResolvedValue(groupRow);
      tx.room.findFirst.mockResolvedValue({ id: 'room-x' });
      tx.group.findMany.mockResolvedValue([]); // no schedule conflicts
      tx.lessonReschedule.findMany.mockResolvedValue([]); // no other reschedules
      tx.lessonReschedule.update.mockResolvedValue({ id: 'rs-1' });

      await service.update(
        'rs-1',
        { newRoomId: 'room-x', reason: 'updated note' },
        1,
        // A real caller id: the branch guard resolves the acting user, and an
        // unidentified one is refused on purpose (fail-closed).
        99,
      );

      const updateArgs = tx.lessonReschedule.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'rs-1' });
      expect(updateArgs.data.newRoom).toEqual({ connect: { id: 'room-x' } });
      expect(updateArgs.data.reason).toBe('updated note');
      // Fields not in the dto must not appear in the update payload
      expect(updateArgs.data.newDate).toBeUndefined();
      expect(updateArgs.data.newLessonStartTime).toBeUndefined();
    });

    it('clears the room override when newRoomId is explicitly null', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue({
        ...existingReschedule,
        newRoomId: 'room-x',
      });
      tx.group.findFirst.mockResolvedValue(groupRow);
      tx.group.findMany.mockResolvedValue([]);
      tx.lessonReschedule.findMany.mockResolvedValue([]);
      tx.lessonReschedule.update.mockResolvedValue({ id: 'rs-1' });

      await service.update('rs-1', { newRoomId: null }, 1, 99);

      const updateArgs = tx.lessonReschedule.update.mock.calls[0][0];
      expect(updateArgs.data.newRoom).toEqual({ disconnect: true });
    });

    // The make-up lesson (04-22, 10:00 by the group's default) is the answer
    // to a «Dars bo'ldimi?» question: `unmarkedLesson.findFirst` finds it.
    describe("the make-up lesson of a «Dars bo'ldimi?» answer", () => {
      beforeEach(() => {
        tx.lessonReschedule.findFirst
          .mockResolvedValueOnce(existingReschedule) // initial load
          .mockResolvedValue(null); // no duplicate destination
        tx.group.findFirst.mockResolvedValue(groupRow);
        tx.group.findMany.mockResolvedValue([]); // no schedule conflicts
        tx.lessonReschedule.update.mockResolvedValue({ id: 'rs-1' });
        tx.unmarkedLesson.findFirst.mockResolvedValue({ id: 'u1' });
      });
      afterEach(() => jest.useRealTimers());

      it('refuses to move it into the past', async () => {
        // 2026-04-23 14:00 Tashkent — 04-16 is behind us.
        jest.useFakeTimers({
          now: new Date('2026-04-23T09:00:00.000Z'),
          advanceTimers: true,
        });

        await expect(
          service.update('rs-1', { newDate: '2026-04-16' }, 1, 99),
        ).rejects.toThrow("Qo'shimcha dars hali boshlanmagan bo'lishi kerak");
        expect(tx.lessonReschedule.update).not.toHaveBeenCalled();
      });

      it('refuses to move its start time behind now', async () => {
        // The lesson day itself, 14:00 Tashkent; 11:00 has already passed.
        jest.useFakeTimers({
          now: new Date('2026-04-22T09:00:00.000Z'),
          advanceTimers: true,
        });

        await expect(
          service.update(
            'rs-1',
            { newLessonStartTime: '11:00', newLessonEndTime: '12:00' },
            1,
            99,
          ),
        ).rejects.toThrow("Qo'shimcha dars hali boshlanmagan bo'lishi kerak");
      });

      it('lets the reason be edited after the make-up lesson has started', async () => {
        // 14:00 Tashkent on the lesson day: the 10:00 lesson has started.
        jest.useFakeTimers({
          now: new Date('2026-04-22T09:00:00.000Z'),
          advanceTimers: true,
        });

        await service.update('rs-1', { reason: 'Izoh tuzatildi' }, 1, 99);

        expect(tx.lessonReschedule.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ reason: 'Izoh tuzatildi' }),
          }),
        );
      });
    });
  });

  describe('create — override cascade on originalDate', () => {
    const baseDto = {
      groupId: 'group-1',
      originalDate: '2026-04-15',
      newDate: '2026-04-22',
    };

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 7,
        name: 'A1',
        exactDays: ['wednesday'],
        roomId: null,
        lessonStartTime: null,
        lessonEndTime: null,
      });
      tx.lessonReschedule.findFirst.mockResolvedValue(null); // no duplicate origin / destination
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonReschedule.create = jest
        .fn()
        .mockResolvedValue({ id: 'rs-1', groupId: 'group-1' });
      tx.attendance.findMany.mockResolvedValue([]);
    });

    it('soft-deletes any active override on the originalDate', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue({
        id: 'override-1',
        teacherIds: [10042],
      });

      await service.create(baseDto, 1, 99);

      expect(tx.lessonTeacherOverride.update).toHaveBeenCalledWith({
        where: { id: 'override-1' },
        data: expect.objectContaining({ deletedById: 99 }),
      });
    });

    it('records group history with the cascade marker', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue({
        id: 'override-1',
        teacherIds: [10042],
      });

      await service.create(baseDto, 1, 99);

      const history = (service as any).entityHistoryService;
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          newValues: expect.objectContaining({ orinbosarBekorQilindi: 'ha' }),
        }),
      );
    });

    it('does not touch override when none exists', async () => {
      tx.lessonTeacherOverride.findFirst.mockResolvedValue(null);

      await service.create(baseDto, 1, 99);

      expect(tx.lessonTeacherOverride.update).not.toHaveBeenCalled();
    });
  });

  describe("create — «Dars bo'ldimi?» (ADR-0054)", () => {
    const dto = {
      groupId: 'group-1',
      originalDate: '2026-04-15',
      newDate: '2026-04-22',
      reason: 'Ustoz kasal',
    };
    const pending = {
      id: 'u1',
      companyId: 1,
      branchId: 7,
      groupId: 'group-1',
      date: new Date('2026-04-15T00:00:00.000Z'),
      lessonStartTime: '16:00',
      lessonEndTime: '17:30',
      status: 'PENDING',
      taskCommentId: null,
    };

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 7,
        name: 'A1',
        exactDays: ['wednesday'],
        roomId: null,
        lessonStartTime: null,
        lessonEndTime: null,
      });
      tx.lessonReschedule.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonReschedule.create = jest
        .fn()
        .mockResolvedValue({ id: 'rs-1', groupId: 'group-1' });
      jest.useFakeTimers({
        now: new Date('2026-04-16T09:00:00.000Z'),
        advanceTimers: true,
      });
    });
    afterEach(() => jest.useRealTimers());

    it('answers a lesson waiting for an answer as moved and tells the group', async () => {
      tx.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await service.create(dto, 1, 99);
      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESCHEDULED',
            rescheduleId: 'rs-1',
          }),
        }),
      );
      expect(emitter.emit).toHaveBeenCalledWith(
        'unmarked-lesson.not-held',
        expect.objectContaining({
          outcome: 'RESCHEDULED',
          newDate: '2026-04-22',
          reason: 'Ustoz kasal',
          groupName: 'A1',
        }),
      );
    });

    it('refuses a make-up lesson that has already passed', async () => {
      jest.setSystemTime(new Date('2026-04-23T09:00:00.000Z'));
      tx.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await expect(service.create(dto, 1, 99)).rejects.toThrow(
        "Qo'shimcha dars hali boshlanmagan bo'lishi kerak",
      );
    });

    it('leaves an ordinary reschedule alone', async () => {
      await service.create(dto, 1, 99);
      expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalledWith(
        'unmarked-lesson.not-held',
        expect.anything(),
      );
    });
  });

  describe("remove — re-asking «Dars bo'ldimi?»", () => {
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
      status: 'RESCHEDULED',
      rescheduleId: 'rs-1',
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW, advanceTimers: true });
      prisma.lessonReschedule.findFirst.mockResolvedValue({
        id: 'rs-1',
        groupId: 'group-1',
        originalDate: new Date('2026-04-15T00:00:00.000Z'),
        newDate: new Date('2026-10-07T00:00:00.000Z'),
      });
      // The caller-may-touch-group check, then the holiday lookup's branch.
      prisma.group.findFirst.mockResolvedValue({ branchId: 2 });
      prisma.group.findUnique.mockResolvedValue({ branchId: 2 });
      tx.lessonReschedule.update.mockResolvedValue({ id: 'rs-1' });
      tx.unmarkedLesson.findFirst.mockResolvedValue(answered);
      tx.group.findUnique.mockResolvedValue({ name: '#014', deletedAt: null });
      tx.user.findMany.mockResolvedValue([{ id: 3 }]);
      tx.comment.create.mockResolvedValue({ id: 'c2' });
    });
    afterEach(() => jest.useRealTimers());

    it('re-asks the question of a lesson whose move is deleted', async () => {
      await service.remove('rs-1', 1, 99, ['CEO']);

      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            rescheduleId: null,
            taskCommentId: 'c2',
          }),
        }),
      );
    });

    // The set is read for the GROUP's branch, from today on, before the
    // transaction opens — a holiday read is not something the Serializable
    // transaction should wait on.
    it('skips the branch holidays when it sets the new due date', async () => {
      // Thursday 01.10 is a holiday, so the task moves to Friday 02.10 10:00.
      prisma.holiday.findMany.mockResolvedValue([
        {
          date: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-01T00:00:00.000Z'),
        },
      ]);

      await service.remove('rs-1', 1, 99, ['CEO']);

      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ branchId: null }, { branchId: 2 }],
          }),
        }),
      );
      expect(prisma.holiday.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
      expect(tx.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDate: new Date('2026-10-02T05:00:00.000Z'),
          }),
        }),
      );
    });

    // `reopenAfterRescheduleRemoved` reads, then creates an UnmarkedLesson row
    // that the Serializable lesson-end sweep also writes.
    it('runs the transaction Serializable, like create and update', async () => {
      await service.remove('rs-1', 1, 99, ['CEO']);

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
    });
  });
});
