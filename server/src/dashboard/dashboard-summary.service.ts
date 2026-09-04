import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { PaymentsService } from '../payments/payments.service';
import { OutreachService } from '../outreach/outreach.service';
import { DashboardService } from './dashboard.service';
import { RedisService } from '../redis/redis.service';
import {
  isEmptyScope,
  singleBranchId,
} from '../common/finance/report-branch-scope';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import type {
  DashboardAttention,
  DashboardMoney,
  DashboardNextLesson,
  DashboardPeople,
  DashboardSummaryResponse,
} from './dashboard-summary.types';

interface SummaryContext {
  userId: number;
  companyId: number;
  roles: string[];
  /** `@BranchScope()` bergan hal qilingan qamrov. */
  branchScope: ReportBranchIds;
}

/** Kesh 60 soniya: bosh sahifa har kirganda ochiladi, lekin real vaqt emas. */
const CACHE_TTL_SECONDS = 60;

/**
 * Bosh sahifaning boshqaruv paneli uchun ma'lumot yig'uvchi.
 *
 * BU SERVIS HECH QANDAY YANGI HISOB-KITOB YOZMAYDI. U mavjud servislarni
 * chaqiradi, natijani rolga qarab kesadi va keshlaydi. Shu sababli bosh
 * sahifadagi raqam `/payments/overview`, `/outreach` va Excel hisobotdagi
 * raqam bilan bir xil chiqadi. Raqamni bu yerda qaytadan hisoblash — ikkinchi
 * haqiqat manbai yaratish demak.
 */
@Injectable()
export class DashboardSummaryService {
  private readonly logger = new Logger(DashboardSummaryService.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly payments: PaymentsService,
    private readonly outreach: OutreachService,
    private readonly dashboard: DashboardService,
    private readonly redis: RedisService,
  ) {}

