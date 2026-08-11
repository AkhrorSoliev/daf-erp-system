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
  constructor(private prisma: PrismaService) {}

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
      return { month, floorMonth, period, data: [], totals: emptyTotals };
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
        amount: true,
        perLessonCost: true,
        lessonDate: true,
      },
    });
    if (accruals.length === 0) {
      return { month, floorMonth, period, data: [], totals: emptyTotals };
    }

    interface MonthBucket {
      lessons: number;
      centerPaid: number;
    }
    interface Bucket {
      lessons: number;
      centerPaid: number;
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
    for (const a of accruals) {
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

    const groupIds = [
      ...new Set(accruals.map((a) => a.groupId)),
    ];
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

    const rows = [...byStudent.entries()]
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
      // Biggest collectable debt first — that is the order a recovery call list
      // is worked through. (It used to sort by the center's own outlay, which
      // is not what the caller is trying to bring in.)
      .sort(
        (a, b) =>
          b.studentDebt - a.studentDebt ||
          b.centerPaid - a.centerPaid ||
          a.student.firstName.localeCompare(b.student.firstName),
      );

    const totals = rows.reduce(
      (t, r) => ({
        centerPaid: t.centerPaid + r.centerPaid,
        studentDebt: t.studentDebt + r.studentDebt,
        studentOwed: t.studentOwed + r.studentOwed,
        lessonCount: t.lessonCount + r.lessons,
        studentCount: t.studentCount + 1,
        // A frozen/expelled/archived student attends no more lessons, so
        // retroactive billing will never recover their share on its own — it
        // has to be chased by hand. Counted here so the UI can say so.
        inactiveStudentCount:
          t.inactiveStudentCount + (r.student.status === 'ACTIVE' ? 0 : 1),
        monthKeys: t.monthKeys,
      }),
      { ...emptyTotals, monthKeys: [...allMonthKeys].sort() },
    );

    return { month, floorMonth, period, data: rows, totals };
  }
}
