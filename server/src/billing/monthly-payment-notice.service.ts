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
import { leastDue, MIN_SHARE_START_DAY } from './lesson-admission';
import { LessonAdmissionService } from './lesson-admission.service';
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
 *
 * ADR-0064 adds contract 3.7's reminder (`queuePaidThroughReminders`) and,
 * with `minPaidPercent` above 0 from 01.11.2026, the least share: the bill
 * names what is due by the 2nd lesson and the 2nd-lesson reminder goes only
 * to a student that lesson does not admit.
 */
@Injectable()
export class MonthlyPaymentNoticeService {
  private readonly logger = new Logger(MonthlyPaymentNoticeService.name);

  constructor(
    private prisma: PrismaService,
    private digestQueue: TelegramDigestQueueService,
    private monthlyCharges: MonthlyChargeService,
    private admission: LessonAdmissionService,
  ) {}

  /**
   * Queues a MONTHLY_CHARGE row for every charge written (or re-charged)
   * since the last run and marks the charge (`noticeQueuedAt`) in the same
   * transaction, so a charge is announced once however often this runs. With
   * `send` false (the notices are switched off) the charges are only marked:
   * switching the notices back on must not flood students with old bills.
   * `minPaidPercent` (0: no least share) puts what is due by the 2nd lesson
   * on the bill (`leastDue`). Returns the number of bills queued.
   */
  async queueChargeNotices(
    companyId: number,
    now: Date,
    send: boolean,
    minPaidPercent = 0,
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
        frozenOutDates: true,
        perLessonCost: true,
        discountPercent: true,
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
        const minShare = leastDue(charge, minPaidPercent);
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
                ...(minShare !== null && { minShare }),
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
   * With `minPaidPercent` above 0, for a lesson from 01.11.2026 (ADR-0064):
   * only a student that lesson does not admit (`LessonAdmissionService`), and
   * the row carries what admits them.
   * Returns the number of reminders queued.
   */
  async queueReminders(
    companyId: number,
    now: Date,
    minPaidPercent = 0,
  ): Promise<number> {
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
    const dueTomorrow: typeof charges = [];
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
        if (due === tomorrow) dueTomorrow.push(charge);
      } catch (err) {
        this.logger.error(
          `Payment reminder for enrollment ${charge.enrollmentId} not queued: ${describeError(err)}`,
        );
      }
    }

    const byShare = minPaidPercent > 0 && tomorrow >= MIN_SHARE_START_DAY;
    const shortfalls = byShare
      ? await this.shortfallsFor(dueTomorrow, tomorrow)
      : null;
    let queued = 0;
    for (const charge of dueTomorrow) {
      const short = shortfalls?.get(charge.enrollmentId);
      // Under the least share a student the lesson admits is not reminded.
      if (shortfalls && !short) continue;
      try {
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
            ...short,
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

  /**
   * Contract 3.7 (ADR-0064): queues a PAYMENT_REMINDER for every part payer
   * whose first lesson the payments do not reach is 1 to `days` calendar days
   * ahead — so on each of those evenings, until a payment moves that lesson.
   * Not for a student already out (that lesson is today or behind), one short
   * of the least share (the 2nd-lesson reminder's case), or one who has paid
   * nothing of this month (the bill and the 2nd-lesson reminder ask them).
   * One row per student, for the group of that lesson.
   * Returns the number of reminders queued.
   */
  async queuePaidThroughReminders(
    companyId: number,
    now: Date,
    days: number,
  ): Promise<number> {
    const today = tashkentDateStr(now);
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));

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
        branchId: true,
        chargedAmount: true,
        coveredDates: true,
        student: { select: { balance: true } },
        group: { select: { name: true } },
      },
    });
    if (charges.length === 0) return 0;

    const byStudent = new Map<number, typeof charges>();
    for (const charge of charges) {
      byStudent.set(charge.studentId, [
        ...(byStudent.get(charge.studentId) ?? []),
        charge,
      ]);
    }
    const reach = await this.admission.reachForMonth({
      companyId,
      studentIds: [...byStudent.keys()],
      today,
    });
    const ahead = new Set(
      Array.from({ length: days }, (_, i) => addDaysToDateStr(today, i + 1)),
    );

    let queued = 0;
    for (const [studentId, own] of byStudent) {
      const through = reach.get(studentId)?.paidThrough;
      const next = reach.get(studentId)?.next;
      if (!through || !next || !ahead.has(next.date)) continue;
      if (next.minPaidPercent !== null) continue;
      const monthDue = own.reduce((sum, c) => sum + c.chargedAmount, 0);
      if (own[0].student.balance + monthDue <= 0) continue;
      // `reachForMonth` also reads charges of groups this list leaves out (a
      // paused group): a lesson there is not announced.
      const charge = own.find(
        (c) =>
          c.group.name === next.groupName && c.coveredDates.includes(next.date),
      );
      if (!charge) continue;
      try {
        await this.digestQueue.enqueue({
          recipientKind: TelegramDigestRecipientKind.STUDENT,
          recipientId: studentId,
          companyId,
          branchId: charge.branchId,
          category: TelegramDigestCategory.PAYMENT_REMINDER,
          relatedEntityId: `paid-through:${studentId}:${next.date}:${today}`,
          payload: {
            enrollmentId: charge.enrollmentId,
            groupName: charge.group.name,
            periodYear: year,
            periodMonth: month,
            lessonDate: next.date,
            paidThrough: { through, queuedFor: today },
          },
        });
        queued += 1;
      } catch (err) {
        this.logger.error(
          `Paid-through reminder for student ${studentId} not queued: ${describeError(err)}`,
        );
      }
    }
    return queued;
  }

  /**
   * What admits each of these enrollments to `lessonDay`, for the ones it
   * does not admit — one admission read per group. The share is named only
   * when it, not the lessons held, keeps the student out. A group whose read
   * fails is logged and gets no reminder.
   */
  private async shortfallsFor(
    charges: { enrollmentId: string; groupId: string; studentId: number }[],
    lessonDay: string,
  ): Promise<Map<string, { minDue: number; minPaidPercent?: number }>> {
    const shortfalls = new Map<
      string,
      { minDue: number; minPaidPercent?: number }
    >();
    for (const groupId of new Set(charges.map((c) => c.groupId))) {
      const ofGroup = charges.filter((c) => c.groupId === groupId);
      try {
        const verdicts = await this.admission.forLesson({
          groupId,
          lessonDay,
          studentIds: ofGroup.map((c) => c.studentId),
        });
        for (const c of ofGroup) {
          const verdict = verdicts.get(c.studentId);
          if (verdict?.admitted === false) {
            shortfalls.set(c.enrollmentId, {
              minDue: verdict.shortfall,
              ...(verdict.minPaidPercent !== undefined && {
                minPaidPercent: verdict.minPaidPercent,
              }),
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `Payment reminders for group ${groupId} not queued: ${describeError(err)}`,
        );
      }
    }
    return shortfalls;
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
