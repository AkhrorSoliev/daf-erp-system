import {
  AttendanceMethod,
  AttendanceStatus,
  EntityAction,
  EnrollmentStatus,
  MonthlyChargeStatus,
  type Prisma,
} from '@prisma/client';
import {
  addDaysToDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  DAY_END_TIME,
  tashkentClock,
  toMinutes,
} from '../attendance/shared/attendance-window';
import { barredLessonDays } from '../attendance/barred-lessons';
import { ADMISSION_START_DAY } from './lesson-admission';
import type { LessonAdmissionService } from './lesson-admission.service';
import { admissionKey } from './lesson-admission.service';

/** The note on every row this writes; the profile and the register show it. */
export const PAID_LATER_NOTE = "To'lov keyin keldi — ustozga haq yozilmaydi";

export interface PaidBarredInput {
  coveredDates: string[];
  frozenOutDates: string[];
  /** Group day → when a manual save first took the register (earliest MANUAL row). */
  manualTakenAt: ReadonlyMap<string, Date>;
  /** Days the student already has a row in this group. */
  markedDays: ReadonlySet<string>;
  /** When the student joined the group. */
  enrolledAt: Date;
  todayStr: string;
  /** Has today's lesson of this group ended? */
  todayEnded: boolean;
}

/**
 * The days a student was kept out of for non-payment (ADR-0047) — the
 * candidates ADR-0143 marks «Keldi» once a payment reaches them. A manual
 * save marks every student it may, so a roster student who was already in
 * the group when it took the register and has no row was kept out then
 * (`leftOutAfterEnd`'s rule). A register only QR scans took proves nothing,
 * and today's lesson counts only once it has ended.
 */
export function paidBarredCandidates(input: PaidBarredInput): string[] {
  const to = input.todayEnded
    ? addDaysToDateStr(input.todayStr, 1)
    : input.todayStr;
  return barredLessonDays({
    coveredDates: input.coveredDates,
    frozenOutDates: input.frozenOutDates,
    heldDays: new Set(input.manualTakenAt.keys()),
    markedDays: input.markedDays,
    from: ADMISSION_START_DAY,
    to,
    includeFrozenOut: false,
  }).filter(
    (d) => input.enrolledAt.getTime() < input.manualTakenAt.get(d)!.getTime(),
  );
}

const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export interface MarkedPaidLessons {
  groupId: string;
  days: string[];
}

/**
 * ADR-0143: a payment that reaches lessons the student was kept out of for
 * non-payment marks them PRESENT, with `teacherPayWaived` — the student pays
 * for them (contract 3.2), the teacher earns nothing for them, the money stays
 * with the centre. Runs inside the payment's own transaction, after the
 * balance moved, so `forLessons` judges with the new balance and the oldest
 * debt first. Only a «PAID» verdict counts: with the rule switched off nobody
 * is judged and nothing is marked. ACTIVE monthly enrollments only — a
 * departed student paying a debt is not attending. Moves no money.
 */
