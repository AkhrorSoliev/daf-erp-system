import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  ADMISSION_START_DAY,
  type LessonAdmission,
} from '../billing/lesson-admission';
import {
  LessonAdmissionService,
  admissionKey,
} from '../billing/lesson-admission.service';
import { streakWindowStart } from './streak-window';
import { barredLessonDays, barredStreak } from './barred-lessons';

export interface EnrollmentBarred {
  enrollmentId: string;
  studentId: number;
  groupId: string;
  /** To'lov yo'qligi uchun davomat olib bo'lmagan kunlar, o'sish tartibida. */
  days: string[];
  /** Oxirgi darsdan orqaga ketma-ket "Kelmadi" yoki davomat olib bo'lmagan kunlar. */
  streak: number;
  /** Davomat olib bo'lmagan oxirgi kun; kun yo'q bo'lsa null. */
  lastDay: string | null;
}

const isRefused = (v: LessonAdmission | undefined): boolean =>
  !!v &&
  !v.admitted &&
  (v.reason === 'NOT_PAID' || v.reason === 'BELOW_MIN_SHARE');

/**
 * To'lov yo'qligi uchun davomat olib bo'lmagan darslar (ADR-0142).
 *
 * Qoida ikki qismdan: sof qism (`barred-lessons.ts` — qaysi kunlarda qator
 * yo'q) va hukm (`LessonAdmissionService.forLessons` — o'sha kuni o'quvchi
 * darsga qo'yilmagan edimi). Balans manfiyligi emas, hukm ishlatiladi: shunda
 * 213 so'mlik mayda qarzlar kirmaydi va 01.11 dan 50% talab hisobga olinadi.
 *
 * Faqat FAOL yozilishlar: pauzadan keyin hisob (`frozenOutDates`) va
 * hukm yo'q, hisobdan chiqarilgan kunlarni `releasedByEnrollment` o'qiydi.
 */
@Injectable()
export class BarredLessonsService {
  constructor(
    private prisma: PrismaService,
    private admission: LessonAdmissionService,
  ) {}

