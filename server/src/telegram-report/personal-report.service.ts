import { Injectable, Logger } from '@nestjs/common';
import type { TelegramReportRecipient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  TelegramGroupDailyReportService,
  type DailyReportData,
} from '../telegram-groups/telegram-group-daily-report.service';
import { staffChatOf } from '../tasks/telegram/task-telegram-view';
import { htmlToPlainText } from '../refunds/refund-student-text';
import { unreachableReason } from '../telegram/utils/student-chat-reach';
import {
  classifyTelegramError,
  describeError,
  sendTelegramText,
  type TelegramFailureKind,
  type TelegramTextSender,
} from '../telegram-digest/telegram-send';
import {
  renderPersonalReport,
  type ReportUnit,
} from './personal-report-render';
import { reportKeyboard, type ReportFocus } from './report-keyboard';
import { tashkentClock } from './report-clock';
import { attemptNote } from './reach-state';

export type RecipientLike = Pick<
  TelegramReportRecipient,
  'companyId' | 'userId' | 'layout' | 'sections' | 'allBranches' | 'branchIds'
>;
export type ReportCache = Map<string, Promise<DailyReportData>>;
export type DeliverResult =
  | { ok: true }
  | { ok: false; reason: 'NO_CHAT' | 'NO_BRANCH' | 'NO_BOT' }
  | {
      ok: false;
      reason: 'SEND_FAILED';
      kind: TelegramFailureKind;
      description: string;
    };

export type ProbeResult = {
  reach: 'DELIVERED' | 'BLOCKED' | 'UNLINKED' | 'NO_BOT' | 'FAILED';
  note: string | null;
};

const BOT_CHECK_TTL_MS = 60_000;
const GET_ME_TIMEOUT_MS = 3_000;

/**
 * The personal daily report (ADR-0095). Figures come only from
 * `TelegramGroupDailyReportService.collect` — the 21:00 report's own source.
 */
