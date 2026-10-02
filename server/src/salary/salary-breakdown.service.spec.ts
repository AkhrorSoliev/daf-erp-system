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
        where: {
          settledBySalaryPaymentId: 'sp1',
          companyId: 1,
          deletedAt: null,
        },
      }),
    );
  });

  it("o'chirilgan avansni varaqaga qo'shmaydi", async () => {
    // Avansni o'chirish endi saytdan mumkin. O'chirilgan avans varaqada
    // qolsa, «grossTotal − avanslar = to'langan» tenglamasi buziladi.
    await service.getPaymentBreakdown('sp1', 1);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
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

  describe('stavka birligi har bir qatorda (A3.2)', () => {
    // `rateBasis`: «month» — FIXED_PER_STUDENT o'quvchi boshiga OYIGA, «cycle» —
    // SIKLiga. Kurs hozir oylik bo'lsa ham may–avgust darslari sikl bo'yicha
    // hisoblangan, shuning uchun kursning modeli bilan birga darsning OYI ham
    // hal qiladi (oylik hisob 2026-09 dan).
    const accrual = (
      lessonDate: string,
      paymentModel: 'MONTHLY' | 'LESSON_PACK',
    ) => ({
      id: 'a1',
      amount: 37_500,
      perLessonCost: 37_500,
      // `@db.Date` ustuni Prisma'dan UTC yarim tunida keladi.
      lessonDate: new Date(lessonDate),
      creditPeriodDate: null,
      isCenterTopUp: false,
      attendanceId: 'att-1',
      reversedAt: null,
      reversalReason: null,
      student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' },
      group: {
        id: 'g1',
        name: 'A1-01',
        course: { name: 'Nemis tili', lessonPaymentCount: 12, paymentModel },
      },
      salaryConfigVersion: {
        id: 'v1',
        salaryType: 'FIXED_PER_STUDENT',
        value: 450_000,
        effectiveFrom: new Date('2026-08-01'),
        effectiveTo: null,
        config: { groupId: null },
      },
      reversedBy: null,
    });

    const callers: [
      string,
      (s: SalaryBreakdownService) => Promise<{
        lines: { rateBasis: 'month' | 'cycle' }[];
      }>,
    ][] = [
      [
        'admin oynasi (getPaymentBreakdown)',
        (s) => s.getPaymentBreakdown('sp1', 1),
      ],
      [
        'ustozning joriy davri (getCurrentCycleBreakdown)',
        (s) => s.getCurrentCycleBreakdown(7, 1),
      ],
    ];

    beforeEach(() => {
      prisma.salaryPeriodSetting = {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      };
      prisma.salaryAccrual.findMany.mockResolvedValue([
        accrual('2026-10-15', 'MONTHLY'),
      ]);
      prisma.lessonTeacherOverride.findMany.mockResolvedValue([]);
    });

    describe.each(callers)('%s', (_name, call) => {
      it.each([
        [
          'avgust darsi, oylik kurs (oylik hisobdan oldingi oxirgi kun)',
          'cycle',
          '2026-08-31',
          'MONTHLY',
        ],
        [
          'sentabrning 1-kuni, oylik kurs (oylik hisobning birinchi kuni)',
          'month',
          '2026-09-01',
          'MONTHLY',
        ],
        ['oktabr darsi, oylik kurs', 'month', '2026-10-15', 'MONTHLY'],
        ['oktabr darsi, sikl kursi', 'cycle', '2026-10-15', 'LESSON_PACK'],
      ] as const)('%s → %s', async (_case, expected, lessonDate, model) => {
        prisma.salaryAccrual.findMany.mockResolvedValue([
          accrual(lessonDate, model),
        ]);

        const { lines } = await call(service);

        expect(lines.map((l) => l.rateBasis)).toEqual([expected]);
      });

      it("kursning paymentModel'ini bazadan so'raydi (rateBasis shundan chiqadi)", async () => {
        await call(service);

        // Mock o'zi bergan qatorni qaytaradi, shuning uchun so'rovning o'zini
        // tekshiramiz: select'da paymentModel bo'lmasa, haqiqiy bazada u kelmaydi.
        const { select } = prisma.salaryAccrual.findMany.mock.calls[0][0];
        expect(select.group.select.course.select).toEqual(
          expect.objectContaining({ paymentModel: true }),
        );
      });
    });
  });
});