  async forEnrollments(
    enrollmentIds: string[],
    opts: { today?: string } = {},
  ): Promise<Map<string, EnrollmentBarred>> {
    const result = new Map<string, EnrollmentBarred>();
    if (enrollmentIds.length === 0) return result;

    const today = opts.today ?? tashkentDateStr(new Date());
    const windowStart = addDaysToDateStr(today, -31);
    const from =
      windowStart > ADMISSION_START_DAY ? windowStart : ADMISSION_START_DAY;
    const month = opts.today
      ? opts.today.slice(0, 7)
      : tashkentMonthKey(new Date());
    const periods = [addMonthsToMonthKey(month, -1), month].map((k) => {
      const [y, m] = k.split('-').map(Number);
      return { periodYear: y, periodMonth: m };
    });

    // Barred needs balance < 0: a student with balance >= 0 has paid every
    // charge, so the admission rule never keeps them out.
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        id: { in: enrollmentIds },
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { deletedAt: null, balance: { lt: 0 } },
        group: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        startDate: true,
        createdAt: true,
        statusChangedAt: true,
      },
    });
    if (enrollments.length === 0) return result;

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    const groupIds = [...new Set(enrollments.map((e) => e.groupId))];
    const range = {
      gte: utcMidnightFromDateStr(from),
      lt: utcMidnightFromDateStr(today),
    };
    const dayStr = (d: Date) => d.toISOString().slice(0, 10);

    const [charges, heldRows, rows, planned] = await Promise.all([
      this.prisma.enrollmentMonthlyCharge.findMany({
        where: {
          enrollmentId: { in: enrollments.map((e) => e.id) },
          status: MonthlyChargeStatus.CHARGED,
          OR: periods,
        },
        select: {
          enrollmentId: true,
          coveredDates: true,
          frozenOutDates: true,
        },
      }),
      // Ustoz davomat olgan kunlar (bekor qilingan dars qatorlari sanalmaydi).
      this.prisma.attendance.groupBy({
        by: ['groupId', 'date'],
        where: {
          groupId: { in: groupIds },
          date: range,
          cancellationId: null,
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          studentId: { in: studentIds },
          groupId: { in: groupIds },
          date: range,
        },
        select: {
          studentId: true,
          groupId: true,
          date: true,
          status: true,
          cancellationId: true,
        },
      }),
      this.prisma.plannedAbsence.findMany({
        where: {
          studentId: { in: studentIds },
          groupId: { in: groupIds },
          date: range,
          kind: 'SABABSIZ',
        },
        select: { studentId: true, groupId: true, date: true },
      }),
    ]);

    const chargeByEnrollment = new Map<
      string,
      { covered: string[]; frozen: string[] }
    >();
    for (const c of charges) {
      const acc = chargeByEnrollment.get(c.enrollmentId) ?? {
        covered: [],
        frozen: [],
      };
      acc.covered.push(...(c.coveredDates ?? []));
      acc.frozen.push(...(c.frozenOutDates ?? []));
      chargeByEnrollment.set(c.enrollmentId, acc);
    }
    const heldByGroup = new Map<string, Set<string>>();
    for (const r of heldRows) {
      const set = heldByGroup.get(r.groupId) ?? new Set<string>();
      set.add(dayStr(r.date));
      heldByGroup.set(r.groupId, set);
    }
    const plannedKeys = new Set(
      planned.map((p) => `${p.studentId}:${p.groupId}:${dayStr(p.date)}`),
    );
    const rowsByPair = new Map<string, Map<string, 'MARKED' | 'ABSENT'>>();
    for (const r of rows) {
      if (r.cancellationId) continue;
      const day = dayStr(r.date);
      const pair = `${r.studentId}:${r.groupId}`;
      const map = rowsByPair.get(pair) ?? new Map();
      const absent =
        r.status === AttendanceStatus.ABSENT ||
        (r.status === AttendanceStatus.EXCUSED &&
          plannedKeys.has(`${pair}:${day}`));
      map.set(day, absent ? 'ABSENT' : 'MARKED');
      rowsByPair.set(pair, map);
    }
    // Rows of cancelled lessons still mean "the student has a mark that day".
    const markedByPair = new Map<string, Set<string>>();
    for (const r of rows) {
      const pair = `${r.studentId}:${r.groupId}`;
      const set = markedByPair.get(pair) ?? new Set<string>();
      set.add(dayStr(r.date));
      markedByPair.set(pair, set);
    }

    const empty = new Set<string>();
    const candidates = enrollments.map((e) => {
      const ch = chargeByEnrollment.get(e.id);
      const pair = `${e.studentId}:${e.groupId}`;
      const own = streakWindowStart(e);
      const enrollmentFrom = own > from ? own : from;
      const days = ch
        ? barredLessonDays({
            coveredDates: ch.covered,
            frozenOutDates: ch.frozen,
            heldDays: heldByGroup.get(e.groupId) ?? empty,
            markedDays: markedByPair.get(pair) ?? empty,
            from: enrollmentFrom,
            to: today,
            includeFrozenOut: false,
          })
        : [];
      return { e, pair, enrollmentFrom, days };
    });

    const verdicts = await this.admission.forLessons(
      candidates.flatMap((c) =>
        c.days.map((d) => ({
          studentId: c.e.studentId,
          groupId: c.e.groupId,
          lessonDay: d,
        })),
      ),
    );

    for (const { e, pair, enrollmentFrom, days } of candidates) {
      const barred = days.filter((d) =>
        isRefused(verdicts.get(admissionKey(e.studentId, e.groupId, d))),
      );
      const held = [...(heldByGroup.get(e.groupId) ?? empty)]
        .filter((d) => d >= enrollmentFrom && d < today)
        .sort();
      const streak = barredStreak(
        held,
        rowsByPair.get(pair) ?? new Map(),
        new Set(barred),
      );
      if (barred.length === 0 && streak === 0) continue;
      result.set(e.id, {
        enrollmentId: e.id,
        studentId: e.studentId,
        groupId: e.groupId,
        days: barred,
        streak,
        lastDay: barred.length > 0 ? barred[barred.length - 1] : null,
      });
    }
    return result;
  }
}
