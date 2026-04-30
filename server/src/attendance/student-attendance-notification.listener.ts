import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

export interface AttendanceStudentRecordedPayload {
  studentId: number;
  groupId: string;
  groupName: string;
  date: string;
  oldStatus: AttendanceStatus | null;
  newStatus: AttendanceStatus;
  companyId: number;
}

@Injectable()
export class StudentAttendanceNotificationListener {
  private readonly logger = new Logger(
    StudentAttendanceNotificationListener.name,
  );

  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
  ) {}

  @OnEvent('attendance.student.recorded')
  async handle(payload: AttendanceStudentRecordedPayload) {
    const { studentId, groupId, groupName, date, newStatus } = payload;

    if (
      newStatus !== AttendanceStatus.PRESENT &&
      newStatus !== AttendanceStatus.LATE &&
      newStatus !== AttendanceStatus.ABSENT
    ) {
      return;
    }

    const bot = this.telegramService.getBot();
    if (!bot) return;

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { telegramChatId: true },
    });
    if (!student?.telegramChatId) return;

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { lessonStartTime: true },
    });

    const text = buildMessage({
      status: newStatus,
      groupName,
      date,
      lessonStartTime: group?.lessonStartTime ?? null,
    });

    try {
      await bot.telegram.sendMessage(student.telegramChatId, text, {
        parse_mode: 'HTML',
      });
    } catch (err) {
      this.logger.warn(
        `Telegram send failed for student ${studentId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function buildMessage(args: {
  status: AttendanceStatus;
  groupName: string;
  date: string;
  lessonStartTime: string | null;
}): string {
  const formattedDate = formatDate(args.date);
  const timeLine = args.lessonStartTime
    ? `📅 ${formattedDate}, soat ${args.lessonStartTime}`
    : `📅 ${formattedDate}`;

  if (args.status === AttendanceStatus.PRESENT) {
    return [
      '<b>✅ Darsga keldingiz</b>',
      '',
      `📚 ${args.groupName}`,
      timeLine,
    ].join('\n');
  }

  if (args.status === AttendanceStatus.LATE) {
    return [
      '<b>⏰ Darsga kech keldingiz</b>',
      '',
      `📚 ${args.groupName}`,
      timeLine,
    ].join('\n');
  }

  return [
    '<b>❌ Darsga kelmadingiz</b>',
    '',
    `📚 ${args.groupName}`,
    `📅 ${formattedDate}`,
    '',
    "Agar bu xatolik bo'lsa, o'qituvchingiz bilan bog'laning.",
  ].join('\n');
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}
