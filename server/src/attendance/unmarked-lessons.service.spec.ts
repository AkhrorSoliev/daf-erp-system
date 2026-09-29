import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UnmarkedLessonsService } from './unmarked-lessons.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonCancellationsService } from '../lesson-cancellations/lesson-cancellations.service';
import { LessonReschedulesService } from '../lesson-reschedules/lesson-reschedules.service';

// 2026-09-30 (Wednesday) 18:00 Tashkent
const NOW = new Date('2026-09-30T13:00:00.000Z');
const today = new Date('2026-09-30T00:00:00.000Z');

const group = (id: string, name: string, branchId = 2) => ({
  id,
  name,
  companyId: 1,
  branchId,
  exactDays: ['wednesday'],
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  startDate: null,
  endDate: null,
});

describe('UnmarkedLessonsService', () => {
  let service: UnmarkedLessonsService;
  let prisma: any;
  let tx: any;
  let holidays: any;
  let cancellations: { create: jest.Mock };
  let reschedules: { create: jest.Mock };

  beforeEach(async () => {
    tx = {
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
      comment: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    prisma = {
      group: {
        findMany: jest.fn().mockResolvedValue([group('g1', '#014')]),
      },
      lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      unmarkedLesson: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    holidays = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
    };
    cancellations = { create: jest.fn().mockResolvedValue({ id: 'x1' }) };
    reschedules = { create: jest.fn().mockResolvedValue({ id: 'r1' }) };

    const module = await Test.createTestingModule({
      providers: [
        UnmarkedLessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HolidaysService, useValue: holidays },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn() },
        },
        { provide: LessonCancellationsService, useValue: cancellations },
        { provide: LessonReschedulesService, useValue: reschedules },
      ],
    }).compile();
    service = module.get(UnmarkedLessonsService);
  });

  describe('openForEndedLessons', () => {
    it('opens a question and a task for an ended, unmarked lesson', async () => {
      const opened = await service.openForEndedLessons(NOW);
      expect(opened).toEqual([
        expect.objectContaining({
          groupId: 'g1',
          date: '2026-09-30',
          startTime: '16:00',
          endTime: '17:30',
        }),
      ]);
      expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
        data: {
          companyId: 1,
          branchId: 2,
          groupId: 'g1',
          date: today,
          lessonStartTime: '16:00',
          lessonEndTime: '17:30',
          taskCommentId: 'c1',
        },
      });
      expect(
        tx.comment.create.mock.calls[0][0].data.dueDate.toISOString(),
      ).toBe('2026-10-01T05:00:00.000Z');
    });

    it('opens nothing for a lesson already marked', async () => {
      tx.attendance.findFirst.mockResolvedValue({ id: 'a1' });
      expect(await service.openForEndedLessons(NOW)).toEqual([]);
      expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
    });

    it('opens nothing twice', async () => {
      prisma.unmarkedLesson.findMany.mockResolvedValue([{ groupId: 'g1' }]);
      expect(await service.openForEndedLessons(NOW)).toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('opens nothing on a branch holiday', async () => {
      holidays.findActiveHolidayCovering.mockResolvedValue({ name: 'Bayram' });
      expect(await service.openForEndedLessons(NOW)).toEqual([]);
    });

    it('keeps going when one lesson fails', async () => {
      prisma.group.findMany.mockResolvedValue([
        group('g1', '#014'),
        group('g2', '#015'),
      ]);
      prisma.$transaction
        .mockImplementationOnce(() => Promise.reject(new Error('P2034')))
        .mockImplementation((cb: any) => cb(tx));
      expect(await service.openForEndedLessons(NOW)).toEqual([
        expect.objectContaining({ groupId: 'g2' }),
      ]);
    });

    it("skips each lesson's own branch holidays when it sets the due date", async () => {
      prisma.group.findMany.mockResolvedValue([
        group('g1', '#014', 2),
        group('g2', '#015', 3),
      ]);
      // Only branch 2 is closed tomorrow (Thursday 2026-10-01).
      holidays.buildHolidayDateSet.mockImplementation(
        (_start: Date, _end: Date, branchId?: number) =>
          Promise.resolve(
            new Set(branchId === 2 ? ['2026-10-01'] : ([] as string[])),
          ),
      );

      await service.openForEndedLessons(NOW);

      const dueOf = (groupId: string) =>
        tx.comment.create.mock.calls
          .find((c: any) => c[0].data.entityId === groupId)[0]
          .data.dueDate.toISOString();
      expect(dueOf('g1')).toBe('2026-10-02T05:00:00.000Z');
      expect(dueOf('g2')).toBe('2026-10-01T05:00:00.000Z');
      // One lookup per branch, 90 days ahead (a holiday lasts at most 60).
      const lookahead = new Date('2026-12-29T00:00:00.000Z');
      expect(holidays.buildHolidayDateSet).toHaveBeenCalledTimes(2);
      expect(holidays.buildHolidayDateSet).toHaveBeenCalledWith(
        today,
        lookahead,
        2,
      );
      expect(holidays.buildHolidayDateSet).toHaveBeenCalledWith(
        today,
        lookahead,
        3,
      );
    });
  });

  describe('answerNotHeld', () => {
    const pending = {
      id: 'u1',
      companyId: 1,
      status: 'PENDING',
      claimedById: null,
    };

    it('cancels through the cancellation service', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await service.answerNotHeld({
        groupId: 'g1',
        date: '2026-09-28',
        userId: 3,
        roles: ['Administrator'],
        companyId: 1,
        dto: { reason: 'Ustoz kasal', action: 'CANCEL' },
      });
      expect(cancellations.create).toHaveBeenCalledWith(
        { groupId: 'g1', date: '2026-09-28', reason: 'Ustoz kasal' },
        1,
        3,
        ['Administrator'],
      );
    });

    it('moves through the reschedule service', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await service.answerNotHeld({
        groupId: 'g1',
        date: '2026-09-28',
        userId: 3,
        roles: ['Administrator'],
        companyId: 1,
        dto: {
          reason: 'Ustoz kasal',
          action: 'RESCHEDULE',
          newDate: '2026-10-02',
          newLessonStartTime: '10:00',
          newLessonEndTime: '11:30',
        },
      });
      expect(reschedules.create).toHaveBeenCalledWith(
        {
          groupId: 'g1',
          originalDate: '2026-09-28',
          newDate: '2026-10-02',
          newLessonStartTime: '10:00',
          newLessonEndTime: '11:30',
          newRoomId: undefined,
          reason: 'Ustoz kasal',
        },
        1,
        3,
        ['Administrator'],
      );
    });

    it('404s for a lesson not waiting for an answer', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({
        ...pending,
        status: 'HELD',
      });
      await expect(
        service.answerNotHeld({
          groupId: 'g1',
          date: '2026-09-28',
          userId: 3,
          roles: ['Administrator'],
          companyId: 1,
          dto: { reason: 'x', action: 'CANCEL' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('stops an administrator when another holds the task', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({
        ...pending,
        claimedById: 4,
      });
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Ali',
        lastName: 'Valiyev',
      });
      await expect(
        service.answerNotHeld({
          groupId: 'g1',
          date: '2026-09-28',
          userId: 3,
          roles: ['Administrator'],
          companyId: 1,
          dto: { reason: 'x', action: 'CANCEL' },
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
