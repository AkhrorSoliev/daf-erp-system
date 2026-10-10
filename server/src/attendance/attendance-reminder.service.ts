import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GroupStatus, NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';
import { HolidaysService } from '../holidays/holidays.service';
import { UnmarkedLessonsService } from './unmarked-lessons.service';
import { lessonsOn, type SweepGroup } from './shared/ended-lessons';

const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const TEACHER_PORTAL_URL = 'https://lehrer.dafzentrum.uz';
const ADMIN_PORTAL_URL = 'https://admin.dafzentrum.uz';

type TeacherRef = {
  id: number;
  firstName: string;
  lastName: string;
  telegramChatId: string | null;
};

type GroupWithTeachers = {
  id: string;
  name: string;
  branchId: number;
  companyId: number;
  lessonStartTime: string;
  lessonEndTime: string;
  startDate: Date | null;
  endDate: Date | null;
  exactDays: string[];
  room: { name: string } | null;
  teachers: { teacher: TeacherRef }[];
};

/**
 * Sends lesson-attendance notifications on schedule.
 *
 * Idempotency relies on the `Notification` table — one row per (userId, type,
 * relatedEntityId=groupId, today) blocks repeat sends. Cron fires twice per
 * hour (at :00 and :30) between 07:00 and 22:30 Tashkent time, Monday–Saturday,
 * and `closeDay` fires once at 23:00 EVERY day, Sundays included, so the DB is
 * woken at 23:00 daily. The start and end − 30 reminders rely on lessons being
 * scheduled on half-hour boundaries — non-aligned lesson times (e.g. 09:15)
 * will not trigger them. The lesson-end sweep does not: it runs on every tick
 * and at 23:00 and asks «Dars bo'ldimi?» for any lesson that ended unmarked,
 * whatever its end time (ADR-0054).
 *
 * Trigger points per lesson:
 *   - start            → LESSON_STARTED (teacher), unless the register is already taken
 *   - end - 30 minutes → TEACHER_WARNING (teacher) + ADMIN_ALERT (admin)
 *   - end              → handled by the sweep (sweepEndedLessons): MISSING_TEACHER + MISSING_ADMIN, once, when the question is opened
 *
 * Every tick starts with the sweep, before any window check, so a tick always
 * reads the active groups, the day's moves, cancellations and open questions
 * and the branches' holidays. Only the reminder part after it is narrowed: we
 * compare the current minute against a cached [earliestStart, latestEnd]
 * window derived from active groups (refreshed hourly). When inside the
 * window, the group query is narrowed to rows whose lessonStartTime or
 * lessonEndTime matches the current trigger minute, so the reminder part
 * performs a single indexed lookup returning 0–3 rows. For the groups that
 * meet today it then reads the day's live cancellations and moves once (two
 * queries for all of them): a lesson cancelled or moved away gets no
 * reminder at all, so no alert is born for a day that was taken away.
 */
