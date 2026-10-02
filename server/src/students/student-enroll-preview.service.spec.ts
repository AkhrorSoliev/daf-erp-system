import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudentEnrollPreviewService } from './student-enroll-preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';

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
  };
  let previewChargeForNewEnrollment: jest.Mock;
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
    };
    previewChargeForNewEnrollment = jest.fn().mockResolvedValue(october);
    service = new StudentEnrollPreviewService(
      prisma as unknown as PrismaService,
      { previewChargeForNewEnrollment } as unknown as MonthlyChargeService,
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

  it('owes only the debt when no first month would be charged', async () => {
    previewChargeForNewEnrollment.mockResolvedValue(null);
    prisma.student.findFirst.mockResolvedValue({
      id: studentId,
      balance: -40000,
      discountPercent: 0,
    });

    const r = await service.preview(studentId, companyId, 10001, groupId);

    expect(r.firstMonth).toBeNull();
    expect(r.payable).toBe(40000);
  });

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
      payable: 1000000,
    });
    expect(previewChargeForNewEnrollment).not.toHaveBeenCalled();
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
});
