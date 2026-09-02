import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { RedisService } from '../redis/redis.service';
import {
  isEmptyScope,
  singleBranchId,
} from '../common/finance/report-branch-scope';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import type {
  ChartAttendancePoint,
  ChartProfitBreakdown,
  ChartStudentFlowPoint,
  ChartTrendPoint,
  DashboardChartsResponse,
} from './dashboard-charts.types';

interface ChartsContext {
  userId: number;
  companyId: number;
  roles: string[];
  branchScope: ReportBranchIds;
}

/**
 * Kesh 5 daqiqa — sanagichlarnikidan (60 s) uzunroq, chunki oylik trend va
 * haftalik davomat daqiqada o'zgarmaydi.
 */
const CACHE_TTL_SECONDS = 300;

/** Moliya va o'quvchi trendlari nechta oyni qamraydi. */
const TREND_MONTHS = 6;

/** Davomat diagrammasi nechta haftani qamraydi. */
const ATTENDANCE_WEEKS = 12;

const UZ_MONTHS = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyn',
  'Iyl',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

/**
 * Bosh sahifadagi diagrammalar uchun ma'lumot.
 *
 * `DashboardSummaryService` kabi, bu servis ham HECH NARSANI QAYTA
 * HISOBLAMAYDI (ADR-0012) — har bir seriya mavjud hisobot servisidan keladi.
 * Shu sababli diagramma yonidagi karta bilan ziddiyatga tusha olmaydi:
 * «Pul qayerga ketdi» diagrammasi «Sof foyda» kartasi bilan bitta obyektdan
 * chiqadi.
 *
 * Sanagichlardan ALOHIDA endpoint, chunki bosh sahifaning o'zagi sovuq keshda
 * ~7 s ochiladi va diagrammalarni o'sha so'rovga qo'shish uni yanada
 * sekinlashtirardi. Mijoz avval sanagichlarni ko'rsatadi, diagrammalarni esa
 * keyin yuklaydi.
 */
@Injectable()
export class DashboardChartsService {
  private readonly logger = new Logger(DashboardChartsService.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly redis: RedisService,
  ) {}

  async getCharts(ctx: ChartsContext): Promise<DashboardChartsResponse> {
    if (isEmptyScope(ctx.branchScope)) {
      throw new ForbiddenException('Bu filial sizning ruxsatingizda emas');
    }

    const canSeeMoney =
      ctx.roles.includes('CEO') || ctx.roles.includes('Branch Director');
    // Diagrammalarning manbasi `/reports/*` servislari — ular kassirga ochiq
    // emas, shuning uchun unga diagramma umuman chizilmaydi.
    const canSeeOperational =
      canSeeMoney || ctx.roles.includes('Administrator');

    const tier = canSeeMoney ? 'money' : canSeeOperational ? 'ops' : 'none';
    const cacheKey = `dashboard:charts:${ctx.companyId}:${this.branchKey(
      ctx.branchScope,
    )}:${tier}`;

    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as DashboardChartsResponse;
      } catch {
        // Buzilgan yozuv — qayta hisoblaymiz.
      }
    }

    const failed: string[] = [];

    const [money, students, attendance] = await Promise.all([
      canSeeMoney
        ? this.safe('money', failed, () => this.buildMoney(ctx))
        : Promise.resolve(null),
      canSeeOperational
        ? this.safe('students', failed, () => this.buildStudents(ctx))
        : Promise.resolve(null),
      canSeeOperational
        ? this.safe('attendance', failed, () => this.buildAttendance(ctx))
        : Promise.resolve(null),
    ]);

    const result: DashboardChartsResponse = {
      money,
      students,
      attendance,
      failed,
    };

    if (failed.length === 0) {
      await this.redis
        .setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result))
        .catch(() => undefined);
    }

    return result;
  }

  private branchKey(scope: ReportBranchIds): string {
    if (scope == null) return 'all';
    return [...scope].sort((a, b) => a - b).join('-');
  }

  private async safe<T>(
    name: string,
    failed: string[],
    build: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await build();
    } catch (err) {
      this.logger.warn(
        `Bosh sahifa «${name}» diagrammasi yiqildi: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      failed.push(name);
      return null;
    }
  }

  /** Oxirgi N oy, eskisidan yangisiga: `['2026-04', … , '2026-09']`. */
  private recentMonths(count: number): string[] {
    const now = new Date();
    const out: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      );
    }
    return out;
  }

  private monthLabel(monthKey: string): string {
    const m = Number(monthKey.slice(5, 7));
    return UZ_MONTHS[m - 1] ?? monthKey;
  }

  /** A — moliya trendi va B — foyda tarkibi. Ikkalasi bitta blokda. */
  private async buildMoney(ctx: ChartsContext): Promise<{
    trend: ChartTrendPoint[];
    breakdown: ChartProfitBreakdown | null;
  }> {
    const months = this.recentMonths(TREND_MONTHS);
    const currentMonth = months[months.length - 1];

    const [rows, np] = await Promise.all([
      this.reports.getFinancialTrendCanonical(
        ctx.companyId,
        ctx.branchScope,
        ctx.userId,
      ),
      // Foyda tarkibi — «Sof foyda» kartasi bilan AYNAN bitta obyekt.
      // Yiqilsa trend baribir chiziladi, shuning uchun alohida ushlanadi.
      this.reports
        .getMonthlyNetProfit(ctx.companyId, {
          month: currentMonth,
          branchIds: ctx.branchScope,
          performedById: ctx.userId,
        })
        .catch(() => null),
    ]);

    const trend: ChartTrendPoint[] = (
      rows as {
        month: string;
        income: number;
        expenses: number;
        profit: number;
      }[]
    ).map((r) => ({
      month: r.month,
      income: r.income,
      expenses: r.expenses,
      profit: r.profit,
    }));

    const breakdown: ChartProfitBreakdown | null = np
      ? {
          revenue: np.revenue,
          teacherSalary: np.teacherSalary,
          adminSalary: np.adminSalary,
          operatingExpenses: np.operatingExpenses,
          refunds: np.refunds,
          netProfit: np.netProfit,
        }
      : null;

    return { trend, breakdown };
  }

  /**
   * C — o'quvchilar oqimi.
   *
   * `inGroup` va `groupless` ATAYLAB olinmaydi: ular oyga bog'liq emas,
   * bugungi holatdan hisoblanadi va oltala oyda bir xil qiymat qaytaradi.
   * Vaqt qatori sifatida ular yolg'on bo'lardi.
   */
  private async buildStudents(
    ctx: ChartsContext,
  ): Promise<ChartStudentFlowPoint[]> {
    const months = this.recentMonths(TREND_MONTHS);
    const flows = await Promise.all(
      months.map((month) =>
        this.reports.getStudentFlow(ctx.companyId, {
          month,
          branchIds: ctx.branchScope,
        }),
      ),
    );
    return flows.map((f, i) => ({
      month: this.monthLabel(months[i]),
      arrived: f.arrived,
      left: f.left.total,
      net: f.netChange,
    }));
  }

  /** D — haftalik davomat foizi. */
  private async buildAttendance(
    ctx: ChartsContext,
  ): Promise<ChartAttendancePoint[]> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - ATTENDANCE_WEEKS * 7);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const res = (await this.reports.getAttendanceAnalytics(ctx.companyId, {
      branchId: singleBranchId(ctx.branchScope),
      startDate: iso(start),
      endDate: iso(end),
      bucket: 'week',
    })) as { trend?: { label: string; rate: number }[] };

    return (res.trend ?? []).map((t) => ({ label: t.label, rate: t.rate }));
  }
}
