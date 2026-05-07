import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  EnrollmentStatus,
  HolidayStatus,
} from '@prisma/client';
import {
  DAY_NAME_TO_JS,
  JS_TO_DAY_NAME,
  tashkentDateStr,
  utcMidnightFromDateStr,
  dayOfWeekForDateStr,
  addDaysToDateStr,
} from './shared/date-utils';
import {
  calculateDebtAmount,
  calculatePerLessonCost,
} from '../billing/debtor-check.helper';

@Injectable()
export class AttendanceReadService {
  constructor(private prisma: PrismaService) {}

  /**
   * Layers `LessonReschedule` + `LessonCancellation` rows over a base list of
   * exactDays-derived lesson date strings (Tashkent calendar):
   *   - Drop dates that have an active cancellation
   *   - Drop dates that are the `originalDate` of an active reschedule
   *     (lesson has moved away)
   *   - Add dates that are the `newDate` of an active reschedule, when they
   *     fall within `[rangeStartStr, rangeEndStr]` (lesson has moved here,
   *     even if the day-of-week is outside `exactDays`)
   *
   * Returned list is sorted ascending. This mirrors the same notion of
   * "what counts as a lesson day" the override / cancellation / reschedule
   * dialogs use on the frontend.
   */
  private async applyLessonModifications(
    groupId: string,
    baseDates: string[],
    rangeStartStr: string,
    rangeEndStr: string,
  ): Promise<string[]> {
    if (rangeStartStr > rangeEndStr) return [];

    const [reschedules, cancellations] = await Promise.all([
      this.prisma.lessonReschedule.findMany({
        where: {
          groupId,
          deletedAt: null,
          OR: [
            {
              originalDate: {
                gte: utcMidnightFromDateStr(rangeStartStr),
                lte: utcMidnightFromDateStr(rangeEndStr),
              },
            },
            {
              newDate: {
                gte: utcMidnightFromDateStr(rangeStartStr),
                lte: utcMidnightFromDateStr(rangeEndStr),
              },
            },
          ],
        },
        select: { originalDate: true, newDate: true },
      }),
      this.prisma.lessonCancellation.findMany({
        where: {
          groupId,
          deletedAt: null,
          date: {
            gte: utcMidnightFromDateStr(rangeStartStr),
            lte: utcMidnightFromDateStr(rangeEndStr),
          },
        },
        select: { date: true },
      }),
    ]);

    const exclude = new Set<string>();
    const additions = new Set<string>();
    for (const r of reschedules) {
      exclude.add(tashkentDateStr(r.originalDate));
      const newKey = tashkentDateStr(r.newDate);
      if (newKey >= rangeStartStr && newKey <= rangeEndStr) {
        additions.add(newKey);
      }
    }
    for (const c of cancellations) exclude.add(tashkentDateStr(c.date));

    const merged = new Set(baseDates.filter((d) => !exclude.has(d)));
    for (const d of additions) {
      if (!exclude.has(d)) merged.add(d);
    }
    return Array.from(merged).sort();
  }

