import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

const STUDENT_PORTAL_URL = 'https://student.dafzentrum.uz';

export interface AttendanceStudentRecordedPayload {
  studentId: number;
  groupId: string;
  groupName: string;
  date: string;
  oldStatus: AttendanceStatus | null;
  newStatus: AttendanceStatus;
  companyId: number;
}

interface MessageContext {
  status: AttendanceStatus;
  studentName: string;
  groupName: string;
  teacherNames: string[];
  roomName: string | null;
  lessonNumber: number | null;
  totalLessons: number | null;
  date: string;
  lessonStartTime: string | null;
  lessonEndTime: string | null;
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
      select: { firstName: true, lastName: true, telegramChatId: true },
    });
    if (!student?.telegramChatId) return;

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        lessonStartTime: true,
        lessonEndTime: true,
        room: { select: { name: true } },
        course: { select: { lessonPaymentCount: true } },
        teachers: {
          select: {
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    // Lesson number = how many lessons this student has had (or missed) in
    // this group up to and including today. Counted per-student so a student
    // who joined mid-cycle sees their own progress, not the group's.
    const parsedDate = new Date(date + 'T00:00:00.000Z');
    const lessonNumber = await this.prisma.attendance.count({
      where: { studentId, groupId, date: { lte: parsedDate } },
    });

    const text = buildMessage({
      status: newStatus,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      groupName,
      teacherNames:
        group?.teachers.map((t) =>
          `${t.teacher.firstName} ${t.teacher.lastName}`.trim(),
        ) ?? [],
      roomName: group?.room?.name ?? null,
      lessonNumber: lessonNumber > 0 ? lessonNumber : null,
      totalLessons: group?.course?.lessonPaymentCount ?? null,
      date,
      lessonStartTime: group?.lessonStartTime ?? null,
      lessonEndTime: group?.lessonEndTime ?? null,
    });

    try {
      await bot.telegram.sendMessage(student.telegramChatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      this.logger.warn(
        `Telegram send failed for student ${studentId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function buildMessage(ctx: MessageContext): string {
  const heading = headingFor(ctx.status, ctx.studentName);
  const lines: string[] = [heading, ''];

  lines.push(`📚 <b>Guruh:</b> ${ctx.groupName}`);

  if (ctx.teacherNames.length > 0) {
    const label = ctx.teacherNames.length > 1 ? 'Ustozlar' : 'Ustoz';
    lines.push(`👨‍🏫 <b>${label}:</b> ${ctx.teacherNames.join(', ')}`);
  }

  if (ctx.roomName) {
    lines.push(`🚪 <b>Xona:</b> ${ctx.roomName}`);
  }

  if (ctx.lessonNumber !== null) {
    const total = ctx.totalLessons ? ` / ${ctx.totalLessons}` : '';
    lines.push(`📊 <b>Dars:</b> ${ctx.lessonNumber}${total}`);
  }

  lines.push(`📅 <b>Sana:</b> ${formatDate(ctx.date)}${formatTime(ctx)}`);

  if (ctx.status === AttendanceStatus.ABSENT) {
    lines.push('');
    lines.push("Agar bu xatolik bo'lsa, o'qituvchingiz bilan bog'laning.");
  }

  lines.push('');
  lines.push(`🔗 Profilingiz: ${STUDENT_PORTAL_URL}`);

  return lines.join('\n');
}

function headingFor(status: AttendanceStatus, studentName: string): string {
  const greeting = studentName ? `Hurmatli ${studentName}!` : null;
  if (status === AttendanceStatus.PRESENT) {
    return [
      greeting,
      greeting ? '' : null,
      '<b>✅ Bugungi darsga keldingiz</b>',
    ]
      .filter((l) => l !== null)
      .join('\n');
  }
  if (status === AttendanceStatus.LATE) {
    return [
      greeting,
      greeting ? '' : null,
      '<b>⏰ Bugungi darsga kech keldingiz</b>',
    ]
      .filter((l) => l !== null)
      .join('\n');
  }
  return [
    greeting,
    greeting ? '' : null,
    '<b>❌ Bugungi darsda ishtirok etmadingiz</b>',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

function formatTime(ctx: MessageContext): string {
  if (!ctx.lessonStartTime) return '';
  if (ctx.lessonEndTime) {
    return `, soat ${ctx.lessonStartTime}–${ctx.lessonEndTime}`;
  }
  return `, soat ${ctx.lessonStartTime}`;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}
