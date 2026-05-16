import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttendanceStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import type { AttendanceStudentRecordedPayload } from '../attendance/student-attendance-notification.listener';

const STUDENT_PORTAL_URL = 'https://student.dafzentrum.uz';

/**
 * Sends a per-attendance Telegram nudge to the student when the attendance
 * just taken left their balance in the red — i.e. the billing layer wrote
 * a SINGLE_UNCOVERED LESSON_DEDUCTION for that attendance.
 *
 * We piggy-back on the same `attendance.student.recorded` event the
 * attendance notification listener uses: it fires post-commit, so the
 * SINGLE_UNCOVERED row (and the updated student balance) is visible by
 * the time we query.
 */
@Injectable()
export class StudentDebtNotificationListener {
  private readonly logger = new Logger(StudentDebtNotificationListener.name);

  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
  ) {}

  @OnEvent('attendance.student.recorded')
  async handle(payload: AttendanceStudentRecordedPayload) {
    const { studentId, groupId, groupName, date, newStatus } = payload;

    // Only attendance statuses that trigger billing can produce debt.
    if (
      newStatus !== AttendanceStatus.PRESENT &&
      newStatus !== AttendanceStatus.LATE &&
      newStatus !== AttendanceStatus.ABSENT
    ) {
      return;
    }

    // Find the SINGLE_UNCOVERED deduction for this exact attendance, if any.
    // We can't look up the attendance by `(groupId, studentId, date)`
    // straight away — we need its UUID. Cheap nested query.
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        groupId,
        studentId,
        date: new Date(date + 'T00:00:00.000Z'),
      },
      select: { id: true },
    });
    if (!attendance) return;

    const uncovered = await this.prisma.transaction.findFirst({
      where: {
        attendanceId: attendance.id,
        studentId,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
      },
      select: { metadata: true },
    });
    if (!uncovered) return;

    const bot = this.telegramService.getBot();
    if (!bot) return;

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        balance: true,
        telegramChatId: true,
      },
    });
    if (!student?.telegramChatId) return;

    const md = (uncovered.metadata ?? {}) as Record<string, unknown>;
    const perLessonCost = Number(md.perLessonCost ?? 0);
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const debt = student.balance < 0 ? -student.balance : 0;

    const text = buildDebtMessage({
      studentName,
      groupName,
      perLessonCost,
      debt,
      date,
    });

    try {
      await bot.telegram.sendMessage(student.telegramChatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      this.logger.warn(
        `Telegram debt notification failed for student ${studentId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function buildDebtMessage(ctx: {
  studentName: string;
  groupName: string;
  perLessonCost: number;
  debt: number;
  date: string;
}): string {
  const lines: string[] = [];
  if (ctx.studentName) {
    lines.push(`Hurmatli ${ctx.studentName}!`);
    lines.push('');
  }
  lines.push('<b>⚠️ Balansingiz yetarli emas</b>');
  lines.push('');
  lines.push(
    'Bugungi darsda davomat olindi, ammo balansingizda yetarli mablag‘ yo‘q edi. Shu sababli dars narxi qarzga yozildi.',
  );
  lines.push('');
  lines.push(`📚 <b>Guruh:</b> ${ctx.groupName}`);
  lines.push(`📅 <b>Sana:</b> ${formatDate(ctx.date)}`);
  if (ctx.perLessonCost > 0) {
    lines.push(`💰 <b>Dars narxi:</b> ${formatPrice(ctx.perLessonCost)} so‘m`);
  }
  lines.push(`📉 <b>Hozirgi qarz:</b> ${formatPrice(ctx.debt)} so‘m`);
  lines.push('');
  lines.push('Iltimos, balansingizni to‘ldiring.');
  lines.push('');
  lines.push(`🔗 Profilingiz: ${STUDENT_PORTAL_URL}`);
  return lines.join('\n');
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

function formatPrice(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