export async function markPaidBarredLessons(
  tx: Prisma.TransactionClient,
  admission: Pick<LessonAdmissionService, 'forLessons'>,
  params: {
    studentId: number;
    companyId: number;
    performedById?: number;
    now?: Date;
    /** false: only report what would be marked (the backfill's dry run). */
    write?: boolean;
  },
): Promise<MarkedPaidLessons[]> {
  const { todayStr, nowMinutes } = tashkentClock(params.now);
  if (todayStr < ADMISSION_START_DAY) return [];

  const enrollments = await tx.enrollment.findMany({
    where: {
      studentId: params.studentId,
      status: EnrollmentStatus.ACTIVE,
      deletedAt: null,
      group: { companyId: params.companyId, deletedAt: null },
      monthlyCharges: { some: { status: MonthlyChargeStatus.CHARGED } },
    },
    select: {
      groupId: true,
      createdAt: true,
      group: { select: { lessonEndTime: true } },
      monthlyCharges: {
        where: { status: MonthlyChargeStatus.CHARGED },
        select: { coveredDates: true, frozenOutDates: true },
      },
    },
  });
  if (enrollments.length === 0) return [];

  const groupIds = enrollments.map((e) => e.groupId);
  const range = {
    gte: utcMidnightFromDateStr(ADMISSION_START_DAY),
    lte: utcMidnightFromDateStr(todayStr),
  };
  const [registers, rows, movedToday] = await Promise.all([
    tx.attendance.groupBy({
      by: ['groupId', 'date'],
      where: {
        groupId: { in: groupIds },
        date: range,
        cancellationId: null,
        markedMethod: AttendanceMethod.MANUAL,
        teacherPayWaived: false,
      },
      _min: { createdAt: true },
    }),
    tx.attendance.findMany({
      where: {
        studentId: params.studentId,
        groupId: { in: groupIds },
        date: range,
      },
      select: { groupId: true, date: true },
    }),
    tx.lessonReschedule.findMany({
      where: {
        groupId: { in: groupIds },
        newDate: utcMidnightFromDateStr(todayStr),
        deletedAt: null,
      },
      select: { groupId: true, newLessonEndTime: true },
    }),
  ]);

  const dayStr = (d: Date) => d.toISOString().slice(0, 10);
  const takenAt = new Map<string, Map<string, Date>>();
  for (const r of registers) {
    if (!r._min.createdAt) continue;
    const m = takenAt.get(r.groupId) ?? new Map<string, Date>();
    m.set(dayStr(r.date), r._min.createdAt);
    takenAt.set(r.groupId, m);
  }
  const marked = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = marked.get(r.groupId) ?? new Set<string>();
    s.add(dayStr(r.date));
    marked.set(r.groupId, s);
  }
  const endToday = new Map(
    movedToday
      .filter((m) => m.newLessonEndTime)
      .map((m) => [m.groupId, m.newLessonEndTime!]),
  );

  const candidates = enrollments.map((e) => {
    const end =
      endToday.get(e.groupId) ?? e.group.lessonEndTime ?? DAY_END_TIME;
    return {
      groupId: e.groupId,
      days: paidBarredCandidates({
        coveredDates: e.monthlyCharges.flatMap((c) => c.coveredDates ?? []),
        frozenOutDates: e.monthlyCharges.flatMap((c) => c.frozenOutDates ?? []),
        manualTakenAt: takenAt.get(e.groupId) ?? new Map(),
        markedDays: marked.get(e.groupId) ?? new Set(),
        enrolledAt: e.createdAt,
        todayStr,
        todayEnded: nowMinutes >= toMinutes(end),
      }),
    };
  });
  const items = candidates.flatMap((c) =>
    c.days.map((d) => ({
      studentId: params.studentId,
      groupId: c.groupId,
      lessonDay: d,
    })),
  );
  if (items.length === 0) return [];

  const verdicts = await admission.forLessons(items, tx);
  const result: MarkedPaidLessons[] = [];
  for (const c of candidates) {
    const days = c.days.filter((d) => {
      const v = verdicts.get(admissionKey(params.studentId, c.groupId, d));
      return v?.admitted === true && v.reason === 'PAID';
    });
    if (days.length === 0) continue;
    if (params.write === false) {
      result.push({ groupId: c.groupId, days });
      continue;
    }
    await tx.attendance.createMany({
      data: days.map((d) => ({
        groupId: c.groupId,
        studentId: params.studentId,
        date: utcMidnightFromDateStr(d),
        status: AttendanceStatus.PRESENT,
        note: PAID_LATER_NOTE,
        markedById: params.performedById ?? null,
        markedMethod: AttendanceMethod.MANUAL,
        teacherPayWaived: true,
        companyId: params.companyId,
      })),
      // A register saved meanwhile wins: its row stands.
      skipDuplicates: true,
    });
    await tx.entityHistory.create({
      data: {
        entityType: 'GroupAttendance',
        entityId: c.groupId,
        action: EntityAction.CREATE,
        newValues: {
          action: 'DAVOMAT_KECH_TOLOV',
          oquvchi: params.studentId,
          sanalar: days.map(ddmm).join(', '),
          keldi: days.length,
          ustozHaqi: 'yozilmaydi',
        },
        changedById: params.performedById ?? null,
        companyId: params.companyId,
      },
    });
    result.push({ groupId: c.groupId, days });
  }
  return result;
}
