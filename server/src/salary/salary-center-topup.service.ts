import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  monthKeyOf,
  resolveMonthlyScope,
  type SalaryMonthlyQuery,
} from './shared/resolve-monthly-scope';
import {
  accrualPeriodWhere,
  buildTeacherRosterWhere,
} from './shared/teacher-roster-where';
import { DebtAgeService } from '../common/finance/debt-age.service';
import { sweepGapLessons } from './shared/gap-sweep';
import { pickActiveVersion, type RateVersion } from './shared/deserved-math';
import { SalaryType, TransactionType } from '@prisma/client';

/**
 * "Markaz qo'shimchasi — qolgan" drill-down: WHO the center is still owed by.
 *
 * The `/payments/salary` card reports the top-up lifecycle as three company
 * figures — advanced (X) / recovered (Y) / **still fronted (Z)**. Z is money the
 * center handed to teachers for lessons a student had not paid for, and which
 * has not come back. The card could not say from whom, so the number was not
 * actionable: recovering it needs the student list.
 *
 * This service is that list. It reads the SAME accrual rows the card sums
 * (`isCenterTopUp: true`, live, bucketed into the period) over the SAME teacher
 * roster (`buildTeacherRosterWhere`), so `totals.centerPaid` here is `===`
 * `getMonthly`'s `totals.centerStillFronted`. Re-deriving either half is how the
 * two surfaces would come to disagree, so neither is re-derived.
 *
 * **Two different sums, and only one of them is month-scoped.** `centerPaid` is
 * what the CENTER spent on this month's fronted lessons (the teacher's share).
 * `studentDebt` is what that student owes TODAY — the figure on their profile,
 * and the one an admin reads out on the phone.
 *
 * The debt is deliberately NOT sliced by month, and two attempts to slice it
 * were both wrong. Reporting the month's lesson cost ignores every payment made
 * since (#10026 showed 345 000 while owing 156 000). Capping it at
 * `min(debt, month's lessons)` failed more quietly: #10058 then read 466 662
 * against a profile saying 624 989, leaving an admin mid-call with two numbers
 * and no way to choose. A balance settles oldest-first across every month, so
 * it has no per-month share to report; what the month scopes is who appears
 * here and what the center paid for them.
 */
@Injectable()
export class SalaryCenterTopUpService {
  constructor(
    private prisma: PrismaService,
    private debtAge: DebtAgeService,
  ) {}

