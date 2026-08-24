import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TelegramService } from './telegram.service';

interface MockParticipantPaidEvent {
  telegramChatId: string | null;
  publicId: number;
  examTitle: string;
  feeAmount: number;
}

/**
 * Listens for `mock.participant.paid` (emitted by
 * MockExamParticipantsService.markPaid when an admin accepts a payment) and
 * confirms to the participant on Telegram. Skips participants without a
 * chat id (manual/admin-added entries). Lives in TelegramModule to avoid a
 * circular import (MockExamsModule doesn't depend on TelegramService).
 */
@Injectable()
export class MockExamPaidListener {
  private readonly logger = new Logger(MockExamPaidListener.name);

  constructor(private readonly telegramService: TelegramService) {}

  @OnEvent('mock.participant.paid')
  async onPaid(payload: MockParticipantPaidEvent) {
    if (!payload.telegramChatId) return;

    const lines = [
      "✅ To'lovingiz qabul qilindi!",
      '',
      `📋 Imtihon: <b>${escapeHtml(payload.examTitle)}</b>`,
      `🆔 Identifikator: <b>${payload.publicId}</b>`,
    ];
    if (payload.feeAmount > 0) {
      lines.push(
        `💰 Summa: <b>${payload.feeAmount.toLocaleString('uz-UZ')} so'm</b>`,
      );
    }
    lines.push(
      '',
      "Ro'yxatingiz tasdiqlandi. Imtihonda muvaffaqiyat tilaymiz!",
    );

    try {
      await this.telegramService
        .getBot()
        .telegram.sendMessage(payload.telegramChatId, lines.join('\n'), {
          parse_mode: 'HTML',
        });
    } catch (err) {
      this.logger.warn(
        `Failed to send mock paid confirmation to ${payload.telegramChatId}: ${(err as Error).message}`,
      );
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
