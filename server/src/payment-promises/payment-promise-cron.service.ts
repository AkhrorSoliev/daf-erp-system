import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { tashkentDateStr, tashkentDayStartUtc } from '../common/date/tashkent';
import { MIN_ALERT_DEBT } from './overdue-digest';

/** One branch's promises broken this morning — one message for all of them. */
export interface PaymentPromiseOverduePayload {
  companyId: number;
  branchId: number | null;
  promiseIds: string[];
}

@Injectable()
export class PaymentPromiseCronService {
  private readonly logger = new Logger(PaymentPromiseCronService.name);

  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private eventEmitter: EventEmitter2,
  ) {}

  // Daily at 09:00 Tashkent, Mon–Sat (Sundays excluded by the cron itself).
  // Active holidays short-circuit below.
  @Cron('0 0 9 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async checkOverduePromises() {
    await this.run();
  }

  /**
   * Flip OPEN promises whose date has passed while the student is still in
   * debt to BROKEN, then send each branch ONE list of them
   * (NotificationEventsListener). A debt under MIN_ALERT_DEBT is still marked
   * BROKEN but raises no alert. `reminderFiredAt` + the OPEN→BROKEN status
   * change together guarantee a promise is reported at most once. Extracted
   * from the @Cron method so it can be triggered in a test or manually.
   */
  async run() {
    const holiday = await this.holidays.findActiveHolidayCovering(new Date());
    if (holiday) {
      this.logger.log(
        "Bayram kuni — to'lov va'dasi eslatmasi o'tkazib yuborildi",
      );
      return { processed: 0, alerted: 0 };
    }

    const now = new Date();
    const due = await this.prisma.paymentPromise.findMany({
      where: {
        status: 'OPEN',
        // By Tashkent day: a promise for D is broken only once D is over, so
        // the 09:00 run on D leaves it alone whatever instant it was stored at.
        promiseDate: { lt: tashkentDayStartUtc(tashkentDateStr(now)) },
        reminderFiredAt: null,
        student: { balance: { lt: 0 }, deletedAt: null },
      },
      orderBy: { promiseDate: 'asc' },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        student: { select: { balance: true } },
      },
    });

    const lists = new Map<string, PaymentPromiseOverduePayload>();
    let processed = 0;
    for (const p of due) {
      try {
        await this.prisma.paymentPromise.update({
          where: { id: p.id },
          data: { status: 'BROKEN', reminderFiredAt: now },
        });
        processed += 1;
        if (-p.student.balance < MIN_ALERT_DEBT) continue;
        const key = `${p.companyId}:${p.branchId ?? '-'}`;
        const list = lists.get(key) ?? {
          companyId: p.companyId,
          branchId: p.branchId,
          promiseIds: [],
        };
        list.promiseIds.push(p.id);
        lists.set(key, list);
      } catch (err) {
        this.logger.error(
          `Va'da #${p.id} ni qayta ishlashda xato: ${(err as Error).message}`,
        );
      }
    }

    let alerted = 0;
    for (const list of lists.values()) {
      this.eventEmitter.emit(
        'payment-promise.overdue',
        list satisfies PaymentPromiseOverduePayload,
      );
      alerted += list.promiseIds.length;
    }

    if (processed > 0) {
      this.logger.log(
        `${processed} ta muddati o'tgan to'lov va'dasi belgilandi, ${alerted} tasi xabarga kirdi`,
      );
    }
    return { processed, alerted };
  }
}
