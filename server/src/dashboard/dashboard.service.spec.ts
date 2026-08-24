import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;
  let holidaysService: any;

  const mockRooms = [
    { id: 'room-1', name: 'Room 1', capacity: 20 },
    { id: 'room-2', name: 'Room 2', capacity: 15 },
  ];

  const mockGroups = [
    {
      id: 'group-1',
      name: 'G-101',
      lessonStartTime: '09:00',
      lessonEndTime: '10:30',
      roomId: 'room-1',
      room: { id: 'room-1', name: 'Room 1' },
      course: { name: 'Deutsch A1' },
      teachers: [
        { teacher: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' } },
      ],
      enrollments: [{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }],
    },
    {
      id: 'group-2',
      name: 'G-102',
      lessonStartTime: '11:00',
      lessonEndTime: '12:30',
      roomId: 'room-2',
      room: { id: 'room-2', name: 'Room 2' },
      course: { name: 'Deutsch B1' },
      teachers: [
        { teacher: { id: 10002, firstName: 'Vali', lastName: 'Karimov' } },
      ],
      enrollments: [{ id: 'e-4' }, { id: 'e-5' }],
    },
  ];

  const mockAttendanceCounts = [{ groupId: 'group-1', _count: { id: 2 } }];

  beforeEach(async () => {
    prisma = {
      holiday: { findFirst: jest.fn().mockResolvedValue(null) },
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          startOfWorkingDay: '08:00',
          endOfWorkingDay: '20:00',
        }),
      },
      room: { findMany: jest.fn().mockResolvedValue(mockRooms) },
      group: { findMany: jest.fn().mockResolvedValue(mockGroups) },
      attendance: {
        // groupBy is called twice per getTodaySchedule (PRESENT + total).
        // Use mockResolvedValue so both calls return the same shape by default.
        groupBy: jest.fn().mockResolvedValue(mockAttendanceCounts),
      },
    };

    holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: require('../holidays/holidays.service').HolidaysService,
          useValue: holidaysService,
        },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTodaySchedule', () => {
    it('should return lessons with studentCount and presentCount', async () => {
      const result = await service.getTodaySchedule(1, 1001, '2026-04-13');

      expect(result.lessons).toHaveLength(2);
      expect(result.lessons[0]).toEqual({
        groupId: 'group-1',
        groupName: 'G-101',
        courseName: 'Deutsch A1',
        startTime: '09:00',
        endTime: '10:30',
        roomId: 'room-1',
        roomName: 'Room 1',
        teachers: [{ id: 10001, firstName: 'Ali', lastName: 'Valiyev' }],
        studentCount: 3,
        presentCount: 2,
        attendanceStatus: expect.stringMatching(
          /^(TAKEN|NOT_TAKEN|MISSED|PENDING)$/,
        ),
      });
      expect(result.lessons[1].studentCount).toBe(2);
      expect(result.lessons[1].presentCount).toBe(0);
      expect(result.rooms).toEqual(mockRooms);
      expect(result.workingHours).toEqual({ start: '08:00', end: '20:00' });
      expect(result.isHoliday).toBe(false);
      expect(result.holidayName).toBeNull();
      expect(result.date).toBe('2026-04-13');
    });

    it('should return isHoliday=true AND empty lessons on a holiday', async () => {
      holidaysService.findActiveHolidayCovering.mockResolvedValue({
        id: 'h-1',
        name: "Navro'z",
        date: new Date('2026-03-21T00:00:00.000Z'),
        endDate: new Date('2026-03-23T00:00:00.000Z'),
      });

      const result = await service.getTodaySchedule(1, 1001, '2026-03-21');

      expect(result.isHoliday).toBe(true);
      expect(result.holidayName).toBe("Navro'z");
      // Regression: holiday day must render like Sunday — no lessons even
      // though groups have the weekday in exactDays.
      expect(result.lessons).toEqual([]);
      // Group query must NOT be issued on a holiday — it's a wasted DB call.
      expect(prisma.group.findMany).not.toHaveBeenCalled();
    });

    it('should return empty lessons when no groups match', async () => {
      prisma.group.findMany.mockResolvedValue([]);

      const result = await service.getTodaySchedule(1, 1001, '2026-04-12');

      expect(result.lessons).toEqual([]);
    });

    it('should use default working hours when branch has none', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        startOfWorkingDay: null,
        endOfWorkingDay: null,
      });

      const result = await service.getTodaySchedule(1, 1001, '2026-04-13');

      expect(result.workingHours).toEqual({ start: '08:00', end: '20:00' });
    });

    it('should handle groups without room or course', async () => {
      prisma.group.findMany.mockResolvedValue([
        {
          id: 'group-3',
          name: 'G-103',
          lessonStartTime: '14:00',
          lessonEndTime: '15:30',
          roomId: null,
          room: null,
          course: null,
          teachers: [],
          enrollments: [],
        },
      ]);
      prisma.attendance.groupBy.mockResolvedValue([]);

      const result = await service.getTodaySchedule(1, 1001, '2026-04-13');

      expect(result.lessons[0].roomName).toBeNull();
      expect(result.lessons[0].courseName).toBeNull();
      expect(result.lessons[0].teachers).toEqual([]);
      expect(result.lessons[0].studentCount).toBe(0);
      expect(result.lessons[0].presentCount).toBe(0);
    });

    it('should filter by branchId', async () => {
      await service.getTodaySchedule(5, 1001, '2026-04-13');

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 5 }),
        }),
      );
      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 5 }),
        }),
      );
    });

    it('should query correct day name for the given date', async () => {
      // 2026-04-13 is a Monday
      await service.getTodaySchedule(1, 1001, '2026-04-13');

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            exactDays: { has: 'monday' },
          }),
        }),
      );
    });

    it('should query attendance with UTC-midnight date (matches save path)', async () => {
      // Regression test: previously, dateOnly was built with local-time
      // components, so on a Tashkent-timezone server the query date was off
      // by one day from what attendance-validation.service.ts:36 stores
      // (`new Date(date + 'T00:00:00.000Z')`). Result: dashboard always
      // showed "davomat olinmagan" even when attendance had been saved.
      await service.getTodaySchedule(1, 1001, '2026-05-01');

      const expectedUtcMidnight = new Date('2026-05-01T00:00:00.000Z');

      expect(prisma.attendance.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ date: expectedUtcMidnight }),
        }),
      );
      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        expectedUtcMidnight,
      );
    });

    it('regression: multi-day holiday is detected on its middle days (bug #2)', async () => {
      // Holiday Mar 21 — Mar 23. On Mar 22 the dashboard must still show
      // isHoliday=true. The previous implementation used `findFirst({ date: X })`
      // which only matched the holiday's start day.
      holidaysService.findActiveHolidayCovering.mockResolvedValue({
        id: 'h-1',
        name: "Navro'z",
        date: new Date('2026-03-21T00:00:00.000Z'),
        endDate: new Date('2026-03-23T00:00:00.000Z'),
      });

      const result = await service.getTodaySchedule(1, 1001, '2026-03-22');

      expect(result.isHoliday).toBe(true);
      expect(result.holidayName).toBe("Navro'z");
      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        new Date('2026-03-22T00:00:00.000Z'),
      );
    });
  });
});
