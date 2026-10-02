import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StudentsReadService } from './students-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { StudentQueryDto } from './dto/student-query.dto';
import { MonthlyChargeService } from '../billing/monthly-charge.service';

describe('StudentsReadService', () => {
  let service: StudentsReadService;
  let prisma: any;
  let monthlyCharge: any;

  beforeEach(async () => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      // systemStartDate floor lookup — default null = no floor (legacy behaviour).
      company: {
        findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }),
      },
    };

    monthlyCharge = {
      previewReleaseForDeparture: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsReadService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: {} },
        { provide: MonthlyChargeService, useValue: monthlyCharge },
      ],
    }).compile();

    service = module.get(StudentsReadService);
  });

  describe('findAll — active filter', () => {
    it('faqat faol guruhda faol yozuvi borlarni oladi', async () => {
      await service.findAll(
        { status: ['active'] } as StudentQueryDto,
        1001,
        null,
      );

      const where = prisma.student.findMany.mock.calls[0][0].where;
      // Ilgari bu shart shunchaki «o'chirilmagan biror yozuvi bor» edi, ya'ni
      // guruhini tashlab ketgan (DROPPED) o'quvchi ham «faol» sanalardi — va
      // ayni paytda «guruhlashtirilmagan» ro'yxatiga ham tushardi. Ikki toifa
      // endi bitta shartning `some`/`none` ko'rinishi, shuning uchun ular
      // hech qachon ustma-ust tushmaydi.
      expect(where.AND).toEqual([
        {
          status: 'ACTIVE',
          enrollments: {
            some: {
              deletedAt: null,
              status: 'ACTIVE',
              group: { deletedAt: null, statusEnum: 'ACTIVE' },
            },
          },
        },
      ]);
    });
  });

  describe('findAll — ungrouped filter', () => {
    it('matches active students not in any active group (dropped-out students included)', async () => {
      await service.findAll(
        { status: ['ungrouped'] } as StudentQueryDto,
        1001,
        null,
      );

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(1001);
      // A student is "ungrouped" unless they have an ACTIVE enrollment in an
      // ACTIVE group — so students whose only enrollments are DROPPED/FROZEN
      // (a non-empty enrollments list) now match too. The status filter is a
      // whole where-fragment, so it rides in AND rather than on `where.status`.
      expect(where.AND).toEqual([
        {
          status: 'ACTIVE',
          enrollments: {
            none: {
              deletedAt: null,
              status: 'ACTIVE',
              group: { deletedAt: null, statusEnum: 'ACTIVE' },
            },
          },
        },
      ]);
    });

    it('bir nechta holat tanlansa OR bilan birlashadi', async () => {
      await service.findAll(
        { status: ['frozen', 'expelled'] } as StudentQueryDto,
        1001,
        null,
      );

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { OR: [{ status: 'FROZEN' }, { status: 'EXPELLED' }] },
      ]);
    });

    it("holat filtri o'qituvchi filtrini bosib ketmaydi — ikkovi ham qoladi", async () => {
      await service.findAll(
        { status: ['ungrouped'], teacher_id: [10010] } as StudentQueryDto,
        1001,
        null,
      );

      const where = prisma.student.findMany.mock.calls[0][0].where;
      // O'qituvchi filtri yuqori darajadagi `enrollments` da qoladi...
      expect(where.enrollments).toEqual({
        some: {
          AND: [
            { deletedAt: null },
            {
              group: {
                deletedAt: null,
                teachers: { some: { teacherId: 10010 } },
              },
            },
          ],
        },
      });
      // ...holatniki esa AND ichida, o'zining `enrollments` i bilan.
      expect(where.AND).toHaveLength(1);
      expect((where.AND as any[])[0].enrollments.none).toBeDefined();
    });

    it('does not apply the ungrouped enrollment filter for other statuses', async () => {
      await service.findAll({} as StudentQueryDto, 1001, null);

      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(where.enrollments).toBeUndefined();
      expect(where.status).toBeUndefined();
      expect(where.AND).toBeUndefined();
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
          createdAt: new Date('2026-06-01'),
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
          createdAt: new Date('2026-05-01'),
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
          createdAt: new Date('2026-05-01'),
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

    // A soft-deleted GROUP used to hide the lessons even with the toggle on,
    // because the group filter was unconditional. The student's attendance is
    // still in the DB — "yopilgan guruhlarni ko'rsatish" must reach it.
    it('includeClosed=true also reaches enrollments whose group is soft-deleted', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.getLessonsOverview(10001, 1001, true);
      const where = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(where.group).toEqual({ companyId: 1001 });
    });

    it('keeps soft-deleted groups hidden by default (toggle off)', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.getLessonsOverview(10001, 1001);
      const where = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(where.group).toEqual({ companyId: 1001, deletedAt: null });
    });

    // Ordering is the whole point of the tab: a student's lesson history must
    // read top-to-bottom as newest-to-oldest. The old `status asc, createdAt
    // asc` mixed two different measures — an ACTIVE group sat on top no matter
    // how long ago its last lesson was, and the closed ones below ran oldest
    // first. Real case: #10399, whose August ACTIVE group was listed above the
    // May/June closed ones, which were themselves in reverse order.
    it('orders groups by their most recent lesson, newest first', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.company.findUnique.mockResolvedValue({ systemStartDate: null });
      const enr = (
        id: string,
        groupId: string,
        name: string,
        status: string,
        createdAt: string,
      ) => ({
        id,
        status,
        startDate: new Date(createdAt),
        createdAt: new Date(createdAt),
        group: {
          id: groupId,
          name,
          course: { name: 'A1', lessonPaymentCount: 12 },
        },
      });
      // Returned in enrollment-creation order, like the SQL does.
      prisma.enrollment.findMany.mockResolvedValue([
        enr('enr-27', 'grp-27', '#027', 'DROPPED', '2026-05-01'),
        enr('enr-33', 'grp-33', '#033', 'DROPPED', '2026-05-21'),
        enr('enr-51', 'grp-51', '#051', 'ACTIVE', '2026-08-11'),
      ]);
      const att = (groupId: string, date: string) => ({
        id: `att-${groupId}-${date}`,
        groupId,
        date: new Date(date),
        status: 'PRESENT',
      });
      prisma.attendance.findMany.mockResolvedValue([
        att('grp-27', '2026-05-09'),
        att('grp-27', '2026-05-21'),
        att('grp-33', '2026-05-22'),
        att('grp-33', '2026-05-29'),
        att('grp-51', '2026-08-11'),
      ]);

      const res = await service.getLessonsOverview(10001, 1001, true);

      expect(res.groups.map((g) => g.groupName)).toEqual([
        '#051', // 11.08
        '#033', // 29.05
        '#027', // 21.05
      ]);
    });

    it('places a group with no lessons yet by its start date, not last', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
      prisma.company.findUnique.mockResolvedValue({ systemStartDate: null });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-old',
          status: 'DROPPED',
          startDate: new Date('2026-05-01'),
          createdAt: new Date('2026-05-01'),
          group: {
            id: 'grp-old',
            name: '#027',
            course: { name: 'A1', lessonPaymentCount: 12 },
          },
        },
        {
          // Enrolled today, first lesson not held yet — belongs on top.
          id: 'enr-new',
          status: 'ACTIVE',
          startDate: new Date('2026-08-13'),
          createdAt: new Date('2026-08-13'),
          group: {
            id: 'grp-new',
            name: '#051',
            course: { name: 'A1', lessonPaymentCount: 12 },
          },
        },
      ]);
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          groupId: 'grp-old',
          date: new Date('2026-05-09'),
          status: 'PRESENT',
        },
      ]);

      const res = await service.getLessonsOverview(10001, 1001, true);

      expect(res.groups.map((g) => g.groupName)).toEqual(['#051', '#027']);
      expect(res.groups[0].total).toBe(0);
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
          createdAt: new Date('2026-05-01'),
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
          createdAt: new Date('2026-05-01'),
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

    describe('monthly era (ADR-0062)', () => {
      const att = (
        date: string,
        status = 'PRESENT',
        cancellationId: string | null = null,
      ) => ({
        id: `att-${date}`,
        groupId: 'grp-1',
        date: new Date(`${date}T00:00:00.000Z`),
        status,
        cancellationId,
      });
      const charge = (
        periodMonth: number,
        coveredLessons: number,
        status = 'CHARGED',
      ) => ({
        enrollmentId: 'enr-1',
        periodYear: 2026,
        periodMonth,
        status,
        coveredLessons,
      });

      beforeEach(() => {
        prisma.student.findFirst.mockResolvedValue({ id: 10001 });
        prisma.enrollment.findMany.mockResolvedValue([
          {
            id: 'enr-1',
            status: 'ACTIVE',
            startDate: new Date('2026-05-01'),
            createdAt: new Date('2026-05-01'),
            group: {
              id: 'grp-1',
              name: '#014',
              course: { name: 'Standart', lessonPaymentCount: 12 },
            },
          },
        ]);
      });

      it('blocks lessons by month from the first monthly charge; earlier ones stay in cycles', async () => {
        prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
          charge(9, 13),
          charge(10, 13),
        ]);
        prisma.attendance.findMany.mockResolvedValue([
          att('2026-08-28'),
          att('2026-08-31'),
          att('2026-09-28'),
          att('2026-09-30', 'ABSENT'),
          att('2026-10-02', 'LATE'),
        ]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { enrollmentId: { in: ['enr-1'] } },
          }),
        );
        expect(g.cycles).toEqual([
          {
            kind: 'CYCLE',
            cycleSequenceNumber: 1,
            month: null,
            capacity: 12,
            lessonCount: 2,
            attended: 2,
            firstDate: '2026-08-28',
            lastDate: '2026-08-31',
          },
          {
            kind: 'MONTH',
            cycleSequenceNumber: null,
            month: '2026-09',
            capacity: 13,
            lessonCount: 2,
            attended: 1,
            firstDate: '2026-09-28',
            lastDate: '2026-09-30',
          },
          {
            kind: 'MONTH',
            cycleSequenceNumber: null,
            month: '2026-10',
            capacity: 13,
            lessonCount: 1,
            attended: 1,
            firstDate: '2026-10-02',
            lastDate: '2026-10-02',
          },
        ]);
        expect(
          g.lessons.map((l) => [l.date, l.cycleSequenceNumber, l.month]),
        ).toEqual([
          ['2026-08-28', 1, null],
          ['2026-08-31', 1, null],
          ['2026-09-28', null, '2026-09'],
          ['2026-09-30', null, '2026-09'],
          ['2026-10-02', null, '2026-10'],
        ]);
      });

      it("leaves a month's cancelled lesson out of its block", async () => {
        prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
          charge(10, 12),
        ]);
        prisma.attendance.findMany.mockResolvedValue([
          att('2026-10-02'),
          att('2026-10-05', 'EXCUSED', 'canc-1'),
        ]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(g.total).toBe(1);
        expect(g.cycles).toEqual([
          expect.objectContaining({
            kind: 'MONTH',
            month: '2026-10',
            capacity: 12,
            lessonCount: 1,
          }),
        ]);
      });

      it('a month whose charge was reversed has no capacity', async () => {
        prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
          charge(9, 13, 'REVERSED'),
        ]);
        prisma.attendance.findMany.mockResolvedValue([att('2026-09-30')]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(g.cycles).toEqual([
          expect.objectContaining({
            kind: 'MONTH',
            month: '2026-09',
            capacity: null,
          }),
        ]);
      });

      it('without a monthly charge a cancelled lesson still counts, as before', async () => {
        prisma.attendance.findMany.mockResolvedValue([
          att('2026-08-28', 'EXCUSED', 'canc-1'),
        ]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(g.total).toBe(1);
        expect(g.cycles).toEqual([
          expect.objectContaining({ kind: 'CYCLE', cycleSequenceNumber: 1 }),
        ]);
      });
    });
  });

  describe('getActiveEnrollmentsWithPrepaid — freeze dialog preview', () => {
    const packEnrollment = {
      id: 'enr-pack',
      prepaidLessonsRemaining: 3,
      group: {
        id: 'grp-pack',
        name: 'A1 sikl',
        course: {
          price: 400_000,
          lessonPaymentCount: 12,
          paymentModel: 'LESSON_PACK',
        },
      },
    };
    const monthlyEnrollment = {
      id: 'enr-month',
      prepaidLessonsRemaining: 0,
      group: {
        id: 'grp-month',
        name: 'B1 oylik',
        course: {
          price: 450_000,
          lessonPaymentCount: 12,
          paymentModel: 'MONTHLY',
        },
      },
    };

    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue({ id: 10453 });
      prisma.enrollment.findMany.mockResolvedValue([
        packEnrollment,
        monthlyEnrollment,
      ]);
      prisma.transaction.groupBy = jest.fn().mockResolvedValue([]);
    });

    it('lists only the LESSON_PACK enrollment as editable', async () => {
      const res = await service.getActiveEnrollmentsWithPrepaid(10453, 1001);
      expect(res.pack).toEqual([
        {
          enrollmentId: 'enr-pack',
          groupId: 'grp-pack',
          groupName: 'A1 sikl',
          prepaidLessonsRemaining: 3,
          perLessonCost: 33_333,
          consumedLessons: 0,
          maxRefundable: 3,
          suggestedRefundAmount: 99_999,
        },
      ]);
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            enrollmentId: { in: ['enr-pack'] },
          }),
        }),
      );
    });

    it('shows a MONTHLY enrollment with what the month release would credit today', async () => {
      monthlyCharge.previewReleaseForDeparture.mockResolvedValue({
        lessons: 8,
        amount: 276_920,
        period: '2026-09',
      });
      const res = await service.getActiveEnrollmentsWithPrepaid(10453, 1001);
      expect(res.monthly).toEqual([
        {
          enrollmentId: 'enr-month',
          groupId: 'grp-month',
          groupName: 'B1 oylik',
          releaseLessons: 8,
          releaseAmount: 276_920,
        },
      ]);
      expect(monthlyCharge.previewReleaseForDeparture).toHaveBeenCalledTimes(1);
      expect(monthlyCharge.previewReleaseForDeparture).toHaveBeenCalledWith(
        prisma,
        {
          enrollmentId: 'enr-month',
          departureDate: expect.any(Date),
        },
      );
    });

    it('nothing left this month reads as 0 lessons and 0 so`m', async () => {
      const res = await service.getActiveEnrollmentsWithPrepaid(10453, 1001);
      expect(res.monthly[0]).toMatchObject({
        releaseLessons: 0,
        releaseAmount: 0,
      });
    });
  });
});
