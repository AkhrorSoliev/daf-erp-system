import { Test, TestingModule } from '@nestjs/testing';
import { SalaryAccrualService } from './salary-accrual.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SalaryAccrualService', () => {
  let service: SalaryAccrualService;
  let prisma: any;

  const baseParams = {
    teacherId: 1,
    studentId: 100,
    groupId: 'group-1',
    attendanceId: 'attendance-1',
    lessonDate: new Date('2026-04-15T08:00:00.000Z'),
    perLessonCost: 33_333,
    companyId: 1,
    deductionTransactionId: 'tx-1',
  };

  beforeEach(async () => {
    prisma = {
      salaryPayment: { findFirst: jest.fn().mockResolvedValue(null) },
      // resolveCurrentPeriod reads this; null → default cycleStartDay (8).
      salaryPeriodSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      employeeSalaryConfigVersion: { findFirst: jest.fn() },
      group: {
        findUnique: jest.fn().mockResolvedValue({
          course: { lessonPaymentCount: 12 },
        }),
      },
      salaryAccrual: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      // Defaults so applyAccrualToBalance / reverseAccrualBalance run silently
      // in tests that don't care about balance side-effects.
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 1, balance: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryAccrualService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalaryAccrualService>(SalaryAccrualService);
  });

  describe('coverage gate (B.1)', () => {
    it('returns null when deductionTransactionId is missing', async () => {
      const result = await service.createAccrual({
        ...baseParams,
        deductionTransactionId: null,
      });
      expect(result).toBeNull();
      expect(prisma.salaryAccrual.upsert).not.toHaveBeenCalled();
    });
  });

  describe('two-query config lookup (P1.4 — groupId DESC was unsafe)', () => {
    it('uses per-group version when one matches', async () => {
      const groupVersion = {
        id: 'ver-group',
        salaryType: 'PERCENTAGE',
        value: 40,
      };
      prisma.employeeSalaryConfigVersion.findFirst
        .mockResolvedValueOnce(groupVersion);

      await service.createAccrual(baseParams);

      // Per-group query first
      expect(prisma.employeeSalaryConfigVersion.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            config: expect.objectContaining({ groupId: 'group-1' }),
          }),
        }),
      );
      // Global lookup not made — group version was found
      expect(prisma.employeeSalaryConfigVersion.findFirst).toHaveBeenCalledTimes(1);
    });

    it('falls back to global when per-group has no version', async () => {
      const globalVersion = {
        id: 'ver-global',
        salaryType: 'PERCENTAGE',
        value: 30,
      };
      prisma.employeeSalaryConfigVersion.findFirst
        .mockResolvedValueOnce(null) // per-group: none
        .mockResolvedValueOnce(globalVersion); // global: found

      await service.createAccrual(baseParams);

      expect(prisma.employeeSalaryConfigVersion.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.employeeSalaryConfigVersion.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            config: expect.objectContaining({ groupId: null }),
          }),
        }),
      );
    });

    it('returns null when neither per-group nor global has a version', async () => {
      prisma.employeeSalaryConfigVersion.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.createAccrual(baseParams);
      expect(result).toBeNull();
      expect(prisma.salaryAccrual.upsert).not.toHaveBeenCalled();
    });
  });

  describe('amount calculation', () => {
    it('PERCENTAGE: round(perLessonCost × value / 100)', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      // 33,333 × 30 / 100 = 9,999.9 → 10,000 (Math.round)
      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amount: 10_000 }),
        }),
      );
    });

    it('FIXED_PER_STUDENT: divides value by lessonPaymentCount (P0.5 fix)', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'FIXED_PER_STUDENT',
        value: 250_000, // per cycle
      });
      prisma.group.findUnique.mockResolvedValueOnce({
        course: { lessonPaymentCount: 12 },
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      // 250,000 / 12 = 20,833.3 → 20,833 — NOT 250,000 (the old bug
      // wrote 250k per lesson, inflating teacher pay by 12×).
      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amount: 20_833 }),
        }),
      );
    });

    it('FIXED_PER_STUDENT with 20-lesson Intensiv: divides by 20', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'FIXED_PER_STUDENT',
        value: 400_000,
      });
      prisma.group.findUnique.mockResolvedValueOnce({
        course: { lessonPaymentCount: 20 },
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      // 400,000 / 20 = 20,000
      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amount: 20_000 }),
        }),
      );
    });
  });

  describe('persisted audit', () => {
    it('saves perLessonCost and salaryConfigVersionId', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'ver-abc',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            perLessonCost: 33_333,
            salaryConfigVersionId: 'ver-abc',
          }),
        }),
      );
    });

    it('clears reversal audit on update (re-asserting after undo)', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            reversedAt: null,
            reversedById: null,
            reversalReason: null,
          }),
        }),
      );
    });
  });

  describe('period-closed guard → carry-over', () => {
    it('carries the accrual into the current open period when lessonDate is in a closed (APPROVED) period', async () => {
      // 1st findFirst: the lesson's own period is closed (APPROVED).
      // 2nd findFirst: the current period is open (null) → safe to credit.
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'sp-1', status: 'APPROVED' })
        .mockResolvedValueOnce(null);
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      // Carry-over does NOT skip the accrual — the rate is still resolved.
      expect(prisma.employeeSalaryConfigVersion.findFirst).toHaveBeenCalled();

      const call = prisma.salaryAccrual.upsert.mock.calls[0][0];
      // lessonDate is preserved (drives rate version + breakdown display).
      expect(call.create.lessonDate).toEqual(baseParams.lessonDate);
      // creditPeriodDate set to the current open period start.
      expect(call.create.creditPeriodDate).toBeInstanceOf(Date);
      // Write-once: the update branch must NEVER touch creditPeriodDate, so a
      // re-run can't drift the carry-over target to a later period.
      expect(call.update).not.toHaveProperty('creditPeriodDate');
    });

    it('pushes a carry-over event into the provided sink', async () => {
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'sp-1', status: 'PAID' })
        .mockResolvedValueOnce(null);
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      const sink: any[] = [];
      await service.createAccrual({ ...baseParams, carriedOverSink: sink });

      expect(sink).toHaveLength(1);
      expect(sink[0]).toMatchObject({
        teacherId: 1,
        studentId: 100,
        groupId: 'group-1',
        amount: 10_000, // 33,333 × 30%
      });
      expect(sink[0].creditPeriodDate).toBeInstanceOf(Date);
    });

    it('falls back to null when the current period is ALSO closed (no open period to credit)', async () => {
      // Both the lesson period and the current period are closed — there is
      // nowhere safe to credit, so preserve the old refuse-and-log behaviour.
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'sp-1', status: 'APPROVED' })
        .mockResolvedValueOnce({ id: 'sp-2', status: 'PAID' });

      const result = await service.createAccrual(baseParams);
      expect(result).toBeNull();
      expect(prisma.employeeSalaryConfigVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.salaryAccrual.upsert).not.toHaveBeenCalled();
    });
  });

  describe('reverseAccrualForAttendance', () => {
    it('marks the accrual reversed when one exists and is not already reversed', async () => {
      prisma.salaryAccrual.findFirst.mockResolvedValue({
        id: 'a-1',
        reversedAt: null,
      });
      prisma.salaryAccrual.update.mockResolvedValue({});

      await service.reverseAccrualForAttendance({
        teacherId: 1,
        studentId: 100,
        groupId: 'group-1',
        lessonDate: new Date('2026-04-15T08:00:00.000Z'),
        reversedById: 99,
        reversalReason: 'cancelled',
      });

      expect(prisma.salaryAccrual.update).toHaveBeenCalledWith({
        where: { id: 'a-1' },
        data: expect.objectContaining({
          reversedById: 99,
          reversalReason: 'cancelled',
        }),
      });
    });

    it('returns null when accrual already reversed (idempotent)', async () => {
      prisma.salaryAccrual.findFirst.mockResolvedValue({
        id: 'a-1',
        reversedAt: new Date(),
      });
      const result = await service.reverseAccrualForAttendance({
        teacherId: 1,
        studentId: 100,
        groupId: 'group-1',
        lessonDate: new Date(),
      });
      expect(result).toBeNull();
      expect(prisma.salaryAccrual.update).not.toHaveBeenCalled();
    });
  });
});
