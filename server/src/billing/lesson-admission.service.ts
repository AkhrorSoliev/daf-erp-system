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
    const charges = await this.loadCharges(
      client,
      params.studentIds,
      year,
      month,
    );
    for (const student of students) {
      result.set(
        student.id,
        lessonAdmission({
          lessonDay: params.lessonDay,
          groupId: params.groupId,
          balance: student.balance,
          charges: charges.filter((c) => c.studentId === student.id),
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
    });
  }

  private async loadCharges(
    client: Reader,
    studentIds: number[],
    year: number,
    month: number,
  ): Promise<(AdmissionCharge & { studentId: number; groupName: string })[]> {
    const rows = await client.enrollmentMonthlyCharge.findMany({
      where: {
        studentId: { in: studentIds },
        periodYear: year,
        periodMonth: month,
        status: MonthlyChargeStatus.CHARGED,
        enrollment: { status: EnrollmentStatus.ACTIVE, deletedAt: null },
      },
      select: {
        studentId: true,
        groupId: true,
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
