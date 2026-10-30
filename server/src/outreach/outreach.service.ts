import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  CallOutcome,
  EnrollmentStatus,
  GroupStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentMonthKey,
} from '../common/date/tashkent';
import { ADMISSION_START_DAY } from '../billing/lesson-admission';
import { unmarkedLessonDays } from './unmarked-lesson-days';
import { AbsenceStreakService } from './absence-streak.service';
import { AbsencePauseSettingService } from '../absence-pause/absence-pause-setting.service';
import { AUTO_PAUSE_REASON_PREFIX } from '../absence-pause/absence-pause.constants';

interface UserContext {
  userId: number;
  companyId: number;
  roles: string[];
  /** The request's RESOLVED scope from `@BranchScope()`. */
  branchScope: ReportBranchIds;
}

@Injectable()
export class OutreachService {
  constructor(
    private prisma: PrismaService,
    private absenceStreak: AbsenceStreakService,
    private pauseSettings: AbsencePauseSettingService,
  ) {}

  /**
   * The request's RESOLVED scope, straight from `@BranchScope()`.
   *
   * This used to call `resolveCallerReportBranchIds(userId)` itself with no
   * requested branch, so the page ignored the header switcher entirely: a CEO
   * who picked Namangan still saw both branches. Taking the decorator's value
   * fixes that AND removes a private copy of the rule — re-deriving a scope
   * inside a service is the documented mistake that had a workbook printing
   * one branch on its cover and another in its totals.
   *
   * `null` (every branch) becomes `undefined` here because that is what these
   * queries already spell "no restriction" as; `[]` stays `[]`, and stays
   * nothing.
   */
  private toBranchIds(scope: ReportBranchIds): number[] | undefined {
    return scope ?? undefined;
  }

