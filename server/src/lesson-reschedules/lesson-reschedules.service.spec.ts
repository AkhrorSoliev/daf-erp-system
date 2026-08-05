import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { PrismaService } from '../prisma/prisma.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LessonReschedulesService', () => {
  let service: LessonReschedulesService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      group: { findFirst: jest.fn(), findMany: jest.fn() },
      room: { findFirst: jest.fn(), findMany: jest.fn() },
      lessonCancellation: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
    };
    prisma = {
      group: { findFirst: jest.fn(), findMany: jest.fn() },
      room: { findMany: jest.fn() },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
        null
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
});
