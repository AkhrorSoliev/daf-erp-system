import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceService } from './attendance.service';
import { AttendanceValidationService } from './attendance-validation.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceStatsService } from './attendance-stats.service';
import { AttendanceSaveService } from './attendance-save.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';
import type { SaveAttendanceDto } from './dto/save-attendance.dto';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        AttendanceValidationService,
        AttendanceReadService,
        AttendanceStatsService,
        AttendanceSaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
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

    describe('lesson time check', () => {
      // validateLessonDate resolves "today" + the weekday in Asia/Tashkent
      // (UTC+5). Compute these helpers in the same zone so the lesson date /
      // weekday don't drift to the previous day when CI runs in the
      // 19:00–23:59 UTC window — that drift made the time-check tests below
      // flaky (the date stopped matching "today", so the check was skipped).
      const tashkentNow = () => new Date(Date.now() + 5 * 60 * 60 * 1000);

      // Today's date string for time tests
      const getTodayStr = () => {
        const now = tashkentNow();
        return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
      };

      // Mock group that matches today's day-of-week
      const getTodayMockGroup = () => {
        const now = tashkentNow();
        const dayNames = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ];
        return {
          ...mockGroup,
          exactDays: [dayNames[now.getUTCDay()]],
          startDate: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
          endDate: new Date(Date.UTC(now.getUTCFullYear(), 11, 31)),
        };
      };

      it('should throw when current time is before lesson start (Teacher)', async () => {
        const todayGroup = {
          ...getTodayMockGroup(),
          lessonStartTime: '23:50',
          lessonEndTime: '23:59',
        };
        prisma.group.findFirst.mockResolvedValue(todayGroup);

        await expect(
          service.validateLessonDate('group-uuid-1', getTodayStr(), undefined, [
            'Teacher',
          ]),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw when current time is after lesson end (Teacher)', async () => {
        const todayGroup = {
          ...getTodayMockGroup(),
          lessonStartTime: '00:00',
          lessonEndTime: '00:01',
        };
        prisma.group.findFirst.mockResolvedValue(todayGroup);

        await expect(
          service.validateLessonDate('group-uuid-1', getTodayStr(), undefined, [
            'Teacher',
          ]),
        ).rejects.toThrow(BadRequestException);
      });

      it('should bypass time check for CEO', async () => {
        const todayGroup = {
          ...getTodayMockGroup(),
          lessonStartTime: '23:50',
          lessonEndTime: '23:59',
        };
        prisma.group.findFirst.mockResolvedValue(todayGroup);

        const result = await service.validateLessonDate(
          'group-uuid-1',
          getTodayStr(),
          undefined,
          ['CEO'],
        );
        expect(result.group.id).toBe('group-uuid-1');
      });

      it('should bypass time check for Administrator', async () => {
        const todayGroup = {
          ...getTodayMockGroup(),
          lessonStartTime: '23:50',
          lessonEndTime: '23:59',
        };
        prisma.group.findFirst.mockResolvedValue(todayGroup);

        const result = await service.validateLessonDate(
          'group-uuid-1',
          getTodayStr(),
          undefined,
          ['Administrator'],
        );
        expect(result.group.id).toBe('group-uuid-1');
      });

      it('should bypass time check for Branch Director', async () => {
        const todayGroup = {
          ...getTodayMockGroup(),
          lessonStartTime: '23:50',
          lessonEndTime: '23:59',
        };
        prisma.group.findFirst.mockResolvedValue(todayGroup);

        const result = await service.validateLessonDate(
          'group-uuid-1',
          getTodayStr(),
          undefined,
          ['Branch Director'],
        );
        expect(result.group.id).toBe('group-uuid-1');
      });

      it('should skip time check for past dates (not today)', async () => {
        // Non-today date: time check doesn't apply
        const result = await service.validateLessonDate(
          'group-uuid-1',
          '2026-04-01',
          undefined,
          ['Teacher'],
        );
        expect(result.group.id).toBe('group-uuid-1');
      });

      it('should skip time check when group has no lesson times set', async () => {
        const todayGroup = {
          ...getTodayMockGroup(),
          lessonStartTime: null,
          lessonEndTime: null,
        };
        prisma.group.findFirst.mockResolvedValue(todayGroup);

        const result = await service.validateLessonDate(
          'group-uuid-1',
          getTodayStr(),
          undefined,
          ['Teacher'],
        );
        expect(result.group.id).toBe('group-uuid-1');
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
    it('should return students with attendance status', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          studentId: 10001,
          status: 'PRESENT',
          note: null,
        },
      ]);

      const result = await service.getByDate('group-uuid-1', '2026-04-01');

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

      const result = await service.getByDate('group-uuid-1', '2026-04-01');

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

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getByDate('non-existent', '2026-04-01'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid date format', async () => {
      await expect(
        service.getByDate('group-uuid-1', 'invalid-date'),
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
      const existingRecords = [
        { id: 'att-1', studentId: 10001, status: 'PRESENT', note: null },
        { id: 'att-2', studentId: 10002, status: 'ABSENT', note: null },
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
      expect(studentRecorded[0][1]).toEqual(
        expect.objectContaining({
          studentId: 10002,
          oldStatus: 'ABSENT',
          newStatus: 'PRESENT',
        }),
      );
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
        enrolled: true,
      });
      expect(ahmad!.dots[1]).toEqual({
        date: '2024-01-03',
        status: 'ABSENT',
        enrolled: true,
      });
      // No attendance row + startDate null (no lower bound) → still enrolled.
      expect(ahmad!.dots[2]).toEqual({
        date: '2024-01-05',
        status: null,
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