  async getTodayAbsentees(ctx: UserContext & { date?: string }) {
    // Defaults to Tashkent calendar today when caller omits the date — keeps
    // backward compatibility with the no-arg endpoint.
    const dateStr = ctx.date ?? tashkentDateStr(new Date());
    const date = utcMidnightFromDateStr(dateStr);
    const branchIds = this.toBranchIds(ctx.branchScope);
    // Empty array means "no branches assigned" — return nothing instead of
    // matching every branch via Prisma's missing-filter shortcut.
    if (branchIds && branchIds.length === 0) {
      return { date: dateStr, total: 0, items: [] };
    }

    const rows = await this.prisma.attendance.findMany({
      where: {
        date,
        status: AttendanceStatus.ABSENT,
        companyId: ctx.companyId,
        group: {
          deletedAt: null,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
        },
        student: { deletedAt: null },
      },
      select: {
        id: true,
        note: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photo: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            lessonStartTime: true,
            lessonEndTime: true,
            course: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    // "Bog'lanildi" badge — was this student already called (any reason) on the
    // viewed date? Lets the admin skip students they've already worked through.
    const outcomeByStudent = await this.getLatestCallOutcomes(
      ctx.companyId,
      rows.map((r) => r.student.id),
      dateStr,
    );

    const items = rows.map((r) => ({
      attendanceId: r.id,
      note: r.note,
      calledToday: outcomeByStudent.has(r.student.id),
      callOutcome: outcomeByStudent.get(r.student.id) ?? null,
      student: r.student,
      group: {
        id: r.group.id,
        name: r.group.name,
        lessonStartTime: r.group.lessonStartTime,
        lessonEndTime: r.group.lessonEndTime,
        course: r.group.course,
        branch: r.group.branch,
      },
      teacher: r.group.teachers[0]
        ? {
            id: r.group.teachers[0].teacher.id,
            firstName: r.group.teachers[0].teacher.firstName,
            lastName: r.group.teachers[0].teacher.lastName,
          }
        : null,
    }));

    // Sort: by lesson start time ASC so the user works through the day
    // chronologically (and groups with no time go last).
    items.sort((a, b) => {
      const at = a.group.lessonStartTime ?? '99:99';
      const bt = b.group.lessonStartTime ?? '99:99';
      return at.localeCompare(bt);
    });

    return { date: dateStr, total: items.length, items };
  }

  // Lightweight summary for the /outreach landing widget. Counts come from
  // cheap SQL aggregates; removalQueue reuses the same fan-out as
  // getRemovalQueue (acceptable because the page only fetches stats once).
  async getStats(ctx: UserContext) {
    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) {
      return {
        todayAbsentees: 0,
        removalQueue: 0,
        blockedFromLessons: 0,
        activePromises: 0,
        callsToday: 0,
      };
    }

    const todayStr = tashkentDateStr(new Date());
    // Attendance.date is stored at UTC-midnight, so it uses the plain date.
    const today = utcMidnightFromDateStr(todayStr);

    // Chegaralar sozlamadan — bosh sahifadagi «e'tibor» raqami va
    // `/outreach` ro'yxati bir xil qoidadan oziqlansin.
    const settings = await this.pauseSettings.get(ctx.companyId);

    const [todayAbsentees, streaks, activePromises, callsToday, blocked] =
      await Promise.all([
        this.prisma.attendance.count({
          where: {
            date: today,
            status: AttendanceStatus.ABSENT,
            companyId: ctx.companyId,
            group: {
              deletedAt: null,
              ...(branchIds ? { branchId: { in: branchIds } } : {}),
            },
            student: { deletedAt: null },
          },
        }),
        this.absenceStreak.computeStreaks({
          companyId: ctx.companyId,
          branchIds,
          threshold: settings.warnThreshold,
        }),
        this.prisma.paymentPromise.count({
          where: {
            companyId: ctx.companyId,
            status: { in: ['OPEN', 'BROKEN'] },
            student: { balance: { lt: 0 }, deletedAt: null },
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
        }),
        this.prisma.callLog.count({
          where: {
            companyId: ctx.companyId,
            // createdAt is a real instant — bound by the Tashkent day, not UTC.
            createdAt: tashkentDayRangeUtc(todayStr),
            ...(branchIds ? { branchId: { in: branchIds } } : {}),
          },
        }),
        this.getBlockedFromLessons(ctx),
      ]);

    return {
      todayAbsentees,
      // Hisoblagich PAUZA yoqasidagilarni sanaydi, ogohlantirilganlarni
      // emas — bosh sahifadagi «e'tibor» raqami shu bo'lib qolsin.
      removalQueue: streaks.filter(
        (s) => s.consecutiveAbsentCount >= settings.pauseThreshold,
      ).length,
      // «Darsga qo'yilmayotganlar» tabining soni. «e'tibor» raqamiga
      // QO'SHILMAGAN: u hali faqat pauza yoqasidagilarni sanaydi.
      blockedFromLessons: blocked.total,
      activePromises,
      callsToday,
    };
  }

  /**
   * Branch-scoped list of ACTIVE payment promises (OPEN + BROKEN) whose student
   * still owes — so a date set from the debtors page shows up here immediately,
   * not only after the cron flips it to BROKEN. `isOverdue` marks promises whose
   * date has passed. Overdue first, then by promise date ascending.
   */
  async getActivePromises(ctx: UserContext) {
    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) return { total: 0, items: [] };

    const promises = await this.prisma.paymentPromise.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: ['OPEN', 'BROKEN'] },
        student: { balance: { lt: 0 }, deletedAt: null },
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      select: {
        id: true,
        promiseDate: true,
        comment: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            parentPhone: true,
            photo: true,
            balance: true,
            enrollments: {
              where: { status: 'ACTIVE', deletedAt: null },
              select: { group: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { promiseDate: 'asc' },
    });

    // By Tashkent day, like the cron: a promise for today is not overdue yet.
    const today = tashkentDateStr(new Date());
    const items = promises
      .map((p) => ({
        promiseId: p.id,
        promiseDate: p.promiseDate.toISOString(),
        isOverdue: tashkentDateStr(p.promiseDate) < today,
        comment: p.comment,
        createdAt: p.createdAt.toISOString(),
        student: {
          id: p.student.id,
          firstName: p.student.firstName,
          lastName: p.student.lastName,
          phone: p.student.phone,
          parentPhone: p.student.parentPhone,
          photo: p.student.photo,
          balance: p.student.balance,
        },
        groups: p.student.enrollments.map((e) => e.group),
      }))
      // Overdue first; the findMany already ordered by promiseDate asc, so a
      // stable partition keeps each bucket in date order.
      .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue));

    return { total: items.length, items };
  }

  async getRemovalQueue(ctx: UserContext) {
    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) {
      return { total: 0, items: [] };
    }

