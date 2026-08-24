import { Injectable } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pickActiveVersion, RateVersion } from './shared/deserved-math';
import { isTopUpMonth } from './shared/topup';
import {
  resolveMonthlyScope,
  type SalaryMonthlyQuery,
} from './shared/resolve-monthly-scope';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';
import { buildTeacherRosterWhere } from './shared/teacher-roster-where';
import { sweepGapLessons } from './shared/gap-sweep';

export type { SalaryMonthlyQuery } from './shared/resolve-monthly-scope';

/**
 * Net-to-pay base per month. **Faza 2 (July center top-up):** from
 * `TOPUP_EFFECTIVE_MONTH` on, the net-to-pay shown is the FULL deserved salary —
 * `covered` (students-paid) PLUS `centerFunded` (the center's leg), minus advances —
 * because the cron now actually PAYS that (`SalaryCalculationService` Phase 0).
 * Earlier months stay on the covered base, so a given month's shown and paid
 * figures always agree. Already-settled months show their real
 * `SalaryPayment.amount` regardless (which, for a top-up month, already includes
 * the gap). Gated by `isTopUpMonth` — the single switch lives in `shared/topup`.
 */

/** "YYYY-MM-DD" of a `@db.Date` value (UTC midnight), for override keys. */
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Ustozlar oyligi" — per-teacher salary report for ONE selected month.
 *
 * The month's earnings are split BY FUNDER, and that split is computed the same
 * way no matter whether the month has been settled yet:
 *  - `covered`       = accruals a student's payment backed (`wasCenterTopUp` false)
 *  - `centerFunded`  = written center top-up accruals (`wasCenterTopUp` true)
 *                      PLUS billable lessons that still carry no accrual × rate
 *  - `fullDeserved`  = `covered` + `centerFunded` (all lessons held × rate)
 *  - `advances`      = TEACHER_ADVANCE given during the calendar month
 *  - `netToPay`      = base (see NET_BASE) − advances, or the settled payment's net
 *
 * Settlement moves money from the second term of `centerFunded` to the first,
 * and nothing else: an in-progress month carries the center's leg entirely as a
 * forecast, a settled month entirely as written accruals, and the totals match
 * across the boundary. The earlier shape summed EVERY accrual into `covered`,
 * so the night the cron settled July it reported 15.5 mln so'm of the center's
 * own money as "o'quvchilar to'lagan" and showed a 0 top-up.
 *
 * Manual/Excel months (no per-lesson accruals — e.g. May, whose config only
 * became effective in June) have `hasLessonData = false`, so the deserved /
 * covered / centerFunded columns come back `null` (rendered as "—"). We never
 * fabricate those numbers from a proxy rate.
 *
 * The deserved math is the SAME as the read-only forecast script
 * (`scripts/forecast-full-salary-topup.ts`), ported into a bulk in-memory sweep
 * (one query per input, no per-lesson DB lookups).
 */
@Injectable()
export class SalaryMonthlyService {
  constructor(
    private prisma: PrismaService,
    private staff: SalaryStaffMonthlyService,
  ) {}

