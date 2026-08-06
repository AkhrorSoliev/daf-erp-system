import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { EntityHistoryService } from '../common/entity-history';
import { SmsMessageType } from '@prisma/client';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * @param opts.assertCallerBranch confine `senderUserId` to the student's
   * branch. **Opt-in on purpose.** Six of the seven callers are event
   * listeners — payment received, lesson cancelled, lesson rescheduled — where
   * `senderUserId` is whoever triggered the underlying action and the message
   * is the system telling the student what happened to their own lesson. Only
   * `POST /students/:id/sms` is a human typing free text at a student they
   * chose, and only that one passes the flag. Inferring the check from
   * `companyId != null` would have caught the listeners too and silenced a
   * cancellation notice whenever an admin cancelled across branches.
   */
  async sendToStudent(
    studentId: number,
    content: string,
    type: SmsMessageType,
    senderUserId?: number,
    companyId?: number,
    opts?: { assertCallerBranch?: boolean },
  ) {
    // A free-text message to a student the caller picked. Sending one to
    // another branch's student is contact with someone else's customer, under
    // this centre's name, and the student has no way to tell it apart from
    // their own branch writing to them.
    if (opts?.assertCallerBranch && companyId != null) {
      await assertCallerMayTouchStudent(
        this.prisma,
        senderUserId,
        studentId,
        companyId,
      );
    }

    // When a companyId is provided (admin-initiated SMS), verify the student
    // belongs to that company — otherwise refuse without leaking existence.
    // Cron/system callers omit companyId and fall back to audit-friendly
    // behaviour: missing student → SMS saved with FAILED status.
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        ...(companyId != null && { companyId }),
      },
      select: { telegramChatId: true },
    });
    if (!student && companyId != null) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    const chatId = student?.telegramChatId;

    let status: 'SENT' | 'FAILED' = 'FAILED';
    let telegramMessageId: number | null = null;
    let errorMessage: string | null = null;

    if (!chatId) {
      errorMessage = "Telegram bog'lanmagan";
    } else {
      try {
        const bot = this.telegramService.getBot();
        if (!bot) {
          errorMessage = 'Telegram bot ishlamayapti';
        } else {
          const result = await bot.telegram.sendMessage(chatId, content, {
            parse_mode: 'HTML',
          });
          status = 'SENT';
          telegramMessageId = result.message_id;
        }
      } catch (error) {
        this.logger.warn(
          `Telegram send failed for student ${studentId}: ${error.message}`,
        );
        errorMessage = error.message;
      }
    }

    const sms = await this.prisma.smsMessage.create({
      data: {
        studentId,
        content,
        type,
        status,
        senderUserId: senderUserId ?? null,
        telegramMessageId,
        errorMessage,
        companyId: companyId ?? null,
      },
    });

    await this.entityHistoryService.recordCreate({
      entityType: 'Student',
      entityId: studentId,
      newValues: {
        action: status === 'SENT' ? 'SMS_YUBORILDI' : 'SMS_YUBORILMADI',
        tur: type === 'AUTO' ? 'Avtomatik' : "Qo'lda",
        xabar: content.replace(/<[^>]*>/g, '').slice(0, 100),
        holat: status === 'SENT' ? 'Yuborildi' : errorMessage,
      },
      changedById: senderUserId,
      companyId: companyId,
    });

    return sms;
  }

  /**
   * The message log is the record of every contact this centre has made with
   * the student, free text included. `callerId` is optional only because the
   * signature predates the check; the one route that reaches it always passes
   * one.
   */
  async getByStudent(
    studentId: number,
    companyId: number,
    page = 1,
    pageSize = 20,
    callerId?: number,
  ) {
    await assertCallerMayTouchStudent(
      this.prisma,
      callerId,
      studentId,
      companyId,
    );
    const skip = (page - 1) * pageSize;

    const where = { studentId, companyId };

    const [data, total] = await Promise.all([
      this.prisma.smsMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          senderUser: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.smsMessage.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
