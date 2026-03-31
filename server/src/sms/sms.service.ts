import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { EntityHistoryService } from '../common/entity-history';
import { SmsMessageType } from '@prisma/client';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly entityHistoryService: EntityHistoryService,
  ) {}

  async sendToStudent(
    studentId: number,
    content: string,
    type: SmsMessageType,
    senderUserId?: number,
    companyId?: number,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { telegramChatId: true },
    });

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
        tur: type === 'AUTO' ? 'Avtomatik' : 'Qo\'lda',
        xabar: content.replace(/<[^>]*>/g, '').slice(0, 100),
        holat: status === 'SENT' ? 'Yuborildi' : errorMessage,
      },
      changedById: senderUserId,
      companyId: companyId,
    });

    return sms;
  }

  async getByStudent(studentId: number, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.smsMessage.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          senderUser: { select: { id: true, name: true } },
        },
      }),
      this.prisma.smsMessage.count({ where: { studentId } }),
    ]);

    return { data, total, page, pageSize };
  }
}
