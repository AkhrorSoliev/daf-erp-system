import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';

export interface PaymentPromiseOverduePayload {
  promiseId: string;
  studentId: number;
  companyId: number;
  branchId: number | null;
  promiseDate: string; // ISO
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
  // Active holidays short-circuit below. Mirrors TaskReminderService.
  @Cron('0 0 9 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async checkOverduePromises() {
    await this.run();
  }

  /**
   * Flip OPEN promises whose date has passed while the student is still in
   * debt to BROKEN, and fire one branch-wide admin reminder per promise
   * (4-channel fan-out via NotificationEventsListener). `reminderFiredAt` +
   * the OPEN→BROKEN status change together guarantee a promise is reminded at
   * most once. Extracted from the @Cron method so it can be triggered in a
   * test or manually.
   */
  async run() {
    const holiday = await this.holidays.findActiveHolidayCovering(new Date());
    if (holiday) {
      this.logger.log(
        "Bayram kuni — to'lov va'dasi eslatmasi o'tkazib yuborildi",
      );
      return { processed: 0 };
    }

    const now = new Date();
    const due = await this.prisma.paymentPromise.findMany({
      where: {
        status: 'OPEN',
        promiseDate: { lte: now },
        reminderFiredAt: null,
        student: { balance: { lt: 0 }, deletedAt: null },
      },
      select: {
        id: true,
        studentId: true,
        companyId: true,
        branchId: true,
        promiseDate: true,
      },
    });

    for (const p of due) {
      try {
        await this.prisma.paymentPromise.update({
          where: { id: p.id },
          data: { status: 'BROKEN', reminderFiredAt: now },
        });
        this.eventEmitter.emit('payment-promise.overdue', {
          promiseId: p.id,
          studentId: p.studentId,
          companyId: p.companyId,
          branchId: p.branchId,
          promiseDate: p.promiseDate.toISOString(),
        } satisfies PaymentPromiseOverduePayload);
      } catch (err) {
        this.logger.error(
          `Va'da #${p.id} ni qayta ishlashda xato: ${(err as Error).message}`,
        );
      }
    }

    if (due.length > 0) {
      this.logger.log(
        `${due.length} ta muddati o'tgan to'lov va'dasi belgilandi`,
      );
    }
    return { processed: due.length };
  }
}
