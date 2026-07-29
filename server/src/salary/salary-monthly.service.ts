import { Injectable } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  perLessonAccrual,
  pickActiveVersion,
  RateVersion,
} from './shared/deserved-math';
import { isTopUpMonth, NEW_STUDENT_TOPUP_MIN_LESSONS } from './shared/topup';
import {
  resolveMonthlyScope,
  type SalaryMonthlyQuery,
} from './shared/resolve-monthly-scope';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';

export type { SalaryMonthlyQuery } from './shared/resolve-monthly-scope';

/**
 * Net-to-pay base per month. **Faza 2 (July center top-up):** from
 * `TOPUP_EFFECTIVE_MONTH` on, the net-to-pay shown is the FULL deserved salary —
 * `covered` (students-paid) PLUS `gap` (the center's top-up), minus advances —
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
 * Columns produced per teacher:
 *  - `fullDeserved`  = all lessons actually held that month × rate (covered + gap)
 *  - `covered`       = the portion backed by students who actually paid (live accruals)
 *  - `gap`           = top-up the center would add (fullDeserved − covered)
 *  - `advances`      = TEACHER_ADVANCE given during the calendar month
 *  - `netToPay`      = base (see NET_BASE) − advances, or the settled payment's net
 *
 * Manual/Excel months (no per-lesson accruals — e.g. May, whose config only
 * became effective in June) have `hasLessonData = false`, so the deserved /
 * covered / gap columns come back `null` (rendered as "—"). We never fabricate
 * those numbers from a proxy rate.
 *
 * The deserved/covered/gap math is the SAME as the read-only forecast script
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

    // Teacher roster for this month, in branch scope. `blocked` means the
    // caller is branch-confined but has no branch — an impossible filter is
    // used so they see nothing, rather than falling through to every branch.
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
      roles: { some: { role: { name: 'Teacher' } } },
      ...(blocked && { id: -1 }),
      ...(userId !== undefined && { id: userId }),
      ...(branchId !== undefined && { branches: { some: { branchId } } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          ...(searchId !== null ? [{ id: searchId }] : []),
        ],
      }),
    };

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
      gap: 0,
      advances: 0,
      netToPay: 0,
      // Center top-up lifecycle (company-level summary card):
      //   advanced (X) = Σ wasCenterTopUp, stillFronted (Z) = Σ isCenterTopUp,
      //   recovered (Y) = X − Z.
      centerAdvanced: 0,
      centerStillFronted: 0,
      centerRecovered: 0,
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
    const idSet = new Set(ids);

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
              lessonDate: { gte: periodStart, lte: periodEnd },
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
        },
      }),
      // Billable attendances in the period (for the GAP sweep). Every held
      // lesson (PRESENT/LATE/ABSENT) can earn the teacher; the center fronts an
      // uncovered one. EXCUSED never bills/accrues.
      this.prisma.attendance.findMany({
        where: {
          companyId,
          status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
          date: { gte: periodStart, lte: periodEnd },
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
          lessonDate: { gte: periodStart, lte: periodEnd },
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
          date: { lte: periodEnd },
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
      carriedOutAgg.map((a) => [a.userId as number, a._sum.amount ?? 0]),
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
    const cappedByInactivity = (studentId: number, lessonDate: Date): boolean => {
      const day = inactiveSince.get(studentId);
      return day !== undefined && dateStr(lessonDate) > day;
    };

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
      { id: string; amount: number; grossAmount: number; status: SalaryPaymentStatus }
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
      covered: number;
      carriedIn: number;
      coveredAtt: Set<string>;
      gap: number;
      gapUnits: number;
      noConfigUnits: number;
      isFixedMonthly: boolean;
      centerAdvanced: number;
      centerStillFronted: number;
    }
    const agg = new Map<number, Agg>();
    for (const id of ids) {
      agg.set(id, {
        covered: 0,
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
      a.covered += ac.amount;
      // A carried-IN accrual (creditPeriodDate set → lessonDate was a prior month).
      if (ac.creditPeriodDate) a.carriedIn += ac.amount;
      if (ac.attendanceId) a.coveredAtt.add(ac.attendanceId);
      // Center top-up lifecycle: advanced = ever-fronted; stillFronted = not yet
      // recovered. recovered (Y) = advanced − stillFronted (computed in totals).
      if (ac.wasCenterTopUp) a.centerAdvanced += ac.amount;
      if (ac.isCenterTopUp) a.centerStillFronted += ac.amount;
    }
    for (const att of attendances) {
      const g = groupMap.get(att.groupId);
      if (!g) continue;
      // BR-09: withhold the new-student top-up gap until the student has
      // attended >= threshold lessons in this group (mirrors the cron sweep so
      // the shown gap equals what will be paid).
      const held = heldByStudentGroup.get(`${att.studentId}::${att.groupId}`) ?? 0;
      if (held < NEW_STUDENT_TOPUP_MIN_LESSONS) continue;
      // No center top-up for a lesson held after the student went inactive.
      if (cappedByInactivity(att.studentId, att.date)) continue;
      const lpc = g.course.lessonPaymentCount || 12;
      const perLessonCost = Math.round(g.course.price / lpc);
      const dStr = dateStr(att.date);
      for (const tid of resolveTeachers(att.groupId, dStr)) {
        const a = agg.get(tid);
        if (!a) continue; // teacher outside branch scope / search page
        if (a.coveredAtt.has(att.id)) continue; // already covered → in `covered`
        if (a.isFixedMonthly) continue; // flat salary — no per-lesson gap
        const v = resolveRate(tid, att.groupId, att.date);
        if (v) {
          a.gap += perLessonAccrual(v, perLessonCost, lpc);
          a.gapUnits += 1;
        } else {
          a.noConfigUnits += 1; // config gap — do NOT fabricate (May signature)
        }
      }
    }

    // ─── Step 5+6: build rows ────────────────────────────────────────────
    const rows = teachers.map((t) => {
      const a = agg.get(t.id)!;
      const hasLessonData = a.covered !== 0 || a.gapUnits !== 0;
      // Center top-up (gap) is a real figure ONLY from TOPUP_EFFECTIVE_MONTH on.
      // Before that there is NO top-up, so a "Qo'shilishi kerak" number only
      // confuses — hide it (gap = 0) and treat deserved = covered for pre-July.
      const showGap = isTopUpMonth(month);
      const rawGap = showGap ? a.gap : 0;
      const fullDeserved = hasLessonData ? a.covered + rawGap : null;
      const covered = hasLessonData ? a.covered : null;
      const gap = hasLessonData ? rawGap : null;
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
          isTopUpMonth(month) && hasLessonData ? a.covered + a.gap : a.covered;
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
        gap,
        advances,
        netToPay,
        // Per-teacher "Markaz qo'shdi" = how much the center fronted for this
        // teacher this period (X). stillFronted is carried for the totals card
        // (company-level Y/Z), not shown per row.
        centerAdvanced: a.centerAdvanced,
        centerStillFronted: a.centerStillFronted,
        payment: payment
          ? { id: payment.id, amount: payment.amount, status: payment.status }
          : null,
      };
    });

    // Sort by gross magnitude desc, then name.
    rows.sort((a, b) => {
      const ma =
        a.fullDeserved ?? (a.payment ? a.netToPay : 0);
      const mb =
        b.fullDeserved ?? (b.payment ? b.netToPay : 0);
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
        gap: s.gap + (r.gap ?? 0),
        advances: s.advances + r.advances,
        netToPay: s.netToPay + r.netToPay,
        centerAdvanced: s.centerAdvanced + r.centerAdvanced,
        centerStillFronted: s.centerStillFronted + r.centerStillFronted,
        centerRecovered: 0, // filled below (X − Z)
      }),
      { ...zeroTotals },
    );
    // recovered (Y) = advanced (X) − still-fronted (Z).
    totals.centerRecovered = totals.centerAdvanced - totals.centerStillFronted;

    return { month, floorMonth, period, data: rows, totals, staff, staffTotals };
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