  /**
   * Get lesson dates for a group in a given month/year,
   * including attendance summary per date.
   */
  async getLessonDates(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        name: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            enrollments: {
              where: { deletedAt: null, status: EnrollmentStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('Guruh topilmadi');

    // Iterate by Tashkent calendar date strings — stable across server
    // timezones. Group startDate/endDate are stored as Tashkent midnight in
    // UTC (toISOString() of a Tashkent-browser Date), so a UTC server iterating
    // by `new Date(year, month, day)` (UTC midnight) would terminate one day
    // early on `cursor <= rangeEnd`. String-based iteration sidesteps that.
    const now = new Date();
    const targetMonth = month ? month - 1 : now.getMonth();
    const targetYear = year ?? now.getFullYear();

    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    if (scheduleDays.length === 0) return [];

    const monthStartStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();
    const monthEndStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const groupStartStr = group.startDate
      ? tashkentDateStr(group.startDate)
      : null;
    const groupEndStr = group.endDate ? tashkentDateStr(group.endDate) : null;

    const rangeStartStr =
      groupStartStr && groupStartStr > monthStartStr
        ? groupStartStr
        : monthStartStr;
    const rangeEndStr =
      groupEndStr && groupEndStr < monthEndStr ? groupEndStr : monthEndStr;

    if (rangeStartStr > rangeEndStr) return [];

    // Holiday query bounds: pad ±1 day so that holidays stored as either
    // UTC midnight or Tashkent midnight (= prior-day 19:00 UTC) are both
    // captured. We dedupe by Tashkent calendar date afterwards.
    const holidayQueryStart = new Date(
      utcMidnightFromDateStr(rangeStartStr).getTime() - 24 * 60 * 60 * 1000,
    );
    const holidayQueryEnd = new Date(
      utcMidnightFromDateStr(rangeEndStr).getTime() + 24 * 60 * 60 * 1000,
    );
    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: holidayQueryStart, lte: holidayQueryEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => tashkentDateStr(h.date)));

    const baseLessonDateStrs: string[] = [];
    let cursorStr = rangeStartStr;
    while (cursorStr <= rangeEndStr) {
      if (
        scheduleDays.includes(dayOfWeekForDateStr(cursorStr)) &&
        !holidaySet.has(cursorStr)
      ) {
        baseLessonDateStrs.push(cursorStr);
      }
      cursorStr = addDaysToDateStr(cursorStr, 1);
    }

    // Layer reschedules + cancellations: drop moved-away / cancelled dates,
    // include moved-here dates (even if outside exactDays).
    const lessonDateStrs = await this.applyLessonModifications(
      groupId,
      baseLessonDateStrs,
      rangeStartStr,
      rangeEndStr,
    );

    if (lessonDateStrs.length === 0) return [];

    // Attendance.date is stored as UTC midnight (see attendance-validation
    // line 36: `new Date(date + 'T00:00:00.000Z')`).
    const lessonDateObjs = lessonDateStrs.map(utcMidnightFromDateStr);
    const attendanceCounts = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: {
        groupId,
        date: { in: lessonDateObjs },
      },
      _count: true,
    });

    const countMap: Record<
      string,
      {
        present: number;
        absent: number;
        late: number;
        excused: number;
        total: number;
      }
    > = {};

    for (const row of attendanceCounts) {
      const dateStr = tashkentDateStr(row.date);
      if (!countMap[dateStr]) {
        countMap[dateStr] = {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          total: 0,
        };
      }
      const count = row._count;
      countMap[dateStr].total += count;
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          countMap[dateStr].present += count;
          break;
        case AttendanceStatus.ABSENT:
          countMap[dateStr].absent += count;
          break;
        case AttendanceStatus.LATE:
          countMap[dateStr].late += count;
          break;
        case AttendanceStatus.EXCUSED:
          countMap[dateStr].excused += count;
          break;
      }
    }

    const totalStudents = group._count.enrollments;

    return lessonDateStrs.map((dateStr) => {
      const counts = countMap[dateStr];
      return {
        date: dateStr,
        dayName: JS_TO_DAY_NAME[dayOfWeekForDateStr(dateStr)] ?? '',
        hasAttendance: !!counts && counts.total > 0,
        presentCount: counts?.present ?? 0,
        absentCount: counts?.absent ?? 0,
        lateCount: counts?.late ?? 0,
        excusedCount: counts?.excused ?? 0,
        totalStudents,
      };
    });
  }

  /**
   * Calendar-view variant of `getLessonDates`: returns one cell per
   * "interesting" date in the month — every regular lesson day, every
   * reschedule destination, every reschedule origin (lesson moved away),
   * and every cancellation. Each cell carries a `type` marker so the
   * frontend can color-code without re-running the modification logic.
   *
   * Cell type priority (when a date has multiple modifications, which
   * the cascade in lesson-* services already prevents — but we're
   * defensive):
   *   1. cancelled  (lesson is gone, no attendance can happen)
   *   2. rescheduledFrom  (lesson has moved away, no attendance here)
   *   3. rescheduledTo  (lesson moved here from elsewhere)
   *   4. regular
   */
  async getLessonCalendar(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            enrollments: {
              where: { deletedAt: null, status: EnrollmentStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('Guruh topilmadi');

    const now = new Date();
    const targetMonth = month ? month - 1 : now.getMonth();
    const targetYear = year ?? now.getFullYear();

    const monthStartStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();
    const monthEndStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const groupStartStr = group.startDate
      ? tashkentDateStr(group.startDate)
      : null;
    const groupEndStr = group.endDate ? tashkentDateStr(group.endDate) : null;

    // Range for the BASE schedule (regular lesson days). Bounded by both
    // group lifecycle and the requested month so we don't iterate forever.
    const baseRangeStartStr =
      groupStartStr && groupStartStr > monthStartStr
        ? groupStartStr
        : monthStartStr;
    const baseRangeEndStr =
      groupEndStr && groupEndStr < monthEndStr ? groupEndStr : monthEndStr;

    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    // Holidays — skip these from the base regular days.
    const holidayQueryStart = new Date(
      utcMidnightFromDateStr(monthStartStr).getTime() - 24 * 60 * 60 * 1000,
    );
    const holidayQueryEnd = new Date(
      utcMidnightFromDateStr(monthEndStr).getTime() + 24 * 60 * 60 * 1000,
    );
    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: holidayQueryStart, lte: holidayQueryEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => tashkentDateStr(h.date)));

    // Pull all modifications that touch this month — any reschedule whose
    // originalDate OR newDate falls in the month, and any cancellation.
    const monthStartDate = utcMidnightFromDateStr(monthStartStr);
    const monthEndDate = utcMidnightFromDateStr(monthEndStr);
    const [reschedules, cancellations] = await Promise.all([
      this.prisma.lessonReschedule.findMany({
        where: {
          groupId,
          deletedAt: null,
          OR: [
            { originalDate: { gte: monthStartDate, lte: monthEndDate } },
            { newDate: { gte: monthStartDate, lte: monthEndDate } },
          ],
        },
        select: { originalDate: true, newDate: true },
      }),
      this.prisma.lessonCancellation.findMany({
        where: {
          groupId,
          deletedAt: null,
          date: { gte: monthStartDate, lte: monthEndDate },
        },
        select: { date: true, reason: true },
      }),
    ]);

    type CellType =
      | 'regular'
      | 'rescheduledTo'
      | 'rescheduledFrom'
      | 'cancelled';
    interface DraftCell {
      type: CellType;
      movedFrom?: string;
      movedTo?: string;
      cancellationReason?: string;
    }
    const cellMap = new Map<string, DraftCell>();
    const setCell = (key: string, draft: DraftCell) => {
      // Apply priority: cancelled > rescheduledFrom > rescheduledTo > regular.
      const priority: Record<CellType, number> = {
        cancelled: 4,
        rescheduledFrom: 3,
        rescheduledTo: 2,
        regular: 1,
      };
      const existing = cellMap.get(key);
      if (!existing || priority[draft.type] > priority[existing.type]) {
        cellMap.set(key, draft);
      }
    };

    // 1. Regular lesson days.
    if (
      baseRangeStartStr <= baseRangeEndStr &&
      scheduleDays.length > 0
    ) {
      let cursorStr = baseRangeStartStr;
      while (cursorStr <= baseRangeEndStr) {
        if (
          scheduleDays.includes(dayOfWeekForDateStr(cursorStr)) &&
          !holidaySet.has(cursorStr)
        ) {
          setCell(cursorStr, { type: 'regular' });
        }
        cursorStr = addDaysToDateStr(cursorStr, 1);
      }
    }

    // 2. Reschedule destinations (in this month) → upgrade to rescheduledTo
    //    UNLESS the date is already a regular lesson day (per open decision
    //    #1 in plan: keep `regular` rang, but record movedFrom for tooltip).
    for (const r of reschedules) {
      const newKey = tashkentDateStr(r.newDate);
      if (newKey >= monthStartStr && newKey <= monthEndStr) {
        const existing = cellMap.get(newKey);
        if (existing?.type === 'regular') {
          existing.movedFrom = tashkentDateStr(r.originalDate);
        } else {
          setCell(newKey, {
            type: 'rescheduledTo',
            movedFrom: tashkentDateStr(r.originalDate),
          });
        }
      }
      const fromKey = tashkentDateStr(r.originalDate);
      if (fromKey >= monthStartStr && fromKey <= monthEndStr) {
        setCell(fromKey, {
          type: 'rescheduledFrom',
          movedTo: tashkentDateStr(r.newDate),
        });
      }
    }

    // 3. Cancellations — highest priority, override everything.
    for (const c of cancellations) {
      const key = tashkentDateStr(c.date);
      if (key < monthStartStr || key > monthEndStr) continue;
      setCell(key, { type: 'cancelled', cancellationReason: c.reason });
    }

    // 4. Attendance counts — only meaningful for cells that host a lesson
    //    (regular | rescheduledTo). Pull in one query.
    const liveCellKeys = Array.from(cellMap.entries())
      .filter(([, c]) => c.type === 'regular' || c.type === 'rescheduledTo')
      .map(([k]) => k);
    let countMap: Record<
      string,
      { present: number; absent: number; late: number; excused: number; total: number }
    > = {};
    if (liveCellKeys.length > 0) {
      const dateObjs = liveCellKeys.map(utcMidnightFromDateStr);
      const counts = await this.prisma.attendance.groupBy({
        by: ['date', 'status'],
        where: { groupId, date: { in: dateObjs } },
        _count: true,
      });
      countMap = {};
      for (const row of counts) {
        const dateStr = tashkentDateStr(row.date);
        if (!countMap[dateStr]) {
          countMap[dateStr] = {
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            total: 0,
          };
        }
        countMap[dateStr].total += row._count;
        switch (row.status) {
          case AttendanceStatus.PRESENT:
            countMap[dateStr].present += row._count;
            break;
          case AttendanceStatus.ABSENT:
            countMap[dateStr].absent += row._count;
            break;
          case AttendanceStatus.LATE:
            countMap[dateStr].late += row._count;
            break;
          case AttendanceStatus.EXCUSED:
            countMap[dateStr].excused += row._count;
            break;
        }
      }
    }

    const totalStudents = group._count.enrollments;
    const cells = Array.from(cellMap.entries()).map(([dateStr, draft]) => {
      const counts = countMap[dateStr];
      return {
        date: dateStr,
        dayName: JS_TO_DAY_NAME[dayOfWeekForDateStr(dateStr)] ?? '',
        type: draft.type,
        hasAttendance: !!counts && counts.total > 0,
        presentCount: counts?.present ?? 0,
        absentCount: counts?.absent ?? 0,
        lateCount: counts?.late ?? 0,
        excusedCount: counts?.excused ?? 0,
        totalStudents,
        movedFrom: draft.movedFrom,
        movedTo: draft.movedTo,
        cancellationReason: draft.cancellationReason,
      };
    });
    cells.sort((a, b) => a.date.localeCompare(b.date));
    return { cells };
  }

  /**
   * Get attendance for a group on a specific date.
   * Returns all active enrolled students with their attendance status.
   */
  async getByDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        course: { select: { price: true, lessonPaymentCount: true } },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const parsedDate = new Date(date + 'T00:00:00.000Z');

    const perLessonCost = calculatePerLessonCost(
      group.course.price,
      group.course.lessonPaymentCount,
    );

    // Two filters at the enrollment level:
    //   1. status ACTIVE + not soft-deleted (existing rule)
    //   2. startDate <= lessonDate — students who joined later don't appear
    //      on past lessons. NULL startDate (legacy/un-backfilled) is treated
    //      as "no restriction" so the page never silently empties.
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        OR: [{ startDate: null }, { startDate: { lte: parsedDate } }],
      },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
            balance: true,
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    const existingAttendance = await this.prisma.attendance.findMany({
      where: { groupId, date: parsedDate },
      select: {
        studentId: true,
        status: true,
        note: true,
      },
    });

    const attendanceMap = new Map(
      existingAttendance.map((a) => [a.studentId, a]),
    );

    // Per-group debt classification: a student is a debtor if their balance
    // can't cover even one lesson at this group's per-lesson cost. Debtors
    // now appear in the main roster for everyone (with an inline indicator)
    // so attendance can still be taken; their unpaid lessons get settled
    // retroactively when they next top up their balance. `debtorStudents`
    // is still returned to admins as a quick-action collection list.
    const isTeacherOnly =
      roles && roles.length > 0 && roles.every((r) => r === 'Teacher');

    const activeStudents = enrollments.map((e) => {
      const att = attendanceMap.get(e.studentId);
      const isDebtor = e.student.balance < perLessonCost;
      return {
        studentId: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        balance: e.student.balance,
        isDebtor,
        debtAmount: calculateDebtAmount(
          e.student.balance,
          group.course.price,
          group.course.lessonPaymentCount,
        ),
        status: att?.status ?? null,
        note: att?.note ?? null,
      };
    });

    const debtorStudents = isTeacherOnly
      ? []
      : activeStudents.filter((s) => s.isDebtor);

    return {
      activeStudents,
      debtorStudents,
      perLessonCost,
      coursePrice: group.course.price,
    };
  }

  /**
   * Get the last N lesson dates (N = course.lessonPaymentCount) with per-student
   * attendance status for each date. Used for the visual "dots" view on the group page.
   */
  async getLessonSequence(groupId: string, companyId?: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        course: { select: { lessonPaymentCount: true } },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const expectedCount = group.course?.lessonPaymentCount ?? 12;

    // Same TZ-aware iteration as getLessonDates — see comment there.
    const now = new Date();
    const todayStr = tashkentDateStr(now);
    const rangeStartStr = group.startDate
      ? tashkentDateStr(group.startDate)
      : `${now.getFullYear()}-01-01`;
    const groupEndStr = group.endDate ? tashkentDateStr(group.endDate) : null;
    const rangeEndStr =
      groupEndStr && groupEndStr < todayStr ? groupEndStr : todayStr;

    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    const holidayQueryStart = new Date(
      utcMidnightFromDateStr(rangeStartStr).getTime() - 24 * 60 * 60 * 1000,
    );
    const holidayQueryEnd = new Date(
      utcMidnightFromDateStr(rangeEndStr).getTime() + 24 * 60 * 60 * 1000,
    );
    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: holidayQueryStart, lte: holidayQueryEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => tashkentDateStr(h.date)));

    const baseLessonDates: string[] = [];
    if (rangeStartStr <= rangeEndStr) {
      let cursorStr = rangeStartStr;
      while (cursorStr <= rangeEndStr) {
        if (
          scheduleDays.includes(dayOfWeekForDateStr(cursorStr)) &&
          !holidaySet.has(cursorStr)
        ) {
          baseLessonDates.push(cursorStr);
        }
        cursorStr = addDaysToDateStr(cursorStr, 1);
      }
    }

    const allLessonDates = await this.applyLessonModifications(
      groupId,
      baseLessonDates,
      rangeStartStr,
      rangeEndStr,
    );

    const lessonDates = allLessonDates.slice(-expectedCount);

    const attendanceRecords =
      lessonDates.length > 0
        ? await this.prisma.attendance.findMany({
            where: {
              groupId,
              date: {
                gte: utcMidnightFromDateStr(lessonDates[0]),
                lte: utcMidnightFromDateStr(
                  lessonDates[lessonDates.length - 1],
                ),
              },
            },
            select: { studentId: true, date: true, status: true },
          })
        : [];

    const attendanceMap = new Map<string, AttendanceStatus>();
    for (const rec of attendanceRecords) {
      const key = `${rec.studentId}:${tashkentDateStr(rec.date)}`;
      attendanceMap.set(key, rec.status);
    }

    // Mark which lesson dates had a substitute teacher assigned (LessonTeacherOverride)
    // so the frontend can color those dots distinctly. Only active overrides count.
    const overrideRows =
      lessonDates.length > 0
        ? await this.prisma.lessonTeacherOverride.findMany({
            where: {
              groupId,
              deletedAt: null,
              date: {
                gte: utcMidnightFromDateStr(lessonDates[0]),
                lte: utcMidnightFromDateStr(
                  lessonDates[lessonDates.length - 1],
                ),
              },
            },
            select: { date: true },
          })
        : [];
    const overrideDateSet = new Set(
      overrideRows.map((r) => tashkentDateStr(r.date)),
    );
    const overrideDates = Array.from(overrideDateSet).sort();

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    const students = enrollments.map((e) => {
      const dots = lessonDates.map((date) => {
        const status = attendanceMap.get(`${e.student.id}:${date}`) ?? null;
        return { date, status };
      });
      const attended = dots.filter(
        (d) =>
          d.status === AttendanceStatus.PRESENT ||
          d.status === AttendanceStatus.LATE,
      ).length;
      return {
        id: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        dots,
        attended,
        total: lessonDates.length,
      };
    });

    return { lessonDates, overrideDates, expectedCount, students };
  }
}
