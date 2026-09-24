import { Injectable, Logger } from '@nestjs/common';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { truncateChars } from '../common/utils/text.util';
import { AuditEntry } from './telegram-digest-render.service';
import { describeError } from './telegram-send';

export type AuditOutcome =
  | { status: 'SENT'; telegramMessageId: number }
  | { status: 'FAILED'; errorMessage: string };

/**
 * Undoes `escapeHtml` for storage. The SMS tab escapes stored text before
 * rendering, so a stored `&amp;` would show literally. `&amp;` goes last, so
 * an escaped literal "&lt;" in the source text survives as "&lt;".
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Leaves the same trail per student message that `SmsService.sendToStudent`
 * leaves (sms.service.ts:94-121 — kept untouched): an `SmsMessage` row for the
 * profile "SMS" tab and a history entry. One row per event, written when the
 * digest actually went out (ADR-0025). Audit failures are logged, never thrown:
 * a missing audit row must not make the cron resend a delivered message.
 */
@Injectable()
export class TelegramDigestAuditService {
  private readonly logger = new Logger(TelegramDigestAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  async record(
    studentId: number,
    entries: AuditEntry[],
    outcome: AuditOutcome,
  ): Promise<void> {
    const sent = outcome.status === 'SENT';
    for (const entry of entries) {
      try {
        await this.prisma.smsMessage.create({
          data: {
            studentId,
            content: decodeHtmlEntities(entry.content),
            type: SmsMessageType.AUTO,
            status: outcome.status,
            senderUserId: entry.senderUserId,
            telegramMessageId: sent ? outcome.telegramMessageId : null,
            errorMessage: sent ? null : outcome.errorMessage,
            companyId: entry.companyId,
          },
        });
        await this.entityHistory.recordCreate({
          entityType: 'Student',
          entityId: studentId,
          newValues: {
            action: sent ? 'SMS_YUBORILDI' : 'SMS_YUBORILMADI',
            tur: 'Avtomatik',
            // Strip tags first (on the escaped text), then decode, so a
            // literal "<B>" typed by an admin survives as text.
            xabar: truncateChars(
              decodeHtmlEntities(entry.content.replace(/<[^>]*>/g, '')),
              100,
            ),
            holat: sent ? 'Yuborildi' : outcome.errorMessage,
          },
          changedById: entry.senderUserId ?? undefined,
          companyId: entry.companyId,
        });
      } catch (err) {
        this.logger.warn(
          `Digest audit write failed for student ${studentId}: ${describeError(err)}`,
        );
      }
    }
  }
}
