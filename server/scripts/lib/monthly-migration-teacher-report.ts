/**
 * Per-teacher pay for the migrated month: now vs. after the migration
 * re-prices every billable lesson (monthly-migration-apply.ts, step 5).
 *
 * `createAccrualAmount` mirrors SalaryAccrualService.createAccrual's amount
 * branch EXACTLY — the figure the ledger will receive — not the payroll
 * report's `perLessonAccrual`, which pays FIXED_MONTHLY nothing per lesson.
 * Where the two disagree, or a lesson has no rate (createAccrual returns
 * null and the migration aborts that student), the row is flagged for review
 * instead of being "fixed" here.
 *
 * "Before" is what the old pack model pays for the same lessons, not only
 * what has been credited so far. A lesson nobody has been credited for yet
 * (a debtor's lesson) is still paid on the old model: payroll fronts it at
 * the pack price (salary/shared/gap-sweep.ts). Leaving it at 0 would make
 * the switch look like a pay rise it is not.
 */
import { AttendanceStatus, PaymentModel, Prisma } from '@prisma/client';
import { perLessonCostForMonth } from '../../src/billing/monthly-price';
import {
  addMonthsToMonthKey,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../src/common/date/tashkent';
import {
  perLessonAccrual,
  pickActiveVersion,
  type RateVersion,
} from '../../src/salary/shared/deserved-math';
import { resolveLessonPricing } from '../../src/salary/shared/gap-sweep';

/** One (group, student) pair the migration bills, with its month pricing. */
export interface TeacherLessonPair {
  groupId: string;
  studentId: number;
  /** Monthly course price (undiscounted, like the charge's perLessonCost). */
  price: number;
  /** The month's frozen lesson count — the charge's plannedLessons. */
  plannedLessons: number;
  /** The course's pack size on the old model (Course.lessonPaymentCount). */
  lessonPaymentCount: number;
}

export interface TeacherLessonInput {
  teacherId: number;
  teacherName: string;
  /** Salary type of the rate active on the lesson date; null = no rate. */
  salaryType: string | null;
  /** The live SalaryAccrual.amount step 5 will reverse; 0 when none. */
  currentAccrual: number;
  /** Whether a live lesson accrual exists for this teacher and lesson. */
  hasLiveAccrual: boolean;
  /**
   * What the old pack model pays for this lesson: the live accrual, or the
   * amount payroll would front for an uncredited lesson at the pack price.
   */
  oldValue: number;
  /** What step 5 will write instead. */
  newAccrual: number;
}

export interface TeacherPayRow {
  teacherId: number;
  teacherName: string;
  salaryTypes: string[];
  lessons: number;
  /** Lessons with no live accrual yet (debtors' lessons). */
  unwrittenLessons: number;
  /** Σ live accruals — what is credited today. */
  written: number;
  /** Σ old-model pay, uncredited lessons included. */
  before: number;
  after: number;
  delta: number;
  needsReview: boolean;
}

export interface TeacherPayReport {
  rows: TeacherPayRow[];
  totals: {
    lessons: number;
    unwrittenLessons: number;
    written: number;
    before: number;
    after: number;
    delta: number;
  };
}

export function createAccrualAmount(
  version: RateVersion | null,
  perLessonCost: number,
  divisor: number,
): number {
  if (!version) return 0;
  if (version.salaryType === 'PERCENTAGE') {
    return Math.round((perLessonCost * version.value) / 100);
  }
  return divisor > 0 ? Math.round(version.value / divisor) : version.value;
}

/** Group rate first, then the teacher's global rate — createAccrual's order. */
export function pickRate(params: {
  groupVersions: RateVersion[];
  globalVersions: RateVersion[];
  lessonDate: Date;
}): RateVersion | null {
  return (
    pickActiveVersion(params.groupVersions, params.lessonDate) ??
    pickActiveVersion(params.globalVersions, params.lessonDate)
  );
}

const BILLABLE: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.ABSENT,
];

/**
 * Every (lesson, teacher) step 5 will re-price, with what the teacher holds
 * for it today, what the old model pays for it, and what the migration will
 * write. Bulk reads — one query per table — resolved in memory.
 */
