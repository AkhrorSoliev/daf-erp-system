import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentPromiseCronService } from './payment-promise-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';

describe('PaymentPromiseCronService', () => {
  let service: PaymentPromiseCronService;
  let prisma: {
    paymentPromise: { findMany: jest.Mock; update: jest.Mock };
  };
  let holidays: { findActiveHolidayCovering: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      paymentPromise: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    holidays = { findActiveHolidayCovering: jest.fn().mockResolvedValue(null) };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentPromiseCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: HolidaysService, useValue: holidays },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get(PaymentPromiseCronService);
  });

  it('short-circuits on an active holiday (no queries, no events)', async () => {
    holidays.findActiveHolidayCovering.mockResolvedValueOnce({ id: 'h1' });
    const res = await service.run();
    expect(res).toEqual({ processed: 0 });
    expect(prisma.paymentPromise.findMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('flips overdue+owing promises to BROKEN and emits one event each', async () => {
    prisma.paymentPromise.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        studentId: 10264,
        companyId: 1001,
        branchId: 3,
        promiseDate: new Date('2026-06-05T00:00:00.000Z'),
      },
    ]);

    const res = await service.run();

    // Only OPEN, past-due, reminder-not-fired, student in debt are selected.
    const where = prisma.paymentPromise.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        status: 'OPEN',
        reminderFiredAt: null,
        student: { balance: { lt: 0 }, deletedAt: null },
      }),
    );
    expect(prisma.paymentPromise.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'BROKEN' }),
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      'payment-promise.overdue',
      expect.objectContaining({
        promiseId: 'p1',
        studentId: 10264,
        branchId: 3,
      }),
    );
    expect(res).toEqual({ processed: 1 });
  });

  describe('by Tashkent day: a promise for D breaks only once D is over', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      jest.setSystemTime(new Date('2026-10-14T04:00:00Z')); // 14.10 09:00 Tashkent
    });
    afterEach(() => jest.useRealTimers());

    /** What the findMany bound lets through, as Postgres would apply it. */
    const selects = async (stored: string) => {
      await service.run();
      const bound = prisma.paymentPromise.findMany.mock.calls[0][0].where
        .promiseDate as { lt: Date };
      expect(bound).toEqual({ lt: expect.any(Date) });
      return new Date(stored) < bound.lt;
    };

    it("today's promise is not broken at 09:00, even one stored at 05:00 Tashkent", async () => {
      expect(await selects('2026-10-14T00:00:00.000Z')).toBe(false); // payment dialog, before the fix
      expect(await selects('2026-10-14T18:59:59.999Z')).toBe(false);
    });

    it("yesterday's promise is broken, however late in the day it was stored", async () => {
      expect(await selects('2026-10-13T18:59:59.999Z')).toBe(true);
    });
  });
});
