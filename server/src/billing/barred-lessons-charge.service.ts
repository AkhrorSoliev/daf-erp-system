import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  MonthlyChargeStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsWriteService } from '../transactions/transactions-write.service';
import { LessonBillingService } from './lesson-billing.service';
import {
  applyDiscount,
  clampDiscount,
  proratedMonthlyAmount,
} from './monthly-price';

/** `Transaction.metadata.policy` of the release/restore rows written here. */
export const BARRED_LESSONS_POLICY = 'BARRED_LESSONS';

export interface ReleasedBarredDays {
  period: string;
  days: string[];
}

/** A released day with the price it would be charged again at. */
export interface OutstandingBarredDay {
  date: string;
  price: number;
}

export interface OutstandingBarredLessons {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  days: OutstandingBarredDay[];
}

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10000,
  timeout: 30000,
} as const;

const periodOf = (charge: { periodYear: number; periodMonth: number }) =>
  `${charge.periodYear}-${String(charge.periodMonth).padStart(2, '0')}`;

/**
 * Money side of the barred-lesson rule (ADR-0142).
 *
 * `release`: when an unpaid student is paused after N lessons the centre could
 * not mark, the money of those days comes off the month's charge. Only the
 * lessons the student attended stay as their debt. The contract (3.2) lets the
 * centre keep that money; the centre waives it (CEO, 30.10.2026).
 *
 * `restore`: when the student returns, the admin says which of the released
 * days they attended; each one is charged again at the same per-lesson price,
 * a PRESENT row is written and the teacher is paid for it through the one
 * billing pipeline (`processAttendanceBilling`).
 *
 * Both are append-only on the ledger: a release is a positive ADJUSTMENT, a
 * restore a negative one; both carry `metadata.policy = 'BARRED_LESSONS'` and
 * the day list, which is how the released days are found again.
 */
@Injectable()
export class BarredLessonsChargeService {
  constructor(
    private prisma: PrismaService,
    private transactionsWrite: TransactionsWriteService,
    private lessonBilling: LessonBillingService,
  ) {}

  async release(params: {
    enrollmentId: string;
    barredDays: string[];
    companyId: number;
    reason: string;
    performedById?: number;
  }): Promise<{ refunded: number; lessons: number }> {
    const days = [...new Set(params.barredDays)].sort();
    if (days.length === 0) return { refunded: 0, lessons: 0 };

    return this.prisma.$transaction(async (tx) => {
      const enr = await tx.enrollment.findUnique({
        where: { id: params.enrollmentId },
        select: { studentId: true, group: { select: { branchId: true } } },
      });
      if (!enr) return { refunded: 0, lessons: 0 };
      const charges = await tx.enrollmentMonthlyCharge.findMany({
        where: {
          enrollmentId: params.enrollmentId,
          status: MonthlyChargeStatus.CHARGED,
        },
      });
      let refunded = 0;
      let lessons = 0;
      for (const charge of charges) {
        const frozen = new Set(charge.frozenOutDates ?? []);
        const covered = new Set(charge.coveredDates ?? []);
        const mine = days.filter((d) => covered.has(d) && !frozen.has(d));
        if (mine.length === 0) continue;
        const amount = Math.min(
          charge.chargedAmount,
          applyDiscount(
            proratedMonthlyAmount(
              charge.monthlyPrice,
              charge.plannedLessons,
              mine.length,
            ),
            clampDiscount(charge.discountPercent ?? 0),
          ),
        );
        // ponytail: a release worth 0 (100% discount) writes no ledger row, so
        // `releasedDays` cannot find it and the return dialog will not offer it.
        if (amount > 0) {
          await this.transactionsWrite.createAdjustment(
            {
              studentId: enr.studentId,
              amount,
              companyId: params.companyId,
              branchId: enr.group.branchId,
              description: `${params.reason} — to'lov yo'qligi uchun davomat olib bo'lmagan ${mine.length} dars hisobdan chiqarildi`,
              performedById: params.performedById,
              actor: { kind: 'system' },
              metadata: {
                kind: 'monthly-release',
                policy: BARRED_LESSONS_POLICY,
                enrollmentId: params.enrollmentId,
                period: periodOf(charge),
                lessons: mine.length,
                dates: mine,
              },
            },
            tx,
          );
        }
        await tx.enrollmentMonthlyCharge.update({
          where: { id: charge.id },
          data: {
            coveredLessons: charge.coveredLessons - mine.length,
            chargedAmount: charge.chargedAmount - amount,
            frozenOutDates: [...frozen, ...mine].sort(),
          },
        });
        refunded += amount;
        lessons += mine.length;
      }
      return { refunded, lessons };
    }, TX_OPTIONS);
  }

