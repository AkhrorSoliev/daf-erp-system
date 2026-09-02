# Bosh sahifa boshqaruv paneli — Faza 2 (backend va haqiqiy ma'lumot)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /dashboard/summary` endpointini yozib, Faza 1 dagi soxta raqamlarni haqiqiy ma'lumotga almashtirish.

**Architecture:** Yangi `DashboardSummaryService` **hech qanday yangi hisob-kitob yozmaydi** — u mavjud servislarni chaqiradi va natijani rolga qarab kesib qaytaradi. Har bo'lim `Promise.allSettled` ichida, ya'ni biri yiqilsa qolgani chiqadi. Rol filtri servisning chiqish chetida, keshdan keyin; kesh kaliti rol darajasini o'z ichiga oladi, shuning uchun bir rolning ma'lumoti boshqasiga sizib chiqmaydi.

**Tech Stack:** NestJS, Prisma, Redis, jest (backend); Next.js, TanStack Query (frontend).

## Global Constraints

- **Yangi hisob-kitob mantiqi yozilmaydi.** Har bir raqam mavjud servisdan keladi. Bosh sahifadagi son `/payments/overview`, `/outreach` va Excel hisobotdagi son bilan **bir xil** bo'lishi shart. Raqamni bu yerda qaytadan hisoblash — ikkinchi haqiqat manbai yaratish, bu taqiqlanadi.
- **Filial qamrovi** faqat `@BranchScope()` orqali. Bo'sh qamrov (`isEmptyScope`) → `403`, nol emas. Nol «bu filial hech narsa topmadi» degani, `403` esa «sizga ko'rish mumkin emas» — bular boshqa-boshqa da'vo.
- **Rol darajalari:** `money` faqat CEO + Filial direktori; `outreach` qatorlari + Administrator; `topDebtors`, `people`, `nextLessons` + Kassir. O'qituvchi bu endpointni umuman chaqirmaydi.
- **Frontend va backend rol filtri ikkalasi ham bo'lishi shart** (CLAUDE.md RBAC qoidasi): frontend blokni chizmaydi, backend `null` qaytaradi.
- **UI matni lotin alifbosidagi o'zbekcha.**
- **Test buyruqlari:** backend `cd server && npm test`; frontend `cd client && npx vitest run` va `npm run build`.
- **Shox:** `feat/dashboard-home-redesign` (Faza 1 shu yerda).

**Spec:** [docs/superpowers/specs/2026-09-01-dashboard-home-redesign-design.md](../specs/2026-09-01-dashboard-home-redesign-design.md)
**Faza 1 rejasi:** [2026-09-01-dashboard-home-phase1.md](2026-09-01-dashboard-home-phase1.md)

---

## Faza 1 dan keyin aniqlangan ikki tuzatish

Faza 1 tiplari «o'zgarmaydi» deb yozilgan edi. Backend imzolari o'qilgach ikkita joyda tip **noto'g'ri** ekani ma'lum bo'ldi; ikkalasi ham Faza 2 da tuzatiladi:

1. **`DashboardPeople.todayLessons: number` → `number | null`.**
   Bugungi darslar soni `DashboardService.getTodaySchedule` dan keladi, u esa **bitta filialni** talab qiladi (jadval o'sha filialning xonalari va ish vaqtiga chiziladi). «Barcha filiallar» rejimida bu son mavjud emas. `0` qaytarish yolg'on bo'lardi — bugun 34 ta dars bor, shunchaki qaysi filialda ekani aytilmagan.

2. **`DashboardSummary.nextLessons` kunning BARCHA darslarini olib keladi**, faqat keyingi 5 tasini emas.
   «Keyingi» degani mijozning soatiga bog'liq, server soati esa boshqa mintaqada bo'lishi mumkin. Server kunni beradi, mijozdagi `pickNextLessons` o'z soatiga qarab tanlaydi — bu funksiya Faza 1 da yozilgan va sinovdan o'tgan.

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
|---|---|
| `server/src/reports/reports.service.ts` | **Tahrir:** `getNetProfitWithBasis` qo'shiladi (kontrollerdan ko'chiriladi) |
| `server/src/reports/reports.controller.ts` | **Tahrir:** o'sha blok o'rniga servis chaqiruvi |
| `server/src/dashboard/dashboard-summary.types.ts` | Javob tiplari — frontend tiplarining aynan nusxasi |
| `server/src/dashboard/dashboard-summary.service.ts` | Bloklarni yig'adi, rolga qarab kesadi, keshlaydi |
| `server/src/dashboard/dashboard-summary.service.spec.ts` | Rol filtri, bo'sh qamrov, fail-soft testlari |
| `server/src/dashboard/dto/dashboard-summary-query.dto.ts` | `branchId?: number` |
| `server/src/dashboard/dashboard.controller.ts` | **Tahrir:** `@Get('summary')` |
| `server/src/dashboard/dashboard.controller.spec.ts` | **Tahrir:** guard va delegatsiya testi |
| `server/src/dashboard/dashboard.module.ts` | **Tahrir:** Reports/Payments/Outreach/Redis import |
| `client/src/components/dashboard/dashboard-summary-types.ts` | **Tahrir:** yuqoridagi ikki tuzatish |
| `client/src/components/dashboard/home-overview.tsx` | **Tahrir:** fixture → `useQuery` |
| `client/src/components/dashboard/home-people-stats.tsx` | **Tahrir:** `todayLessons === null` → `—` |
| `client/src/components/dashboard/home-error-note.tsx` | Yiqilgan bo'lim uchun kichik xabar |
| `client/src/components/dashboard/home-fixture.ts` | **O'CHIRILADI** |