  /**
   * The lessons the center has not paid for YET, shaped like the accruals it
   * will become. Same `sweepGapLessons` `getMonthly` reports as the forecast
   * leg of `centerFunded`, so the tab and the payroll column cannot disagree
   * about which lessons qualify.
   */
  private async sweepForecast(
    scope: Awaited<ReturnType<typeof resolveMonthlyScope>>,
    teacherIds: number[],
  ) {
    const {
      companyId,
      periodStart,
      periodEnd,
      periodStartDate,
      periodEndDateExclusive,
    } = scope;

    const [
      attendances,
      groups,
      groupTeachers,
      overrides,
      versionRows,
      covered,
      heldCounts,
      inactiveStudents,
    ] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          companyId,
          status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
          date: { gte: periodStartDate, lt: periodEndDateExclusive },
        },
        select: { id: true, studentId: true, groupId: true, date: true },
      }),
      this.prisma.group.findMany({
        where: { companyId },
        select: {
          id: true,
          course: { select: { price: true, lessonPaymentCount: true } },
        },
      }),
      this.prisma.groupTeacher.findMany({
        select: { groupId: true, teacherId: true },
      }),
      this.prisma.lessonTeacherOverride.findMany({
        where: { deletedAt: null },
        select: { groupId: true, date: true, teacherIds: true },
      }),
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
      // Lessons that already carry an accrual — a student paid for them, so the
      // center owes nothing.
      this.prisma.salaryAccrual.findMany({
        where: {
          companyId,
          userId: { in: teacherIds },
          reversedAt: null,
          OR: [
            { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
            {
              creditPeriodDate: null,
              lessonDate: { gte: periodStartDate, lt: periodEndDateExclusive },
            },
          ],
        },
        select: { userId: true, attendanceId: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['studentId', 'groupId'],
        where: {
          companyId,
          status: { in: ['PRESENT', 'LATE'] },
          date: { lt: periodEndDateExclusive },
        },
        _count: { _all: true },
      }),
      this.prisma.student.findMany({
        where: {
          companyId,
          status: { not: 'ACTIVE' },
          statusChangedAt: { not: null },
        },
        select: { id: true, statusChangedAt: true },
      }),
    ]);

    const dateStr = (d: Date) => d.toISOString().slice(0, 10);
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const rosterMap = new Map<string, number[]>();
    for (const gt of groupTeachers) {
      rosterMap.set(gt.groupId, [
        ...(rosterMap.get(gt.groupId) ?? []),
        gt.teacherId,
      ]);
    }
    const overrideMap = new Map<string, number[]>();
    for (const o of overrides) {
      overrideMap.set(`${o.groupId}::${dateStr(o.date)}`, o.teacherIds);
    }
    const versByKey = new Map<string, RateVersion[]>();
    const fixedMonthly = new Set<number>();
    for (const r of versionRows) {
      const key = `${r.config.userId}::${r.config.groupId ?? 'GLOBAL'}`;
      versByKey.set(key, [
        ...(versByKey.get(key) ?? []),
        {
          salaryType: r.salaryType,
          value: r.value,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
        },
      ]);
      if (
        r.config.salaryType === SalaryType.FIXED_MONTHLY &&
        r.config.groupId == null
      ) {
        fixedMonthly.add(r.config.userId);
      }
    }
    const coveredByTeacher = new Set(
      covered
        .filter((c) => c.attendanceId)
        .map((c) => `${c.userId}::${c.attendanceId}`),
    );
    const held = new Map<string, number>();
    for (const h of heldCounts) {
      held.set(`${h.studentId}::${h.groupId}`, h._count._all);
    }
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
    const inScope = new Set(teacherIds);

    const { lessons } = sweepGapLessons({
      attendances,
      groupMap,
      resolveTeachers: (groupId, d) =>
        overrideMap.get(`${groupId}::${d}`) ?? rosterMap.get(groupId) ?? [],
      resolveRate: (tid, groupId, at) =>
        pickActiveVersion(versByKey.get(`${tid}::${groupId}`), at) ??
        pickActiveVersion(versByKey.get(`${tid}::GLOBAL`), at),
      inScope: (tid) => inScope.has(tid),
      isCovered: (tid, attId) => coveredByTeacher.has(`${tid}::${attId}`),
      isFixedMonthly: (tid) => fixedMonthly.has(tid),
      heldByStudentGroup: held,
      inactiveSince,
      dateStr,
    });

    // Shaped like the accrual rows the caller aggregates, so one loop serves
    // both states.
    return lessons.map((l) => ({
      userId: l.teacherId,
      studentId: l.studentId,
      groupId: l.groupId,
      attendanceId: l.attendanceId,
      amount: l.amount,
      perLessonCost: l.perLessonCost,
      lessonDate: l.lessonDate,
    }));
  }

  async getStudents(
    query: SalaryMonthlyQuery & { allMonths?: boolean },
    companyId: number,
    performedById: number,
  ) {
    const scope = await resolveMonthlyScope(
      this.prisma,
      query,
      companyId,
      performedById,
    );
    const { month, floorMonth, period } = scope;
    const allMonths = query.allMonths === true;

    const emptyTotals = {
      centerPaid: 0,
      centerUnrecovered: 0,
      /**
       * Students whose advance came back in full, so they are counted in
       * `centerPaid` but carry no row. Without this the page shows a smaller
       * spend than the salary card it opened from and cannot say why.
       */
      repaidStudentCount: 0,
      studentDebt: 0,
      studentOwed: 0,
      lessonCount: 0,
      studentCount: 0,
      inactiveStudentCount: 0,
      /** Every month the returned rows draw on, newest first. */
      monthKeys: [] as string[],
    };

    const teachers = await this.prisma.user.findMany({
      where: buildTeacherRosterWhere(scope),
      select: { id: true, firstName: true, lastName: true },
    });
    if (teachers.length === 0) {
      return {
        month,
        floorMonth,
        period,
        data: [],
        totals: emptyTotals,
        isForecast: false,
      };
    }
    const teacherName = new Map(
      teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]),
    );

    const accruals = await this.prisma.salaryAccrual.findMany({
      where: {
        companyId,
        userId: { in: teachers.map((t) => t.id) },
        reversedAt: null,
        // Z, not X: `isCenterTopUp` is cleared the moment a student pays the
        // lesson back, so this is exactly the part still outstanding.
        // `wasCenterTopUp` would re-list students who have already settled.
        isCenterTopUp: true,
        // `allMonths` drops the period bound entirely rather than widening it.
        // The debt a student carries is one debt, not a stack of monthly ones,
        // and asking "which month is this from" of a single balance has no
        // answer — so the page's default view spans everything the center has
        // fronted and reports WHICH months each student's lessons fall in.
        // A bound is still implicit: `isCenterTopUp` only exists from the
        // top-up era on (2026-07).
        ...(allMonths ? {} : accrualPeriodWhere(scope)),
      },
      select: {
        userId: true,
        studentId: true,
        groupId: true,
        attendanceId: true,
        amount: true,
        perLessonCost: true,
        lessonDate: true,
      },
    });
    // An unsettled month has no written top-up accruals yet — payroll runs at
    // month end — so the list would be empty exactly while it is most useful.
    // The FORECAST leg fills it: lessons already held that the center will have
    // to front, from the same sweep `getMonthly` reports as `centerFunded`.
    // Production August 2026 carried 10 078 921 so'm of it, invisible until the
    // month closed and the money had already gone out.
    const forecast =
      accruals.length === 0 && !allMonths
        ? await this.sweepForecast(
            scope,
            teachers.map((t) => t.id),
          )
        : [];
    const isForecast = forecast.length > 0;
    const source = isForecast ? forecast : accruals;

    if (source.length === 0) {
      return {
        month,
        floorMonth,
        period,
        data: [],
        totals: emptyTotals,
        isForecast: false,
      };
    }

    // What the student has NOT paid yet on each fronted lesson. The centre's
    // advance is repaid out of whatever the student pays for that lesson, so
    // what is still owed TO THE CENTRE for it can never exceed either side:
    // `min(advance, outstanding)`. A lesson 99% paid leaves the centre the last
    // 1%, not the whole advance — production #10593 read "markaz 16 667" beside
    // a 329 so'm balance and had an admin ringing to collect an advance that
    // had already come back with the payment.
    //
    // No row at all (a forecast lesson, not billed yet) means nothing has been
    // paid against it, so the full lesson cost is outstanding.
    const deductions = await this.prisma.transaction.findMany({
      where: {
        attendanceId: {
          in: source
            .map((a) => a.attendanceId)
            .filter((id): id is string => id !== null),
        },
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
      },
      select: { attendanceId: true, metadata: true },
    });
    const outstandingByLesson = new Map<string, number>();
    for (const d of deductions) {
      if (!d.attendanceId) continue;
      const raw = Number(
        ((d.metadata ?? {}) as Record<string, unknown>).uncoveredAmount ?? 0,
      );
      outstandingByLesson.set(
        d.attendanceId,
        Number.isFinite(raw) ? Math.max(0, raw) : 0,
      );
    }
    // A null lesson id (legacy accrual) has nothing to look up, so it falls to
    // the same default as an unbilled one: assume none of it has been paid.
    const unrecoveredOf = (a: (typeof source)[number]) =>
      Math.min(
        a.amount,
        (a.attendanceId === null
          ? undefined
          : outstandingByLesson.get(a.attendanceId)) ?? a.perLessonCost,
      );

    interface MonthBucket {
      lessons: number;
      centerPaid: number;
    }
    interface Bucket {
      lessons: number;
      centerPaid: number;
      centerUnrecovered: number;
      studentOwed: number;
      groupIds: Set<string>;
      teacherIds: Set<number>;
      firstLesson: Date;
      lastLesson: Date;
      /** Per-month split of this student's fronted lessons. */
      months: Map<string, MonthBucket>;
    }
    const byStudent = new Map<number, Bucket>();
    const allMonthKeys = new Set<string>();
    for (const a of source) {
      // Bucketed by the month the LESSON falls in — "when did this arise" —
      // rather than by the payroll period that settled it. A student whose
      // debt spans July and August should read as spanning July and August.
      const key = monthKeyOf(a.lessonDate);
      allMonthKeys.add(key);
      const b = byStudent.get(a.studentId);
      if (!b) {
        byStudent.set(a.studentId, {
          lessons: 1,
          centerPaid: a.amount,
          centerUnrecovered: unrecoveredOf(a),
          studentOwed: a.perLessonCost,
          groupIds: new Set([a.groupId]),
          teacherIds: new Set([a.userId]),
          firstLesson: a.lessonDate,
          lastLesson: a.lessonDate,
          months: new Map([[key, { lessons: 1, centerPaid: a.amount }]]),
        });
        continue;
      }
      b.lessons += 1;
      b.centerPaid += a.amount;
      b.centerUnrecovered += unrecoveredOf(a);
      b.studentOwed += a.perLessonCost;
      b.groupIds.add(a.groupId);
      b.teacherIds.add(a.userId);
      if (a.lessonDate < b.firstLesson) b.firstLesson = a.lessonDate;
      if (a.lessonDate > b.lastLesson) b.lastLesson = a.lessonDate;
      const m = b.months.get(key);
      if (m) {
        m.lessons += 1;
        m.centerPaid += a.amount;
      } else {
        b.months.set(key, { lessons: 1, centerPaid: a.amount });
      }
    }

    const groupIds = [...new Set(source.map((a) => a.groupId))];
    // Day-cached whole-company replay, shared with the debtors list so the two
    // tabs cannot describe one student's debt differently.
    const ages = await this.debtAge.getDebtAges(companyId);
    const [students, groups] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: [...byStudent.keys()] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          status: true,
        },
      }),
      this.prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      }),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const groupName = new Map(groups.map((g) => [g.id, g.name]));

    const allRows = [...byStudent.entries()]
      // A student row with no student record is data we cannot act on — drop it
      // rather than render a nameless "#10123" the CEO cannot call.
      .filter(([studentId]) => studentMap.has(studentId))
      .map(([studentId, b]) => {
        const s = studentMap.get(studentId)!;
        return {
          student: {
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            phone: s.phone,
            balance: s.balance,
            status: s.status,
          },
          lessons: b.lessons,
          centerPaid: b.centerPaid,
          /**
           * THE figure the recovery list is worked from: of what the centre
           * advanced for this student, how much has not come back. Unlike
           * `centerPaid` — a record of past spend that stays put forever — this
           * falls to zero as they pay.
           *
           * Capped twice, and both caps earn their place. Per lesson, by what
           * is still owed ON that lesson: an advance cannot outlive the payment
           * that repaid it (#10593 — 16 667 fronted, 329 left). Then per
           * student, by their whole balance: nobody can be made to return more
           * than they owe. The second cap is not belt-and-braces — the
           * per-lesson figure comes from deduction metadata that only settles
           * when retroactive billing runs, and for the students whose
           * settlement is still pending it reads high. Production 2026-08-18:
           * 14 rows claimed more than the student owed, #10439 claiming 80 000
           * from someone at a zero balance. Capping here keeps the column
           * inside the "Jami qarzi" beside it, which is the whole it is a part
           * of, without waiting on that backlog to clear.
           */
          centerUnrecovered: Math.min(
            b.centerUnrecovered,
            s.balance < 0 ? -s.balance : 0,
          ),
          /**
           * What to ask this student for: their debt as the profile shows it.
           *
           * This is deliberately NOT month-scoped, and two earlier attempts to
           * make it so were both wrong. The month's lesson cost ignores every
           * payment since (#10026 read 345 000 while owing 156 000). Capping it
           * at `min(debt, month's lessons)` was worse in a quieter way: #10058
           * then read 466 662 while his profile said 624 989, so an admin on
           * the phone had two numbers and no way to choose.
           *
           * A balance cannot be divided by month — the ledger settles
           * oldest-first across everything — and an admin does not collect a
           * month, they collect a debt. What the month DOES scope is who
           * appears here and what the center paid out for them; both of those
           * still move with the picker.
           */
          studentDebt: s.balance < 0 ? -s.balance : 0,
          /**
           * Which months that debt is actually made of — NOT the same as the
           * months the center covered lessons. Production August 2026: the
           * center fronted only July, while these students' debt runs from May.
           * Without this the single figure reads as one month's arrears.
           */
          debtByMonth: Object.entries(ages.get(s.id)?.months ?? {})
            .sort(([a], [c]) => a.localeCompare(c))
            .map(([monthKey, amount]) => ({ monthKey, amount })),
          /** This month's fronted lessons at their frozen price. Audit only. */
          studentOwed: b.studentOwed,
          groups: [...b.groupIds].map((id) => ({
            id,
            name: groupName.get(id) ?? id,
          })),
          teachers: [...b.teacherIds].map((id) => ({
            id,
            name: teacherName.get(id) ?? `#${id}`,
          })),
          firstLesson: b.firstLesson,
          lastLesson: b.lastLesson,
          /**
           * Which months this student's fronted lessons fall in, oldest first.
           * A debt that built up over July AND August has to say so — reading
           * one month's slice as the whole story is what sent the page to an
           * empty August and hid every July debtor behind a picker.
           */
          months: [...b.months.entries()]
            .sort(([a], [c]) => a.localeCompare(c))
            .map(([monthKey, m]) => ({
              monthKey,
              lessons: m.lessons,
              centerPaid: m.centerPaid,
            })),
        };
      })
      // Biggest recoverable amount first — that is the order a recovery call
      // list is worked through. (It used to sort by the center's own outlay,
      // which is not what the caller is trying to bring in.)
      .sort(
        (a, b) =>
          b.centerUnrecovered - a.centerUnrecovered ||
          b.studentDebt - a.studentDebt ||
          a.student.firstName.localeCompare(b.student.firstName),
      );

    // Nothing left to bring in — the advance came back with the student's
    // payment — so the row is not an answer to "who do I ring". The accrual
    // flag is simply coarser than the money: it clears only when a lesson is
    // settled to the last so'm, which is why #10593 sat on this list owing 329
    // after the centre's 16 667 had already returned.
    const rows = allRows.filter((r) => r.centerUnrecovered > 0);

    // Totals describe the MONTH, not the filtered list — `centerPaid` here has
    // to keep equalling the salary card's "Qolgan (markaz)", and dropping the
    // repaid students from the sum would make the drill-down contradict the
    // card it opens from. Their `centerUnrecovered` is zero, so that figure is
    // the same either way.
    const totals = allRows.reduce(
      (t, r) => ({
        centerPaid: t.centerPaid + r.centerPaid,
        centerUnrecovered: t.centerUnrecovered + r.centerUnrecovered,
        studentDebt: t.studentDebt + r.studentDebt,
        studentOwed: t.studentOwed + r.studentOwed,
        lessonCount: t.lessonCount + r.lessons,
        studentCount: t.studentCount + 1,
        // A frozen/expelled/archived student attends no more lessons, so
        // retroactive billing will never recover their share on its own — it
        // has to be chased by hand. Counted here so the UI can say so.
        inactiveStudentCount:
          t.inactiveStudentCount + (r.student.status === 'ACTIVE' ? 0 : 1),
        repaidStudentCount: t.repaidStudentCount,
        monthKeys: t.monthKeys,
      }),
      {
        ...emptyTotals,
        repaidStudentCount: allRows.length - rows.length,
        monthKeys: [...allMonthKeys].sort(),
      },
    );

    return { month, floorMonth, period, data: rows, totals, isForecast };
  }
}