  /**
   * Days a pause released and nobody has restored yet, per month. Read from
   * the ledger rows, which survive however the charge was edited since.
   */
  async releasedDays(
    enrollmentId: string,
    client: Pick<PrismaService, 'transaction'> = this.prisma,
  ): Promise<ReleasedBarredDays[]> {
    const rows = await client.transaction.findMany({
      where: {
        type: TransactionType.ADJUSTMENT,
        reversedAt: null,
        AND: [
          { metadata: { path: ['policy'], equals: BARRED_LESSONS_POLICY } },
          { metadata: { path: ['enrollmentId'], equals: enrollmentId } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { metadata: true },
    });
    const released = new Map<string, Set<string>>();
    for (const r of rows) {
      const m = r.metadata as {
        kind?: string;
        period?: string;
        dates?: string[];
      } | null;
      if (!m?.period || !m.dates) continue;
      const set = released.get(m.period) ?? new Set<string>();
      for (const d of m.dates) {
        if (m.kind === 'monthly-release') set.add(d);
        else if (m.kind === 'monthly-restore') set.delete(d);
      }
      released.set(m.period, set);
    }
    return [...released.entries()]
      .map(([period, set]) => ({ period, days: [...set].sort() }))
      .filter((r) => r.days.length > 0)
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Everything a student's pauses released and nobody restored, by enrollment,
   * with the per-lesson price of each day's month: the return dialog's list.
   */
  async outstandingForStudent(
    studentId: number,
    companyId: number,
  ): Promise<OutstandingBarredLessons[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, deletedAt: null, group: { companyId } },
      select: {
        id: true,
        groupId: true,
        group: { select: { name: true } },
        monthlyCharges: {
          where: { status: MonthlyChargeStatus.CHARGED },
          select: {
            periodYear: true,
            periodMonth: true,
            monthlyPrice: true,
            plannedLessons: true,
            discountPercent: true,
          },
        },
      },
    });
    const out: OutstandingBarredLessons[] = [];
    for (const e of enrollments) {
      const priceOf = new Map(
        e.monthlyCharges.map((c) => [
          periodOf(c),
          applyDiscount(
            proratedMonthlyAmount(c.monthlyPrice, c.plannedLessons, 1),
            clampDiscount(c.discountPercent ?? 0),
          ),
        ]),
      );
      const days = (await this.releasedDays(e.id)).flatMap((r) =>
        r.days.map((date) => ({ date, price: priceOf.get(r.period) ?? 0 })),
      );
      if (days.length > 0) {
        out.push({
          enrollmentId: e.id,
          groupId: e.groupId,
          groupName: e.group.name,
          days,
        });
      }
    }
    return out;
  }

  /**
   * The admin said the student attended these released days: charge each at
   * the month's per-lesson price again, mark it PRESENT and pay the teacher.
   * A day that was not released (or is already restored) refuses the whole
   * request, nothing is written.
   */
  async restore(params: {
    enrollmentId: string;
    attendedDays: string[];
    companyId: number;
    reason: string;
    performedById: number;
  }): Promise<{ charged: number; lessons: number }> {
    const days = [...new Set(params.attendedDays)].sort();
    if (days.length === 0) return { charged: 0, lessons: 0 };

    return this.prisma.$transaction(async (tx) => {
      const outstanding = new Set(
        (await this.releasedDays(params.enrollmentId, tx)).flatMap(
          (r) => r.days,
        ),
      );
      const bad = days.filter((d) => !outstanding.has(d));
      if (bad.length > 0) {
        throw new BadRequestException(
          `Bu kunlar hisobdan chiqarilmagan yoki allaqachon qaytarilgan: ${bad.join(', ')}`,
        );
      }
      const enr = await tx.enrollment.findUniqueOrThrow({
        where: { id: params.enrollmentId },
        select: {
          studentId: true,
          groupId: true,
          group: { select: { branchId: true } },
        },
      });
      const charges = await tx.enrollmentMonthlyCharge.findMany({
        where: {
          enrollmentId: params.enrollmentId,
          status: MonthlyChargeStatus.CHARGED,
        },
      });
      let charged = 0;
      let lessons = 0;
      for (const charge of charges) {
        const frozen = new Set(charge.frozenOutDates ?? []);
        const mine = days.filter((d) => frozen.has(d));
        if (mine.length === 0) continue;
        const amount = applyDiscount(
          proratedMonthlyAmount(
            charge.monthlyPrice,
            charge.plannedLessons,
            mine.length,
          ),
          clampDiscount(charge.discountPercent ?? 0),
        );
        if (amount > 0) {
          await this.transactionsWrite.createAdjustment(
            {
              studentId: enr.studentId,
              amount: -amount,
              companyId: params.companyId,
              branchId: enr.group.branchId,
              description: `${params.reason} — ${mine.length} dars qayta hisoblandi (o'quvchi shu darslarga kelgan)`,
              performedById: params.performedById,
              actor: { kind: 'user', id: params.performedById },
              metadata: {
                kind: 'monthly-restore',
                policy: BARRED_LESSONS_POLICY,
                enrollmentId: params.enrollmentId,
                period: periodOf(charge),
                lessons: mine.length,
                dates: mine,
              },
            },
            tx,
          );
        }
        await tx.enrollmentMonthlyCharge.update({
          where: { id: charge.id },
          data: {
            coveredLessons: charge.coveredLessons + mine.length,
            chargedAmount: charge.chargedAmount + amount,
            frozenOutDates: [...frozen].filter((d) => !mine.includes(d)).sort(),
          },
        });
        for (const day of mine) {
          const date = new Date(`${day}T00:00:00.000Z`);
          const row = await tx.attendance.upsert({
            where: {
              groupId_studentId_date: {
                groupId: enr.groupId,
                studentId: enr.studentId,
                date,
              },
            },
            update: {},
            create: {
              groupId: enr.groupId,
              studentId: enr.studentId,
              date,
              status: AttendanceStatus.PRESENT,
              markedById: params.performedById,
              companyId: params.companyId,
              note: "Qaytishda administrator belgiladi (to'lov yo'qligi uchun davomat olib bo'lmagan dars)",
            },
          });
          await this.lessonBilling.processAttendanceBilling(tx, {
            attendanceId: row.id,
            enrollmentId: params.enrollmentId,
            studentId: enr.studentId,
            groupId: enr.groupId,
            branchId: enr.group.branchId,
            lessonDate: date,
            oldStatus: null,
            newStatus: AttendanceStatus.PRESENT,
            companyId: params.companyId,
            performedById: params.performedById,
          });
        }
        charged += amount;
        lessons += mine.length;
      }
      return { charged, lessons };
    }, TX_OPTIONS);
  }
}
