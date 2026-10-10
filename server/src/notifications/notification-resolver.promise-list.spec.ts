import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotificationResolverService } from './notification-resolver.service';
import { NotificationsGateway } from './notifications.gateway';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import { PrismaService } from '../prisma/prisma.service';

const OPEN = { actionRequired: true, resolvedAt: null };

describe('NotificationResolverService (the 09:00 promise lists)', () => {
  let resolver: NotificationResolverService;
  let prisma: any;
  let gateway: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', userId: 7 },
          { id: 'n2', userId: 7 },
          { id: 'n3', userId: 8 },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      paymentPromise: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    gateway = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        NotificationResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    resolver = mod.get(NotificationResolverService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const whereOf = (call = 0) =>
    prisma.notification.findMany.mock.calls[call][0].where;

  describe('the 09:00 broken-promise list', () => {
    // The cron flipped these promises at 09:00 Tashkent on 10.10 (04:00 UTC).
    const MORNING = new Date('2026-10-10T04:00:00.000Z');
    const DAY = {
      gte: new Date('2026-10-09T19:00:00.000Z'),
      lt: new Date('2026-10-10T19:00:00.000Z'),
    };
    const LIST = {
      companyId: 1,
      type: 'PAYMENT_PROMISE_OVERDUE',
      relatedEntityType: 'BrokenPromises',
    };
    // By default a payment that leaves debt, so the legacy per-student rule
    // stays out of the way and only the list rule runs.
    const paid = (studentBalance: number | null = -5_000) =>
      resolver.onPaymentReceived({
        companyId: 1,
        studentId: 10001,
        studentBalance,
      });

    it('closes the list for every recipient when the last listed student pays', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);

      await paid(-300);

      expect(prisma.paymentPromise.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 1,
          studentId: 10001,
          status: 'BROKEN',
          reminderFiredAt: { not: null },
        },
        select: { branchId: true, reminderFiredAt: true },
      });
      expect(prisma.paymentPromise.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: 1,
          branchId: 3,
          status: 'BROKEN',
          reminderFiredAt: DAY,
          student: { balance: { lte: -MIN_ALERT_DEBT } },
        },
        select: { id: true },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(whereOf()).toEqual({
        ...LIST,
        relatedEntityId: '3',
        createdAt: DAY,
        ...OPEN,
      });
      expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('leaves the list open while another listed student still owes', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);
      prisma.paymentPromise.findFirst.mockResolvedValue({ id: 'p2' });

      await paid();

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('counts a student as owing only from MIN_ALERT_DEBT (a smaller debt was never listed)', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);

      await paid(-MIN_ALERT_DEBT + 1);

      const { student } =
        prisma.paymentPromise.findFirst.mock.calls[0][0].where;
      expect(MIN_ALERT_DEBT).toBe(1_000);
      expect(student).toEqual({ balance: { lte: -1_000 } });
      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    });

    it("the 'all' key is the promises with no branch", async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: null, reminderFiredAt: MORNING },
      ]);

      await paid();

      expect(prisma.paymentPromise.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ companyId: 1, branchId: null }),
      );
      expect(whereOf().relatedEntityId).toBe('all');
    });

    it('asks once per list: one branch, one Tashkent day; another day or branch is another list', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        // 00:30 and 23:59 Tashkent on 10.10 — the same day, though two UTC days
        { branchId: 3, reminderFiredAt: new Date('2026-10-09T19:30:00.000Z') },
        { branchId: 3, reminderFiredAt: new Date('2026-10-10T18:59:00.000Z') },
        { branchId: 3, reminderFiredAt: new Date('2026-10-03T04:00:00.000Z') },
        { branchId: 4, reminderFiredAt: MORNING },
      ]);

      await paid();

      expect(prisma.paymentPromise.findFirst).toHaveBeenCalledTimes(3);
      expect(prisma.notification.findMany).toHaveBeenCalledTimes(3);
      expect(
        prisma.notification.findMany.mock.calls.map(
          (c: any) => c[0].where.relatedEntityId,
        ),
      ).toEqual(['3', '3', '4']);
    });

    it('a student with no broken promise closes no list', async () => {
      await paid();

      expect(prisma.paymentPromise.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });

    it('a legacy per-student row still closes when the debt is cleared, beside the list', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);

      await paid(0);

      expect(whereOf(0)).toEqual({
        companyId: 1,
        type: 'PAYMENT_PROMISE_OVERDUE',
        relatedEntityType: 'Student',
        relatedEntityId: '10001',
        ...OPEN,
      });
      expect(whereOf(1).relatedEntityType).toBe('BrokenPromises');
    });

    it('a failing lookup is logged and never thrown', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      prisma.paymentPromise.findMany.mockRejectedValue(new Error('db down'));

      await expect(paid()).resolves.toBeUndefined();
    });

    describe('a newer list of the branch', () => {
      const sent = (branchId: number | null) =>
        resolver.onPromiseListSent({
          companyId: 1,
          branchId,
          promiseIds: ['a'],
        });

      beforeEach(() => {
        jest.useFakeTimers({ now: MORNING });
      });

      it("closes the branch's older open lists and never this morning's", async () => {
        await sent(3);

        expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
        expect(whereOf()).toEqual({
          ...LIST,
          relatedEntityId: '3',
          // before today's Tashkent start, so the rows of this very run stay
          createdAt: { lt: DAY.gte },
          ...OPEN,
        });
        expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
      });

      it('leaves another branch alone; no branch is the key all', async () => {
        await sent(null);

        expect(whereOf().relatedEntityId).toBe('all');
      });

      it('draws the day line at Tashkent midnight, not the process clock', async () => {
        jest.setSystemTime(new Date('2026-10-09T20:30:00.000Z')); // 01:30 on 10.10

        await sent(3);

        expect(whereOf().createdAt).toEqual({ lt: DAY.gte });
      });

      it('writes nothing when the branch has no older list open', async () => {
        prisma.notification.findMany.mockResolvedValue([]);

        await sent(3);

        expect(prisma.notification.updateMany).not.toHaveBeenCalled();
        expect(gateway.sendToUser).not.toHaveBeenCalled();
      });
    });
  });
});