  async getMonthly(
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    // ─── Step 1+2: shared month/period/branch scope ──────────────────────
    // Resolved via the same helper the non-teaching staff pass uses, so the
    // two views can never disagree on month/period/branch scope.
    const scope = await resolveMonthlyScope(
      this.prisma,
      query,
      companyId,
      performedById,
    );
    const {
      month,
      floorMonth,
      period,
      periodStart,
      periodEnd,
      periodStartDate,
      periodEndDateExclusive,
      monthStart,
      nextMonthStart,
      periodStartLow,
      periodStartHigh,
      branchId,
      blocked,
      search,
      searchId,
      userId,
    } = scope;

    // Non-teaching FIXED_MONTHLY staff (admins/cashiers/directors). Computed up
    // front so it is returned even on the zero-teacher early-return below.
    const { staff, staffTotals } = await this.staff.computeStaff(scope);

    // Teacher roster for this month, in branch scope. Shared with the center
    // top-up drill-down so the card's total and the student list behind it can
    // never be computed over two different rosters.
    const where: Prisma.UserWhereInput = buildTeacherRosterWhere({
      companyId,
      blocked,
      userId,
      branchId,
      search,
      searchId,
    });

    const teachers = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
    });
    const ids = teachers.map((t) => t.id);

    const zeroTotals = {
      fullDeserved: 0,
      covered: 0,
      carriedIn: 0,
      carriedOut: 0,
      centerFunded: 0,
      advances: 0,
      netToPay: 0,
      // Center top-up lifecycle (company-level summary card):
      //   advanced (X) = Σ wasCenterTopUp, stillFronted (Z) = Σ isCenterTopUp,
      //   recovered (Y) = X − Z.
      centerAdvanced: 0,
      centerStillFronted: 0,
      centerRecovered: 0,
      // Today's total debt of the students the center is still fronting for —
      // the collectable figure the recovery drill-down lists per student.
      centerOwedByStudents: 0,
    };
    if (ids.length === 0) {
      return {
        month,
        floorMonth,
        period,
        data: [],
        totals: zeroTotals,
        staff,
        staffTotals,
      };
    }
    // ─── Step 3: bulk fetches (one query each, no per-lesson DB) ──────────
    const [
      accruals,
      attendances,
      groups,
      groupTeachers,
      overrides,
      versionRows,
      advancesAgg,
      payments,
      carriedOutAgg,
      heldCounts,
      inactiveStudents,
    ] = await Promise.all([
      // Covered ground-truth — accruals bucketed into this period (carry-over OR).
      // `creditPeriodDate` is selected so a carried-IN accrual (its lessonDate is
      // in a prior month, but it lands here) can be split out as "oldingi oydan".
      this.prisma.salaryAccrual.findMany({
        where: {
          companyId,
          userId: { in: ids },
          reversedAt: null,
          OR: [
            { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
            {
              creditPeriodDate: null,
              lessonDate: { gte: periodStartDate, lt: periodEndDateExclusive },
            },
          ],
        },
        select: {
          userId: true,
          attendanceId: true,
          amount: true,
          creditPeriodDate: true,
          isCenterTopUp: true,
          wasCenterTopUp: true,
          // Who the center fronted for — the input to `centerOwedByStudents`.
          studentId: true,
        },
      }),
      // Billable attendances in the period (for the GAP sweep). Every held
      // lesson (PRESENT/LATE/ABSENT) can earn the teacher; the center fronts an
      // uncovered one. EXCUSED never bills/accrues.
      this.prisma.attendance.findMany({
        where: {
          companyId,
          status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
          date: { gte: periodStartDate, lt: periodEndDateExclusive },
        },
        select: { id: true, studentId: true, groupId: true, date: true },
      }),
      // perLessonCost basis.
      this.prisma.group.findMany({
        where: { companyId },
        select: {
          id: true,
          course: { select: { price: true, lessonPaymentCount: true } },
        },
      }),
      // Group rosters.
      this.prisma.groupTeacher.findMany({
        select: { groupId: true, teacherId: true },
      }),
      // Substitute overrides per (group, date).
      this.prisma.lessonTeacherOverride.findMany({
        where: { deletedAt: null },
        select: { groupId: true, date: true, teacherIds: true },
      }),
      // Active salary config versions (resolved in-memory per lesson date).
      this.prisma.employeeSalaryConfigVersion.findMany({
        where: { companyId, config: { isActive: true } },
        select: {
          salaryType: true,
          value: true,
          effectiveFrom: true,
          effectiveTo: true,
          config: { select: { userId: true, groupId: true, salaryType: true } },
        },
      }),
      // Advances GIVEN during the calendar month (by accounting date).
      this.prisma.expense.groupBy({
        by: ['relatedUserId'],
        where: {
          relatedUserId: { in: ids },
          category: 'TEACHER_ADVANCE',
          companyId,
          deletedAt: null,
          date: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { amount: true },
      }),
      // Settled SalaryPayment for the month (net + gross + status).
      this.prisma.salaryPayment.findMany({
        where: {
          companyId,
          userId: { in: ids },
          status: { not: SalaryPaymentStatus.CANCELLED },
          periodStart: { gte: periodStartLow, lt: periodStartHigh },
        },
        select: {
          id: true,
          userId: true,
          amount: true,
          status: true,
          settledExpenses: { select: { amount: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Carried OUT: this month's LESSONS whose earning was carried forward to a
      // LATER period (a late payment arrived after this month was settled). These
      // are NOT in `covered` (the OR above excludes them), so surface them so the
      // teacher/CEO can see "keyingi oyga o'tgan".
      this.prisma.salaryAccrual.groupBy({
        by: ['userId'],
        where: {
          companyId,
          userId: { in: ids },
          reversedAt: null,
          lessonDate: { gte: periodStartDate, lt: periodEndDateExclusive },
          creditPeriodDate: { gt: periodEnd },
        },
        _sum: { amount: true },
      }),
      // BR-09: per-(student, group) count of ATTENDED (PRESENT/LATE) lessons up
      // to this period's end — the new-student top-up gate (mirrors the cron).
      this.prisma.attendance.groupBy({
        by: ['studentId', 'groupId'],
        where: {
          companyId,
          status: { in: ['PRESENT', 'LATE'] },
          date: { lt: periodEndDateExclusive },
        },
        _count: { _all: true },
      }),
      // Top-up cap: an inactive student is only fronted for lessons up to the
      // date they went inactive (statusChangedAt). Mirrors the cron sweep.
      this.prisma.student.findMany({
        where: {
          companyId,
          status: { not: 'ACTIVE' },
          statusChangedAt: { not: null },
        },
        select: { id: true, statusChangedAt: true },
      }),
    ]);
    const carriedOutMap = new Map(
      carriedOutAgg.map((a) => [a.userId, a._sum.amount ?? 0]),
    );
    // (studentId::groupId) -> attended-lesson count (BR-09 new-student gate).
    const heldByStudentGroup = new Map<string, number>();
    for (const h of heldCounts) {
      heldByStudentGroup.set(`${h.studentId}::${h.groupId}`, h._count._all);
    }
    // (studentId) -> Tashkent date the student went inactive (top-up cap).
    const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const inactiveSince = new Map<number, string>();
    for (const s of inactiveStudents) {
      if (s.statusChangedAt) {
        inactiveSince.set(
          s.id,
          new Date(s.statusChangedAt.getTime() + TASHKENT_OFFSET_MS)
            .toISOString()
            .slice(0, 10),
        );
      }
    }
    // NOTE: no local inactivity predicate here on purpose. `inactiveSince` is
    // handed to `sweepGapLessons` below and the cap is applied inside it — the
    // single place this rule lives since the gap sweep was consolidated. A copy
    // here would be a second definition of the same rule, free to drift.

    // ─── Build in-memory maps ─────────────────────────────────────────────
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const rosterMap = new Map<string, number[]>();
    for (const gt of groupTeachers) {
      const arr = rosterMap.get(gt.groupId) ?? [];
      arr.push(gt.teacherId);
      rosterMap.set(gt.groupId, arr);
    }
    const overrideMap = new Map<string, number[]>();
    for (const o of overrides) {
      overrideMap.set(`${o.groupId}::${dateStr(o.date)}`, o.teacherIds);
    }
    const resolveTeachers = (groupId: string, dStr: string): number[] =>
      overrideMap.get(`${groupId}::${dStr}`) ?? rosterMap.get(groupId) ?? [];

    const versByKey = new Map<string, RateVersion[]>();
    const fixedMonthlyTeachers = new Set<number>();
    for (const r of versionRows) {
      const key = `${r.config.userId}::${r.config.groupId ?? 'GLOBAL'}`;
      const arr = versByKey.get(key) ?? [];
      arr.push({
        salaryType: r.salaryType,
        value: r.value,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      });
      versByKey.set(key, arr);
      if (
        r.config.salaryType === SalaryType.FIXED_MONTHLY &&
        r.config.groupId == null
      ) {
        fixedMonthlyTeachers.add(r.config.userId);
      }
    }
    const resolveRate = (
      tid: number,
      groupId: string,
      at: Date,
    ): RateVersion | null =>
      pickActiveVersion(versByKey.get(`${tid}::${groupId}`), at) ??
      pickActiveVersion(versByKey.get(`${tid}::GLOBAL`), at);

    const advancesByUser = new Map(
      advancesAgg.map((a) => [a.relatedUserId as number, a._sum.amount ?? 0]),
    );

    // Settled payment per teacher (sum if duplicated; latest status wins — asc order).
    const paymentByUser = new Map<
      number,
      {
        id: string;
        amount: number;
        grossAmount: number;
        status: SalaryPaymentStatus;
      }
    >();
    for (const p of payments) {
      const adv = p.settledExpenses.reduce((s, e) => s + e.amount, 0);
      const prev = paymentByUser.get(p.userId);
      paymentByUser.set(p.userId, {
        id: p.id,
        amount: (prev?.amount ?? 0) + p.amount,
        grossAmount: (prev?.grossAmount ?? 0) + p.amount + adv,
        status: p.status,
      });
    }

    // ─── Step 4: per-teacher aggregation (single pass over attendances) ──
    interface Agg {
      /** Every live accrual in the period, whoever funded it. */
      accrued: number;
      /** …of which a student's payment backed (`wasCenterTopUp` false). */
      studentFunded: number;
      carriedIn: number;
      coveredAtt: Set<string>;
      /** Billable lessons with NO accrual yet — the center's unsettled leg. */
      gap: number;
      gapUnits: number;
      noConfigUnits: number;
      isFixedMonthly: boolean;
      centerAdvanced: number;
      centerStillFronted: number;
    }
    /** Students the center is still fronting lessons for, this period. */
    const frontedStudentIds = new Set<number>();
    const agg = new Map<number, Agg>();
    for (const id of ids) {
      agg.set(id, {
        accrued: 0,
        studentFunded: 0,
        carriedIn: 0,
        coveredAtt: new Set(),
        gap: 0,
        gapUnits: 0,
        noConfigUnits: 0,
        isFixedMonthly: fixedMonthlyTeachers.has(id),
        centerAdvanced: 0,
        centerStillFronted: 0,
      });
    }
    for (const ac of accruals) {
      const a = agg.get(ac.userId);
      if (!a) continue;
      a.accrued += ac.amount;
      // THE funder split, and the reason this report can describe a settled and
      // an in-progress month with one rule. `wasCenterTopUp` is sticky, so an
      // accrual the center fronted stays on the center's side of the split even
      // after the student pays it back — the money the teacher was paid that
      // month still came from the center. The pay-back is a separate event, and
      // it is what `centerStillFronted` / `centerRecovered` below report.
      //
      // Summing everything into `covered` (the old shape) meant that the moment
      // the cron settled a month, 15.5 mln so'm the center had just paid was
      // relabelled "o'quvchilar to'lagan" and the top-up column dropped to 0.
      if (ac.wasCenterTopUp) a.centerAdvanced += ac.amount;
      else a.studentFunded += ac.amount;
      // A carried-IN accrual (creditPeriodDate set → lessonDate was a prior month).
      if (ac.creditPeriodDate) a.carriedIn += ac.amount;
      if (ac.attendanceId) a.coveredAtt.add(ac.attendanceId);
      if (ac.isCenterTopUp) {
        a.centerStillFronted += ac.amount;
        frontedStudentIds.add(ac.studentId);
      }
    }
    // Which lessons the center still has to front. Shared with the center
    // top-up drill-down, which sums the SAME sweep by student instead of by
    // teacher — so the payroll column and the list of people it is owed by are
    // computed from one set of exclusions.
    const sweep = sweepGapLessons({
      attendances,
      groupMap,
      resolveTeachers,
      resolveRate,
      inScope: (tid) => agg.has(tid),
      isCovered: (tid, attId) => agg.get(tid)?.coveredAtt.has(attId) ?? false,
      isFixedMonthly: (tid) => agg.get(tid)?.isFixedMonthly ?? false,
      heldByStudentGroup,
      inactiveSince,
      dateStr,
    });
    for (const l of sweep.lessons) {
      const a = agg.get(l.teacherId);
      if (!a) continue;
      a.gap += l.amount;
      a.gapUnits += 1;
    }
    for (const [tid, n] of sweep.noConfigUnits) {
      const a = agg.get(tid);
      if (a) a.noConfigUnits = n;
    }

    // ─── Step 5+6: build rows ────────────────────────────────────────────
    const rows = teachers.map((t) => {
      const a = agg.get(t.id)!;
      // Keyed off the accrual TOTAL, not the student leg: a month the center
      // funded end to end has `studentFunded = 0` and would otherwise blank out
      // its columns as if there were no lesson data at all.
      const hasLessonData = a.accrued !== 0 || a.gapUnits !== 0;
      // The forecast leg is a real figure ONLY from TOPUP_EFFECTIVE_MONTH on.
      // Before that the center tops up nothing, so a "qo'shilishi kerak" number
      // only confuses — drop it and let deserved = what students covered.
      const showGap = isTopUpMonth(month);
      const rawGap = showGap ? a.gap : 0;
      // The center's leg, whatever phase the month is in: what it has ALREADY
      // paid (written top-up accruals) plus what it still owes for lessons that
      // have not been settled yet. A settled month has no second term, an
      // in-progress one has no first — the formula does not branch on that.
      const rawCenterFunded = a.centerAdvanced + rawGap;
      const fullDeserved = hasLessonData
        ? a.studentFunded + rawCenterFunded
        : null;
      const covered = hasLessonData ? a.studentFunded : null;
      const centerFunded = hasLessonData ? rawCenterFunded : null;
      const advances = advancesByUser.get(t.id) ?? 0;
      const payment = paymentByUser.get(t.id) ?? null;

      // Net-to-pay: a settled payment's `amount` is ALREADY net of settled
      // advances (CLAUDE.md invariant) — never subtract avans again. For an
      // unsettled month, net = base − advances.
      let netToPay: number;
      if (payment) {
        netToPay = payment.amount;
      } else {
        // Top-up months front the gap (full deserved); earlier months pay only
        // what students covered. Keeps the shown netToPay equal to what the cron
        // will actually pay for this month.
        const base =
          isTopUpMonth(month) && hasLessonData ? a.accrued + a.gap : a.accrued;
        netToPay = Math.max(0, base - advances);
      }

      return {
        user: {
          id: t.id,
          firstName: t.firstName,
          lastName: t.lastName,
          isActive: t.isActive,
          branch: t.branches[0]?.branch ?? null,
        },
        hasLessonData,
        isFixedMonthly: a.isFixedMonthly,
        fullDeserved,
        covered,
        // "Oldingi oydan" — portion of `covered` that came from prior-month
        // lessons carried into this period. "Keyingi oyga o'tgan" — this month's
        // lessons whose earning was carried forward to a later period (NOT in
        // `covered`). Both are informational transparency columns.
        carriedIn: a.carriedIn,
        carriedOut: carriedOutMap.get(t.id) ?? 0,
        centerFunded,
        advances,
        netToPay,
        // `centerAdvanced` is the WRITTEN part of `centerFunded` (X) — what the
        // center has actually handed over — and with `centerStillFronted` (Z)
        // it drives the company-level recovery card. For an in-progress month
        // it is 0 while `centerFunded` already carries the forecast.
        centerAdvanced: a.centerAdvanced,
        centerStillFronted: a.centerStillFronted,
        payment: payment
          ? { id: payment.id, amount: payment.amount, status: payment.status }
          : null,
      };
    });

    // Sort by gross magnitude desc, then name.
    rows.sort((a, b) => {
      const ma = a.fullDeserved ?? (a.payment ? a.netToPay : 0);
      const mb = b.fullDeserved ?? (b.payment ? b.netToPay : 0);
      if (mb !== ma) return mb - ma;
      const fn = a.user.firstName.localeCompare(b.user.firstName);
      return fn !== 0 ? fn : a.user.lastName.localeCompare(b.user.lastName);
    });

    // ─── Step 7: JAMI totals (deserved/covered/gap only over lesson-data rows) ─
    const totals = rows.reduce(
      (s, r) => ({
        fullDeserved: s.fullDeserved + (r.fullDeserved ?? 0),
        covered: s.covered + (r.covered ?? 0),
        carriedIn: s.carriedIn + r.carriedIn,
        carriedOut: s.carriedOut + r.carriedOut,
        centerFunded: s.centerFunded + (r.centerFunded ?? 0),
        advances: s.advances + r.advances,
        netToPay: s.netToPay + r.netToPay,
        centerAdvanced: s.centerAdvanced + r.centerAdvanced,
        centerStillFronted: s.centerStillFronted + r.centerStillFronted,
        centerRecovered: 0, // filled below (X − Z)
        centerOwedByStudents: 0, // filled below (one query over the debtors)
      }),
      { ...zeroTotals },
    );
    // recovered (Y) = advanced (X) − still-fronted (Z).
    totals.centerRecovered = totals.centerAdvanced - totals.centerStillFronted;

    // What can be collected from the students the center fronted for: the sum
    // of their debts as their profiles show them.
    //
    // The MONTH scopes the set of students, not the debt of each. Two attempts
    // to scope the debt itself were both wrong on production July 2026. The
    // month's lesson cost (21 234 015) ignores every payment made since —
    // #10026 showed 345 000 while owing 156 000. Capping at `min(debt, lesson
    // cost)` (18 865 019) was worse in a quieter way: the drill-down then
    // reported 466 662 for #10058 while his profile said 624 989, so the admin
    // ringing him had two numbers and no rule for choosing. A balance settles
    // oldest-first across every month; it has no per-month share to report.
    //
    // A student who has cleared their balance contributes 0, which is why
    // hiding them from the drill-down list does not move this total.
    if (frontedStudentIds.size > 0) {
      const debtors = await this.prisma.student.findMany({
        where: { id: { in: [...frontedStudentIds] }, balance: { lt: 0 } },
        select: { balance: true },
      });
      totals.centerOwedByStudents = debtors.reduce((s, d) => s - d.balance, 0);
    }

    return {
      month,
      floorMonth,
      period,
      data: rows,
      totals,
      staff,
      staffTotals,
    };
  }

  /**
   * Per-teacher advance breakdown for the "Avans" cell drawer on the salary
   * page. Lists each TEACHER_ADVANCE expense given to `userId` during the
   * selected calendar month (same window as the monthly report's `advances`
   * total) — date, amount, method, note and who recorded it. When an advance
   * was taken "3 ga bo'lib" (in several parts), each part is its own row.
   */
  /**
   * The monthly report narrowed to ONE user — the single source behind the
   * teacher profile "Ish haqi" tab, the profile card's "To'lanishi kerak" and
   * the lehrer portal.
   *
   * It deliberately runs the SAME `getMonthly` pass the `/payments/salary`
   * table renders and just picks the caller's row, so the two screens cannot
   * drift apart. (They used to: the profile computed its own forecast and its
   * own period-less accrual sum, producing four different numbers for one
   * teacher.)
   *
   * `row` is the teacher row when the user teaches, the non-teaching
   * FIXED_MONTHLY staff row otherwise, and `null` when the user has no salary
   * presence in that month.
   */
  async getMonthlyForUser(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    const res = await this.getMonthly(
      { ...query, userId },
      companyId,
      performedById,
    );

    return {
      month: res.month,
      floorMonth: res.floorMonth,
      period: res.period,
      row: res.data[0] ?? res.staff[0] ?? null,
    };
  }

  async getAdvancesForUser(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    const { month, monthStart, nextMonthStart } = await resolveMonthlyScope(
      this.prisma,
      query,
      companyId,
      performedById,
    );

    const advances = await this.prisma.expense.findMany({
      where: {
        relatedUserId: userId,
        category: 'TEACHER_ADVANCE',
        companyId,
        deletedAt: null,
        date: { gte: monthStart, lt: nextMonthStart },
      },
      select: {
        id: true,
        amount: true,
        date: true,
        paymentMethod: true,
        description: true,
        createdAt: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'asc' },
    });

    const total = advances.reduce((s, a) => s + a.amount, 0);
    return { month, userId, count: advances.length, total, advances };
  }
}
