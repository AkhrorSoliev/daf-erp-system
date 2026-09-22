import { Test, TestingModule } from '@nestjs/testing';
import { ReportsStudentPaymentsService } from './reports-student-payments.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The bug this locks down, from production: a Click payment recorded at
 * 2026-08-05T19:18:44Z is 06.08.2026 00:18 in Tashkent, and the receipt the
 * student holds says 06.08. The report filtered on plain UTC midnights, so
 * ?startDate=2026-08-05&endDate=2026-08-05 listed it under 05.08 — while the
 * table's own date column, rendered in the browser's Tashkent clock, showed
 * 06.08 on the very same row.
 *
 * Rather than assert the exact bounds, each case asks the question a user
 * asks: "is this instant in the day I picked?"
 */
describe('ReportsStudentPaymentsService — Tashkent day filtering', () => {
  let service: ReportsStudentPaymentsService;
  let capturedWhere: any;

  beforeEach(async () => {
    capturedWhere = undefined;
    const prisma = {
      $transaction: (ops: any[]) => Promise.all(ops),
      payment: {
        findMany: (args: any) => {
          capturedWhere = args.where;
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(0),
        aggregate: () => Promise.resolve({ _sum: { amount: 0 } }),
        groupBy: () => Promise.resolve([]),
      },
      student: { findMany: () => Promise.resolve([]) },
      enrollment: { findMany: () => Promise.resolve([]) },
      contract: { findMany: () => Promise.resolve([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsStudentPaymentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ReportsStudentPaymentsService);
  });

  /** Does the built filter contain this instant? */
  const covers = async (day: string, iso: string) => {
    await service.getStudentPaymentsReport(1001, {
      startDate: day,
      endDate: day,
    });
    const f = capturedWhere.createdAt;
    const t = new Date(iso);
    const lowerOk = !f.gte || t >= f.gte;
    const upperOk = f.lt ? t < f.lt : t <= f.lte;
    return lowerOk && upperOk;
  };

  const AFTER_MIDNIGHT = '2026-08-05T19:18:44.000Z'; // 06.08 00:18 Tashkent
  const LATE_EVENING = '2026-08-05T18:30:00.000Z'; // 05.08 23:30 Tashkent
  const EARLY_MORNING = '2026-08-04T20:30:00.000Z'; // 05.08 01:30 Tashkent

  it('does not list an after-midnight payment under the previous day', async () => {
    expect(await covers('2026-08-05', AFTER_MIDNIGHT)).toBe(false);
  });

  it('lists an after-midnight payment under the day the receipt shows', async () => {
    expect(await covers('2026-08-06', AFTER_MIDNIGHT)).toBe(true);
  });

  it('keeps a late-evening payment in its own day', async () => {
    expect(await covers('2026-08-05', LATE_EVENING)).toBe(true);
  });

  it('finds an early-morning payment that the UTC window used to hide', async () => {
    expect(await covers('2026-08-05', EARLY_MORNING)).toBe(true);
  });
});
