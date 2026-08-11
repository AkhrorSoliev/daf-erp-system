import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
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
 * **Two different sums, both real.** `centerPaid` is what the CENTER spent (the
 * teacher's share of the lesson — e.g. 30%). `studentOwed` is what the STUDENT
 * owes for those same lessons (the full lesson price). On production July 2026
 * they are 10 987 285 and 21 234 015 — recovering the second is what makes the
 * first whole. Showing only one of them answers the wrong question, so both are
 * returned and the UI shows both.
 *
 * `perLessonCost` is the frozen price stamped on the accrual at write time, not
 * a live course-price join: a course that got more expensive in August must not
 * inflate what a July debtor is asked for.
 */
@Injectable()
export class SalaryCenterTopUpService {
  constructor(private prisma: PrismaService) {}

  async getStudents(
    query: SalaryMonthlyQuery,
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

    const emptyTotals = {
      centerPaid: 0,
      studentDebt: 0,
      studentOwed: 0,
      lessonCount: 0,
      studentCount: 0,
      inactiveStudentCount: 0,
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
        ...accrualPeriodWhere(scope),
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

    interface Bucket {
      lessons: number;
      centerPaid: number;
      studentOwed: number;
      groupIds: Set<string>;
      teacherIds: Set<number>;
      firstLesson: Date;
      lastLesson: Date;
    }
    const byStudent = new Map<number, Bucket>();
    for (const a of accruals) {
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
           * What is still to be collected FOR THIS MONTH — `min(debt today,
           * what this month's fronted lessons cost)`. See the long note in
           * `SalaryMonthlyService`: the lesson cost alone ignores payments made
           * since (#10026 read 345 000 while owing 156 000), and the raw debt
           * alone is every month at once, so it did not change when the month
           * picker did.
           */
          studentDebt: Math.min(s.balance < 0 ? -s.balance : 0, b.studentOwed),
          /** This month's fronted lessons at their frozen price. Audit only. */
          studentOwed: b.studentOwed,
          /** The student's whole debt, every month. Audit only. */
          totalDebt: s.balance < 0 ? -s.balance : 0,
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
        };
      })
      // Biggest center exposure first — that is the order a recovery call list
      // is worked through.
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
      }),
      { ...emptyTotals },
    );

    return { month, floorMonth, period, data: rows, totals };
  }
}
