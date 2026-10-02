import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudentEnrollPreviewService } from './student-enroll-preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';
import { TransactionsWriteService } from '../transactions/transactions-write.service';
import { SettingsService } from '../settings/settings.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';

const companyId = 1001;
const studentId = 10453;
const groupId = 'group-a1';
const ceo = {
  mainBranch: null,
  branches: [],
  roles: [{ role: { name: 'CEO' } }],
};
const administratorOf = (branchIds: number[]) => ({
  mainBranch: branchIds[0] ?? null,
  branches: branchIds.map((branchId) => ({ branchId })),
  roles: [{ role: { name: 'Administrator' } }],
});

const monthlyGroup = {
  id: groupId,
  branchId: 1,
  companyId,
  statusEnum: 'ACTIVE',
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  exactDays: ['tuesday', 'thursday', 'saturday'],
  course: { price: 450000, paymentModel: 'MONTHLY', lessonPaymentCount: 12 },
};
const packGroup = {
  ...monthlyGroup,
  course: {
    price: 1200000,
    paymentModel: 'LESSON_PACK',
    lessonPaymentCount: 12,
  },
};
const october = { plannedLessons: 13, coveredLessons: 8, amount: 249231 };

/** 12:00 in Tashkent on 14.10.2026. */
const NOW = new Date('2026-10-14T07:00:00.000Z');

