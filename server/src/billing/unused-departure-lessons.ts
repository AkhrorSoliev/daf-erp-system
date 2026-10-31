import type { Prisma } from '@prisma/client';
import { EnrollmentStatus, MonthlyChargeStatus } from '@prisma/client';
import {
  addDaysToDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { barredLessonDays } from '../attendance/barred-lessons';
import { applyDiscount } from './monthly-price';

/**
 * A departed student's lessons that were paid for but never used (CEO,
 * 31.10.2026): days a monthly charge billed, the teacher held class, and the
 * student has no row at all — not «Keldi», not a late-payment «Keldi» either
 * (ADR-0143 only resolves these while the enrollment is still ACTIVE). Once
 * the student leaves, nothing will ever mark them, so the CEO may choose to
 * cancel the debt for the ones they pick. Automatic for nobody — this only
 * lists candidates; a human always decides which days and confirms.
 *
 * Not the 6.2 departure release (`departure-release.ts`): that returns FUTURE
 * unheld days. This is about PAST days the student could not attend because
 * they were kept out, now permanently unreachable because they left.
 */
export interface UnusedLessonDay {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  date: string;
  /** Discounted lesson price — what cancelling this day would give back. */
  amount: number;
}

type Db = Pick<Prisma.TransactionClient, 'enrollment' | 'attendance'>;

/**
 * DROPPED enrollments of this student (covers both a plain removal and an
 * expulsion — `StatusCascadeService` cascades either to DROPPED, there is no
 * separate EXPELLED enrollment status) whose CHARGED monthly charges still
 * hold unused days up to the day the enrollment ended.
 */
export async function unusedDepartureLessons(
  db: Db,
  studentId: number,
): Promise<UnusedLessonDay[]> {
  const enrollments = await db.enrollment.findMany({
    where: {
      studentId,
      status: EnrollmentStatus.DROPPED,
      deletedAt: null,
      statusChangedAt: { not: null },
    },
    select: {
      id: true,
      groupId: true,
      statusChangedAt: true,
      group: { select: { name: true } },
      monthlyCharges: {
        where: { status: MonthlyChargeStatus.CHARGED },
        select: {
          coveredDates: true,
          frozenOutDates: true,
          perLessonCost: true,
          discountPercent: true,
        },
      },
    },
  });
  if (enrollments.length === 0) return [];

  const groupIds = [...new Set(enrollments.map((e) => e.groupId))];
  const from = enrollments
    .flatMap((e) => e.monthlyCharges.flatMap((c) => c.coveredDates))
    .sort()[0];
  if (!from) return [];
  const toExclusive = addDaysToDateStr(
    enrollments
      .map((e) => e.statusChangedAt!.toISOString().slice(0, 10))
      .sort()
      .at(-1)!,
    1,
  );
  const range = {
    gte: utcMidnightFromDateStr(from),
    lt: utcMidnightFromDateStr(toExclusive),
  };
  const dayStr = (d: Date) => d.toISOString().slice(0, 10);

  const [heldRows, rows] = await Promise.all([
    db.attendance.groupBy({
      by: ['groupId', 'date'],
      where: { groupId: { in: groupIds }, date: range, cancellationId: null },
    }),
    db.attendance.findMany({
      where: { studentId, groupId: { in: groupIds }, date: range },
      select: { groupId: true, date: true },
    }),
  ]);
  const heldByGroup = new Map<string, Set<string>>();
  for (const r of heldRows) {
    const s = heldByGroup.get(r.groupId) ?? new Set<string>();
    s.add(dayStr(r.date));
    heldByGroup.set(r.groupId, s);
  }
  const markedByGroup = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = markedByGroup.get(r.groupId) ?? new Set<string>();
    s.add(dayStr(r.date));
    markedByGroup.set(r.groupId, s);
  }

  const result: UnusedLessonDay[] = [];
  for (const e of enrollments) {
    const endDay = e.statusChangedAt!.toISOString().slice(0, 10);
    const endExclusive = addDaysToDateStr(endDay, 1);
    for (const charge of e.monthlyCharges) {
      const days = barredLessonDays({
        coveredDates: charge.coveredDates,
        frozenOutDates: charge.frozenOutDates,
        heldDays: heldByGroup.get(e.groupId) ?? new Set(),
        markedDays: markedByGroup.get(e.groupId) ?? new Set(),
        from,
        to: endExclusive,
        includeFrozenOut: false,
      });
      const amount = applyDiscount(
        charge.perLessonCost,
        charge.discountPercent,
      );
      for (const date of days) {
        result.push({
          enrollmentId: e.id,
          groupId: e.groupId,
          groupName: e.group.name,
          date,
          amount,
        });
      }
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
