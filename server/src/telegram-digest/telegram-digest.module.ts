import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';
import { TelegramDigestQueueService } from './telegram-digest-queue.service';
import { TelegramDigestRenderService } from './telegram-digest-render.service';

/**
 * The daily Telegram digest (ADR-0025): the queue every event writes to, and
 * the 20:00 crons that drain it. `TelegramModule` provides the main bot, which
 * owns every personal chat id — the personal cron (Task 7) sends through it.
 * Importing it here is required: `TelegramModule` is not global, and without
 * it Nest fails at startup, which no unit test can catch.
 */
@Module({
  imports: [TelegramModule],
  providers: [
    TelegramDigestQueueService,
    TelegramDigestChatResolverService,
    TelegramDigestRenderService,
    TelegramDigestAuditService,
  ],
  exports: [TelegramDigestQueueService],
})
export class TelegramDigestModule {}