describe('StudentEnrollPreviewService (A3.4)', () => {
  let prisma: {
    student: { findFirst: jest.Mock };
    studentBranch: { findFirst: jest.Mock };
    group: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    enrollment: { findFirst: jest.Mock };
  };
  let previewChargeForNewEnrollment: jest.Mock;
  let previewReleaseForDeparture: jest.Mock;
  let service: StudentEnrollPreviewService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    prisma = {
      // Read twice: the branch check asks whether the student exists, then
      // the preview reads the card itself.
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: studentId,
          balance: 50000,
          discountPercent: 10,
        }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      group: { findFirst: jest.fn().mockResolvedValue(monthlyGroup) },
      user: { findFirst: jest.fn().mockResolvedValue(ceo) },
      // No active enrollment anywhere: not a transfer.
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    previewChargeForNewEnrollment = jest.fn().mockResolvedValue(october);
    previewReleaseForDeparture = jest.fn().mockResolvedValue(null);
    service = new StudentEnrollPreviewService(
      prisma as unknown as PrismaService,
      {
        previewChargeForNewEnrollment,
        previewReleaseForDeparture,
      } as unknown as MonthlyChargeService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('quotes the first month of a monthly course and what is left to pay after the balance', async () => {
    const r = await service.preview(
      studentId,
      companyId,
      10001,
      groupId,
      '2026-10-17',
    );

    expect(r).toEqual({
      paymentModel: 'MONTHLY',
      coursePrice: 450000,
      lessonPaymentCount: null,
      discountPercent: 10,
      firstMonth: {
        period: '2026-10',
        plannedLessons: 13,
        coveredLessons: 8,
        amount: 249231,
      },
      balance: 50000,
      transferRelease: 0,
      payable: 199231,
    });
    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: groupId, companyId, deletedAt: null },
      }),
    );
    // The enrollment `enrollToGroup` would create, built the same way.
    expect(previewChargeForNewEnrollment).toHaveBeenCalledWith(prisma, {
      enrollment: {
        id: '',
        studentId,
        groupId,
        status: 'ACTIVE',
        startDate: new Date('2026-10-17T00:00:00.000Z'),
        createdAt: NOW,
        returnedAt: null,
        group: expect.objectContaining({
          id: groupId,
          branchId: 1,
          companyId,
          statusEnum: 'ACTIVE',
          startDate: monthlyGroup.startDate,
          exactDays: monthlyGroup.exactDays,
          course: expect.objectContaining({
            price: 450000,
            paymentModel: 'MONTHLY',
          }),
        }),
      },
      periodYear: 2026,
      periodMonth: 10,
      discountPercent: 10,
    });
  });

  it.each([
    // [label, now, startDate, month]
    ['no start day: this month', NOW, undefined, '2026-10'],
    ['a start in an earlier month: this month', NOW, '2026-09-20', '2026-10'],
    ['a start earlier this month: this month', NOW, '2026-10-03', '2026-10'],
    ['a start later this month: this month', NOW, '2026-10-24', '2026-10'],
    ['a start next month: that month', NOW, '2026-11-03', '2026-11'],
    // 01:00 on 01.11 in Tashkent is still 31.10 in UTC.
    [
      'just after midnight in Tashkent on the 1st: the new month',
      new Date('2026-10-31T20:00:00.000Z'),
      undefined,
      '2026-11',
    ],
  ])('picks the month: %s', async (_label, now, startDate, month) => {
    jest.setSystemTime(now);

    const r = await service.preview(
      studentId,
      companyId,
      10001,
      groupId,
      startDate,
    );

    expect(r.firstMonth?.period).toBe(month);
    expect(previewChargeForNewEnrollment).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        enrollment: expect.objectContaining({
          startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
          createdAt: now,
        }),
        periodYear: Number(month.slice(0, 4)),
        periodMonth: Number(month.slice(5, 7)),
      }),
    );
  });

  it.each([
    ['the balance covers it', 300000, 0],
    ['nothing on the balance', 0, 249231],
    ['a debt adds to it', -100000, 349231],
  ])('payable for a monthly course: %s', async (_label, balance, payable) => {
    prisma.student.findFirst.mockResolvedValue({
      id: studentId,
      balance,
      discountPercent: 10,
    });

    const r = await service.preview(studentId, companyId, 10001, groupId);

    expect(r.payable).toBe(payable);
  });

  it('looks one month ahead when nothing is charged, never further, and then owes only the debt', async () => {
    previewChargeForNewEnrollment.mockResolvedValue(null);
    prisma.student.findFirst.mockResolvedValue({
      id: studentId,
      balance: -40000,
      discountPercent: 0,
    });

    const r = await service.preview(studentId, companyId, 10001, groupId);

    expect(r.firstMonth).toBeNull();
    expect(r.payable).toBe(40000);
    expect(previewChargeForNewEnrollment).toHaveBeenCalledTimes(2);
    expect(previewChargeForNewEnrollment).toHaveBeenNthCalledWith(
      1,
      prisma,
      expect.objectContaining({ periodYear: 2026, periodMonth: 10 }),
    );
    expect(previewChargeForNewEnrollment).toHaveBeenNthCalledWith(
      2,
      prisma,
      expect.objectContaining({ periodYear: 2026, periodMonth: 11 }),
    );
  });

  it('rolls from December into January of the next year', async () => {
    jest.setSystemTime(new Date('2026-12-14T07:00:00.000Z'));
    previewChargeForNewEnrollment.mockImplementation(
      (_db: unknown, p: { periodMonth: number }) =>
        Promise.resolve(
          p.periodMonth === 1
            ? { plannedLessons: 13, coveredLessons: 13, amount: 450000 }
            : null,
        ),
    );

    const r = await service.preview(
      studentId,
      companyId,
      10001,
      groupId,
      '2026-12-30',
    );

    expect(r.firstMonth).toEqual({
      period: '2027-01',
      plannedLessons: 13,
      coveredLessons: 13,
      amount: 450000,
    });
    expect(previewChargeForNewEnrollment).toHaveBeenLastCalledWith(
      prisma,
      expect.objectContaining({ periodYear: 2027, periodMonth: 1 }),
    );
  });

  it.each([['FORMING'], ['PAUSED']])(
    'quotes no month for a %s group, and does not look ahead',
    async (statusEnum) => {
      prisma.group.findFirst.mockResolvedValue({ ...monthlyGroup, statusEnum });

      const r = await service.preview(studentId, companyId, 10001, groupId);

      expect(r.firstMonth).toBeNull();
      expect(r.payable).toBe(0); // a balance of 50 000, nothing due
      expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
    },
  );

  it('asks a lesson pack for the pack price, with no first month', async () => {
    prisma.group.findFirst.mockResolvedValue(packGroup);
    prisma.student.findFirst.mockResolvedValue({
      id: studentId,
      balance: 200000,
      discountPercent: 0,
    });

    const r = await service.preview(studentId, companyId, 10001, groupId);

    expect(r).toEqual({
      paymentModel: 'LESSON_PACK',
      coursePrice: 1200000,
      lessonPaymentCount: 12,
      discountPercent: 0,
      firstMonth: null,
      balance: 200000,
      transferRelease: 0,
      payable: 1000000,
    });
    expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
  });

  it('asks a discounted student for the pack at their discount, as pack billing deducts it', async () => {
    prisma.group.findFirst.mockResolvedValue(packGroup);
    prisma.student.findFirst.mockResolvedValue({
      id: studentId,
      balance: 0,
      discountPercent: 10,
    });

    const r = await service.preview(studentId, companyId, 10001, groupId);

    // A full cycle deducts applyDiscount(1 200 000, 10) = 1 080 000; the
    // course price shown beside it stays the course's own.
    expect(r.coursePrice).toBe(1200000);
    expect(r.discountPercent).toBe(10);
    expect(r.payable).toBe(1080000);
  });

  it('answers 404 for an archived student', async () => {
    // The branch check still finds the card; the preview reads live cards only.
    prisma.student.findFirst.mockImplementation(
      ({ where }: { where: { deletedAt?: null } }) =>
        Promise.resolve(where.deletedAt === null ? null : { id: studentId }),
    );

    await expect(
      service.preview(studentId, companyId, 10001, groupId),
    ).rejects.toThrow(new NotFoundException("O'quvchi topilmadi"));
    expect(prisma.group.findFirst).not.toHaveBeenCalled();
  });

  it('answers 404 for a group that is not in the company', async () => {
    prisma.group.findFirst.mockResolvedValue(null);

    await expect(
      service.preview(studentId, companyId, 10001, groupId),
    ).rejects.toThrow(new NotFoundException('Guruh topilmadi'));
    expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
  });

  it("refuses another branch's student before reading the group", async () => {
    prisma.user.findFirst.mockResolvedValue(administratorOf([2]));

    await expect(
      service.preview(studentId, companyId, 10002, groupId),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.group.findFirst).not.toHaveBeenCalled();
    expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
  });

  it("refuses a group of another branch, like the enroll call's own check", async () => {
    prisma.user.findFirst.mockResolvedValue(administratorOf([1]));
    prisma.group.findFirst.mockResolvedValue({ ...monthlyGroup, branchId: 2 });

    await expect(
      service.preview(studentId, companyId, 10002, groupId),
    ).rejects.toThrow(ForbiddenException);
    expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
  });

  it('refuses a caller attached to no branch at all', async () => {
    prisma.user.findFirst.mockResolvedValue(administratorOf([]));

    await expect(
      service.preview(studentId, companyId, 10002, groupId),
    ).rejects.toThrow(ForbiddenException);
    expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
  });

  it('serves an administrator of the branch both belong to', async () => {
    prisma.user.findFirst.mockResolvedValue(administratorOf([1]));

    const r = await service.preview(studentId, companyId, 10002, groupId);

    expect(r.firstMonth?.amount).toBe(249231);
  });

  describe('a transfer: the student is active in another group', () => {
    const oldEnrollment = { id: 'enroll-old', groupId: 'group-old' };

    beforeEach(() => {
      prisma.enrollment.findFirst.mockResolvedValue(oldEnrollment);
    });

    it("counts what the old group's month gives back: paid for October, moved, nothing left to pay", async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: studentId,
        balance: 0,
        discountPercent: 0,
      });
      previewReleaseForDeparture.mockResolvedValue({
        lessons: 13,
        amount: 415000,
        period: '2026-10',
      });
      previewChargeForNewEnrollment.mockResolvedValue({
        plannedLessons: 13,
        coveredLessons: 13,
        amount: 415000,
      });

      const r = await service.preview(studentId, companyId, 10001, groupId);

      expect(r.transferRelease).toBe(415000);
      expect(r.payable).toBe(0);
      // The enrollment `enrollToGroup` would close: the student's live ACTIVE
      // one (one per student, by a unique index).
      expect(prisma.enrollment.findFirst).toHaveBeenCalledWith({
        where: { studentId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, groupId: true },
      });
      // Released as of now, the instant the transfer would use.
      expect(previewReleaseForDeparture).toHaveBeenCalledWith(prisma, {
        enrollmentId: 'enroll-old',
        departureDate: NOW,
      });
    });

    it('leaves the rest to pay when the release falls short of the first month', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: studentId,
        balance: 20000,
        discountPercent: 0,
      });
      previewReleaseForDeparture.mockResolvedValue({
        lessons: 9,
        amount: 300000,
        period: '2026-10',
      });
      previewChargeForNewEnrollment.mockResolvedValue({
        plannedLessons: 13,
        coveredLessons: 13,
        amount: 415000,
      });

      const r = await service.preview(studentId, companyId, 10001, groupId);

      // max(0, 415 000 − (20 000 + 300 000))
      expect(r.payable).toBe(95000);
    });

    it('counts the release for a pack target too', async () => {
      prisma.group.findFirst.mockResolvedValue(packGroup);
      prisma.student.findFirst.mockResolvedValue({
        id: studentId,
        balance: 0,
        discountPercent: 10,
      });
      previewReleaseForDeparture.mockResolvedValue({
        lessons: 13,
        amount: 415000,
        period: '2026-10',
      });

      const r = await service.preview(studentId, companyId, 10001, groupId);

      // max(0, 1 080 000 − 415 000)
      expect(r.transferRelease).toBe(415000);
      expect(r.payable).toBe(665000);
    });

    it('releases nothing when the old month has no standing charge (a pack enrollment, or none written)', async () => {
      previewReleaseForDeparture.mockResolvedValue(null);

      const r = await service.preview(studentId, companyId, 10001, groupId);

      expect(r.transferRelease).toBe(0);
      expect(r.payable).toBe(199231); // 249 231 − 50 000, as with no transfer
    });

    it('is no transfer when the active enrollment is in the target group itself', async () => {
      // The enroll call refuses this («O'quvchi allaqachon bu guruhda»).
      prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enroll-same',
        groupId,
      });

      const r = await service.preview(studentId, companyId, 10001, groupId);

      expect(r.transferRelease).toBe(0);
      expect(previewReleaseForDeparture).not.toHaveBeenCalled();
    });
  });

  it('is no transfer without an active enrollment: no release, payable unchanged', async () => {
    const r = await service.preview(studentId, companyId, 10001, groupId);

    expect(r.transferRelease).toBe(0);
    expect(r.payable).toBe(199231);
    expect(previewReleaseForDeparture).not.toHaveBeenCalled();
  });
});