export async function loadTeacherLessons(
  db: Prisma.TransactionClient,
  params: { companyId: number; periodKey: string; pairs: TeacherLessonPair[] },
): Promise<TeacherLessonInput[]> {
  if (params.pairs.length === 0) return [];
  // Attendance, SalaryAccrual and LessonTeacherOverride dates are @db.Date.
  const gte = utcMidnightFromDateStr(`${params.periodKey}-01`);
  const lt = utcMidnightFromDateStr(
    `${addMonthsToMonthKey(params.periodKey, 1)}-01`,
  );
  const pairKey = (groupId: string, studentId: number) =>
    `${groupId}|${studentId}`;
  const byPair = new Map(
    params.pairs.map((p) => [pairKey(p.groupId, p.studentId), p]),
  );
  const groupIds = [...new Set(params.pairs.map((p) => p.groupId))];
  const studentIds = [...new Set(params.pairs.map((p) => p.studentId))];

  // The lessons step 5 re-prices: billable attendance of each billed pair.
  const lessons = (
    await db.attendance.findMany({
      where: {
        groupId: { in: groupIds },
        studentId: { in: studentIds },
        date: { gte, lt },
        status: { in: BILLABLE },
      },
      select: { id: true, date: true, groupId: true, studentId: true },
    })
  ).filter((a) => byPair.has(pairKey(a.groupId, a.studentId)));
  if (lessons.length === 0) return [];

  // Who teaches a lesson — resolveTeachersForLesson's rule: that day's
  // override, else the group's teachers.
  const [overrides, groupTeachers] = await Promise.all([
    db.lessonTeacherOverride.findMany({
      where: { groupId: { in: groupIds }, deletedAt: null, date: { gte, lt } },
      select: { groupId: true, date: true, teacherIds: true },
    }),
    db.groupTeacher.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, teacherId: true },
    }),
  ]);
  const dayKey = (groupId: string, date: Date) =>
    `${groupId}|${tashkentDateStr(date)}`;
  const overrideTeachers = new Map<string, number[]>();
  for (const o of overrides) {
    const key = dayKey(o.groupId, o.date);
    if (!overrideTeachers.has(key)) overrideTeachers.set(key, o.teacherIds);
  }
  const groupTeacherIds = new Map<string, number[]>();
  for (const gt of groupTeachers) {
    groupTeacherIds.set(gt.groupId, [
      ...(groupTeacherIds.get(gt.groupId) ?? []),
      gt.teacherId,
    ]);
  }
  const teachersOf = (l: { groupId: string; date: Date }) =>
    overrideTeachers.get(dayKey(l.groupId, l.date)) ??
    groupTeacherIds.get(l.groupId) ??
    [];

  const teacherIds = [...new Set(lessons.flatMap((l) => teachersOf(l)))];
  if (teacherIds.length === 0) return [];

  const [versions, accruals, users] = await Promise.all([
    // SalaryAccrualService.findActiveVersion's filter: the company's active
    // configs only.
    db.employeeSalaryConfigVersion.findMany({
      where: {
        config: {
          userId: { in: teacherIds },
          companyId: params.companyId,
          isActive: true,
        },
      },
      select: {
        salaryType: true,
        value: true,
        effectiveFrom: true,
        effectiveTo: true,
        config: { select: { userId: true, groupId: true } },
      },
    }),
    // reverseAccrualForAttendance's key: teacher, student, group, lesson
    // date, lesson-based rows only.
    db.salaryAccrual.findMany({
      where: {
        groupId: { in: groupIds },
        studentId: { in: studentIds },
        lessonDate: { gte, lt },
        attendanceId: { not: null },
        reversedAt: null,
      },
      select: {
        userId: true,
        groupId: true,
        studentId: true,
        lessonDate: true,
        amount: true,
      },
    }),
    db.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const accrualKey = (
    teacherId: number,
    groupId: string,
    studentId: number,
    date: Date,
  ) => `${teacherId}|${groupId}|${studentId}|${tashkentDateStr(date)}`;
  const currentBy = new Map<string, number>();
  for (const a of accruals) {
    const key = accrualKey(a.userId, a.groupId, a.studentId, a.lessonDate);
    currentBy.set(key, (currentBy.get(key) ?? 0) + a.amount);
  }
  const nameOf = new Map(
    users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
  );

  const out: TeacherLessonInput[] = [];
  for (const lesson of lessons) {
    const pair = byPair.get(pairKey(lesson.groupId, lesson.studentId));
    if (!pair) continue;
    const perLessonCost = perLessonCostForMonth(
      pair.price,
      pair.plannedLessons,
    );
    // The old model's price for this lesson — payroll's own resolver.
    const packPricing = resolveLessonPricing(
      {
        price: pair.price,
        lessonPaymentCount: pair.lessonPaymentCount,
        paymentModel: PaymentModel.LESSON_PACK,
      },
      lesson.studentId,
      lesson.groupId,
      lesson.date,
    );
    for (const teacherId of teachersOf(lesson)) {
      const own = versions.filter((x) => x.config.userId === teacherId);
      const rate = pickRate({
        groupVersions: own.filter((x) => x.config.groupId === lesson.groupId),
        globalVersions: own.filter((x) => x.config.groupId === null),
        lessonDate: lesson.date,
      });
      const live = currentBy.get(
        accrualKey(teacherId, lesson.groupId, lesson.studentId, lesson.date),
      );
      const oldValue =
        live !== undefined
          ? live
          : rate && packPricing
            ? perLessonAccrual(
                rate,
                packPricing.perLessonCost,
                packPricing.divisor,
              )
            : 0;
      out.push({
        teacherId,
        teacherName: nameOf.get(teacherId) ?? `#${teacherId}`,
        salaryType: rate?.salaryType ?? null,
        currentAccrual: live ?? 0,
        hasLiveAccrual: live !== undefined,
        oldValue,
        newAccrual: createAccrualAmount(
          rate,
          perLessonCost,
          pair.plannedLessons,
        ),
      });
    }
  }
  return out;
}

export function buildTeacherPayReport(
  lessons: TeacherLessonInput[],
): TeacherPayReport {
  const byTeacher = new Map<number, TeacherPayRow>();
  for (const l of lessons) {
    const row = byTeacher.get(l.teacherId) ?? {
      teacherId: l.teacherId,
      teacherName: l.teacherName,
      salaryTypes: [],
      lessons: 0,
      unwrittenLessons: 0,
      written: 0,
      before: 0,
      after: 0,
      delta: 0,
      needsReview: false,
    };
    row.lessons += 1;
    if (!l.hasLiveAccrual) row.unwrittenLessons += 1;
    row.written += l.currentAccrual;
    row.before += l.oldValue;
    row.after += l.newAccrual;
    const type = l.salaryType ?? 'NO_RATE';
    if (!row.salaryTypes.includes(type)) row.salaryTypes.push(type);
    if (l.salaryType === null || l.salaryType === 'FIXED_MONTHLY') {
      row.needsReview = true;
    }
    byTeacher.set(l.teacherId, row);
  }
  const rows = [...byTeacher.values()]
    .map((r) => ({ ...r, delta: r.after - r.before }))
    .sort((a, b) => a.delta - b.delta);
  const totals = rows.reduce(
    (t, r) => ({
      lessons: t.lessons + r.lessons,
      unwrittenLessons: t.unwrittenLessons + r.unwrittenLessons,
      written: t.written + r.written,
      before: t.before + r.before,
      after: t.after + r.after,
      delta: t.delta + r.delta,
    }),
    {
      lessons: 0,
      unwrittenLessons: 0,
      written: 0,
      before: 0,
      after: 0,
      delta: 0,
    },
  );
  return { rows, totals };
}

export function renderTeacherCsv(report: TeacherPayReport): string {
  const head =
    'teacherId,ism,turi,darslar,yozilmagan_darslar,yozilgan,eski_tizimda,yangi_tizimda,farq,tekshirish';
  const lines = report.rows.map((r) =>
    [
      r.teacherId,
      `"${r.teacherName}"`,
      r.salaryTypes.join('+'),
      r.lessons,
      r.unwrittenLessons,
      r.written,
      r.before,
      r.after,
      r.delta,
      r.needsReview ? 'HA' : '',
    ].join(','),
  );
  return [head, ...lines].join('\n');
}
