# Avans kalendari — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/payments/salary` sahifasiga «Avanslar» tabi qo'shish — oy kalendari, unda qaysi kuni qancha avans berilgani va kunni bosganda kim qancha olgani ko'rinadi.

**Architecture:** Faqat o'qish. Yangi backend servisi bitta `Expense.findMany` (`category: TEACHER_ADVANCE`) qiladi va oy chegarasi + filial qamrovini mavjud `resolveMonthlyScope`'dan oladi, guruhlashni xotirada bajaradi. Frontend butun oyni bitta so'rovda oladi, kunni bosganda qo'shimcha so'rov ketmaydi. Ledger, `SalaryPayment`, hisob-kitob mantig'i **umuman o'zgarmaydi**.

**Tech Stack:** NestJS + Prisma (server), Next.js + shadcn/ui + @tanstack/react-query (client), Jest (server testlari).

**Spec:** `docs/superpowers/specs/2026-08-03-avans-kalendari-design.md`

## Global Constraints

- **UI matni faqat lotin o'zbek.** Kirill yoki arab harflari aralashmaydi.
- **Pul** — `formatPrice` / `formatBalance` (`@/lib/format-utils`), qo'lda `toLocaleString` yozilmaydi. **Sana** — `dd.MM.yyyy`.
- **Tab holati URL'da** (`?tab=`), default qiymat (`oyliklar`) URL'ga **yozilmaydi**. `router.replace(..., { scroll: false })`, `push` emas.
- **Yuklanishda skeleton**, spinner emas (`<Skeleton>`).
- **Kun paneli `<Table>` emas, ro'yxat** — `<Table>` bo'lsa loyiha qoidasi `#` ustuni + 10 qatorli sahifalashni majburiy qiladi.
- **`Expense.date` — `@db.Date`.** Chegara: `gte: monthStart, lt: nextMonthStart` (siljitilmagan UTC sanalar, `resolveMonthlyScope`dan). Yangi chegara yasalmaydi, `lte` ishlatilmaydi.
- **Huquqlar:** ko'rish — `@Roles('CEO', 'Branch Director', 'Administrator')`; avans qo'shish — CEO/BD (mavjud tugma, o'zgarmaydi).
- **Hech qanday yozuv operatsiyasi yo'q** — yangi migratsiya yo'q, ledgerga tegilmaydi.
- Har task oxirida: server o'zgargan bo'lsa `cd server && npm test`, client o'zgargan bo'lsa `cd client && npm run build` — ikkalasi ham toza o'tishi shart.

## File Structure

**Server:**

| Fayl | Mas'uliyati |
|---|---|
| `server/src/salary/salary-advance-calendar.service.ts` | **Yangi.** Oy avanslarini o'qib, kun bo'yicha guruhlaydi va jamlarni hisoblaydi. Boshqa hech nima qilmaydi. |
| `server/src/salary/salary-advance-calendar.service.spec.ts` | **Yangi.** Guruhlash, jamlar, oy chegarasi, filial qamrovi testlari. |
| `server/src/salary/salary.module.ts` | Provider qo'shiladi. |
| `server/src/salary/salary.controller.ts` | `GET /salary/advance-calendar` endpoint'i. |
| `server/src/salary/salary.controller.spec.ts` | Yangi endpoint uchun `@Roles` metadata testi. |

**Client:**

| Fayl | Mas'uliyati |
|---|---|
| `client/src/components/payments/salary-client.tsx` | Tab qobig'i + URL holati. Ma'lumot mantig'i yo'q. |
| `client/src/components/payments/salary-advances-tab.tsx` | **Yangi.** Oy tanlagich, so'rov, statistika kartalari, kalendar + panel joylashuvi. |
| `client/src/components/payments/salary-advance-calendar.tsx` | **Yangi.** Faqat oy setkasi (sof ko'rsatish komponenti). |
| `client/src/components/payments/salary-advance-day-panel.tsx` | **Yangi.** Faqat tanlangan kun ro'yxati. |
| `client/src/components/payments/salary-add-advance-dialog.tsx` | `defaultDate` prop qo'shiladi. |
| `client/src/components/payments/employee-advance-select.tsx` | `employeeRoleLabel` eksport qilinadi (lavozim yorlig'i takrorlanmasin). |

---

### Task 1: Backend — avans kalendari servisi va endpoint

**Files:**
- Create: `server/src/salary/salary-advance-calendar.service.ts`
- Test: `server/src/salary/salary-advance-calendar.service.spec.ts`
- Modify: `server/src/salary/salary.module.ts`
- Modify: `server/src/salary/salary.controller.ts` (konstruktor: 36–41-qatorlar; endpoint `getAdvances`dan keyin, ~312-qator)
- Modify: `server/src/salary/salary.controller.spec.ts:46-67` (`readers` ro'yxati)

**Interfaces:**
- Consumes: `resolveMonthlyScope(prisma, query, companyId, performedById)` → `{ month, floorMonth, monthStart, nextMonthStart, branchId, blocked }` (`server/src/salary/shared/resolve-monthly-scope.ts`).
- Produces: `SalaryAdvanceCalendarService.getCalendar(query: { month?: string }, companyId: number, performedById: number)` → `{ month, floorMonth, days: AdvanceCalendarDay[], totals: AdvanceCalendarTotals, advances: AdvanceCalendarRow[] }`. Task 2–4 shu shaklga tayanadi.

- [ ] **Step 1: Yiqiladigan testni yozish**

Yangi fayl `server/src/salary/salary-advance-calendar.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { SalaryAdvanceCalendarService } from './salary-advance-calendar.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Kunlik avans kalendari — bitta oyning TEACHER_ADVANCE xarajatlarini kun
 * bo'yicha guruhlaydi. Faqat o'qish: hech narsa yozmaydi, hech qanday
 * hisob-kitob mantig'iga tegmaydi.
 */
describe('SalaryAdvanceCalendarService', () => {
  let service: SalaryAdvanceCalendarService;
  let prisma: any;

  const ceoCaller = { mainBranch: 1, roles: [{ role: { name: 'CEO' } }] };
  const bdCaller = { mainBranch: 7, roles: [{ role: { name: 'Branch Director' } }] };
  const bdNoBranch = { mainBranch: null, roles: [{ role: { name: 'Branch Director' } }] };

  /** Bitta TEACHER_ADVANCE qatorini yasaydi (Prisma qaytaradigan shaklda). */
  function advance(over: Partial<any> = {}) {
    return {
      id: over.id ?? 'e1',
      amount: over.amount ?? 500_000,
      date: over.date ?? new Date('2026-07-15T00:00:00.000Z'),
      paymentMethod: over.paymentMethod ?? 'CASH',
      description: over.description ?? 'Avans',
      createdAt: over.createdAt ?? new Date('2026-07-15T09:00:00.000Z'),
      relatedUser: over.relatedUser ?? {
        id: 10005,
        firstName: 'Aziz',
        lastName: 'Karimov',
        roles: [{ role: { id: 4, name: 'Teacher' } }],
      },
      createdBy: over.createdBy ?? { id: 10001, firstName: 'Admin', lastName: 'A' },
    };
  }

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(ceoCaller) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryAdvanceCalendarService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryAdvanceCalendarService);
  });

  it('avanslarni kun bo‘yicha guruhlaydi va naqd/kartani ajratadi', async () => {
    prisma.expense.findMany.mockResolvedValue([
      advance({ id: 'a', amount: 1_000_000, paymentMethod: 'CASH' }),
      advance({ id: 'b', amount: 600_000, paymentMethod: 'CARD',
        relatedUser: { id: 10006, firstName: 'Malika', lastName: 'Tosheva', roles: [] } }),
      advance({ id: 'c', amount: 800_000, paymentMethod: 'CASH',
        date: new Date('2026-07-07T00:00:00.000Z') }),
    ]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    expect(res.days).toEqual([
      { date: '2026-07-07', total: 800_000, count: 1, cash: 800_000, card: 0 },
      { date: '2026-07-15', total: 1_600_000, count: 2, cash: 1_000_000, card: 600_000 },
    ]);
  });

  it('jamlarni hisoblaydi — summa, soni, kunlar, xodimlar, eng katta kun', async () => {
    prisma.expense.findMany.mockResolvedValue([
      advance({ id: 'a', amount: 1_000_000 }),
      advance({ id: 'b', amount: 600_000 }), // o'sha xodim, o'sha kun
      advance({ id: 'c', amount: 800_000, date: new Date('2026-07-07T00:00:00.000Z'),
        relatedUser: { id: 10006, firstName: 'Malika', lastName: 'Tosheva', roles: [] } }),
    ]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    expect(res.totals).toEqual({
      total: 2_400_000,
      count: 3,
      daysWithAdvances: 2,
      employeeCount: 2,
      maxDay: { date: '2026-07-15', total: 1_600_000 },
    });
  });

  it('avans yo‘q oyda bo‘sh natija va maxDay=null qaytaradi', async () => {
    prisma.expense.findMany.mockResolvedValue([]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    expect(res.days).toEqual([]);
    expect(res.advances).toEqual([]);
    expect(res.totals).toEqual({
      total: 0, count: 0, daysWithAdvances: 0, employeeCount: 0, maxDay: null,
    });
  });

  it('oy chegarasi @db.Date qoidasi bo‘yicha: gte oy boshi, lt keyingi oy boshi', async () => {
    await service.getCalendar({ month: '2026-07' }, 1, 10001);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.date).toEqual({
      gte: new Date(Date.UTC(2026, 6, 1)),
      lt: new Date(Date.UTC(2026, 7, 1)),
    });
    expect(where.category).toBe('TEACHER_ADVANCE');
    expect(where.deletedAt).toBeNull();
    expect(where.relatedUserId).toEqual({ not: null });
  });

  it('filial direktori uchun oluvchi xodimning filiali bo‘yicha filtrlaydi', async () => {
    prisma.user.findUnique.mockResolvedValue(bdCaller);

    await service.getCalendar({ month: '2026-07' }, 1, 10002);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.relatedUser).toEqual({ branches: { some: { branchId: 7 } } });
  });

  it('CEO uchun filial filtri qo‘yilmaydi', async () => {
    await service.getCalendar({ month: '2026-07' }, 1, 10001);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.relatedUser).toBeUndefined();
  });

  it('filiali yo‘q filial direktoriga hech narsa ko‘rsatmaydi (fail closed)', async () => {
    prisma.user.findUnique.mockResolvedValue(bdNoBranch);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10003);

    expect(res.advances).toEqual([]);
    expect(res.totals.total).toBe(0);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('so‘ralgan oyni kompaniya boshlanish oyigacha ko‘taradi', async () => {
    const res = await service.getCalendar({ month: '2026-01' }, 1, 10001);

    expect(res.month).toBe('2026-05');
    expect(res.floorMonth).toBe('2026-05');
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

```bash
cd server && npx jest src/salary/salary-advance-calendar.service.spec.ts
```

Kutilgan natija: FAIL — `Cannot find module './salary-advance-calendar.service'`.

- [ ] **Step 3: Servisni yozish**

Yangi fayl `server/src/salary/salary-advance-calendar.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';

/** Avans berilgan bitta kun. */
export interface AdvanceCalendarDay {
  date: string; // "YYYY-MM-DD"
  total: number;
  count: number;
  cash: number;
  card: number;
}

/** Bitta avans qatori — kun panelida shu ko'rsatiladi. */
export interface AdvanceCalendarRow {
  id: string;
  date: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD';
  description: string;
  createdAt: Date;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: { id: number; name: string }[];
  };
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

export interface AdvanceCalendarTotals {
  total: number;
  count: number;
  daysWithAdvances: number;
  employeeCount: number;
  maxDay: { date: string; total: number } | null;
}

/**
 * `@db.Date` ustuni sof kalendar sana bo'lib UTC yarim tunida saqlanadi —
 * shuning uchun UTC qismlari aynan Toshkent kalendar kunini beradi. Mahalliy
 * vaqtga o'tkazish bir kunlik siljish keltirib chiqaradi, shuning uchun
 * `toISOString` ishlatiladi.
 */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * «Avanslar» tabi — tanlangan oydagi TEACHER_ADVANCE xarajatlarini kun
 * bo'yicha guruhlab qaytaradi. Butun oy bitta javobda ketadi (oyda odatda
 * 10–40 ta avans), shuning uchun kunni bosganda qo'shimcha so'rov kerak emas.
 *
 * Oy chegarasi va filial qamrovi `resolveMonthlyScope`dan olinadi — bu bilan
 * tab «Oyliklar» jadvali bilan bir xil oy floor'i va bir xil filial qoidasida
 * bo'ladi. Filial qamrovi OLUVCHI xodimning filiali bo'yicha (`Expense.branchId`
 * emas), chunki `getMonthly`dagi «Avans» ustuni ham shunday qamraladi — ikki xil
 * predikat bitta sahifada ikki xil raqam bergan bo'lardi.
 */
@Injectable()
export class SalaryAdvanceCalendarService {
  constructor(private prisma: PrismaService) {}

  async getCalendar(
    query: { month?: string },
    companyId: number,
    performedById: number,
  ) {
    const scope = await resolveMonthlyScope(
      this.prisma,
      query,
      companyId,
      performedById,
    );
    const { month, floorMonth, monthStart, nextMonthStart, branchId, blocked } =
      scope;

    // Filialga bog'langan, lekin filiali noma'lum chaqiruvchi — hech nima
    // ko'rmaydi. Pul yo'llari fail-closed bo'lishi shart.
    if (blocked) {
      return {
        month,
        floorMonth,
        days: [] as AdvanceCalendarDay[],
        totals: {
          total: 0,
          count: 0,
          daysWithAdvances: 0,
          employeeCount: 0,
          maxDay: null,
        } as AdvanceCalendarTotals,
        advances: [] as AdvanceCalendarRow[],
      };
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        companyId,
        category: 'TEACHER_ADVANCE',
        deletedAt: null,
        relatedUserId: { not: null },
        date: { gte: monthStart, lt: nextMonthStart },
        ...(branchId !== undefined && {
          relatedUser: { branches: { some: { branchId } } },
        }),
      },
      select: {
        id: true,
        amount: true,
        date: true,
        paymentMethod: true,
        description: true,
        createdAt: true,
        relatedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            roles: { select: { role: { select: { id: true, name: true } } } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    // `relatedUserId: { not: null }` filtri bor, lekin Prisma turi baribir
    // nullable — `!` o'rniga flatMap bilan xavfsiz tozalaymiz.
    const advances: AdvanceCalendarRow[] = expenses.flatMap((e) =>
      e.relatedUser
        ? [
            {
              id: e.id,
              date: dayKey(e.date),
              amount: e.amount,
              paymentMethod: e.paymentMethod as 'CASH' | 'CARD',
              description: e.description,
              createdAt: e.createdAt,
              user: {
                id: e.relatedUser.id,
                firstName: e.relatedUser.firstName,
                lastName: e.relatedUser.lastName,
                roles: e.relatedUser.roles.map((r) => r.role),
              },
              createdBy: e.createdBy,
            },
          ]
        : [],
    );

    const byDay = new Map<string, AdvanceCalendarDay>();
    const employees = new Set<number>();
    let total = 0;

    for (const a of advances) {
      total += a.amount;
      employees.add(a.user.id);
      const day = byDay.get(a.date) ?? {
        date: a.date,
        total: 0,
        count: 0,
        cash: 0,
        card: 0,
      };
      day.total += a.amount;
      day.count += 1;
      if (a.paymentMethod === 'CARD') day.card += a.amount;
      else day.cash += a.amount;
      byDay.set(a.date, day);
    }

    const days = [...byDay.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const maxDay = days.reduce<{ date: string; total: number } | null>(
      (best, d) =>
        best === null || d.total > best.total
          ? { date: d.date, total: d.total }
          : best,
      null,
    );

    return {
      month,
      floorMonth,
      days,
      totals: {
        total,
        count: advances.length,
        daysWithAdvances: days.length,
        employeeCount: employees.size,
        maxDay,
      },
      advances,
    };
  }
}
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

```bash
cd server && npx jest src/salary/salary-advance-calendar.service.spec.ts
```

Kutilgan natija: PASS (8 ta test).

- [ ] **Step 5: Modulga provider qo'shish**

`server/src/salary/salary.module.ts`:

```ts
import { SalaryAdvanceCalendarService } from './salary-advance-calendar.service';
```

`providers` massiviga `SalaryBreakdownService`dan keyin qo'shing:

```ts
    SalaryAdvanceCalendarService,
```

`exports`ga qo'shilmaydi — bu servisni faqat shu modulning kontrolleri ishlatadi.

- [ ] **Step 6: Kontroller endpoint'ini qo'shish**

`server/src/salary/salary.controller.ts` — import:

```ts
import { SalaryAdvanceCalendarService } from './salary-advance-calendar.service';
```

Konstruktorga (36–41-qatorlar) oxirgi parametr sifatida:

```ts
    private advanceCalendarService: SalaryAdvanceCalendarService,
```

`getAdvances` metodidan **keyin** endpoint:

```ts
  /**
   * Kunlik avans kalendari — «Avanslar» tabi. Tanlangan oydagi barcha
   * TEACHER_ADVANCE xarajatlari kun bo'yicha guruhlangan holda.
   *
   * Yo'l `advance-calendar`, `advances/calendar` EMAS: ikkinchisi yuqoridagi
   * `advances/:userId` marshrutiga tushib, ParseIntPipe'da 400 bo'lardi.
   *
   * `SalaryMonthlyQueryDto` qayta ishlatiladi (month regex allaqachon shu
   * yerda); undagi `search` bu endpoint uchun ma'nosiz, shuning uchun servisga
   * faqat `month` uzatiladi.
   */
  @Get('advance-calendar')
  @Roles('CEO', 'Branch Director', 'Administrator')
  getAdvanceCalendar(
    @Query() query: SalaryMonthlyQueryDto,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.advanceCalendarService.getCalendar(
      { month: query.month },
      companyId,
      performedById,
    );
  }
```

- [ ] **Step 7: Kontroller guard testini kengaytirish**

`server/src/salary/salary.controller.spec.ts:47-59` — `readers` massiviga `'getPaymentBreakdown'`dan keyin qo'shing:

```ts
      'getAdvanceCalendar',
```

- [ ] **Step 8: To'liq server test to'plamini yurgizish**

```bash
cd server && npm test
```

Kutilgan natija: barcha testlar PASS. Yiqilish bo'lsa — davom etmang, avval tuzating.

- [ ] **Step 9: Commit**

```bash
git add server/src/salary/salary-advance-calendar.service.ts \
        server/src/salary/salary-advance-calendar.service.spec.ts \
        server/src/salary/salary.module.ts \
        server/src/salary/salary.controller.ts \
        server/src/salary/salary.controller.spec.ts
git commit -m "Add a daily advance calendar endpoint to the salary module"
```

---

### Task 2: Frontend — tab qobig'i va «Avanslar» tabi skeleti

**Files:**
- Modify: `client/src/components/payments/salary-client.tsx`
- Create: `client/src/components/payments/salary-advances-tab.tsx`

**Interfaces:**
- Consumes: `GET /salary/advance-calendar?month=YYYY-MM` (Task 1).
- Produces: `<SalaryAdvancesTab canPay={boolean} />`. Task 3 va 4 shu faylga kalendar va panelni ulaydi.

- [ ] **Step 1: `salary-client.tsx` ni tabli qilish**

Faylni to'liq shu bilan almashtiring:

```tsx
"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { SalaryBreakdownDrawer } from "./salary-breakdown-drawer";
import { SalaryMonthlyView } from "./salary-monthly-view";
import { SalaryAdvancesTab } from "./salary-advances-tab";

/** URL'ga yozilmaydigan standart tab. */
const DEFAULT_TAB = "oyliklar";

export function SalaryClient() {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const canPay = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? DEFAULT_TAB;

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [breakdownPaymentId, setBreakdownPaymentId] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        {/* Sahifa sarlavhasi "Ish haqi" — tab nomlari ("Oyliklar" / "Avanslar")
            bilan takrorlanmasin. */}
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Ish haqi
        </h2>
        <p className="text-sm text-muted-foreground">
          Tanlangan oyda kimga qancha to&apos;lanishi va qaysi kuni qancha avans
          berilgani
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="oyliklar">Oyliklar</TabsTrigger>
          <TabsTrigger value="avanslar">Avanslar</TabsTrigger>
        </TabsList>

        <TabsContent value="oyliklar">
          <SalaryMonthlyView
            isCeo={isCeo}
            canPay={canPay}
            onOpenBreakdown={setBreakdownPaymentId}
            refreshKey={refreshKey}
            bumpRefresh={bumpRefresh}
          />
        </TabsContent>

        <TabsContent value="avanslar">
          <SalaryAdvancesTab canPay={canPay} />
        </TabsContent>
      </Tabs>

      <SalaryBreakdownDrawer
        salaryPaymentId={breakdownPaymentId}
        onClose={() => setBreakdownPaymentId(null)}
        isCeo={isCeo}
        canPay={canPay}
        onChanged={bumpRefresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: «Avanslar» tabini yaratish (statistika kartalari bilan)**

Yangi fayl `client/src/components/payments/salary-advances-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, HandCoins, Users, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
import { useUrlFilters } from "@/hooks/use-url-filters";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";
import { SalaryAddAdvanceDialog } from "./salary-add-advance-dialog";
import { currentMonthKey } from "./salary-utils";

export interface AdvanceDay {
  date: string;
  total: number;
  count: number;
  cash: number;
  card: number;
}

export interface AdvanceRow {
  id: string;
  date: string;
  amount: number;
  paymentMethod: "CASH" | "CARD";
  description: string;
  createdAt: string;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: { id: number; name: string }[];
  };
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

interface CalendarResponse {
  month: string;
  floorMonth: string;
  days: AdvanceDay[];
  totals: {
    total: number;
    count: number;
    daysWithAdvances: number;
    employeeCount: number;
    maxDay: { date: string; total: number } | null;
  };
  advances: AdvanceRow[];
}

const FALLBACK_FLOOR = "2026-05";

/**
 * Modul darajasida — komponent ichida yozilsa har renderda yangi obyekt bo'lib,
 * `useUrlFilters` ichidagi `useMemo` va `setFilters` identifikatori bekorga
 * yangilanib turadi. `salary-monthly-view.tsx:100` da ham shu shakl.
 * `month` kaliti «Oyliklar» tabi bilan BIR XIL — oy ikkala tabda umumiy.
 */
const filtersSchema = {
  month: { type: "string" as const, defaultValue: "" },
};

/** "2026-07-15" → "15.07". */
function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

/**
 * «Avanslar» tabi — oy davomida qaysi kuni qancha avans berilgani.
 * Butun oy bitta so'rovda keladi, shuning uchun kunni tanlash mahalliy holat.
 */
export function SalaryAdvancesTab({ canPay }: { canPay: boolean }) {
  const { filters, setFilters } = useUrlFilters(filtersSchema);
  const [addOpen, setAddOpen] = useState(false);

  const maxMonth = currentMonthKey();
  const month = filters.month || maxMonth;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["salary-advance-calendar", month],
    queryFn: () =>
      api
        .get<CalendarResponse>("/salary/advance-calendar", { params: { month } })
        .then((r) => r.data),
    staleTime: 0,
  });

  const totals = data?.totals;
  const floorMonth = data?.floorMonth ?? FALLBACK_FLOOR;
  const shownMonth = data?.month ?? month;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <MonthPicker
          value={shownMonth}
          minMonth={floorMonth}
          maxMonth={maxMonth}
          onChange={(m) => setFilters({ month: m })}
          className="sm:w-52"
        />
        <div className="flex-1" />
        {canPay && (
          <Button className="shrink-0" onClick={() => setAddOpen(true)}>
            <HandCoins className="size-4" />
            Avans qo&apos;shish
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={<HandCoins className="size-5 text-amber-700 dark:text-amber-300" />}
            tone="amber"
            label="Jami avans"
            value={totals ? formatBalance(totals.total) : "—"}
          />
          <SummaryCard
            icon={<CalendarDays className="size-5 text-blue-700 dark:text-blue-300" />}
            tone="blue"
            label="Berilgan kunlar"
            value={totals ? `${formatNumber(totals.daysWithAdvances)} kun` : "—"}
          />
          <SummaryCard
            icon={<Users className="size-5 text-violet-700 dark:text-violet-300" />}
            tone="violet"
            label="Xodimlar"
            value={totals ? `${formatNumber(totals.employeeCount)} ta` : "—"}
          />
          <SummaryCard
            icon={<TrendingUp className="size-5 text-red-700 dark:text-red-300" />}
            tone="red"
            label="Eng katta kun"
            value={
              totals?.maxDay
                ? `${shortDay(totals.maxDay.date)} — ${formatBalance(totals.maxDay.total)}`
                : "—"
            }
          />
        </div>
      )}

      {/* Kalendar va kun paneli Task 3–4 da shu yerga qo'shiladi. */}

      <SalaryAddAdvanceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => refetch()}
      />
    </div>
  );
}
```

- [ ] **Step 3: Build'ni tekshirish**

```bash
cd client && npm run build
```

Kutilgan natija: xatosiz build.

- [ ] **Step 4: Brauzerda tekshirish**

`/payments/salary` ni oching. Ikkita tab ko'rinishi kerak. «Avanslar» ni bosing — URL `?tab=avanslar` bo'ladi, to'rtta karta raqamlar bilan chiqadi. Sahifani yangilang — tab saqlanadi. «Oyliklar» ga qayting — URL'dan `tab` yo'qoladi.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/payments/salary-client.tsx \
        client/src/components/payments/salary-advances-tab.tsx
git commit -m "Split the salary page into Oyliklar and Avanslar tabs"
```

---

### Task 3: Frontend — oy kalendari setkasi

**Files:**
- Create: `client/src/components/payments/salary-advance-calendar.tsx`
- Modify: `client/src/components/payments/salary-advances-tab.tsx`

**Interfaces:**
- Consumes: `AdvanceDay` (Task 2 da `salary-advances-tab.tsx` da eksport qilingan).
- Produces: `<SalaryAdvanceCalendar month days selectedDate onSelect />` — `month: string` ("YYYY-MM"), `days: AdvanceDay[]`, `selectedDate: string | null`, `onSelect: (date: string) => void`.

- [ ] **Step 1: Kalendar komponentini yaratish**

Yangi fayl `client/src/components/payments/salary-advance-calendar.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format-utils";
import type { AdvanceDay } from "./salary-advances-tab";

const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

/**
 * To'rt pog'onali amber shkala — katakning oydagi eng katta kunga nisbati.
 * Rang YAGONA signal emas: summa har doim raqam bilan ham yozilgan.
 */
const TONES = [
  "bg-amber-50 dark:bg-amber-950/30",
  "bg-amber-100 dark:bg-amber-900/40",
  "bg-amber-200 dark:bg-amber-800/50",
  "bg-amber-300 dark:bg-amber-700/60",
];

function toneFor(total: number, max: number): string {
  if (max <= 0) return TONES[0];
  const ratio = total / max;
  if (ratio > 0.75) return TONES[3];
  if (ratio > 0.5) return TONES[2];
  if (ratio > 0.25) return TONES[1];
  return TONES[0];
}

/** Millionni qisqartirib yozadi: 2 200 000 → "2.2M", 800 000 → "800K". */
function compact(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return formatPrice(amount);
}

/**
 * Oy setkasi: har bir kun katagida o'sha kunning jami avansi.
 * Sof ko'rsatish komponenti — o'zi ma'lumot olmaydi, holat tutmaydi.
 */
export function SalaryAdvanceCalendar({
  month,
  days,
  selectedDate,
  onSelect,
}: {
  month: string;
  days: AdvanceDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  // getUTCDay: Yakshanba=0. Dushanbadan boshlanadigan setkaga o'tkazamiz.
  const firstWeekday = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const max = days.reduce((acc, d) => Math.max(acc, d.total), 0);

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (date === null) return <div key={`pad-${i}`} />;
          const day = byDate.get(date);
          const dayNum = Number(date.slice(-2));
          const selected = selectedDate === date;

          return (
            <button
              key={date}
              type="button"
              disabled={!day}
              onClick={() => onSelect(date)}
              aria-label={
                day
                  ? `${dayNum}-kun, ${formatPrice(day.total)} so'm avans`
                  : `${dayNum}-kun, avans yo'q`
              }
              aria-pressed={selected}
              className={cn(
                "flex min-h-[56px] flex-col items-start rounded-md border p-1.5 text-left transition-colors",
                day
                  ? cn(
                      toneFor(day.total, max),
                      "cursor-pointer hover:brightness-95",
                    )
                  : "cursor-not-allowed border-dashed opacity-60",
                selected && "ring-2 ring-primary ring-offset-1",
              )}
            >
              <span className="text-xs text-muted-foreground tabular-nums">
                {dayNum}
              </span>
              {day && (
                <span className="mt-auto text-xs font-semibold tabular-nums">
                  {compact(day.total)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Kalendarni tabga ulash**

`salary-advances-tab.tsx` — import qo'shing:

```tsx
import { SalaryAdvanceCalendar } from "./salary-advance-calendar";
```

Holat qo'shing (`const [addOpen, setAddOpen] = useState(false);` dan keyin):

```tsx
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
```

Oy o'zgarganda tanlangan kun tozalanishi kerak — `MonthPicker`ning `onChange`ini almashtiring:

```tsx
          onChange={(m) => {
            setSelectedDate(null);
            setFilters({ month: m });
          }}
```

`{/* Kalendar va kun paneli Task 3–4 da shu yerga qo'shiladi. */}` izohini shu bilan almashtiring:

```tsx
      {isLoading ? (
        <Skeleton className="h-[360px] w-full" />
      ) : data && data.days.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Bu oyda avans berilmagan.
          </p>
          {canPay && (
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setAddOpen(true)}
            >
              <HandCoins className="size-4" />
              Avans qo&apos;shish
            </Button>
          )}
        </div>
      ) : (
        <SalaryAdvanceCalendar
          month={shownMonth}
          days={data?.days ?? []}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
      )}
```

- [ ] **Step 3: Build'ni tekshirish**

```bash
cd client && npm run build
```

Kutilgan natija: xatosiz build.

- [ ] **Step 4: Brauzerda tekshirish**

«Avanslar» tabida oy setkasi chiqadi. Avans berilgan kunlar rangli va summali; boshqalari bosilmaydi. Kunni bosganda ramka (ring) paydo bo'ladi. Avans yo'q oyni tanlang — bo'sh holat matni chiqadi. Tab bilan yurib, Enter bosib ham kun tanlanishini tekshiring.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/payments/salary-advance-calendar.tsx \
        client/src/components/payments/salary-advances-tab.tsx
git commit -m "Show a month grid of daily advance totals"
```

---

### Task 4: Frontend — kun paneli va sanasi to'ldirilgan avans dialogi

**Files:**
- Create: `client/src/components/payments/salary-advance-day-panel.tsx`
- Modify: `client/src/components/payments/salary-advances-tab.tsx`
- Modify: `client/src/components/payments/salary-add-advance-dialog.tsx:36-40` (props) va `:57-66` (reset effekti)
- Modify: `client/src/components/payments/employee-advance-select.tsx:31-38`

**Interfaces:**
- Consumes: `AdvanceRow` (Task 2), `employeeRoleLabel(roles)` (shu taskda eksport qilinadi).
- Produces: `<SalaryAdvanceDayPanel date advances canPay onAdd />`.

- [ ] **Step 1: `employeeRoleLabel` ni eksport qilish**

`client/src/components/payments/employee-advance-select.tsx:31` — `function employeeRoleLabel` oldiga `export` qo'shing:

```tsx
export function employeeRoleLabel(roles: { id: number; name: string }[]): string {
```

- [ ] **Step 2: Kun panelini yaratish**

Yangi fayl `client/src/components/payments/salary-advance-day-panel.tsx`:

```tsx
"use client";

import { HandCoins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBalance, formatPrice } from "@/lib/format-utils";
import { EXPENSE_METHOD_LABELS } from "./expenses-filter-bar";
import { employeeRoleLabel } from "./employee-advance-select";
import type { AdvanceRow } from "./salary-advances-tab";

/** "2026-07-15" → "15.07.2026". */
function longDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Tanlangan kunning avanslari. Ataylab `<Table>` emas, ro'yxat: panel tor va
 * bir kunga odatda 1–5 qator to'g'ri keladi, `<Table>` bo'lsa loyiha qoidasi
 * `#` ustuni va 10 qatorli sahifalashni majburiy qilardi.
 */
export function SalaryAdvanceDayPanel({
  date,
  advances,
  canPay,
  onAdd,
}: {
  date: string | null;
  advances: AdvanceRow[];
  canPay: boolean;
  onAdd: (date: string) => void;
}) {
  if (date === null) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-6">
        <p className="text-center text-sm text-muted-foreground">
          Tafsilotni ko&apos;rish uchun kalendardan kun tanlang.
        </p>
      </div>
    );
  }

  const rows = advances.filter((a) => a.date === date);
  const total = rows.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="flex flex-col rounded-lg border">
      <div className="border-b px-4 py-3">
        <p className="font-medium">{longDay(date)}</p>
        <p className="text-sm text-muted-foreground">
          Jami {formatBalance(total)} · {rows.length} ta
        </p>
      </div>

      <div className="flex-1 divide-y">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Bu kunda avans berilmagan.
          </p>
        ) : (
          rows.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.user.firstName} {a.user.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {employeeRoleLabel(a.user.roles)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatPrice(a.amount)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {EXPENSE_METHOD_LABELS[a.paymentMethod] ?? a.paymentMethod}
                </Badge>
                {a.description && a.description !== "Avans" && (
                  <span className="text-xs text-muted-foreground">
                    {a.description}
                  </span>
                )}
                {a.createdBy && (
                  <span className="text-xs text-muted-foreground">
                    · {a.createdBy.firstName} {a.createdBy.lastName} bergan
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {canPay && (
        <div className="border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onAdd(date)}
          >
            <HandCoins className="size-4" />
            Bu kunga avans qo&apos;shish
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Dialogga `defaultDate` prop qo'shish**

`client/src/components/payments/salary-add-advance-dialog.tsx` — `Props` interfeysiga qo'shing:

```tsx
  /**
   * Dialog ochilganda oldindan qo'yiladigan sana. Avans kalendarida kun
   * tanlab «Bu kunga avans qo'shish» bosilganda o'sha kun keladi. Berilmasa —
   * bugungi sana.
   */
  defaultDate?: Date | null;
```

Komponent signaturasini yangilang:

```tsx
export function SalaryAddAdvanceDialog({
  open,
  onOpenChange,
  onSaved,
  defaultDate,
}: Props) {
```

Reset effektidagi `setDate(new Date());` qatorini almashtiring:

```tsx
    setDate(defaultDate ?? new Date());
```

va shu `useEffect` ning bog'liqliklar massivini `[open]` dan `[open, defaultDate]` ga o'zgartiring.

- [ ] **Step 4: Panelni tabga ulash**

`salary-advances-tab.tsx` — import qo'shing:

```tsx
import { SalaryAdvanceDayPanel } from "./salary-advance-day-panel";
```

Holat qo'shing:

```tsx
  const [addDate, setAddDate] = useState<Date | null>(null);
```

Kalendar bo'lagini (Task 3, Step 2 da qo'yilgan `<SalaryAdvanceCalendar .../>` shoxi) ikki ustunli joylashuvga o'rang:

```tsx
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <SalaryAdvanceCalendar
            month={shownMonth}
            days={data?.days ?? []}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
          <SalaryAdvanceDayPanel
            date={selectedDate}
            advances={data?.advances ?? []}
            canPay={canPay}
            onAdd={(d) => {
              setAddDate(new Date(`${d}T00:00:00`));
              setAddOpen(true);
            }}
          />
        </div>
```

Dialog chaqiruvini yangilang:

```tsx
      <SalaryAddAdvanceDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAddDate(null);
        }}
        onSaved={() => refetch()}
        defaultDate={addDate}
      />
```

- [ ] **Step 5: Build'ni tekshirish**

```bash
cd client && npm run build
```

Kutilgan natija: xatosiz build.

- [ ] **Step 6: Brauzerda tekshirish**

Kunni bosing — o'ng panelda (mobil kenglikda kalendar tagida) o'sha kunning ro'yxati chiqadi: ism, lavozim, summa, naqd/karta, izoh, kim bergan. Hech qaysi kun tanlanmaganda «kun tanlang» matni turadi. CEO/BD sifatida «Bu kunga avans qo'shish» ni bosing — dialog o'sha sana bilan ochiladi; saqlagandan keyin kalendar yangilanadi. Brauzerni tor qiling — panel kalendar tagiga tushadi.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/payments/salary-advance-day-panel.tsx \
        client/src/components/payments/salary-advances-tab.tsx \
        client/src/components/payments/salary-add-advance-dialog.tsx \
        client/src/components/payments/employee-advance-select.tsx
git commit -m "Show who received each advance on the selected day"
```

---

### Task 5: Ro'yxatdan tashqari avanslar izohi

Spec'dagi kelishilgan chekinish: kalendar **barcha** avanslarni ko'rsatadi, «Oyliklar» jadvalidagi «Avans» JAMI'si esa faqat oylik ro'yxatidagi xodimlarniki (o'chirilmagan O'qituvchilar ∪ global `FIXED_MONTHLY` konfiguratsiyasi bor no-o'qituvchi xodimlar — `salary-monthly.service.ts:100-114` va `salary-monthly-staff.service.ts:77-97`). Farq yashirin qolmasligi kerak.

**Files:**
- Modify: `server/src/salary/salary-advance-calendar.service.ts`
- Modify: `server/src/salary/salary-advance-calendar.service.spec.ts`
- Modify: `client/src/components/payments/salary-advances-tab.tsx`

**Interfaces:**
- Produces: javobga `totals.outsideRoster: { count: number; total: number }` qo'shiladi.

- [ ] **Step 1: Yiqiladigan testni yozish**

`salary-advance-calendar.service.spec.ts` — `prisma` mock'iga qo'shing (`expense`dan keyin):

```ts
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
```

va faylning oxiriga yangi `describe` bloki:

```ts
  describe('oylik ro‘yxatidan tashqari avanslar', () => {
    it('o‘qituvchi bo‘lmagan va FIXED_MONTHLY konfiguratsiyasi yo‘q xodimni sanaydi', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance({ id: 'a', amount: 1_000_000 }), // O'qituvchi — ro'yxatda
        advance({
          id: 'b',
          amount: 450_000,
          relatedUser: {
            id: 10077,
            firstName: 'Nodira',
            lastName: 'Saidova',
            roles: [{ role: { id: 5, name: 'Cashier' } }],
          },
        }),
      ]);
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([]);

      const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

      expect(res.totals.outsideRoster).toEqual({ count: 1, total: 450_000 });
    });

    it('FIXED_MONTHLY konfiguratsiyasi bor xodimni ro‘yxatdan tashqari deb sanamaydi', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance({
          id: 'b',
          amount: 450_000,
          relatedUser: {
            id: 10077,
            firstName: 'Nodira',
            lastName: 'Saidova',
            roles: [{ role: { id: 5, name: 'Cashier' } }],
          },
        }),
      ]);
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([
        { userId: 10077 },
      ]);

      const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

      expect(res.totals.outsideRoster).toEqual({ count: 0, total: 0 });
    });

    it('avans bo‘lmasa konfiguratsiya so‘rovini umuman qilmaydi', async () => {
      prisma.expense.findMany.mockResolvedValue([]);

      const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

      expect(res.totals.outsideRoster).toEqual({ count: 0, total: 0 });
      expect(prisma.employeeSalaryConfig.findMany).not.toHaveBeenCalled();
    });
  });
```

Task 1 dagi **ikkita** test `res.totals` ni `toEqual` bilan to'liq solishtiradi — «jamlarni hisoblaydi» va «avans yo'q oyda bo'sh natija». Ikkalasidagi obyektga ham yangi maydonni qo'shing:

```ts
      outsideRoster: { count: 0, total: 0 },
```

(birinchisida barcha oluvchilar o'qituvchi, ikkinchisida umuman avans yo'q — ikkalasida ham nol.)

- [ ] **Step 2: Test yiqilishini tekshirish**

```bash
cd server && npx jest src/salary/salary-advance-calendar.service.spec.ts
```

Kutilgan natija: FAIL — `outsideRoster` `undefined`.

- [ ] **Step 3: Servisga hisobni qo'shish**

`salary-advance-calendar.service.ts` — `AdvanceCalendarTotals` interfeysiga qo'shing:

```ts
  /**
   * «Oyliklar» jadvalidagi «Avans» JAMI'siga TUSHMAYDIGAN avanslar: oluvchi
   * o'qituvchi ham emas, global FIXED_MONTHLY konfiguratsiyasi ham yo'q.
   * Ikki raqam farq qilsa, farq yashirin qolmasligi uchun.
   */
  outsideRoster: { count: number; total: number };
```

`blocked` shoxidagi bo'sh `totals` ga qo'shing:

```ts
          outsideRoster: { count: 0, total: 0 },
```

`days` hisobidan **keyin**, `return`dan oldin qo'shing:

```ts
    // Oylik ro'yxati = o'chirilmagan O'qituvchilar ∪ global FIXED_MONTHLY
    // konfiguratsiyasi bor no-o'qituvchi xodimlar (getMonthly + computeStaff).
    // Shu ikkalasiga ham kirmagan oluvchi «Oyliklar» JAMI'sida ko'rinmaydi.
    const outsideRoster = { count: 0, total: 0 };
    const nonTeacherIds = [
      ...new Set(
        advances
          .filter((a) => !a.user.roles.some((r) => r.name === 'Teacher'))
          .map((a) => a.user.id),
      ),
    ];
    if (nonTeacherIds.length > 0) {
      const configs = await this.prisma.employeeSalaryConfig.findMany({
        where: {
          companyId,
          groupId: null,
          salaryType: 'FIXED_MONTHLY',
          userId: { in: nonTeacherIds },
        },
        select: { userId: true },
      });
      const withConfig = new Set(configs.map((c) => c.userId));
      for (const a of advances) {
        const isTeacher = a.user.roles.some((r) => r.name === 'Teacher');
        if (!isTeacher && !withConfig.has(a.user.id)) {
          outsideRoster.count += 1;
          outsideRoster.total += a.amount;
        }
      }
    }
```

`return` ichidagi `totals` ga qo'shing:

```ts
        outsideRoster,
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

```bash
cd server && npm test
```

Kutilgan natija: barcha testlar PASS.

- [ ] **Step 5: Frontendga izohni qo'shish**

`salary-advances-tab.tsx` — `CalendarResponse` dagi `totals` ga qo'shing:

```tsx
    outsideRoster: { count: number; total: number };
```

`Info` ikonkasini import qiling (`lucide-react` importiga qo'shing) va kalendar/panel grid'idan **keyin** qo'ying:

```tsx
      {totals && totals.outsideRoster.count > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {formatNumber(totals.outsideRoster.count)} ta avans (
            {formatBalance(totals.outsideRoster.total)}) oylik ro&apos;yxatidan
            tashqari xodimga berilgan — «Oyliklar» tabidagi Avans JAMI&apos;sida
            ko&apos;rinmaydi.
          </p>
        </div>
      )}
```

- [ ] **Step 6: Build va to'liq tekshiruv**

```bash
cd client && npm run build
cd ../server && npm test
```

Kutilgan natija: build toza, barcha server testlari PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/salary/salary-advance-calendar.service.ts \
        server/src/salary/salary-advance-calendar.service.spec.ts \
        client/src/components/payments/salary-advances-tab.tsx
git commit -m "Flag advances that fall outside the payroll roster total"
```

---

## Tugatish tekshiruvi

Barcha tasklar bajarilgandan keyin:

- [ ] `cd server && npm test` — hammasi PASS
- [ ] `cd client && npm run build` — xatosiz
- [ ] `/payments/salary?tab=avanslar` to'g'ridan-to'g'ri ochilganda ishlaydi (sahifa yangilangandan keyin ham)
- [ ] Filial direktori akkaunti bilan kirilganda faqat o'z filiali xodimlarining avanslari ko'rinadi
- [ ] Administrator akkaunti tabni ko'radi, «Avans qo'shish» tugmasini ko'rmaydi
- [ ] Deploy: backend uchun `railway up` (Railway GitHub'ga ulanmagan — merge o'zi deploy qilmaydi), frontend uchun toza `origin/main` worktree'dan Vercel
