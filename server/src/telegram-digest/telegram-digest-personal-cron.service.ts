import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { DIGEST_ROW_MAX_AGE_MS } from './telegram-digest.constants';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';
import {
  PersonalRecipientKind,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';
import {
  RenderedDigest,
  TelegramDigestRenderService,
} from './telegram-digest-render.service';
import { packBlocks } from './telegram-message-parts';
import {
  describeError,
  sendTelegramText,
  TelegramFailure,
  TelegramTextSender,
} from './telegram-send';

const PERSONAL_KINDS: TelegramDigestRecipientKind[] = [
  TelegramDigestRecipientKind.STUDENT,
  TelegramDigestRecipientKind.USER,
];

/**
 * Enrollment/removal notices leave a FAILED audit row when the student has no
 * Telegram — exactly what SmsService.sendToStudent does today. Receipts never
 * did (the old listener skipped students without a chat before sending).
 */
const AUDITED_WITHOUT_CHAT = new Set<TelegramDigestCategory>([
  TelegramDigestCategory.STUDENT_ENROLLED,
  TelegramDigestCategory.STUDENT_REMOVED,
]);

const SEND_OPTIONS = {
  parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
};

/**
 * Drains the personal (STUDENT + USER) half of the Telegram digest queue once
 * a day at 20:00 Asia/Tashkent (ADR-0025). No Sunday/holiday skip: a person
 * with nothing queued simply gets nothing. Each person is independent — one
 * failure never blocks the rest — and only rows read in this run are ever
 * deleted, so an event queued mid-run waits for tomorrow.
 */
@Injectable()
export class TelegramDigestPersonalCronService {
  private readonly logger = new Logger(TelegramDigestPersonalCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly chatResolver: TelegramDigestChatResolverService,
    private readonly render: TelegramDigestRenderService,
    private readonly audit: TelegramDigestAuditService,
  ) {}

  @Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })
  async flush(): Promise<void> {
    await this.purgeStale();

    const bot = this.telegramService.getBot();
    if (!bot) {
      this.logger.warn('Skipped personal digest — bot not initialized');
      return;
    }

    const rows = await this.prisma.telegramDigestItem.findMany({
      where: { recipientKind: { in: PERSONAL_KINDS } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const byRecipient = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.recipientKind}:${row.recipientId}`;
      byRecipient.set(key, [...(byRecipient.get(key) ?? []), row]);
    }

    let sent = 0;
    for (const recipientRows of byRecipient.values()) {
      const { recipientKind, recipientId } = recipientRows[0];
      try {
        sent += await this.flushRecipient(
          bot,
          recipientKind as PersonalRecipientKind,
          recipientId,
          recipientRows,
        );
      } catch (err) {
        this.logger.error(
          `Personal digest failed for ${recipientKind} ${recipientId}: ${describeError(err)}`,
        );
      }
    }
    this.logger.log(
      `Personal digest flush — ${sent} message(s) to ${byRecipient.size} recipient(s)`,
    );
  }

  /** Spec: any row older than 7 days goes, delivered or not — even with no bot. */
  private async purgeStale(): Promise<void> {
    try {
      const { count } = await this.prisma.telegramDigestItem.deleteMany({
        where: {
          recipientKind: { in: PERSONAL_KINDS },
          createdAt: { lt: new Date(Date.now() - DIGEST_ROW_MAX_AGE_MS) },
        },
      });
      if (count > 1) {
        this.logger.warn(
          `Personal digest: purged ${count} undelivered row(s) older than 7 days`,
        );
      }
    } catch (err) {
      this.logger.error(`Personal digest purge failed: ${describeError(err)}`);
    }
  }

  /** Returns the number of Telegram messages sent to this person. */
  private async flushRecipient(
    bot: TelegramTextSender,
    kind: PersonalRecipientKind,
    recipientId: number,
    rows: TelegramDigestItemRow[],
  ): Promise<number> {
    const readIds = rows.map((r) => r.id);
    const isStudent = kind === TelegramDigestRecipientKind.STUDENT;

    const chatId = await this.chatResolver.resolveChatId(kind, recipientId);
    if (!chatId) {
      if (isStudent) await this.auditMissingChat(recipientId, rows);
      await this.deleteRows(readIds);
      return 0;
    }

    const rendered = isStudent
      ? await this.render.renderStudent(recipientId, rows)
      : this.render.renderUser(rows);
    const parts = packBlocks(rendered.blocks);
    if (parts.length === 0) {
      await this.deleteRows(readIds);
      return 0;
    }

    const delivered = new Set<string>();
    for (const [index, part] of parts.entries()) {
      const outcome = await sendTelegramText(
        bot,
        chatId,
        part.text,
        SEND_OPTIONS,
      );
      if (!outcome.ok) {
        await this.handleFailure(
          kind,
          recipientId,
          readIds,
          rendered,
          delivered,
          outcome,
        );
        return index;
      }
      // Gone as soon as it is out: a later failure or a crash must never make
      // tomorrow's run send this part again.
      await this.deleteRows(part.itemIds);
      part.itemIds.forEach((id) => delivered.add(id));
      if (isStudent) {
        await this.audit.record(
          recipientId,
          rendered.audit.filter((a) => part.itemIds.includes(a.itemId)),
          { status: 'SENT', telegramMessageId: outcome.messageId },
        );
      }
    }

    // Everything else read for this person (the hidden rows) is done too.
    await this.deleteRows(readIds.filter((id) => !delivered.has(id)));
    return parts.length;
  }

  private async handleFailure(
    kind: PersonalRecipientKind,
    recipientId: number,
    readIds: string[],
    rendered: RenderedDigest,
    delivered: Set<string>,
    failure: TelegramFailure,
  ): Promise<void> {
    // Delivered parts were deleted as they went out. The hidden rows go too,
    // but only once the person actually received something from this run.
    const hidden = delivered.size > 0 ? rendered.hiddenIds : [];
    await this.deleteRows(hidden);
    const rest = readIds.filter(
      (id) => !delivered.has(id) && !hidden.includes(id),
    );
    const who = `${kind} ${recipientId}`;

    if (failure.kind === 'permanent') {
      if (kind === TelegramDigestRecipientKind.STUDENT) {
        await this.audit.record(
          recipientId,
          rendered.audit.filter((a) => !delivered.has(a.itemId)),
          { status: 'FAILED', errorMessage: failure.description },
        );
      }
      await this.deleteRows(rest);
      this.logger.warn(
        `Personal digest: ${who} unreachable (${failure.description}) — ${rest.length} row(s) dropped`,
      );
      return;
    }

    const message = `Personal digest: send to ${who} failed (${failure.kind}: ${failure.description}) — ${rest.length} row(s) kept for the next run`;
    if (failure.kind === 'content') this.logger.error(message);
    else this.logger.warn(message);
  }

  private async auditMissingChat(
    studentId: number,
    rows: TelegramDigestItemRow[],
  ): Promise<void> {
    const notices = rows.filter((r) => AUDITED_WITHOUT_CHAT.has(r.category));
    if (notices.length === 0) return;
    // A deleted student is not "unlinked" — leave no misleading audit row.
    const alive = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true },
    });
    if (!alive) return;
    const rendered = await this.render.renderStudent(studentId, notices);
    await this.audit.record(studentId, rendered.audit, {
      status: 'FAILED',
      errorMessage: "Telegram bog'lanmagan",
    });
  }

  /**
   * Deletes rows by id with one retry. Never throws: a row left behind by a DB
   * outage is at worst sent again tomorrow, which beats aborting the run for
   * everyone after this person.
   */
  private async deleteRows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.prisma.telegramDigestItem.deleteMany({
          where: { id: { in: ids } },
        });
        return;
      } catch (err) {
        if (attempt === 2) {
          this.logger.error(
            `Personal digest: could not delete ${ids.length} row(s): ${describeError(err)}`,
          );
        }
      }
    }
  }
}