    // Chegara sozlamadan — CEO uni 3 dan 4 ga o'zgartirsa bu ro'yxat ham
    // darhol ergashadi. Qat'iy 3 qolsa, avtomatika bir chegarada ishlab,
    // admin boshqa ro'yxatni ko'rib turardi.
    const settings = await this.pauseSettings.get(ctx.companyId);

    const streaks = await this.absenceStreak.computeStreaks({
      companyId: ctx.companyId,
      branchIds,
      threshold: settings.warnThreshold,
    });

    if (streaks.length === 0) {
      return {
        total: 0,
        pauseThreshold: settings.pauseThreshold,
        items: [],
      };
    }

    const enrollmentIds = streaks.map((s) => s.enrollmentId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            parentPhone: true,
            photo: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    const enrollMap = new Map(enrollments.map((e) => [e.id, e] as const));

    // "Bog'lanildi" badge — students already called today (any reason).
    const calledSet = await this.getCalledStudentIds(
      ctx.companyId,
      enrollments.map((e) => e.student.id),
      tashkentDateStr(new Date()),
    );

    // «Ogohlantirildi 12.09» belgisi — admin takror qo'ng'iroq qilmasin.
    // Bitta so'rov; har yozuv uchun eng oxirgi jurnal qatori olinadi.
    const warnLogs = await this.prisma.absenceWarningLog.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      orderBy: { absenceDate: 'desc' },
      select: { enrollmentId: true, absenceDate: true },
    });
    const warnedAtByEnrollment = new Map<string, Date>();
    for (const w of warnLogs) {
      if (!warnedAtByEnrollment.has(w.enrollmentId)) {
        warnedAtByEnrollment.set(w.enrollmentId, w.absenceDate);
      }
    }

    const items = streaks
      .map((s) => {
        const e = enrollMap.get(s.enrollmentId);
        if (!e) return null;
        return {
          enrollmentId: s.enrollmentId,
          consecutiveAbsentCount: s.consecutiveAbsentCount,
          lastAbsenceDate: s.lastAbsenceDate.toISOString(),
          lastPresentDate: s.lastPresentDate?.toISOString() ?? null,
          warnedAt:
            warnedAtByEnrollment.get(s.enrollmentId)?.toISOString() ?? null,
          calledToday: calledSet.has(e.student.id),
          student: e.student,
          group: {
            id: e.group.id,
            name: e.group.name,
            course: e.group.course,
            branch: e.group.branch,
          },
          teacher: e.group.teachers[0]
            ? {
                id: e.group.teachers[0].teacher.id,
                firstName: e.group.teachers[0].teacher.firstName,
                lastName: e.group.teachers[0].teacher.lastName,
              }
            : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.consecutiveAbsentCount - a.consecutiveAbsentCount);

    return {
      total: items.length,
      pauseThreshold: settings.pauseThreshold,
      items,
    };
  }

  /**
   * Avtomatik pauzaga tushgan o'quvchilar — «Pauzadagilar» tabi.
   *
   * Qo'lda muzlatilganlar ARALASHMAYDI: prodda 209 ta muzlatilgan o'quvchi
   * bor va ularning aksariyati boshqa sabablar bilan muzlatilgan. Ajratish
   * belgisi — sabab matnining boshlanishi (`AUTO_PAUSE_REASON_PREFIX`);
   * cron ham, bu yer ham bitta konstantadan o'qiydi, shuning uchun matn
   * o'zgarsa ro'yxat jimgina bo'shab qolmaydi.
   */
  async getAutoPaused(ctx: UserContext) {
    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) {
      return { total: 0, items: [] };
    }

    const students = await this.prisma.student.findMany({
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        status: StudentStatus.FROZEN,
        statusChangeReason: { startsWith: AUTO_PAUSE_REASON_PREFIX },
        ...(branchIds
          ? { branches: { some: { branchId: { in: branchIds } } } }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        parentPhone: true,
        photo: true,
        balance: true,
        statusChangedAt: true,
        statusChangeReason: true,
        enrollments: {
          where: { status: EnrollmentStatus.FROZEN, deletedAt: null },
          orderBy: { statusChangedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            group: {
              select: {
                id: true,
                name: true,
                course: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { statusChangedAt: 'desc' },
    });

    const calledSet = await this.getCalledStudentIds(
      ctx.companyId,
      students.map((s) => s.id),
      tashkentDateStr(new Date()),
    );

    const items = students.map((s) => ({
      studentId: s.id,
      pausedAt: s.statusChangedAt?.toISOString() ?? null,
      reason: s.statusChangeReason,
      calledToday: calledSet.has(s.id),
      student: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        parentPhone: s.parentPhone,
        photo: s.photo,
        balance: s.balance,
      },
      group: s.enrollments[0]?.group ?? null,
    }));

    return { total: items.length, items };
  }

  /**
   * «Darsga qo'yilmayotganlar» tabi (ADR-0141): guruhda turgan, qarzdor va
   * ustoz davomat olgan darslarda o'ziga hech qanday belgi qo'yilmagan
   * o'quvchilar.
   *
   * 2-darsdan keyin to'lamagan o'quvchiga «Keldi» ham, «Kelmadi» ham qo'yib
   * bo'lmaydi (ADR-0047), shuning uchun u davomat qatori qoldirmaydi va
   * «Kelmaganlar» / «Ko'p dars qoldirganlar» ro'yxatlariga tushmaydi. Shu
   * ro'yxat o'sha bo'shliqni yopadi: qator YO'QLIGI — belgi.
   *
   * Oynasi: oxirgi 31 kun, lekin ADMISSION_START_DAY dan oldin emas (qoida
   * shundan beri bor). Hisob — oylik hisobning muzlatilgan sanalari
   * (`coveredDates` minus `frozenOutDates`), shuning uchun bekor qilingan
   * va qaytarilgan kunlar sanalmaydi.
   */
  async getBlockedFromLessons(ctx: UserContext) {
    const branchIds = this.toBranchIds(ctx.branchScope);
    if (branchIds && branchIds.length === 0) return { total: 0, items: [] };

    const now = new Date();
    const today = tashkentDateStr(now);
    const windowStart = addDaysToDateStr(today, -31);
    const from =
      windowStart > ADMISSION_START_DAY ? windowStart : ADMISSION_START_DAY;
    const thisMonth = tashkentMonthKey(now);
    const periods = [addMonthsToMonthKey(thisMonth, -1), thisMonth].map((k) => {
      const [y, m] = k.split('-').map(Number);
      return { periodYear: y, periodMonth: m };
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: {
          deletedAt: null,
          companyId: ctx.companyId,
          balance: { lt: 0 },
        },
        group: {
          deletedAt: null,
          statusEnum: GroupStatus.ACTIVE,
          companyId: ctx.companyId,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
        },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            parentPhone: true,
            photo: true,
            balance: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    if (enrollments.length === 0) return { total: 0, items: [] };

    const enrollmentIds = enrollments.map((e) => e.id);
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    const groupIds = [...new Set(enrollments.map((e) => e.groupId))];
    const range = {
      gte: utcMidnightFromDateStr(from),
      lt: utcMidnightFromDateStr(today),
    };
    const dayStr = (d: Date) => d.toISOString().slice(0, 10);

    const [charges, heldRows, markedRows, lastCame, calls, promises] =
      await Promise.all([
        this.prisma.enrollmentMonthlyCharge.findMany({
          where: {
            enrollmentId: { in: enrollmentIds },
            status: 'CHARGED',
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
          select: { studentId: true, groupId: true, date: true },
        }),
        this.prisma.attendance.groupBy({
          by: ['studentId', 'groupId'],
          where: {
            studentId: { in: studentIds },
            groupId: { in: groupIds },
            status: {
              in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE],
            },
          },
          _max: { date: true },
        }),
        this.prisma.callLog.findMany({
          where: { companyId: ctx.companyId, studentId: { in: studentIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['studentId'],
          select: { studentId: true, createdAt: true, outcome: true },
        }),
        this.prisma.paymentPromise.findMany({
          where: {
            companyId: ctx.companyId,
            studentId: { in: studentIds },
            status: { in: ['OPEN', 'BROKEN'] },
          },
          orderBy: { promiseDate: 'desc' },
          distinct: ['studentId'],
          select: { studentId: true, promiseDate: true, status: true },
        }),
      ]);

    const chargesByEnrollment = new Map<
      string,
      { covered: string[]; frozen: string[] }
    >();
    for (const c of charges) {
      const acc = chargesByEnrollment.get(c.enrollmentId) ?? {
        covered: [],
        frozen: [],
      };
      acc.covered.push(...(c.coveredDates ?? []));
      acc.frozen.push(...(c.frozenOutDates ?? []));
      chargesByEnrollment.set(c.enrollmentId, acc);
    }
    const heldByGroup = new Map<string, Set<string>>();
    for (const r of heldRows) {
      const set = heldByGroup.get(r.groupId) ?? new Set<string>();
      set.add(dayStr(r.date));
      heldByGroup.set(r.groupId, set);
    }
    const markedByPair = new Map<string, Set<string>>();
    for (const r of markedRows) {
      const key = `${r.studentId}:${r.groupId}`;
      const set = markedByPair.get(key) ?? new Set<string>();
      set.add(dayStr(r.date));
      markedByPair.set(key, set);
    }
    const lastCameByPair = new Map(
      lastCame.map(
        (r) => [`${r.studentId}:${r.groupId}`, r._max.date] as const,
      ),
    );
    const lastCallByStudent = new Map(calls.map((c) => [c.studentId, c]));
    const promiseByStudent = new Map(promises.map((p) => [p.studentId, p]));

    const empty = new Set<string>();
    const items = enrollments
      .map((e) => {
        const ch = chargesByEnrollment.get(e.id);
        if (!ch) return null;
        const missed = unmarkedLessonDays({
          coveredDates: ch.covered,
          frozenOutDates: ch.frozen,
          heldDays: heldByGroup.get(e.groupId) ?? empty,
          markedDays: markedByPair.get(`${e.studentId}:${e.groupId}`) ?? empty,
          from,
          to: today,
        });
        if (missed.length === 0) return null;
        const lastDate = lastCameByPair.get(`${e.studentId}:${e.groupId}`);
        const call = lastCallByStudent.get(e.studentId);
        const promise = promiseByStudent.get(e.studentId);
        return {
          enrollmentId: e.id,
          missedLessons: missed.length,
          lastMissedDate: missed[missed.length - 1],
          lastCameDate: lastDate ? dayStr(lastDate) : null,
          debt: -e.student.balance,
          calledToday: !!call && tashkentDateStr(call.createdAt) === today,
          lastCall: call
            ? {
                at: call.createdAt.toISOString(),
                outcome: call.outcome,
              }
            : null,
          promise: promise
            ? {
                date: promise.promiseDate.toISOString(),
                status: promise.status,
              }
            : null,
          student: e.student,
          group: {
            id: e.group.id,
            name: e.group.name,
            course: e.group.course,
            branch: e.group.branch,
          },
          teacher: e.group.teachers[0]
            ? {
                id: e.group.teachers[0].teacher.id,
                firstName: e.group.teachers[0].teacher.firstName,
                lastName: e.group.teachers[0].teacher.lastName,
              }
            : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.missedLessons - a.missedLessons || b.debt - a.debt);

    return { total: items.length, items };
  }

  // Latest call outcome per student on the given Tashkent day (any reason) —
  // powers the "Natija" column on the absentees list.
  private async getLatestCallOutcomes(
    companyId: number,
    studentIds: number[],
    dateStr: string,
  ): Promise<Map<number, CallOutcome>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.prisma.callLog.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        createdAt: tashkentDayRangeUtc(dateStr),
      },
      orderBy: { createdAt: 'asc' },
      select: { studentId: true, outcome: true },
    });
    // asc order: the last call of the day overwrites earlier ones.
    return new Map(rows.map((r) => [r.studentId, r.outcome]));
  }

  // Set of student IDs called (any reason) on the given Tashkent day — powers
  // the "Bog'lanildi" badge on the absentees / removal lists. Returns empty for
  // an empty input to avoid a needless `IN ()` query.
  private async getCalledStudentIds(
    companyId: number,
    studentIds: number[],
    dateStr: string,
  ): Promise<Set<number>> {
    if (studentIds.length === 0) return new Set();
    const rows = await this.prisma.callLog.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        // createdAt is a real instant — bound by the Tashkent day, not UTC.
        createdAt: tashkentDayRangeUtc(dateStr),
      },
      select: { studentId: true },
    });
    return new Set(rows.map((r) => r.studentId));
  }
}
