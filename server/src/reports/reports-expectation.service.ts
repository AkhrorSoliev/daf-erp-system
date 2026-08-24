import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { RedisService } from '../redis/redis.service';
import { perLessonPrice } from '../common/finance/per-lesson-price';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import {
  splitMonthLessons,
  type ExpectationGroup,
  type PricedAttendance,
} from './expectation-math';
import { cachedExpectation, expectationCacheKey } from './expectation-cache';

export interface MonthlyExpectation {
  month: string;
  heldValue: number;
  heldLessons: number;
  remainingValue: number;
  remainingLessons: number;
  expectedValue: number;
}

const DAY_MS = 86_400_000;

/**
 * «Oy oxiriga kutilyapti» — what this month's lessons are worth by the time it
 * closes, on the SAME accrual basis as «Sof foyda» and the collection ratio.
 *
 * It replaces `recognizedRevenueForecast`, which assumed every month was four
 * weeks (8–13% short on a five-week month) and was rebuilt from whoever was
 * ACTIVE at request time, so a student leaving on the 25th was erased from the
 * whole month — June and July both scored the same figure and the number told
 * you nothing about either.
 *
 * Lesson value, not cash. A cash projection would need an "about 82% gets
 * paid" coefficient drawn from two months, and that coefficient bundles
 * prepayment timing, debt and new-enrolment cycles into one number nobody can
 * decompose when it comes out wrong.
 */
