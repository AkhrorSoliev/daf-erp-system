import { Injectable } from '@nestjs/common';
import type { TelegramReportRecipient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  TelegramGroupDailyReportService,
  type DailyReportData,
} from '../telegram-groups/telegram-group-daily-report.service';
import { staffChatOf } from '../tasks/telegram/task-telegram-view';
import {
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

/**
 * The personal daily report (ADR-0095). Figures come only from
 * `TelegramGroupDailyReportService.collect` — the 21:00 report's own source.
 */
@Injectable()
export class PersonalReportService {
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
