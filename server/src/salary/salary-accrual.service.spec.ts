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
          branchId: 2,
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

  describe('center top-up (Faza 2)', () => {
    const version = {
      id: 'v-1',
      salaryType: 'PERCENTAGE',
      value: 30,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    };

    it('centerFunded bypasses the B.1 gate and marks isCenterTopUp=true', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'acc-1' });

      const result = await service.createAccrual({
        ...baseParams,
        deductionTransactionId: null, // no student coverage — the center fronts it
        centerFunded: true,
      });

      expect(result).toEqual({ id: 'acc-1' });
      // A center top-up is written straight into the open period being settled —
      // it must NOT probe for a closed period / carry over.
      expect(prisma.salaryPayment.findFirst).not.toHaveBeenCalled();
      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // Both flags TRUE on a center-funded create; wasCenterTopUp is sticky.
          create: expect.objectContaining({
            isCenterTopUp: true,
            wasCenterTopUp: true,
          }),
          // A gap-sweep re-run re-asserts the sticky flag TRUE, never clears it.
          update: expect.objectContaining({ wasCenterTopUp: true }),
        }),
      );
    });

    it('covered path clears isCenterTopUp but keeps wasCenterTopUp sticky (recovery flip)', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'acc-1' });

      await service.createAccrual(baseParams); // ordinary student-covered accrual

      const call = prisma.salaryAccrual.upsert.mock.calls[0][0];
      // Fresh covered accrual: both flags FALSE on create.
      expect(call.create).toEqual(
        expect.objectContaining({ isCenterTopUp: false, wasCenterTopUp: false }),
      );
      // Recovery flip: isCenterTopUp cleared; wasCenterTopUp is NOT touched on
      // the covered path (stays whatever the row had — TRUE if it was a top-up).
      expect(call.update).toEqual(
        expect.objectContaining({ isCenterTopUp: false }),
      );
      expect(call.update).not.toHaveProperty('wasCenterTopUp');
    });

    it('does NOT notify carry-over when recovering a row the center already paid', async () => {
      // Lesson period is closed → the carry-over branch computes creditPeriodDate…
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'closed-1', status: 'PAID' }) // lesson period closed
        .mockResolvedValueOnce(null); // current period still open
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      // …but the accrual already exists (a center top-up already paid it).
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce({ id: 'existing' });
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'existing' });

      const sink: any[] = [];
      await service.createAccrual({ ...baseParams, carriedOverSink: sink });

      expect(sink).toHaveLength(0); // no spurious "oldingi oydan" notification
    });

    it('still notifies a genuinely fresh carried-over accrual', async () => {
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'closed-1', status: 'PAID' })
        .mockResolvedValueOnce(null);
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce(null); // fresh accrual
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'new' });

      const sink: any[] = [];
      await service.createAccrual({ ...baseParams, carriedOverSink: sink });

      expect(sink).toHaveLength(1);
      expect(sink[0]).toEqual(
        expect.objectContaining({ teacherId: 1, studentId: 100 }),
      );
    });
  });

  describe('BR-13 — July+ late payment never double-pays the teacher', () => {
    const version = {
      id: 'v-1',
      salaryType: 'PERCENTAGE',
      value: 30,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    };
    const julyLesson = new Date('2026-07-10T00:00:00.000Z');

    it('recovering a center-fronted July lesson (late payment) writes NO new teacher balance credit', async () => {
      // The July period is closed; a center top-up already paid the teacher for
      // this lesson. The student now pays late → covered path recovers it.
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'closed-jul', status: 'PAID' }) // July closed
        .mockResolvedValueOnce(null); // current period open
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce({ id: 'existing' }); // top-up row exists
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'existing' });
      // The top-up already wrote the SALARY_ACCRUAL balance mirror → idempotency hit.
      prisma.transaction.findFirst.mockResolvedValue({ id: 'accr-tx' });

      await service.createAccrual({ ...baseParams, lessonDate: julyLesson });

      // Recovery flip only — the teacher's balance is NOT credited a second time.
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      const call = prisma.salaryAccrual.upsert.mock.calls[0][0];
      expect(call.update).toEqual(expect.objectContaining({ isCenterTopUp: false }));
    });

    it('a July+ late payment for a NEVER-topped-up lesson DOES pay the teacher (fresh carry)', async () => {
      // No prior accrual (e.g. a BR-09-withheld new student, or a teacher whose
      // top-up sweep skipped them) → the teacher was never paid, so pay now.
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'closed-jul', status: 'PAID' })
        .mockResolvedValueOnce(null);
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce(null); // fresh
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'new' });
      // No prior balance mirror → applyAccrualToBalance actually credits.
      prisma.transaction.findFirst.mockResolvedValue(null);

      const sink: any[] = [];
      await service.createAccrual({ ...baseParams, lessonDate: julyLesson, carriedOverSink: sink });

      const call = prisma.salaryAccrual.upsert.mock.calls[0][0];
      expect(call.create.creditPeriodDate).toBeInstanceOf(Date); // carried to current period
      expect(prisma.transaction.create).toHaveBeenCalled(); // teacher balance credited
      expect(sink).toHaveLength(1); // teacher notified "oldingi oydan"
    });
  });

  describe('branch stamping (D3 — pay follows the lesson)', () => {
    const version = {
      id: 'v-1',
      salaryType: 'PERCENTAGE',
      value: 30,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    };

    it("stamps the mirror SALARY_ACCRUAL with the GROUP's branch, not the teacher's", async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce(null);
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'new' });
      prisma.transaction.findFirst.mockResolvedValue(null);

      await service.createAccrual({ ...baseParams });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2 }),
        }),
      );
    });

    it('writes null rather than guessing when the group has no branch', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce(null);
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'new' });
      prisma.transaction.findFirst.mockResolvedValue(null);
      prisma.group.findUnique
        .mockResolvedValueOnce({ course: { lessonPaymentCount: 12 } }) // rate lookup
        .mockResolvedValueOnce(null); // branch lookup: group vanished

      await service.createAccrual({ ...baseParams });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: null }),
        }),
      );
    });

    it('reversal inherits the original row branch so it cannot land in another P&L', async () => {
      prisma.salaryAccrual.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        amount: 5000,
        attendanceId: 'att-1',
        reversedAt: null,
      });
      prisma.salaryAccrual.update.mockResolvedValue({ id: 'acc-1' });
      prisma.transaction.findFirst.mockResolvedValueOnce({
        id: 'tx-orig',
        amount: 5000,
        companyId: 1,
        branchId: 2,
      });

      await service.reverseAccrualForAttendance({
        teacherId: baseParams.teacherId,
        studentId: baseParams.studentId,
        groupId: baseParams.groupId,
        lessonDate: baseParams.lessonDate,
        // No `attendanceId` — the method locates the accrual by
        // teacher+student+group+lessonDate and never took one. Passing it was
        // inert, and it read as though the reversal were keyed on it.
        reversalReason: 'test',
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: 2,
            reversedTransactionId: 'tx-orig',
          }),
        }),
      );
    });
  });

  describe('BR-09b — center-funded backfill (creditPeriodDateOverride)', () => {
    const version = {
      id: 'v-1',
      salaryType: 'PERCENTAGE',
      value: 30,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    };

    it('credits a center-funded backfill to the explicit override period (no closed-period probe)', async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.findUnique.mockResolvedValueOnce(null);
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'backfill' });
      const override = new Date('2026-08-01T00:00:00.000Z');

      await service.createAccrual({
        ...baseParams,
        deductionTransactionId: null, // center fronts it
        centerFunded: true,
        creditPeriodDateOverride: override,
        lessonDate: new Date('2026-07-10T00:00:00.000Z'),
      });

      // Center-funded → no closed-period lookup; the override is used directly.
      expect(prisma.salaryPayment.findFirst).not.toHaveBeenCalled();
      const call = prisma.salaryAccrual.upsert.mock.calls[0][0];
      expect(call.create.creditPeriodDate).toEqual(override);
      expect(call.create.isCenterTopUp).toBe(true);
      expect(call.create.wasCenterTopUp).toBe(true);
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

    it('treats a CALCULATED period as settled → carries a late accrual over', async () => {
      // 1st findFirst: the lesson's own period is merely CALCULATED (the cron
      // ran but the CEO hasn't approved it). It must now count as "settled".
      // 2nd findFirst: the current period is open (null) → safe to credit.
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'sp-1', status: 'CALCULATED' })
        .mockResolvedValueOnce(null);
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      // The closed-period query (1st call) must include CALCULATED so a late
      // payment for an already-settled month carries forward instead of leaking.
      const closedQuery = prisma.salaryPayment.findFirst.mock.calls[0][0];
      expect(closedQuery.where.status.in).toEqual(
        expect.arrayContaining(['CALCULATED', 'APPROVED', 'PAID']),
      );
      // ...and it actually carried over.
      const call = prisma.salaryAccrual.upsert.mock.calls[0][0];
      expect(call.create.creditPeriodDate).toBeInstanceOf(Date);
      expect(call.update).not.toHaveProperty('creditPeriodDate');
    });

    it('keeps the safety-net (current-period) query on APPROVED/PAID only', async () => {
      prisma.salaryPayment.findFirst
        .mockResolvedValueOnce({ id: 'sp-1', status: 'CALCULATED' })
        .mockResolvedValueOnce(null);
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'PERCENTAGE',
        value: 30,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      // A CALCULATED current-period draft must still be able to RECEIVE the
      // carry-over, so the safety-net check must not treat CALCULATED as closed.
      const safetyNetQuery = prisma.salaryPayment.findFirst.mock.calls[1][0];
      expect(safetyNetQuery.where.status.in).toEqual(['APPROVED', 'PAID']);
      expect(safetyNetQuery.where.status.in).not.toContain('CALCULATED');
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