  async getSummary(ctx: SummaryContext): Promise<DashboardSummaryResponse> {
    // Bo'sh qamrov — ruxsatdan tashqaridagi filial so'ralgan yoki odamga
    // filial biriktirilmagan. Nol qaytarish «bu filial hech narsa topmadi»
    // degan butunlay boshqa da'vo bo'lardi.
    if (isEmptyScope(ctx.branchScope)) {
      throw new ForbiddenException('Bu filial sizning ruxsatingizda emas');
    }

    const canSeeMoney =
      ctx.roles.includes('CEO') || ctx.roles.includes('Branch Director');
    const canSeeOutreach = canSeeMoney || ctx.roles.includes('Administrator');
    // Kesh kaliti rol darajasini o'z ichiga oladi: bir rolning yozuvi
    // boshqasiga hech qachon berilmaydi.
    const tier = canSeeMoney ? 'money' : canSeeOutreach ? 'outreach' : 'basic';
    const cacheKey = `dashboard:summary:${ctx.companyId}:${this.branchKey(
      ctx.branchScope,
    )}:${tier}`;

    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as DashboardSummaryResponse;
      } catch {
        // Buzilgan yozuv — jimgina qayta hisoblaymiz.
      }
    }

    const branchId = singleBranchId(ctx.branchScope);
    const failed: string[] = [];

    const [money, people, attention, nextLessons] = await Promise.all([
      canSeeMoney
        ? this.safe('money', failed, () => this.buildMoney(ctx))
        : Promise.resolve(null),
      this.safe('people', failed, () => this.buildPeople(ctx, branchId)),
      this.safe('attention', failed, () =>
        this.buildAttention(ctx, canSeeOutreach),
      ),
      branchId == null
        ? Promise.resolve(null)
        : this.safe('nextLessons', failed, () =>
            this.buildNextLessons(ctx, branchId),
          ),
    ]);

    const result: DashboardSummaryResponse = {
      money,
      people,
      attention,
      nextLessons,
      failed,
    };

    // Yiqilgan javob keshlanmaydi — aks holda bir soniyalik nosozlik bir
    // daqiqaga muzlab qolardi.
    if (failed.length === 0) {
      await this.redis
        .setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result))
        .catch(() => undefined);
    }

    return result;
  }

  /** Kesh kaliti uchun barqaror satr. */
  private branchKey(scope: ReportBranchIds): string {
    if (scope == null) return 'all';
    return [...scope].sort((a, b) => a - b).join('-');
  }

  /**
   * Bitta blok yiqilsa butun sahifa yiqilmaydi: nomi `failed` ga tushadi,
   * qiymati `null` bo'ladi va UI faqat o'sha blokni «ma'lumot olinmadi»
   * holatida chizadi. Moliya yiqilgani davomat ma'lumotini yashirishga sabab
   * emas.
   */
  private async safe<T>(
    name: string,
    failed: string[],
    build: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await build();
    } catch (err) {
      this.logger.warn(
        `Bosh sahifa «${name}» bo'limi yiqildi: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      failed.push(name);
      return null;
    }
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private async buildMoney(ctx: SummaryContext): Promise<DashboardMoney> {
    const month = this.currentMonth();
    const [overview, debt] = await Promise.all([
      this.reports.getFinancialOverview(ctx.companyId, {
        branchIds: ctx.branchScope,
      }),
      this.payments.getDebtorSummary(ctx.companyId, {
        branchId: singleBranchId(ctx.branchScope),
        status: 'all',
        userId: ctx.userId,
        roles: ctx.roles,
      }),
    ]);

    const { netProfit, netProfitBasis } =
      await this.reports.getNetProfitWithBasis(ctx.companyId, {
        month,
        branchIds: ctx.branchScope,
        performedById: ctx.userId,
        cashFallback: overview.netProfit,
      });

    return {
      monthIncome: overview.income.actual,
      paymentCount: overview.income.paymentCount,
      expectedMonthEnd: overview.forecast.expectedMonthEnd,
      netProfit,
      netProfitBasis,
      // Qarz balansi manfiy saqlanadi; karta uni musbat summa qilib
      // ko'rsatadi, chunki yonida «Qarzdorlik» yozuvi turadi.
      debt: { total: Math.abs(debt.totalDebt), count: debt.debtorCount },
    };
  }

  private async buildPeople(
    ctx: SummaryContext,
    branchId: number | undefined,
  ): Promise<DashboardPeople> {
    const [kpis, todayLessons] = await Promise.all([
      this.reports.getKpis(ctx.companyId, { branchId }),
      // Jadval bitta filialning xonalari va ish vaqtiga chiziladi, shuning
      // uchun «Barcha filiallar» rejimida bu son mavjud emas. `0` qaytarish
      // yolg'on bo'lardi — darslar bor, faqat qaysi filialda ekani aytilmagan.
      branchId == null
        ? Promise.resolve(null)
        : this.dashboard
            .getTodaySchedule(branchId, ctx.companyId)
            .then((s) => s.lessons.length),
    ]);

    return {
      activeStudents: kpis.activeStudents.current,
      newThisMonth: kpis.newStudentsThisMonth,
      leftThisMonth: kpis.churnedThisMonth,
      activeGroups: kpis.activeGroups,
      attendancePct: kpis.averageAttendance,
      todayLessons,
    };
  }

  private async buildAttention(
    ctx: SummaryContext,
    canSeeOutreach: boolean,
  ): Promise<DashboardAttention> {
    const [stats, debt, debtors] = await Promise.all([
      canSeeOutreach
        ? this.outreach.getStats({
            userId: ctx.userId,
            companyId: ctx.companyId,
            roles: ctx.roles,
            branchScope: ctx.branchScope,
          })
        : Promise.resolve(null),
      canSeeOutreach
        ? this.payments.getDebtorSummary(ctx.companyId, {
            branchId: singleBranchId(ctx.branchScope),
            status: 'all',
            userId: ctx.userId,
            roles: ctx.roles,
          })
        : Promise.resolve(null),
      this.payments.getDebtors(ctx.companyId, {
        branchId: singleBranchId(ctx.branchScope),
        page: 1,
        pageSize: 5,
        sortBy: 'balance',
        order: 'asc',
        status: 'all',
        userId: ctx.userId,
        roles: ctx.roles,
      }),
    ]);

    return {
      todayAbsentees: stats?.todayAbsentees ?? 0,
      brokenPromises: debt?.overduePromises ?? 0,
      removalQueue: stats?.removalQueue ?? 0,
      topDebtors: debtors.data.map((d) => ({
        id: d.id,
        name: `${d.firstName} ${d.lastName}`.trim(),
        balance: d.balance,
      })),
    };
  }

  private async buildNextLessons(
    ctx: SummaryContext,
    branchId: number,
  ): Promise<DashboardNextLesson[]> {
    const schedule = await this.dashboard.getTodaySchedule(
      branchId,
      ctx.companyId,
    );
    return schedule.lessons
      .map((l) => ({
        groupId: l.groupId,
        groupName: l.groupName,
        startTime: l.startTime,
        endTime: l.endTime,
        teacherName:
          l.teachers.length > 0
            ? `${l.teachers[0].firstName} ${l.teachers[0].lastName}`.trim()
            : null,
        roomName: l.roomName,
        studentCount: l.studentCount,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}
