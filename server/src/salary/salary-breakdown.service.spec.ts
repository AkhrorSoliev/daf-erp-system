import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SalaryBreakdownService } from './salary-breakdown.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Focused on advance surfacing in the per-payment breakdown: a payslip must
 * list the TEACHER_ADVANCE expenses netted out of it and report the
 * pre-advance gross so the gap between "earned" and "net paid" is explained.
 */
describe('SalaryBreakdownService', () => {
  let service: SalaryBreakdownService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      salaryPayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sp1',
          userId: 7,
          periodStart: new Date('2026-05-08'),
          periodEnd: new Date('2026-06-07'),
          amount: 700_000, // net, already reduced by the settled advances
          status: 'PAID',
        }),
      },
      // No accruals → fetchAccrualBreakdown returns empty, and the override
      // lookup is skipped (rows.length === 0).
      salaryAccrual: { findMany: jest.fn().mockResolvedValue([]) },
      lessonTeacherOverride: { findMany: jest.fn() },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            amount: 200_000,
            description: 'Avans 1',
            date: new Date('2026-05-12'),
          },
          {
            id: 'e2',
            amount: 100_000,
            description: 'Avans 2',
            date: new Date('2026-05-20'),
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryBreakdownService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalaryBreakdownService>(SalaryBreakdownService);
  });

  it('returns settled advances, their total, and the pre-advance gross', async () => {
    const result = await service.getPaymentBreakdown('sp1', 1);

    expect(result.settledAdvances).toHaveLength(2);
    expect(result.settledAdvancesTotal).toBe(300_000);
    // grossTotal = net amount (700k) + advances (300k) = 1,000,000.
    expect(result.grossTotal).toBe(1_000_000);
    expect(result.payment.amount).toBe(700_000);

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settledBySalaryPaymentId: 'sp1', companyId: 1 },
      }),
    );
  });

  it('reports zero advances when none were settled against the payment', async () => {
    prisma.expense.findMany.mockResolvedValueOnce([]);

    const result = await service.getPaymentBreakdown('sp1', 1);

    expect(result.settledAdvances).toEqual([]);
    expect(result.settledAdvancesTotal).toBe(0);
    expect(result.grossTotal).toBe(700_000);
  });

  it('forbids a teacher from viewing another teacher payment', async () => {
    await expect(
      service.getPaymentBreakdown('sp1', 1, 999),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
