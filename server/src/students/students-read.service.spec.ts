import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StudentsReadService } from './students-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { StudentQueryDto } from './dto/student-query.dto';

describe('StudentsReadService', () => {
  let service: StudentsReadService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      // systemStartDate floor lookup — default null = no floor (legacy behaviour).
      company: {
        findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsReadService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: {} },
      ],
    }).compile();

    service = module.get(StudentsReadService);
  });

  describe('findAll — ungrouped filter', () => {
    it('matches active students not in any active group (dropped-out students included)', async () => {
      await service.findAll(
        { status: 'ungrouped' } as StudentQueryDto,
        1001,
      );

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
      expect(where.companyId).toBe(1001);
      // A student is "ungrouped" unless they have an ACTIVE enrollment in an
      // ACTIVE group — so students whose only enrollments are DROPPED/FROZEN
      // (a non-empty enrollments list) now match too.
      expect(where.enrollments).toEqual({
        none: {
          deletedAt: null,
          status: 'ACTIVE',
          group: { deletedAt: null, statusEnum: 'ACTIVE' },
        },
      });
    });

    it('does not apply the ungrouped enrollment filter for other statuses', async () => {
      await service.findAll({} as StudentQueryDto, 1001);

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.enrollments).toBeUndefined();
      expect(where.status).toBeUndefined();
    });
  });

  describe('getLessonsOverview', () => {
    it('throws NotFound when the student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(
        service.getLessonsOverview(10001, 1001),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns empty groups when the student has no enrollments', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([]);
      const res = await service.getLessonsOverview(10001, 1001);
      expect(res).toEqual({ studentId: 10001, groups: [] });
    });

    it('groups lessons into lessonPaymentCount blocks by date; ALL lessons (incl. ABSENT) get a cycle; ACTIVE-only by default', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          status: 'ACTIVE',
          startDate: new Date('2026-06-01'),
          group: {
            id: 'grp-1',
            name: '#001',
            course: { name: 'A1', lessonPaymentCount: 12 },
          },
        },
      ]);
      // Student attendance rows (chronological). 3 lessons, lpc=12 → 1 block.
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          groupId: 'grp-1',
          date: new Date('2026-06-01'),
          status: 'PRESENT',
        },
        {
          id: 'att-2',
          groupId: 'grp-1',
          date: new Date('2026-06-03'),
          status: 'ABSENT',
        },
        {
          id: 'att-3',
          groupId: 'grp-1',
          date: new Date('2026-06-05'),
          status: 'LATE',
        },
      ]);

      const res = await service.getLessonsOverview(10001, 1001);

      // Default: ACTIVE-only enrollment filter.
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );

      expect(res.groups).toHaveLength(1);
      const g = res.groups[0];
      expect(g.lessonPaymentCount).toBe(12);
      expect(g.attended).toBe(2); // PRESENT + LATE
      expect(g.total).toBe(3);
      // 3 < 12 → single in-progress block with lessonCount 3, attended 2.
      expect(g.cycles).toEqual([
        expect.objectContaining({
          cycleSequenceNumber: 1,
          capacity: 12,
          lessonCount: 3,
          attended: 2,
        }),
      ]);

      // EVERY lesson (incl. ABSENT) belongs to block 1 by chronological index.
      const byDate = Object.fromEntries(g.lessons.map((l: any) => [l.date, l]));
      expect(byDate['2026-06-01'].cycleSequenceNumber).toBe(1);
      expect(byDate['2026-06-03'].status).toBe('ABSENT');
      expect(byDate['2026-06-03'].cycleSequenceNumber).toBe(1);
      expect(byDate['2026-06-05'].cycleSequenceNumber).toBe(1);
    });

    it('splits >lessonPaymentCount lessons into multiple blocks (12 + 1)', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          status: 'ACTIVE',
          startDate: new Date('2026-05-01'),
          group: {
            id: 'grp-1',
            name: '#014',
            course: { name: 'Standart', lessonPaymentCount: 12 },
          },
        },
      ]);
      // 13 chronological lessons → block 1 = 12 dars, block 2 = 1 dars.
      const atts = Array.from({ length: 13 }, (_, i) => ({
        id: `att-${i + 1}`,
        groupId: 'grp-1',
        date: new Date(2026, 4, i + 1), // 2026-05-(i+1)
        status: 'PRESENT',
      }));
      prisma.attendance.findMany.mockResolvedValue(atts);

      const res = await service.getLessonsOverview(10001, 1001);
      const g = res.groups[0];
      expect(g.total).toBe(13);
      expect(g.cycles).toHaveLength(2);
      expect(g.cycles[0]).toEqual(
        expect.objectContaining({
          cycleSequenceNumber: 1,
          capacity: 12,
          lessonCount: 12,
        }),
      );
      expect(g.cycles[1]).toEqual(
        expect.objectContaining({
          cycleSequenceNumber: 2,
          capacity: 12,
          lessonCount: 1,
        }),
      );
      // 13th lesson is in block 2.
      expect(g.lessons[12].cycleSequenceNumber).toBe(2);
    });

    it('uses the course lessonPaymentCount (e.g. 20 for intensiv) as block size', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          status: 'ACTIVE',
          startDate: new Date('2026-05-01'),
          group: {
            id: 'grp-1',
            name: '#int',
            course: { name: 'Intensiv', lessonPaymentCount: 20 },
          },
        },
      ]);
      const atts = Array.from({ length: 21 }, (_, i) => ({
        id: `att-${i + 1}`,
        groupId: 'grp-1',
        date: new Date(2026, 4, i + 1),
        status: 'PRESENT',
      }));
      prisma.attendance.findMany.mockResolvedValue(atts);

      const res = await service.getLessonsOverview(10001, 1001);
      const g = res.groups[0];
      expect(g.lessonPaymentCount).toBe(20);
      // 21 lessons, lpc 20 → block 1 (20) + block 2 (1).
      expect(g.cycles).toHaveLength(2);
      expect(g.cycles[0].lessonCount).toBe(20);
      expect(g.cycles[1].lessonCount).toBe(1);
    });

    it('includeClosed=true drops the ACTIVE-only status filter', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.getLessonsOverview(10001, 1001, true);
      const where = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
    });

    it('floors the attendance query to company.systemStartDate (April hidden)', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.company.findUnique.mockResolvedValue({
        systemStartDate: new Date('2026-05-01T00:00:00.000Z'),
      });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          status: 'ACTIVE',
          startDate: new Date('2026-05-01'),
          group: {
            id: 'grp-1',
            name: '#020',
            course: { name: 'A1', lessonPaymentCount: 12 },
          },
        },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.getLessonsOverview(10001, 1001);

      const where = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.date).toEqual({
        gte: new Date('2026-05-01T00:00:00.000Z'),
      });
    });

    it('applies no date floor when systemStartDate is null', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.company.findUnique.mockResolvedValue({ systemStartDate: null });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-1',
          status: 'ACTIVE',
          startDate: null,
          group: {
            id: 'grp-1',
            name: '#020',
            course: { name: 'A1', lessonPaymentCount: 12 },
          },
        },
      ]);
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.getLessonsOverview(10001, 1001);

      const where = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(where.date).toBeUndefined();
    });
  });
});
