import { Test, TestingModule } from '@nestjs/testing';
import { SalarySummaryService } from './salary-summary.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Focused on the teacher-advance surfacing: the summary must expose
 * `advancesTotal` (all TEACHER_ADVANCE expenses handed to the teacher) and
 * `advancesPending` (the unsettled slice) so the salary view reflects money
 * given as an advance — not just net salary payments.
 */
describe('SalarySummaryService', () => {
  let service: SalarySummaryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      salaryAccrual: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      salaryPayment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 700_000 } }),
      },
      // Two aggregate calls: [0] = all advances, [1] = pending (unsettled).
      expense: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: 300_000 } })
          .mockResolvedValueOnce({ _sum: { amount: 100_000 } }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalarySummaryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalarySummaryService>(SalarySummaryService);
  });

  /**
   * The old `expectedMonthly` was a forecast — active students × a hardcoded
   * `exactDays.length * 4` lessons × rate — and it sat next to the real
   * monthly report showing a completely different figure for the same teacher.
   * The summary now only carries group CONTEXT; every money number comes from
   * `SalaryMonthlyService`.
   */
  describe('lesson-count forecast removal', () => {
    const withOneGroup = () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([
        { salaryType: 'PERCENTAGE', value: 30, groupId: null, group: null },
      ]);
      prisma.groupTeacher.findMany.mockResolvedValue([
        {
          group: {
            id: 5,
            name: '#005',
            exactDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
            statusEnum: 'ACTIVE',
            course: { price: 600_000, lessonPaymentCount: 12 },
            _count: { enrollments: 23 },
          },
        },
      ]);
    };

    it('does not return a top-level expectedMonthly forecast', async () => {
      withOneGroup();

      const result = await service.getTeacherSalarySummary(10010, 1);

      expect(result).not.toHaveProperty('expectedMonthly');
    });

    it('does not return per-group forecast money', async () => {
      withOneGroup();

      const result = await service.getTeacherSalarySummary(10010, 1);

      expect(result.groups[0]).not.toHaveProperty('expectedMonthly');
      expect(result.groups[0]).not.toHaveProperty('expectedPerLesson');
    });

    it('keeps the group context the profile still renders', async () => {
      withOneGroup();

      const result = await service.getTeacherSalarySummary(10010, 1);

      expect(result.groups[0]).toMatchObject({
        groupId: 5,
        groupName: '#005',
        activeStudents: 23,
        salaryType: 'PERCENTAGE',
        salaryValue: 30,
        coursePrice: 600_000,
      });
    });
  });

  it('surfaces total and pending teacher advances', async () => {
    const result = await service.getTeacherSalarySummary(10010, 1);

    expect(result.paidTotal).toBe(700_000);
    expect(result.advancesTotal).toBe(300_000);
    expect(result.advancesPending).toBe(100_000);
  });

  it('scopes the advance aggregate to TEACHER_ADVANCE for this teacher', async () => {
    await service.getTeacherSalarySummary(10010, 1);

    expect(prisma.expense.aggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'TEACHER_ADVANCE',
          relatedUserId: 10010,
          companyId: 1,
          deletedAt: null,
        }),
      }),
    );
    // Pending query additionally filters to not-yet-settled advances.
    expect(prisma.expense.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'TEACHER_ADVANCE',
          relatedUserId: 10010,
          settledBySalaryPaymentId: null,
        }),
      }),
    );
  });

  it('defaults advances to 0 when none exist', async () => {
    prisma.expense.aggregate
      .mockReset()
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } });

    const result = await service.getTeacherSalarySummary(10010, 1);

    expect(result.advancesTotal).toBe(0);
    expect(result.advancesPending).toBe(0);
  });
});
