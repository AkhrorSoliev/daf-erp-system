import { Injectable, Logger } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsExcelService } from '../reports/reports-excel.service';
import { ReportsFinancialService } from '../reports/reports-financial.service';
import { ReportsService } from '../reports/reports.service';
import { formatSum } from './utils/format.util';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DEFAULT_FLOOR_MONTH = '2026-05';

type ResolvedGroup = {
  id: string;
  companyId: number;
  chatId: bigint;
  branchId: number | null;
};

/**
 * The interactive "Ko'proq imkoniyatlar" report menu that hangs off the 21:00
 * daily report (and any message that attaches {@link moreButton}).
 *
 * Design constraints (grounded in the admin bot's reality):
 *  - The admin bot has NO session/scene state and lives in GROUP chats where
 *    Telegraf's session key would collide across members — so ALL flow state
 *    (which month, first-vs-second month for a comparison) is carried in the
 *    callback_data string, never in server-side session.
 *  - The chat is the ACL: only an APPROVED + active group's callbacks act, and
 *    the workbook goes to the same group that already receives the daily
 *    financials. This is READ-ONLY delivery — no mutations live here.
 *
 * callback_data scheme (all < 64 bytes):
 *   rm:open                       open the menu (fresh message under the report)
 *   rm:root | rm:close            back to root / dismiss
 *   rm:full → rm:fy:YYYY → rm:fm:YYYY-MM     full monthly Excel
 *   rm:pre  → rm:p3 | rm:p6 | rm:p12 | rm:py:YYYY   preset range Excel
 *   rm:card → rm:cfin             in-chat financial summary card
 *
 * The two-month comparison branch (rm:cmp → rm:ca → rm:cb) was REMOVED: the
 * workbook no longer carries a «Taqqoslash» sheet, so that leaf produced a file
 * identical to a plain single-month export while its caption promised two
 * periods side by side. Two months are two taps of «To'liq hisobot» now.
 */
@Injectable()
export class TelegramGroupReportMenuService {
  private readonly logger = new Logger(TelegramGroupReportMenuService.name);

  /**
   * Per-chat in-flight guard. A generating leaf adds the chat id SYNCHRONOUSLY
   * before its first await, so a rapid double-tap (Telegram delivers both
   * callbacks) can't produce two workbooks — the second press sees the flag and
   * bails. Cleared in `finally`.
   */
  private readonly generating = new Set<string>();