---

### Task 1: Sof foyda hisobini kontrollerdan servisga ko'chirish

Kanonik sof foyda (`recognized` yoki `cash` asos) hozir `ReportsController.getFinancialOverview` ning **ichida** turibdi. Bosh sahifa uni chaqira olmaydi; nusxa ko'chirish esa «qaysi asos» qarorini ikki joyga bo'lardi. Shuning uchun u avval servisga chiqariladi. **Bu refaktoring — tashqi xatti-harakat o'zgarmaydi.**

**Files:**
- Modify: `server/src/reports/reports.service.ts`
- Modify: `server/src/reports/reports.controller.ts:281-310`
- Test: `server/src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: mavjud `ReportsService.getMonthlyNetProfit`
- Produces: `ReportsService.getNetProfitWithBasis(companyId, { month, branchIds, performedById, cashFallback }): Promise<{ netProfit: number; netProfitBasis: 'recognized' | 'cash' }>`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/reports/reports.service.spec.ts` oxiriga:

```ts
describe('getNetProfitWithBasis', () => {
  it("kanonik hisob ishlasa 'recognized' asosini qaytaradi", async () => {
    jest
      .spyOn(service, 'getMonthlyNetProfit')
      .mockResolvedValue({ netProfit: 4_700_000 } as any);

    const res = await service.getNetProfitWithBasis(1001, {
      month: '2026-08',
      branchIds: null,
      performedById: 10406,
      cashFallback: 78_000_000,
    });

    expect(res).toEqual({ netProfit: 4_700_000, netProfitBasis: 'recognized' });
  });

  it("kanonik hisob yiqilsa kassa raqamiga tushadi va buni 'cash' deb belgilaydi", async () => {
    jest
      .spyOn(service, 'getMonthlyNetProfit')
      .mockRejectedValue(new Error('salary config yo\'q'));

    const res = await service.getNetProfitWithBasis(1001, {
      month: '2026-08',
      branchIds: null,
      performedById: 10406,
      cashFallback: 78_000_000,
    });

    expect(res).toEqual({ netProfit: 78_000_000, netProfitBasis: 'cash' });
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishini ko'rish**

Run: `cd server && npx jest src/reports/reports.service.spec.ts -t getNetProfitWithBasis`
Expected: FAIL — `service.getNetProfitWithBasis is not a function`

- [ ] **Step 3: Servisga metodni qo'shish**

`reports.service.ts` ichida, `getMonthlyNetProfit` dan keyin. Sinfda `Logger` yo'q bo'lsa, `private readonly logger = new Logger(ReportsService.name);` maydonini ham qo'shing va `Logger` ni `@nestjs/common` dan import qiling.

```ts
  /**
   * Kanonik sof foyda va u qaysi asosda hisoblanganini birga qaytaradi.
   *
   * NEGA SERVISDA: bu qaror ilgari `ReportsController.getFinancialOverview`
   * ichida turgan edi, ya'ni undan tashqarida hech kim foydalana olmasdi.
   * Bosh sahifaning «Sof foyda» kartasi ham aynan shu raqamni ko'rsatishi
   * kerak, nusxa ko'chirish esa «qaysi asos» qarorini ikki joyga bo'lib
   * yuborardi — bir kuni biri o'zgarib, ikki sahifa bir oy uchun ikki xil
   * foyda ko'rsatib turardi.
   *
   * `cash` — kanonik hisob yiqilgani va bu ESKI kassa raqami degani: ustoz
   * oyligi keyingi davrda to'lanadi, shuning uchun kassa raqami haqiqiy
   * foydadan ancha yuqori chiqadi (2026-iyun dagi +78M xatosi shundan edi).
   * Chaqiruvchi buni YASHIRMASLIGI shart — kartaning sarlavhasi o'zgaradi.
   */
  async getNetProfitWithBasis(
    companyId: number,
    {
      month,
      branchIds,
      performedById,
      cashFallback,
    }: {
      month: string;
      branchIds: ReportBranchIds;
      performedById: number;
      /** Kanonik hisob yiqilganda ishlatiladigan kassa raqami. */
      cashFallback: number;
    },
  ): Promise<{ netProfit: number; netProfitBasis: 'recognized' | 'cash' }> {
    try {
      const np = await this.getMonthlyNetProfit(companyId, {
        month,
        branchIds,
        performedById,
      });
      return { netProfit: np.netProfit, netProfitBasis: 'recognized' };
    } catch (err) {
      // Sababni yutib yubormaymiz: doimiy nosozlik ko'rinmay qolsa, natija
      // noto'g'ri raqam bo'ladi — xatosiz, va hech kim qaramaydi.
      this.logger.warn(
        `Monthly net profit failed for company ${companyId} (${month}) — ` +
          `caller falls back to the cash figure: ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
      return { netProfit: cashFallback, netProfitBasis: 'cash' };
    }
  }
```

- [ ] **Step 4: Kontrollerni servisga bog'lash**

`reports.controller.ts` da quyidagi blokni (`let netProfit = overview.netProfit;` dan `netProfitBasis = 'cash';` bilan tugaydigan `catch` gacha, izohlari bilan birga) shu ikki qatorga almashtiring:

```ts
    // Kanonik «Foyda» — Excel «Sof foyda» bilan bir xil raqam. Qaror
    // `ReportsService.getNetProfitWithBasis` da, bosh sahifa ham shuni chaqiradi.
    const { netProfit, netProfitBasis } =
      await this.reportsService.getNetProfitWithBasis(user.companyId, {
        month,
        branchIds,
        performedById: user.id,
        cashFallback: overview.netProfit,
      });
```

`this.logger` kontrollerda boshqa joyda ishlatilmasa ham, uni **o'chirmang** — boshqa `catch` bloklari bor.

- [ ] **Step 5: Testlarni ishga tushirish**

Run: `cd server && npx jest src/reports`
Expected: barcha reports testlari PASS (yangi ikkitasi ham).

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/reports.service.ts server/src/reports/reports.controller.ts \
        server/src/reports/reports.service.spec.ts
git commit -m "Sof foyda asosini tanlash kontrollerdan servisga ko'chdi"
```

---

### Task 2: DashboardSummaryService — pul va odamlar bloklari

**Files:**
- Create: `server/src/dashboard/dashboard-summary.types.ts`
- Create: `server/src/dashboard/dashboard-summary.service.ts`
- Test: `server/src/dashboard/dashboard-summary.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 dagi `getNetProfitWithBasis`; mavjud `ReportsService.getFinancialOverview` / `.getKpis`, `PaymentsService.getDebtorSummary`, `DashboardService.getTodaySchedule`
- Produces:
  - Tiplar: `DashboardMoney`, `DashboardPeople`, `DashboardTopDebtor`, `DashboardAttention`, `DashboardNextLesson`, `DashboardSummaryResponse`
  - `DashboardSummaryService.getSummary(ctx): Promise<DashboardSummaryResponse>` — `ctx` = `{ userId, companyId, roles, branchScope }`

- [ ] **Step 1: Tiplar faylini yaratish**

`server/src/dashboard/dashboard-summary.types.ts`:

```ts
/**
 * `GET /dashboard/summary` javobi. Mijozdagi
 * `client/src/components/dashboard/dashboard-summary-types.ts` bilan
 * MAYDONMA-MAYDON bir xil bo'lishi shart — biri o'zgarsa, ikkinchisi ham.
 */

export interface DashboardMoney {
  monthIncome: number;
  paymentCount: number;
  expectedMonthEnd: number;
  netProfit: number;
  netProfitBasis: 'recognized' | 'cash';
  debt: { total: number; count: number };
}

export interface DashboardPeople {
  activeStudents: number;
  newThisMonth: number;
  leftThisMonth: number;
  activeGroups: number;
  attendancePct: number;
  /** Filial tanlanmagan bo'lsa `null` — jadval bitta filialga bog'liq. */
  todayLessons: number | null;
}

export interface DashboardTopDebtor {
  id: number;
  name: string;
  balance: number;
}

export interface DashboardAttention {
  todayAbsentees: number;
  brokenPromises: number;
  removalQueue: number;
  topDebtors: DashboardTopDebtor[];
}

export interface DashboardNextLesson {
  groupId: string;
  groupName: string;
  startTime: string;
  endTime: string;
  teacherName: string | null;
  roomName: string | null;
  studentCount: number;
}

export interface DashboardSummaryResponse {
  money: DashboardMoney | null;
  people: DashboardPeople | null;
  attention: DashboardAttention | null;
  /**
   * BUGUNGI KUNNING BARCHA darslari, vaqt bo'yicha saralangan — «keyingi 5 ta»
   * emas. Qaysi dars «keyingi» ekani mijozning soatiga bog'liq, server soati
   * boshqa mintaqada bo'lishi mumkin. Mijozdagi `pickNextLessons` tanlaydi.
   * Filial tanlanmagan bo'lsa `null`.
   */
  nextLessons: DashboardNextLesson[] | null;
  /** Yiqilgan bo'limlar: `['money']` kabi. Bo'sh bo'lsa hammasi joyida. */
  failed: string[];
}
```

- [ ] **Step 2: Yiqiladigan testni yozish**

`server/src/dashboard/dashboard-summary.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DashboardSummaryService } from './dashboard-summary.service';
import { ReportsService } from '../reports/reports.service';
import { PaymentsService } from '../payments/payments.service';
import { OutreachService } from '../outreach/outreach.service';
import { DashboardService } from './dashboard.service';
import { RedisService } from '../redis/redis.service';

const financialOverview = {
  income: { actual: 128_450_000, paymentCount: 214 },
  forecast: { expectedMonthEnd: 176_200_000 },
  netProfit: 78_000_000,
};

const kpis = {
  activeStudents: { current: 842, trend: 3 },
  activeGroups: 47,
  averageAttendance: 88,
  newStudentsThisMonth: 63,
  churnedThisMonth: 19,
};

const debtorSummary = {
  totalDebt: -27_748_684,
  debtorCount: 177,
  avgDebt: -156_772,
  openPromises: 9,
  overduePromises: 5,
};

const todaySchedule = {
  lessons: [
    {
      groupId: 'g1',
      groupName: 'A1-07',
      startTime: '09:00',
      endTime: '10:30',
      roomName: '101-xona',
      teachers: [{ id: 1, firstName: 'Aziza', lastName: 'Karimova' }],
      studentCount: 14,
    },
  ],
};

function makeService(overrides: Record<string, any> = {}) {
  const reports = {
    getFinancialOverview: jest.fn().mockResolvedValue(financialOverview),
    getNetProfitWithBasis: jest
      .fn()
      .mockResolvedValue({ netProfit: 18_930_000, netProfitBasis: 'recognized' }),
    getKpis: jest.fn().mockResolvedValue(kpis),
    ...overrides.reports,
  };
  const payments = {
    getDebtorSummary: jest.fn().mockResolvedValue(debtorSummary),
    getDebtors: jest.fn().mockResolvedValue({ data: [] }),
    ...overrides.payments,
  };
  const outreach = {
    getStats: jest.fn().mockResolvedValue({
      todayAbsentees: 12,
      removalQueue: 3,
      activePromises: 8,
      callsToday: 4,
    }),
    ...overrides.outreach,
  };
  const dashboard = {
    getTodaySchedule: jest.fn().mockResolvedValue(todaySchedule),
    ...overrides.dashboard,
  };
  const redis = { get: jest.fn().mockResolvedValue(null), setex: jest.fn() };

  const service = new DashboardSummaryService(
    reports as any,
    payments as any,
    outreach as any,
    dashboard as any,
    redis as any,
  );
  return { service, reports, payments, outreach, dashboard, redis };
}

const CEO = { userId: 10406, companyId: 1001, roles: ['CEO'], branchScope: [1] };

describe('DashboardSummaryService.getSummary', () => {
  it('CEO uchun pul bloki to\'ladi', async () => {
    const { service } = makeService();
    const res = await service.getSummary(CEO);

    expect(res.money).toEqual({
      monthIncome: 128_450_000,
      paymentCount: 214,
      expectedMonthEnd: 176_200_000,
      netProfit: 18_930_000,
      netProfitBasis: 'recognized',
      debt: { total: 27_748_684, count: 177 },
    });
  });

  it('administrator uchun pul bloki null va moliya servisi umuman chaqirilmaydi', async () => {
    const { service, reports } = makeService();
    const res = await service.getSummary({
      ...CEO,
      roles: ['Administrator'],
    });

    expect(res.money).toBeNull();
    expect(reports.getFinancialOverview).not.toHaveBeenCalled();
  });

  it('kassir uchun outreach sonlari nol, top qarzdorlar qoladi', async () => {
    const { service, payments, outreach } = makeService({
      payments: {
        getDebtors: jest.fn().mockResolvedValue({
          data: [{ id: 10061, firstName: 'Sardor', lastName: 'Nazarov', balance: -1_240_000 }],
        }),
      },
    });
    const res = await service.getSummary({ ...CEO, roles: ['Cashier'] });

    expect(outreach.getStats).not.toHaveBeenCalled();
    expect(res.attention).toEqual({
      todayAbsentees: 0,
      brokenPromises: 0,
      removalQueue: 0,
      topDebtors: [{ id: 10061, name: 'Sardor Nazarov', balance: -1_240_000 }],
    });
    expect(payments.getDebtors).toHaveBeenCalled();
  });

  it('bo\'sh filial qamrovi 403 beradi', async () => {
    const { service } = makeService();
    await expect(
      service.getSummary({ ...CEO, branchScope: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moliya yiqilsa qolgan bloklar chiqadi va failed da nomi turadi', async () => {
    const { service } = makeService({
      reports: {
        getFinancialOverview: jest.fn().mockRejectedValue(new Error('db yiqildi')),
      },
    });
    const res = await service.getSummary(CEO);

    expect(res.money).toBeNull();
    expect(res.failed).toContain('money');
    expect(res.people).not.toBeNull();
    expect(res.people!.activeStudents).toBe(842);
  });

  it('filial tanlanmasa jadval null, todayLessons ham null', async () => {
    const { service, dashboard } = makeService();
    const res = await service.getSummary({ ...CEO, branchScope: null });

    expect(res.nextLessons).toBeNull();
    expect(res.people!.todayLessons).toBeNull();
    expect(dashboard.getTodaySchedule).not.toHaveBeenCalled();
  });

  it('darslar mijoz kutgan shaklga o\'giriladi', async () => {
    const { service } = makeService();
    const res = await service.getSummary(CEO);

    expect(res.nextLessons).toEqual([
      {
        groupId: 'g1',
        groupName: 'A1-07',
        startTime: '09:00',
        endTime: '10:30',
        teacherName: 'Aziza Karimova',
        roomName: '101-xona',
        studentCount: 14,
      },
    ]);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, yiqilishini ko'rish**

Run: `cd server && npx jest src/dashboard/dashboard-summary.service.spec.ts`
Expected: FAIL — `Cannot find module './dashboard-summary.service'`

- [ ] **Step 4: Servisni yozish**

`server/src/dashboard/dashboard-summary.service.ts`:

```ts
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
    // degan boshqa da'vo bo'lardi.
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
        // Buzilgan yozuv — qayta hisoblaymiz.
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

    // Yiqilgan javob keshlanmaydi — aks holda vaqtinchalik nosozlik bir
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
   * holatida chizadi.
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
      topDebtors: debtors.data.map((d: any) => ({
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
      .map((l: any) => ({
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
```

- [ ] **Step 5: Testni qayta ishga tushirish**

Run: `cd server && npx jest src/dashboard/dashboard-summary.service.spec.ts`
Expected: PASS — 7 ta test.

- [ ] **Step 6: Commit**

```bash
git add server/src/dashboard/dashboard-summary.types.ts \
        server/src/dashboard/dashboard-summary.service.ts \
        server/src/dashboard/dashboard-summary.service.spec.ts
git commit -m "Bosh sahifa: DashboardSummaryService"
```

---

### Task 3: Endpoint, modul ulanishi va guard testlari

**Files:**
- Create: `server/src/dashboard/dto/dashboard-summary-query.dto.ts`
- Modify: `server/src/dashboard/dashboard.controller.ts`
- Modify: `server/src/dashboard/dashboard.module.ts`
- Test: `server/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**
- Consumes: Task 2 dagi `DashboardSummaryService.getSummary`
- Produces: `GET /api/dashboard/summary?branchId=` — javob `DashboardSummaryResponse`

- [ ] **Step 1: DTO yaratish**

`server/src/dashboard/dto/dashboard-summary-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class DashboardSummaryQueryDto {
  /**
   * Tanlangan filial. `@BranchScope()` uni chaqiruvchining ruxsat shifti
   * bilan kesib beradi, shuning uchun bu yerda tekshiruv shart emas —
   * qamrovni servis emas, dekorator hal qiladi.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}
```

- [ ] **Step 2: Guard testini yozish**

Mavjud `dashboard.controller.spec.ts` `Reflector` va `ROLES_KEY` ishlatadi — o'sha uslubni davom ettiring, `Reflect.getMetadata` ni emas.

Avval provayder qo'shing (mavjud `beforeEach` ichiga):

```ts
  const mockSummaryService = {
    getSummary: jest.fn().mockResolvedValue({
      money: null,
      people: null,
      attention: null,
      nextLessons: null,
      failed: [],
    }),
  };
```

va `providers` ro'yxatiga:

```ts
        { provide: DashboardSummaryService, useValue: mockSummaryService },
```

Keyin faylning oxiriga (tashqi `describe` ichida):

```ts
  describe('getSummary()', () => {
    it("o'qituvchi va o'quvchiga yopiq, qolgan xodimlarga ochiq", () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getSummary);
      expect(roles).toEqual([
        'CEO',
        'Branch Director',
        'Administrator',
        'Cashier',
      ]);
    });

    it("servisga chaqiruvchining konteksti bilan topshiradi", async () => {
      await controller.getSummary(
        { branchId: 1 } as any,
        { id: 10406, companyId: 1001, roles: ['CEO'] } as any,
        [1],
      );
      expect(mockSummaryService.getSummary).toHaveBeenCalledWith({
        userId: 10406,
        companyId: 1001,
        roles: ['CEO'],
        branchScope: [1],
      });
    });
  });
```

`DashboardSummaryService` ni fayl boshida import qiling.

- [ ] **Step 3: Testni ishga tushirib, yiqilishini ko'rish**

Run: `cd server && npx jest src/dashboard/dashboard.controller.spec.ts`
Expected: FAIL — `getSummary` mavjud emas.

- [ ] **Step 4: Endpointni qo'shish**

`dashboard.controller.ts` ga (mavjud `getTodaySchedule` dan keyin):

```ts
  /**
   * Bosh sahifaning boshqaruv paneli. O'qituvchi bu yerga kirmaydi — u `/` da
   * jadvalni ko'radi, va bu endpoint markazning pul ko'rsatkichlarini olib
   * keladi. Rol filtri servisning ichida ham bor: guard kimni kiritishni,
   * servis esa kim nimani ko'rishini hal qiladi.
   */
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  @Get('summary')
  getSummary(
    @Query() _query: DashboardSummaryQueryDto,
    @CurrentUser() user: { id: number; companyId: number; roles: string[] },
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.dashboardSummaryService.getSummary({
      userId: user.id,
      companyId: user.companyId,
      roles: user.roles,
      branchScope,
    });
  }
```

`_query` ataylab ishlatilmaydi: `branchId` ni `@BranchScope()` o'qiydi, DTO esa uni **validatsiya qilish** uchun turadi (yaroqsiz qiymat 400 beradi). Konstruktorga `private readonly dashboardSummaryService: DashboardSummaryService` ni qo'shing va DTO import qiling.

- [ ] **Step 5: Modulni ulash**

`dashboard.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { HolidaysModule } from '../holidays/holidays.module';
import { ReportsModule } from '../reports/reports.module';
import { PaymentsModule } from '../payments/payments.module';
import { OutreachModule } from '../outreach/outreach.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    HolidaysModule,
    ReportsModule,
    PaymentsModule,
    OutreachModule,
    RedisModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardSummaryService],
})
export class DashboardModule {}
```

Agar bu modullar servislarini `exports` qilmagan bo'lsa, har birining `@Module` da `exports: [XService]` qatoriga qo'shing. Aylanma bog'liqlik (circular dependency) chiqsa, `forwardRef(() => ReportsModule)` ishlating va sababini izohda yozing.

- [ ] **Step 6: Testlarni ishga tushirish**

Run: `cd server && npx jest src/dashboard`
Expected: barcha dashboard testlari PASS.

- [ ] **Step 7: Tirik endpointni tekshirish**

Backend ishlab turganida:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"900000000","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
curl -s "http://localhost:4000/api/dashboard/summary?branchId=1" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
```

Kutilgan: `money`, `people`, `attention`, `nextLessons` to'lgan, `failed` bo'sh.
Keyin administrator (`937858389`) bilan takrorlang: `money` **null** bo'lishi shart.

- [ ] **Step 8: Commit**

```bash
git add server/src/dashboard
git commit -m "Bosh sahifa: GET /dashboard/summary endpointi"
```

---

### Task 4: Frontendni haqiqiy ma'lumotga ulash

**Files:**
- Modify: `client/src/components/dashboard/dashboard-summary-types.ts`
- Modify: `client/src/components/dashboard/home-overview.tsx`
- Modify: `client/src/components/dashboard/home-people-stats.tsx`
- Create: `client/src/components/dashboard/home-error-note.tsx`
- Delete: `client/src/components/dashboard/home-fixture.ts`

**Interfaces:**
- Consumes: Task 3 dagi `GET /dashboard/summary`
- Produces: `HomeErrorNote({ label }: { label: string })`

- [ ] **Step 1: Tiplarni backend bilan moslashtirish**

`dashboard-summary-types.ts` da ikki o'zgarish:

```ts
  /** Filial tanlanmagan bo'lsa `null` — jadval bitta filialga bog'liq. */
  todayLessons: number | null;
```

va `nextLessons` izohini almashtiring:

```ts
  /**
   * BUGUNGI KUNNING BARCHA darslari, vaqt bo'yicha saralangan. Qaysi biri
   * «keyingi» ekanini `pickNextLessons` MIJOZNING soatiga qarab tanlaydi —
   * server boshqa mintaqada bo'lishi mumkin. Filial tanlanmagan bo'lsa `null`.
   */
  nextLessons: DashboardNextLesson[] | null;
```

- [ ] **Step 2: `todayLessons === null` holatini chizish**

`home-people-stats.tsx` da «Bugungi darslar» sanagichi:

```tsx
      <PeopleStat
        icon={CalendarDays}
        label="Bugungi darslar"
        value={
          people.todayLessons === null
            ? "—"
            : formatNumber(people.todayLessons)
        }
        hint={people.todayLessons === null ? "filial tanlanmagan" : undefined}
        href="/schedule"
      />
```

- [ ] **Step 3: Xato xabari komponentini yozish**

`client/src/components/dashboard/home-error-note.tsx`:

```tsx
import { TriangleAlert } from "lucide-react";

/**
 * Bitta bo'lim yiqilganda uning O'RNIGA chiziladi. Butun sahifa emas —
 * moliya yiqilgani davomat ma'lumotini ko'rsatmaslikka sabab emas.
 */
export function HomeErrorNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
      <TriangleAlert className="size-4 shrink-0 text-orange-600 dark:text-orange-400" />
      {label} ma&apos;lumotini olishda xatolik. Sahifani yangilab ko&apos;ring.
    </div>
  );
}
```

- [ ] **Step 4: `HomeOverview` ni so'rovga ulash**

`home-overview.tsx` ni to'liq almashtiring:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { resolveHomeSections } from "./dashboard-home-visibility";
import type { DashboardSummary } from "./dashboard-summary-types";
import { HomeAttentionList } from "./home-attention-list";
import { HomeErrorNote } from "./home-error-note";
import { HomeMoneyCards } from "./home-money-cards";
import { HomeNextLessons } from "./home-next-lessons";
import { HomePeopleStats } from "./home-people-stats";
import { HomeSkeleton } from "./home-skeleton";

/**
 * Bosh sahifadagi boshqaruv paneli — ma'lumotning yagona manbai.
 *
 * Bloklar ma'lumotni faqat `props` orqali oladi, shuning uchun manbani
 * almashtirish (Faza 1 dagi fixture → shu so'rov) ularning birortasiga ham
 * tegmadi.
 */
export function HomeOverview() {
  const user = useAuth((s) => s.user);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const sections = resolveHomeSections(roleIds);

  const { data, isPending } = useQuery({
    queryKey: ["dashboard", "summary", selectedBranch?.id ?? "all"],
    queryFn: () =>
      api
        .get<DashboardSummary>("/dashboard/summary", {
          params: selectedBranch ? { branchId: selectedBranch.id } : undefined,
        })
        .then((r) => r.data),
    // Filial almashtirgichi hydrate bo'lgunicha kutamiz: usiz birinchi so'rov
    // «barcha filiallar» bo'lib ketadi va darhol ikkinchisi ketadi.
    enabled: branchLoaded,
    staleTime: 30_000,
  });

  if (isPending || !data) return <HomeSkeleton />;

  const failed = (s: string) => data.failed.includes(s);

  return (
    <div className="space-y-4 sm:space-y-6">
      {sections.money &&
        (data.money ? (
          <HomeMoneyCards money={data.money} />
        ) : failed("money") ? (
          <HomeErrorNote label="Moliya" />
        ) : null)}

      {sections.people &&
        (data.people ? (
          <HomePeopleStats people={data.people} />
        ) : failed("people") ? (
          <HomeErrorNote label="O'quvchilar" />
        ) : null)}

      <div className="grid gap-3 lg:grid-cols-5 lg:gap-4">
        {sections.attention && (
          <div className="lg:col-span-3">
            {data.attention ? (
              <HomeAttentionList
                attention={data.attention}
                includeOutreach={sections.attentionOutreachRows}
              />
            ) : failed("attention") ? (
              <HomeErrorNote label="E'tibor ro'yxati" />
            ) : null}
          </div>
        )}
        {sections.nextLessons && (
          <div className="lg:col-span-2">
            {failed("nextLessons") ? (
              <HomeErrorNote label="Jadval" />
            ) : (
              <HomeNextLessons lessons={data.nextLessons} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Fixture'ni o'chirish**

```bash
git rm client/src/components/dashboard/home-fixture.ts
```

- [ ] **Step 6: Tekshiruv**

Run: `cd client && npx tsc --noEmit`
Expected: 0 error — agar `home-fixture` ga qolgan havola bo'lsa, shu yerda chiqadi.

Run: `cd client && npx eslint src/components/dashboard`
Expected: xatosiz.

Run: `cd client && npx vitest run`
Expected: 87 test PASS (rol mantiqi testlari o'zgarmagan).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/dashboard
git commit -m "Bosh sahifa: haqiqiy ma'lumotga ulandi, fixture o'chirildi"
```

---

### Task 5: Yakuniy tekshiruv

**Files:** faqat topilgan kamchiliklar tuzatiladi.

- [ ] **Step 1: Backend to'liq test to'plami**

Run: `cd server && npm test`
Expected: barcha testlar PASS.

- [ ] **Step 2: Frontend build**

Run: `cd client && npm run build`
Expected: muvaffaqiyatli.

- [ ] **Step 3: Raqamlarni solishtirish — eng muhim tekshiruv**

CEO bilan kirib, bitta filialni tanlang va **yonma-yon** solishtiring:

| Bosh sahifadagi karta | Solishtiriladigan sahifa | Mos kelishi shart |
|---|---|---|
| Bu oy tushum | `/payments/overview` (davr = shu oy) | Tushum raqami |
| Oy oxiriga kutilyapti | `/payments/overview` | «Oy oxiriga kutilyapti» |
| Sof foyda | `/payments/overview` | «Foyda» kartasi |
| Qarzdorlik | `/payments/debt` | Jami qarz va qarzdorlar soni |
| Bugun kelmadi | `/outreach` | «Bugun kelmadi» |
| Ketma-ket 3 marta | `/outreach` | «Ko'p dars qoldirgan» |
| Aktiv o'quvchilar | `/students` (Faol filtri) | Jami soni |

**Bironta raqam farq qilsa — bu bloker.** Sababi deyarli har doim bitta: filial qamrovi ikki chaqiruvda har xil hal qilingan. Farqni tuzatmasdan davom etmang.

- [ ] **Step 4: Rollarni aylanib chiqish**

| Login | Kutilgan |
|---|---|
| `900000000` (CEO) | Hamma blok, haqiqiy raqamlar |
| `917493002` (Filial direktori) | Hamma blok, faqat o'z filiali |
| `937858389` (Administrator) | Pul kartalari **yo'q** |
| `956320615` (Kassir) | Pul yo'q, e'tiborda faqat qarzdorlar |

Har birida brauzer devtools → Network → `summary` so'rovining javobini oching va `money` maydonini tekshiring: administrator va kassirda u **`null`** bo'lishi shart. Frontend yashirgani yetarli emas — backend ham bermasligi kerak.

- [ ] **Step 5: «Barcha filiallar» holati**

Filial almashtirgichini «Barcha filiallar» ga qo'ying. Kutilgan: pul, odamlar va e'tibor bloklari ishlaydi; «Bugungi darslar» sanagichi `—` ko'rsatadi; o'ng blokda filial tanlash haqidagi izoh chiqadi.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Bosh sahifa: yakuniy tuzatishlar"
```

---

## Faza 2 tugagach

- Faza 1 dagi `home-fixture.ts` o'chgan bo'lishi shart — kodda soxta raqam qolmasligi kerak.
- Deploy **avtomatik emas**: backend Railway'ga qo'lda (`railway up`), frontend Vercel'ga. Merge qilish deploy degani emas.
- Spec'dagi «Ochiq qoldirilgan qarorlar» ro'yxati o'z holicha qoladi: karta grafiklari, bloklarni sozlash, o'qituvchi uchun boyitilgan bosh sahifa — bular alohida ish.
