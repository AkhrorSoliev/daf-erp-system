import { Injectable, Logger } from '@nestjs/common';
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  StudentStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import { shortWeekdaysLabel } from '../telegram-digest/uzbek-calendar';
import { MonthlyChargeService } from './monthly-charge.service';
import { paymentDueDate } from './payment-due-date';
import { lessonDatesInMonth } from './planned-lessons';

/**
 * A charge older than this is never announced. The notices run daily, so an
 * older unmarked charge means they were down, and a bill arriving days late
 * is noise, not news.
 */
export const NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Writes the two monthly payment messages (ADR-0042) into the 20:00 digest
 * queue: the month's bill the day a charge is written, and the reminder the
 * evening before the student's 2nd lesson of the month. The renderer
 * re-checks both against live data at send time.
 */
@Injectable()
export class MonthlyPaymentNoticeService {
  private readonly logger = new Logger(MonthlyPaymentNoticeService.name);

  constructor(
    private prisma: PrismaService,
    private digestQueue: TelegramDigestQueueService,
    private monthlyCharges: MonthlyChargeService,
  ) {}

  /**
   * Queues a MONTHLY_CHARGE row for every charge written since the last run
   * and marks the charge (`noticeQueuedAt`) in the same transaction, so a
   * charge is announced once however often this runs. With `send` false (the
   * notices are switched off) the charges are only marked: switching the
   * notices back on must not flood students with old bills.
   * Returns the number of bills queued.
   */
  async queueChargeNotices(
    companyId: number,
    now: Date,
    send: boolean,
  ): Promise<number> {
    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        noticeQueuedAt: null,
        status: MonthlyChargeStatus.CHARGED,
        createdAt: { gte: new Date(now.getTime() - NOTICE_MAX_AGE_MS) },
      },
      select: {
        id: true,
        studentId: true,
        branchId: true,
        periodYear: true,
        periodMonth: true,
        coveredLessons: true,
        coveredDates: true,
        creditLessons: true,
        creditAmount: true,
        chargedAmount: true,
        enrollment: { select: { status: true } },
        student: { select: { status: true, deletedAt: true } },
        group: { select: { name: true, exactDays: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let queued = 0;
    for (const charge of charges) {
      // Nothing to pay, or nobody left to tell: marked, never announced.
      const announce =
        send &&
        charge.chargedAmount > 0 &&
        charge.enrollment.status === EnrollmentStatus.ACTIVE &&
        charge.student.status === StudentStatus.ACTIVE &&
        charge.student.deletedAt === null;
      try {
        const wrote = await this.prisma.$transaction(async (tx) => {
          const claim = await tx.enrollmentMonthlyCharge.updateMany({
            where: { id: charge.id, noticeQueuedAt: null },
            data: { noticeQueuedAt: now },
          });
          if (claim.count === 0 || !announce) return false;
          await this.digestQueue.enqueue(
            {
              recipientKind: TelegramDigestRecipientKind.STUDENT,
              recipientId: charge.studentId,
              companyId,
              branchId: charge.branchId,
              category: TelegramDigestCategory.MONTHLY_CHARGE,
              relatedEntityId: charge.id,
              payload: {
                chargeId: charge.id,
                groupName: charge.group.name,
                daysLabel: shortWeekdaysLabel(charge.group.exactDays),
                periodYear: charge.periodYear,
                periodMonth: charge.periodMonth,
                price: charge.chargedAmount + charge.creditAmount,
                coveredLessons: charge.coveredLessons,
                creditLessons: charge.creditLessons,
                creditAmount: charge.creditAmount,
                chargedAmount: charge.chargedAmount,
                dueDate: paymentDueDate(charge.coveredDates),
              },
            },
            tx,
          );
          return true;
        });
        if (wrote) queued += 1;
      } catch (err) {
        this.logger.error(
          `Monthly bill for charge ${charge.id} not queued: ${describeError(err)}`,
        );
      }
    }
    return queued;
  }

  /**
   * Queues a PAYMENT_REMINDER for every student who still owes and whose 2nd
   * lesson of the month is tomorrow — counted from their own first lesson of
   * the month (a mid-month joiner) on the group's LIVE calendar, so a lesson
   * cancelled or moved after the charge moves the reminder with it.
   * Returns the number of reminders queued.
   */
  async queueReminders(companyId: number, now: Date): Promise<number> {
    const tomorrow = addDaysToDateStr(tashkentDateStr(now), 1);
    const year = Number(tomorrow.slice(0, 4));
    const month = Number(tomorrow.slice(5, 7));

    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        periodYear: year,
        periodMonth: month,
        status: MonthlyChargeStatus.CHARGED,
        enrollment: { status: EnrollmentStatus.ACTIVE },
        group: { statusEnum: GroupStatus.ACTIVE, deletedAt: null },
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          balance: { lt: 0 },
        },
      },
      select: {
        enrollmentId: true,
        studentId: true,
        groupId: true,
        branchId: true,
        coveredDates: true,
        group: { select: { name: true, exactDays: true } },
      },
    });

    const plans = new Map<
      string,
      { excludedDates: string[]; addedDates: string[] }
    >();
    let queued = 0;
    for (const charge of charges) {
      try {
        let plan = plans.get(charge.groupId);
        if (!plan) {
          plan = await this.monthlyCharges.resolveMonthPlanDates(
            this.prisma,
            charge.groupId,
            charge.branchId,
            year,
            month,
          );
          plans.set(charge.groupId, plan);
        }
        const lessons = lessonDatesInMonth({
          year,
          month,
          exactDays: charge.group.exactDays,
          excludedDates: plan.excludedDates,
          addedDates: plan.addedDates,
          fromDate: [...charge.coveredDates].sort()[0] ?? null,
        });
        if (paymentDueDate(lessons) !== tomorrow) continue;
        await this.digestQueue.enqueue({
          recipientKind: TelegramDigestRecipientKind.STUDENT,
          recipientId: charge.studentId,
          companyId,
          branchId: charge.branchId,
          category: TelegramDigestCategory.PAYMENT_REMINDER,
          relatedEntityId: `${charge.enrollmentId}:${tomorrow}`,
          payload: {
            enrollmentId: charge.enrollmentId,
            groupName: charge.group.name,
            periodYear: year,
            periodMonth: month,
            lessonDate: tomorrow,
          },
        });
        queued += 1;
      } catch (err) {
        this.logger.error(
          `Payment reminder for enrollment ${charge.enrollmentId} not queued: ${describeError(err)}`,
        );
      }
    }
    return queued;
  }
}
