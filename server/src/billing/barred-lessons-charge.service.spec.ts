import { BadRequestException } from '@nestjs/common';
import { BarredLessonsChargeService } from './barred-lessons-charge.service';

const OCT = [
  '2026-10-02',
  '2026-10-05',
  '2026-10-07',
  '2026-10-09',
  '2026-10-12',
  '2026-10-14',
  '2026-10-16',
  '2026-10-19',
  '2026-10-21',
  '2026-10-23',
  '2026-10-26',
  '2026-10-28',
  '2026-10-30',
];

// 450 000 over 13 lessons, the first one attended: the #10918 case.
const charge = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  enrollmentId: 'e1',
  periodYear: 2026,
  periodMonth: 10,
  monthlyPrice: 450000,
  plannedLessons: 13,
  discountPercent: 0,
  chargedAmount: 450000,
  coveredLessons: 13,
  coveredDates: OCT,
  frozenOutDates: [] as string[],
  ...over,
});

describe('BarredLessonsChargeService', () => {
  const tx = {
    enrollment: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    enrollmentMonthlyCharge: { findMany: jest.fn(), update: jest.fn() },
    transaction: { findMany: jest.fn() },
    attendance: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    transaction: tx.transaction,
    enrollment: { findMany: jest.fn() },
  };
  const transactionsWrite = { createAdjustment: jest.fn() };
  const lessonBilling = { processAttendanceBilling: jest.fn() };
  const service = new BarredLessonsChargeService(
    prisma as never,
    transactionsWrite as never,
    lessonBilling as never,
  );

  const enr = { studentId: 11001, groupId: 'g031', group: { branchId: 1 } };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.enrollment.findUnique.mockResolvedValue(enr);
    tx.enrollment.findUniqueOrThrow.mockResolvedValue(enr);
    tx.enrollmentMonthlyCharge.findMany.mockResolvedValue([charge()]);
    tx.attendance.upsert.mockResolvedValue({ id: 'a1' });
  });

  describe('release', () => {
    it('takes the barred days off the charge and keeps the attended lesson', async () => {
      const out = await service.release({
        enrollmentId: 'e1',
        barredDays: OCT.slice(1),
        companyId: 1001,
        reason: 'Avtomatik pauza',
      });
      expect(out).toEqual({ refunded: 415385, lessons: 12 });
      expect(transactionsWrite.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 415385,
          studentId: 11001,
          actor: { kind: 'system' },
          metadata: expect.objectContaining({
            kind: 'monthly-release',
            policy: 'BARRED_LESSONS',
            enrollmentId: 'e1',
            period: '2026-10',
            dates: OCT.slice(1),
          }),
        }),
        tx,
      );
      expect(tx.enrollmentMonthlyCharge.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          coveredLessons: 1,
          chargedAmount: 34615,
          frozenOutDates: OCT.slice(1),
        },
      });
    });

    it('refunds everything when the student never came', async () => {
      const out = await service.release({
        enrollmentId: 'e1',
        barredDays: OCT,
        companyId: 1001,
        reason: 'x',
      });
      expect(out).toEqual({ refunded: 450000, lessons: 13 });
    });

    it('does nothing for days already released (safe to run twice)', async () => {
      tx.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        charge({ frozenOutDates: OCT.slice(1) }),
      ]);
      const out = await service.release({
        enrollmentId: 'e1',
        barredDays: OCT.slice(1),
        companyId: 1001,
        reason: 'x',
      });
      expect(out).toEqual({ refunded: 0, lessons: 0 });
      expect(transactionsWrite.createAdjustment).not.toHaveBeenCalled();
      expect(tx.enrollmentMonthlyCharge.update).not.toHaveBeenCalled();
    });

    it('ignores days the charge does not cover', async () => {
      const out = await service.release({
        enrollmentId: 'e1',
        barredDays: ['2026-09-30'],
        companyId: 1001,
        reason: 'x',
      });
      expect(out).toEqual({ refunded: 0, lessons: 0 });
    });

    it('never refunds more than the charge still holds', async () => {
      tx.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        charge({ chargedAmount: 100000 }),
      ]);
      const out = await service.release({
        enrollmentId: 'e1',
        barredDays: OCT,
        companyId: 1001,
        reason: 'x',
      });
      expect(out.refunded).toBe(100000);
    });
  });

  describe('releasedDays', () => {
    const row = (kind: string, dates: string[]) => ({
      metadata: { kind, period: '2026-10', dates },
    });

    it('is the released days minus the restored ones', async () => {
      tx.transaction.findMany.mockResolvedValue([
        row('monthly-release', ['2026-10-05', '2026-10-07', '2026-10-09']),
        row('monthly-restore', ['2026-10-07']),
      ]);
      expect(await service.releasedDays('e1')).toEqual([
        { period: '2026-10', days: ['2026-10-05', '2026-10-09'] },
      ]);
    });

    it('is empty when everything was restored', async () => {
      tx.transaction.findMany.mockResolvedValue([
        row('monthly-release', ['2026-10-05']),
        row('monthly-restore', ['2026-10-05']),
      ]);
      expect(await service.releasedDays('e1')).toEqual([]);
    });
  });

  describe('outstandingForStudent', () => {
    it('lists the released days of each enrollment with that month\u2019s per-lesson price', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          groupId: 'g031',
          group: { name: '#031' },
          monthlyCharges: [
            {
              periodYear: 2026,
              periodMonth: 10,
              monthlyPrice: 450000,
              plannedLessons: 13,
              discountPercent: 0,
            },
          ],
        },
        {
          id: 'e2',
          groupId: 'g010',
          group: { name: '#010' },
          monthlyCharges: [],
        },
      ]);
      tx.transaction.findMany
        .mockResolvedValueOnce([
          {
            metadata: {
              kind: 'monthly-release',
              period: '2026-10',
              dates: ['2026-10-05', '2026-10-07'],
            },
          },
        ])
        .mockResolvedValueOnce([]);

      expect(await service.outstandingForStudent(11001, 1001)).toEqual([
        {
          enrollmentId: 'e1',
          groupId: 'g031',
          groupName: '#031',
          days: [
            { date: '2026-10-05', price: 34615 },
            { date: '2026-10-07', price: 34615 },
          ],
        },
      ]);
    });
  });

  describe('restore', () => {
    const released = (dates: string[]) =>
      tx.transaction.findMany.mockResolvedValue([
        { metadata: { kind: 'monthly-release', period: '2026-10', dates } },
      ]);

    it('charges the attended days again, marks them PRESENT and bills through the one pipeline', async () => {
      released(OCT.slice(1));
      tx.enrollmentMonthlyCharge.findMany.mockResolvedValue([
        charge({
          chargedAmount: 34615,
          coveredLessons: 1,
          frozenOutDates: OCT.slice(1),
        }),
      ]);
      const out = await service.restore({
        enrollmentId: 'e1',
        attendedDays: ['2026-10-05', '2026-10-07'],
        companyId: 1001,
        reason: 'Qaytdi',
        performedById: 7,
      });
      expect(out).toEqual({ charged: 69231, lessons: 2 });
      expect(transactionsWrite.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: -69231,
          actor: { kind: 'user', id: 7 },
          metadata: expect.objectContaining({
            kind: 'monthly-restore',
            dates: ['2026-10-05', '2026-10-07'],
          }),
        }),
        tx,
      );
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
      expect(lessonBilling.processAttendanceBilling).toHaveBeenCalledTimes(2);
      expect(lessonBilling.processAttendanceBilling).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          oldStatus: null,
          newStatus: 'PRESENT',
          enrollmentId: 'e1',
        }),
      );
      const update = tx.enrollmentMonthlyCharge.update.mock.calls[0][0].data;
      expect(update.coveredLessons).toBe(3);
      expect(update.chargedAmount).toBe(34615 + 69231);
      expect(update.frozenOutDates).not.toContain('2026-10-05');
      expect(update.frozenOutDates).toContain('2026-10-09');
    });

    it('refuses a day that was never released, and writes nothing', async () => {
      released(['2026-10-05']);
      await expect(
        service.restore({
          enrollmentId: 'e1',
          attendedDays: ['2026-10-05', '2026-10-07'],
          companyId: 1001,
          reason: 'x',
          performedById: 7,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionsWrite.createAdjustment).not.toHaveBeenCalled();
      expect(tx.attendance.upsert).not.toHaveBeenCalled();
    });

    it('with no days does nothing at all', async () => {
      const out = await service.restore({
        enrollmentId: 'e1',
        attendedDays: [],
        companyId: 1001,
        reason: 'x',
        performedById: 7,
      });
      expect(out).toEqual({ charged: 0, lessons: 0 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
