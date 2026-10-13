import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceStatus, LessonRatingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { SettingsService } from '../settings/settings.service';
import { TelegramService } from '../telegram/telegram.service';
import { loadEndedLessonsToday } from '../attendance/shared/load-ended-lessons';
import type { EndedLesson } from '../attendance/shared/ended-lessons';
import {
  describeError,
  sendTelegramText,
  type TelegramTextSender,
} from '../telegram-digest/telegram-send';
import { ratingKeyboard, ratingQuestion, shouldAskNow } from './rating-rules';

/**
 * Dars tugagach kelgan o'quvchidan baho so'raydi (spec 2026-10-13 §3, §5.1).
 * Qator xabardan OLDIN yoziladi: `@@unique([groupId, studentId, date])` ikki
 * parallel instansni bitta xabarga keltiradi. Telegram rad etsa — FAILED,
 * qayta urinilmaydi. Darhol yuboriladi (yangi ADR, ADR-0025 ro'yxatiga qo'shimcha).
 */
@Injectable()
export class LessonRatingSenderService {
  private readonly logger = new Logger(LessonRatingSenderService.name);

  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private settings: SettingsService,
    private telegram: TelegramService,
  ) {}

  @Cron('0 */10 7-22 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`lesson rating run failed: ${describeError(err)}`);
    }
  }

  /** Yuborilgan xabarlar soni. */
  async run(now: Date = new Date()): Promise<number> {
    const bot = this.telegram.getBot() as TelegramTextSender | undefined;
    if (!bot) return 0;
    const { today, nowMinutes, lessons } = await loadEndedLessonsToday(
      this.prisma,
      this.holidays,
      now,
    );
    const due = lessons.filter((l) => shouldAskNow(l.endTime, nowMinutes));
    const enabled = new Map<number, boolean>();
    let sent = 0;
    for (const lesson of due) {
      if (!enabled.has(lesson.companyId)) {
        enabled.set(
          lesson.companyId,
          await this.settings.get(lesson.companyId, 'lessonRating.enabled'),
        );
      }
      if (!enabled.get(lesson.companyId)) continue;
      try {
        sent += await this.askLesson(bot, lesson, today);
      } catch (err) {
        this.logger.error(
          `lesson rating for ${lesson.groupId} failed: ${describeError(err)}`,
        );
      }
    }
    return sent;
  }

  private async askLesson(
    bot: TelegramTextSender,
    lesson: EndedLesson,
    today: Date,
  ): Promise<number> {
    const attendees = await this.prisma.attendance.findMany({
      where: {
        groupId: lesson.groupId,
        date: today,
        status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        cancellationId: null,
        student: {
          deletedAt: null,
          telegramChatId: { not: null },
          telegramDisconnectedAt: null,
          lessonRatings: { none: { groupId: lesson.groupId, date: today } },
        },
      },
      select: {
        student: {
          select: { id: true, firstName: true, telegramChatId: true },
        },
      },
    });
    if (attendees.length === 0) return 0;

    const teacherIds = await this.lessonTeacherIds(lesson.groupId, today);
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { id: 'asc' },
    });
    const teacherNames = teachers.map((t) => `${t.firstName} ${t.lastName}`);

    let sent = 0;
    for (const { student } of attendees) {
      const chatId = student.telegramChatId;
      if (!chatId) continue;
      let ratingId: string;
      try {
        const row = await this.prisma.lessonRating.create({
          data: {
            companyId: lesson.companyId,
            branchId: lesson.branchId,
            groupId: lesson.groupId,
            studentId: student.id,
            date: today,
            teacherIds,
            chatId,
          },
          select: { id: true },
        });
        ratingId = row.id;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue; // boshqa instans olgan
        }
        throw err;
      }

      const outcome = await sendTelegramText(
        bot,
        chatId,
        ratingQuestion({
          studentFirstName: student.firstName,
          groupName: lesson.groupName,
          teacherNames,
        }),
        { parse_mode: 'HTML', reply_markup: ratingKeyboard(ratingId) },
      );
      if (outcome.ok) {
        await this.prisma.lessonRating.update({
          where: { id: ratingId },
          data: { messageId: outcome.messageId },
        });
        sent += 1;
      } else {
        await this.prisma.lessonRating.update({
          where: { id: ratingId },
          data: {
            status: LessonRatingStatus.FAILED,
            failReason: `${outcome.kind}: ${outcome.description}`,
          },
        });
      }
    }
    return sent;
  }

  /** Shu kungi o'rinbosar bo'lsa — uning ustozlari, aks holda guruh ustozlari. */
  private async lessonTeacherIds(
    groupId: string,
    date: Date,
  ): Promise<number[]> {
    const override = await this.prisma.lessonTeacherOverride.findFirst({
      where: { groupId, date, deletedAt: null },
      select: { teacherIds: true },
    });
    if (override) return override.teacherIds;
    const rows = await this.prisma.groupTeacher.findMany({
      where: { groupId },
      select: { teacherId: true },
    });
    return rows.map((r) => r.teacherId);
  }
}