@Injectable()
export class PersonalReportService {
  private readonly logger = new Logger(PersonalReportService.name);
  private botCheck: { at: number; active: boolean } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly daily: TelegramGroupDailyReportService,
    private readonly telegram: TelegramService,
  ) {}

  allowedBranches(
    r: Pick<RecipientLike, 'companyId' | 'allBranches' | 'branchIds'>,
  ) {
    return this.prisma.branch.findMany({
      where: {
        companyId: r.companyId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'INACTIVE'] },
        ...(r.allBranches ? {} : { id: { in: r.branchIds } }),
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async compose(
    r: RecipientLike,
    focus: ReportFocus,
    cache: ReportCache = new Map(),
    now = new Date(),
  ) {
    const branches = await this.allowedBranches(r);
    if (!branches.length) return null;
    const load = (ids: number[] | null) => {
      const key = `${r.companyId}:${ids ? ids.join(',') : 'all'}`;
      let p = cache.get(key);
      if (!p) {
        p = this.daily.collect(r.companyId, ids);
        cache.set(key, p);
      }
      return p;
    };
    const unitOf = async (b: {
      id: number;
      name: string;
    }): Promise<ReportUnit> => ({
      label: b.name,
      data: await load([b.id]),
    });

    let units: ReportUnit[];
    let total: DailyReportData | null = null;
    if (focus !== 'all') {
      const b = branches.find((x) => x.id === focus);
      if (!b) return null;
      units = [await unitOf(b)];
    } else if (branches.length === 1) {
      units = [await unitOf(branches[0])];
    } else {
      // «Barcha filiallar» is the company-wide scope the 21:00 report uses.
      total = await load(r.allBranches ? null : branches.map((b) => b.id));
      units =
        r.layout === 'TOTAL_ONLY'
          ? []
          : await Promise.all(branches.map(unitOf));
    }

    const clock = tashkentClock(now);
    const text = renderPersonalReport({
      layout: r.layout,
      sections: r.sections,
      units,
      total,
      dateLabel: clock.date,
      asOf: clock.time,
    });
    return { text, keyboard: reportKeyboard(branches, focus) };
  }

  async deliver(
    r: RecipientLike,
    cache: ReportCache = new Map(),
    now = new Date(),
  ): Promise<DeliverResult> {
    const result = await this.send(r, cache, now);
    await this.recordAttempt(r, result, now);
    return result;
  }

  /** Is the main bot configured and does Telegram answer it? Cached a minute. */
  async botActive(): Promise<boolean> {
    if (this.botCheck && Date.now() - this.botCheck.at < BOT_CHECK_TTL_MS) {
      return this.botCheck.active;
    }
    const bot = this.telegram.getBot() as unknown as
      | { telegram: { getMe(): Promise<unknown> } }
      | null
      | undefined;
    let active = false;
    if (bot) {
      try {
        await Promise.race([
          bot.telegram.getMe(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), GET_ME_TIMEOUT_MS),
          ),
        ]);
        active = true;
      } catch {
        active = false;
      }
    }
    this.botCheck = { at: Date.now(), active };
    return active;
  }

  /**
   * «Ulanishni tekshirish»: a silent `typing` action — nothing appears in the
   * person's chat. 403 «blocked» is the only certain «will not arrive». The
   * mark on the account is written here at once (the send wrapper that also
   * learns it writes in the background, too late for the page's refetch);
   * its conditional write then finds nothing to change.
   */
  async probe(userId: number): Promise<ProbeResult> {
    const chat = await staffChatOf(this.prisma, userId);
    if (!chat) return { reach: 'UNLINKED', note: 'Telegram ulanmagan' };
    const bot = this.telegram.getBot() as unknown as
      | {
          telegram: {
            sendChatAction(chatId: string, action: string): Promise<unknown>;
          };
        }
      | null
      | undefined;
    if (!bot) return { reach: 'NO_BOT', note: 'Bot ishlamayapti' };
    try {
      await bot.telegram.sendChatAction(chat.chatId, 'typing');
    } catch (err) {
      const failure = classifyTelegramError(err);
      if (failure.kind === 'permanent') {
        await this.prisma.user.updateMany({
          where: { id: userId, telegramDisconnectedAt: null },
          data: { telegramDisconnectedAt: new Date() },
        });
        return {
          reach: 'BLOCKED',
          note: unreachableReason(failure.description),
        };
      }
      return { reach: 'FAILED', note: 'Telegram vaqtincha javob bermadi' };
    }
    await this.prisma.user.updateMany({
      where: { id: userId, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
    return { reach: 'DELIVERED', note: null };
  }

  /** The report as plain text with today's real figures; null = no allowed branch. */
  async preview(r: RecipientLike): Promise<string | null> {
    const report = await this.compose(r, 'all');
    return report ? htmlToPlainText(report.text) : null;
  }

  /** The attempt log the page shows; never fails a delivery. */
  private async recordAttempt(
    r: RecipientLike,
    result: DeliverResult,
    at: Date,
  ): Promise<void> {
    try {
      await this.prisma.telegramReportRecipient.updateMany({
        where: { companyId: r.companyId, userId: r.userId },
        data: {
          lastAttemptAt: at,
          lastAttemptOk: result.ok,
          lastAttemptNote: attemptNote(result),
        },
      });
    } catch (err) {
      this.logger.warn(
        `could not record the report attempt: ${describeError(err)}`,
      );
    }
  }

  private async send(
    r: RecipientLike,
    cache: ReportCache,
    now: Date,
  ): Promise<DeliverResult> {
    const chat = await staffChatOf(this.prisma, r.userId);
    if (!chat) return { ok: false, reason: 'NO_CHAT' };
    const bot = this.telegram.getBot() as unknown as
      | TelegramTextSender
      | null
      | undefined;
    if (!bot) return { ok: false, reason: 'NO_BOT' };
    const report = await this.compose(r, 'all', cache, now);
    if (!report) return { ok: false, reason: 'NO_BRANCH' };
    const out = await sendTelegramText(bot, chat.chatId, report.text, {
      parse_mode: 'HTML',
      ...report.keyboard,
    });
    return out.ok
      ? { ok: true }
      : {
          ok: false,
          reason: 'SEND_FAILED',
          kind: out.kind,
          description: out.description,
        };
  }
}