@Injectable()
export class ReportsExpectationService {
  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private redis: RedisService,
  ) {}

  /**
   * `asOf` (Tashkent `YYYY-MM-DD`, optional) treats every attendance AFTER that
   * date as if it had not happened yet, so the figure can be replayed as it
   * looked mid-month. Not a test hook — it is what makes the projection
   * auditable, and it is what the backtest script runs.
   */
  async getMonthlyExpectation(
    companyId: number,
    {
      month,
      branchIds,
      asOf,
    }: { month: string; branchIds: ReportBranchIds; asOf?: string },
  ): Promise<MonthlyExpectation> {
    const empty: MonthlyExpectation = {
      month,
      heldValue: 0,
      heldLessons: 0,
      remainingValue: 0,
      remainingLessons: 0,
      expectedValue: 0,
    };
    if (isEmptyScope(branchIds)) return empty;

    return cachedExpectation(
      this.redis,
      expectationCacheKey(companyId, branchIds, month, asOf),
      () => this.compute(companyId, month, branchIds, empty, asOf),
    );
  }

  private async compute(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
    empty: MonthlyExpectation,
    asOf?: string,
  ): Promise<MonthlyExpectation> {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return empty;

    // `Attendance.date` / `LessonCancellation.date` are @db.Date — unshifted
    // UTC bounds, upper EXCLUSIVE. A Tashkent-shifted start truncates onto the
    // previous month's last day and sweeps it in (the H3 defect).
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDateExcl = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthStartStr = `${month}-01`;
    const monthEndStr = `${month}-${String(lastDay).padStart(2, '0')}`;

    // EVERY group in scope, whatever its status today. A lesson that was held
    // was held — if the group has since been completed, paused or archived,
    // its past lessons must still count. Restricting this to ACTIVE groups is
    // the H20 defect (`/reports/activity` builds its universe from live status
    // and loses 35% of June's occupied hours); measured here, it dropped 235 of
    // July's 5 143 billable attendances and 8.0 mln so'm.
    //
    // Only the FUTURE projection is limited to active groups — see
    // `projectable` below.
    const groupWhere = {
      companyId,
      ...(branchIds && { branchId: { in: branchIds } }),
    };

    const [groups, holidayDates, cancellations] = await Promise.all([
      this.prisma.group.findMany({
        where: groupWhere,
        select: {
          id: true,
          statusEnum: true,
          deletedAt: true,
          exactDays: true,
          startDate: true,
          endDate: true,
          scheduleSnapshots: {
            select: { exactDays: true, validFrom: true, validTo: true },
          },
          course: { select: { price: true, lessonPaymentCount: true } },
          contracts: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { studentId: true, totalAmount: true },
          },
          enrollments: {
            where: { deletedAt: null, status: 'ACTIVE' },
            select: {
              studentId: true,
              student: { select: { discountPercent: true } },
            },
          },
        },
      }),
      this.holidays.buildHolidayDateSet(
        startDate,
        new Date(endDateExcl.getTime() - DAY_MS),
      ),
      this.prisma.lessonCancellation.findMany({
        where: {
          deletedAt: null,
          date: { gte: startDate, lt: endDateExcl },
          group: groupWhere,
        },
        select: { groupId: true, date: true },
      }),
    ]);
    if (groups.length === 0) return empty;

    const groupIds = groups.map((g) => g.id);
    // `asOf` narrows the upper bound so a replay sees only what had happened by
    // then; the rest of the month falls back to the roster projection.
    const attendanceEnd =
      asOf && asOf < monthEndStr
        ? new Date(new Date(`${asOf}T00:00:00Z`).getTime() + DAY_MS)
        : endDateExcl;
    const attendances = await this.prisma.attendance.findMany({
      where: {
        companyId,
        status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
        date: { gte: startDate, lt: attendanceEnd },
        groupId: { in: groupIds },
      },
      select: { id: true, groupId: true, studentId: true, date: true },
    });

    // Live consumption per attendance → the seam between held and remaining.
    const consumed = new Map<string, number | null>();
    const attIds = attendances.map((a) => a.id);
    for (let i = 0; i < attIds.length; i += 1000) {
      const rows = await this.prisma.transaction.findMany({
        where: {
          companyId,
          type: 'LESSON_CONSUMPTION',
          reversedAt: null,
          attendanceId: { in: attIds.slice(i, i + 1000) },
        },
        select: { attendanceId: true, metadata: true },
      });
      for (const r of rows) {
        if (!r.attendanceId) continue;
        const meta = r.metadata as { perLessonCost?: number } | null;
        consumed.set(r.attendanceId, meta?.perLessonCost ?? null);
      }
    }

    const cancelledByGroup = new Map<string, Set<string>>();
    for (const c of cancellations) {
      const set = cancelledByGroup.get(c.groupId) ?? new Set<string>();
      set.add(tashkentDateStr(c.date));
      cancelledByGroup.set(c.groupId, set);
    }

    const attByGroup = new Map<string, typeof attendances>();
    for (const a of attendances) {
      const list = attByGroup.get(a.groupId);
      if (list) list.push(a);
      else attByGroup.set(a.groupId, [a]);
    }

    const inputs: ExpectationGroup[] = groups.map((g) => {
      const contractFor = (studentId: number) =>
        g.contracts.find((c) => c.studentId === studentId)?.totalAmount ?? null;
      const priceFor = (studentId: number, discount: number | null) =>
        perLessonPrice({
          course: g.course,
          discountPercent: discount,
          contractTotalAmount: contractFor(studentId),
        });

      const discountByStudent = new Map(
        g.enrollments.map((e) => [
          e.studentId,
          e.student?.discountPercent ?? 0,
        ]),
      );

      const covered: PricedAttendance[] = [];
      const uncovered: PricedAttendance[] = [];
      const datesWithAttendance = new Set<string>();
      for (const a of attByGroup.get(g.id) ?? []) {
        datesWithAttendance.add(tashkentDateStr(a.date));
        if (consumed.has(a.id)) {
          // Legacy rows carry no metadata: fall back to the bare course price,
          // byte-for-byte what `getRecognizedRevenue` does, so the two agree.
          // The student discount is deliberately NOT applied here — this is
          // reconstructing what was billed, not what would be charged today.
          const stored = consumed.get(a.id);
          covered.push({
            perLesson:
              stored ??
              Math.round(g.course.price / (g.course.lessonPaymentCount || 12)),
          });
        } else {
          uncovered.push({
            perLesson: priceFor(
              a.studentId,
              discountByStudent.get(a.studentId) ?? 0,
            ),
          });
        }
      }

      // A completed / paused / archived / deleted group holds no lessons in the
      // future, so it gets an empty roster and the calendar walk skips it. Its
      // past attendances above are untouched. A PAUSED group can still carry
      // ACTIVE enrollments, so this must be explicit rather than relying on the
      // roster coming back empty on its own.
      const projectable = g.statusEnum === 'ACTIVE' && g.deletedAt === null;

      return {
        groupId: g.id,
        exactDays: g.exactDays ?? [],
        startDateStr: g.startDate ? tashkentDateStr(g.startDate) : null,
        endDateStr: g.endDate ? tashkentDateStr(g.endDate) : null,
        scheduleSnapshots: g.scheduleSnapshots,
        roster: projectable
          ? g.enrollments.map((e) => ({
              studentId: e.studentId,
              perLesson: priceFor(e.studentId, e.student?.discountPercent ?? 0),
            }))
          : [],
        datesWithAttendance,
        cancelledDates: cancelledByGroup.get(g.id) ?? new Set<string>(),
        coveredAttendances: covered,
        uncoveredAttendances: uncovered,
      };
    });

    // `asOf` doubles as "today" when replaying, so a replay does not project
    // onto days that were still in the future at the time.
    const todayStr = asOf ?? tashkentDateStr(new Date());

    const split = splitMonthLessons(inputs, {
      monthStartStr,
      monthEndStr,
      holidayDates,
      todayStr,
    });

    return {
      month,
      ...split,
      expectedValue: split.heldValue + split.remainingValue,
    };
  }
}
