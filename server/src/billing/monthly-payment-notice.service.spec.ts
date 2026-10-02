import { Test } from '@nestjs/testing';
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  StudentStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { LessonAdmissionService } from './lesson-admission.service';
import { MonthlyChargeService } from './monthly-charge.service';
import {
  MonthlyPaymentNoticeService,
  NOTICE_MAX_AGE_MS,
} from './monthly-payment-notice.service';

/** 19:50 Tashkent, 01.10.2026 — the charge day. */
const CHARGE_DAY = new Date('2026-10-01T14:50:00Z');

/** A Mon/Wed/Fri group's October: Fri 2, Mon 5, Wed 7, … — the 2nd lesson is 05.10. */
const OCTOBER = [
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

/** The same group's November: Mon 2, Wed 4, Fri 6, … — the 2nd lesson is 04.11. */
const NOVEMBER = [2, 4, 6, 9, 11, 13, 16, 18, 20, 23, 25, 27, 30].map(
  (d) => `2026-11-${String(d).padStart(2, '0')}`,
);

type Row = Record<string, unknown> & {
  id: string;
  studentId: number;
  periodYear: number;
  periodMonth: number;
  createdAt: Date;
  coveredDates: string[];
};

const charge = (over: Record<string, unknown> = {}): Row => ({
  id: 'charge-1',
  enrollmentId: 'enr-1',
  studentId: 10042,
  groupId: 'g-1',
  branchId: 7,
  periodYear: 2026,
  periodMonth: 10,
  coveredLessons: 13,
  coveredDates: OCTOBER,
  frozenOutDates: [],
  perLessonCost: 80000,
  discountPercent: 0,
  creditLessons: 0,
  creditAmount: 0,
  chargedAmount: 1040000,
  createdAt: new Date('2026-09-30T22:10:00Z'),
  enrollment: { status: EnrollmentStatus.ACTIVE },
  student: { status: StudentStatus.ACTIVE, deletedAt: null },
  group: { name: 'A1-12', exactDays: ['monday', 'wednesday', 'friday'] },
  ...over,
});

describe('MonthlyPaymentNoticeService', () => {
  let service: MonthlyPaymentNoticeService;
  /** What the candidate query (bills or reminders) returns. */
  let candidates: Row[];
  /** Extra standing charges of the same students (another group, same month). */
  let otherCharges: Row[];
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let enqueue: jest.Mock;
  let resolvePlan: jest.Mock;
  let forLesson: jest.Mock;
  let reachForMonth: jest.Mock;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    candidates = [];
    otherCharges = [];
    // The standing-charges query is the only one filtering on `studentId`.
    findMany = jest.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        'studentId' in args.where
          ? [...candidates, ...otherCharges]
          : candidates,
      ),
    );
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    enqueue = jest.fn().mockResolvedValue(undefined);
    resolvePlan = jest
      .fn()
      .mockResolvedValue({ excludedDates: [], addedDates: [] });
    forLesson = jest.fn().mockResolvedValue(new Map());
    reachForMonth = jest.fn().mockResolvedValue(new Map());
    prisma = {
      enrollmentMonthlyCharge: { findMany, updateMany },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const module = await Test.createTestingModule({
      providers: [
        MonthlyPaymentNoticeService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
        {
          provide: MonthlyChargeService,
          useValue: { resolveMonthPlanDates: resolvePlan },
        },
        {
          provide: LessonAdmissionService,
          useValue: { forLesson, reachForMonth },
        },
      ],
    }).compile();
    service = module.get(MonthlyPaymentNoticeService);
  });

  describe('queueChargeNotices', () => {
    it('queues the bill of a new charge and marks the charge in the same transaction', async () => {
      candidates = [charge()];
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'charge-1', noticeQueuedAt: null },
        data: { noticeQueuedAt: CHARGE_DAY },
      });
      expect(enqueue).toHaveBeenCalledWith(
        {
          recipientKind: TelegramDigestRecipientKind.STUDENT,
          recipientId: 10042,
          companyId: 1001,
          branchId: 7,
          category: TelegramDigestCategory.MONTHLY_CHARGE,
          relatedEntityId: 'charge-1',
          payload: {
            chargeId: 'charge-1',
            groupName: 'A1-12',
            daysLabel: 'Du, Cho, Ju',
            periodYear: 2026,
            periodMonth: 10,
            price: 1040000,
            coveredLessons: 13,
            creditLessons: 0,
            creditAmount: 0,
            chargedAmount: 1040000,
            dueDate: '2026-10-05',
          },
        },
        prisma,
      );
    });

    it('prices the month before the excused-lesson credit', async () => {
      candidates = [
        charge({
          creditLessons: 2,
          creditAmount: 160000,
          chargedAmount: 880000,
        }),
      ];
      await service.queueChargeNotices(1001, CHARGE_DAY, true);
      expect(enqueue.mock.calls[0][0].payload).toEqual(
        expect.objectContaining({
          price: 1040000,
          creditLessons: 2,
          creditAmount: 160000,
          chargedAmount: 880000,
        }),
      );
    });

    it('reads unmarked, standing charges of this company written or re-charged in the last three days', async () => {
      await service.queueChargeNotices(1001, CHARGE_DAY, true);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            noticeQueuedAt: null,
            status: MonthlyChargeStatus.CHARGED,
            updatedAt: {
              gte: new Date(CHARGE_DAY.getTime() - NOTICE_MAX_AGE_MS),
            },
          },
        }),
      );
    });

    it("takes the due date from the group's live calendar, not the dates frozen on the charge", async () => {
      candidates = [charge()];
      resolvePlan.mockResolvedValue({
        excludedDates: ['2026-10-05'],
        addedDates: [],
      });
      await service.queueChargeNotices(1001, CHARGE_DAY, true);
      expect(resolvePlan).toHaveBeenCalledWith(prisma, 'g-1', 7, 2026, 10);
      expect(enqueue.mock.calls[0][0].payload.dueDate).toBe('2026-10-07');
    });

    it("announces only the student's first bill of the month — a group transfer's second charge is marked, not announced", async () => {
      const october = charge({ id: 'charge-a' });
      const afterTransfer = charge({
        id: 'charge-b',
        enrollmentId: 'enr-2',
        groupId: 'g-2',
        coveredDates: ['2026-10-16', '2026-10-19'],
        createdAt: new Date('2026-10-15T09:00:00Z'),
      });
      candidates = [afterTransfer];
      otherCharges = [october];
      await expect(
        service.queueChargeNotices(
          1001,
          new Date('2026-10-15T14:50:00Z'),
          true,
        ),
      ).resolves.toBe(0);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'charge-b', noticeQueuedAt: null },
        }),
      );
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('with notices switched off, marks the charge and queues nothing', async () => {
      candidates = [charge()];
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, false),
      ).resolves.toBe(0);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('skips a charge another run already claimed', async () => {
      candidates = [charge()];
      updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it.each([
      ['there is nothing to pay', { chargedAmount: 0 }],
      [
        'the enrollment is closed',
        { enrollment: { status: EnrollmentStatus.DROPPED } },
      ],
      [
        'the student is frozen',
        { student: { status: StudentStatus.FROZEN, deletedAt: null } },
      ],
      [
        'the student is archived',
        { student: { status: StudentStatus.ACTIVE, deletedAt: new Date() } },
      ],
    ])('marks but sends no bill when %s', async (_label, over) => {
      candidates = [charge(over)];
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(0);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('one failing charge does not stop the rest', async () => {
      candidates = [charge(), charge({ id: 'charge-2', studentId: 10043 })];
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(1);
      expect(enqueue).toHaveBeenCalledTimes(2);
    });

    describe('under the least share (ADR-0064)', () => {
      /** 19:50 Tashkent, 01.11.2026. */
      const NOV_1 = new Date('2026-11-01T14:50:00Z');
      const november = () =>
        charge({ periodMonth: 11, coveredDates: NOVEMBER });

      it('the bill carries what is due by the 2nd lesson', async () => {
        candidates = [november()];
        await service.queueChargeNotices(1001, NOV_1, true, 50);
        expect(enqueue.mock.calls[0][0].payload).toEqual(
          expect.objectContaining({ dueDate: '2026-11-04', minShare: 520000 }),
        );
      });

      it('an October bill, or 0%, carries none: the whole charge is due', async () => {
        candidates = [charge()];
        await service.queueChargeNotices(1001, CHARGE_DAY, true, 50);
        candidates = [november()];
        await service.queueChargeNotices(1001, NOV_1, true, 0);
        for (const [item] of enqueue.mock.calls) {
          expect(item.payload).not.toHaveProperty('minShare');
        }
        expect(enqueue).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('queueReminders', () => {
    /** 19:50 Tashkent, 04.10.2026 — tomorrow, 05.10, is the 2nd lesson. */
    const EVE = new Date('2026-10-04T14:50:00Z');

    it("asks only for debtors in open enrollments of active groups, charged for tomorrow's month", async () => {
      await service.queueReminders(1001, EVE);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            periodYear: 2026,
            periodMonth: 10,
            status: MonthlyChargeStatus.CHARGED,
            enrollment: { status: EnrollmentStatus.ACTIVE },
            group: { statusEnum: GroupStatus.ACTIVE, deletedAt: null },
            student: {
              status: StudentStatus.ACTIVE,
              deletedAt: null,
              balance: { lt: 0 },
            },
          },
        }),
      );
    });

    it('reminds a debtor whose 2nd lesson of the month is tomorrow', async () => {
      candidates = [charge()];
      await expect(service.queueReminders(1001, EVE)).resolves.toBe(1);
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10042,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.PAYMENT_REMINDER,
        relatedEntityId: 'enr-1:2026-10-05',
        payload: {
          enrollmentId: 'enr-1',
          groupName: 'A1-12',
          periodYear: 2026,
          periodMonth: 10,
          lessonDate: '2026-10-05',
        },
      });
    });

    it('stays quiet when tomorrow is not the 2nd lesson', async () => {
      candidates = [charge()];
      await expect(
        service.queueReminders(1001, new Date('2026-10-06T14:50:00Z')),
      ).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('counts a mid-month joiner from their own first lesson', async () => {
      candidates = [
        charge({ coveredDates: ['2026-10-12', '2026-10-14', '2026-10-16'] }),
      ];
      await expect(
        service.queueReminders(1001, new Date('2026-10-13T14:50:00Z')),
      ).resolves.toBe(1);
      expect(enqueue.mock.calls[0][0].payload.lessonDate).toBe('2026-10-14');
    });

    it('does not remind a student moved to another group mid-month about a «2nd lesson» long past', async () => {
      // October began in group A; on 15.10 the student moved to group B.
      otherCharges = [charge({ id: 'charge-a', enrollmentId: 'enr-a' })];
      candidates = [
        charge({
          id: 'charge-b',
          enrollmentId: 'enr-b',
          groupId: 'g-2',
          coveredDates: ['2026-10-16', '2026-10-19', '2026-10-21'],
        }),
      ];
      await expect(
        service.queueReminders(1001, new Date('2026-10-18T14:50:00Z')),
      ).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('follows the live calendar — a lesson cancelled after the charge moves the 2nd lesson', async () => {
      candidates = [charge()];
      resolvePlan.mockResolvedValue({
        excludedDates: ['2026-10-05'],
        addedDates: [],
      });
      await expect(service.queueReminders(1001, EVE)).resolves.toBe(0);
      await expect(
        service.queueReminders(1001, new Date('2026-10-06T14:50:00Z')),
      ).resolves.toBe(1);
      expect(enqueue.mock.calls[0][0].payload.lessonDate).toBe('2026-10-07');
    });

    it("resolves each group's calendar once", async () => {
      candidates = [
        charge(),
        charge({ id: 'charge-2', enrollmentId: 'enr-2', studentId: 10043 }),
      ];
      await service.queueReminders(1001, EVE);
      expect(resolvePlan).toHaveBeenCalledTimes(1);
      expect(resolvePlan).toHaveBeenCalledWith(prisma, 'g-1', 7, 2026, 10);
      expect(enqueue).toHaveBeenCalledTimes(2);
    });

    describe('under the least share (ADR-0064)', () => {
      /** 19:50 Tashkent, 03.11.2026 — tomorrow, 04.11, is the 2nd lesson. */
      const NOV_EVE = new Date('2026-11-03T14:50:00Z');
      const november = (over: Record<string, unknown> = {}) =>
        charge({ periodMonth: 11, coveredDates: NOVEMBER, ...over });

      it("reminds only a student tomorrow's lesson does not admit, with what admits them", async () => {
        candidates = [
          november(),
          november({ id: 'charge-2', enrollmentId: 'enr-2', studentId: 10043 }),
        ];
        forLesson.mockResolvedValue(
          new Map([
            [
              10042,
              {
                admitted: false,
                reason: 'BELOW_MIN_SHARE',
                shortfall: 520000,
                minPaidPercent: 50,
              },
            ],
            [10043, { admitted: true, reason: 'PAID', shortfall: 0 }],
          ]),
        );
        await expect(service.queueReminders(1001, NOV_EVE, 50)).resolves.toBe(
          1,
        );
        expect(forLesson).toHaveBeenCalledTimes(1);
        expect(forLesson).toHaveBeenCalledWith({
          groupId: 'g-1',
          lessonDay: '2026-11-04',
          studentIds: [10042, 10043],
        });
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue.mock.calls[0][0]).toMatchObject({
          recipientId: 10042,
          relatedEntityId: 'enr-1:2026-11-04',
          payload: {
            enrollmentId: 'enr-1',
            lessonDate: '2026-11-04',
            minDue: 520000,
            minPaidPercent: 50,
          },
        });
      });

      it('names no share when the lessons held, not the share, keep the student out', async () => {
        // A three-lesson month: two lessons cost more than half of it.
        candidates = [november()];
        forLesson.mockResolvedValue(
          new Map([
            [10042, { admitted: false, reason: 'NOT_PAID', shortfall: 160000 }],
          ]),
        );
        await service.queueReminders(1001, NOV_EVE, 50);
        const { payload } = enqueue.mock.calls[0][0];
        expect(payload.minDue).toBe(160000);
        expect(payload).not.toHaveProperty('minPaidPercent');
      });

      it.each([
        ['before 01.11.2026', EVE, 50],
        ['at 0%', NOV_EVE, 0],
      ])('%s every debtor is reminded, as before', async (_label, now, pct) => {
        candidates = [now === EVE ? charge() : november()];
        await expect(service.queueReminders(1001, now, pct)).resolves.toBe(1);
        expect(forLesson).not.toHaveBeenCalled();
        expect(enqueue.mock.calls[0][0].payload).not.toHaveProperty('minDue');
      });
    });
  });

  describe('queuePaidThroughReminders (contract 3.7, ADR-0064)', () => {
    /** 19:50 Tashkent, 13.11.2026 — a lesson day; the next lesson is 16.11. */
    const NOV_13 = new Date('2026-11-13T14:50:00Z');
    const partPayer = (over: Record<string, unknown> = {}) =>
      charge({
        periodMonth: 11,
        coveredDates: NOVEMBER,
        chargedAmount: 450000,
        // Half of November paid.
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          balance: -225000,
        },
        ...over,
      });
    const reachOf = (next: Record<string, unknown> | null) =>
      reachForMonth.mockResolvedValue(
        new Map([
          [
            10042,
            {
              paidThrough: '2026-11-13',
              next: next && {
                date: '2026-11-16',
                groupName: 'A1-12',
                needed: 17310,
                minPaidPercent: null,
                ...next,
              },
              clearsDebt: false,
            },
          ],
        ]),
      );
    const run = (days = 3) =>
      service.queuePaidThroughReminders(1001, NOV_13, days);

    it("asks for debtors in open enrollments of active groups, charged for today's month", async () => {
      await run();
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            periodYear: 2026,
            periodMonth: 11,
            status: MonthlyChargeStatus.CHARGED,
            enrollment: { status: EnrollmentStatus.ACTIVE },
            group: { statusEnum: GroupStatus.ACTIVE, deletedAt: null },
            student: {
              status: StudentStatus.ACTIVE,
              deletedAt: null,
              balance: { lt: 0 },
            },
          },
        }),
      );
      expect(reachForMonth).not.toHaveBeenCalled();
    });

    it('reminds a part payer whose paid lessons run out within the days', async () => {
      candidates = [partPayer()];
      reachOf({});
      await expect(run()).resolves.toBe(1);
      expect(reachForMonth).toHaveBeenCalledWith({
        companyId: 1001,
        studentIds: [10042],
        today: '2026-11-13',
      });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10042,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.PAYMENT_REMINDER,
        relatedEntityId: 'paid-through:10042:2026-11-16:2026-11-13',
        payload: {
          enrollmentId: 'enr-1',
          groupName: 'A1-12',
          periodYear: 2026,
          periodMonth: 11,
          lessonDate: '2026-11-16',
          paidThrough: { through: '2026-11-13', queuedFor: '2026-11-13' },
        },
      });
    });

    it.each([
      ['the lesson is further ahead than the days', { date: '2026-11-18' }],
      [
        'the lesson is today: the reminders came before it',
        { date: '2026-11-13' },
      ],
      [
        'the lesson is behind: the student is already out',
        { date: '2026-11-11' },
      ],
      [
        'it is the least share that is short (the 2nd-lesson reminder)',
        { minPaidPercent: 50 },
      ],
    ])('stays quiet when %s', async (_label, next) => {
      candidates = [partPayer()];
      reachOf(next);
      await expect(run()).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('stays quiet when the payments reach the whole month', async () => {
      candidates = [partPayer()];
      reachOf(null);
      await expect(run()).resolves.toBe(0);
    });

    it.each([
      ['nothing', -450000],
      ['only an older debt', -500000],
    ])(
      'is for a part payer: none for %s paid of this month',
      async (_l, balance) => {
        candidates = [
          partPayer({
            student: { status: StudentStatus.ACTIVE, deletedAt: null, balance },
          }),
        ];
        reachOf({});
        await expect(run()).resolves.toBe(0);
      },
    );

    it('sends one reminder to a student of two groups, for the group of that lesson', async () => {
      const student = {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
        balance: -400000,
      };
      candidates = [
        partPayer({ student }),
        partPayer({
          id: 'charge-2',
          enrollmentId: 'enr-2',
          groupId: 'g-2',
          student,
          group: { name: 'B1-3', exactDays: ['monday', 'wednesday', 'friday'] },
        }),
      ];
      reachOf({ groupName: 'B1-3' });
      await expect(run()).resolves.toBe(1);
      expect(enqueue.mock.calls[0][0].payload).toMatchObject({
        enrollmentId: 'enr-2',
        groupName: 'B1-3',
      });
    });

    it('stays quiet when that lesson is in a group the notices do not cover (a paused group)', async () => {
      candidates = [partPayer()];
      reachOf({ groupName: 'B1-3' });
      await expect(run()).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('one failing student does not stop the rest', async () => {
      candidates = [
        partPayer(),
        partPayer({ id: 'charge-2', enrollmentId: 'enr-2', studentId: 10043 }),
      ];
      const reach = {
        paidThrough: '2026-11-13',
        next: {
          date: '2026-11-16',
          groupName: 'A1-12',
          needed: 17310,
          minPaidPercent: null,
        },
        clearsDebt: false,
      };
      reachForMonth.mockResolvedValue(
        new Map([
          [10042, reach],
          [10043, reach],
        ]),
      );
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(run()).resolves.toBe(1);
      expect(enqueue).toHaveBeenCalledTimes(2);
    });
  });
});
