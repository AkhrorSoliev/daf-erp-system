import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  classifyTelegramError,
  describeError,
} from '../telegram-digest/telegram-send';
import {
  JOIN_REQUEST_MESSAGE,
  type JoinRequestMessageEvent,
} from '../student-join-requests/join-request-events';
import { TelegramService } from './telegram.service';

/**
 * Sends a join request's decision to the person who asked (ADR-0080). A bot
 * flow, so it goes at once (ADR-0025's instant list; `src/telegram/` is on
 * `direct-send.guard.spec.ts`). Answers whether it was delivered: the
 * approval's toast says so when it was not. Log lines carry `describeError`
 * only — the approval text holds the password. A chat that cannot be reached
 * (blocked, deleted: `classifyTelegramError` calls it permanent) gets no text
 * retry and only a warning — the person's choice, not our fault.
 */
@Injectable()
export class JoinRequestNotifier {
  private readonly logger = new Logger(JoinRequestNotifier.name);

  constructor(private readonly telegram: TelegramService) {}

  @OnEvent(JOIN_REQUEST_MESSAGE)
  async send(e: JoinRequestMessageEvent): Promise<boolean> {
    const bot = this.telegram.getBot();
    if (!bot) return false;
    if (e.photo) {
      try {
        await bot.telegram.sendPhoto(e.chatId, e.photo, {
          caption: e.text,
          parse_mode: 'HTML',
        });
        return true;
      } catch (err) {
        if (isPermanent(err)) return this.undelivered(e.chatId, err);
        this.logger.warn(
          `So'rov xabari rasm bilan ketmadi, matn bilan yuboriladi (chat ${e.chatId}): ${describeError(err)}`,
        );
      }
    }
    try {
      await bot.telegram.sendMessage(e.chatId, e.text, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      return this.undelivered(e.chatId, err);
    }
  }

  private undelivered(chatId: string, err: unknown): false {
    const line = `So'rov xabari yetkazilmadi (chat ${chatId}): ${describeError(err)}`;
    if (isPermanent(err)) this.logger.warn(line);
    else this.logger.error(line);
    return false;
  }
}

const isPermanent = (err: unknown) =>
  classifyTelegramError(err).kind === 'permanent';
