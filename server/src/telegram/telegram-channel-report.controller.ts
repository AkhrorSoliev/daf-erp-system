import { Controller, Get, Query } from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { parseGateMonth } from './gate-cohort';

/**
 * "Bot hisoboti" sahifasining ma'lumot manbai (`/reports/bot` frontendda).
 *
 * NEGA ReportsModule'da EMAS: `TelegramGroupsModule` allaqachon `ReportsModule`
 * ni import qiladi, shuning uchun `ReportsModule` → `TelegramModule` bog'lanishi
 * aylanma qaramlik hosil qilardi. Endpoint shu sababli TelegramModule ichida.
 * Frontenddagi URL (/reports/bot) bunga bog'liq emas.
 */
/**
 * IMKONIYAT: `reports.students` (odatda faqat CEO + Branch Director). Bu
 * ATAYLAB `/reports` bo'limining mavjud darajasiga moslashtirilgan —
 * `ReportsLayoutShell` o'sha bo'limni CEO va Branch Director'ga cheklaydi,
 * ya'ni Administrator sahifaga umuman kira olmaydi. Backendga Administrator
 * qo'shilsa, frontend bilan zid bo'lardi (CLAUDE.md: ikkala qatlam doim bir
 * xil bo'lishi shart).
 */
@Controller('telegram/channel-report')
@Can('reports.students')
export class TelegramChannelReportController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly gateStats: TelegramChannelGateStatsService,
  ) {}

  /**
   * Jamlanma (ADR-0104). `month` — "YYYY-MM"; berilmasa joriy Toshkent oyi.
   * Noto'g'ri, 2026-05 dan oldingi yoki kelajak oy — 400.
   */
  @Get('summary')
  async summary(@Query('month') month?: string) {
    const key = parseGateMonth(month, new Date());
    const [stats, channelMembers] = await Promise.all([
      this.gateStats.getSummary(key),
      this.telegram.getChannelMemberCount(),
    ]);

    return {
      ...stats,
      channelMembers,
      gateEnabled: this.telegram.isChannelGateEnabled(),
      channel: this.telegram.getRequiredChannel(),
      month: key,
    };
  }

  @Get('list')
  async list(
    @Query('month') month?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.gateStats.getList({
      month: parseGateMonth(month, new Date()),
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 10)),
    });
  }
}
