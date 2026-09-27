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
 * A charge written (or re-charged) longer ago than this is never announced.
 * The notices run daily, so an older unmarked charge means they were down,
 * and a bill arriving days late is noise, not news.
 */
export const NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

interface MonthPlan {
  excludedDates: string[];
  addedDates: string[];
}

interface StandingCharge {
  id: string;
  studentId: number;
  periodYear: number;
  periodMonth: number;
  createdAt: Date;
  coveredDates: string[];
}

const samePeriod = (
  a: { periodYear: number; periodMonth: number },
  b: { periodYear: number; periodMonth: number },
) => a.periodYear === b.periodYear && a.periodMonth === b.periodMonth;

/** `a` was written before `b` (id breaks a tie, so exactly one is first). */
const writtenBefore = (
  a: { id: string; createdAt: Date },
  b: { id: string; createdAt: Date },
) =>
  a.createdAt.getTime() < b.createdAt.getTime() ||
  (a.createdAt.getTime() === b.createdAt.getTime() && a.id < b.id);

const earliest = (dates: readonly string[]): string | null =>
  [...dates].sort()[0] ?? null;

/**
 * Writes the two monthly payment messages (ADR-0042) into the 20:00 digest
 * queue: the month's bill the day a charge is written, and the reminder the
 * evening before the student's 2nd lesson of the month. The renderer
 * re-checks both against live data at send time.
 *
 * The month belongs to the STUDENT, not to one enrollment: a student moved
 * to another group mid-month has a second charge for the same month, but
 * their payment was due by their 2nd lesson of the month in the first group.
 * So only the student's first standing charge of a month is announced, and
 * the 2nd lesson is counted from their first covered lesson of the month in
 * any group — both on the group's live calendar, the same rule for the bill's
 * due date and the reminder.
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
   * Queues a MONTHLY_CHARGE row for every charge written (or re-charged)
   * since the last run and marks the charge (`noticeQueuedAt`) in the same
   * transaction, so a charge is announced once however often this runs. With
   * `send` false (the notices are switched off) the charges are only marked:
   * switching the notices back on must not flood students with old bills.
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
        updatedAt: { gte: new Date(now.getTime() - NOTICE_MAX_AGE_MS) },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        branchId: true,
        periodYear: true,
        periodMonth: true,
        coveredLessons: true,
        coveredDates: true,
        creditLessons: true,
        creditAmount: true,
        chargedAmount: true,
        createdAt: true,
        enrollment: { select: { status: true } },
        student: { select: { status: true, deletedAt: true } },
        group: { select: { name: true, exactDays: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (charges.length === 0) return 0;

    const standing = await this.standingCharges(companyId, charges);
    const plans = new Map<string, MonthPlan>();
    let queued = 0;
    for (const charge of charges) {
      const firstOfMonth = !standing.some(
        (other) =>
          other.id !== charge.id &&
          other.studentId === charge.studentId &&
          samePeriod(other, charge) &&
          writtenBefore(other, charge),
      );
      // Nothing to pay, nobody left to tell, or not the student's first bill
      // of the month (a transfer): marked, never announced.
      const announce =
        send &&
        firstOfMonth &&
        charge.chargedAmount > 0 &&
        charge.enrollment.status === EnrollmentStatus.ACTIVE &&
        charge.student.status === StudentStatus.ACTIVE &&
        charge.student.deletedAt === null;
      try {
        const dueDate = announce
          ? await this.secondLesson(plans, {
              groupId: charge.groupId,
              branchId: charge.branchId,
              exactDays: charge.group.exactDays,
              year: charge.periodYear,
              month: charge.periodMonth,
              fromDate: earliest(charge.coveredDates),
            })
          : null;
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
                dueDate,
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
   * lesson of the month is tomorrow — counted from their first covered lesson
   * of the month in any group, on the current group's LIVE calendar, so a
   * lesson cancelled or moved after the charge moves the reminder with it and
   * a student moved to another group mid-month is not told about a «2nd
   * lesson» long past.
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
        id: true,
        enrollmentId: true,
        studentId: true,
        groupId: true,
        branchId: true,
        periodYear: true,
        periodMonth: true,
        group: { select: { name: true, exactDays: true } },
      },
    });
    if (charges.length === 0) return 0;

    const firstLesson = new Map<number, string>();
    for (const other of await this.standingCharges(companyId, charges)) {
      const first = earliest(other.coveredDates);
      const known = firstLesson.get(other.studentId);
      if (first && (!known || first < known)) {
        firstLesson.set(other.studentId, first);
      }
    }

    const plans = new Map<string, MonthPlan>();
    let queued = 0;
    for (const charge of charges) {
      try {
        const due = await this.secondLesson(plans, {
          groupId: charge.groupId,
          branchId: charge.branchId,
          exactDays: charge.group.exactDays,
          year,
          month,
          fromDate: firstLesson.get(charge.studentId) ?? null,
        });
        if (due !== tomorrow) continue;
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

  /** Every CHARGED charge of these students in these months, any enrollment. */
  private async standingCharges(
    companyId: number,
    of: { studentId: number; periodYear: number; periodMonth: number }[],
  ): Promise<StandingCharge[]> {
    const periods = new Map<
      string,
      { periodYear: number; periodMonth: number }
    >();
    for (const c of of) {
      periods.set(`${c.periodYear}-${c.periodMonth}`, {
        periodYear: c.periodYear,
        periodMonth: c.periodMonth,
      });
    }
    return this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        status: MonthlyChargeStatus.CHARGED,
        studentId: { in: [...new Set(of.map((c) => c.studentId))] },
        OR: [...periods.values()],
      },
      select: {
        id: true,
        studentId: true,
        periodYear: true,
        periodMonth: true,
        createdAt: true,
        coveredDates: true,
      },
    });
  }

  /**
   * The 2nd lesson of the month on the group's live calendar (holidays,
   * cancellations and moves included), counted from `fromDate`. Each group's
   * month is resolved once per run.
   */
  private async secondLesson(
    plans: Map<string, MonthPlan>,
    p: {
      groupId: string;
      branchId: number;
      exactDays: string[];
      year: number;
      month: number;
      fromDate: string | null;
    },
  ): Promise<string | null> {
    const key = `${p.groupId}:${p.year}-${p.month}`;
    let plan = plans.get(key);
    if (!plan) {
      plan = await this.monthlyCharges.resolveMonthPlanDates(
        this.prisma,
        p.groupId,
        p.branchId,
        p.year,
        p.month,
      );
      plans.set(key, plan);
    }
    return paymentDueDate(
      lessonDatesInMonth({
        year: p.year,
        month: p.month,
        exactDays: p.exactDays,
        excludedDates: plan.excludedDates,
        addedDates: plan.addedDates,
        fromDate: p.fromDate,
      }),
    );
  }
}
