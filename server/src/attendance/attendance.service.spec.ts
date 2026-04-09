import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

const mockGroup = {
  id: 'group-uuid-1',
  name: 'Deutsch A1-1',
  exactDays: ['monday', 'wednesday', 'friday'],
  startDate: new Date('2026-03-01'),
  endDate: new Date('2026-06-30'),
  companyId: 1,
  _count: { enrollments: 2 },
};

const mockEnrollments = [
  {
    studentId: 10001,
    student: {
      id: 10001,
      firstName: 'Ahmad',
      lastName: 'Karimov',
      photo: null,
    },
  },
  {
    studentId: 10002,
    student: {
      id: 10002,
      firstName: 'Dilnoza',
      lastName: 'Rashidova',
      photo: null,
    },
  },
];

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;
  let entityHistoryService: any;

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue(mockGroup),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue(mockEnrollments),
      },
      $transaction: jest.fn(),
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
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

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getLessonDates('non-existent', 4, 2026),
      ).rejects.toThrow(NotFoundException);
    });

    it('should exclude holidays', async () => {
      prisma.holiday.findMany.mockResolvedValue([
        { date: new Date('2026-04-01') }, // Chorshanba - should be excluded
      ]);

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);
      const dates = result.map((r) => r.date);
      expect(dates).not.toContain('2026-04-01');
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

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        studentId: 10001,
        firstName: 'Ahmad',
        lastName: 'Karimov',
        photo: null,
        status: 'PRESENT',
        note: null,
      });
      // Second student has no attendance record
      expect(result[1].status).toBeNull();
    });

    it('should throw NotFoundException when group not found', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.getByDate('non-existent', '2026-04-01'),
      ).rejects.toThrow(NotFoundException);
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
        mockEnrollments.map((e) => ({ studentId: e.studentId })),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

      const dto = {
        entries: [
          { studentId: 10001, status: 'PRESENT' },
          { studentId: 10002, status: 'ABSENT' },
        ],
      };

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

    it('should throw BadRequestException for unenrolled student', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001 },
      ]);

      const dto = {
        entries: [
          { studentId: 99999, status: 'PRESENT' },
        ],
      };

      await expect(
        service.save('group-uuid-1', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(BadRequestException);
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
        { studentId: 10001 },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue(mockResult);

      const dto = {
        entries: [
          {
            studentId: 10001,
            status: 'ABSENT',
            note: 'Some note that should be stripped',
          },
        ],
      };

      await service.save(
        'group-uuid-1',
        '2026-04-01',
        dto,
        1,
        ['Teacher'],
        1,
      );

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
        { id: 'att-1', groupId: 'group-uuid-1', studentId: 10001, date: new Date('2026-04-01'), status: 'LATE', note: null },
      ];

      prisma.enrollment.findMany.mockResolvedValue([{ studentId: 10001 }]);
      prisma.attendance.findMany.mockResolvedValue(existingRecords);
      prisma.attendance.upsert.mockResolvedValue(mockResults[0]);

      const dto = { entries: [{ studentId: 10001, status: 'LATE' }] };
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

      const dto = {
        entries: [
          { studentId: 10001, status: 'PRESENT' },
        ],
      };

      await expect(
        service.save('non-existent', '2026-04-01', dto, 1, ['CEO'], 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return attendance statistics per student with notes', async () => {
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 10001, status: 'PRESENT', _count: 10 },
        { studentId: 10001, status: 'ABSENT', _count: 2 },
        { studentId: 10002, status: 'PRESENT', _count: 8 },
        { studentId: 10002, status: 'LATE', _count: 3 },
        { studentId: 10002, status: 'ABSENT', _count: 1 },
      ]);
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
  });
});
