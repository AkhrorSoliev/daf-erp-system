import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, MonthlyChargeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  ADMISSION_START_DAY,
  firstLessonCoverage,
  lessonAdmission,
  paymentReach,
  type AdmissionCharge,
  type FirstLessonCoverage,
  type LessonAdmission,
  type PaymentReach,
} from './lesson-admission';

type Reader = Prisma.TransactionClient | PrismaService;

/**
 * Loads what `lessonAdmission` / `paymentReach` judge (ADR-0047): the
 * student's balance and their CHARGED month charges on ACTIVE enrollments —
 * a departed or frozen enrollment's lessons are not "still held".
 */
@Injectable()
export class LessonAdmissionService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /** `payment.admissionRuleEnabled`: contract 3.2 can be switched off (CEO). */
  private ruleEnabled(companyId: number): Promise<boolean> {
    return this.settings.get(companyId, 'payment.admissionRuleEnabled');
  }

  /** `payment.admissionMinPaidPercent`: the least share of a month due by its 2nd lesson (ADR-0064). */
  private minPaidPercent(companyId: number): Promise<number> {
    return this.settings.get(companyId, 'payment.admissionMinPaidPercent');
  }

  /** Contract 3.2 for every student of one lesson. A student missing from the map is admitted. */
  async forLesson(
    params: { groupId: string; lessonDay: string; studentIds: number[] },
    client: Reader = this.prisma,
  ): Promise<Map<number, LessonAdmission>> {
    const result = new Map<number, LessonAdmission>();
    if (params.studentIds.length === 0) return result;
    if (params.lessonDay < ADMISSION_START_DAY) return result;

    const [year, month] = params.lessonDay.split('-').map(Number);
    const students = await client.student.findMany({
      where: { id: { in: params.studentIds } },
      select: { id: true, balance: true, companyId: true },
    });
    if (students.length === 0) return result;
    // Switched off: nobody is kept out, the map stays empty (all admitted).
    if (!(await this.ruleEnabled(students[0].companyId))) return result;
    const minPaidPercent = await this.minPaidPercent(students[0].companyId);
    // Later months too: the balance already carries their charges.
    const charges = await this.loadCharges(
      client,
      params.studentIds,
      year,
      month,
      true,
    );
    const inMonth = (c: { periodYear: number; periodMonth: number }) =>
      c.periodYear === year && c.periodMonth === month;
    for (const student of students) {
      const own = charges.filter((c) => c.studentId === student.id);
      result.set(
        student.id,
        lessonAdmission({
          lessonDay: params.lessonDay,
          groupId: params.groupId,
          balance: student.balance,
          charges: own.filter(inMonth),
          laterCharges: own.filter((c) => !inMonth(c)),
          minPaidPercent,
        }),
      );
    }
    return result;
  }

  /**
   * ADR-0048 (R4): a debtor ABSENT at the month's first lesson earns the
   * teacher nothing until their payments reach it. True when the lesson on
   * `lessonDay` is that first lesson and is not yet covered.
   */
  async isUnpaidFirstLesson(
    params: { studentId: number; groupId: string; lessonDay: string },
    client: Reader = this.prisma,
  ): Promise<boolean> {
    if (params.lessonDay < ADMISSION_START_DAY) return false;
    const coverage = await this.loadCoverage(
      client,
      params.studentId,
      params.lessonDay,
    );
    if (!coverage) return false;
    const c = coverage(params.groupId, params.lessonDay);
    return c.firstLesson && !c.covered;
  }

  /**
   * The student's balance and CHARGED charges from `fromDay`'s month on,
   * whatever the enrollment's status (a departed group still billed its
   * lessons), as an evaluator of `firstLessonCoverage` per lesson — one read
   * for however many lessons a payment re-checks. Null: no such student.
   */
  async loadCoverage(
    client: Reader,
    studentId: number,
    fromDay: string,
  ): Promise<
    ((groupId: string, lessonDay: string) => FirstLessonCoverage) | null
  > {
    const [year, month] = fromDay.split('-').map(Number);
    const [student, charges] = await Promise.all([
      client.student.findUnique({
        where: { id: studentId },
        select: { balance: true },
      }),
      client.enrollmentMonthlyCharge.findMany({
        where: {
          studentId,
          status: MonthlyChargeStatus.CHARGED,
          enrollment: { deletedAt: null },
          OR: [
            { periodYear: { gt: year } },
            { periodYear: year, periodMonth: { gte: month } },
          ],
        },
        select: {
          enrollmentId: true,
          groupId: true,
          periodYear: true,
          periodMonth: true,
          coveredDates: true,
          frozenOutDates: true,
          coveredLessons: true,
          perLessonCost: true,
          discountPercent: true,
          chargedAmount: true,
        },
      }),
    ]);
    if (!student) return null;
    return (groupId, lessonDay) =>
      firstLessonCoverage({
        lessonDay,
        groupId,
        balance: student.balance,
        charges,
      });
  }

  /** How far a payment reaches this month (payment dialog). Null: the rule does not apply. */
  async reachForPayment(params: {
    studentId: number;
    companyId: number;
    balanceAfter: number;
    today: string;
  }): Promise<PaymentReach | null> {
    if (params.today < ADMISSION_START_DAY) return null;
    if (!(await this.ruleEnabled(params.companyId))) return null;
    const [year, month] = params.today.split('-').map(Number);
    const charges = await this.loadCharges(
      this.prisma,
      [params.studentId],
      year,
      month,
    );
    return paymentReach({
      today: params.today,
      balanceAfter: params.balanceAfter,
      charges,
      minPaidPercent: await this.minPaidPercent(params.companyId),
    });
  }

  /**
   * Contract 3.7 (ADR-0064): how far each student's balance reaches into the
   * month of `today`, walked from the month's first lesson — `next` is the
   * first lesson of the month the payments do not reach, behind or ahead.
   * Empty when contract 3.2 is switched off; a student with no charge on an
   * ACTIVE enrollment this month is absent.
   */
  async reachForMonth(params: {
    companyId: number;
    studentIds: number[];
    today: string;
  }): Promise<Map<number, PaymentReach>> {
    const result = new Map<number, PaymentReach>();
    if (params.studentIds.length === 0) return result;
    if (params.today < ADMISSION_START_DAY) return result;
    if (!(await this.ruleEnabled(params.companyId))) return result;
    const [year, month] = params.today.split('-').map(Number);
    const [students, charges, minPaidPercent] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: params.studentIds } },
        select: { id: true, balance: true },
      }),
      this.loadCharges(this.prisma, params.studentIds, year, month),
      this.minPaidPercent(params.companyId),
    ]);
    for (const student of students) {
      const reach = paymentReach({
        today: `${params.today.slice(0, 8)}01`,
        balanceAfter: student.balance,
        charges: charges.filter((c) => c.studentId === student.id),
        minPaidPercent,
      });
      if (reach) result.set(student.id, reach);
    }
    return result;
  }

  private async loadCharges(
    client: Reader,
    studentIds: number[],
    year: number,
    month: number,
    andLater = false,
  ): Promise<
    (AdmissionCharge & {
      studentId: number;
      groupName: string;
      periodYear: number;
      periodMonth: number;
    })[]
  > {
    const rows = await client.enrollmentMonthlyCharge.findMany({
      where: {
        studentId: { in: studentIds },
        ...(andLater
          ? {
              OR: [
                { periodYear: { gt: year } },
                { periodYear: year, periodMonth: { gte: month } },
              ],
            }
          : { periodYear: year, periodMonth: month }),
        status: MonthlyChargeStatus.CHARGED,
        enrollment: { status: EnrollmentStatus.ACTIVE, deletedAt: null },
      },
      select: {
        studentId: true,
        groupId: true,
        periodYear: true,
        periodMonth: true,
        coveredDates: true,
        frozenOutDates: true,
        coveredLessons: true,
        perLessonCost: true,
        discountPercent: true,
        chargedAmount: true,
        group: { select: { name: true } },
      },
    });
    return rows.map(({ group, ...row }) => ({
      ...row,
      groupName: group.name,
    }));
  }
}
