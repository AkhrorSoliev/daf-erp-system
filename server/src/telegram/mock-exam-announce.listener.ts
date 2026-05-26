import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TelegramService } from './telegram.service';

interface MockExamAnnouncedEvent {
  examId: string;
}

/**
 * Listens for `mock-exam.announced` (emitted by MockExamsService once the
 * PDF has been (re)generated) and pushes the results PDF + each
 * participant's publicId to their Telegram chat.
 *
 * Lives in TelegramModule rather than MockExamsModule because of the
 * circular dependency direction — TelegramModule already imports
 * MockExamsModule and would create a cycle if we inverted it.
 */
@Injectable()
export class MockExamAnnounceListener {
  private readonly logger = new Logger(MockExamAnnounceListener.name);

  constructor(private readonly telegramService: TelegramService) {}

  @OnEvent('mock-exam.announced')
  async onAnnounced(payload: MockExamAnnouncedEvent) {
    try {
      const result = await this.telegramService.broadcastMockResults(
        payload.examId,
      );
      this.logger.log(
        `Broadcast for exam ${payload.examId}: sent=${result.sent} failed=${result.failed}`,
      );
    } catch (err) {
      this.logger.error(
        `broadcastMockResults failed for ${payload.examId}: ${(err as Error).message}`,
      );
    }
  }
}