/**
 * The first charge the student will actually get, worked out by the real
 * `MonthlyChargeService` over months with no holidays, cancellations, moves
 * or earlier charges.
 */
describe('StudentEnrollPreviewService — the first real charge (A3.4)', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let createAdjustment: jest.Mock;
  let monthlyCharge: MonthlyChargeService;
  let service: StudentEnrollPreviewService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: studentId,
          balance: 0,
          discountPercent: 0,
        }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(ceo) },
      group: {
        findFirst: jest.fn().mockResolvedValue(monthlyGroup),
        // The month plan reads the group's dates; with no moves they decide
        // nothing.
        findUnique: jest
          .fn()
          .mockResolvedValue({ startDate: null, endDate: null }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
      enrollmentMonthlyCharge: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      // No active enrollment anywhere: not a transfer.
      enrollment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      // Contract 3.5: an established student by default, never a trial.
      attendance: { count: jest.fn().mockResolvedValue(20) },
    };
    const db = prisma as unknown as PrismaService;
    createAdjustment = jest.fn().mockResolvedValue({ id: 'adj-1' });
    // The code defaults: rule 6.2 at 40%, the trial lesson switched on.
    const settings = {
      get: jest.fn((_companyId: number, key: string) =>
        Promise.resolve(
          key === 'payment.noRefundAfterPercent'
            ? 40
            : key === 'payment.trialLessonEnabled'
              ? true
              : undefined,
        ),
      ),
    };
    monthlyCharge = new MonthlyChargeService(
      db,
      { createAdjustment } as unknown as TransactionsWriteService,
      settings as unknown as SettingsService,
      {} as SalaryAccrualService,
    );
    service = new StudentEnrollPreviewService(db, monthlyCharge);
  });

  afterEach(() => jest.useRealTimers());

  it('quotes next month for a group set ACTIVE before its start next month', async () => {
    // Opens on Thursday 05.11: November has 12 Tue/Thu/Sat lessons, 11 of
    // them from the 5th on.
    prisma.group.findFirst.mockResolvedValue({
      ...monthlyGroup,
      startDate: new Date('2026-11-05T00:00:00.000Z'),
    });
    const quote = jest.spyOn(monthlyCharge, 'previewChargeForNewEnrollment');

    const r = await service.preview(studentId, companyId, 10001, groupId);

    expect(r.firstMonth).toEqual({
      period: '2026-11',
      plannedLessons: 12,
      coveredLessons: 11,
      amount: 412500, // 450 000 × 11/12
    });
    expect(r.payable).toBe(412500);
    // Straight to November: the charge's first day picks it, not a roll.
    expect(quote).toHaveBeenCalledTimes(1);
  });

  it('quotes the next month in full for a start after the last lesson of this one', async () => {
    // September's last Tue/Thu/Sat lesson is Tuesday 29.09: from Wednesday
    // the 30th none is left, so the 1 October run is the first charge.
    jest.setSystemTime(new Date('2026-09-14T07:00:00.000Z'));
    const quote = jest.spyOn(monthlyCharge, 'previewChargeForNewEnrollment');

    const r = await service.preview(
      studentId,
      companyId,
      10001,
      groupId,
      '2026-09-30',
    );

    expect(r.firstMonth).toEqual({
      period: '2026-10',
      plannedLessons: 14,
      coveredLessons: 14,
      amount: 450000,
    });
    expect(quote.mock.calls.map(([, p]) => p.periodMonth)).toEqual([9, 10]);
  });

  describe("a transfer gives back what the transfer's own call gives back", () => {
    /** The old group's October: Mon/Wed/Fri, 13 lessons at 80 000. */
    const OLD_OCTOBER = [
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

    beforeEach(() => {
      prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enroll-old',
        groupId: 'group-old',
      });
      prisma.enrollment.findUnique.mockResolvedValue({
        studentId,
        startDate: null,
        group: { branchId: 1, exactDays: ['monday', 'wednesday', 'friday'] },
      });
      prisma.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-old',
        groupId: 'group-old',
        plannedLessons: 13,
        coveredLessons: 13,
        coveredDates: OLD_OCTOBER,
        frozenOutDates: [],
        perLessonCost: 80000,
        discountPercent: 0,
        chargedAmount: 1040000,
        transactionId: 'tx-old',
        status: 'CHARGED',
      });
    });

    // A transfer names no departure policy, so the write applies
    // CENTER_INITIATIVE and never contract 3.5: a first-timer moving to
    // another group gets the unheld lessons back, not the whole month.
    it.each([
      ['an established student', 20],
      [
        'a first-timer with one lesson held (contract 3.5 is not for transfers)',
        1,
      ],
    ])('%s', async (_label, held) => {
      prisma.attendance.count.mockResolvedValue(held);

      const r = await service.preview(studentId, companyId, 10001, groupId);

      // Through 14.10 six of the 13 lessons are held: 7 × 80 000 come back.
      expect(r.transferRelease).toBe(560000);
      expect(r.payable).toBe(
        Math.max(0, (r.firstMonth?.amount ?? 0) - (0 + 560000)),
      );

      // The call `enrollToGroup` makes on a transfer: no policy.
      const written = await monthlyCharge.reverseChargeForDeparture(
        prisma as unknown as PrismaService,
        {
          enrollmentId: 'enroll-old',
          departureDate: NOW,
          companyId,
          reason: "Guruh o'zgartirilganda",
          performedById: 10001,
        },
      );
      expect(written?.refunded).toBe(r.transferRelease);
      expect(createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: r.transferRelease }),
        prisma,
      );
    });
  });
});
