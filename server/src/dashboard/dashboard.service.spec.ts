import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
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

    it('should return isHoliday=true when holiday exists', async () => {
      prisma.holiday.findFirst.mockResolvedValue({ name: "Navro'z" });

      const result = await service.getTodaySchedule(1, 1001, '2026-03-21');

      expect(result.isHoliday).toBe(true);
      expect(result.holidayName).toBe("Navro'z");
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
  });
});
