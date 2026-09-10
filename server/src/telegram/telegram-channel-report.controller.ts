import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TelegramService } from './telegram.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';

/**
 * "Bot hisoboti" sahifasining ma'lumot manbai (`/reports/bot` frontendda).
 *
 * NEGA ReportsModule'da EMAS: `TelegramGroupsModule` allaqachon `ReportsModule`
 * ni import qiladi, shuning uchun `ReportsModule` → `TelegramModule` bog'lanishi
 * aylanma qaramlik hosil qilardi. Endpoint shu sababli TelegramModule ichida.
 * Frontenddagi URL (/reports/bot) bunga bog'liq emas.
 */
/**
 * ROLLAR: faqat CEO + Branch Director. Bu ATAYLAB `/reports` bo'limining
 * mavjud darajasiga moslashtirilgan — `ReportsLayoutShell` o'sha bo'limni
 * `[1, 2]` rollariga cheklaydi, ya'ni Administrator sahifaga umuman kira
 * olmaydi. Backendga Administrator qo'shilsa, frontend bilan zid bo'lardi
 * (CLAUDE.md: ikkala qatlam doim bir xil bo'lishi shart).
 */
@Controller('telegram/channel-report')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class TelegramChannelReportController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly gateStats: TelegramChannelGateStatsService,
  ) {}

  /**
   * Jamlanma. `month` — "YYYY-MM"; berilmasa butun davr bo'yicha hisoblanadi.
   */
  @Get('summary')
  async summary(@Query('month') month?: string) {
    const range = parseMonth(month);
    const [stats, channelMembers] = await Promise.all([
      this.gateStats.getSummary(range),
      this.telegram.getChannelMemberCount(),
    ]);

    return {
      ...stats,
      channelMembers,
      gateEnabled: this.telegram.isChannelGateEnabled(),
      channel: this.telegram.getRequiredChannel(),
      month: month ?? null,
    };
  }

  @Get('list')
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.gateStats.getList({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 10)),
    });
  }
}

/**
 * "YYYY-MM" ni Toshkent oyining boshidan keyingi oy boshigacha oraliqqa
 * aylantiradi — `to` CHEGARADAN TASHQARI (`lt`), shuning uchun oyning oxirgi
 * kechasi soat 00:00 dan keyin bo'lgan hodisa keyingi oyga tushadi.
 * Noto'g'ri qiymatda `undefined` — davr filtri qo'llanmaydi (butun davr).
 */
function parseMonth(month?: string): { from: Date; to: Date } | undefined {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return undefined;
  const [, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return undefined;
  // Toshkent oyi: `to` — keyingi oy boshlanishi, ya'ni CHEGARADAN TASHQARI.
  const { gte, lt } = tashkentMonthRangeUtc(month);
  return { from: gte, to: lt };
}