@Injectable()
export class AttendanceReminderService {
  private readonly logger = new Logger(AttendanceReminderService.name);
  private scheduleWindow: { startMin: number; endMin: number } | null = null;
  private windowCachedAt = 0;
  private readonly WINDOW_TTL_MS = 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private telegramService: TelegramService,
    private holidaysService: HolidaysService,
    private unmarkedLessons: UnmarkedLessonsService,
  ) {}

  @Cron('0 0,30 7-22 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick() {
    // «Dars bo'ldimi?» — open the question for every lesson that has ended
    // unmarked. Runs on every tick, whatever the lesson times, so a missed
    // tick is caught by the next one (spec 2026-09-29 §3.2).
    await this.sweepEndedLessons();

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'long',
    }).formatToParts(new Date());
    const p = (t: string) => parts.find((x) => x.type === t)!.value;
    const today = `${p('year')}-${p('month')}-${p('day')}`;
    // `hour12: false` resolves to the h24 cycle on older ICU (Node 20), where
    // midnight formats as "24" instead of "00" — that would push
    // `currentMinutes` past the schedule window and silently skip the tick.
    // `% 24` normalizes both cycles.
    const currentMinutes = (Number(p('hour')) % 24) * 60 + Number(p('minute'));
    const weekdayIdx = DAY_NAME_TO_JS[p('weekday').toLowerCase()];
    if (weekdayIdx === undefined) return;

    const window = await this.getScheduleWindow();
    if (!window) return;
    if (currentMinutes < window.startMin || currentMinutes > window.endMin)
      return;

    const parsedDate = new Date(today + 'T00:00:00.000Z');
    // Rebuilt from the normalized minute for the same h24 reason as above —
    // `p('hour')` alone would read "24:15" at midnight and match no lesson.
    const currentTime = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`;
    const endCandidates = [currentTime, this.addMinutes(currentTime, 30)];

    const groups = await this.prisma.group.findMany({
      where: {
        statusEnum: GroupStatus.ACTIVE,
        deletedAt: null,
        lessonStartTime: { not: null },
        lessonEndTime: { not: null },
        OR: [
          { lessonStartTime: currentTime },
          { lessonEndTime: { in: endCandidates } },
        ],
      },
      select: {
        id: true,
        name: true,
        branchId: true,
        companyId: true,
        lessonStartTime: true,
        lessonEndTime: true,
        startDate: true,
        endDate: true,
        exactDays: true,
        room: { select: { name: true } },
        teachers: {
          where: {
            teacher: {
              deletedAt: null,
              isActive: true,
              status: UserStatus.ACTIVE,
            },
          },
          select: {
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                telegramChatId: true,
              },
            },
          },
        },
      },
    });

    const scheduled = groups.filter((group) =>
      this.groupHasLessonToday(group, parsedDate, weekdayIdx),
    );
    if (scheduled.length === 0) return;

    // Read once for the whole tick, not per group.
    const stillMeeting = await this.groupsStillMeeting(scheduled, today);

    // Cache holidays per branch so each branch is looked up once per tick
    const holidaysByBranch = new Map<number, boolean>();

    for (const group of scheduled) {
      try {
        // A lesson cancelled or moved away from today: nothing to remind of,
        // and an alert for it could never be acted on.
        if (!stillMeeting.has(group.id)) continue;

        // Check if this branch has a holiday today
        if (!holidaysByBranch.has(group.branchId)) {
          const isHoliday =
            !!(await this.holidaysService.findActiveHolidayCovering(
              parsedDate,
              group.branchId,
            ));
          holidaysByBranch.set(group.branchId, isHoliday);
        }

        if (holidaysByBranch.get(group.branchId)) continue;

        await this.handleGroup(
          group as unknown as GroupWithTeachers,
          currentMinutes,
          today,
        );
      } catch (err) {
        this.logger.error(
          `handleGroup failed for group ${group.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  /** 23:00 every day, Sundays included: whatever the half-hourly ticks missed. */
  @Cron('0 0 23 * * *', { timeZone: 'Asia/Tashkent' })
  async closeDay() {
    await this.sweepEndedLessons();
  }

  private async sweepEndedLessons() {
    let opened: Awaited<
      ReturnType<UnmarkedLessonsService['openForEndedLessons']>
    > = [];
    try {
      opened = await this.unmarkedLessons.openForEndedLessons();
    } catch (err) {
      this.logger.error(
        `Unmarked-lesson sweep failed: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }
    for (const lesson of opened) {
      try {
        const group = await this.prisma.group.findUnique({
          where: { id: lesson.groupId },
          select: {
            id: true,
            name: true,
            branchId: true,
            companyId: true,
            lessonStartTime: true,
            lessonEndTime: true,
            startDate: true,
            endDate: true,
            exactDays: true,
            room: { select: { name: true } },
            teachers: {
              where: {
                teacher: {
                  deletedAt: null,
                  isActive: true,
                  status: UserStatus.ACTIVE,
                },
              },
              select: {
                teacher: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    telegramChatId: true,
                  },
                },
              },
            },
          },
        });
        if (!group) continue;
        const shown = {
          ...group,
          lessonStartTime: lesson.startTime,
          lessonEndTime: lesson.endTime,
        } as unknown as GroupWithTeachers;
        for (const t of shown.teachers) {
          await this.sendMissingToTeacher(t.teacher, shown);
        }
        await this.notifyBranchAdmins(shown, 'MISSING');
      } catch (err) {
        this.logger.error(
          `Lesson-end messages failed for ${lesson.groupId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /**
   * Returns the earliest lessonStartTime and latest lessonEndTime across all
   * active groups, in minutes since midnight. Cached for WINDOW_TTL_MS so tick()
   * rarely hits the DB just to decide whether to run. Returns null when no
   * active groups exist — tick() then exits without touching any other table.
   *
   * MIN/MAX on HH:MM text is chronologically correct because hours are
   * zero-padded, so lexical order matches numeric order.
   */
  private async getScheduleWindow(): Promise<{
    startMin: number;
    endMin: number;
  } | null> {
    const now = Date.now();
    if (
      this.scheduleWindow !== null &&
      now - this.windowCachedAt < this.WINDOW_TTL_MS
    ) {
      return this.scheduleWindow;
    }

    const agg = await this.prisma.group.aggregate({
      where: {
        statusEnum: GroupStatus.ACTIVE,
        deletedAt: null,
        lessonStartTime: { not: null },
        lessonEndTime: { not: null },
      },
      _min: { lessonStartTime: true },
      _max: { lessonEndTime: true },
    });

    this.windowCachedAt = now;
    const minStart = agg._min?.lessonStartTime;
    const maxEnd = agg._max?.lessonEndTime;

    if (!minStart || !maxEnd) {
      this.scheduleWindow = null;
      return null;
    }

    this.scheduleWindow = {
      startMin: this.parseTime(minStart),
      endMin: this.parseTime(maxEnd),
    };
    return this.scheduleWindow;
  }

  /**
   * Which of `groups` still have their lesson on `today`: the lesson-end
   * sweep's own rule (`lessonsOn`) over the day's live cancellations and
   * moves, which the reminder part of `tick` used to ignore. Holidays are
   * judged per branch by the caller.
   */
  private async groupsStillMeeting(
    groups: SweepGroup[],
    today: string,
  ): Promise<Set<string>> {
    const date = new Date(`${today}T00:00:00.000Z`);
    const groupId = { in: groups.map((g) => g.id) };
    const [reschedules, cancellations] = await Promise.all([
      this.prisma.lessonReschedule.findMany({
        where: {
          groupId,
          deletedAt: null,
          OR: [{ originalDate: date }, { newDate: date }],
        },
        select: {
          groupId: true,
          originalDate: true,
          newDate: true,
          newLessonStartTime: true,
          newLessonEndTime: true,
        },
      }),
      this.prisma.lessonCancellation.findMany({
        where: { groupId, deletedAt: null, date },
        select: { groupId: true },
      }),
    ]);
    return new Set(
      lessonsOn({
        dayStr: today,
        groups,
        reschedules,
        cancelledGroupIds: new Set(cancellations.map((c) => c.groupId)),
        isHoliday: () => false,
      }).map((lesson) => lesson.groupId),
    );
  }

  private groupHasLessonToday(
    group: {
      startDate: Date | null;
      endDate: Date | null;
      exactDays: string[];
    },
    date: Date,
    weekdayIdx: number,
  ): boolean {
    if (group.startDate && date < group.startDate) return false;
    if (group.endDate && date > group.endDate) return false;
    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d.toLowerCase()])
      .filter((d) => d !== undefined);
    return scheduleDays.includes(weekdayIdx);
  }

  private parseTime(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  private buildDetailsBlock(group: GroupWithTeachers): string {
    const teacherNames =
      group.teachers
        .map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`)
        .join(', ') || 'belgilanmagan';
    const roomName = group.room?.name ?? 'belgilanmagan';
    return (
      `👥 Guruh: ${group.name}\n` +
      `🕐 Vaqt: ${group.lessonStartTime}–${group.lessonEndTime}\n` +
      `🚪 Xona: ${roomName}\n` +
      `👨‍🏫 O'qituvchi: ${teacherNames}`
    );
  }

  private async handleGroup(
    group: GroupWithTeachers,
    currentMinutes: number,
    today: string,
  ) {
    const startMin = this.parseTime(group.lessonStartTime);
    const endMin = this.parseTime(group.lessonEndTime);
    const isStart = currentMinutes === startMin;
    if (!isStart && currentMinutes !== endMin - 30) return;

    // A register already taken (the lead opens it before the start) leaves
    // nothing to remind of — and a reminder nobody can act on would wait in
    // the bell for ever (spec 2026-10-07 §8).
    const parsedDate = new Date(today + 'T00:00:00.000Z');
    const hasAttendance = await this.prisma.attendance.findFirst({
      where: { groupId: group.id, date: parsedDate },
      select: { id: true },
    });
    if (hasAttendance) return;

    if (isStart) {
      for (const t of group.teachers) {
        await this.sendLessonStarted(t.teacher, group);
      }
      return;
    }
    for (const t of group.teachers) {
      await this.sendTeacherWarning(t.teacher, group);
    }
    await this.notifyBranchAdmins(group, 'ADMIN_ALERT');
  }

  private async sendLessonStarted(
    teacher: TeacherRef,
    group: GroupWithTeachers,
  ) {
    const type = NotificationType.LESSON_STARTED;
    if (await this.alreadySent(teacher.id, type, group.id)) return;
    const details = this.buildDetailsBlock(group);
    await this.deliver(
      teacher,
      group,
      type,
      'Dars boshlandi',
      `📚 Darsingiz boshlandi\n\n${details}\n\nIltimos, davomatni belgilashni unutmang.\n🔗 ${TEACHER_PORTAL_URL}`,
    );
  }

  private async sendTeacherWarning(
    teacher: TeacherRef,
    group: GroupWithTeachers,
  ) {
    const type = NotificationType.ATTENDANCE_TEACHER_WARNING;
    if (await this.alreadySent(teacher.id, type, group.id)) return;
    const details = this.buildDetailsBlock(group);
    await this.deliver(
      teacher,
      group,
      type,
      'Davomat eslatmasi',
      `⏰ Dars tugashiga 30 daqiqa qoldi\n\n${details}\n\nDavomat dars tugaguncha olinmasa, bu dars uchun haq yozilmaydi.\n🔗 ${TEACHER_PORTAL_URL}`,
    );
  }

  private async sendMissingToTeacher(
    teacher: TeacherRef,
    group: GroupWithTeachers,
  ) {
    const type = NotificationType.ATTENDANCE_MISSING_TEACHER;
    if (await this.alreadySent(teacher.id, type, group.id)) return;
    const details = this.buildDetailsBlock(group);
    await this.deliver(
      teacher,
      group,
      type,
      'Davomat olinmadi',
      `📝 Darsingiz tugadi, davomat olinmadi\n\n${details}\n\nBu dars uchun haq yozilmaydi. Dars bo'lgan-bo'lmaganini administrator belgilaydi.\n🔗 ${TEACHER_PORTAL_URL}`,
    );
  }

  private async notifyBranchAdmins(
    group: GroupWithTeachers,
    kind: 'ADMIN_ALERT' | 'MISSING',
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        companyId: group.companyId,
        branches: { some: { branchId: group.branchId } },
        roles: { some: { role: { name: 'Administrator' } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        telegramChatId: true,
      },
    });
    if (admins.length === 0) return;

    const details = this.buildDetailsBlock(group);

    const type =
      kind === 'ADMIN_ALERT'
        ? NotificationType.ATTENDANCE_ADMIN_ALERT
        : NotificationType.ATTENDANCE_MISSING_ADMIN;
    // ADMIN_ALERT (CEO-approved text, 01.10): a register not taken before
    // the end earns the teacher nothing for the lesson (ADR-0054), so the
    // administrator is asked to warn the teacher.
    const title =
      kind === 'ADMIN_ALERT'
        ? "O'qituvchi hali davomat olmadi"
        : 'Davomat olinmadi';
    const message =
      kind === 'ADMIN_ALERT'
        ? `👀 Dars tugashiga 30 daqiqa qoldi, o'qituvchi hali davomat olmadi\n\n${details}\n\nDars tugaguncha davomat olinmasa, ustozga bu dars uchun haq yozilmaydi. Iltimos, o'qituvchini ogohlantiring.\n🔗 ${ADMIN_PORTAL_URL}`
        : `📋 Dars tugadi, davomat olinmadi\n\n${details}\n\nTizimda topshiriq ochildi: dars bo'ldimi? «Bo'ldi» bo'lsa, kim kelganini belgilang.\n🔗 ${ADMIN_PORTAL_URL}/tasks`;

    for (const admin of admins) {
      if (await this.alreadySent(admin.id, type, group.id)) continue;
      await this.deliver(admin, group, type, title, message);
    }
  }

  private async alreadySent(
    userId: number,
    type: NotificationType,
    groupId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        type,
        relatedEntityType: 'Group',
        relatedEntityId: groupId,
        createdAt: { gte: this.startOfTashkentDay() },
      },
      select: { id: true },
    });
    return !!existing;
  }

  private startOfTashkentDay(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const p = (t: string) => parts.find((x) => x.type === t)!.value;
    return new Date(`${p('year')}-${p('month')}-${p('day')}T00:00:00+05:00`);
  }

  private async deliver(
    user: Pick<TeacherRef, 'id' | 'telegramChatId'>,
    group: { id: string; companyId: number },
    type: NotificationType,
    title: string,
    message: string,
  ) {
    const notification = await this.notificationsService.create({
      userId: user.id,
      type,
      title,
      message,
      relatedEntityType: 'Group',
      relatedEntityId: group.id,
      companyId: group.companyId,
    });

    this.gateway.sendToUser(user.id, { type: 'notification', notification });

    try {
      await this.pushService.sendToUser(user.id, {
        title,
        body: message,
        url: `/groups/${group.id}`,
      });
    } catch (err) {
      this.logger.warn(
        `Push send failed for user ${user.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (user.telegramChatId) {
      try {
        const bot = this.telegramService.getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            user.telegramChatId,
            `<b>${title}</b>\n${message}`,
            { parse_mode: 'HTML' },
          );
        }
      } catch (err) {
        this.logger.warn(
          `Telegram send failed for user ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