  private static readonly MONTHS_UZ = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsExcel: ReportsExcelService,
    private readonly reportsFinancial: ReportsFinancialService,
    private readonly reports: ReportsService,
  ) {}

  /** Inline keyboard attached under the daily report — opens the menu. */
  static moreButton() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("📊 Ko'proq imkoniyatlar", 'rm:open')],
    ]);
  }

  // ── Menu navigation ───────────────────────────────────────────────────

  /** rm:open — post the menu as a NEW message so the daily report stays intact. */
  async openMenu(ctx: Context): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
    await ctx
      .reply('📋 <b>Hisobot menyusi</b>', {
        parse_mode: 'HTML',
        ...this.rootKeyboard(),
      })
      .catch(() => undefined);
  }

  /** rm:root — edit the current menu message back to the root options. */
  async showRoot(ctx: Context): Promise<void> {
    await this.edit(ctx, '📋 <b>Hisobot menyusi</b>', this.rootKeyboard());
  }

  /** rm:close — dismiss the menu message. */
  async close(ctx: Context): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
    await ctx.deleteMessage().catch(() => undefined);
  }

  /**
   * rm:cmp / rm:ca / rm:cb — the retired two-month comparison branch. Menus
   * already sitting in group chats still carry those buttons, so the tap gets
   * an honest answer and the root menu back rather than a dead spinner.
   */
  async showRetiredComparison(ctx: Context): Promise<void> {
    await ctx
      .answerCbQuery(
        "Davrlar taqqoslash olib tashlandi. Har bir oyni «To'liq hisobot» dan alohida yuklab oling.",
        { show_alert: true },
      )
      .catch(() => undefined);
    await ctx
      .editMessageText('📋 <b>Hisobot menyusi</b>', {
        parse_mode: 'HTML',
        ...this.rootKeyboard(),
      })
      .catch(() => undefined);
  }

  /** rm:full — year picker. */
  async showFullYears(ctx: Context): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group) return;
    const years = await this.availableYears(group.companyId);
    const rows = this.chunk(
      years.map((y) => Markup.button.callback(String(y), `rm:fy:${y}`)),
      3,
    );
    rows.push([Markup.button.callback('« Orqaga', 'rm:root')]);
    await this.edit(ctx, '📅 <b>Qaysi yil?</b>', Markup.inlineKeyboard(rows));
  }

  /** rm:fy:YYYY — month picker for the chosen year. */
  async showFullMonths(ctx: Context, year: number): Promise<void> {
    const group = await this.resolveGroup(ctx);
    if (!group) return;
    const months = await this.availableMonths(group.companyId, year);
    if (months.length === 0) {
      await ctx.answerCbQuery("Bu yil uchun ma'lumot yo'q").catch(() => undefined);
      return;
    }
    const rows = this.chunk(
      months.map((m) =>
        Markup.button.callback(this.monthLabel(m), `rm:fm:${m}`),
      ),
      3,
    );
    rows.push([Markup.button.callback('« Orqaga', 'rm:full')]);
    await this.edit(
      ctx,
      `📅 <b>Qaysi oy? (${year})</b>`,
      Markup.inlineKeyboard(rows),
    );
  }

  /** rm:fm:YYYY-MM — generate + send the full single-month Excel. */
  async sendMonthExcel(ctx: Context, month: string): Promise<void> {
    const { startDate, endDate } = this.monthRange(month);
    const isPast = month < this.currentMonth();
    // «Xonalar bandligi» is the only live-state sheet left in the bot's export
    // (Balans / Qarzdorlar are opt-in groups the bot does not request), so it
    // is the only one the caption may name.
    const caption =
      `📊 <b>Hisobot — ${this.monthLabel(month)}</b>\n` +
      (isPast
        ? `ℹ️ 'Xonalar bandligi' varag'i o'tgan oy uchun aniq bo'lmagani sabab chiqarilmadi.`
        : `⚠️ 'Xonalar bandligi' varag'i joriy holatni ko'rsatadi.`);
    await this.generateAndSend(ctx, {
      startDate,
      endDate,
      filename: `hisobot-${month}.xlsx`,
      caption,
    });
  }

  /** rm:pre — preset submenu. */
  async showPresets(ctx: Context): Promise<void> {
    const now = this.currentMonth();
    const rows = [
      [Markup.button.callback('Oxirgi 3 oy', 'rm:p3')],
      [Markup.button.callback('Oxirgi 6 oy', 'rm:p6')],
      [Markup.button.callback('Oxirgi 12 oy', 'rm:p12')],
      [Markup.button.callback(`Yillik (${now.slice(0, 4)})`, `rm:py:${now.slice(0, 4)}`)],
      [Markup.button.callback('« Orqaga', 'rm:root')],
    ];
    await this.edit(ctx, '⚡ <b>Tez hisobotlar:</b>', Markup.inlineKeyboard(rows));
  }

  /** rm:p3 | rm:p6 | rm:p12 — trailing-range Excel. */
  async sendPresetExcel(ctx: Context, months: 3 | 6 | 12): Promise<void> {
    const { startDate, endDate } = this.presetRange(months);
    const caption =
      `⚡ <b>Oxirgi ${months} oy hisoboti</b>\n` +
      // Not «boshlang'ich oy»: the salary report clamps a month earlier than the
      // reporting floor up to that floor, so the sheet may hold a LATER month
      // than the period starts with. Its own header names which one.
      `⚠️ 'Oyliklar' varag'i faqat bitta oyni ko'rsatadi (yig'indi emas).`;
    await this.generateAndSend(ctx, {
      startDate,
      endDate,
      filename: `hisobot-${months}oy.xlsx`,
      caption,
    });
  }

  /**
   * rm:py:YYYY — a plain Jan–Dec period export. It used to request a «Yillar
   * kesimida» sheet; that sheet is gone, so this is a range like any other and
   * the caption promises nothing more than the range.
   */
  async sendYearlyExcel(ctx: Context, year: number): Promise<void> {
    const caption =
      `📅 <b>Yillik hisobot — ${year}</b>\n` +
      // Not «yanvar»: January is before the reporting floor, so the salary
      // report clamps up to the floor month and the sheet holds THAT month.
      `⚠️ 'Oyliklar' varag'i faqat bitta oyni ko'rsatadi (yig'indi emas).`;
    await this.generateAndSend(ctx, {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      filename: `yillik-${year}.xlsx`,
      caption,
    });
  }

  /** rm:cfin — in-chat financial summary card for the current month (no file). */
  async sendFinancialCard(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery().catch(() => undefined);
      return;
    }
    const key = String(chatId);
    if (this.generating.has(key)) {
      await ctx.answerCbQuery('⏳ Biroz kuting…').catch(() => undefined);
      return;
    }
    this.generating.add(key);
    try {
      await ctx.answerCbQuery().catch(() => undefined);
      const group = await this.resolveGroup(ctx);
      if (!group) return;
      // Company-wide on purpose: the card goes to a group chat that already
      // receives the whole centre's daily financials, and a group callback
      // carries no per-user ERP identity to scope by.
      const o = await this.reportsFinancial.getFinancialOverview(
        group.companyId,
        { branchIds: null },
      );
      const monthKey = this.currentMonth();
      const month = this.monthLabel(monthKey);
      // `o.netProfit` is the legacy cash figure (kassa tushumi − NAQD to'langan
      // oylik). Payroll is paid the following cycle, so its paid leg is ~0 and
      // profit reads far too high — the "+78M June" bug the code names itself.
      // Read the canonical figure the Foyda card and Excel «Sof foyda» use.
      const canonical = await this.canonicalNetProfit(group.companyId, monthKey);
      const lines = [
        `💰 <b>Moliyaviy xulosa — ${month}</b>`,
        ``,
        `• Tushum (haqiqiy): <b>${formatSum(o.income.actual)}</b>`,
        `• Oy oxiriga kutilyapti: <b>${formatSum(o.income.expected)}</b>`,
        `• Xarajat: <b>${formatSum(o.expenses)}</b>`,
        `• Ustoz oyligi (to'langan): <b>${formatSum(o.salary.paid)}</b>`,
        canonical !== null
          ? `• Sof foyda: <b>${formatSum(canonical)}</b>`
          : `• Kassa harakati (oyliksiz): <b>${formatSum(o.netProfit)}</b>`,
        `• Qarzdorlar: <b>${o.forecast.debtorExposure.count}</b> ta — <b>${formatSum(Math.abs(o.forecast.outstandingReceivable))}</b>`,
      ];
      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (err: any) {
      this.logger.warn(`Financial card failed: ${err?.message ?? err}`);
      await ctx.reply("Ma'lumot yuklanmadi. Qayta urinib ko'ring.").catch(() => undefined);
    } finally {
      this.generating.delete(key);
    }
  }

  /**
   * The ONE canonical "Sof foyda" (`ReportsService.getMonthlyNetProfit`) — the
   * same figure the /overview Foyda card and the Excel sheet show. Needs a CEO
   * caller so the figure is company-wide. Returns null on failure so the card
   * degrades to an honestly-labelled cash line instead of a wrong profit.
   */
  private async canonicalNetProfit(
    companyId: number,
    month: string,
  ): Promise<number | null> {
    try {
      const ceo = await this.prisma.user.findFirst({
        where: {
          companyId,
          deletedAt: null,
          roles: { some: { role: { name: 'CEO' } } },
        },
        select: { id: true },
      });
      if (!ceo) return null;
      const np = await this.reports.getMonthlyNetProfit(companyId, {
        month,
        // Company-wide: a group chat has no per-user ERP identity to scope by.
        branchIds: null,
        performedById: ceo.id,
      });
      return np.netProfit;
    } catch (e: any) {
      this.logger.warn(`Canonical net profit failed: ${e?.message ?? e}`);
      return null;
    }
  }

  // ── Excel generation + delivery ───────────────────────────────────────

  private async generateAndSend(
    ctx: Context,
    opts: {
      startDate: string;
      endDate: string;
      filename: string;
      caption: string;
    },
  ): Promise<void> {
    // ── Double-tap guard (set SYNCHRONOUSLY, before any await) ──────────────
    const chatId = ctx.chat?.id;
    if (chatId == null) {
      await ctx.answerCbQuery().catch(() => undefined);
      return;
    }
    const key = String(chatId);
    if (this.generating.has(key)) {
      await ctx
        .answerCbQuery('⏳ Oldingi hisobot hali tayyorlanmoqda…')
        .catch(() => undefined);
      return;
    }
    this.generating.add(key);

    try {
      await ctx.answerCbQuery('Hisobot tayyorlanmoqda…').catch(() => undefined);
      const group = await this.resolveGroup(ctx);
      if (!group) return;

      // Replace the menu with a loading state — removes the buttons so a second
      // tap has nothing to hit, and gives the user visible feedback.
      await ctx
        .editMessageText('⏳ <b>Hisobot tayyorlanmoqda…</b>', {
          parse_mode: 'HTML',
        })
        .catch(() => undefined);
      const stop = this.uploadingIndicator(ctx);
      try {
        const { companyName, branchNames, performedById } =
          await this.excelContext(group.companyId);
        const buffer = await this.reportsExcel.generate(group.companyId, {
          // Company-wide, matching the 'Barcha filiallar' label below.
          branchIds: null,
          startDate: opts.startDate,
          endDate: opts.endDate,
          companyName,
          branchLabel: 'Barcha filiallar',
          branchNames,
          performedById,
          // The ten default sheets only — the bot delivers one readable file,
          // and the opt-in groups belong to the web download's checkboxes.
          include: [],
          // Past-month exports drop the live-state sheets («Xonalar bandligi»
          // here) — they can't be rebuilt for a past date.
          hidePointInTimeForPastPeriod: true,
        });
        await ctx.replyWithDocument(
          { source: buffer, filename: opts.filename },
          { caption: opts.caption, parse_mode: 'HTML' },
        );
        // Restore the menu so the user can pull another report.
        await ctx
          .editMessageText('✅ <b>Hisobot yuborildi.</b>', {
            parse_mode: 'HTML',
            ...this.rootKeyboard(),
          })
          .catch(() => undefined);
      } finally {
        stop();
      }
    } catch (err: any) {
      const code = err?.response?.error_code ?? err?.code;
      if (code === 403) {
        await this.prisma.telegramGroup
          .updateMany({ where: { chatId: BigInt(chatId) }, data: { isActive: false } })
          .catch(() => undefined);
      } else {
        this.logger.error(
          `Excel report failed for chat ${chatId}: ${err?.message ?? err}`,
        );
        await ctx
          .editMessageText("⚠️ Hisobot tayyorlanmadi. Qayta urinib ko'ring.", {
            parse_mode: 'HTML',
            ...this.rootKeyboard(),
          })
          .catch(() => undefined);
      }
    } finally {
      this.generating.delete(key);
    }
  }

  /** Company name + branch names + a CEO/Admin id (salary sheet needs a
   *  non-branch-scoped caller). */
  private async excelContext(companyId: number): Promise<{
    companyName: string;
    branchNames: Record<number, string>;
    performedById: number | undefined;
  }> {
    const [company, branches, ceo] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
      this.prisma.branch.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: {
          companyId,
          deletedAt: null,
          roles: { some: { role: { name: 'CEO' } } },
        },
        select: { id: true },
      }),
    ]);
    return {
      companyName: company?.name ?? 'DaF Sprachzentrum',
      branchNames: Object.fromEntries(branches.map((b) => [b.id, b.name])),
      performedById: ceo?.id,
    };
  }

  // ── Group resolution (callback-safe) ──────────────────────────────────

  private async resolveGroup(ctx: Context): Promise<ResolvedGroup | null> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      await ctx.answerCbQuery().catch(() => undefined);
      return null;
    }
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId: BigInt(chatId) },
      select: {
        id: true,
        companyId: true,
        chatId: true,
        branchId: true,
        status: true,
        isActive: true,
      },
    });
    if (
      !group ||
      group.status !== TelegramGroupStatus.APPROVED ||
      !group.isActive ||
      !group.companyId
    ) {
      await ctx
        .answerCbQuery('Bu guruh tasdiqlanmagan.', { show_alert: true })
        .catch(() => undefined);
      return null;
    }
    return {
      id: group.id,
      companyId: group.companyId,
      chatId: group.chatId,
      branchId: group.branchId,
    };
  }

  // ── Keyboards ─────────────────────────────────────────────────────────

  private rootKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("📊 To'liq hisobot", 'rm:full')],
      [Markup.button.callback('⚡ Tez hisobotlar', 'rm:pre')],
      [Markup.button.callback('💰 Moliyaviy xulosa (bu oy)', 'rm:cfin')],
      [Markup.button.callback('✖️ Yopish', 'rm:close')],
    ]);
  }

  // ── Date helpers (Asia/Tashkent, fixed UTC+5) ─────────────────────────

  private monthKeyOf(d: Date): string {
    const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private currentMonth(): string {
    return this.monthKeyOf(new Date());
  }

  private async floorMonth(companyId: number): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { systemStartDate: true },
    });
    return company?.systemStartDate
      ? this.monthKeyOf(company.systemStartDate)
      : DEFAULT_FLOOR_MONTH;
  }

  /** Every 'YYYY-MM' from the company's start month up to the current month. */
  private async availableMonths(
    companyId: number,
    year?: number,
  ): Promise<string[]> {
    const floor = await this.floorMonth(companyId);
    const cur = this.currentMonth();
    const out: string[] = [];
    let [y, m] = floor.split('-').map(Number);
    const [cy, cm] = cur.split('-').map(Number);
    while (y < cy || (y === cy && m <= cm)) {
      if (!year || y === year) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
      }
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }

  private async availableYears(companyId: number): Promise<number[]> {
    const floor = await this.floorMonth(companyId);
    const cur = this.currentMonth();
    const fy = Number(floor.slice(0, 4));
    const cyr = Number(cur.slice(0, 4));
    const years: number[] = [];
    for (let y = fy; y <= cyr; y++) years.push(y);
    return years;
  }

  private monthRange(month: string): { startDate: string; endDate: string } {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      startDate: `${month}-01`,
      endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  /** Trailing N-month range ending with the current month. */
  private presetRange(months: number): { startDate: string; endDate: string } {
    const cur = this.currentMonth();
    const [cy, cm] = cur.split('-').map(Number);
    const startD = new Date(Date.UTC(cy, cm - 1 - (months - 1), 1));
    const sy = startD.getUTCFullYear();
    const sm = startD.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
    return {
      startDate: `${sy}-${String(sm).padStart(2, '0')}-01`,
      endDate: `${cur}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  /** 'YYYY-MM' → 'MM.YYYY'. */
  private monthLabel(month: string): string {
    const [y, m] = month.split('-');
    return `${m}.${y}`;
  }

  // ── Small utilities ───────────────────────────────────────────────────

  private async edit(
    ctx: Context,
    text: string,
    keyboard: ReturnType<typeof Markup.inlineKeyboard>,
  ): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
    await ctx
      .editMessageText(text, { parse_mode: 'HTML', ...keyboard })
      .catch(() => undefined); // ignore "message is not modified" etc.
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /** Emit 'upload_document' now and every 4s; returns a stop() to clear it. */
  private uploadingIndicator(ctx: Context): () => void {
    const emit = () =>
      ctx.sendChatAction('upload_document').catch(() => undefined);
    emit();
    const interval = setInterval(emit, 4000);
    return () => clearInterval(interval);
  }
}
