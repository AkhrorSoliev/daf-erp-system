import { Test, TestingModule } from '@nestjs/testing';
import { DailySnapshotService } from './daily-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

/**
 * The snapshot is the one record here that cannot be rebuilt, so what matters
 * is that it lands: one row per branch plus the company-wide one, every day,
 * with the components rather than a derived percentage.
 */
describe('DailySnapshotService', () => {
  let service: DailySnapshotService;
  let prisma: any;
  let reports: any;

  beforeEach(async () => {
    prisma = {
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      },
      student: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: -500 }, _count: 3 }),
        count: jest.fn().mockResolvedValue(400),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 900 } }),
      },
      dailyFinancialSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    reports = {
      getMonthlyExpectation: jest
        .fn()
        .mockResolvedValue({ expectedValue: 170, heldValue: 13 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue({ currentMonth: 6, lessonsValue: 13 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailySnapshotService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = module.get(DailySnapshotService);
  });

  it('writes one row per branch plus the company-wide row', async () => {
    await service.persistForCompany(1001);

    expect(prisma.dailyFinancialSnapshot.create).toHaveBeenCalledTimes(3);
    const branchIds = prisma.dailyFinancialSnapshot.create.mock.calls.map(
      (c: any) => c[0].data.branchId,
    );
    expect(branchIds).toEqual([null, 1, 2]);
  });

  it('stores the components, never the percentage', async () => {
    await service.persistForCompany(1001);

    const data = prisma.dailyFinancialSnapshot.create.mock.calls[0][0].data;
    expect(data.lessonsHeldValue).toBe(13);
    expect(data.collectedForMonth).toBe(6);
    expect(data.expectedValue).toBe(170);
    expect(data).not.toHaveProperty('collectionPct');
  });

  it('never upserts on the compound unique — NULL branchId would not match', async () => {
    // Postgres: `NULL = NULL` is never true, so an upsert keyed on
    // (companyId, branchId, date) would never find the company-wide row, always
    // attempt an insert, and be rejected by the partial unique index on every
    // run after the first.
    expect(prisma.dailyFinancialSnapshot.upsert).toBeUndefined();

    await service.persistForCompany(1001);

    expect(prisma.dailyFinancialSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 1001, branchId: null }),
      }),
    );
  });

  it('updates in place when the day already has a row', async () => {
    prisma.dailyFinancialSnapshot.findFirst.mockResolvedValue({ id: 77 });

    await service.persistForCompany(1001);

    expect(prisma.dailyFinancialSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.dailyFinancialSnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 77 } }),
    );
  });

  it('scopes every leg of a branch row to that branch', async () => {
    await service.persistForCompany(1001);

    // Student carries no branchId column — it goes through the StudentBranch
    // join, the same predicate every student list uses.
    const branchStudentCall = prisma.student.count.mock.calls.find(
      (c: any) => c[0].where.branches,
    );
    expect(branchStudentCall[0].where.branches).toEqual({
      some: { branchId: 1 },
    });
    expect(reports.getMonthlyExpectation).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({ branchIds: [1] }),
    );
  });

  it('one failing branch does not cost the others their row', async () => {
    prisma.student.count.mockImplementation(async ({ where }: any) => {
      if (where.branches?.some?.branchId === 1) throw new Error('boom');
      return 400;
    });

    await service.persistForCompany(1001);

    const branchIds = prisma.dailyFinancialSnapshot.create.mock.calls.map(
      (c: any) => c[0].data.branchId,
    );
    expect(branchIds).toEqual([null, 2]);
  });
});
