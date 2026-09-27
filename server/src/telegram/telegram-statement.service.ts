import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatementService } from '../statements/statement.service';
import {
  classifyTelegramError,
  describeError,
} from '../telegram-digest/telegram-send';
import { statementForChat } from './flows/statement-flow';
import { TelegramService } from './telegram.service';

export const BOT_OFF_MESSAGE =
  "Telegram bot hozir ishlamayapti. Keyinroq qayta urinib ko'ring.";
export const CHAT_NOT_LINKED_MESSAGE =
  "Telegram hisobingiz bog'lanmagan. Botdagi «💳 To'lovlar» orqali bog'lang.";
export const CHAT_UNREACHABLE_MESSAGE =
  "Bot sizga yoza olmadi. Botni ochib /start bosing va qayta urinib ko'ring.";
export const SEND_FAILED_MESSAGE =
  "Hisobotni Telegram'ga yuborib bo'lmadi. Keyinroq qayta urinib ko'ring.";

/**
 * Sends a student's payment statement to the Telegram chat linked to their
 * card — the same message and PDF the bot's «💳 To'lovlar» sends. The Mini
 * App's button uses it: Telegram's WebView cannot save a file, the chat can.
 *
 * The chat is `Student.telegramChatId`, the one the Mini App signs in with
 * (ADR-0040), so the file lands where the student tapped.
 */
@Injectable()
export class TelegramStatementService {
  private readonly logger = new Logger(TelegramStatementService.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
    private readonly statements: StatementService,
  ) {}

  async sendToLinkedChat(studentId: number, companyId: number): Promise<void> {
    const bot = this.telegram.getBot();
    if (!bot) throw new ServiceUnavailableException(BOT_OFF_MESSAGE);

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { telegramChatId: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    const chatId = student.telegramChatId;
    if (!chatId) throw new ConflictException(CHAT_NOT_LINKED_MESSAGE);

    const { text, document } = await statementForChat(
      this.statements,
      studentId,
      companyId,
    );
    try {
      await bot.telegram.sendMessage(chatId, text);
      await bot.telegram.sendDocument(chatId, document);
    } catch (error) {
      // Blocked, deleted or never started: only the student can fix it.
      if (classifyTelegramError(error).kind === 'permanent') {
        throw new ConflictException(CHAT_UNREACHABLE_MESSAGE);
      }
      this.logger.error(
        `Statement for student ${studentId} not sent to Telegram: ${describeError(error)}`,
      );
      throw new BadGatewayException(SEND_FAILED_MESSAGE);
    }
  }
}
