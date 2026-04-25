import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  GroupStatus,
  HolidayStatus,
  NotificationType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';

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
 * relatedEntityId=groupId, today) blocks repeat sends. Cron fires each minute
 * Monday–Saturday (no lessons on Sunday). Before touching groups we compare
 * the current minute against a cached [earliestStart, latestEnd] window that's
 * derived from active groups and refreshed hourly — outside that window the
 * tick returns immediately with zero DB queries, letting the DB auto-suspend.
 *
 * When inside the window, the group query is narrowed to rows whose
 * lessonStartTime or lessonEndTime matches a trigger minute for *right now*
 * (start, end-30, end-15, end). In practice this returns 0-3 rows instead of
 * every active group, so most ticks perform a single indexed lookup.
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
  ) {}

  @Cron('0 * * * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick() {
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
    const currentMinutes = Number(p('hour')) * 60 + Number(p('minute'));
    const weekdayIdx = DAY_NAME_TO_JS[p('weekday').toLowerCase()];
    if (weekdayIdx === undefined) return;

    const window = await this.getScheduleWindow();
    if (!window) return;
    if (currentMinutes < window.startMin || currentMinutes > window.endMin)
      return;

    const parsedDate = new Date(today + 'T00:00:00.000Z');
    const currentTime = `${p('hour')}:${p('minute')}`;
    const endCandidates = [
      currentTime,
      this.addMinutes(currentTime, 15),
      this.addMinutes(currentTime, 30),
    ];

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

    if (groups.length === 0) return;

    const isHoliday = !!(await this.prisma.holiday.findFirst({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: parsedDate,
      },
      select: { id: true },
    }));
    if (isHoliday) return;

    for (const group of groups) {
      try {
        if (!this.groupHasLessonToday(group, parsedDate, weekdayIdx)) continue;
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

    if (currentMinutes === startMin) {
      for (const t of group.teachers) {
        await this.sendLessonStarted(t.teacher, group);
      }
      return;
    }

    if (![endMin - 30, endMin - 15, endMin].includes(currentMinutes)) return;

    const parsedDate = new Date(today + 'T00:00:00.000Z');
    const hasAttendance = await this.prisma.attendance.findFirst({
      where: { groupId: group.id, date: parsedDate },
      select: { id: true },
    });
    if (hasAttendance) return;

    if (currentMinutes === endMin - 30) {
      await this.notifyBranchAdmins(group, 'ADMIN_ALERT');
      return;
    }

    if (currentMinutes === endMin - 15) {
      for (const t of group.teachers) {
        await this.sendTeacherWarning(t.teacher, group);
      }
      return;
    }

    // currentMinutes === endMin
    for (const t of group.teachers) {
      await this.sendMissingToTeacher(t.teacher, group);
    }
    await this.notifyBranchAdmins(group, 'MISSING');
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
      `⏰ Dars tugashiga 15 daqiqa qoldi\n\n${details}\n\nIltimos, davomatni belgilashni unutmang.\n🔗 ${TEACHER_PORTAL_URL}`,
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
      'Davomat belgilanmadi',
      `📝 Darsingiz tugadi, ammo davomat belgilanmadi\n\n${details}\n\nIltimos, administrator bilan bog'lanib, davomatni tiklashingizni so'raymiz.\n🔗 ${TEACHER_PORTAL_URL}`,
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
    const title =
      kind === 'ADMIN_ALERT'
        ? "O'qituvchiga eslatib qo'ying"
        : 'Davomat belgilanmadi';
    const message =
      kind === 'ADMIN_ALERT'
        ? `👀 Dars tugashiga 30 daqiqa qoldi, o'qituvchi hali davomatni belgilamadi\n\n${details}\n\nIltimos, o'qituvchiga eslatib qo'yishingizni so'raymiz.\n🔗 ${ADMIN_PORTAL_URL}`
        : `📋 O'qituvchi davomatni belgilamadi\n\n${details}\n\nIltimos, davomatni qo'lda tiklashingizni so'raymiz.\n🔗 ${ADMIN_PORTAL_URL}`;

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
