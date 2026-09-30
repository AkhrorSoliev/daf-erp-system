import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceService } from './attendance.service';
import { AttendanceValidationService } from './attendance-validation.service';
import { SettingsService } from '../settings/settings.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceStatsService } from './attendance-stats.service';
import { AttendanceSaveService } from './attendance-save.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import type { SaveAttendanceDto } from './dto/save-attendance.dto';
import {
  ENDED_REFUSAL,
  lessonHasEnded,
  tashkentClock,
} from './shared/attendance-window';

/** An ended lesson, as a teacher-only caller reads it (CEO, texts item 4). */
const TEACHER_ENDED =
  "Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini administrator belgilaydi.";

const mockGroup = {
  id: 'group-uuid-1',
  name: 'Deutsch A1-1',
  exactDays: ['monday', 'wednesday', 'friday'],
  startDate: new Date('2026-03-01'),
  endDate: new Date('2026-06-30'),
  statusEnum: 'ACTIVE',
  companyId: 1,
  lessonStartTime: '09:00',
  lessonEndTime: '11:00',
  scheduleSnapshots: [],
  _count: { enrollments: 2 },
  course: { price: 800000, lessonPaymentCount: 12 },
};

// Both students have balances above the per-lesson threshold (800000/12 ≈
// 66,667), so neither is a debtor — keeps the existing assertions on the
// "all students appear in the active list" path stable.
const mockEnrollments = [
  {
    studentId: 10001,
    status: 'ACTIVE',
    startDate: null,
    statusChangedAt: null,
    student: {
      id: 10001,
      firstName: 'Ahmad',
      lastName: 'Karimov',
      photo: null,
      balance: 500000,
    },
  },
  {
    studentId: 10002,
    status: 'ACTIVE',
    startDate: null,
    statusChangedAt: null,
    student: {
      id: 10002,
      firstName: 'Dilnoza',
      lastName: 'Rashidova',
      photo: null,
      balance: 100000,
    },
  },
];

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;
  let entityHistoryService: any;
  let eventEmitter: { emit: jest.Mock };
  let holidaysService: any;
  let admission: { forLesson: jest.Mock };
  let settings: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      // systemStartDate floor lookup — default null = no floor (legacy behaviour).
      company: {
        findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue(mockGroup),
        findUnique: jest.fn().mockResolvedValue({
          id: 'group-uuid-1',
          branchId: 1,
          course: { price: 800000, lessonPaymentCount: 12 },
          teachers: [{ teacherId: 20001 }],
        }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      lessonCancellation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      lessonReschedule: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      lessonTeacherOverride: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      // Oldindan belgilash (pre-mark) — default empty so existing getByDate /
      // save tests are unaffected.
      plannedAbsence: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // «Dars bo'ldimi?» — a question asked for the lesson closes new registers.
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(null),
        // The group calendar draws the question on each asked lesson.
        findMany: jest.fn().mockResolvedValue([]),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue(mockEnrollments),
      },
      contract: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Interactive transaction: callback gets prisma itself as tx
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };

    // Contract 3.2 admission (ADR-0047): nobody blocked unless a test says so.
    admission = { forLesson: jest.fn().mockResolvedValue(new Map()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        AttendanceValidationService,
        {
          provide: SettingsService,
          // The default lead (ADR-0047); a test that moves it says so.
          useValue: (settings = { get: jest.fn().mockResolvedValue(10) }),
        },
        AttendanceReadService,
        AttendanceStatsService,
        AttendanceSaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: LessonAdmissionService, useValue: admission },
        {
          provide: LessonBillingService,
          useValue: { processAttendanceBilling: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: (eventEmitter = { emit: jest.fn() }),
        },
        {
          provide: require('../holidays/holidays.service').HolidaysService,
          useValue: holidaysService,
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('validateLessonDate', () => {
    it('should throw BadRequestException for invalid date format', async () => {
      await expect(
        service.validateLessonDate('group-uuid-1', 'not-a-date'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.validateLessonDate('group-uuid-1', '20260401'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.validateLessonDate('group-uuid-1', '2026-13-45'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.validateLessonDate('non-existent', '2026-04-01'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is not ACTIVE', async () => {
      prisma.group.findFirst.mockResolvedValue({
        ...mockGroup,
        statusEnum: 'FORMING',
      });

      await expect(
        service.validateLessonDate('group-uuid-1', '2026-04-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is before group startDate', async () => {
      await expect(
        service.validateLessonDate('group-uuid-1', '2026-02-15'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is after group endDate', async () => {
      await expect(
        service.validateLessonDate('group-uuid-1', '2026-07-15'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is not a scheduled lesson day', async () => {
      // 2026-04-02 is Thursday — not in [monday, wednesday, friday]
      await expect(
        service.validateLessonDate('group-uuid-1', '2026-04-02'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is a holiday', async () => {
      holidaysService.findActiveHolidayCovering.mockResolvedValue({
        id: 'h-1',
        name: "Navro'z",
        date: new Date('2026-04-01'),
        endDate: new Date('2026-04-01'),
      });

      // 2026-04-01 is Wednesday — a scheduled day but a holiday
      await expect(
        service.validateLessonDate('group-uuid-1', '2026-04-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it("looks for a holiday of the group's own branch only", async () => {
      // A holiday closes its own branch's lessons, not every branch's.
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, branchId: 2 });

      await service.validateLessonDate('group-uuid-1', '2026-04-01');

      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        new Date('2026-04-01T00:00:00.000Z'),
        2,
      );
    });

    it('should throw NotFoundException when companyId does not match', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.validateLessonDate('group-uuid-1', '2026-04-01', 999),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 999 }),
        }),
      );
    });

    it('should pass validation for a valid lesson date', async () => {
      // 2026-04-01 is Wednesday — scheduled day, within range, no holiday
      const result = await service.validateLessonDate(
        'group-uuid-1',
        '2026-04-01',
      );

      expect(result.group.id).toBe('group-uuid-1');
      expect(result.parsedDate).toEqual(new Date('2026-04-01T00:00:00.000Z'));
    });

    describe('no clock here (ADR-0054)', () => {
      const validation = () =>
        (service as unknown as { validation: AttendanceValidationService })
          .validation;

      it('validateLessonDate no longer looks at the clock and returns the times', async () => {
        const result = await service.validateLessonDate(
          'group-uuid-1',
          '2026-04-01',
        );
        expect(result.effectiveStartTime).toBe('09:00');
        expect(result.effectiveEndTime).toBe('11:00');
        expect(result.opensMinutesBefore).toBe(10);
      });

      it('a moved lesson carries its own times', async () => {
        prisma.lessonReschedule.findFirst.mockResolvedValue({
          originalDate: new Date('2026-03-30T00:00:00.000Z'),
          newDate: new Date('2026-04-02T00:00:00.000Z'),
          newLessonStartTime: '14:00',
          newLessonEndTime: '15:30',
        });
        const result = await service.validateLessonDate(
          'group-uuid-1',
          '2026-04-02',
        );
        expect(result.effectiveStartTime).toBe('14:00');
        expect(result.effectiveEndTime).toBe('15:30');
      });

      it('assertLessonNotEnded allows a future lesson and refuses an ended one', () => {
        // mockGroup: Wednesday 2026-04-01, 09:00–11:00 Tashkent (04:00–06:00Z).
        const lesson = { lessonDay: '2026-04-01', endTime: '11:00' };
        expect(() =>
          validation().assertLessonNotEnded(
            lesson,
            new Date('2026-03-31T10:00:00Z'),
          ),
        ).not.toThrow();
        expect(() =>
          validation().assertLessonNotEnded(
            lesson,
            new Date('2026-04-01T07:00:00Z'),
          ),
        ).toThrow("Dars tugagan — kelmaslikni oldindan belgilab bo'lmaydi");
      });

      // Pre-marks stop on the new-register window's boundary.
      it('lets a pre-mark in during the lesson, not from its end minute', () => {
        const lesson = { lessonDay: '2026-04-01', endTime: '11:00' };
        const at = (iso: string) => () =>
          validation().assertLessonNotEnded(lesson, new Date(iso));
        expect(at('2026-04-01T05:00:00Z')).not.toThrow(); // 10:00, running
        expect(at('2026-04-01T05:59:59Z')).not.toThrow(); // 10:59:59
        expect(at('2026-04-01T06:00:00Z')).toThrow('Dars tugagan'); // 11:00
      });

      it('ends a group without times at 23:00', () => {
        const lesson = { lessonDay: '2026-04-01', endTime: null };
        const at = (iso: string) => () =>
          validation().assertLessonNotEnded(lesson, new Date(iso));
        expect(at('2026-04-01T17:59:00Z')).not.toThrow(); // 22:59
        expect(at('2026-04-01T18:00:00Z')).toThrow('Dars tugagan'); // 23:00
      });
    });
  });

  describe('getLessonDates', () => {
    it('should return lesson dates for a month', async () => {
      // April 2026: Dushanba=6,13,20,27; Chorshanba=1,8,15,22,29; Juma=3,10,17,24
      const result = await service.getLessonDates('group-uuid-1', 4, 2026);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-uuid-1', deletedAt: null },
        }),
      );
      expect(result.length).toBeGreaterThan(0);
      // All returned dates should be Mon(1), Wed(3), or Fri(5)
      for (const item of result) {
        expect(['Dushanba', 'Chorshanba', 'Juma']).toContain(item.dayName); // monday=Dushanba, wednesday=Chorshanba, friday=Juma
      }
    });

    it('should pass companyId to group query', async () => {
      await service.getLessonDates('group-uuid-1', 4, 2026, 1);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1 }),
        }),
      );
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getLessonDates('non-existent', 4, 2026),
      ).rejects.toThrow(NotFoundException);
    });

    it('should exclude holidays', async () => {
      holidaysService.buildHolidayDateSet.mockResolvedValue(
        new Set(['2026-04-01']),
      );

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);
      const dates = result.map((r) => r.date);
      expect(dates).not.toContain('2026-04-01');
    });

    it('drops a date that has been rescheduled away (originalDate)', async () => {
      prisma.lessonReschedule.findMany.mockResolvedValue([
        {
          originalDate: new Date('2026-04-01T00:00:00Z'),
          newDate: new Date('2026-04-04T00:00:00Z'),
        },
      ]);

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);
      const dates = result.map((r) => r.date);
      // 2026-04-01 (Wed) was a regular lesson day; lesson moved to 2026-04-04 (Sat)
      expect(dates).not.toContain('2026-04-01');
      // 2026-04-04 is a Saturday — outside exactDays — but reschedule lands here
      expect(dates).toContain('2026-04-04');
    });

    it('drops a date that has an active cancellation', async () => {
      prisma.lessonCancellation.findMany.mockResolvedValue([
        { date: new Date('2026-04-01T00:00:00Z') },
      ]);

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);
      expect(result.map((r) => r.date)).not.toContain('2026-04-01');
    });

    it('should return empty array when group has no exactDays', async () => {
      prisma.group.findFirst.mockResolvedValue({
        ...mockGroup,
        exactDays: [],
      });

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);
      expect(result).toEqual([]);
    });

    it('should include attendance summary when records exist', async () => {
      prisma.attendance.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          _count: 8,
        },
        {
          date: new Date('2026-04-01'),
          status: 'ABSENT',
          _count: 2,
        },
      ]);

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);
      const apr1 = result.find((r) => r.date === '2026-04-01');
      if (apr1) {
        expect(apr1.hasAttendance).toBe(true);
        expect(apr1.presentCount).toBe(8);
        expect(apr1.absentCount).toBe(2);
      }
    });

    it('surfaces attendance taken under an old schedule after a schedule change', async () => {
      // Group #005 production bug: schedule changed to Mon/Wed/Fri on Jun 2,
      // but May lessons were actually held Tue/Thu/Sat. The single snapshot
      // (validFrom Jun 2) means May predates all snapshots → resolver returns
      // null → May rows must come from actual attendance, not the new schedule.
      prisma.group.findFirst.mockResolvedValue({
        ...mockGroup,
        exactDays: ['friday', 'monday', 'wednesday'],
        startDate: new Date('2026-04-13T19:00:00Z'),
        endDate: new Date('2026-10-13T19:00:00Z'),
        scheduleSnapshots: [
          {
            exactDays: ['friday', 'monday', 'wednesday'],
            validFrom: new Date('2026-06-02T06:07:24Z'),
            validTo: null,
          },
        ],
      });
      // Real May attendance: a Tuesday and a Saturday.
      prisma.attendance.groupBy.mockResolvedValue([
        { date: new Date('2026-05-05'), status: 'PRESENT', _count: 9 }, // Tue
        { date: new Date('2026-05-09'), status: 'PRESENT', _count: 9 }, // Sat
      ]);

      const result = await service.getLessonDates('group-uuid-1', 5, 2026);
      const dates = result.map((r) => r.date);

      // The real lesson days appear and are flagged as attended.
      expect(dates).toContain('2026-05-05');
      expect(dates).toContain('2026-05-09');
      expect(result.find((r) => r.date === '2026-05-05')?.hasAttendance).toBe(
        true,
      );
      // No phantom Mon/Wed/Fri "olinmagan" rows projected from the new schedule.
      expect(
        result.every((r) => ['Seshanba', 'Shanba'].includes(r.dayName)),
      ).toBe(true);
    });
  });

  describe('getLessonCalendar', () => {
    it("carries the «Dars bo'ldimi?» question on the asked lesson's cell", async () => {
      prisma.unmarkedLesson.findMany.mockResolvedValue([
        {
          id: 'u1',
          groupId: 'group-uuid-1',
          date: new Date('2026-04-01T00:00:00.000Z'),
          status: 'PENDING',
          teacherPayExempt: true,
          lessonStartTime: '18:00',
          lessonEndTime: '19:30',
          claimedById: 7,
        },
      ]);
      prisma.user = {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 7, firstName: 'Ali', lastName: 'Valiyev' },
          ]),
      };

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      expect(
        result.cells.find((c) => c.date === '2026-04-01')?.unmarked,
      ).toEqual({
        id: 'u1',
        status: 'PENDING',
        teacherPayExempt: true,
        lessonStartTime: '18:00',
        lessonEndTime: '19:30',
        claimedBy: { id: 7, firstName: 'Ali', lastName: 'Valiyev' },
      });
      expect(
        result.cells.find((c) => c.date === '2026-04-03')?.unmarked,
      ).toBeNull();
    });

    it("a holiday only another branch has does not close this group's lesson day", async () => {
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, branchId: 2 });
      // Like the real service: no branch asks for every branch's holidays;
      // branch 2 has none, branch 1 is closed on 2026-04-01.
      holidaysService.buildHolidayDateSet.mockImplementation(
        (_start: Date, _end: Date, branchId?: number) =>
          Promise.resolve(
            branchId === 2 ? new Set<string>() : new Set(['2026-04-01']),
          ),
      );

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      expect(result.cells.find((c) => c.date === '2026-04-01')?.type).toBe(
        'regular',
      );
      expect(holidaysService.buildHolidayDateSet).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        2,
      );
    });

    it("a holiday of the group's own branch still closes its lesson day", async () => {
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, branchId: 2 });
      holidaysService.buildHolidayDateSet.mockImplementation(
        (_start: Date, _end: Date, branchId?: number) =>
          Promise.resolve(
            branchId === 2 ? new Set(['2026-04-01']) : new Set<string>(),
          ),
      );

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      expect(result.cells.find((c) => c.date === '2026-04-01')).toBeUndefined();
    });

    it('marks regular lesson days with type=regular', async () => {
      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);
      // mockGroup has exactDays Mon/Wed/Fri; April 2026 contains the usual mix
      expect(result.cells.length).toBeGreaterThan(0);
      const apr1 = result.cells.find((c) => c.date === '2026-04-01');
      expect(apr1?.type).toBe('regular');
    });

    it('marks rescheduled-to dates with movedFrom (when newDate is outside exactDays)', async () => {
      // Move Wed Apr 1 → Sat Apr 4 (Saturday is NOT in exactDays).
      prisma.lessonReschedule.findMany.mockResolvedValue([
        {
          originalDate: new Date('2026-04-01T00:00:00Z'),
          newDate: new Date('2026-04-04T00:00:00Z'),
        },
      ]);

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      const movedHere = result.cells.find((c) => c.date === '2026-04-04');
      expect(movedHere?.type).toBe('rescheduledTo');
      expect(movedHere?.movedFrom).toBe('2026-04-01');

      const movedAway = result.cells.find((c) => c.date === '2026-04-01');
      expect(movedAway?.type).toBe('rescheduledFrom');
      expect(movedAway?.movedTo).toBe('2026-04-04');
    });

    it("keeps newDate as 'regular' when it's already a normal lesson day, but stores movedFrom for tooltip", async () => {
      // Move Wed Apr 1 → Wed Apr 8 — Apr 8 is already a regular Wednesday.
      prisma.lessonReschedule.findMany.mockResolvedValue([
        {
          originalDate: new Date('2026-04-01T00:00:00Z'),
          newDate: new Date('2026-04-08T00:00:00Z'),
        },
      ]);

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      const dest = result.cells.find((c) => c.date === '2026-04-08');
      expect(dest?.type).toBe('regular'); // not promoted to rescheduledTo
      expect(dest?.movedFrom).toBe('2026-04-01');

      const src = result.cells.find((c) => c.date === '2026-04-01');
      expect(src?.type).toBe('rescheduledFrom');
    });

    it('marks cancelled dates with type=cancelled and reason', async () => {
      prisma.lessonCancellation.findMany.mockResolvedValue([
        { date: new Date('2026-04-01T00:00:00Z'), reason: 'Bayram' },
      ]);

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      const cancelled = result.cells.find((c) => c.date === '2026-04-01');
      expect(cancelled?.type).toBe('cancelled');
      expect(cancelled?.cancellationReason).toBe('Bayram');
    });

    it('cancellation overrides reschedule on the same date', async () => {
      prisma.lessonReschedule.findMany.mockResolvedValue([
        {
          originalDate: new Date('2026-04-01T00:00:00Z'),
          newDate: new Date('2026-04-04T00:00:00Z'),
        },
      ]);
      prisma.lessonCancellation.findMany.mockResolvedValue([
        { date: new Date('2026-04-01T00:00:00Z'), reason: 'Test' },
      ]);

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      const apr1 = result.cells.find((c) => c.date === '2026-04-01');
      expect(apr1?.type).toBe('cancelled');
    });

    it('merges attendance counts only for live cells (regular/rescheduledTo)', async () => {
      prisma.attendance.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-01T00:00:00Z'),
          status: 'PRESENT',
          _count: 5,
        },
      ]);

      const result = await service.getLessonCalendar('group-uuid-1', 4, 2026);

      const apr1 = result.cells.find((c) => c.date === '2026-04-01');
      expect(apr1?.hasAttendance).toBe(true);
      expect(apr1?.presentCount).toBe(5);
    });

    it('throws NotFoundException when group is missing', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getLessonCalendar('non-existent', 4, 2026),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByDate', () => {
    it("returns the company's lead and each student's admission", async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10002,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ],
        ]),
      );
      const result = await service.getByDate('group-uuid-1', '2026-04-01', 1);
      expect(result.opensMinutesBefore).toBe(10);
      expect(result.activeStudents[0].admission).toEqual({
        admitted: true,
        reason: 'NOT_APPLIED',
        shortfall: 0,
        paidThrough: null,
      });
      expect(result.activeStudents[1].admission).toMatchObject({
        admitted: false,
        shortfall: 69231,
      });
    });

    describe('after the lesson, a student the register left out', () => {
      beforeEach(() => {
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
        });
        // Wednesday 07.10, 09:30 Tashkent: Monday 05.10's lesson has ended.
        jest.setSystemTime(new Date('2026-10-07T04:30:00.000Z'));
      });
      afterEach(() => jest.useRealTimers());
      const row = (markedMethod: string) => ({
        studentId: 10001,
        status: 'PRESENT',
        note: null,
        lateMinutes: null,
        markedMethod,
      });

      it('reads LEFT_OUT, over NOT_PAID too', async () => {
        prisma.attendance.findMany.mockResolvedValue([row('MANUAL')]);
        admission.forLesson.mockResolvedValue(
          new Map([
            [
              10002,
              {
                admitted: false,
                reason: 'NOT_PAID',
                shortfall: 69231,
                paidThrough: null,
              },
            ],
          ]),
        );
        const result = await service.getByDate('group-uuid-1', '2026-10-05', 1);
        expect(result.activeStudents[0].admission.reason).toBe('NOT_APPLIED');
        expect(result.activeStudents[1].admission).toEqual({
          admitted: false,
          reason: 'LEFT_OUT',
          shortfall: 0,
          paidThrough: null,
        });
      });

      it('is not read on a QR-only register, a running lesson or before 01.10', async () => {
        const reasonOn = async (date: string) =>
          (await service.getByDate('group-uuid-1', date, 1)).activeStudents[1]
            .admission.reason;
        prisma.attendance.findMany.mockResolvedValue([row('QR')]);
        expect(await reasonOn('2026-10-05')).toBe('NOT_APPLIED');
        prisma.attendance.findMany.mockResolvedValue([row('MANUAL')]);
        expect(await reasonOn('2026-10-07')).toBe('NOT_APPLIED');
        expect(await reasonOn('2026-09-28')).toBe('NOT_APPLIED');
      });
    });

    it('should return students with attendance status', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          studentId: 10001,
          status: 'PRESENT',
          note: null,
        },
      ]);

      const result = await service.getByDate('group-uuid-1', '2026-04-01', 1);

      // New shape: { activeStudents, debtorStudents, perLessonCost, coursePrice }
      expect(result.activeStudents).toHaveLength(2);
      expect(result.activeStudents[0]).toEqual(
        expect.objectContaining({
          studentId: 10001,
          firstName: 'Ahmad',
          lastName: 'Karimov',
          photo: null,
          status: 'PRESENT',
          note: null,
          isDebtor: false,
        }),
      );
      expect(result.activeStudents[1].status).toBeNull();
      // No debtors in the seed (both balances > perLessonCost = 66,667)
      expect(result.debtorStudents).toEqual([]);
      expect(result.coursePrice).toBe(800000);
    });

    it('pre-fills plannedKind/plannedId for a pending pre-mark (real status stays null)', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.plannedAbsence.findMany.mockResolvedValue([
        {
          id: 'pa-1',
          studentId: 10001,
          kind: 'SABABSIZ',
          note: 'ertalab qo’ng’iroq qildi',
          createdBy: { id: 9, firstName: 'Admin', lastName: 'A' },
        },
      ]);

      const result = await service.getByDate('group-uuid-1', '2026-04-01', 1);

      const s1 = result.activeStudents.find(
        (s: { studentId: number }) => s.studentId === 10001,
      );
      expect(s1).toEqual(
        expect.objectContaining({
          plannedId: 'pa-1',
          plannedKind: 'SABABSIZ',
          plannedNote: 'ertalab qo’ng’iroq qildi',
          status: null, // pre-mark is NOT a real attendance row yet
        }),
      );
      // Students without a pre-mark expose null planned fields.
      const s2 = result.activeStudents.find(
        (s: { studentId: number }) => s.studentId === 10002,
      );
      // Asserted before use: `find` can miss, and a missing student should
      // read as "10002 is not in the roster" rather than a TypeError two
      // lines later.
      expect(s2).toBeDefined();
      expect(s2).toEqual(
        expect.objectContaining({ plannedKind: null, plannedId: null }),
      );
      // Only unconsumed pre-marks are loaded.
      expect(prisma.plannedAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ consumedAt: null }),
        }),
      );
    });

    it('late: lists who was in the group THAT day, not who is in it now', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      // First read is the roster of that day (a student who left since is on
      // it), the second is the register's own enrollment query.
      prisma.enrollment.findMany.mockResolvedValueOnce([
        {
          id: 'e-left',
          studentId: 10001,
          status: 'DROPPED',
          statusChangedAt: new Date('2026-04-05T10:00:00.000Z'),
        },
      ]);

      await service.getByDate(
        'group-uuid-1',
        '2026-04-01',
        1,
        ['Administrator'],
        true,
      );

      expect(prisma.enrollment.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ groupId: 'group-uuid-1' }),
        }),
      );
      expect(prisma.enrollment.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { id: { in: ['e-left'] } } }),
      );
    });

    it("without late, only the group's ACTIVE enrollments are listed", async () => {
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.getByDate('group-uuid-1', '2026-04-01', 1, [
        'Administrator',
      ]);

      expect(prisma.enrollment.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId: 'group-uuid-1',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it("returns the group's lesson times on an ordinary day", async () => {
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getByDate('group-uuid-1', '2026-04-01', 1);

      expect(result.effectiveStartTime).toBe('09:00');
      expect(result.effectiveEndTime).toBe('11:00');
    });

    it("returns a moved day's own times, so the form judges the window like the save", async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      // Group 09:00–11:00, lesson moved to 2026-04-01 at 18:00–19:30.
      prisma.lessonReschedule.findFirst.mockResolvedValue({
        newLessonStartTime: '18:00',
        newLessonEndTime: '19:30',
      });

      const result = await service.getByDate('group-uuid-1', '2026-04-01', 1);

      expect(result.effectiveStartTime).toBe('18:00');
      expect(result.effectiveEndTime).toBe('19:30');
      // Only a move whose NEW date is this day retimes it.
      expect(prisma.lessonReschedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            groupId: 'group-uuid-1',
            deletedAt: null,
            newDate: new Date('2026-04-01T00:00:00.000Z'),
          },
        }),
      );
    });

    it("a move without times of its own keeps the group's", async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.lessonReschedule.findFirst.mockResolvedValue({
        newLessonStartTime: null,
        newLessonEndTime: null,
      });

      const result = await service.getByDate('group-uuid-1', '2026-04-01', 1);

      expect(result.effectiveStartTime).toBe('09:00');
      expect(result.effectiveEndTime).toBe('11:00');
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getByDate('non-existent', '2026-04-01', 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid date format', async () => {
      await expect(
        service.getByDate('group-uuid-1', 'invalid-date', 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass companyId to group query', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.getByDate('group-uuid-1', '2026-04-01', 1);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1 }),
        }),
      );
    });
  });

  describe('save', () => {
    // mockGroup's lesson: Wednesday 2026-04-01, 09:00–11:00 Tashkent. A new
    // register needs its window open (ADR-0054), so the clock sits at 09:30.
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      jest.setSystemTime(new Date('2026-04-01T04:30:00.000Z'));
      prisma.enrollment.findMany.mockResolvedValue(
        mockEnrollments.map((e) => ({
          id: `enr-${e.studentId}`,
          studentId: e.studentId,
          student: {
            firstName: e.student.firstName,
            lastName: e.student.lastName,
          },
        })),
      );
    });
    afterEach(() => jest.useRealTimers());

    const twoPresent: SaveAttendanceDto = {
      entries: [
        { studentId: 10001, status: 'PRESENT' },
        { studentId: 10002, status: 'PRESENT' },
      ],
    };
    // Contract 3.2 (ADR-0047): the students the rule keeps out of the lesson.
    const blocks = (...ids: number[]) =>
      admission.forLesson.mockResolvedValue(
        new Map(
          ids.map((id) => [
            id,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ]),
        ),
      );
    const NOT_PAID =
      "to'lov qilmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi";

    // The lesson-end sweep is a Serializable writer too; losing to it is 409.
    it('answers a transaction conflict with 409, anything else unchanged', async () => {
      const dto: SaveAttendanceDto = {
        entries: [
          { studentId: 10001, status: 'PRESENT' },
          { studentId: 10002, status: 'ABSENT' },
        ],
      };
      prisma.$transaction.mockRejectedValueOnce({
        cause: { code: '40P01' },
      });
      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(ConflictException);

      const boom = new Error('boom');
      prisma.$transaction.mockRejectedValueOnce(boom);
      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toBe(boom);
    });

    it('refuses a CEO after the lesson ends', async () => {
      jest.setSystemTime(new Date('2026-04-01T06:01:00.000Z'));
      await expect(
        service.save('group-uuid-1', '2026-04-01', twoPresent, 1, ['CEO'], 1),
      ).rejects.toThrow('Dars tugagan');
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('refuses an administrator on a past lesson day', async () => {
      await expect(
        service.save(
          'group-uuid-1',
          '2026-03-30',
          twoPresent,
          1,
          ['Administrator'],
          1,
        ),
      ).rejects.toThrow('Dars tugagan');
    });

    it('refuses a teacher before the window opens', async () => {
      jest.setSystemTime(new Date('2026-04-01T03:49:00.000Z'));
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          twoPresent,
          1,
          ['Teacher'],
          1,
        ),
      ).rejects.toThrow('10 daqiqa oldin ochiladi');
    });

    it('refuses a new mark for a student the admission rule blocks', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10002,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ],
        ]),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          twoPresent,
          1,
          ['Teacher'],
          1,
        ),
      ).rejects.toThrow(`Dilnoza Rashidova ${NOT_PAID}`);
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it.each(['PRESENT', 'LATE', 'ABSENT'] as const)(
      'refuses a blocked student marked %s, before anything is written',
      async (status) => {
        blocks(10002);
        await expect(
          service.save(
            'group-uuid-1',
            '2026-04-01',
            {
              entries: [
                { studentId: 10001, status: 'PRESENT' },
                { studentId: 10002, status },
              ],
            },
            1,
            ['Administrator'],
            1,
          ),
        ).rejects.toThrow(`Dilnoza Rashidova ${NOT_PAID}`);
        expect(prisma.attendance.upsert).not.toHaveBeenCalled();
      },
    );

    it("reads the admission inside the save's transaction, over its roster", async () => {
      prisma.attendance.upsert.mockResolvedValue({ id: 'att-1' });
      await service.save(
        'group-uuid-1',
        '2026-04-01',
        twoPresent,
        1,
        ['Administrator'],
        1,
      );
      expect(admission.forLesson).toHaveBeenCalledWith(
        {
          groupId: 'group-uuid-1',
          lessonDay: '2026-04-01',
          studentIds: [10001, 10002],
        },
        prisma, // the transaction client: this spec's $transaction passes prisma
      );
    });

    it('reports an ended lesson as ended, not as unpaid', async () => {
      jest.setSystemTime(new Date('2026-04-01T06:00:00.000Z')); // 11:00, the end
      blocks(10002);
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          twoPresent,
          1,
          ['Administrator'],
          1,
        ),
      ).rejects.toThrow('Dars tugagan');
    });

    it('lets a blocked student be left off the roster', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10002,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ],
        ]),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue({
        id: 'att-1',
        studentId: 10001,
        status: 'PRESENT',
      });
      const result = await service.save(
        'group-uuid-1',
        '2026-04-01',
        { entries: [{ studentId: 10001, status: 'PRESENT' }] },
        1,
        ['Teacher'],
        1,
      );
      expect(result.count).toBe(1);
    });

    it('lets a blocked student be marked EXCUSED', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10002,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ],
        ]),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue({
        id: 'att-2',
        studentId: 10002,
        status: 'EXCUSED',
      });
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          {
            entries: [
              { studentId: 10001, status: 'PRESENT' },
              { studentId: 10002, status: 'EXCUSED' },
            ],
          },
          1,
          ['Administrator'],
          1,
        ),
      ).resolves.toMatchObject({ count: 2 });
    });

    it('does not re-judge an unchanged mark', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10002,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ],
        ]),
      );
      prisma.attendance.findMany.mockResolvedValue([
        { studentId: 10002, status: 'PRESENT', note: null },
      ]);
      prisma.attendance.upsert.mockResolvedValue({
        id: 'att-1',
        studentId: 10001,
        status: 'PRESENT',
      });
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          twoPresent,
          1,
          ['Administrator'],
          1,
        ),
      ).resolves.toMatchObject({ count: 2 });
    });

    it('should save attendance and return success', async () => {
      const mockResults = [
        {
          id: 'att-1',
          groupId: 'group-uuid-1',
          studentId: 10001,
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          note: null,
        },
        {
          id: 'att-2',
          groupId: 'group-uuid-1',
          studentId: 10002,
          date: new Date('2026-04-01'),
          status: 'ABSENT',
          note: null,
        },
      ];

      prisma.enrollment.findMany.mockResolvedValue(
        mockEnrollments.map((e) => ({
          studentId: e.studentId,
          student: { balance: e.student.balance },
        })),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

      const dto: SaveAttendanceDto = {
        entries: [
          { studentId: 10001, status: 'PRESENT' },
          { studentId: 10002, status: 'ABSENT' },
        ],
      };

      // 2026-04-01 is Wednesday — valid lesson day
      const result = await service.save(
        'group-uuid-1',
        '2026-04-01',
        dto,
        1,
        ['CEO'],
        1,
      );

      expect(result.message).toBe('Davomat muvaffaqiyatli saqlandi');
      expect(result.count).toBe(2);
      // Verify markedMethod is MANUAL for manual attendance
      expect(prisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ markedMethod: 'MANUAL' }),
          update: expect.objectContaining({ markedMethod: 'MANUAL' }),
        }),
      );
      expect(entityHistoryService.recordCreate).toHaveBeenCalledTimes(1);
      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'GroupAttendance',
          entityId: 'group-uuid-1',
          newValues: expect.objectContaining({
            action: 'DAVOMAT_OLINDI',
            sana: '2026-04-01',
            jami: 2,
            keldi: 1,
            kelmadi: 1,
          }),
          changedById: 1,
        }),
      );
    });

    it('consumes pending pre-marks on finalize and keeps the teacher unlocked', async () => {
      prisma.enrollment.findMany.mockResolvedValue(
        mockEnrollments.map((e) => ({
          studentId: e.studentId,
          student: { balance: e.student.balance },
        })),
      );
      // No real attendance exists yet — a pre-mark must NOT lock the teacher
      // out (the lock keys off attendance rows, not planned rows).
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.plannedAbsence.findMany.mockResolvedValue([
        { studentId: 10001, kind: 'SABABSIZ', note: null },
      ]);
      prisma.attendance.upsert
        .mockResolvedValueOnce({
          id: 'att-1',
          studentId: 10001,
          status: 'EXCUSED',
          note: null,
        })
        .mockResolvedValueOnce({
          id: 'att-2',
          studentId: 10002,
          status: 'PRESENT',
          note: null,
        });

      const dto: SaveAttendanceDto = {
        entries: [
          { studentId: 10001, status: 'EXCUSED' },
          { studentId: 10002, status: 'PRESENT' },
        ],
      };

      const result = await service.save(
        'group-uuid-1',
        '2026-04-01',
        dto,
        1,
        ['Teacher'],
        1,
      );

      expect(result.message).toBe('Davomat muvaffaqiyatli saqlandi');
      // Pre-marks for the date are stamped consumed.
      expect(prisma.plannedAbsence.updateMany).toHaveBeenCalledWith({
        where: {
          groupId: 'group-uuid-1',
          date: expect.any(Date),
          consumedAt: null,
        },
        data: { consumedAt: expect.any(Date) },
      });
      // EXCUSED row with an empty note gets the "Oldindan" marker written
      // server-side (teachers can't write notes themselves).
      expect(prisma.attendance.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { note: 'Oldindan: sababsiz' },
      });
    });

    it('should throw BadRequestException for unenrolled student', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 99999, status: 'PRESENT' }],
      };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when not all enrolled students have entries', async () => {
      prisma.enrollment.findMany.mockResolvedValue(
        mockEnrollments.map((e) => ({
          studentId: e.studentId,
          student: { balance: e.student.balance },
        })),
      );
      prisma.attendance.findMany.mockResolvedValue([]);

      // Only 1 of 2 enrolled students has an entry
      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(BadRequestException);

      // No upserts must run when validation fails
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('should throw when Teacher submits empty entries with active enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);

      const dto: SaveAttendanceDto = { entries: [] };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['Teacher'], 1),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('should require Teacher to mark debtors (negative-balance students) too', async () => {
      // Two students — one positive, one negative balance. Debtors are now
      // part of the main roster: a teacher must mark every active student,
      // including those who can't afford the lesson. Their unpaid attendance
      // gets settled retroactively when they next top up.
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
        { studentId: 10002, student: { balance: -10000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);

      // Submitting only the positive-balance student must fail — the
      // negative-balance one is now expected as well.
      const partialDto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          partialDto,
          1,
          ['Teacher'],
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();

      // With both students marked, the teacher save succeeds.
      prisma.attendance.upsert
        .mockResolvedValueOnce({
          id: 'att-1',
          groupId: 'group-uuid-1',
          studentId: 10001,
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          note: null,
        })
        .mockResolvedValueOnce({
          id: 'att-2',
          groupId: 'group-uuid-1',
          studentId: 10002,
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          note: null,
        });

      const fullDto: SaveAttendanceDto = {
        entries: [
          { studentId: 10001, status: 'PRESENT' },
          { studentId: 10002, status: 'PRESENT' },
        ],
      };
      const result = await service.save(
        'group-uuid-1',
        '2026-04-01',
        fullDto,
        1,
        ['Teacher'],
        1,
      );

      expect(result.message).toBe('Davomat muvaffaqiyatli saqlandi');
      expect(prisma.attendance.upsert).toHaveBeenCalledTimes(2);
    });

    it('should strip notes from teacher-only users', async () => {
      const mockResult = {
        id: 'att-1',
        groupId: 'group-uuid-1',
        studentId: 10001,
        date: new Date('2026-04-01'),
        status: 'ABSENT',
        note: null,
      };

      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue(mockResult);

      const dto: SaveAttendanceDto = {
        entries: [
          {
            studentId: 10001,
            status: 'ABSENT',
            note: 'Some note that should be stripped',
          },
        ],
      };

      await service.save('group-uuid-1', '2026-04-01', dto, 1, ['Teacher'], 1);

      // Verify upsert was called with note stripped for Teacher
      expect(prisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ note: null }),
        }),
      );
    });

    it('should record update history when attendance already exists', async () => {
      const existingRecords = [
        { id: 'att-1', studentId: 10001, status: 'PRESENT', note: null },
      ];
      const mockResults = [
        {
          id: 'att-1',
          groupId: 'group-uuid-1',
          studentId: 10001,
          date: new Date('2026-04-01'),
          status: 'LATE',
          note: null,
        },
      ];

      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue(existingRecords);
      prisma.attendance.upsert.mockResolvedValue(mockResults[0]);

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'LATE' }],
      };
      await service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1);

      expect(entityHistoryService.recordUpdate).toHaveBeenCalledTimes(1);
      expect(entityHistoryService.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'GroupAttendance',
          entityId: 'group-uuid-1',
          oldValues: expect.objectContaining({
            action: 'DAVOMAT_YANGILANDI',
            sana: '2026-04-01',
            jami: 1,
            keldi: 1,
          }),
          newValues: expect.objectContaining({
            action: 'DAVOMAT_YANGILANDI',
            sana: '2026-04-01',
            jami: 1,
            kechikdi: 1,
          }),
        }),
      );
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };

      await expect(
        service.save('non-existent', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is not ACTIVE', async () => {
      prisma.group.findFirst.mockResolvedValue({
        ...mockGroup,
        statusEnum: 'COMPLETED',
      });

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is a holiday', async () => {
      prisma.holiday.findFirst.mockResolvedValue({ name: "Navro'z" });

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is not a lesson day', async () => {
      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };

      // 2026-04-02 is Thursday — not in schedule
      await expect(
        service.save('group-uuid-1', '2026-04-02', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should lock Teacher from re-submitting after attendance already taken', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      // Existing attendance record for this date — teacher must be blocked
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-existing',
          studentId: 10001,
          status: 'PRESENT',
          note: null,
        },
      ]);

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'ABSENT' }],
      };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['Teacher'], 1),
      ).rejects.toThrow(BadRequestException);

      // Upsert must not run for a locked teacher
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('should refuse a Teacher saving a past lesson, before anything is written', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'PRESENT' }],
      };

      // 2026-03-30 is the Monday before the pinned "today" — a real lesson
      // nobody marked. The new-register window refuses it (ADR-0054); the
      // lesson goes through «Dars bo'ldimi?», which a teacher cannot answer,
      // so the teacher is told who does (CEO, texts item 4).
      await expect(
        service.save('group-uuid-1', '2026-03-30', dto, 1, ['Teacher'], 1),
      ).rejects.toMatchObject({ message: TEACHER_ENDED });

      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('gives a teacher the same text as everyone for a future lesson day', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      // 2026-04-03 is the Friday after the pinned day.
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-03',
          { entries: [{ studentId: 10001, status: 'PRESENT' }] },
          1,
          ['Teacher'],
          1,
        ),
      ).rejects.toMatchObject({
        message:
          'Davomat faqat dars kuni olinadi. Kelmaydiganlarni «Oldindan belgilash» bilan belgilang',
      });
    });

    it('should allow Admin to edit attendance even after it was taken', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-existing',
          studentId: 10001,
          status: 'PRESENT',
          note: null,
        },
      ]);
      prisma.attendance.upsert.mockResolvedValue({
        id: 'att-existing',
        groupId: 'group-uuid-1',
        studentId: 10001,
        date: new Date('2026-04-01'),
        status: 'LATE',
        note: null,
      });

      const dto: SaveAttendanceDto = {
        entries: [{ studentId: 10001, status: 'LATE' }],
      };
      const result = await service.save(
        'group-uuid-1',
        '2026-04-01',
        dto,
        1,
        ['Administrator'],
        1,
      );

      expect(result.message).toBe('Davomat muvaffaqiyatli saqlandi');
      expect(prisma.attendance.upsert).toHaveBeenCalledTimes(1);
    });

    it('emits attendance.student.recorded for each new entry on first save', async () => {
      const mockResults = [
        {
          id: 'att-1',
          groupId: 'group-uuid-1',
          studentId: 10001,
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          note: null,
        },
        {
          id: 'att-2',
          groupId: 'group-uuid-1',
          studentId: 10002,
          date: new Date('2026-04-01'),
          status: 'ABSENT',
          note: null,
        },
      ];

      prisma.enrollment.findMany.mockResolvedValue(
        mockEnrollments.map((e) => ({
          studentId: e.studentId,
          student: { balance: e.student.balance },
        })),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);
      prisma.group.findUnique.mockResolvedValue({
        name: 'Deutsch A1',
        branchId: 1,
        course: { price: 800000, lessonPaymentCount: 12 },
        teachers: [{ teacherId: 20001 }],
      });

      const dto: SaveAttendanceDto = {
        entries: [
          { studentId: 10001, status: 'PRESENT' },
          { studentId: 10002, status: 'ABSENT' },
        ],
      };

      await service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1);

      const studentRecorded = eventEmitter.emit.mock.calls.filter(
        (c) => c[0] === 'attendance.student.recorded',
      );
      expect(studentRecorded).toHaveLength(2);
      expect(studentRecorded[0][1]).toEqual(
        expect.objectContaining({
          studentId: 10001,
          groupId: 'group-uuid-1',
          groupName: 'Deutsch A1',
          oldStatus: null,
          newStatus: 'PRESENT',
        }),
      );
      expect(studentRecorded[1][1]).toEqual(
        expect.objectContaining({
          studentId: 10002,
          oldStatus: null,
          newStatus: 'ABSENT',
        }),
      );
    });

    it('emits attendance.student.recorded only for entries whose status changed', async () => {
      // A roster saved by hand earlier in the lesson (ADR-0048's predicate).
      const existingRecords = [
        {
          id: 'att-1',
          studentId: 10001,
          status: 'PRESENT',
          markedMethod: 'MANUAL',
          note: null,
        },
        {
          id: 'att-2',
          studentId: 10002,
          status: 'ABSENT',
          markedMethod: 'MANUAL',
          note: null,
        },
      ];

      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
        { studentId: 10002, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue(existingRecords);
      prisma.attendance.upsert
        .mockResolvedValueOnce({
          id: 'att-1',
          groupId: 'group-uuid-1',
          studentId: 10001,
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          note: null,
        })
        .mockResolvedValueOnce({
          id: 'att-2',
          groupId: 'group-uuid-1',
          studentId: 10002,
          date: new Date('2026-04-01'),
          status: 'PRESENT',
          note: null,
        });
      prisma.group.findUnique.mockResolvedValue({
        name: 'Deutsch A1',
        branchId: 1,
        teachers: [{ teacherId: 20001 }],
        course: { price: 800000, lessonPaymentCount: 12 },
      });

      const dto: SaveAttendanceDto = {
        entries: [
          // unchanged: PRESENT → PRESENT
          { studentId: 10001, status: 'PRESENT' },
          // changed: ABSENT → PRESENT
          { studentId: 10002, status: 'PRESENT' },
        ],
      };

      await service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1);

      const studentRecorded = eventEmitter.emit.mock.calls.filter(
        (c) => c[0] === 'attendance.student.recorded',
      );
      expect(studentRecorded).toHaveLength(1);
      // ADR-0048: marked present after the lesson's first save, at 09:30 —
      // a late arrival, 30 minutes after the 09:00 start.
      expect(studentRecorded[0][1]).toEqual(
        expect.objectContaining({
          studentId: 10002,
          oldStatus: 'ABSENT',
          newStatus: 'LATE',
        }),
      );
      expect(prisma.attendance.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'LATE', lateMinutes: 30 }),
          update: expect.objectContaining({ status: 'LATE', lateMinutes: 30 }),
        }),
      );
    });

    it('writes a first save as sent, with no minutes (ADR-0048)', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: `att-${create.studentId}`, ...create }),
      );
      prisma.group.findUnique.mockResolvedValue({
        name: 'Deutsch A1',
        branchId: 1,
        teachers: [],
        course: { price: 800000, lessonPaymentCount: 12 },
      });
      await service.save(
        'group-uuid-1',
        '2026-04-01',
        {
          entries: [
            { studentId: 10001, status: 'PRESENT' },
            { studentId: 10002, status: 'LATE' },
          ],
        },
        1,
        ['Administrator'],
        1,
      );
      const creates = prisma.attendance.upsert.mock.calls.map(
        (c: any) => c[0].create,
      );
      expect(creates).toEqual([
        expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
        expect.objectContaining({ status: 'LATE', lateMinutes: null }),
      ]);
    });

    it('keeps the minutes of a LATE that stays LATE and clears them when it leaves (ADR-0048)', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 10001, status: 'LATE', lateMinutes: 12 },
        { id: 'att-2', studentId: 10002, status: 'LATE', lateMinutes: 7 },
      ]);
      prisma.attendance.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: `att-${create.studentId}`, ...create }),
      );
      prisma.group.findUnique.mockResolvedValue({
        name: 'Deutsch A1',
        branchId: 1,
        teachers: [],
        course: { price: 800000, lessonPaymentCount: 12 },
      });
      await service.save(
        'group-uuid-1',
        '2026-04-01',
        {
          entries: [
            { studentId: 10001, status: 'LATE' },
            { studentId: 10002, status: 'ABSENT' },
          ],
        },
        1,
        ['Administrator'],
        1,
      );
      const updates = prisma.attendance.upsert.mock.calls.map(
        (c: any) => c[0].update,
      );
      expect(updates).toEqual([
        expect.objectContaining({ status: 'LATE', lateMinutes: 12 }),
        expect.objectContaining({ status: 'ABSENT', lateMinutes: null }),
      ]);
    });

    it('refuses an administrator a new register after the lesson ended', async () => {
      jest.setSystemTime(new Date('2026-04-01T06:00:00.000Z')); // 11:00 Tashkent
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          { entries: [{ studentId: 10001, status: 'PRESENT' }] },
          1,
          ['Administrator'],
          1,
        ),
      ).rejects.toThrow('Dars tugagan');
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('refuses the CEO a new register for a past lesson', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);
      // 2026-03-30 is the Monday before the pinned day
      await expect(
        service.save(
          'group-uuid-1',
          '2026-03-30',
          { entries: [{ studentId: 10001, status: 'PRESENT' }] },
          1,
          ['CEO'],
          1,
        ),
      ).rejects.toThrow('Dars tugagan');
    });

    it("refuses a new register once «Dars bo'ldimi?» was asked", async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          { entries: [{ studentId: 10001, status: 'PRESENT' }] },
          1,
          ['Administrator'],
          1,
        ),
      ).rejects.toMatchObject({ message: ENDED_REFUSAL });
      // A teacher is told the administrator answers the question.
      await expect(
        service.save(
          'group-uuid-1',
          '2026-04-01',
          { entries: [{ studentId: 10001, status: 'PRESENT' }] },
          1,
          ['Teacher'],
          1,
        ),
      ).rejects.toMatchObject({ message: TEACHER_ENDED });
    });

    it('still lets an administrator edit a past register', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, student: { balance: 500000 } },
      ]);
      prisma.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 10001, status: 'ABSENT', note: null },
      ]);
      prisma.attendance.upsert.mockResolvedValue({
        id: 'att-1',
        studentId: 10001,
        status: 'EXCUSED',
        note: null,
      });
      const result = await service.save(
        'group-uuid-1',
        '2026-03-30',
        { entries: [{ studentId: 10001, status: 'EXCUSED' }] },
        1,
        ['Administrator'],
        1,
      );
      expect(result.message).toBe('Davomat muvaffaqiyatli saqlandi');
    });

    // CEO 30.09 (D1): CEO, BD and Administrator edit a register after the
    // lesson; a teacher never does. Contract 3.2 still holds (D2).
    describe('D1: editing a register after the lesson (ADR-0054)', () => {
      // 2026-03-30 is the Monday before the pinned day: its lesson has ended.
      const pastRegister = [
        {
          id: 'att-1',
          studentId: 10001,
          status: 'ABSENT',
          lateMinutes: null,
          markedMethod: 'MANUAL',
          note: null,
        },
        {
          id: 'att-2',
          studentId: 10002,
          status: 'ABSENT',
          lateMinutes: null,
          markedMethod: 'MANUAL',
          note: null,
        },
      ];
      const edit = (status: 'PRESENT' | 'ABSENT', roles = ['Administrator']) =>
        service.save(
          'group-uuid-1',
          '2026-03-30',
          {
            entries: [
              { studentId: 10001, status: 'PRESENT' },
              { studentId: 10002, status },
            ],
          },
          1,
          roles,
          1,
        );

      beforeEach(() => {
        prisma.attendance.findMany.mockResolvedValue(pastRegister);
        prisma.attendance.upsert.mockImplementation(({ create }: any) =>
          Promise.resolve({ id: `att-${create.studentId}`, ...create }),
        );
      });

      it('an administrator edits it: the status goes in as sent, with no minutes', async () => {
        await edit('PRESENT');
        // Not LATE with the two days since the lesson's start (ADR-0048 §2
        // counts minutes only while the lesson runs).
        expect(
          prisma.attendance.upsert.mock.calls.map((c: any) => c[0].update),
        ).toEqual([
          expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
          expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
        ]);
      });

      it("refuses the teacher's edit", async () => {
        await expect(edit('ABSENT', ['Teacher'])).rejects.toThrow(
          "Davomat olib bo'lingan",
        );
        expect(prisma.attendance.upsert).not.toHaveBeenCalled();
      });

      it('refuses flipping a blocked student to PRESENT', async () => {
        blocks(10002);
        await expect(edit('PRESENT')).rejects.toThrow(
          `Dilnoza Rashidova ${NOT_PAID}`,
        );
        expect(prisma.attendance.upsert).not.toHaveBeenCalled();
      });

      it("passes a blocked student's unchanged mark", async () => {
        blocks(10002);
        await expect(edit('ABSENT')).resolves.toMatchObject({ count: 2 });
      });

      // The register left 10002 out (unpaid) and he has paid since (the
      // admission mock admits him). After the lesson he stays out: nobody
      // must mark him, and no mark pays the teacher for him. Only from
      // 01.10.2026, contract 3.2's first day.
      describe('a student the register left out', () => {
        const LEFT_OUT_TEXT =
          "Dilnoza Rashidova dars vaqtida davomatga kiritilmagan: dars tugagach «Keldi», «Kelmadi» yoki «Kechikdi» qo'yib bo'lmaydi";
        const FULL_ROSTER = "barcha o'quvchilarning holati belgilanishi shart";
        const saveOn = (date: string, entries: SaveAttendanceDto['entries']) =>
          service.save(
            'group-uuid-1',
            date,
            { entries },
            1,
            ['Administrator'],
            1,
          );
        // Monday 05.10's lesson, which has ended by the pinned clock.
        const saveAs = (entries: SaveAttendanceDto['entries']) =>
          saveOn('2026-10-05', entries);
        beforeEach(() => {
          // Wednesday 07.10, 09:30 Tashkent.
          jest.setSystemTime(new Date('2026-10-07T04:30:00.000Z'));
          prisma.group.findFirst.mockResolvedValue({
            ...mockGroup,
            endDate: new Date('2026-12-31'),
          });
          prisma.attendance.findMany.mockResolvedValue([pastRegister[0]]);
        });

        it('is not required, though he has paid since', async () => {
          await expect(
            saveAs([{ studentId: 10001, status: 'PRESENT' }]),
          ).resolves.toMatchObject({ count: 1 });
        });

        it.each(['PRESENT', 'LATE', 'ABSENT'] as const)(
          'refuses %s for him, before anything is written',
          async (status) => {
            await expect(
              saveAs([
                { studentId: 10001, status: 'PRESENT' },
                { studentId: 10002, status },
              ]),
            ).rejects.toThrow(LEFT_OUT_TEXT);
            expect(prisma.attendance.upsert).not.toHaveBeenCalled();
          },
        );

        it('accepts EXCUSED for him', async () => {
          await expect(
            saveAs([
              { studentId: 10001, status: 'PRESENT' },
              { studentId: 10002, status: 'EXCUSED' },
            ]),
          ).resolves.toMatchObject({ count: 2 });
        });

        it('still needs him on a register only QR scans took', async () => {
          prisma.attendance.findMany.mockResolvedValue([
            { ...pastRegister[0], markedMethod: 'QR' },
          ]);
          await expect(
            saveAs([{ studentId: 10001, status: 'PRESENT' }]),
          ).rejects.toThrow(FULL_ROSTER);
        });

        it('still needs him while the lesson runs', async () => {
          await expect(
            saveOn('2026-10-07', [{ studentId: 10001, status: 'PRESENT' }]),
          ).rejects.toThrow(FULL_ROSTER);
        });

        it('still needs him on a register from before 01.10.2026', async () => {
          await expect(
            saveOn('2026-03-30', [{ studentId: 10001, status: 'PRESENT' }]),
          ).rejects.toThrow(FULL_ROSTER);
        });
      });
    });

    // ADR-0048 §2 under D1: minutes are written only while the lesson runs,
    // and only once a roster was saved by hand — QR scans do not count.
    describe('late arrivals during the lesson (ADR-0048)', () => {
      const row = (
        studentId: number,
        status: string,
        markedMethod: 'MANUAL' | 'QR',
        lateMinutes: number | null = null,
      ) => ({
        id: `att-${studentId}`,
        studentId,
        status,
        markedMethod,
        lateMinutes,
        note: null,
      });
      const writes = () =>
        prisma.attendance.upsert.mock.calls.map((c: any) => c[0].update);
      const adminSaves = () =>
        service.save(
          'group-uuid-1',
          '2026-04-01',
          twoPresent,
          1,
          ['Administrator'],
          1,
        );

      beforeEach(() => {
        prisma.attendance.upsert.mockImplementation(({ create }: any) =>
          Promise.resolve({ id: `att-${create.studentId}`, ...create }),
        );
      });

      it("takes the administrator's first roster after QR scans as sent", async () => {
        // 10001 scanned the QR; 10002 did not, and sits in the class.
        prisma.attendance.findMany.mockResolvedValue([
          row(10001, 'PRESENT', 'QR'),
        ]);
        await adminSaves();
        expect(writes()).toEqual([
          expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
          expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
        ]);
      });

      it('turns a later ABSENT→PRESENT into LATE with the minutes since the start', async () => {
        prisma.attendance.findMany.mockResolvedValue([
          row(10001, 'PRESENT', 'MANUAL'),
          row(10002, 'ABSENT', 'MANUAL'),
        ]);
        await adminSaves(); // 09:30, the lesson started at 09:00
        expect(writes()[1]).toEqual(
          expect.objectContaining({ status: 'LATE', lateMinutes: 30 }),
        );
        // The history counts what was written, not what was sent.
        expect(entityHistoryService.recordUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            newValues: expect.objectContaining({ keldi: 1, kechikdi: 1 }),
          }),
        );
      });

      it('clears the minutes on LATE→PRESENT', async () => {
        prisma.attendance.findMany.mockResolvedValue([
          row(10001, 'PRESENT', 'MANUAL'),
          row(10002, 'LATE', 'MANUAL', 12),
        ]);
        await adminSaves();
        expect(writes()[1]).toEqual(
          expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
        );
      });
    });

    // One clock (D4): the shared window, the company's lead, the effective
    // times of the day.
    describe("the new register's window", () => {
      const at = (iso: string) => jest.setSystemTime(new Date(iso));
      const saves = (date = '2026-04-01') =>
        service.save('group-uuid-1', date, twoPresent, 1, ['Administrator'], 1);

      beforeEach(() => {
        prisma.attendance.upsert.mockImplementation(({ create }: any) =>
          Promise.resolve({ id: `att-${create.studentId}`, ...create }),
        );
      });

      it("opens by the company's lead: 20 minutes", async () => {
        settings.get.mockResolvedValue(20);
        at('2026-04-01T03:45:00.000Z'); // 08:45, start − 15
        await expect(saves()).resolves.toMatchObject({ count: 2 });

        at('2026-04-01T03:35:00.000Z'); // 08:35, start − 25
        await expect(saves()).rejects.toMatchObject({
          message:
            'Davomat dars boshlanishidan 20 daqiqa oldin ochiladi (09:00)',
        });
      });

      it('closes at the end minute itself: 17:30:00 for a lesson ending 17:30', async () => {
        prisma.group.findFirst.mockResolvedValue({
          ...mockGroup,
          lessonStartTime: '16:00',
          lessonEndTime: '17:30',
        });
        at('2026-04-01T12:29:59.000Z'); // 17:29:59
        await expect(saves()).resolves.toMatchObject({ count: 2 });

        const endMinute = new Date('2026-04-01T12:30:00.000Z'); // 17:30:00
        jest.setSystemTime(endMinute);
        await expect(saves()).rejects.toMatchObject({ message: ENDED_REFUSAL });
        // The lesson-end sweep reads the same boundary.
        expect(
          lessonHasEnded({
            date: '2026-04-01',
            ...tashkentClock(endMinute),
            endTime: '17:30',
          }),
        ).toBe(true);
      });

      it("counts the window, the lead and the minutes from a moved lesson's own start", async () => {
        // Moved to Thursday 2026-04-02 at 14:00–15:30; the group meets 09:00–11:00.
        prisma.lessonReschedule.findFirst.mockResolvedValue({
          originalDate: new Date('2026-03-30T00:00:00.000Z'),
          newDate: new Date('2026-04-02T00:00:00.000Z'),
          newLessonStartTime: '14:00',
          newLessonEndTime: '15:30',
        });
        at('2026-04-02T08:45:00.000Z'); // 13:45
        await expect(saves('2026-04-02')).rejects.toMatchObject({
          message:
            'Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (14:00)',
        });

        at('2026-04-02T08:55:00.000Z'); // 13:55
        await expect(saves('2026-04-02')).resolves.toMatchObject({ count: 2 });

        // 14:20: an administrator's ABSENT→PRESENT is 20 minutes late.
        at('2026-04-02T09:20:00.000Z');
        prisma.attendance.findMany.mockResolvedValue([
          {
            id: 'att-10001',
            studentId: 10001,
            status: 'PRESENT',
            markedMethod: 'MANUAL',
            lateMinutes: null,
            note: null,
          },
          {
            id: 'att-10002',
            studentId: 10002,
            status: 'ABSENT',
            markedMethod: 'MANUAL',
            lateMinutes: null,
            note: null,
          },
        ]);
        prisma.attendance.upsert.mockClear();
        await saves('2026-04-02');
        expect(prisma.attendance.upsert.mock.calls[1][0].update).toEqual(
          expect.objectContaining({ status: 'LATE', lateMinutes: 20 }),
        );
      });
    });
  });

  describe('getStats', () => {
    it('should return attendance statistics per student with notes', async () => {
      // getStats issues two groupBy calls: one by ['date'] (lesson-day
      // discovery) and one by ['studentId','status'] (per-student tallies).
      prisma.attendance.groupBy.mockImplementation(({ by }: any) =>
        by?.includes('studentId')
          ? Promise.resolve([
              { studentId: 10001, status: 'PRESENT', _count: 10 },
              { studentId: 10001, status: 'ABSENT', _count: 2 },
              { studentId: 10002, status: 'PRESENT', _count: 8 },
              { studentId: 10002, status: 'LATE', _count: 3 },
              { studentId: 10002, status: 'ABSENT', _count: 1 },
            ])
          : Promise.resolve([
              { date: new Date('2026-03-10') },
              { date: new Date('2026-03-12') },
            ]),
      );
      prisma.attendance.findMany.mockResolvedValue([
        {
          studentId: 10001,
          date: new Date('2026-03-10'),
          status: 'ABSENT',
          note: 'Kasal',
          markedBy: { id: 1, firstName: 'Admin', lastName: 'User' },
        },
      ]);

      const result = await service.getStats('group-uuid-1');

      expect(result.totalLessons).toBeGreaterThan(0);
      expect(result.students).toHaveLength(2);

      const ahmad = result.students.find((s) => s.id === 10001);
      expect(ahmad).toBeDefined();
      expect(ahmad!.present).toBe(10);
      expect(ahmad!.absent).toBe(2);
      expect(ahmad!.notes).toHaveLength(1);
      expect(ahmad!.notes[0]).toEqual(
        expect.objectContaining({
          date: '2026-03-10',
          status: 'ABSENT',
          note: 'Kasal',
          markedBy: 'Admin User',
        }),
      );

      const dilnoza = result.students.find((s) => s.id === 10002);
      expect(dilnoza).toBeDefined();
      expect(dilnoza!.present).toBe(8);
      expect(dilnoza!.late).toBe(3);
      expect(dilnoza!.notes).toHaveLength(0);
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.getStats('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should pass companyId to group query', async () => {
      prisma.attendance.groupBy.mockResolvedValue([]);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.enrollment.findMany.mockResolvedValue([]);

      await service.getStats('group-uuid-1', undefined, undefined, 1);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1 }),
        }),
      );
    });
  });

  describe('getLessonSequence', () => {
    // Use a past date range so lesson dates are deterministic and all fall
    // within the last-N slice regardless of the current system date.
    // 2024-01-01 is a Monday; 2024-01-19 is a Friday.
    // Schedule [Mon, Wed, Fri] → 9 lesson dates, all fit within expectedCount=12.
    const groupWithCourse = (lessonPaymentCount: number) => ({
      id: 'group-uuid-1',
      exactDays: ['monday', 'wednesday', 'friday'],
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-19'),
      course: { lessonPaymentCount },
    });

    it('should return lesson dates with status per student (N from course.lessonPaymentCount)', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([
        {
          studentId: 10001,
          date: new Date('2024-01-01T00:00:00.000Z'),
          status: 'PRESENT',
        },
        {
          studentId: 10001,
          date: new Date('2024-01-03T00:00:00.000Z'),
          status: 'ABSENT',
        },
        {
          studentId: 10002,
          date: new Date('2024-01-01T00:00:00.000Z'),
          status: 'LATE',
        },
      ]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.expectedCount).toBe(12);
      expect(result.lessonDates.length).toBe(9);
      expect(result.students).toHaveLength(2);

      const ahmad = result.students.find((s) => s.id === 10001);
      expect(ahmad).toBeDefined();
      expect(ahmad!.dots).toHaveLength(9);
      expect(ahmad!.dots[0]).toEqual({
        date: '2024-01-01',
        status: 'PRESENT',
        lateMinutes: null,
        enrolled: true,
      });
      expect(ahmad!.dots[1]).toEqual({
        date: '2024-01-03',
        status: 'ABSENT',
        lateMinutes: null,
        enrolled: true,
      });
      // No attendance row + startDate null (no lower bound) → still enrolled.
      expect(ahmad!.dots[2]).toEqual({
        date: '2024-01-05',
        status: null,
        lateMinutes: null,
        enrolled: true,
      });
    });

    it('should respect custom lessonPaymentCount (e.g. 20)', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(20));
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.expectedCount).toBe(20);
      // Only 9 lesson dates exist in the date range — all should be returned.
      expect(result.lessonDates.length).toBe(9);
    });

    it('should use default 12 when course is missing', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-uuid-1',
        exactDays: ['monday'],
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-19'),
        course: null,
      });
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.expectedCount).toBe(12);
    });

    it('should return null status for dates without attendance record', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.students).toHaveLength(2);
      for (const student of result.students) {
        expect(student.dots.every((d) => d.status === null)).toBe(true);
        expect(student.attended).toBe(0);
      }
    });

    it('should count PRESENT + LATE as attended', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([
        {
          studentId: 10001,
          date: new Date('2024-01-01T00:00:00.000Z'),
          status: 'PRESENT',
        },
        {
          studentId: 10001,
          date: new Date('2024-01-03T00:00:00.000Z'),
          status: 'LATE',
        },
        {
          studentId: 10001,
          date: new Date('2024-01-05T00:00:00.000Z'),
          status: 'ABSENT',
        },
        {
          studentId: 10001,
          date: new Date('2024-01-08T00:00:00.000Z'),
          status: 'EXCUSED',
        },
      ]);

      const result = await service.getLessonSequence('group-uuid-1');
      const ahmad = result.students.find((s) => s.id === 10001);
      expect(ahmad!.attended).toBe(2);
    });

    it("should mark dots before a mid-stream joiner's startDate as not enrolled", async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([]);
      // Joined 2024-01-15 → lessons on 01-01..01-12 predate membership.
      prisma.enrollment.findMany.mockResolvedValue([
        {
          studentId: 10001,
          status: 'ACTIVE',
          startDate: new Date('2024-01-15'),
          statusChangedAt: null,
          student: {
            id: 10001,
            firstName: 'Ahmad',
            lastName: 'Karimov',
            photo: null,
          },
        },
      ]);

      const result = await service.getLessonSequence('group-uuid-1');
      const ahmad = result.students.find((s) => s.id === 10001)!;
      const dotOn = (d: string) => ahmad.dots.find((x) => x.date === d)!;

      // Before join → not enrolled (rendered as "Guruhda bo'lmagan").
      expect(dotOn('2024-01-01').enrolled).toBe(false);
      expect(dotOn('2024-01-12').enrolled).toBe(false);
      // On/after join → enrolled (blank dots here are real "Belgilanmagan").
      expect(dotOn('2024-01-15').enrolled).toBe(true);
      expect(dotOn('2024-01-19').enrolled).toBe(true);
    });

    it('should treat a transfer-out-then-back gap as not enrolled (union of windows, deduped roster)', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([]);
      // Same student, two enrollments: in [01-01..01-08], out, back in from 01-15.
      prisma.enrollment.findMany.mockResolvedValue([
        {
          studentId: 10001,
          status: 'DROPPED',
          startDate: new Date('2024-01-01'),
          statusChangedAt: new Date('2024-01-08T12:00:00.000Z'),
          student: {
            id: 10001,
            firstName: 'Ahmad',
            lastName: 'Karimov',
            photo: null,
          },
        },
        {
          studentId: 10001,
          status: 'ACTIVE',
          startDate: new Date('2024-01-15'),
          statusChangedAt: null,
          student: {
            id: 10001,
            firstName: 'Ahmad',
            lastName: 'Karimov',
            photo: null,
          },
        },
      ]);

      const result = await service.getLessonSequence('group-uuid-1');
      // Deduped to a single roster row despite two enrollment rows.
      expect(result.students).toHaveLength(1);
      const ahmad = result.students[0];
      const dotOn = (d: string) => ahmad.dots.find((x) => x.date === d)!;

      expect(dotOn('2024-01-03').enrolled).toBe(true); // first window
      expect(dotOn('2024-01-10').enrolled).toBe(false); // gap between windows
      expect(dotOn('2024-01-17').enrolled).toBe(true); // second window
    });

    it('should return empty students when no enrollments', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.enrollment.findMany.mockResolvedValue([]);
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.students).toEqual([]);
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.getLessonSequence('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include overrideDates for lessons with substitute teachers', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.lessonTeacherOverride.findMany.mockResolvedValue([
        { date: new Date('2024-01-03T00:00:00.000Z') },
        { date: new Date('2024-01-08T00:00:00.000Z') },
      ]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.overrideDates).toEqual(['2024-01-03', '2024-01-08']);
    });

    it('should return empty overrideDates when no overrides exist', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([]);

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.overrideDates).toEqual([]);
    });

    it('should pass companyId to group query', async () => {
      prisma.group.findFirst.mockResolvedValue(groupWithCourse(12));
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.enrollment.findMany.mockResolvedValue([]);

      await service.getLessonSequence('group-uuid-1', 42);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 42 }),
        }),
      );
    });
  });
});
