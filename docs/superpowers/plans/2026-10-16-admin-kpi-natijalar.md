# Adminlar KPI — 2-bosqich: KPI natijalari (pulsiz kuzatuv oyi) — reja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Administrator lid egasi bo'lgan lid birinchi to'lovni qilganda va u yozgan to'lov va'dasi bajarilganda KPI natijasi yoziladi (summa muhrlanadi, pul yo'q); CEO va filial direktori «Xodimlar KPI» sahifasida va xodim sahifasining «KPI» yorlig'ida kim qancha natija qilganini, o'sish va kamayishni ko'radi.

**Architecture:** Yangi `server/src/kpi/` moduli. `KpiResult` jadvaliga faqat `KpiResultsService` yozadi: `payment.received` va `payment.reversed` hodisalaridan keyin (`KpiRecorderListener`), har kecha 03:30 dagi tuzatishda (`KpiSelfHealCron`) va bir martalik `scripts/kpi-backfill.ts` da. Lidning aylanish turi (`Lead.conversionKind`) va va'dani bajargan to'lov (`PaymentPromise.resolvedPaymentId`) yozilgan joyida saqlanadi. Sahifa raqamlari va «Diqqat» signallari serverda sof funksiyalar bilan hisoblanadi (`kpi-overview.math.ts`, `kpi-signals.ts`); client faqat formatlaydi va chizadi.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Jest; Next.js + TanStack Query + recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-admin-kpi-design.md` §7 (1-bosqich — §6, ADR-0093, `main` da).

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-kpi`, shox `feat/admin-kpi-2-bosqich` (main 6203ed7b dan). Worktree'dan tashqariga `cd` qilinmaydi. Har buyruq worktree ildizidan boshlanadi (`cd server && …`, `cd client && …`); `git add` / `git commit` ildizdan.
- Server: `cd server && npx jest <path>`, `npm run typecheck`, `npx eslint <files> --quiet`, `npx prettier --write <tegilgan server fayllari>`. Client: `cd client && npx vitest run <path>` (ishlamasa: `npm test -- <path>`), `npx eslint <files>`, `npx tsc --noEmit -p .`, `npm run build`. **Client fayllariga prettier ishlatilmaydi.**
- Migratsiya qo'lda yozilgan idempotent SQL; `prisma migrate dev` hech qachon ishlatilmaydi. Faqat dev baza (`server/.env` symlink); prod bazaga hech narsa yozilmaydi.
- Commit xabarlari Conventional Commits, inglizcha, oxirgi qatori `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Kod izohlari inglizcha. Ekrandagi har matn lotin o'zbekchada, inglizcha so'zsiz («KPI» — mahsulot nomi). Sana `dd.MM.yyyy`, son `format-utils` (`uz-UZ`) orqali.
- **Pul yo'q.** `Transaction`, `Expense`, `CashMovement`, `SalaryPayment`, `SalaryAccrual` yozilmaydi; oylik, kassa va foyda hisobotlari `KpiResult` ni o'qimaydi.
- KPI faqat natija paytida **Administrator roli bor va CEO hamda Filial direktori rollari yo'q** foydalanuvchiga yoziladi (lid egasi / va'da yozuvchisi); rollar natija yozilayotganda bazadan `whereUserMayAct()` bilan o'qiladi. Keyin lavozim o'zgarsa yozuv qoladi.
- Narx har natija turi uchun `FIXED` | `PERCENT`. Boshlang'ich: `LEAD_PAID` — `FIXED` 50 000, `PROMISE_KEPT` — `FIXED` 20 000. Qiymat: so'm 0–10 000 000 yoki foiz 0–100. Foiz summasi = `round(baza × qiymat / 100)` (so'mga). Baza: `LEAD_PAID` — birinchi to'lov summasi; `PROMISE_KEPT` — `−balanceAtPromise` (manfiy bo'lmasa 0).
- `KPI_START` = 2026-10-17 00:00 Asia/Tashkent (`new Date('2026-10-17T00:00:00+05:00')`). Natija oyi — to'lov `createdAt` ining Toshkent oyi. Sahifalar 2026-10 dan.
- Natija holati `ACTIVE` | `CANCELLED`. Bitta lidga bitta faol `LEAD_PAID`, bitta to'lov bitta faol `LEAD_PAID` ga asos, bitta va'daga bitta faol `PROMISE_KEPT` (qisman unikal indekslar). Summa yozilganda muhrlanadi; narx o'zgarsa faqat keyingi natijalarga ta'sir qiladi.
- Kalit `kpi.enabled`: o'chiq — yangi natija yozilmaydi, o'chiq davr keyin to'ldirilmaydi; bekor qilish kalit o'chiq bo'lsa ham ishlaydi. Kalit o'zgargan vaqt saqlanadi.
- Ko'radi: CEO (hamma filial) va filial direktori (o'z filiali, `@BranchScope()`); administrator ko'rmaydi. Ruxsat `kpi.view`; sozlamani yozish `@CeoOnly()`.
- Har kecha 03:30 (Toshkent) oxirgi 2 kun to'lovlari qayta ko'riladi; hammasi idempotent.
- ADR-0095 «KPI natijasi: administratorga, bir marta, summa muhrlanadi» — shu PR'da.

## Fayllar xaritasi

Server (yangi), hammasi `server/src/kpi/`:
- `kpi-rules.ts` (+ spec) — `KPI_START`, narx, kalit oynasi, rol qoidasi, «Qanday hisoblandi».
- `kpi-settings.service.ts` (+ spec) — sozlamalarni o'qish va yozish.
- `kpi-results.service.ts` (+ spec) — yagona yozuvchi: yozish, bekor qilish, tuzatishni ko'chirish, tungi tuzatish.
- `kpi-results.plan.ts` — natija rejasi (o'qiydi, `KpiResult` ga yozmaydi).
- `kpi-write.single-source.spec.ts` — `KpiResult` ni boshqa fayl yozmaydi.
- `kpi-recorder.listener.ts` (+ spec), `kpi-self-heal.cron.ts` (+ spec).
- `kpi-signals.ts` (+ spec) — «Diqqat» va oy oxiri taxmini.
- `kpi-overview.math.ts` (+ spec) — sahifa raqamlari (sof).
- `kpi-read.service.ts` (+ spec), `kpi.controller.ts` (+ spec), `dto/kpi-query.dto.ts`, `dto/kpi-settings.dto.ts` (+ spec), `kpi.module.ts`.
- `kpi-backfill-restore.ts` (+ spec) — backfill: aylanish turini va va'dani bajargan to'lovni tiklash.
- `server/src/settings/kpi-settings.spec.ts`.
- `server/prisma/migrations/20261016150000_kpi_results/migration.sql`, `server/scripts/kpi-backfill.ts`.

Server (o'zgaradi): `prisma/schema.prisma`, `settings/settings.types.ts`, `settings/settings.service.ts` (+ 2 spec), `common/permissions/permission-catalog.money.ts`, `permission-catalog.types.ts`, `permission-catalog.spec.ts`, `route-access.snapshot.json`, `common/auth/branch-route-policy.ts`, `leads/leads.service.ts` (+ spec), `leads/ownership/lead-ownership.service.ts` (+ spec), `common/student-origin/student-lead-origin.service.ts` (+ spec), `payments/payments-write.service.ts`, `payments/payments.service.spec.ts`, `archive/archive-restore.service.ts`, `archive/archive-restore.lead-owner.spec.ts`, `app.module.ts`, `tsconfig.check.json`.

Client (yangi), `client/src/components/reports/admin-kpi/`: `kpi-types.ts`, `kpi-queries.ts`, `kpi-format.ts` (+ `.test.ts`), `kpi-trend.tsx`, `kpi-summary-cards.tsx`, `kpi-attention.tsx`, `kpi-admin-table.tsx`, `kpi-charts.tsx`, `kpi-user-panel.tsx`, `kpi-user-drawer.tsx`, `kpi-overview-page.tsx`, `employee-kpi-tab.tsx`; `client/src/app/(dashboard)/reports/xodimlar-kpi/page.tsx`, `client/src/app/(dashboard)/settings/kpi/page.tsx`, `client/src/components/settings/kpi-settings-client.tsx`, `client/src/qollanma/kontent/hisobotlar/xodimlar-kpi.mdx`.

Client (o'zgaradi): `lib/permission-keys.ts`, `lib/reports-nav.ts` (+ test), `lib/nav-items.ts` (+ test), `lib/settings-nav.ts` (+ test), `lib/breadcrumb-routes.ts`, `components/settings/employee-profile-client.tsx`, `components/settings/employee-profile-tabs.tsx`, `qollanma/sahifalar/hisobotlar.ts`, `qollanma/yangiliklar.ts`.

Hujjatlar: `docs/adr/0095-kpi-natijasi.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`.

---

### Task 1: Ma'lumotlar sxemasi va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Lead`, `model PaymentPromise`, yangi enumlar va `model KpiResult`)
- Create: `server/prisma/migrations/20261016150000_kpi_results/migration.sql`

**Interfaces:**
- Produces: Prisma tiplari `LeadConversionKind` (`NEW_STUDENT | RETURNING | ALREADY_STUDYING`), `Lead.conversionKind: LeadConversionKind | null`, `PaymentPromise.resolvedPaymentId: string | null`, `KpiResultType` (`LEAD_PAID | PROMISE_KEPT`), `KpiResultStatus` (`ACTIVE | CANCELLED`), `KpiRuleMode` (`FIXED | PERCENT`), `KpiResult` (`id, companyId, branchId, userId, type, leadId, promiseId, studentId, paymentId, paymentAmount, baseAmount, ruleMode, ruleValue, amount, month, occurredAt, status, cancelledAt, cancelReason, replacesResultId, createdAt`).

- [ ] **Step 1: Sxemani o'zgartirish**

`model Lead` ichida `ownershipLogs LeadOwnershipLog[]` qatoridan keyin:

```prisma
  // How the lead was converted (ADR-0095): written by `LeadsService.convert`
  // and `StudentLeadOriginService`. Null = not converted, or converted before
  // stage 2 (the backfill restores the ones since KPI_START).
  conversionKind LeadConversionKind?
```

`enum LeadOwnershipKind { … }` dan keyin:

```prisma
enum LeadConversionKind {
  NEW_STUDENT
  RETURNING
  ALREADY_STUDYING
}
```

`model LeadOwnershipLog { … }` tugagandan keyin:

```prisma
enum KpiResultType {
  LEAD_PAID
  PROMISE_KEPT
}

enum KpiResultStatus {
  ACTIVE
  CANCELLED
}

enum KpiRuleMode {
  FIXED
  PERCENT
}

// One KPI result (ADR-0095), written only by `KpiResultsService`; the amount
// is sealed at the rule of that moment and no money moves in stage 2. Ids are
// plain columns (like `LeadOwnershipLog`), so archiving or deleting a lead, a
// promise or a user never touches the record. One ACTIVE result per lead and
// per payment (LEAD_PAID) and per promise (PROMISE_KEPT): partial unique
// indexes in the migration, which this schema cannot express.
model KpiResult {
  id               String          @id @default(uuid())
  companyId        Int
  branchId         Int?
  userId           Int
  type             KpiResultType
  leadId           String?
  promiseId        String?
  studentId        Int
  paymentId        String
  paymentAmount    Int
  baseAmount       Int
  ruleMode         KpiRuleMode
  ruleValue        Int
  amount           Int
  // 'YYYY-MM', the Tashkent month of the payment.
  month            String
  occurredAt       DateTime
  status           KpiResultStatus @default(ACTIVE)
  cancelledAt      DateTime?
  cancelReason     String?
  // A correction's re-post carries the old result over (spec §7.3).
  replacesResultId String?
  createdAt        DateTime        @default(now())

  @@index([companyId, month])
  @@index([userId, month])
  @@index([paymentId])
}
```

`model PaymentPromise` ichida `resolvedBy User? @relation("PaymentPromiseResolvedBy", …)` qatoridan keyin:

```prisma
  // The payment that made the promise KEPT (ADR-0095), written by
  // `settleKeptPromises` in the payment's own transaction. A plain column.
  resolvedPaymentId String?
```

va uning indekslariga (`@@index([branchId])` dan keyin):

```prisma
  @@index([resolvedPaymentId])
```

- [ ] **Step 2: Migratsiya faylini yozish**

`server/prisma/migrations/20261016150000_kpi_results/migration.sql`:

```sql
-- KPI results (ADR-0095): stage 2 of the admin KPI, no money. Idempotent,
-- like the other hand-written migrations here.
DO $$
BEGIN
  CREATE TYPE "LeadConversionKind" AS ENUM ('NEW_STUDENT', 'RETURNING', 'ALREADY_STUDYING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiResultType" AS ENUM ('LEAD_PAID', 'PROMISE_KEPT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiResultStatus" AS ENUM ('ACTIVE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiRuleMode" AS ENUM ('FIXED', 'PERCENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "conversionKind" "LeadConversionKind";

ALTER TABLE "PaymentPromise" ADD COLUMN IF NOT EXISTS "resolvedPaymentId" TEXT;
CREATE INDEX IF NOT EXISTS "PaymentPromise_resolvedPaymentId_idx" ON "PaymentPromise"("resolvedPaymentId");

CREATE TABLE IF NOT EXISTS "KpiResult" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "userId" INTEGER NOT NULL,
  "type" "KpiResultType" NOT NULL,
  "leadId" TEXT,
  "promiseId" TEXT,
  "studentId" INTEGER NOT NULL,
  "paymentId" TEXT NOT NULL,
  "paymentAmount" INTEGER NOT NULL,
  "baseAmount" INTEGER NOT NULL,
  "ruleMode" "KpiRuleMode" NOT NULL,
  "ruleValue" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" "KpiResultStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "replacesResultId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KpiResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KpiResult_companyId_month_idx" ON "KpiResult"("companyId", "month");
CREATE INDEX IF NOT EXISTS "KpiResult_userId_month_idx" ON "KpiResult"("userId", "month");
CREATE INDEX IF NOT EXISTS "KpiResult_paymentId_idx" ON "KpiResult"("paymentId");

-- One ACTIVE result per lead, per payment (LEAD_PAID) and per promise
-- (PROMISE_KEPT). A second concurrent insert fails with P2002 and is skipped.
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResult_active_lead_key"
  ON "KpiResult"("leadId") WHERE "status" = 'ACTIVE' AND "type" = 'LEAD_PAID';
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResult_active_lead_payment_key"
  ON "KpiResult"("paymentId") WHERE "status" = 'ACTIVE' AND "type" = 'LEAD_PAID';
CREATE UNIQUE INDEX IF NOT EXISTS "KpiResult_active_promise_key"
  ON "KpiResult"("promiseId") WHERE "status" = 'ACTIVE' AND "type" = 'PROMISE_KEPT';
```

- [ ] **Step 3: Dev bazaga qo'llash va client yaratish**

`server/.env` worktree'da allaqachon symlink (asosiy katalogdagi dev baza).

```bash
cd server
npx prisma db execute --file prisma/migrations/20261016150000_kpi_results/migration.sql
npx prisma migrate resolve --applied 20261016150000_kpi_results
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  | grep -iE 'KpiResult|conversionKind|resolvedPaymentId|LeadConversionKind|KpiRuleMode' \
  | grep -v 'DROP INDEX "KpiResult_active_' || echo "toza"
```

Kutilgan: oxirgi buyruq `toza` chiqaradi. Uchta `KpiResult_active_*` qisman indeksi diffda `DROP INDEX` bo'lib ko'rinadi — sxema ularni ifodalay olmaydi, ular atayin chiqarib tashlangan. Diffdagi boshqa shoxlarning eski farqlariga tegilmaydi.

- [ ] **Step 4: Tip tekshiruvi**

Run: `cd server && npm run typecheck`
Expected: xatosiz.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20261016150000_kpi_results
git commit -m "feat(kpi): KpiResult table, lead conversion kind and the promise's resolving payment (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sozlamalar, KPI qoidalari va `KpiSettingsService`

**Files:**
- Modify: `server/src/settings/settings.types.ts`, `server/src/settings/settings.service.ts`
- Modify: `server/src/settings/settings.types.spec.ts`, `server/src/settings/settings.service.spec.ts`
- Create: `server/src/settings/kpi-settings.spec.ts`
- Create: `server/src/kpi/kpi-rules.ts` (+ `kpi-rules.spec.ts`)
- Create: `server/src/kpi/kpi-settings.service.ts` (+ `kpi-settings.service.spec.ts`)

**Interfaces:**
- Consumes: `KpiRuleMode`, `KpiResultType` (Task 1).
- Produces:
  - `SettingKey` ga `'kpi.enabled' | 'kpi.leadPaid.mode' | 'kpi.leadPaid.value' | 'kpi.promiseKept.mode' | 'kpi.promiseKept.value'` (hammasi `companyLevelOnly: true`).
  - `SettingsService.lastWrittenAt(companyId: number, key: SettingKey): Promise<Date | null>`.
  - `SettingsService.setMany(companyId: number, entries: ReadonlyArray<readonly [SettingKey, unknown]>, updatedById: number | undefined): Promise<void>` — kompaniya darajasidagi bir nechta kalit bitta tranzaksiyada (hammasi yoziladi yoki hech biri); `set` o'zgarmaydi, ikkalasi bitta qator yozuvchisini (`writeRow`) ishlatadi.
  - `kpi-rules.ts`: `KPI_START: Date`, `KPI_FIRST_MONTH = '2026-10'`, `CANCEL_REASON = { REVERSED: "To'lov bekor qilindi", CORRECTED: "To'lov tuzatildi" }`, `interface KpiRule { mode: KpiRuleMode; value: number }`, `interface KpiSettings { enabled: boolean; changedAt: Date | null; leadPaid: KpiRule; promiseKept: KpiRule }`, `kpiAmount(rule: KpiRule, base: number): number`, `recordingSince(s: Pick<KpiSettings, 'enabled' | 'changedAt'>): Date | null`, `isKpiEligible(roleNames: readonly string[]): boolean`, `explainKpi(r: { type: KpiResultType; ruleMode: KpiRuleMode; ruleValue: number; baseAmount: number }): string`.
  - `KpiSettingsService` (`constructor(settings: SettingsService)`): `read(companyId: number): Promise<KpiSettings>`, `update(companyId: number, patch: KpiSettingsPatch, userId: number): Promise<KpiSettings>`; `interface KpiSettingsPatch { enabled?: boolean; leadPaid?: KpiRule; promiseKept?: KpiRule }`.

- [ ] **Step 1: Yiqiladigan testlar**

`server/src/settings/kpi-settings.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from './settings.types';

describe('KPI settings (ADR-0095)', () => {
  it('the switch is on by default and company-level', () => {
    const def = getSettingDefinition('kpi.enabled');
    expect(def.defaultValue).toBe(true);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(false)).toBe(false);
    expect(() => def.parse('true')).toThrow(BadRequestException);
  });

  it.each(['kpi.leadPaid.mode', 'kpi.promiseKept.mode'] as const)(
    '%s takes FIXED or PERCENT, FIXED by default',
    (key) => {
      const def = getSettingDefinition(key);
      expect(def.defaultValue).toBe('FIXED');
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse('PERCENT')).toBe('PERCENT');
      expect(() => def.parse('percent')).toThrow(BadRequestException);
    },
  );

  it.each([
    ['kpi.leadPaid.value', 50_000],
    ['kpi.promiseKept.value', 20_000],
  ] as const)("%s defaults to %i and takes whole so'm 0..10 000 000", (key, dflt) => {
    const def = getSettingDefinition(key);
    expect(def.defaultValue).toBe(dflt);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(0)).toBe(0);
    expect(def.parse(10_000_000)).toBe(10_000_000);
    expect(() => def.parse(10_000_001)).toThrow(BadRequestException);
    expect(() => def.parse(-1)).toThrow(BadRequestException);
    expect(() => def.parse(1.5)).toThrow(BadRequestException);
  });
});
```

`server/src/kpi/kpi-rules.spec.ts`:

```ts
import {
  KPI_FIRST_MONTH,
  KPI_START,
  explainKpi,
  isKpiEligible,
  kpiAmount,
  recordingSince,
} from './kpi-rules';

describe('KPI rules (ADR-0095)', () => {
  it('counts from 17.10.2026 00:00 Tashkent', () => {
    expect(KPI_START.toISOString()).toBe('2026-10-16T19:00:00.000Z');
    expect(KPI_FIRST_MONTH).toBe('2026-10');
  });

  it("a fixed rule is its sum; a percent rounds to the so'm", () => {
    expect(kpiAmount({ mode: 'FIXED', value: 50_000 }, 600_000)).toBe(50_000);
    expect(kpiAmount({ mode: 'PERCENT', value: 5 }, 600_000)).toBe(30_000);
    expect(kpiAmount({ mode: 'PERCENT', value: 5 }, 333_333)).toBe(16_667);
    expect(kpiAmount({ mode: 'PERCENT', value: 0 }, 600_000)).toBe(0);
  });

  it('records from KPI_START or from when the switch came back on, never while off', () => {
    expect(recordingSince({ enabled: true, changedAt: null })).toEqual(KPI_START);
    expect(
      recordingSince({ enabled: true, changedAt: new Date('2026-10-10T00:00:00Z') }),
    ).toEqual(KPI_START);
    const back = new Date('2026-11-02T06:00:00Z');
    expect(recordingSince({ enabled: true, changedAt: back })).toEqual(back);
    expect(recordingSince({ enabled: false, changedAt: back })).toBeNull();
  });

  it('an administrator who is neither CEO nor Branch Director', () => {
    expect(isKpiEligible(['Administrator'])).toBe(true);
    expect(isKpiEligible(['Administrator', 'Cashier'])).toBe(true);
    expect(isKpiEligible(['Administrator', 'CEO'])).toBe(false);
    expect(isKpiEligible(['Administrator', 'Branch Director'])).toBe(false);
    expect(isKpiEligible(['Cashier'])).toBe(false);
    expect(isKpiEligible([])).toBe(false);
  });

  it('says how a result was counted', () => {
    expect(
      explainKpi({ type: 'LEAD_PAID', ruleMode: 'PERCENT', ruleValue: 5, baseAmount: 600_000 }),
    ).toBe("birinchi to'lov 600 000 × 5%");
    expect(
      explainKpi({ type: 'PROMISE_KEPT', ruleMode: 'PERCENT', ruleValue: 5, baseAmount: 400_000 }),
    ).toBe('qarz 400 000 × 5%');
    expect(
      explainKpi({ type: 'LEAD_PAID', ruleMode: 'FIXED', ruleValue: 50_000, baseAmount: 600_000 }),
    ).toBe("qat'iy summa");
  });
});
```

`server/src/kpi/kpi-settings.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { KpiSettingsService } from './kpi-settings.service';

const DEFAULTS: Record<string, unknown> = {
  'kpi.enabled': true,
  'kpi.leadPaid.mode': 'FIXED',
  'kpi.leadPaid.value': 50_000,
  'kpi.promiseKept.mode': 'FIXED',
  'kpi.promiseKept.value': 20_000,
};

function setup(stored: Record<string, unknown> = {}, writtenAt: Date | null = null) {
  const store: Record<string, unknown> = { ...DEFAULTS, ...stored };
  const settings = {
    get: jest.fn(async (_companyId: number, key: string) => store[key]),
    setMany: jest.fn(async (_companyId: number, entries: [string, unknown][]) => {
      for (const [key, value] of entries) store[key] = value;
    }),
    lastWrittenAt: jest.fn().mockResolvedValue(writtenAt),
  };
  return { settings, service: new KpiSettingsService(settings as never) };
}

describe('KpiSettingsService', () => {
  it('reads the five keys and when the switch last flipped', async () => {
    const at = new Date('2026-10-20T05:00:00Z');
    const s = setup({ 'kpi.leadPaid.mode': 'PERCENT', 'kpi.leadPaid.value': 5 }, at);
    await expect(s.service.read(1001)).resolves.toEqual({
      enabled: true,
      changedAt: at,
      leadPaid: { mode: 'PERCENT', value: 5 },
      promiseKept: { mode: 'FIXED', value: 20_000 },
    });
    expect(s.settings.lastWrittenAt).toHaveBeenCalledWith(1001, 'kpi.enabled');
  });

  it('writes the switch only when it flips, so its time is the flip', async () => {
    const s = setup();
    await s.service.update(1001, { enabled: true }, 7);
    expect(s.settings.setMany).not.toHaveBeenCalled();
    await s.service.update(1001, { enabled: false }, 7);
    expect(s.settings.setMany).toHaveBeenCalledWith(1001, [['kpi.enabled', false]], 7);
  });

  it("writes a rule's mode and value in one call — never a FIXED sum read as a percent", async () => {
    const s = setup();
    const out = await s.service.update(
      1001,
      { enabled: false, promiseKept: { mode: 'PERCENT', value: 10 } },
      7,
    );
    expect(s.settings.setMany).toHaveBeenCalledTimes(1);
    expect(s.settings.setMany).toHaveBeenCalledWith(
      1001,
      [
        ['kpi.enabled', false],
        ['kpi.promiseKept.mode', 'PERCENT'],
        ['kpi.promiseKept.value', 10],
      ],
      7,
    );
    expect(out.promiseKept).toEqual({ mode: 'PERCENT', value: 10 });
  });

  it('refuses a percent over 100 and an empty change, writing nothing', async () => {
    const s = setup();
    await expect(
      s.service.update(1001, { leadPaid: { mode: 'PERCENT', value: 101 } }, 7),
    ).rejects.toThrow(BadRequestException);
    await expect(s.service.update(1001, {}, 7)).rejects.toThrow(BadRequestException);
    expect(s.settings.setMany).not.toHaveBeenCalled();
  });
});
```

`server/src/settings/settings.service.spec.ts` ga (`describe('getBranchOverrides'` dan oldin):

```ts
  describe('lastWrittenAt', () => {
    it("reads the company row's updatedAt; null without a row", async () => {
      const at = new Date('2026-10-20T05:00:00Z');
      prisma.setting.findFirst
        .mockResolvedValueOnce({ updatedAt: at })
        .mockResolvedValueOnce(null);
      await expect(service.lastWrittenAt(COMPANY_ID, 'kpi.enabled')).resolves.toEqual(at);
      await expect(service.lastWrittenAt(COMPANY_ID, 'kpi.enabled')).resolves.toBeNull();
      expect(prisma.setting.findFirst).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, branchId: null, key: 'kpi.enabled' },
        select: { updatedAt: true },
      });
    });
  });

  describe('setMany', () => {
    beforeEach(() => {
      prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
      prisma.setting.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 's1', ...data }));
    });

    it('writes every key in one transaction, history on the same client, then clears the cache once', async () => {
      await service.setMany(
        COMPANY_ID,
        [
          ['kpi.leadPaid.mode', 'PERCENT'],
          ['kpi.leadPaid.value', 5],
        ],
        7,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.setting.create).toHaveBeenCalledTimes(2);
      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Setting', tx: prisma }),
      );
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('refuses a bad value before anything is written', async () => {
      await expect(
        service.setMany(
          COMPANY_ID,
          [
            ['kpi.leadPaid.mode', 'PERCENT'],
            ['kpi.leadPaid.value', -1],
          ],
          7,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.setting.create).not.toHaveBeenCalled();
    });
  });
```

Mavjud ro'yxatlarni yangilash (kalitlar qo'shilgani uchun ular ham yiqiladi):
- `settings.types.spec.ts` `'covers exactly the shipped payment keys'` ro'yxatiga `'leads.followUpDays',` dan keyin: `'kpi.enabled', 'kpi.leadPaid.mode', 'kpi.leadPaid.value', 'kpi.promiseKept.mode', 'kpi.promiseKept.value',`.
- `settings.service.spec.ts` `getMany` kutilgan obyektiga `'leads.followUpDays': 3,` dan keyin: `'kpi.enabled': true, 'kpi.leadPaid.mode': 'FIXED', 'kpi.leadPaid.value': 50000, 'kpi.promiseKept.mode': 'FIXED', 'kpi.promiseKept.value': 20000,`; `getBranchOverrides` kutilgan obyektiga besh kalit `[]` bilan.

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/settings src/kpi`
Expected: FAIL (`kpi.*` kalitlari registrda yo'q, `./kpi-rules` va `./kpi-settings.service` topilmaydi, `lastWrittenAt` va `setMany` yo'q).

- [ ] **Step 3: Registrga kalitlar**

`server/src/settings/settings.types.ts`:

1. Import: `import { KpiRuleMode, PaymentModel } from '@prisma/client';`
2. `SettingKey` oxiriga (`| 'leads.followUpDays'` dan keyin, nuqtali vergulni ko'chirib):

```ts
  | 'kpi.enabled'
  | 'kpi.leadPaid.mode'
  | 'kpi.leadPaid.value'
  | 'kpi.promiseKept.mode'
  | 'kpi.promiseKept.value';
```

3. `SettingValueMap` oxiriga:

```ts
  'kpi.enabled': boolean;
  'kpi.leadPaid.mode': KpiRuleMode;
  'kpi.leadPaid.value': number;
  'kpi.promiseKept.mode': KpiRuleMode;
  'kpi.promiseKept.value': number;
```

4. `parseIntInRange` dan keyin:

```ts
function parseKpiMode(key: SettingKey, raw: unknown): KpiRuleMode {
  if (raw === KpiRuleMode.FIXED || raw === KpiRuleMode.PERCENT) return raw;
  throw new BadRequestException(
    `${key} faqat "FIXED" yoki "PERCENT" bo'lishi mumkin, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

/** A rule's value: whole so'm up to 10 000 000; a percent is held to 0–100 by `KpiSettingsService`. */
const KPI_VALUE_MAX = 10_000_000;
```

5. `SETTING_DEFINITIONS` da `'leads.followUpDays'` yozuvidan keyin:

```ts
  // Admin KPI (ADR-0095): read by `KpiSettingsService` per company; the CEO
  // changes them on Sozlamalar → «KPI sozlamalari» (`PATCH /kpi/settings`).
  'kpi.enabled': {
    key: 'kpi.enabled',
    defaultValue: true,
    parse: (raw) => parseBoolean('kpi.enabled', raw),
    companyLevelOnly: true,
  },
  'kpi.leadPaid.mode': {
    key: 'kpi.leadPaid.mode',
    defaultValue: KpiRuleMode.FIXED,
    parse: (raw) => parseKpiMode('kpi.leadPaid.mode', raw),
    companyLevelOnly: true,
  },
  'kpi.leadPaid.value': {
    key: 'kpi.leadPaid.value',
    defaultValue: 50_000,
    parse: (raw) => parseIntInRange('kpi.leadPaid.value', raw, 0, KPI_VALUE_MAX),
    companyLevelOnly: true,
  },
  'kpi.promiseKept.mode': {
    key: 'kpi.promiseKept.mode',
    defaultValue: KpiRuleMode.FIXED,
    parse: (raw) => parseKpiMode('kpi.promiseKept.mode', raw),
    companyLevelOnly: true,
  },
  'kpi.promiseKept.value': {
    key: 'kpi.promiseKept.value',
    defaultValue: 20_000,
    parse: (raw) => parseIntInRange('kpi.promiseKept.value', raw, 0, KPI_VALUE_MAX),
    companyLevelOnly: true,
  },
```

- [ ] **Step 4: `SettingsService.lastWrittenAt` va `setMany`**

`server/src/settings/settings.service.ts` da `getBranchOverrides` dan oldin:

```ts
  /**
   * When the company-level row of `key` was last written; null = never.
   * `KpiSettingsService` writes `kpi.enabled` only when the switch flips, so
   * for that key this is the moment of the flip (ADR-0095).
   */
  async lastWrittenAt(companyId: number, key: SettingKey): Promise<Date | null> {
    const row = await this.prisma.setting.findFirst({
      where: { companyId, branchId: null, key },
      select: { updatedAt: true },
    });
    return row?.updatedAt ?? null;
  }
```

`set` ning qator yozish qismi (`const existing = …` dan `if/else` oxirigacha) xususiy `writeRow` ga ko'chiriladi va `set` uni `this.prisma` bilan chaqiradi — `set` ning xatti-harakati va mavjud testlari o'zgarmaydi. `@prisma/client` importi allaqachon `Prisma` ni beradi. `set` ning tanasi endi:

```ts
    const def = getSettingDefinition(key);
    if (def.companyLevelOnly && branchId != null) {
      throw new BadRequestException(
        `${key} faqat kompaniya darajasida sozlanadi — filial darajasida alohida qiymatga ega emas`,
      );
    }
    const value = def.parse(rawValue);
    await this.writeRow(this.prisma, companyId, branchId ?? null, key, value, updatedById);
    await invalidateCompanySettingsCache(this.redis, companyId);
    return value;
```

(Filial qoidasi ustidagi uzun izoh joyida qoladi.) Klassga, `set` dan keyin:

```ts
  /**
   * Several company-level keys in one transaction: all written or none
   * (ADR-0095 — a KPI rule's mode and value never apart). Every value is
   * parsed before anything is written.
   */
  async setMany(
    companyId: number,
    entries: ReadonlyArray<readonly [SettingKey, unknown]>,
    updatedById: number | undefined,
  ): Promise<void> {
    const parsed = entries.map(([key, raw]) => [key, getSettingDefinition(key).parse(raw)] as const);
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of parsed) {
        await this.writeRow(tx, companyId, null, key, value, updatedById, tx);
      }
    });
    await invalidateCompanySettingsCache(this.redis, companyId);
  }

  /**
   * One row, `findFirst` + update/create (see `set` for why not `upsert`),
   * with its history row. `tx` is passed on to the history only when the
   * write runs inside a transaction.
   */
  private async writeRow(
    db: Prisma.TransactionClient,
    companyId: number,
    branchId: number | null,
    key: SettingKey,
    value: unknown,
    updatedById: number | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const existing = await db.setting.findFirst({ where: { companyId, branchId, key } });
    const jsonValue = value as Prisma.InputJsonValue;
    if (existing) {
      const updated = await db.setting.update({
        where: { id: existing.id },
        data: { value: jsonValue, updatedById },
      });
      await this.entityHistoryService.recordUpdate({
        entityType: 'Setting',
        entityId: updated.id,
        oldValues: { key: existing.key, branchId: existing.branchId, value: existing.value },
        newValues: { key: updated.key, branchId: updated.branchId, value: updated.value },
        changedById: updatedById,
        companyId,
        ...(tx && { tx }),
      });
    } else {
      const created = await db.setting.create({
        data: { companyId, branchId, key, value: jsonValue, updatedById },
      });
      await this.entityHistoryService.recordCreate({
        entityType: 'Setting',
        entityId: created.id,
        newValues: { key: created.key, branchId: created.branchId, value: created.value },
        changedById: updatedById,
        companyId,
        ...(tx && { tx }),
      });
    }
  }
```

- [ ] **Step 5: `kpi-rules.ts`**

`server/src/kpi/kpi-rules.ts`:

```ts
import { KpiResultType, KpiRuleMode } from '@prisma/client';
import { formatSom } from '../payments/shared/format-som';

/**
 * The rules of a KPI result (ADR-0095, spec §7). Pure: the writer, the read
 * side and the backfill share them.
 */

/** Results are counted from this instant: 17.10.2026 00:00 Tashkent (spec §7.1/9). */
export const KPI_START = new Date('2026-10-17T00:00:00+05:00');

/** The first month the KPI pages offer. */
export const KPI_FIRST_MONTH = '2026-10';

/** Why a result was cancelled (spec §7.3). */
export const CANCEL_REASON = {
  REVERSED: "To'lov bekor qilindi",
  CORRECTED: "To'lov tuzatildi",
} as const;

export interface KpiRule {
  mode: KpiRuleMode;
  value: number;
}

export interface KpiSettings {
  enabled: boolean;
  /** When the switch last flipped; null = never. */
  changedAt: Date | null;
  leadPaid: KpiRule;
  promiseKept: KpiRule;
}

/** A fixed rule is its sum; a percent is `round(base × value / 100)` so'm (spec §7.4). */
export function kpiAmount(rule: KpiRule, base: number): number {
  return rule.mode === KpiRuleMode.FIXED
    ? rule.value
    : Math.round((base * rule.value) / 100);
}

/**
 * From when new results are written: KPI_START, or the moment the switch came
 * back on. Null = the switch is off. A payment made before this instant never
 * earns a result later — an off period is not filled in (spec §7.2).
 */
export function recordingSince(
  s: Pick<KpiSettings, 'enabled' | 'changedAt'>,
): Date | null {
  if (!s.enabled) return null;
  return s.changedAt && s.changedAt > KPI_START ? s.changedAt : KPI_START;
}

/** Spec §7.1/1: an Administrator, and neither CEO nor Branch Director. */
export function isKpiEligible(roleNames: readonly string[]): boolean {
  return (
    roleNames.includes('Administrator') &&
    !roleNames.includes('CEO') &&
    !roleNames.includes('Branch Director')
  );
}

/** «Qanday hisoblandi» (spec §7.8): the server writes it, the page prints it. */
export function explainKpi(r: {
  type: KpiResultType;
  ruleMode: KpiRuleMode;
  ruleValue: number;
  baseAmount: number;
}): string {
  if (r.ruleMode === KpiRuleMode.FIXED) return "qat'iy summa";
  const base = formatSom(r.baseAmount);
  return r.type === KpiResultType.LEAD_PAID
    ? `birinchi to'lov ${base} × ${r.ruleValue}%`
    : `qarz ${base} × ${r.ruleValue}%`;
}
```

- [ ] **Step 6: `KpiSettingsService`**

`server/src/kpi/kpi-settings.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { KpiRuleMode } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../settings/settings.types';
import type { KpiRule, KpiSettings } from './kpi-rules';

export interface KpiSettingsPatch {
  enabled?: boolean;
  leadPaid?: KpiRule;
  promiseKept?: KpiRule;
}

/** A percent above 100 is refused; so'm bounds are the setting's own parse. */
function assertRule(rule: KpiRule): void {
  if (rule.mode === KpiRuleMode.PERCENT && rule.value > 100) {
    throw new BadRequestException("Foiz 0 dan 100 gacha bo'lishi kerak");
  }
}

/**
 * KPI prices and the switch (spec §7.4), company-level. The switch row is
 * written only when the switch flips, so its last write is the flip.
 */
@Injectable()
export class KpiSettingsService {
  constructor(private settings: SettingsService) {}

  async read(companyId: number): Promise<KpiSettings> {
    const [enabled, lpMode, lpValue, pkMode, pkValue, changedAt] = await Promise.all([
      this.settings.get(companyId, 'kpi.enabled'),
      this.settings.get(companyId, 'kpi.leadPaid.mode'),
      this.settings.get(companyId, 'kpi.leadPaid.value'),
      this.settings.get(companyId, 'kpi.promiseKept.mode'),
      this.settings.get(companyId, 'kpi.promiseKept.value'),
      this.settings.lastWrittenAt(companyId, 'kpi.enabled'),
    ]);
    return {
      enabled,
      changedAt,
      leadPaid: { mode: lpMode, value: lpValue },
      promiseKept: { mode: pkMode, value: pkValue },
    };
  }

  async update(
    companyId: number,
    patch: KpiSettingsPatch,
    userId: number,
  ): Promise<KpiSettings> {
    if (patch.enabled === undefined && !patch.leadPaid && !patch.promiseKept) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    if (patch.leadPaid) assertRule(patch.leadPaid);
    if (patch.promiseKept) assertRule(patch.promiseKept);

    const current = await this.read(companyId);
    const entries: [SettingKey, unknown][] = [];
    if (patch.enabled !== undefined && patch.enabled !== current.enabled) {
      entries.push(['kpi.enabled', patch.enabled]);
    }
    if (patch.leadPaid) {
      entries.push(['kpi.leadPaid.mode', patch.leadPaid.mode], ['kpi.leadPaid.value', patch.leadPaid.value]);
    }
    if (patch.promiseKept) {
      entries.push(
        ['kpi.promiseKept.mode', patch.promiseKept.mode],
        ['kpi.promiseKept.value', patch.promiseKept.value],
      );
    }
    // One transaction: a rule's mode and value are never seen apart.
    if (entries.length > 0) await this.settings.setMany(companyId, entries, userId);
    return this.read(companyId);
  }
}
```

- [ ] **Step 7: Testlar**

Run: `cd server && npx jest src/settings src/kpi`
Expected: PASS.

- [ ] **Step 8: Format, lint, commit**

```bash
cd server
npx prettier --write src/settings/settings.types.ts src/settings/settings.service.ts src/settings/settings.types.spec.ts src/settings/settings.service.spec.ts src/settings/kpi-settings.spec.ts src/kpi
npx eslint src/settings src/kpi --quiet
cd ..
git add server/src/settings server/src/kpi
git commit -m "feat(kpi): KPI price and switch settings, the pure KPI rules (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `kpi.view` ruxsati

**Files:**
- Modify: `server/src/common/permissions/permission-catalog.types.ts` (`LOCK`)
- Modify: `server/src/common/permissions/permission-catalog.money.ts`
- Modify: `server/src/common/permissions/permission-catalog.spec.ts`
- Modify: `client/src/lib/permission-keys.ts`

**Interfaces:**
- Produces: `PermissionKey` ga `'kpi.view'` (bo'lim `reports`, standart va berilishi mumkin — Direktor; CEO har doim); `LOCK.LEADERS_ONLY`.

- [ ] **Step 1: Spec'ni yangilash (avval yiqiladi)**

`permission-catalog.spec.ts` da:
- `TABLE` dagi `['reports.leads', …]` qatoridan keyin:

```ts
  ['kpi.view', 'D', 'D', { A: 'LEADERS_ONLY', K: 'LEADERS_ONLY', T: 'NO_PAGE' }],
```

- `'has 69 capabilities in 14 sections, none of them empty'` → `'has 70 capabilities in 14 sections, none of them empty'`, `toHaveLength(69)` → `toHaveLength(70)`.
- `defaultKeysForRoles([ROLE_ID.CEO]).size).toBe(69)` va keyingi qator → `70`.
- `'counts 101 locked cells, 67 keys with a lock and 7 CEO-only keys'` → `'counts 104 locked cells, 68 keys with a lock and 7 CEO-only keys'`, `toBe(101)` → `toBe(104)`, `toHaveLength(67)` → `toHaveLength(68)`.

Run: `cd server && npx jest src/common/permissions/permission-catalog.spec.ts`
Expected: FAIL (`kpi.view` va `LEADERS_ONLY` yo'q).

- [ ] **Step 2: Qulf matni**

`permission-catalog.types.ts` da `LOCK` ga (`GROUP_REPORT` dan keyin) va uning izohiga bir qator:

```ts
  LEADERS_ONLY: "kuzatuv bosqichida KPI'ni faqat rahbarlar ko'radi",
```

Izoh ro'yxatiga: ` *   LEADERS_ONLY — the KPI observation month is for the managers (ADR-0095).`

- [ ] **Step 3: Katalogga qo'shish**

`permission-catalog.money.ts` da `'reports.leads'` yozuvidan keyin (obyekt yopilishidan oldin):

```ts
  // «Xodimlar KPI» (ADR-0095): in the observation month only the managers see
  // it (CEO, 16.10.2026). `GET /kpi/overview` and `GET /kpi/users/:id` take
  // `@BranchScope()`; `PATCH /kpi/settings` is `@CeoOnly()`.
  'kpi.view': {
    section: 'reports',
    label: "Xodimlar KPI'sini ko'rish",
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.LEADERS_ONLY,
      [K]: LOCK.LEADERS_ONLY,
      [T]: LOCK.NO_PAGE,
    },
    requires: [],
  },
```

- [ ] **Step 4: Client nusxasi**

`client/src/lib/permission-keys.ts` da `"reports.leads",` qatoridan keyin:

```ts
  "kpi.view",
```

- [ ] **Step 5: Testlar**

```bash
cd server && npx jest src/common/permissions
cd ../client && npx vitest run src/lib/permission-keys.test.ts src/lib/settings-nav.test.ts src/lib/reports-nav.test.ts
```

Expected: PASS. (`permission-routes.spec.ts` ham o'tadi — yangi yo'l hali yo'q.)

- [ ] **Step 6: Format va commit**

```bash
cd server && npx prettier --write src/common/permissions/permission-catalog.types.ts src/common/permissions/permission-catalog.money.ts src/common/permissions/permission-catalog.spec.ts
cd ..
git add server/src/common/permissions client/src/lib/permission-keys.ts
git commit -m "feat(permissions): kpi.view for the managers (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lidning aylanish turi (`conversionKind`)

**Files:**
- Modify: `server/src/leads/leads.service.ts` (`convert`)
- Modify: `server/src/leads/leads.service.spec.ts`
- Modify: `server/src/common/student-origin/student-lead-origin.service.ts` (`applyOrigin`)
- Modify: `server/src/common/student-origin/student-lead-origin.service.spec.ts`

**Interfaces:**
- Consumes: `LeadConversionKind` (Task 1), `activeStudentWhere()` (`server/src/students/shared/active-student-where.ts`).
- Produces: har aylanish `Lead.conversionKind` yozadi — `convert()` yaratish yo'li `NEW_STUDENT`, bog'lash yo'li `activeStudentWhere()` bo'yicha `ALREADY_STUDYING` yoki `RETURNING`; `StudentLeadOriginService` (admin `/students`, Telegram, mock) `NEW_STUDENT`.

- [ ] **Step 1: Yiqiladigan testlar**

`leads.service.spec.ts`:
1. `beforeEach` dagi `prisma.student` mock'iga: `count: jest.fn().mockResolvedValue(0),`.
2. Fayl boshidagi importlarga: `import { activeStudentWhere } from '../students/shared/active-student-where';`.
3. `describe('convert'` ichida, `'throws NotFound when existingStudentId does not resolve…'` testidan keyin:

```ts
    it('marks a lead that opened a new student NEW_STUDENT (ADR-0095)', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      students.create.mockResolvedValue({ id: 10007 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { branchId: 5 }, 1001, 1, null);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversionKind: 'NEW_STUDENT' }),
        }),
      );
      expect(prisma.student.count).not.toHaveBeenCalled();
    });

    it('a lead linked to a student not studying now brought them back: RETURNING', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      prisma.student.findFirst.mockResolvedValue({ id: 10050 });
      prisma.student.count.mockResolvedValue(0);
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { existingStudentId: 10050 }, 1001, 1, null);

      expect(prisma.student.count).toHaveBeenCalledWith({
        where: { id: 10050, ...activeStudentWhere() },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversionKind: 'RETURNING' }),
        }),
      );
    });

    it('a lead linked to a student who is studying earns nothing: ALREADY_STUDYING', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      prisma.student.findFirst.mockResolvedValue({ id: 10050 });
      prisma.student.count.mockResolvedValue(1);
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { existingStudentId: 10050 }, 1001, 1, null);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversionKind: 'ALREADY_STUDYING' }),
        }),
      );
    });
```

`student-lead-origin.service.spec.ts` da `"ikkala yo'l ham statusChangeReason ni tozalaydi"` testidan keyin:

```ts
  // ADR-0095: both paths open a new student card, so the lead counts as one.
  it("ikkala yo'l ham aylanish turini NEW_STUDENT deb yozadi", async () => {
    await service.recordDirectOrigin(tx, baseParams);
    expect(tx.lead.create.mock.calls[0][0].data).toMatchObject({
      conversionKind: 'NEW_STUDENT',
    });

    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
    await service.recordDirectOrigin(tx, baseParams);
    expect(tx.lead.updateMany.mock.calls.at(-1)[0].data).toMatchObject({
      conversionKind: 'NEW_STUDENT',
    });
  });
```

Run: `cd server && npx jest src/leads/leads.service.spec.ts src/common/student-origin`
Expected: FAIL (`conversionKind` yozilmaydi).

- [ ] **Step 2: `convert()`**

`leads.service.ts`:
1. `@prisma/client` importiga `LeadConversionKind`; yangi import: `import { activeStudentWhere } from '../students/shared/active-student-where';`.
2. `convert()` da `let studentId: number;` dan keyin:

```ts
    // ADR-0095: how the lead was converted decides its KPI. A new card is a
    // new student; a link is a return unless the student is studying now.
    let conversionKind: LeadConversionKind = LeadConversionKind.NEW_STUDENT;
```

3. Bog'lash yo'lida `studentId = existing.id;` dan keyin:

```ts
      const studying = await this.prisma.student.count({
        where: { id: existing.id, ...activeStudentWhere() },
      });
      conversionKind =
        studying > 0
          ? LeadConversionKind.ALREADY_STUDYING
          : LeadConversionKind.RETURNING;
```

4. `this.prisma.lead.update({ … data: { … statusChangeReason: isLink ? LEAD_LINKED_REASON : null,` qatoridan keyin: `conversionKind,`.

- [ ] **Step 3: `applyOrigin`**

`student-lead-origin.service.ts`: `@prisma/client` importiga `LeadConversionKind`; `conversionFields` obyektiga `statusChangeReason: null,` dan keyin:

```ts
      // ADR-0095: every path here opens a new student card.
      conversionKind: LeadConversionKind.NEW_STUDENT,
```

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/leads src/common/student-origin`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server
npx prettier --write src/leads/leads.service.ts src/leads/leads.service.spec.ts src/common/student-origin/student-lead-origin.service.ts src/common/student-origin/student-lead-origin.service.spec.ts
npx eslint src/leads/leads.service.ts src/common/student-origin --quiet
cd ..
git add server/src/leads server/src/common/student-origin
git commit -m "feat(leads): record how a lead was converted (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Va'dani bajargan to'lov va tuzatish belgisi

**Files:**
- Modify: `server/src/payments/payments-write.service.ts`
- Modify: `server/src/payments/payments.service.spec.ts`

**Interfaces:**
- Consumes: `PaymentPromise.resolvedPaymentId` (Task 1).
- Produces:
  - `settleKeptPromises(tx, { studentId, balance, performedById, paymentId })` — `KEPT` qilgan to'lov `resolvedPaymentId` ga shu tranzaksiyada yoziladi.
  - `PaymentReversedPayload.correction?: boolean` — `correctAmount` ning birinchi qadami `true`; oddiy bekor qilish `false`.
  - `reverse(id, params: { reason?; performedById?; companyId; correction?: boolean })`.

- [ ] **Step 1: Yiqiladigan testlar**

`payments.service.spec.ts` da `describe('createFromExternal()'` dan oldin:

```ts
  describe('a payment that keeps a promise (ADR-0095)', () => {
    const plain = { studentId: 10001, amount: 500000, method: 'CASH' as any };

    it('create() writes itself on the promises it made KEPT', async () => {
      await service.create(plain, 1, 1001);
      expect(prisma.paymentPromise.updateMany).toHaveBeenCalledWith({
        where: { studentId: 10001, status: 'OPEN' },
        data: expect.objectContaining({
          status: 'KEPT',
          resolvedPaymentId: 'payment-uuid-1',
        }),
      });
    });

    it('createFromExternal() does the same', async () => {
      await service.createFromExternal({
        studentId: 10001,
        amount: 300000,
        method: 'PAYME' as any,
        externalId: 'ext-1',
        source: 'GATEWAY_WEBHOOK' as any,
        companyId: 1001,
      });
      expect(prisma.paymentPromise.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resolvedPaymentId: 'payment-uuid-1' }),
        }),
      );
    });

    it('leaves promises alone while the balance stays below zero', async () => {
      prisma.student.findUnique.mockResolvedValue({ balance: -100 });
      await service.create(plain, 1, 1001);
      expect(prisma.paymentPromise.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('payment.reversed says whether it is a correction (ADR-0095)', () => {
    it('a plain reversal is not', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-uuid-1',
        studentId: 10001,
        amount: 500000,
        contractId: null,
        status: PaymentStatus.COMPLETED,
      });
      await service.reverse('payment-uuid-1', {
        reason: "Xato to'lov",
        performedById: 1,
        companyId: 1001,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.reversed',
        expect.objectContaining({ paymentId: 'payment-uuid-1', correction: false }),
      );
    });

    it('the first leg of an amount correction is', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-uuid-1',
        studentId: 10001,
        amount: 5000000,
        method: 'CASH',
        contractId: null,
        branchId: 1,
        status: PaymentStatus.COMPLETED,
        source: 'ADMIN_MANUAL',
        createdAt: new Date(),
      });
      await service.correctAmount(
        'payment-uuid-1',
        { correctAmount: 400000, reason: 'Ortiqcha nol' },
        99,
        1001,
        ['Administrator'],
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.reversed',
        expect.objectContaining({ paymentId: 'payment-uuid-1', correction: true }),
      );
    });
  });
```

Run: `cd server && npx jest src/payments/payments.service.spec.ts`
Expected: FAIL (`resolvedPaymentId` va `correction` yo'q).

- [ ] **Step 2: Payload va `reverse`**

`payments-write.service.ts`:
1. `PaymentReversedPayload` ga `performedById?: number;` dan keyin:

```ts
  /**
   * The first leg of an amount correction (`correctAmount`): the KPI moves its
   * results to the re-post instead of choosing again (ADR-0095).
   */
  correction?: boolean;
```

2. `reverse` parametr tipi: `params: { reason?: string; performedById?: number; companyId: number; correction?: boolean },`.
3. `this.eventEmitter.emit('payment.reversed', { … performedById: params.performedById,` dan keyin: `correction: params.correction === true,`.
4. `correctAmount` ichidagi `await this.reverse(id, { reason: …, performedById: userId, companyId,` ga: `correction: true,`.

- [ ] **Step 3: `settleKeptPromises`**

Metod imzosi va yozuvi:

```ts
  private async settleKeptPromises(
    tx: Prisma.TransactionClient,
    params: {
      studentId: number;
      balance: number | null | undefined;
      performedById: number | null | undefined;
      /** The payment that cleared the debt — the promise's KPI hangs on it (ADR-0095). */
      paymentId: string;
    },
  ) {
    if (params.balance == null || params.balance < 0) return;
    await tx.paymentPromise.updateMany({
      where: { studentId: params.studentId, status: 'OPEN' },
      data: {
        status: 'KEPT',
        resolvedAt: new Date(),
        resolvedById: params.performedById ?? null,
        resolvedPaymentId: params.paymentId,
      },
    });
  }
```

Ikki chaqiruvga (`create` va `createFromExternal` ichida) `paymentId: payment.id,` qo'shiladi.

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/payments src/payment-gateways`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server
npx prettier --write src/payments/payments-write.service.ts src/payments/payments.service.spec.ts
npx eslint src/payments/payments-write.service.ts --quiet
cd ..
git add server/src/payments
git commit -m "feat(payments): name the payment that kept a promise and flag a correction's reversal (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `KpiResultsService` — natijani yozish

**Files:**
- Create: `server/src/kpi/kpi-results.plan.ts` — o'qiydigan reja yordamchilari (`KpiResult` ga YOZMAYDI)
- Create: `server/src/kpi/kpi-results.service.ts` — har `kpiResult.*` yozuvi faqat shu yerda
- Test: `server/src/kpi/kpi-results.service.spec.ts`
- Create: `server/src/kpi/kpi-write.single-source.spec.ts`

**Interfaces:**
- Consumes: `KpiSettingsService.read` (Task 2), `kpiAmount`, `recordingSince`, `isKpiEligible`, `KPI_START` (Task 2), `Lead.conversionKind` (Task 4), `PaymentPromise.resolvedPaymentId` (Task 5).
- Produces (`kpi-results.plan.ts`):
  - `interface KpiDraft { companyId: number; branchId: number | null; userId: number; type: KpiResultType; leadId: string | null; promiseId: string | null; studentId: number; paymentId: string; paymentAmount: number; baseAmount: number; ruleMode: KpiRuleMode; ruleValue: number; amount: number; month: string; occurredAt: Date; replacesResultId: string | null }`
  - `interface KpiRestore { kinds: ReadonlyMap<string, LeadConversionKind>; resolvers: ReadonlyMap<string, string> }` — backfill tiklaydigan, hali yozilmagan qiymatlar (lid → tur, va'da → to'lov id).
  - `PAYMENT_FACTS`, `type PaymentFacts`, `type Eligible = (userId: number) => Promise<boolean>`, `eligibility(db: PrismaService): Eligible`, `planLeadPaid(db, studentId, companyId, settings, since, eligible, restore?): Promise<KpiDraft[]>`, `planPromiseKept(db, payment, settings, since, eligible, restore?): Promise<KpiDraft[]>`.
- Produces (`kpi-results.service.ts`):
  - `KpiResultsService.planForPayment(paymentId: string, restore?: KpiRestore): Promise<KpiDraft[]>` — yozmaydi.
  - `KpiResultsService.recordForPayment(paymentId: string): Promise<KpiDraft[]>` — yozadi, yozilganlarini qaytaradi; idempotent.

- [ ] **Step 1: Yiqiladigan test**

`server/src/kpi/kpi-results.service.spec.ts`:

```ts
import { Prisma } from '@prisma/client';
import { KpiResultsService } from './kpi-results.service';
import type { KpiSettings } from './kpi-rules';

const at = (iso: string) => new Date(`${iso}+05:00`);
const SETTINGS: KpiSettings = {
  enabled: true,
  changedAt: null,
  leadPaid: { mode: 'FIXED', value: 50_000 },
  promiseKept: { mode: 'FIXED', value: 20_000 },
};
const PAYMENT = {
  id: 'p1',
  studentId: 10500,
  amount: 600_000,
  status: 'COMPLETED',
  createdAt: at('2026-10-20T10:00:00'),
  companyId: 1001,
  branchId: 2,
  correctsPaymentId: null as string | null,
};
const FIRST = { id: 'p1', amount: 600_000, createdAt: PAYMENT.createdAt, branchId: 2 };
const LEAD = {
  id: 'L1',
  ownerId: 11,
  branchId: 3 as number | null,
  statusChangedAt: at('2026-10-18T09:00:00'),
  conversionKind: 'NEW_STUDENT' as string | null,
};
const ROLES: Record<number, string[]> = {
  11: ['Administrator'],
  12: ['Administrator', 'CEO'],
  13: ['Administrator', 'Branch Director'],
  14: ['Cashier'],
};

export function setupKpiResults(settings: Partial<KpiSettings> = {}) {
  const prisma = {
    payment: {
      findUnique: jest.fn().mockResolvedValue(PAYMENT),
      findFirst: jest.fn().mockResolvedValue(FIRST),
      findMany: jest.fn().mockResolvedValue([]),
    },
    lead: { findMany: jest.fn().mockResolvedValue([LEAD]) },
    paymentPromise: { findMany: jest.fn().mockResolvedValue([]) },
    kpiResult: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: { where: { id: number } }) =>
        ROLES[where.id]
          ? { roles: ROLES[where.id].map((name) => ({ role: { name } })) }
          : null,
      ),
    },
  };
  const kpiSettings = { read: jest.fn().mockResolvedValue({ ...SETTINGS, ...settings }) };
  const service = new KpiResultsService(prisma as never, kpiSettings as never);
  return { prisma, kpiSettings, service };
}

describe('KpiResultsService.recordForPayment — LEAD_PAID', () => {
  it("credits the owner of a new student's lead with the first payment after the conversion", async () => {
    const s = setupKpiResults();
    const written = await s.service.recordForPayment('p1');

    expect(written).toHaveLength(1);
    expect(s.prisma.payment.findFirst).toHaveBeenCalledWith({
      where: {
        studentId: 10500,
        companyId: 1001,
        status: 'COMPLETED',
        createdAt: { gte: LEAD.statusChangedAt },
        id: { notIn: [] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amount: true, createdAt: true, branchId: true },
    });
    expect(s.prisma.kpiResult.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: 3,
        userId: 11,
        type: 'LEAD_PAID',
        leadId: 'L1',
        promiseId: null,
        studentId: 10500,
        paymentId: 'p1',
        paymentAmount: 600_000,
        baseAmount: 600_000,
        ruleMode: 'FIXED',
        ruleValue: 50_000,
        amount: 50_000,
        month: '2026-10',
        occurredAt: PAYMENT.createdAt,
        replacesResultId: null,
      },
    });
  });

  it("takes the payment's branch for a lead with no branch", async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, branchId: null }]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data.branchId).toBe(2);
  });

  it('seals a percent rule on the payment: round(base × value / 100)', async () => {
    const s = setupKpiResults({ leadPaid: { mode: 'PERCENT', value: 5 } });
    s.prisma.payment.findFirst.mockResolvedValue({ ...FIRST, amount: 333_333 });
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      paymentAmount: 333_333,
      baseAmount: 333_333,
      ruleMode: 'PERCENT',
      ruleValue: 5,
      amount: 16_667,
    });
  });

  it('a lead linked to a student who is studying earns nothing; the backfill may supply a missing kind', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, conversionKind: 'ALREADY_STUDYING' }]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();

    s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, conversionKind: null }]);
    await expect(s.service.planForPayment('p1')).resolves.toEqual([]);
    const drafts = await s.service.planForPayment('p1', {
      kinds: new Map([['L1', 'RETURNING' as const]]),
      resolvers: new Map(),
    });
    expect(drafts.map((d) => d.leadId)).toEqual(['L1']);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it.each([12, 13, 14, 99])(
    'writes nothing for owner %i — not an administrator alone, or not an active account',
    async (ownerId) => {
      const s = setupKpiResults();
      s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, ownerId }]);
      await s.service.recordForPayment('p1');
      expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
    },
  );

  it('writes nothing while the switch is off, nor for a payment made before it came back on', async () => {
    const off = setupKpiResults({ enabled: false });
    await off.service.recordForPayment('p1');
    expect(off.prisma.lead.findMany).not.toHaveBeenCalled();
    expect(off.prisma.kpiResult.create).not.toHaveBeenCalled();

    const later = setupKpiResults({ changedAt: at('2026-10-25T00:00:00') });
    await later.service.recordForPayment('p1');
    expect(later.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('skips a lead that has its result and a payment another lead holds', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, id: 'L0' }, LEAD]);
    s.prisma.kpiResult.findMany.mockImplementation(async ({ where }: { where: { type?: string } }) =>
      where.type === 'LEAD_PAID' ? [{ leadId: 'L0', paymentId: 'p0' }] : [],
    );
    await s.service.recordForPayment('p1');

    expect(s.prisma.payment.findFirst).toHaveBeenCalledTimes(1);
    expect(s.prisma.payment.findFirst.mock.calls[0][0].where.id).toEqual({ notIn: ['p0'] });
    expect(s.prisma.kpiResult.create).toHaveBeenCalledTimes(1);
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data.leadId).toBe('L1');
  });

  it('writes nothing for a payment that is not COMPLETED', async () => {
    const s = setupKpiResults();
    s.prisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, status: 'REVERSED' });
    await expect(s.service.recordForPayment('p1')).resolves.toEqual([]);
    expect(s.kpiSettings.read).not.toHaveBeenCalled();
  });

  it('a writer that got there first is not an error', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(s.service.recordForPayment('p1')).resolves.toEqual([]);
  });
});

describe('KpiResultsService.recordForPayment — PROMISE_KEPT', () => {
  const PROMISE = {
    id: 'pr1',
    createdById: 11,
    balanceAtPromise: -400_000,
    branchId: null as number | null,
    studentId: 10500,
    companyId: 1001,
  };

  it("credits the promise's writer, the debt at the promise as the base", async () => {
    const s = setupKpiResults({ promiseKept: { mode: 'PERCENT', value: 5 } });
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([PROMISE]);
    await s.service.recordForPayment('p1');

    expect(s.prisma.paymentPromise.findMany).toHaveBeenCalledWith({
      where: { resolvedPaymentId: 'p1', status: 'KEPT' },
      select: {
        id: true,
        createdById: true,
        balanceAtPromise: true,
        branchId: true,
        studentId: true,
        companyId: true,
      },
    });
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toEqual({
      companyId: 1001,
      branchId: 2,
      userId: 11,
      type: 'PROMISE_KEPT',
      leadId: null,
      promiseId: 'pr1',
      studentId: 10500,
      paymentId: 'p1',
      paymentAmount: 600_000,
      baseAmount: 400_000,
      ruleMode: 'PERCENT',
      ruleValue: 5,
      amount: 20_000,
      month: '2026-10',
      occurredAt: PAYMENT.createdAt,
      replacesResultId: null,
    });
  });

  it('floors a promise made without debt at a zero base', async () => {
    const s = setupKpiResults({ promiseKept: { mode: 'PERCENT', value: 5 } });
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([{ ...PROMISE, balanceAtPromise: 100 }]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      baseAmount: 0,
      amount: 0,
    });
  });

  it('skips a promise that already has its result, and a writer who is not eligible', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([PROMISE, { ...PROMISE, id: 'pr2', createdById: 14 }]);
    s.prisma.kpiResult.findMany.mockImplementation(async ({ where }: { where: { type?: string } }) =>
      where.type === 'PROMISE_KEPT' ? [{ promiseId: 'pr1' }] : [],
    );
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it("the backfill's dry run also reads the promises it would link to this payment", async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([PROMISE]);
    const drafts = await s.service.planForPayment('p1', {
      kinds: new Map(),
      resolvers: new Map([
        ['pr1', 'p1'],
        ['pr9', 'p7'],
      ]),
    });
    expect(s.prisma.paymentPromise.findMany.mock.calls[0][0].where).toEqual({
      status: 'KEPT',
      OR: [{ resolvedPaymentId: 'p1' }, { id: { in: ['pr1'] } }],
    });
    expect(drafts.map((d) => d.promiseId)).toEqual(['pr1']);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });
});
```

`server/src/kpi/kpi-write.single-source.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * KPI results have one door: `KpiResultsService` (ADR-0095, spec §7.5). A
 * result is sealed when written and cancelled only with a reason; a write
 * from another module would skip the eligibility rule, the switch and the
 * one-active-result guard. The backfill script calls the service too.
 */

const SRC = join(__dirname, '..');
const OWNER = 'src/kpi/kpi-results.service.ts';
const WRITE =
  /\b(tx|prisma|db|this\.prisma)\.kpiResult\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const writes = walk(SRC).flatMap((file) => {
  const path = 'src/' + file.slice(SRC.length + 1).split('\\').join('/');
  return [...readFileSync(file, 'utf8').matchAll(WRITE)].map((m) => ({
    path,
    call: m[0],
  }));
});

describe('KPI results are written only by KpiResultsService', () => {
  it('found the writes — a scan that matches nothing proves nothing', () => {
    expect(writes.some((w) => w.path === OWNER)).toBe(true);
  });

  it('no other file writes a KpiResult row', () => {
    expect(
      writes.filter((w) => w.path !== OWNER).map((w) => `${w.path}: ${w.call}`),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/kpi/kpi-results.service.spec.ts src/kpi/kpi-write.single-source.spec.ts`
Expected: FAIL — `Cannot find module './kpi-results.service'`.

- [ ] **Step 3: Reja yordamchilari (`kpi-results.plan.ts`)**

Reja o'qiydi, `KpiResult` ga yozmaydi — har yozuv servisda qoladi (`kpi-write.single-source.spec.ts`). Servis faylini 500 qatordan pastda saqlash uchun alohida.

`server/src/kpi/kpi-results.plan.ts`:

```ts
import {
  KpiResultStatus,
  KpiResultType,
  KpiRuleMode,
  LeadConversionKind,
  LeadStatus,
  PaymentPromiseStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { whereUserMayAct } from '../common/auth/blocked-user';
import { tashkentMonthKey } from '../common/date/tashkent';
import { KPI_START, isKpiEligible, kpiAmount, type KpiSettings } from './kpi-rules';

/**
 * What a payment earns (ADR-0095, spec §7.2), read without writing. Every
 * `KpiResult` write stays in `KpiResultsService`.
 */

/** A result about to be written (spec §7.5): every column but the generated ones. */
export interface KpiDraft {
  companyId: number;
  branchId: number | null;
  userId: number;
  type: KpiResultType;
  leadId: string | null;
  promiseId: string | null;
  studentId: number;
  paymentId: string;
  paymentAmount: number;
  baseAmount: number;
  ruleMode: KpiRuleMode;
  ruleValue: number;
  amount: number;
  month: string;
  occurredAt: Date;
  replacesResultId: string | null;
}

/**
 * Values the backfill would restore but has not written yet (its dry run):
 * a lead's conversion kind, and the payment (`resolvers`: promise id →
 * payment id) that made a promise KEPT before `resolvedPaymentId` existed.
 */
export interface KpiRestore {
  kinds: ReadonlyMap<string, LeadConversionKind>;
  resolvers: ReadonlyMap<string, string>;
}

export const PAYMENT_FACTS = {
  id: true,
  studentId: true,
  amount: true,
  status: true,
  createdAt: true,
  companyId: true,
  branchId: true,
  correctsPaymentId: true,
} satisfies Prisma.PaymentSelect;
export type PaymentFacts = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_FACTS }>;
export type Eligible = (userId: number) => Promise<boolean>;

/** The conversions that earn a LEAD_PAID (spec §7.2): a new student, or one who came back. */
const EARNING_KINDS: readonly LeadConversionKind[] = [
  LeadConversionKind.NEW_STUDENT,
  LeadConversionKind.RETURNING,
];

/** Spec §7.1/1, read from the database when the result is written. Cached per call. */
export function eligibility(db: PrismaService): Eligible {
  const cache = new Map<number, boolean>();
  return async (userId) => {
    const hit = cache.get(userId);
    if (hit !== undefined) return hit;
    const user = await db.user.findFirst({
      where: { id: userId, ...whereUserMayAct() },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const ok = !!user && isKpiEligible(user.roles.map((r) => r.role.name));
    cache.set(userId, ok);
    return ok;
  };
}

/**
 * Spec §7.2 LEAD_PAID: each converted lead of the student with an owner gets
 * the student's first COMPLETED payment after the conversion that no other
 * lead holds. A converted lead archived with its section still counts (no
 * `deletedAt` filter): the conversion happened.
 */
export async function planLeadPaid(
  db: PrismaService,
  studentId: number,
  companyId: number,
  settings: KpiSettings,
  since: Date,
  eligible: Eligible,
  restore?: KpiRestore,
): Promise<KpiDraft[]> {
  const leads = await db.lead.findMany({
    where: {
      companyId,
      convertedStudentId: studentId,
      statusEnum: LeadStatus.CONVERTED,
      ownerId: { not: null },
      statusChangedAt: { gte: KPI_START },
    },
    select: { id: true, ownerId: true, branchId: true, statusChangedAt: true, conversionKind: true },
    orderBy: [{ statusChangedAt: 'asc' }, { id: 'asc' }],
  });
  if (leads.length === 0) return [];
  const active = await db.kpiResult.findMany({
    where: { type: KpiResultType.LEAD_PAID, status: KpiResultStatus.ACTIVE, studentId },
    select: { leadId: true, paymentId: true },
  });
  const done = new Set(active.map((r) => r.leadId));
  const usedPayments = active.map((r) => r.paymentId);

  const drafts: KpiDraft[] = [];
  for (const lead of leads) {
    const kind = lead.conversionKind ?? restore?.kinds.get(lead.id) ?? null;
    if (!kind || !EARNING_KINDS.includes(kind)) continue;
    if (done.has(lead.id) || lead.ownerId == null || lead.statusChangedAt == null) continue;
    const first = await db.payment.findFirst({
      where: {
        studentId,
        companyId,
        status: PaymentStatus.COMPLETED,
        createdAt: { gte: lead.statusChangedAt },
        // A copy: the list grows below, and the query must keep what it was asked.
        id: { notIn: [...usedPayments] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amount: true, createdAt: true, branchId: true },
    });
    // Paid while the switch was off: that result is never written later.
    if (!first || first.createdAt < since) continue;
    if (!(await eligible(lead.ownerId))) continue;
    usedPayments.push(first.id);
    drafts.push({
      companyId,
      branchId: lead.branchId ?? first.branchId,
      userId: lead.ownerId,
      type: KpiResultType.LEAD_PAID,
      leadId: lead.id,
      promiseId: null,
      studentId,
      paymentId: first.id,
      paymentAmount: first.amount,
      baseAmount: first.amount,
      ruleMode: settings.leadPaid.mode,
      ruleValue: settings.leadPaid.value,
      amount: kpiAmount(settings.leadPaid, first.amount),
      month: tashkentMonthKey(first.createdAt),
      occurredAt: first.createdAt,
      replacesResultId: null,
    });
  }
  return drafts;
}

/** Spec §7.2 PROMISE_KEPT: the promises this payment made KEPT, to their writer. */
export async function planPromiseKept(
  db: PrismaService,
  payment: PaymentFacts,
  settings: KpiSettings,
  since: Date,
  eligible: Eligible,
  restore?: KpiRestore,
): Promise<KpiDraft[]> {
  if (payment.createdAt < since) return [];
  const restored = restore
    ? [...restore.resolvers].filter(([, paymentId]) => paymentId === payment.id).map(([id]) => id)
    : [];
  const promises = await db.paymentPromise.findMany({
    where: restored.length
      ? {
          status: PaymentPromiseStatus.KEPT,
          OR: [{ resolvedPaymentId: payment.id }, { id: { in: restored } }],
        }
      : { resolvedPaymentId: payment.id, status: PaymentPromiseStatus.KEPT },
    select: {
      id: true,
      createdById: true,
      balanceAtPromise: true,
      branchId: true,
      studentId: true,
      companyId: true,
    },
  });
  if (promises.length === 0) return [];
  const done = new Set(
    (
      await db.kpiResult.findMany({
        where: {
          type: KpiResultType.PROMISE_KEPT,
          status: KpiResultStatus.ACTIVE,
          promiseId: { in: promises.map((p) => p.id) },
        },
        select: { promiseId: true },
      })
    ).map((r) => r.promiseId),
  );
  const drafts: KpiDraft[] = [];
  for (const p of promises) {
    if (done.has(p.id) || !(await eligible(p.createdById))) continue;
    const base = Math.max(0, -p.balanceAtPromise);
    drafts.push({
      companyId: p.companyId,
      branchId: p.branchId ?? payment.branchId,
      userId: p.createdById,
      type: KpiResultType.PROMISE_KEPT,
      leadId: null,
      promiseId: p.id,
      studentId: p.studentId,
      paymentId: payment.id,
      paymentAmount: payment.amount,
      baseAmount: base,
      ruleMode: settings.promiseKept.mode,
      ruleValue: settings.promiseKept.value,
      amount: kpiAmount(settings.promiseKept, base),
      month: tashkentMonthKey(payment.createdAt),
      occurredAt: payment.createdAt,
      replacesResultId: null,
    });
  }
  return drafts;
}
```

- [ ] **Step 4: Servisni yozish**

`server/src/kpi/kpi-results.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KpiSettingsService } from './kpi-settings.service';
import { recordingSince } from './kpi-rules';
import {
  PAYMENT_FACTS,
  eligibility,
  planLeadPaid,
  planPromiseKept,
  type KpiDraft,
  type KpiRestore,
  type PaymentFacts,
} from './kpi-results.plan';

export type { KpiDraft, KpiRestore } from './kpi-results.plan';

/**
 * The one writer of `KpiResult` (ADR-0095; `kpi-write.single-source.spec.ts`).
 * Called after a payment commits (`KpiRecorderListener`), by the nightly
 * repair and by the backfill. Every call is safe to repeat: the partial
 * unique indexes keep one ACTIVE result per lead, per LEAD_PAID payment and
 * per promise, and a lost race is skipped.
 */
@Injectable()
export class KpiResultsService {
  constructor(
    private prisma: PrismaService,
    private kpiSettings: KpiSettingsService,
  ) {}

  /**
   * What a COMPLETED payment earns, without writing: the student's LEAD_PAID
   * and the PROMISE_KEPT of the promises this payment kept. The backfill's
   * dry run reads it; `restore` supplies what it would restore first.
   */
  async planForPayment(paymentId: string, restore?: KpiRestore): Promise<KpiDraft[]> {
    const payment = await this.payment(paymentId);
    return payment ? this.planFor(payment, restore) : [];
  }

  /** Writes what `planForPayment` finds; returns what was written. */
  async recordForPayment(paymentId: string): Promise<KpiDraft[]> {
    const payment = await this.payment(paymentId);
    if (!payment) return [];
    const written: KpiDraft[] = [];
    for (const draft of await this.planFor(payment)) {
      if (await this.insert(draft)) written.push(draft);
    }
    return written;
  }

  private async payment(id: string): Promise<PaymentFacts | null> {
    const p = await this.prisma.payment.findUnique({ where: { id }, select: PAYMENT_FACTS });
    return p && p.status === PaymentStatus.COMPLETED ? p : null;
  }

  private async planFor(payment: PaymentFacts, restore?: KpiRestore): Promise<KpiDraft[]> {
    const settings = await this.kpiSettings.read(payment.companyId);
    const since = recordingSince(settings);
    if (!since) return [];
    const eligible = eligibility(this.prisma);
    return [
      ...(await planLeadPaid(this.prisma, payment.studentId, payment.companyId, settings, since, eligible, restore)),
      ...(await planPromiseKept(this.prisma, payment, settings, since, eligible, restore)),
    ];
  }

  /** The one insert. A writer that got there first (`P2002`) is not an error. */
  private async insert(draft: KpiDraft): Promise<boolean> {
    try {
      await this.prisma.kpiResult.create({ data: draft });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return false;
      }
      throw e;
    }
  }
}
```

- [ ] **Step 5: Testlar**

Run: `cd server && npx jest src/kpi`
Expected: PASS.

- [ ] **Step 6: Format, lint, commit**

```bash
cd server
npx prettier --write src/kpi
npx eslint src/kpi --quiet
cd ..
git add server/src/kpi
git commit -m "feat(kpi): KpiResultsService records LEAD_PAID and PROMISE_KEPT (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bekor qilish, tuzatishni ko'chirish va to'lov hodisalari

**Files:**
- Modify: `server/src/kpi/kpi-results.service.ts` (+ `kpi-results.service.spec.ts`)
- Modify: `server/src/kpi/kpi-results.plan.ts` (`movedDraft` — sof)
- Create: `server/src/kpi/kpi-recorder.listener.ts` (+ `.spec.ts`)
- Create: `server/src/kpi/kpi.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `PaymentReceivedPayload`, `PaymentReversedPayload.correction` (Task 5), `CANCEL_REASON` (Task 2).
- Produces:
  - `KpiResultsService.cancelForPayment(paymentId: string, opts: { correction: boolean }, now?: Date): Promise<number>` — bekor qilingan natijalar soni.
  - `recordForPayment` endi tuzatuvchi to'lovda (`correctsPaymentId`) eski natijalarni muhrlangan qoidasi bilan ko'chiradi (`replacesResultId`).
  - `KpiRecorderListener` (`@OnEvent('payment.received')`, `@OnEvent('payment.reversed')`), `KpiModule` (`imports: [SettingsModule]`, `providers: [KpiSettingsService, KpiResultsService, KpiRecorderListener]`).

- [ ] **Step 1: Yiqiladigan testlar**

`kpi-results.service.spec.ts` oxiriga:

```ts
describe('KpiResultsService.cancelForPayment', () => {
  const NOW = new Date('2026-10-22T06:00:00Z');
  const ACTIVE_ON_P1 = [{ id: 'r1', type: 'LEAD_PAID', studentId: 10500, companyId: 1001 }];
  const byWhere = (onPayment: unknown[]) =>
    async ({ where }: { where: { paymentId?: string } }) => (where.paymentId ? onPayment : []);

  it('cancels a reversed payment\'s results and lets the lead take its next payment', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockImplementation(byWhere(ACTIVE_ON_P1));
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });
    s.prisma.payment.findFirst.mockResolvedValue({ ...FIRST, id: 'p2', amount: 300_000 });

    await expect(s.service.cancelForPayment('p1', { correction: false }, NOW)).resolves.toBe(1);

    expect(s.prisma.kpiResult.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] }, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: NOW, cancelReason: "To'lov bekor qilindi" },
    });
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      leadId: 'L1',
      paymentId: 'p2',
      amount: 50_000,
    });
  });

  it("a correction's reversal says so and leaves the move to the re-post", async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockImplementation(byWhere(ACTIVE_ON_P1));
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });

    await s.service.cancelForPayment('p1', { correction: true }, NOW);

    expect(s.prisma.kpiResult.updateMany.mock.calls[0][0].data.cancelReason).toBe("To'lov tuzatildi");
    expect(s.prisma.lead.findMany).not.toHaveBeenCalled();
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('cancels while the switch is off, and writes no new result then', async () => {
    const s = setupKpiResults({ enabled: false });
    s.prisma.kpiResult.findMany.mockImplementation(byWhere(ACTIVE_ON_P1));
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });

    await expect(s.service.cancelForPayment('p1', { correction: false }, NOW)).resolves.toBe(1);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('does nothing for a payment with no active result', async () => {
    const s = setupKpiResults();
    await expect(s.service.cancelForPayment('p1', { correction: false }, NOW)).resolves.toBe(0);
    expect(s.prisma.kpiResult.updateMany).not.toHaveBeenCalled();
  });
});

describe('KpiResultsService.recordForPayment — a corrected amount', () => {
  const REPOST = { ...PAYMENT, id: 'p2', amount: 400_000, correctsPaymentId: 'p1' };
  const OLD = [
    {
      id: 'r1', companyId: 1001, branchId: 3, userId: 11, type: 'LEAD_PAID', leadId: 'L1',
      promiseId: null, studentId: 10500, paymentId: 'p1', paymentAmount: 600_000,
      baseAmount: 600_000, ruleMode: 'PERCENT', ruleValue: 5, amount: 30_000,
    },
    {
      id: 'r2', companyId: 1001, branchId: 2, userId: 12, type: 'PROMISE_KEPT', leadId: null,
      promiseId: 'pr1', studentId: 10500, paymentId: 'p1', paymentAmount: 600_000,
      baseAmount: 400_000, ruleMode: 'FIXED', ruleValue: 20_000, amount: 20_000,
    },
  ];
  const results = (moved: { replacesResultId: string }[]) =>
    async ({ where }: { where: { paymentId?: string; replacesResultId?: unknown } }) =>
      where.replacesResultId ? moved : where.paymentId === 'p1' ? OLD : [];

  it('moves the old results to the re-post under their sealed rule', async () => {
    const s = setupKpiResults({ enabled: false });
    s.prisma.payment.findUnique.mockResolvedValue(REPOST);
    s.prisma.kpiResult.findMany.mockImplementation(results([]));

    const written = await s.service.recordForPayment('p2');

    expect(s.prisma.kpiResult.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'p1', status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelReason: "To'lov tuzatildi" },
    });
    expect(written).toHaveLength(2);
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      type: 'LEAD_PAID', leadId: 'L1', userId: 11, paymentId: 'p2', paymentAmount: 400_000,
      baseAmount: 400_000, ruleMode: 'PERCENT', ruleValue: 5, amount: 20_000, replacesResultId: 'r1',
    });
    expect(s.prisma.kpiResult.create.mock.calls[1][0].data).toMatchObject({
      type: 'PROMISE_KEPT', promiseId: 'pr1', userId: 12, paymentId: 'p2',
      baseAmount: 400_000, ruleMode: 'FIXED', amount: 20_000, replacesResultId: 'r2',
    });
  });

  it('moves nothing twice', async () => {
    const s = setupKpiResults();
    s.prisma.payment.findUnique.mockResolvedValue(REPOST);
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.kpiResult.findMany.mockImplementation(
      results([{ replacesResultId: 'r1' }, { replacesResultId: 'r2' }]),
    );
    await expect(s.service.recordForPayment('p2')).resolves.toEqual([]);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });
});
```

(`setupKpiResults` faylda e'lon qilingan — `export` bilan qoldiring yoki `export` so'zini olib tashlang; ikkalasi ham ishlaydi.)

`server/src/kpi/kpi-recorder.listener.spec.ts`:

```ts
import { KpiRecorderListener } from './kpi-recorder.listener';

describe('KpiRecorderListener', () => {
  const setup = () => {
    const results = {
      recordForPayment: jest.fn().mockResolvedValue([]),
      cancelForPayment: jest.fn().mockResolvedValue(0),
    };
    return { results, listener: new KpiRecorderListener(results as never) };
  };

  it('records a received payment and cancels a reversed one with its correction flag', async () => {
    const s = setup();
    await s.listener.onReceived({ paymentId: 'p1' } as never);
    expect(s.results.recordForPayment).toHaveBeenCalledWith('p1');

    await s.listener.onReversed({ paymentId: 'p1', correction: true } as never);
    expect(s.results.cancelForPayment).toHaveBeenCalledWith('p1', { correction: true });
    await s.listener.onReversed({ paymentId: 'p3' } as never);
    expect(s.results.cancelForPayment).toHaveBeenLastCalledWith('p3', { correction: false });
  });

  it('never lets a failure reach the payment — the nightly run heals it', async () => {
    const s = setup();
    s.results.recordForPayment.mockRejectedValue(new Error('db down'));
    s.results.cancelForPayment.mockRejectedValue(new Error('db down'));
    await expect(s.listener.onReceived({ paymentId: 'p1' } as never)).resolves.toBeUndefined();
    await expect(s.listener.onReversed({ paymentId: 'p1' } as never)).resolves.toBeUndefined();
  });
});
```

Run: `cd server && npx jest src/kpi`
Expected: FAIL (`cancelForPayment`, `./kpi-recorder.listener` yo'q; tuzatish ko'chirilmaydi).

- [ ] **Step 2: Bekor qilish va ko'chirish**

`kpi-results.plan.ts` oxiriga (sof — yozmaydi):

```ts
/**
 * A corrected amount (spec §7.3): the old result on the re-post under its
 * sealed rule. A percent LEAD_PAID is re-read from the new amount; a
 * promise keeps its debt as the base.
 */
export function movedDraft(
  old: Pick<
    KpiDraft,
    'companyId' | 'branchId' | 'userId' | 'type' | 'leadId' | 'promiseId' | 'studentId' | 'baseAmount' | 'ruleMode' | 'ruleValue'
  > & { id: string },
  payment: Pick<PaymentFacts, 'id' | 'amount' | 'createdAt'>,
): KpiDraft {
  const base = old.type === KpiResultType.LEAD_PAID ? payment.amount : old.baseAmount;
  return {
    companyId: old.companyId,
    branchId: old.branchId,
    userId: old.userId,
    type: old.type,
    leadId: old.leadId,
    promiseId: old.promiseId,
    studentId: old.studentId,
    paymentId: payment.id,
    paymentAmount: payment.amount,
    baseAmount: base,
    ruleMode: old.ruleMode,
    ruleValue: old.ruleValue,
    amount: kpiAmount({ mode: old.ruleMode, value: old.ruleValue }, base),
    month: tashkentMonthKey(payment.createdAt),
    occurredAt: payment.createdAt,
    replacesResultId: old.id,
  };
}
```

`kpi-results.service.ts`:
1. Importlar: `@prisma/client` dan `KpiResultStatus, KpiResultType` (+ mavjud `PaymentStatus, Prisma`); `./kpi-rules` dan `CANCEL_REASON, recordingSince`; `./kpi-results.plan` dan `movedDraft` ham.
2. `recordForPayment` ni almashtiring:

```ts
  /**
   * Writes what `planForPayment` finds; returns what was written. A
   * correction's re-post first carries the old payment's results over.
   */
  async recordForPayment(paymentId: string): Promise<KpiDraft[]> {
    const payment = await this.payment(paymentId);
    if (!payment) return [];
    const written: KpiDraft[] = [];
    if (payment.correctsPaymentId) written.push(...(await this.moveCorrected(payment)));
    for (const draft of await this.planFor(payment)) {
      if (await this.insert(draft)) written.push(draft);
    }
    return written;
  }
```

3. Klass ichiga (`payment()` dan oldin):

```ts
  /**
   * A payment that no longer stands (spec §7.3): its ACTIVE results are
   * cancelled — also while the switch is off. After a plain reversal the
   * lead takes its next earliest payment; a correction leaves that to the
   * re-post, which carries the old result over (`moveCorrected`).
   */
  async cancelForPayment(
    paymentId: string,
    opts: { correction: boolean },
    now: Date = new Date(),
  ): Promise<number> {
    const active = await this.prisma.kpiResult.findMany({
      where: { paymentId, status: KpiResultStatus.ACTIVE },
      select: { id: true, type: true, studentId: true, companyId: true },
    });
    if (active.length === 0) return 0;
    const { count } = await this.prisma.kpiResult.updateMany({
      where: { id: { in: active.map((r) => r.id) }, status: KpiResultStatus.ACTIVE },
      data: {
        status: KpiResultStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: opts.correction ? CANCEL_REASON.CORRECTED : CANCEL_REASON.REVERSED,
      },
    });
    if (!opts.correction) {
      const students = new Map(
        active
          .filter((r) => r.type === KpiResultType.LEAD_PAID)
          .map((r) => [r.studentId, r.companyId] as const),
      );
      for (const [studentId, companyId] of students) {
        await this.rechooseLeadPaid(studentId, companyId);
      }
    }
    return count;
  }

  /** The lead's next earliest COMPLETED payment becomes its result — a new result, so the switch applies. */
  private async rechooseLeadPaid(studentId: number, companyId: number): Promise<void> {
    const settings = await this.kpiSettings.read(companyId);
    const since = recordingSince(settings);
    if (!since) return;
    const drafts = await planLeadPaid(this.prisma, studentId, companyId, settings, since, eligibility(this.prisma));
    for (const draft of drafts) await this.insert(draft);
  }

  /**
   * A corrected amount (spec §7.3): the old payment's results move to the
   * re-post under their sealed rule (`movedDraft`). Written whatever the
   * switch says (a result moved is not a new one). Safe to repeat, and safe
   * in either order with the reversal's own handler.
   */
  private async moveCorrected(payment: PaymentFacts, now: Date = new Date()): Promise<KpiDraft[]> {
    const oldPaymentId = payment.correctsPaymentId as string;
    await this.prisma.kpiResult.updateMany({
      where: { paymentId: oldPaymentId, status: KpiResultStatus.ACTIVE },
      data: { status: KpiResultStatus.CANCELLED, cancelledAt: now, cancelReason: CANCEL_REASON.CORRECTED },
    });
    const old = await this.prisma.kpiResult.findMany({
      where: { paymentId: oldPaymentId, cancelReason: CANCEL_REASON.CORRECTED },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (old.length === 0) return [];
    const moved = new Set(
      (
        await this.prisma.kpiResult.findMany({
          where: { replacesResultId: { in: old.map((r) => r.id) } },
          select: { replacesResultId: true },
        })
      ).map((r) => r.replacesResultId),
    );
    const written: KpiDraft[] = [];
    for (const r of old) {
      if (moved.has(r.id)) continue;
      const draft = movedDraft(r, payment);
      if (await this.insert(draft)) written.push(draft);
    }
    return written;
  }
```

**Tuzatishning qayta yozilishi muvaffaqiyatsiz bo'lsa** (`correctAmount` eski to'lovni bekor qildi, lekin yangi to'lov yozilmadi — `correctsPaymentId` bor to'lov yo'q): eski natijalar `CANCELLED` «To'lov tuzatildi» bo'lib qoladi, ko'chiradigan to'lov yo'q. O'quvchining keyingi `recordForPayment` i — tungi tuzatish (Task 12, o'quvchining oxirgi 2 kundagi biror to'lovi bo'lsa) yoki o'quvchining navbatdagi to'lovi hodisasi — lidni ko'radi va `LEAD_PAID` qolgan eng birinchi `COMPLETED` to'lovga qayta tanlanadi (admin to'g'ri summani qo'lda kiritsa — odatda o'sha to'lov). `PROMISE_KEPT` esa yo'qoladi: va'da `KEPT` holicha eski (bekor qilingan) to'lovga bog'langan, yangi to'lov uni qayta `KEPT` qilmaydi. Bu ma'lum chegara — ADR-0095 «Oqibatlari» da yozilgan (Task 19). Kod qo'shilmaydi.

- [ ] **Step 3: Listener**

`server/src/kpi/kpi-recorder.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  PaymentReceivedPayload,
  PaymentReversedPayload,
} from '../payments/payments-write.service';
import { describeError } from '../telegram-digest/telegram-send';
import { KpiResultsService } from './kpi-results.service';

/**
 * Records KPI results after a payment commits (spec §7.6). A failure is
 * logged and never reaches the payment; `KpiSelfHealCron` repairs it at night.
 */
@Injectable()
export class KpiRecorderListener {
  private readonly logger = new Logger(KpiRecorderListener.name);

  constructor(private results: KpiResultsService) {}

  @OnEvent('payment.received')
  async onReceived(payload: PaymentReceivedPayload): Promise<void> {
    try {
      await this.results.recordForPayment(payload.paymentId);
    } catch (e) {
      this.logger.warn(`KPI of payment ${payload.paymentId} not recorded: ${describeError(e)}`);
    }
  }

  @OnEvent('payment.reversed')
  async onReversed(payload: PaymentReversedPayload): Promise<void> {
    try {
      await this.results.cancelForPayment(payload.paymentId, {
        correction: payload.correction === true,
      });
    } catch (e) {
      this.logger.warn(`KPI of payment ${payload.paymentId} not cancelled: ${describeError(e)}`);
    }
  }
}
```

- [ ] **Step 4: Modul**

`server/src/kpi/kpi.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { KpiRecorderListener } from './kpi-recorder.listener';
import { KpiResultsService } from './kpi-results.service';
import { KpiSettingsService } from './kpi-settings.service';

/** Admin KPI results (ADR-0095). Stage 2: recorded and shown, no money. */
@Module({
  imports: [SettingsModule],
  providers: [KpiSettingsService, KpiResultsService, KpiRecorderListener],
})
export class KpiModule {}
```

`server/src/app.module.ts`: import `import { KpiModule } from './kpi/kpi.module';` va `imports` ro'yxatida `PaymentPromisesModule,` dan keyin `KpiModule,`.

- [ ] **Step 5: Testlar**

Run: `cd server && npx jest src/kpi src/common/event-wiring.spec.ts`
Expected: PASS.

Run: `cd server && npm run typecheck`
Expected: xatosiz.

- [ ] **Step 6: Format, lint, commit**

```bash
cd server
npx prettier --write src/kpi src/app.module.ts
npx eslint src/kpi src/app.module.ts --quiet
cd ..
git add server/src/kpi server/src/app.module.ts
git commit -m "feat(kpi): cancel on reversal, move on correction, record on payment events (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: «Diqqat» signallari va oy oxiri taxmini (`kpiSignals`)

**Files:**
- Create: `server/src/kpi/kpi-signals.ts`
- Test: `server/src/kpi/kpi-signals.spec.ts`

**Interfaces:**
- Produces:
  - `interface KpiSignalInput { userId: number; name: string; results: number; compareResults: number; held: number; hasRecentResult: boolean; expired: number; compareExpired: number; promiseKept: number; promiseClosed: number; leadsReceived: number; leadsPaid: number }`
  - `type KpiSignalKind = 'DROP' | 'SILENT' | 'EXPIRED' | 'PROMISE_LOW' | 'SURGE' | 'BEST_CONVERSION'`
  - `interface KpiSignal { kind: KpiSignalKind; userId: number; tone: 'bad' | 'good'; text: string; weight: number }`
  - `kpiSignals(users: readonly KpiSignalInput[], opts: { isCurrentMonth: boolean }): KpiSignal[]` (eng ko'pi 5, og'irligi bo'yicha)
  - `workingDaysOfMonth(month: string, isHoliday: (day: string) => boolean): string[]`
  - `monthEndForecast(results: number, workingDays: readonly string[], today: string): number | null`

- [ ] **Step 1: Yiqiladigan test**

`server/src/kpi/kpi-signals.spec.ts`:

```ts
import {
  kpiSignals,
  monthEndForecast,
  workingDaysOfMonth,
  type KpiSignalInput,
} from './kpi-signals';

const base: KpiSignalInput = {
  userId: 11,
  name: 'Nodira R',
  results: 0,
  compareResults: 0,
  held: 0,
  hasRecentResult: false,
  expired: 0,
  compareExpired: 0,
  promiseKept: 0,
  promiseClosed: 0,
  leadsReceived: 0,
  leadsPaid: 0,
};
const u = (patch: Partial<KpiSignalInput>): KpiSignalInput => ({ ...base, ...patch });
const past = { isCurrentMonth: false };
const now = { isCurrentMonth: true };

describe('kpiSignals (spec §7.9)', () => {
  it('1. a drop of 30% or more, when one of the months has at least 3 results', () => {
    expect(kpiSignals([u({ results: 7, compareResults: 10 })], past)).toEqual([
      expect.objectContaining({
        kind: 'DROP',
        tone: 'bad',
        userId: 11,
        text: 'Nodira R: natijalar keskin kamaydi — 10 → 7 (-30%)',
      }),
    ]);
  });

  it('1. a rise, from zero too', () => {
    expect(kpiSignals([u({ results: 4, compareResults: 3 })], past)[0]).toEqual(
      expect.objectContaining({
        kind: 'SURGE',
        tone: 'good',
        text: 'Nodira R: natijalar keskin oshdi — 3 → 4 (+33%)',
      }),
    );
    expect(kpiSignals([u({ results: 3, compareResults: 0 })], past)[0].text).toBe(
      'Nodira R: natijalar keskin oshdi — 0 → 3',
    );
  });

  it('1. quiet under 30%, or under 3 results in both months', () => {
    expect(kpiSignals([u({ results: 8, compareResults: 10 })], past)).toEqual([]);
    expect(kpiSignals([u({ results: 1, compareResults: 2 })], past)).toEqual([]);
  });

  it('2. silent: 3 held leads and no result in 7 days, current month only', () => {
    const silent = u({ held: 3 });
    expect(kpiSignals([silent], now)).toEqual([
      expect.objectContaining({
        kind: 'SILENT',
        text: "Nodira R: 3 ta band lid bor, oxirgi 7 kunda natija yo'q",
      }),
    ]);
    expect(kpiSignals([silent], past)).toEqual([]);
    expect(kpiSignals([u({ held: 3, hasRecentResult: true })], now)).toEqual([]);
    expect(kpiSignals([u({ held: 2 })], now)).toEqual([]);
  });

  it('3. many returned: 3 or more and more than the compare month', () => {
    expect(kpiSignals([u({ expired: 3, compareExpired: 1 })], past)[0].text).toBe(
      "Nodira R: 3 ta lid muddat o'tib qaytdi (taqqoslanayotgan oyda 1 ta)",
    );
    expect(kpiSignals([u({ expired: 3, compareExpired: 3 })], past)).toEqual([]);
    expect(kpiSignals([u({ expired: 2 })], past)).toEqual([]);
  });

  it('4. promises under 30% of at least 5 closed', () => {
    expect(kpiSignals([u({ promiseKept: 1, promiseClosed: 5 })], past)[0].text).toBe(
      "Nodira R: va'da bajarilishi 20% (1 / 5)",
    );
    expect(kpiSignals([u({ promiseKept: 1, promiseClosed: 4 })], past)).toEqual([]);
    expect(kpiSignals([u({ promiseKept: 2, promiseClosed: 6 })], past)).toEqual([]);
  });

  it('5. the best lead → payment share among those with 5 leads, as good news', () => {
    const out = kpiSignals(
      [
        u({ userId: 11, leadsReceived: 5, leadsPaid: 2 }),
        u({ userId: 12, name: 'Farangiz N', leadsReceived: 6, leadsPaid: 3 }),
        u({ userId: 13, name: 'Bobur K', leadsReceived: 4, leadsPaid: 4 }),
      ],
      past,
    );
    expect(out).toEqual([
      expect.objectContaining({
        kind: 'BEST_CONVERSION',
        userId: 12,
        tone: 'good',
        text: "Farangiz N: eng yuqori «Lid → to'lov» — 50% (3 / 6)",
      }),
    ]);
    expect(kpiSignals([u({ leadsReceived: 5, leadsPaid: 0 })], past)).toEqual([]);
  });

  it('keeps the 5 heaviest, the bad ones first', () => {
    const users = [
      u({ userId: 1, name: 'A', results: 6, compareResults: 3 }),
      u({ userId: 2, name: 'B', results: 1, compareResults: 6 }),
      u({ userId: 3, name: 'C', held: 4 }),
      u({ userId: 4, name: 'D', expired: 5 }),
      u({ userId: 5, name: 'E', promiseClosed: 6 }),
      u({ userId: 6, name: 'F', leadsReceived: 5, leadsPaid: 5 }),
    ];
    expect(kpiSignals(users, now).map((s) => s.kind)).toEqual([
      'DROP',
      'SILENT',
      'EXPIRED',
      'PROMISE_LOW',
      'SURGE',
    ]);
  });
});

describe('workingDaysOfMonth', () => {
  it('counts Monday to Saturday and leaves company holidays out', () => {
    expect(workingDaysOfMonth('2026-10', () => false)).toHaveLength(27);
    const days = workingDaysOfMonth('2026-10', (d) => d === '2026-10-01');
    expect(days).toHaveLength(26);
    expect(days[0]).toBe('2026-10-02');
    expect(days).not.toContain('2026-10-04');
  });
});

describe('monthEndForecast', () => {
  const days = workingDaysOfMonth('2026-10', () => false);

  it('waits for the third working day', () => {
    expect(monthEndForecast(4, days, '2026-10-02')).toBeNull();
    expect(monthEndForecast(4, days, '2026-10-03')).toBe(36);
  });

  it('divides by the working days passed, today included', () => {
    // 12 working days by 14.10 (Sundays 4 and 11 left out): round(10 / 12 × 27).
    expect(monthEndForecast(10, days, '2026-10-14')).toBe(23);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/kpi/kpi-signals.spec.ts`
Expected: FAIL — `Cannot find module './kpi-signals'`.

- [ ] **Step 3: Funksiyalarni yozish**

`server/src/kpi/kpi-signals.ts`:

```ts
import { addDaysToDateStr, dayOfWeekForDateStr } from '../common/date/tashkent';

/** One administrator's month as the «Diqqat» rules read it (spec §7.9). */
export interface KpiSignalInput {
  userId: number;
  name: string;
  /** ACTIVE results of the month, both types. */
  results: number;
  /** Of the compare month — in the current month, up to the same day. */
  compareResults: number;
  /** Leads held now. */
  held: number;
  /** An ACTIVE result in the last 7 days. */
  hasRecentResult: boolean;
  expired: number;
  compareExpired: number;
  promiseKept: number;
  /** KEPT + BROKEN; an OPEN promise does not count. */
  promiseClosed: number;
  leadsReceived: number;
  leadsPaid: number;
}

export type KpiSignalKind =
  | 'DROP'
  | 'SILENT'
  | 'EXPIRED'
  | 'PROMISE_LOW'
  | 'SURGE'
  | 'BEST_CONVERSION';

export interface KpiSignal {
  kind: KpiSignalKind;
  userId: number;
  tone: 'bad' | 'good';
  /** The sentence the page prints, its numbers included. */
  text: string;
  /** The bad kinds first (each kind its own hundred), then by size. */
  weight: number;
}

const MAX_SIGNALS = 5;
const TIER: Record<KpiSignalKind, number> = {
  DROP: 500,
  SILENT: 400,
  EXPIRED: 300,
  PROMISE_LOW: 200,
  SURGE: 100,
  BEST_CONVERSION: 0,
};
const share = (part: number, whole: number) => Math.round((part * 100) / whole);
const capped = (n: number) => Math.min(Math.max(n, 0), 99);

/** The «Diqqat» block (spec §7.9): five rules, every signal with its numbers, at most five. */
export function kpiSignals(
  users: readonly KpiSignalInput[],
  opts: { isCurrentMonth: boolean },
): KpiSignal[] {
  const out: KpiSignal[] = [];
  const push = (kind: KpiSignalKind, u: KpiSignalInput, text: string, size: number) => {
    out.push({
      kind,
      userId: u.userId,
      tone: kind === 'SURGE' || kind === 'BEST_CONVERSION' ? 'good' : 'bad',
      text: `${u.name}: ${text}`,
      weight: TIER[kind] + capped(size),
    });
  };

  for (const u of users) {
    // 1. ±30% against the compare month, at least 3 results in one of them.
    if (u.results !== u.compareResults && Math.max(u.results, u.compareResults) >= 3) {
      const change =
        u.compareResults === 0 ? null : share(u.results - u.compareResults, u.compareResults);
      if (change === null || Math.abs(change) >= 30) {
        const up = u.results > u.compareResults;
        const tail = change === null ? '' : ` (${up ? '+' : '-'}${Math.abs(change)}%)`;
        push(
          up ? 'SURGE' : 'DROP',
          u,
          `natijalar keskin ${up ? 'oshdi' : 'kamaydi'} — ${u.compareResults} → ${u.results}${tail}`,
          change === null ? 99 : Math.abs(change),
        );
      }
    }
    // 2. Silent: 3 held leads or more, no result in 7 days (current month only).
    if (opts.isCurrentMonth && u.held >= 3 && !u.hasRecentResult) {
      push('SILENT', u, `${u.held} ta band lid bor, oxirgi 7 kunda natija yo'q`, u.held);
    }
    // 3. Many returned: 3 or more, and more than in the compare month.
    if (u.expired >= 3 && u.expired > u.compareExpired) {
      push(
        'EXPIRED',
        u,
        `${u.expired} ta lid muddat o'tib qaytdi (taqqoslanayotgan oyda ${u.compareExpired} ta)`,
        u.expired,
      );
    }
    // 4. Promises: under 30% of at least 5 closed.
    if (u.promiseClosed >= 5) {
      const rate = share(u.promiseKept, u.promiseClosed);
      if (rate < 30) {
        push('PROMISE_LOW', u, `va'da bajarilishi ${rate}% (${u.promiseKept} / ${u.promiseClosed})`, 30 - rate);
      }
    }
  }

  // 5. The best lead → payment share among those with 5 leads or more.
  const best = users
    .filter((u) => u.leadsReceived >= 5 && u.leadsPaid > 0)
    .sort(
      (a, b) =>
        b.leadsPaid / b.leadsReceived - a.leadsPaid / a.leadsReceived ||
        b.leadsReceived - a.leadsReceived,
    )[0];
  if (best) {
    const rate = share(best.leadsPaid, best.leadsReceived);
    push('BEST_CONVERSION', best, `eng yuqori «Lid → to'lov» — ${rate}% (${best.leadsPaid} / ${best.leadsReceived})`, rate);
  }

  return out
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text))
    .slice(0, MAX_SIGNALS);
}

/** The month's Monday–Saturday days that are not a holiday ('YYYY-MM-DD'). */
export function workingDaysOfMonth(
  month: string,
  isHoliday: (day: string) => boolean,
): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDaysToDateStr(d, 1)) {
    if (dayOfWeekForDateStr(d) !== 0 && !isHoliday(d)) out.push(d);
  }
  return out;
}

/**
 * «Oy oxiriga taxmin» (spec §7.9): the month's results so far ÷ the working
 * days passed (today included) × the month's working days, rounded. Shown
 * only from the month's 3rd working day.
 */
export function monthEndForecast(
  results: number,
  workingDays: readonly string[],
  today: string,
): number | null {
  const passed = workingDays.filter((d) => d <= today).length;
  if (passed < 3) return null;
  return Math.round((results / passed) * workingDays.length);
}
```

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/kpi/kpi-signals.spec.ts`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server
npx prettier --write src/kpi/kpi-signals.ts src/kpi/kpi-signals.spec.ts
npx eslint src/kpi/kpi-signals.ts --quiet
cd ..
git add server/src/kpi
git commit -m "feat(kpi): the «Diqqat» rules and the month-end forecast (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Sahifa raqamlari — sof yig'ish (`assembleOverview`)

**Files:**
- Create: `server/src/kpi/kpi-overview.math.ts`
- Test: `server/src/kpi/kpi-overview.math.spec.ts`

**Interfaces:**
- Consumes: `kpiSignals`, `monthEndForecast`, `KpiSignal` (Task 8), `KPI_FIRST_MONTH` (Task 2).
- Produces:
  - `interface ResultFact { userId: number; type: KpiResultType; status: KpiResultStatus; amount: number; occurredAt: Date; month: string }`
  - `interface LogFact { userId: number; leadId: string; at: Date }`
  - `interface PromiseFact { userId: number; status: 'KEPT' | 'BROKEN' }`
  - `interface OverviewFacts { month; compare; today: string | null; monthResults: ResultFact[]; compareResults: ResultFact[]; series: ResultFact[]; recentUserIds: ReadonlySet<number>; held: ReadonlyMap<number, number>; received: LogFact[]; compareReceived: LogFact[]; paidLeads: { userId: number; leadId: string }[]; expired: LogFact[]; compareExpired: LogFact[]; promises: PromiseFact[]; names: ReadonlyMap<number, string>; eligibleHolders: ReadonlySet<number>; workingDays: readonly string[] | null }`
  - `interface KpiAdminRow { userId: number; name: string; leadPaid: { count: number; amount: number; compare: number }; promiseKept: { count: number; amount: number; compare: number }; leadToPaid: { paid: number; received: number; pct: number | null }; promiseRate: { kept: number; closed: number; pct: number | null }; expired: { count: number; compare: number }; held: number; total: number }`
  - `interface OverviewBody { cards: { results: KpiPair; amount: KpiPair; leadToPaid: { value: number | null; compare: number | null }; forecast: number | null }; signals: KpiSignal[]; daily: { day: number; current: number | null; compare: number | null }[]; months: { month: string; leadPaid: number; promiseKept: number; amount: number }[]; rows: KpiAdminRow[] }`, `KpiPair = { value: number; compare: number }`
  - `assembleOverview(f: OverviewFacts): OverviewBody`, `monthsFrom(month: string): string[]`

- [ ] **Step 1: Yiqiladigan test**

`server/src/kpi/kpi-overview.math.spec.ts`:

```ts
import {
  assembleOverview,
  monthsFrom,
  type LogFact,
  type OverviewFacts,
  type ResultFact,
} from './kpi-overview.math';
import { workingDaysOfMonth } from './kpi-signals';

const at = (day: string, hhmm = '10:00') => new Date(`${day}T${hhmm}:00+05:00`);
const r = (
  userId: number,
  type: 'LEAD_PAID' | 'PROMISE_KEPT',
  amount: number,
  day: string,
  status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE',
): ResultFact => ({ userId, type, status, amount, occurredAt: at(day), month: day.slice(0, 7) });
const log = (userId: number, leadId: string, day: string): LogFact => ({ userId, leadId, at: at(day) });

function facts(over: Partial<OverviewFacts> = {}): OverviewFacts {
  return {
    month: '2026-10',
    compare: '2026-09',
    today: '2026-10-14',
    monthResults: [
      r(11, 'LEAD_PAID', 50_000, '2026-10-02'),
      r(11, 'PROMISE_KEPT', 20_000, '2026-10-10'),
      r(11, 'LEAD_PAID', 50_000, '2026-10-05', 'CANCELLED'),
      r(12, 'LEAD_PAID', 30_000, '2026-10-14'),
    ],
    compareResults: [
      r(11, 'LEAD_PAID', 50_000, '2026-09-03'),
      r(11, 'LEAD_PAID', 50_000, '2026-09-20'),
      r(12, 'PROMISE_KEPT', 20_000, '2026-09-14'),
    ],
    series: [
      r(11, 'LEAD_PAID', 50_000, '2026-10-02'),
      r(11, 'PROMISE_KEPT', 20_000, '2026-10-10'),
      r(12, 'LEAD_PAID', 30_000, '2026-10-14'),
    ],
    recentUserIds: new Set([12]),
    held: new Map([
      [11, 4],
      [13, 3],
      [14, 2],
    ]),
    received: [
      log(11, 'L1', '2026-10-01'),
      log(11, 'L2', '2026-10-03'),
      log(11, 'L2', '2026-10-09'),
      log(12, 'L3', '2026-10-04'),
    ],
    compareReceived: [log(11, 'L9', '2026-09-02'), log(11, 'L8', '2026-09-25')],
    paidLeads: [
      { userId: 11, leadId: 'L1' },
      { userId: 11, leadId: 'L8' },
    ],
    expired: [log(13, 'E1', '2026-10-01'), log(13, 'E2', '2026-10-02'), log(13, 'E3', '2026-10-03')],
    compareExpired: [log(13, 'E9', '2026-09-01'), log(13, 'E8', '2026-09-28')],
    promises: [
      { userId: 11, status: 'KEPT' },
      { userId: 11, status: 'BROKEN' },
    ],
    names: new Map([
      [11, 'Nodira R'],
      [12, 'Farangiz N'],
      [13, 'Bobur K'],
      [14, 'Dilnoza S'],
    ]),
    eligibleHolders: new Set([11, 13]),
    workingDays: workingDaysOfMonth('2026-10', () => false),
    ...over,
  };
}

describe('assembleOverview — the current month', () => {
  it('compares the cards with the compare month up to the same day', () => {
    expect(assembleOverview(facts()).cards).toEqual({
      results: { value: 3, compare: 2 },
      amount: { value: 100_000, compare: 70_000 },
      leadToPaid: { value: 33, compare: 0 },
      forecast: 7,
    });
  });

  it('lists every person with a result and every administrator holding leads, richest first', () => {
    expect(assembleOverview(facts()).rows).toEqual([
      {
        userId: 11,
        name: 'Nodira R',
        leadPaid: { count: 1, amount: 50_000, compare: 1 },
        promiseKept: { count: 1, amount: 20_000, compare: 0 },
        leadToPaid: { paid: 1, received: 2, pct: 50 },
        promiseRate: { kept: 1, closed: 2, pct: 50 },
        expired: { count: 0, compare: 0 },
        held: 4,
        total: 70_000,
      },
      {
        userId: 12,
        name: 'Farangiz N',
        leadPaid: { count: 1, amount: 30_000, compare: 0 },
        promiseKept: { count: 0, amount: 0, compare: 1 },
        leadToPaid: { paid: 0, received: 1, pct: 0 },
        promiseRate: { kept: 0, closed: 0, pct: null },
        expired: { count: 0, compare: 0 },
        held: 0,
        total: 30_000,
      },
      {
        userId: 13,
        name: 'Bobur K',
        leadPaid: { count: 0, amount: 0, compare: 0 },
        promiseKept: { count: 0, amount: 0, compare: 0 },
        leadToPaid: { paid: 0, received: 0, pct: null },
        promiseRate: { kept: 0, closed: 0, pct: null },
        expired: { count: 3, compare: 1 },
        held: 3,
        total: 0,
      },
    ]);
  });

  it('draws the month up to today and the whole compare month, day by day', () => {
    const daily = assembleOverview(facts()).daily;
    expect(daily).toHaveLength(31);
    expect(daily[0]).toEqual({ day: 1, current: 0, compare: 0 });
    expect(daily[1]).toEqual({ day: 2, current: 1, compare: 0 });
    expect(daily[13]).toEqual({ day: 14, current: 3, compare: 2 });
    expect(daily[14]).toEqual({ day: 15, current: null, compare: 2 });
    expect(daily[29]).toEqual({ day: 30, current: null, compare: 3 });
    expect(daily[30]).toEqual({ day: 31, current: null, compare: null });
  });

  it('stacks the months from 2026-10', () => {
    expect(assembleOverview(facts()).months).toEqual([
      { month: '2026-10', leadPaid: 2, promiseKept: 1, amount: 100_000 },
    ]);
  });

  it('raises the signals of the rows', () => {
    expect(assembleOverview(facts()).signals.map((s) => [s.kind, s.userId])).toEqual([
      ['SILENT', 11],
      ['SILENT', 13],
      ['EXPIRED', 13],
    ]);
  });
});

describe('assembleOverview — a past month', () => {
  const pastFacts = facts({ today: null, workingDays: null });

  it('compares whole months and forecasts nothing', () => {
    const out = assembleOverview(pastFacts);
    expect(out.cards).toEqual({
      results: { value: 3, compare: 3 },
      amount: { value: 100_000, compare: 120_000 },
      leadToPaid: { value: 33, compare: 50 },
      forecast: null,
    });
    expect(out.daily[30]).toEqual({ day: 31, current: 3, compare: null });
    expect(out.signals.map((s) => [s.kind, s.userId])).toEqual([['EXPIRED', 13]]);
  });
});

describe('monthsFrom', () => {
  it('gives the last six months, none before 2026-10', () => {
    expect(monthsFrom('2026-10')).toEqual(['2026-10']);
    expect(monthsFrom('2027-03')).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ]);
    expect(monthsFrom('2027-05')).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
    ]);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/kpi/kpi-overview.math.spec.ts`
Expected: FAIL — `Cannot find module './kpi-overview.math'`.

- [ ] **Step 3: Yig'ishni yozish**

`server/src/kpi/kpi-overview.math.ts`:

```ts
import { KpiResultStatus, KpiResultType } from '@prisma/client';
import { addMonthsToMonthKey, tashkentDateStr } from '../common/date/tashkent';
import { KPI_FIRST_MONTH } from './kpi-rules';
import { kpiSignals, monthEndForecast, type KpiSignal } from './kpi-signals';

/**
 * «Xodimlar KPI» from rows already read (spec §7.7, §7.9). Pure: the read
 * service loads, this counts; the page only formats what comes back.
 */

export interface ResultFact {
  userId: number;
  type: KpiResultType;
  status: KpiResultStatus;
  amount: number;
  occurredAt: Date;
  month: string;
}

/** An ownership log row: CLAIM/ASSIGN for its `toUserId`, EXPIRE for its `fromUserId`. */
export interface LogFact {
  userId: number;
  leadId: string;
  at: Date;
}

export interface PromiseFact {
  userId: number;
  status: 'KEPT' | 'BROKEN';
}

export interface OverviewFacts {
  month: string;
  compare: string;
  /** Today ('YYYY-MM-DD', Tashkent) when `month` is the current month, else null. */
  today: string | null;
  /** The month's results, every status. */
  monthResults: ResultFact[];
  /** The compare month's ACTIVE results. */
  compareResults: ResultFact[];
  /** ACTIVE results of `monthsFrom(month)`. */
  series: ResultFact[];
  /** Users with an ACTIVE result in the last 7 days. */
  recentUserIds: ReadonlySet<number>;
  /** Leads held now, per owner. */
  held: ReadonlyMap<number, number>;
  received: LogFact[];
  compareReceived: LogFact[];
  /** ACTIVE LEAD_PAID results of the received leads, any month. */
  paidLeads: { userId: number; leadId: string }[];
  expired: LogFact[];
  compareExpired: LogFact[];
  /** Promises written in scope whose day falls in the month, KEPT or BROKEN. */
  promises: PromiseFact[];
  names: ReadonlyMap<number, string>;
  /** Lead holders who are administrators now: only they join the table without a result. */
  eligibleHolders: ReadonlySet<number>;
  /** The month's working days (current month only), for the forecast. */
  workingDays: readonly string[] | null;
}

export interface KpiPair {
  value: number;
  compare: number;
}

export interface KpiAdminRow {
  userId: number;
  name: string;
  leadPaid: { count: number; amount: number; compare: number };
  promiseKept: { count: number; amount: number; compare: number };
  leadToPaid: { paid: number; received: number; pct: number | null };
  promiseRate: { kept: number; closed: number; pct: number | null };
  expired: { count: number; compare: number };
  held: number;
  total: number;
}

export interface OverviewBody {
  cards: {
    results: KpiPair;
    amount: KpiPair;
    leadToPaid: { value: number | null; compare: number | null };
    forecast: number | null;
  };
  signals: KpiSignal[];
  daily: { day: number; current: number | null; compare: number | null }[];
  months: { month: string; leadPaid: number; promiseKept: number; amount: number }[];
  rows: KpiAdminRow[];
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part * 100) / whole) : null;
const sum = (list: readonly ResultFact[]) => list.reduce((s, r) => s + r.amount, 0);
const dayOf = (d: Date) => Number(tashkentDateStr(d).slice(8, 10));
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const pairKey = (l: { userId: number; leadId: string }) => `${l.userId}:${l.leadId}`;

/** «Oylar bo'yicha»: the last six months up to `month`, none before 2026-10. */
export function monthsFrom(month: string): string[] {
  const out: string[] = [];
  for (let k = addMonthsToMonthKey(month, -5); k <= month; k = addMonthsToMonthKey(k, 1)) {
    if (k >= KPI_FIRST_MONTH) out.push(k);
  }
  return out;
}

export function assembleOverview(f: OverviewFacts): OverviewBody {
  const todayDay = f.today === null ? null : Number(f.today.slice(8, 10));
  // In the current month every comparison stops at the same day of the
  // compare month (spec §7.9/1); the chart still draws the whole compare month.
  const inCut = (d: Date) => todayDay === null || dayOf(d) <= todayDay;
  const active = f.monthResults.filter((r) => r.status === KpiResultStatus.ACTIVE);
  const compare = f.compareResults.filter((r) => inCut(r.occurredAt));
  const compareExpired = f.compareExpired.filter((l) => inCut(l.at));
  const monthPairs = new Set(f.received.map(pairKey));
  const comparePairs = new Set(f.compareReceived.filter((l) => inCut(l.at)).map(pairKey));
  const paid = new Set(f.paidLeads.map(pairKey));
  const paidOf = (pairs: Set<string>) => [...pairs].filter((p) => paid.has(p)).length;

  const ids = new Set(f.monthResults.map((r) => r.userId));
  for (const userId of f.held.keys()) {
    if (f.eligibleHolders.has(userId)) ids.add(userId);
  }

  const rows = [...ids]
    .map((userId): KpiAdminRow => {
      const of = <T extends { userId: number }>(list: readonly T[]) =>
        list.filter((x) => x.userId === userId);
      const typed = (list: readonly ResultFact[], type: KpiResultType) =>
        of(list).filter((r) => r.type === type);
      const lp = typed(active, KpiResultType.LEAD_PAID);
      const pk = typed(active, KpiResultType.PROMISE_KEPT);
      const received = [...monthPairs].filter((p) => p.startsWith(`${userId}:`));
      const paidCount = received.filter((p) => paid.has(p)).length;
      const promises = of(f.promises);
      const kept = promises.filter((p) => p.status === 'KEPT').length;
      return {
        userId,
        name: f.names.get(userId) ?? `#${userId}`,
        leadPaid: {
          count: lp.length,
          amount: sum(lp),
          compare: typed(compare, KpiResultType.LEAD_PAID).length,
        },
        promiseKept: {
          count: pk.length,
          amount: sum(pk),
          compare: typed(compare, KpiResultType.PROMISE_KEPT).length,
        },
        leadToPaid: { paid: paidCount, received: received.length, pct: pct(paidCount, received.length) },
        promiseRate: { kept, closed: promises.length, pct: pct(kept, promises.length) },
        expired: { count: of(f.expired).length, compare: of(compareExpired).length },
        held: f.held.get(userId) ?? 0,
        total: sum(lp) + sum(pk),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const signals = kpiSignals(
    rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      results: r.leadPaid.count + r.promiseKept.count,
      compareResults: r.leadPaid.compare + r.promiseKept.compare,
      held: r.held,
      hasRecentResult: f.recentUserIds.has(r.userId),
      expired: r.expired.count,
      compareExpired: r.expired.compare,
      promiseKept: r.promiseRate.kept,
      promiseClosed: r.promiseRate.closed,
      leadsReceived: r.leadToPaid.received,
      leadsPaid: r.leadToPaid.paid,
    })),
    { isCurrentMonth: f.today !== null },
  );

  const lenM = daysIn(f.month);
  const lenC = daysIn(f.compare);
  const lastM = todayDay ?? lenM;
  const perDay = (list: readonly ResultFact[]) => {
    const counts = new Array<number>(32).fill(0);
    for (const r of list) counts[dayOf(r.occurredAt)] += 1;
    return counts;
  };
  const mDays = perDay(active);
  const cDays = perDay(f.compareResults);
  const daily: OverviewBody['daily'] = [];
  let mRun = 0;
  let cRun = 0;
  for (let day = 1; day <= Math.max(lenM, lenC); day++) {
    mRun += mDays[day];
    cRun += cDays[day];
    daily.push({
      day,
      current: day <= lastM && day <= lenM ? mRun : null,
      compare: day <= lenC ? cRun : null,
    });
  }

  const months = monthsFrom(f.month).map((month) => {
    const list = f.series.filter((r) => r.month === month);
    return {
      month,
      leadPaid: list.filter((r) => r.type === KpiResultType.LEAD_PAID).length,
      promiseKept: list.filter((r) => r.type === KpiResultType.PROMISE_KEPT).length,
      amount: sum(list),
    };
  });

  return {
    cards: {
      results: { value: active.length, compare: compare.length },
      amount: { value: sum(active), compare: sum(compare) },
      leadToPaid: {
        value: pct(paidOf(monthPairs), monthPairs.size),
        compare: pct(paidOf(comparePairs), comparePairs.size),
      },
      forecast:
        f.today && f.workingDays ? monthEndForecast(active.length, f.workingDays, f.today) : null,
    },
    signals,
    daily,
    months,
    rows,
  };
}
```

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/kpi/kpi-overview.math.spec.ts`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server
npx prettier --write src/kpi/kpi-overview.math.ts src/kpi/kpi-overview.math.spec.ts
npx eslint src/kpi/kpi-overview.math.ts --quiet
cd ..
git add server/src/kpi
git commit -m "feat(kpi): the overview's cards, rows and series as a pure assembly (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `KpiReadService` — sahifa va xodim o'qilishi

**Files:**
- Modify: `server/src/leads/ownership/lead-ownership.service.ts` — `liveOwnedLeadWhere`, `ownershipLogBranchWhere`, `fullName` eksport qilinadi (`untouchedWhere` yonida), `summary` ularni ishlatadi
- Modify: `server/src/leads/ownership/lead-ownership.service.spec.ts`
- Create: `server/src/kpi/kpi-read.service.ts`
- Test: `server/src/kpi/kpi-read.service.spec.ts`

**Interfaces:**
- Consumes: `assembleOverview`, `monthsFrom`, `LogFact` (Task 9), `workingDaysOfMonth` (Task 8), `KpiSettingsService.read`, `explainKpi`, `isKpiEligible`, `KPI_FIRST_MONTH` (Task 2).
- Produces (`lead-ownership.service.ts`, ADR-0093 egalik filtrlarining yagona nusxasi):
  - `liveOwnedLeadWhere(companyId: number, scope: ReportBranchIds): Prisma.LeadWhereInput` — hozir egasi bor, o'chirilmagan, aylanmagan lid, filialda yoki filialsiz.
  - `ownershipLogBranchWhere(scope: ReportBranchIds): Prisma.LeadOwnershipLogWhereInput` — filial yoki filialsiz yozuv; CEO uchun `{}`.
  - `fullName(u: { firstName: string; lastName: string }): string` — «Ism Familiya» (mavjud xususiy yordamchi eksport qilinadi; `contract-documents/contract-fields.ts` dagi `personName` familiyani oldin yozadi — mos emas).
- Produces (`kpi-read.service.ts`):
  - `interface KpiOverview extends OverviewBody { month: string; compare: string; status: { enabled: boolean; changedAt: Date | null } }`
  - `interface KpiResultView { id: string; type: KpiResultType; occurredAt: Date; studentId: number; studentName: string; paymentAmount: number; amount: number; explanation: string; status: KpiResultStatus; cancelledAt: Date | null; cancelReason: string | null }`
  - `interface KpiUserView { user: { id: number; name: string }; month: string; hasAny: boolean; total: number; compareTotal: number; months: { month: string; count: number; amount: number }[]; results: KpiResultView[] }`
  - `KpiReadService.overview(companyId: number, scope: ReportBranchIds, q: { month?: string; compare?: string }, now?: Date): Promise<KpiOverview>`
  - `KpiReadService.user(companyId: number, scope: ReportBranchIds, userId: number, q: { month?: string }, now?: Date): Promise<KpiUserView>`
  - `kpiMonth(raw: string | undefined, current: string): string` — `parseReportMonth` (`reports/group-payments/group-payments.math.ts`) qayta ishlatilmaydi: uning pastki chegarasi 2026-09 va xabari «Bu hisobot sentabr 2026 dan boshlanadi» o'sha hisobotga bog'langan; KPI 2026-10 dan.

- [ ] **Step 1: Yiqiladigan testlar**

`server/src/leads/ownership/lead-ownership.service.spec.ts`: importga `liveOwnedLeadWhere, ownershipLogBranchWhere` (`./lead-ownership.service` dan), fayl oxiriga:

```ts
describe('ownership filters shared with the KPI page (ADR-0095)', () => {
  it('a live owned lead: not deleted, not converted, in the branch or branch-less', () => {
    expect(liveOwnedLeadWhere(1001, [2])).toEqual({
      companyId: 1001,
      deletedAt: null,
      ownerId: { not: null },
      statusEnum: { not: LeadStatus.CONVERTED },
      AND: [{ OR: [{ branchId: { in: [2] } }, { branchId: null }] }],
    });
    expect(liveOwnedLeadWhere(1001, null).AND).toEqual([{}]);
  });

  it('a log row: in the branch or branch-less; everything for the CEO', () => {
    expect(ownershipLogBranchWhere([2])).toEqual({
      OR: [{ branchId: { in: [2] } }, { branchId: null }],
    });
    expect(ownershipLogBranchWhere(null)).toEqual({});
  });

  it('summary reads through the same filters', async () => {
    const s = setup();
    Object.assign(s.prisma, {
      lead: { groupBy: jest.fn().mockResolvedValue([]) },
      leadOwnershipLog: { groupBy: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await s.service.summary(1, [1], 'month');
    const leadGroupBy = (s.prisma as unknown as { lead: { groupBy: jest.Mock } }).lead.groupBy;
    const logGroupBy = (s.prisma as unknown as { leadOwnershipLog: { groupBy: jest.Mock } })
      .leadOwnershipLog.groupBy;
    expect(leadGroupBy.mock.calls[0][0].where).toEqual(liveOwnedLeadWhere(1, [1]));
    expect(logGroupBy.mock.calls[0][0].where).toEqual(
      expect.objectContaining(ownershipLogBranchWhere([1])),
    );
  });
});
```

`server/src/kpi/kpi-read.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { KpiReadService } from './kpi-read.service';

const NOW = new Date('2026-10-14T12:00:00+05:00');
const SETTINGS = {
  enabled: true,
  changedAt: null,
  leadPaid: { mode: 'FIXED', value: 50_000 },
  promiseKept: { mode: 'FIXED', value: 20_000 },
};

function setup() {
  const prisma = {
    kpiResult: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    lead: { groupBy: jest.fn().mockResolvedValue([]) },
    leadOwnershipLog: { findMany: jest.fn().mockResolvedValue([]) },
    paymentPromise: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 11, firstName: 'Nodira', lastName: 'R' }),
      count: jest.fn().mockResolvedValue(1),
    },
    student: { findMany: jest.fn().mockResolvedValue([]) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const kpiSettings = { read: jest.fn().mockResolvedValue(SETTINGS) };
  return { prisma, service: new KpiReadService(prisma as never, kpiSettings as never) };
}

describe('KpiReadService.overview', () => {
  it('refuses an empty branch scope', async () => {
    await expect(setup().service.overview(1001, [], {}, NOW)).rejects.toThrow(ForbiddenException);
  });

  it('refuses a month before October 2026 and a future one', async () => {
    const s = setup();
    await expect(s.service.overview(1001, null, { month: '2026-09' }, NOW)).rejects.toThrow(BadRequestException);
    await expect(s.service.overview(1001, null, { month: '2026-11' }, NOW)).rejects.toThrow(BadRequestException);
    await expect(s.service.overview(1001, null, { compare: '2026-11' }, NOW)).rejects.toThrow(BadRequestException);
  });

  it('reads the month and the one before by default, inside the branch', async () => {
    const s = setup();
    const out = await s.service.overview(1001, [2], {}, NOW);

    expect(out.month).toBe('2026-10');
    expect(out.compare).toBe('2026-09');
    expect(out.status).toEqual({ enabled: true, changedAt: null });
    expect(out.rows).toEqual([]);
    expect(out.cards.forecast).toBe(0);
    expect(s.prisma.kpiResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 1001, month: '2026-10', branchId: { in: [2] } } }),
    );
    expect(s.prisma.leadOwnershipLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ branchId: { in: [2] } }, { branchId: null }] }),
      }),
    );
  });
});

describe('KpiReadService.user', () => {
  it('answers 404 for someone outside the branch with no result in it', async () => {
    const s = setup();
    s.prisma.user.count.mockResolvedValue(0);
    s.prisma.kpiResult.count.mockResolvedValue(0);
    await expect(s.service.user(1001, [2], 11, {}, NOW)).rejects.toThrow(NotFoundException);
  });

  it("lists the month's results with how each was counted, the cancelled ones too", async () => {
    const s = setup();
    s.prisma.kpiResult.count.mockResolvedValue(2);
    s.prisma.kpiResult.findMany
      .mockResolvedValueOnce([
        {
          id: 'r1', type: 'LEAD_PAID', occurredAt: new Date('2026-10-05T05:00:00Z'), studentId: 10500,
          paymentAmount: 600_000, amount: 30_000, ruleMode: 'PERCENT', ruleValue: 5, baseAmount: 600_000,
          status: 'ACTIVE', cancelledAt: null, cancelReason: null,
        },
        {
          id: 'r2', type: 'PROMISE_KEPT', occurredAt: new Date('2026-10-03T05:00:00Z'), studentId: 10501,
          paymentAmount: 400_000, amount: 20_000, ruleMode: 'FIXED', ruleValue: 20_000, baseAmount: 400_000,
          status: 'CANCELLED', cancelledAt: new Date('2026-10-04T05:00:00Z'), cancelReason: "To'lov bekor qilindi",
        },
      ])
      .mockResolvedValueOnce([{ month: '2026-10', amount: 30_000 }]);
    s.prisma.student.findMany.mockResolvedValue([
      { id: 10500, firstName: 'Ali', lastName: 'Valiyev' },
      { id: 10501, firstName: 'Vali', lastName: 'Aliyev' },
    ]);

    const out = await s.service.user(1001, null, 11, {}, NOW);

    expect(out.user).toEqual({ id: 11, name: 'Nodira R' });
    expect(out.hasAny).toBe(true);
    expect(out.total).toBe(30_000);
    expect(out.compareTotal).toBe(0);
    expect(out.months).toEqual([{ month: '2026-10', count: 1, amount: 30_000 }]);
    expect(out.results.map((r) => [r.studentName, r.explanation, r.status, r.cancelReason])).toEqual([
      ['Ali Valiyev', "birinchi to'lov 600 000 × 5%", 'ACTIVE', null],
      ['Vali Aliyev', "qat'iy summa", 'CANCELLED', "To'lov bekor qilindi"],
    ]);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/kpi/kpi-read.service.spec.ts src/leads/ownership/lead-ownership.service.spec.ts`
Expected: FAIL — `Cannot find module './kpi-read.service'`; `liveOwnedLeadWhere` eksport qilinmagan.

- [ ] **Step 3: Egalik filtrlari — bitta nusxa**

`server/src/leads/ownership/lead-ownership.service.ts`:
1. `untouchedWhere` dan keyin:

```ts
/**
 * A lead held now: owned, not archived, not converted, in the scope or with
 * no branch (a branch-less lead is everyone's, as on the board). Shared by
 * `summary` and the KPI page (ADR-0095), so «band lid» means one thing.
 */
export function liveOwnedLeadWhere(
  companyId: number,
  scope: ReportBranchIds,
): Prisma.LeadWhereInput {
  return {
    companyId,
    deletedAt: null,
    ownerId: { not: null },
    statusEnum: { not: LeadStatus.CONVERTED },
    AND: [leadBranchWhere(scope)],
  };
}

/** An ownership log row in the scope, or with no branch; the CEO reads them all. */
export function ownershipLogBranchWhere(
  scope: ReportBranchIds,
): Prisma.LeadOwnershipLogWhereInput {
  return scope == null ? {} : { OR: [{ branchId: { in: scope } }, { branchId: null }] };
}
```

2. `const fullName = …` → `export const fullName = …` (o'zgarishsiz, «Ism Familiya»).
3. `summary` da `const live: Prisma.LeadWhereInput = { … };` va `const logBranch: … = …;` ni almashtiring:

```ts
    const live = liveOwnedLeadWhere(companyId, scope);
    const logBranch = ownershipLogBranchWhere(scope);
```

(`summary` ning qolgan qismi o'zgarmaydi; mavjud testlar o'tishi kerak.)

- [ ] **Step 4: Servisni yozish**

`server/src/kpi/kpi-read.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KpiResultStatus,
  KpiResultType,
  LeadOwnershipKind,
  PaymentPromiseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isBlockedStatus } from '../common/auth/blocked-user';
import {
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';
import {
  branchIdWhere,
  isEmptyScope,
  userBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { buildHolidayDateSetsByBranch } from '../holidays/holiday-date-set';
import {
  fullName,
  liveOwnedLeadWhere,
  ownershipLogBranchWhere,
} from '../leads/ownership/lead-ownership.service';
import { KpiSettingsService } from './kpi-settings.service';
import { KPI_FIRST_MONTH, explainKpi, isKpiEligible } from './kpi-rules';
import { workingDaysOfMonth } from './kpi-signals';
import {
  assembleOverview,
  monthsFrom,
  type LogFact,
  type OverviewBody,
} from './kpi-overview.math';

const DAY_MS = 86_400_000;
/** No branch has id 0: the company-wide holidays alone (as `LeadOwnershipService` reads them). */
const COMPANY_WIDE_HOLIDAYS = 0;
const NOT_FOUND = 'Xodim topilmadi';
const RESULT_FACT = {
  userId: true,
  type: true,
  status: true,
  amount: true,
  occurredAt: true,
  month: true,
} satisfies Prisma.KpiResultSelect;
const USER_FACT = {
  id: true,
  firstName: true,
  lastName: true,
  deletedAt: true,
  status: true,
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;
type UserFact = Prisma.UserGetPayload<{ select: typeof USER_FACT }>;
type PaidLead = { userId: number; leadId: string | null };
type MonthRange = { gte: Date; lt: Date };

export interface KpiOverview extends OverviewBody {
  month: string;
  compare: string;
  status: { enabled: boolean; changedAt: Date | null };
}

export interface KpiResultView {
  id: string;
  type: KpiResultType;
  occurredAt: Date;
  studentId: number;
  studentName: string;
  paymentAmount: number;
  amount: number;
  explanation: string;
  status: KpiResultStatus;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface KpiUserView {
  user: { id: number; name: string };
  month: string;
  hasAny: boolean;
  total: number;
  compareTotal: number;
  months: { month: string; count: number; amount: number }[];
  results: KpiResultView[];
}

/** `?month=` inside [2026-10, the current Tashkent month]; absent = the current one. */
export function kpiMonth(raw: string | undefined, current: string): string {
  const month = raw ?? current;
  if (month < KPI_FIRST_MONTH) {
    throw new BadRequestException('Xodimlar KPI oktabr 2026 dan boshlanadi');
  }
  if (month > current) throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  return month;
}

function assertScope(scope: ReportBranchIds): void {
  if (isEmptyScope(scope)) {
    throw new ForbiddenException("Bu filial ma'lumotlarini ko'rish huquqingiz yo'q");
  }
}

const sumAmount = (list: readonly { amount: number }[]) =>
  list.reduce((s, r) => s + r.amount, 0);

/**
 * The reads of «Xodimlar KPI» (spec §7.7, §7.8). CEO and Branch Director
 * (`kpi.view`); the header branch scope confines results, logs, promises and
 * held leads alike. Every figure comes from `assembleOverview`.
 */
@Injectable()
export class KpiReadService {
  constructor(
    private prisma: PrismaService,
    private kpiSettings: KpiSettingsService,
  ) {}

  async overview(
    companyId: number,
    scope: ReportBranchIds,
    q: { month?: string; compare?: string },
    now: Date = new Date(),
  ): Promise<KpiOverview> {
    assertScope(scope);
    const current = tashkentMonthKey(now);
    const month = kpiMonth(q.month, current);
    const compare = q.compare ?? addMonthsToMonthKey(month, -1);
    if (compare > current) throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
    const today = month === current ? tashkentDateStr(now) : null;
    const branch = branchIdWhere(scope);
    const range = tashkentMonthRangeUtc(month);
    const compareRange = tashkentMonthRangeUtc(compare);
    const active = KpiResultStatus.ACTIVE;
    const taken = [LeadOwnershipKind.CLAIM, LeadOwnershipKind.ASSIGN];
    const recent: Promise<{ userId: number }[]> = today
      ? this.prisma.kpiResult.findMany({
          where: {
            companyId,
            status: active,
            occurredAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
            ...branch,
          },
          select: { userId: true },
          distinct: ['userId'],
        })
      : Promise.resolve([]);

    const [
      settings,
      monthResults,
      compareResults,
      series,
      recentRows,
      held,
      received,
      compareReceived,
      expired,
      compareExpired,
      promises,
    ] = await Promise.all([
      this.kpiSettings.read(companyId),
      this.prisma.kpiResult.findMany({ where: { companyId, month, ...branch }, select: RESULT_FACT }),
      this.prisma.kpiResult.findMany({
        where: { companyId, month: compare, status: active, ...branch },
        select: RESULT_FACT,
      }),
      this.prisma.kpiResult.findMany({
        where: { companyId, status: active, month: { in: monthsFrom(month) }, ...branch },
        select: RESULT_FACT,
      }),
      recent,
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: liveOwnedLeadWhere(companyId, scope),
        _count: { _all: true },
      }),
      this.logs(companyId, taken, range, scope, 'to'),
      this.logs(companyId, taken, compareRange, scope, 'to'),
      this.logs(companyId, [LeadOwnershipKind.EXPIRE], range, scope, 'from'),
      this.logs(companyId, [LeadOwnershipKind.EXPIRE], compareRange, scope, 'from'),
      this.prisma.paymentPromise.findMany({
        where: {
          companyId,
          status: { in: [PaymentPromiseStatus.KEPT, PaymentPromiseStatus.BROKEN] },
          promiseDate: range,
          ...branch,
        },
        select: { createdById: true, status: true },
      }),
    ]);

    const heldMap = new Map<number, number>();
    for (const g of held) if (g.ownerId != null) heldMap.set(g.ownerId, g._count._all);
    const leadIds = [...new Set([...received, ...compareReceived].map((l) => l.leadId))];
    const userIds = [...new Set([...monthResults.map((r) => r.userId), ...heldMap.keys()])];
    const [paidLeads, users, workingDays] = await Promise.all([
      leadIds.length
        ? this.prisma.kpiResult.findMany({
            where: { type: KpiResultType.LEAD_PAID, status: active, leadId: { in: leadIds } },
            select: { userId: true, leadId: true },
          })
        : Promise.resolve<PaidLead[]>([]),
      userIds.length
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: USER_FACT })
        : Promise.resolve<UserFact[]>([]),
      today ? this.workingDays(month, range) : Promise.resolve(null),
    ]);

    const body = assembleOverview({
      month,
      compare,
      today,
      monthResults,
      compareResults,
      series,
      recentUserIds: new Set(recentRows.map((r) => r.userId)),
      held: heldMap,
      received,
      compareReceived,
      paidLeads: paidLeads.flatMap((p) => (p.leadId ? [{ userId: p.userId, leadId: p.leadId }] : [])),
      expired,
      compareExpired,
      promises: promises.map((p) => ({
        userId: p.createdById,
        status: p.status === PaymentPromiseStatus.KEPT ? ('KEPT' as const) : ('BROKEN' as const),
      })),
      names: new Map(users.map((u) => [u.id, fullName(u)] as const)),
      eligibleHolders: new Set(
        users
          .filter(
            (u) =>
              !u.deletedAt &&
              !isBlockedStatus(u.status) &&
              isKpiEligible(u.roles.map((r) => r.role.name)),
          )
          .map((u) => u.id),
      ),
      workingDays,
    });
    return {
      month,
      compare,
      status: { enabled: settings.enabled, changedAt: settings.changedAt },
      ...body,
    };
  }

  /** One person's month (spec §7.8): the drawer of the page and the employee's «KPI» tab. */
  async user(
    companyId: number,
    scope: ReportBranchIds,
    userId: number,
    q: { month?: string },
    now: Date = new Date(),
  ): Promise<KpiUserView> {
    assertScope(scope);
    const month = kpiMonth(q.month, tashkentMonthKey(now));
    const branch = branchIdWhere(scope);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException(NOT_FOUND);
    const [inBranch, anyResults] = await Promise.all([
      scope == null
        ? Promise.resolve(1)
        : this.prisma.user.count({ where: { id: userId, ...userBranchWhere(scope) } }),
      this.prisma.kpiResult.count({ where: { companyId, userId, ...branch } }),
    ]);
    // A director sees the staff of their branch and anyone with a result in it (spec §7.10).
    if (inBranch === 0 && anyResults === 0) throw new NotFoundException(NOT_FOUND);

    const months = monthsFrom(month);
    const [rows, series] = await Promise.all([
      this.prisma.kpiResult.findMany({
        where: { companyId, userId, month, ...branch },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.kpiResult.findMany({
        where: { companyId, userId, status: KpiResultStatus.ACTIVE, month: { in: months }, ...branch },
        select: { month: true, amount: true },
      }),
    ]);
    const students = rows.length
      ? await this.prisma.student.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const studentName = new Map(students.map((s) => [s.id, fullName(s)] as const));
    const ofMonth = (m: string) => series.filter((r) => r.month === m);

    return {
      user: { id: user.id, name: fullName(user) },
      month,
      hasAny: anyResults > 0,
      total: sumAmount(ofMonth(month)),
      compareTotal: sumAmount(ofMonth(addMonthsToMonthKey(month, -1))),
      months: months.map((m) => ({ month: m, count: ofMonth(m).length, amount: sumAmount(ofMonth(m)) })),
      results: rows.map((r) => ({
        id: r.id,
        type: r.type,
        occurredAt: r.occurredAt,
        studentId: r.studentId,
        studentName: studentName.get(r.studentId) ?? `#${r.studentId}`,
        paymentAmount: r.paymentAmount,
        amount: r.amount,
        explanation: explainKpi(r),
        status: r.status,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
      })),
    };
  }

  /** Ownership log rows of a month in scope; a lead with no branch is everyone's, as on the board. */
  private async logs(
    companyId: number,
    kinds: LeadOwnershipKind[],
    range: MonthRange,
    scope: ReportBranchIds,
    side: 'to' | 'from',
  ): Promise<LogFact[]> {
    const rows = await this.prisma.leadOwnershipLog.findMany({
      where: {
        companyId,
        kind: { in: kinds },
        createdAt: range,
        ...ownershipLogBranchWhere(scope),
      },
      select: { leadId: true, toUserId: true, fromUserId: true, createdAt: true },
    });
    return rows.flatMap((r) => {
      const userId = side === 'to' ? r.toUserId : r.fromUserId;
      return userId == null ? [] : [{ userId, leadId: r.leadId, at: r.createdAt }];
    });
  }

  /** The month's Monday–Saturday days without the company-wide holidays (spec §7.9). */
  private async workingDays(month: string, range: MonthRange): Promise<string[]> {
    const holidays = await buildHolidayDateSetsByBranch(
      this.prisma,
      range.gte,
      new Date(range.lt.getTime() - 1),
    );
    const days = holidays(COMPANY_WIDE_HOLIDAYS);
    return workingDaysOfMonth(month, (d) => days.has(d));
  }
}
```

- [ ] **Step 5: Testlar**

Run: `cd server && npx jest src/kpi src/leads`
Expected: PASS.

- [ ] **Step 6: Format, lint, commit**

```bash
cd server
npx prettier --write src/kpi/kpi-read.service.ts src/kpi/kpi-read.service.spec.ts src/leads/ownership/lead-ownership.service.ts src/leads/ownership/lead-ownership.service.spec.ts
npx eslint src/kpi/kpi-read.service.ts src/leads/ownership/lead-ownership.service.ts --quiet
cd ..
git add server/src/kpi server/src/leads/ownership
git commit -m "feat(kpi): the overview and one person's month, branch-scoped (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: API — `KpiController`, yo'l manifesti va filial siyosati

**Files:**
- Create: `server/src/kpi/kpi.controller.ts` (+ `kpi.controller.spec.ts`)
- Create: `server/src/kpi/dto/kpi-query.dto.ts`, `server/src/kpi/dto/kpi-settings.dto.ts` (+ `dto/kpi-dto.spec.ts`)
- Modify: `server/src/kpi/kpi.module.ts`
- Modify: `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `KpiReadService` (Task 10), `KpiSettingsService` (Task 2), `kpi.view` (Task 3).
- Produces (HTTP, `/api` ostida):
  - `GET /kpi/overview?month=YYYY-MM&compare=YYYY-MM` → `KpiOverview` (`kpi.view`, `@BranchScope()`)
  - `GET /kpi/users/:id?month=YYYY-MM` → `KpiUserView` (`kpi.view`, `@BranchScope()`; doiradan tashqarida 404 «Xodim topilmadi»)
  - `GET /kpi/settings` → `KpiSettings` (`kpi.view`)
  - `PATCH /kpi/settings` `{ enabled?: boolean; leadPaid?: { mode, value }; promiseKept?: { mode, value } }` → `KpiSettings` (`@CeoOnly()`)

- [ ] **Step 1: Yiqiladigan testlar**

`server/src/kpi/kpi.controller.spec.ts`:

```ts
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { KpiController } from './kpi.controller';

describe('KpiController', () => {
  it.each(['overview', 'user', 'getSettings'])(
    '%s is gated by kpi.view: the CEO and the Branch Director',
    (method) => {
      expect(routeAccess(KpiController, method)).toEqual({ kind: 'can', keys: ['kpi.view'] });
      expect(defaultRolesOf(KpiController, method)).toEqual(['Branch Director', 'CEO']);
    },
  );

  it('only the CEO changes the prices and the switch', () => {
    expect(routeAccess(KpiController, 'setSettings')).toEqual({ kind: 'ceo' });
  });

  it('passes the company, the header scope and the query', async () => {
    const read = { overview: jest.fn().mockResolvedValue({}), user: jest.fn().mockResolvedValue({}) };
    const kpiSettings = { read: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) };
    const controller = new KpiController(read as never, kpiSettings as never);

    await controller.overview({ month: '2026-10', compare: '2026-09' }, 1001, [2]);
    expect(read.overview).toHaveBeenCalledWith(1001, [2], { month: '2026-10', compare: '2026-09' });

    await controller.user(11, { month: '2026-10' }, 1001, null);
    expect(read.user).toHaveBeenCalledWith(1001, null, 11, { month: '2026-10' });

    await controller.getSettings(1001);
    expect(kpiSettings.read).toHaveBeenCalledWith(1001);

    await controller.setSettings({ enabled: false }, 1001, 7);
    expect(kpiSettings.update).toHaveBeenCalledWith(1001, { enabled: false }, 7);
  });
});
```

`server/src/kpi/dto/kpi-dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KpiOverviewQueryDto } from './kpi-query.dto';
import { KpiSettingsDto } from './kpi-settings.dto';

const props = async (cls: new () => object, body: object) =>
  (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map(
    (e) => e.property,
  );

describe('KPI DTOs', () => {
  it('takes YYYY-MM months only', async () => {
    expect(await props(KpiOverviewQueryDto, { month: '2026-10', compare: '2026-09' })).toEqual([]);
    expect(await props(KpiOverviewQueryDto, {})).toEqual([]);
    expect(await props(KpiOverviewQueryDto, { month: '2026-13' })).toEqual(['month']);
    expect(await props(KpiOverviewQueryDto, { compare: '10.2026' })).toEqual(['compare']);
  });

  it('takes a whole rule with a known mode and a value up to 10 000 000', async () => {
    expect(await props(KpiSettingsDto, { enabled: true, leadPaid: { mode: 'PERCENT', value: 5 } })).toEqual([]);
    expect(await props(KpiSettingsDto, { leadPaid: { mode: 'SOME', value: 5 } })).toEqual(['leadPaid']);
    expect(await props(KpiSettingsDto, { promiseKept: { mode: 'FIXED', value: 10_000_001 } })).toEqual([
      'promiseKept',
    ]);
    expect(await props(KpiSettingsDto, { leadPaid: { mode: 'FIXED' } })).toEqual(['leadPaid']);
    expect(await props(KpiSettingsDto, { enabled: 'yes' })).toEqual(['enabled']);
  });
});
```

Run: `cd server && npx jest src/kpi/kpi.controller.spec.ts src/kpi/dto`
Expected: FAIL (modullar yo'q).

- [ ] **Step 2: DTOlar**

`server/src/kpi/dto/kpi-query.dto.ts`:

```ts
import { IsOptional, Matches } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_MESSAGE = "Oy YYYY-MM ko'rinishida bo'lishi kerak";

/** `?month=` — the range (2026-10 … the current month) is `kpiMonth`'s. */
export class KpiMonthQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: MONTH_MESSAGE })
  month?: string;
}

/** `GET /kpi/overview` — `compare` absent = the month before. */
export class KpiOverviewQueryDto extends KpiMonthQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: MONTH_MESSAGE })
  compare?: string;
}
```

`server/src/kpi/dto/kpi-settings.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { KpiRuleMode } from '@prisma/client';

/** One result type's price (spec §7.4); a percent above 100 is refused by `KpiSettingsService`. */
export class KpiRuleDto {
  @IsIn([KpiRuleMode.FIXED, KpiRuleMode.PERCENT], {
    message: "Usul FIXED yoki PERCENT bo'lishi kerak",
  })
  mode!: KpiRuleMode;

  @IsInt({ message: "Qiymat butun son bo'lishi kerak" })
  @Min(0, { message: "Qiymat manfiy bo'lmaydi" })
  @Max(10_000_000, { message: "Qiymat 10 000 000 dan oshmasin" })
  value!: number;
}

/** `PATCH /kpi/settings` (CEO). */
export class KpiSettingsDto {
  @IsOptional()
  @IsBoolean({ message: "Kalit ha yoki yo'q bo'lishi kerak" })
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => KpiRuleDto)
  leadPaid?: KpiRuleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => KpiRuleDto)
  promiseKept?: KpiRuleDto;
}
```

- [ ] **Step 3: Controller**

`server/src/kpi/kpi.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can, CeoOnly } from '../common/permissions/access.decorators';
import { KpiReadService } from './kpi-read.service';
import { KpiSettingsService } from './kpi-settings.service';
import { KpiMonthQueryDto, KpiOverviewQueryDto } from './dto/kpi-query.dto';
import { KpiSettingsDto } from './dto/kpi-settings.dto';

/** «Xodimlar KPI» (ADR-0095, spec §7.10). No money: these routes only read and set prices. */
@Controller('kpi')
export class KpiController {
  constructor(
    private read: KpiReadService,
    private kpiSettings: KpiSettingsService,
  ) {}

  @Get('overview')
  @Can('kpi.view')
  overview(
    @Query() q: KpiOverviewQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.read.overview(companyId, scope, q);
  }

  @Get('users/:id')
  @Can('kpi.view')
  user(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: KpiMonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.read.user(companyId, scope, id, q);
  }

  @Get('settings')
  @Can('kpi.view')
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.kpiSettings.read(companyId);
  }

  @Patch('settings')
  @CeoOnly()
  setSettings(
    @Body() dto: KpiSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.kpiSettings.update(companyId, dto, userId);
  }
}
```

`server/src/kpi/kpi.module.ts` endi:

```ts
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { KpiController } from './kpi.controller';
import { KpiReadService } from './kpi-read.service';
import { KpiRecorderListener } from './kpi-recorder.listener';
import { KpiResultsService } from './kpi-results.service';
import { KpiSettingsService } from './kpi-settings.service';

/** Admin KPI results (ADR-0095). Stage 2: recorded and shown, no money. */
@Module({
  imports: [SettingsModule],
  controllers: [KpiController],
  providers: [KpiSettingsService, KpiResultsService, KpiReadService, KpiRecorderListener],
})
export class KpiModule {}
```

- [ ] **Step 4: Yo'l manifesti va filial siyosati**

`route-access.snapshot.json` ga (alifbo tartibida; har rol alohida qatorda, fayl formatida):
- `"GET /holidays/:id/status-history"` bloki bilan `"GET /lead-sources"` orasiga:

```json
  "GET /kpi/overview": [
    "Branch Director",
    "CEO"
  ],
  "GET /kpi/settings": [
    "Branch Director",
    "CEO"
  ],
  "GET /kpi/users/:id": [
    "Branch Director",
    "CEO"
  ],
```

- `"PATCH /holidays/:id/status"` bilan `"PATCH /lead-columns/:id"` orasiga:

```json
  "PATCH /kpi/settings": [
    "CEO"
  ],
```

`branch-route-policy.ts` da lead ownership bloki (`'GET /leads/ownership/settings', 'PATCH /leads/ownership/settings'`) dan keyin:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'KPI prices and switch (ADR-0095): `kpi.enabled`, `kpi.leadPaid.*` and ' +
      '`kpi.promiseKept.*` are company-level settings (`companyLevelOnly`) — one ' +
      'value for every branch. The read carries the rules only; the write is ' +
      'CEO-only through `@CeoOnly()`. `GET /kpi/overview` and ' +
      '`GET /kpi/users/:id` take `@BranchScope()`.',
    routes: ['GET /kpi/settings', 'PATCH /kpi/settings'],
  },
```

- [ ] **Step 5: Testlar**

```bash
cd server
npx jest src/kpi src/common/permissions src/common/auth
npm run typecheck
```

Expected: PASS (`permission-routes.spec.ts`, `branch-route-policy.spec.ts`, `permission-allowed-roles.spec.ts`, `route-inventory.spec.ts` ham).

- [ ] **Step 6: Format, lint, commit**

```bash
cd server
# Prettier only on .ts: on the snapshot JSON it rewrites ~1 450 lines; edit that file by hand in its own format.
npx prettier --write src/kpi src/common/auth/branch-route-policy.ts
npx eslint src/kpi src/common/auth/branch-route-policy.ts --quiet
cd ..
git add server/src
git commit -m "feat(kpi): overview, person and settings routes (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Tungi tuzatish (03:30) va `scripts/kpi-backfill.ts`

**Files:**
- Modify: `server/src/kpi/kpi-results.service.ts` (+ spec) — `selfHeal`
- Create: `server/src/kpi/kpi-self-heal.cron.ts` (+ `.spec.ts`)
- Create: `server/src/kpi/kpi-backfill-restore.ts` (+ `.spec.ts`)
- Create: `server/scripts/kpi-backfill.ts`
- Modify: `server/src/kpi/kpi.module.ts`, `server/tsconfig.check.json`

**Interfaces:**
- Consumes: `cancelForPayment`, `recordForPayment`, `planForPayment` (Task 6–7), `KpiRestore` (Task 6), `enrollmentStatusOn`, `supplyOpeningRow` (`server/src/students/shared/enrollment-status-on.ts`), `parseApplyExpectArgs`, `UsageError` (`server/scripts/lib/apply-expect-args.ts`), `LEAD_LINKED_REASON` (`server/src/leads/leads.service.ts`).
- Produces:
  - `KpiResultsService.selfHeal(now: Date): Promise<{ cancelled: number; written: number }>`
  - `KpiSelfHealCron.tick(): Promise<void>` — `@Cron('0 30 3 * * *', { timeZone: 'Asia/Tashkent' })`
  - `restoredConversionKind(linked: boolean, enrollments: readonly EnrollmentAtConversion[], at: Date): LeadConversionKind`; `interface EnrollmentAtConversion { createdAt: Date; statusChangedAt: Date | null; status: string; log: EnrollmentStatusEvent[] }`
  - `RESOLVE_WINDOW_MS = 60_000`, `resolvingPaymentId(resolvedAt: Date, payments: readonly { id: string; createdAt: Date }[]): string | null` — `KPI_START` dan keyin, lekin `resolvedPaymentId` ustuni chiqmasdan oldin `KEPT` bo'lgan va'daning to'lovini tiklaydi.
  - `scripts/kpi-backfill.ts [--expect=<N>] [--apply]`

- [ ] **Step 1: Yiqiladigan testlar**

`kpi-results.service.spec.ts` oxiriga:

```ts
describe('KpiResultsService.selfHeal', () => {
  const NOW = new Date('2026-10-22T22:30:00Z');

  it("cancels the results of payments that no longer stand and walks the last two days again", async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockResolvedValue([{ paymentId: 'p1' }, { paymentId: 'p3' }]);
    s.prisma.payment.findMany
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([{ id: 'p2' }, { id: 'p4' }]);
    s.prisma.payment.findFirst.mockResolvedValue({ id: 'p2' });
    const cancel = jest.spyOn(s.service, 'cancelForPayment').mockResolvedValue(1);
    const record = jest.spyOn(s.service, 'recordForPayment').mockResolvedValue([{} as never]);

    await expect(s.service.selfHeal(NOW)).resolves.toEqual({ cancelled: 1, written: 3 });

    expect(s.prisma.payment.findMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['p1', 'p3'] }, status: { not: 'COMPLETED' } },
      select: { id: true },
    });
    expect(cancel).toHaveBeenCalledWith('p1', { correction: true }, NOW);
    expect(s.prisma.payment.findMany.mock.calls[1][0].where).toEqual({
      status: 'COMPLETED',
      createdAt: { gte: new Date(NOW.getTime() - 2 * 86_400_000) },
    });
    expect(record.mock.calls.map((c) => c[0])).toEqual(['p2', 'p2', 'p4']);
  });

  it('one failing payment does not stop the run', async () => {
    const s = setupKpiResults();
    // No standing result: only the recent payments are read.
    s.prisma.kpiResult.findMany.mockResolvedValue([]);
    s.prisma.payment.findMany.mockResolvedValueOnce([{ id: 'p2' }, { id: 'p4' }]);
    jest
      .spyOn(s.service, 'recordForPayment')
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce([{} as never]);
    await expect(s.service.selfHeal(NOW)).resolves.toEqual({ cancelled: 0, written: 1 });
  });
});
```

`server/src/kpi/kpi-self-heal.cron.spec.ts`:

```ts
import { KpiSelfHealCron } from './kpi-self-heal.cron';

describe('KpiSelfHealCron.tick', () => {
  it('does not start a second run while one is still going, and recovers after a failure', async () => {
    let release!: () => void;
    const selfHeal = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve({ cancelled: 0, written: 0 }))),
      )
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ cancelled: 0, written: 0 });
    const cron = new KpiSelfHealCron({ selfHeal } as never);

    const first = cron.tick();
    await cron.tick();
    expect(selfHeal).toHaveBeenCalledTimes(1);

    release();
    await first;
    await expect(cron.tick()).rejects.toThrow('boom');
    await cron.tick();
    expect(selfHeal).toHaveBeenCalledTimes(3);
  });
});
```

`server/src/kpi/kpi-backfill-restore.spec.ts`:

```ts
import {
  resolvingPaymentId,
  restoredConversionKind,
  type EnrollmentAtConversion,
} from './kpi-backfill-restore';

const d = (iso: string) => new Date(`${iso}T10:00:00+05:00`);
const AT = d('2026-10-18');
const enr = (over: Partial<EnrollmentAtConversion>): EnrollmentAtConversion => ({
  createdAt: d('2026-09-01'),
  statusChangedAt: null,
  status: 'ACTIVE',
  log: [],
  ...over,
});

describe('restoredConversionKind (spec §7.6)', () => {
  it('a lead not linked to a card opened a new student', () => {
    expect(restoredConversionKind(false, [enr({})], AT)).toBe('NEW_STUDENT');
  });

  it('linked to a student studying at that moment: ALREADY_STUDYING', () => {
    const log = [{ status: 'ACTIVE', transitionAt: d('2026-09-01') }];
    expect(restoredConversionKind(true, [enr({ log })], AT)).toBe('ALREADY_STUDYING');
    // A legacy enrollment with no log reads from its own columns.
    expect(restoredConversionKind(true, [enr({})], AT)).toBe('ALREADY_STUDYING');
  });

  it('linked to a student who had left, or never studied: RETURNING', () => {
    const left = [
      { status: 'ACTIVE', transitionAt: d('2026-09-01') },
      { status: 'DROPPED', transitionAt: d('2026-10-01') },
    ];
    expect(restoredConversionKind(true, [enr({ log: left, status: 'DROPPED' })], AT)).toBe('RETURNING');
    expect(restoredConversionKind(true, [], AT)).toBe('RETURNING');
    expect(restoredConversionKind(true, [enr({ createdAt: d('2026-10-20') })], AT)).toBe('RETURNING');
  });
});

describe('resolvingPaymentId (spec §7.6)', () => {
  // `settleKeptPromises` stamps `resolvedAt` inside the payment's own transaction,
  // after the payment row: the resolving payment is at or just before it.
  const resolvedAt = new Date('2026-10-18T05:00:30Z');
  const p = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

  it('takes the latest payment of the 60 seconds up to resolvedAt', () => {
    expect(resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T05:00:29Z')])).toBe('a');
    expect(
      resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T04:59:40Z'), p('b', '2026-10-18T05:00:10Z')]),
    ).toBe('b');
    expect(resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T05:00:30Z')])).toBe('a');
  });

  it('none after resolvedAt, none older than 60 seconds', () => {
    expect(resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T05:00:31Z')])).toBeNull();
    expect(resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T04:59:29Z')])).toBeNull();
    expect(resolvingPaymentId(resolvedAt, [])).toBeNull();
  });
});
```

Run: `cd server && npx jest src/kpi`
Expected: FAIL (`selfHeal`, `./kpi-self-heal.cron`, `./kpi-backfill-restore` yo'q).

- [ ] **Step 2: `selfHeal`**

`kpi-results.service.ts`:
1. `@nestjs/common` importiga `Logger`; `import { describeError } from '../telegram-digest/telegram-send';`.
2. Fayl darajasida: `const SELF_HEAL_WINDOW_MS = 2 * 86_400_000;`
3. Klassga: `private readonly logger = new Logger(KpiResultsService.name);` va metod:

```ts
  /**
   * The nightly repair (spec §7.6): results of payments that no longer stand
   * are cancelled (a correction's are moved to its re-post), and the last two
   * days' COMPLETED payments are recorded again. Idempotent; one failing
   * payment is logged and the run goes on.
   */
  async selfHeal(now: Date): Promise<{ cancelled: number; written: number }> {
    let cancelled = 0;
    let written = 0;
    // ponytail: scans every ACTIVE result's payment; narrow to recent months if the table grows past a few thousand rows.
    const standing = await this.prisma.kpiResult.findMany({
      where: { status: KpiResultStatus.ACTIVE },
      select: { paymentId: true },
      distinct: ['paymentId'],
    });
    const gone = standing.length
      ? await this.prisma.payment.findMany({
          where: {
            id: { in: standing.map((r) => r.paymentId) },
            status: { not: PaymentStatus.COMPLETED },
          },
          select: { id: true },
        })
      : [];
    for (const p of gone) {
      try {
        const corrector = await this.prisma.payment.findFirst({
          where: { correctsPaymentId: p.id },
          select: { id: true },
        });
        cancelled += await this.cancelForPayment(p.id, { correction: corrector != null }, now);
        if (corrector) written += (await this.recordForPayment(corrector.id)).length;
      } catch (e) {
        this.logger.warn(`KPI repair of payment ${p.id} failed: ${describeError(e)}`);
      }
    }
    const recent = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        createdAt: { gte: new Date(now.getTime() - SELF_HEAL_WINDOW_MS) },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const p of recent) {
      try {
        written += (await this.recordForPayment(p.id)).length;
      } catch (e) {
        this.logger.warn(`KPI of payment ${p.id} not recorded: ${describeError(e)}`);
      }
    }
    return { cancelled, written };
  }
```

(Birinchi testdagi `payment.findMany.mock.calls[0][0]` tekshiruvi `orderBy` siz `{ where, select }` ni kutadi — yuqoridagi `gone` so'rovi aynan shunday.)

- [ ] **Step 3: Cron**

`server/src/kpi/kpi-self-heal.cron.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KpiResultsService } from './kpi-results.service';

/** Every night at 03:30 Tashkent the last two days are walked again (spec §7.6). */
@Injectable()
export class KpiSelfHealCron {
  private readonly logger = new Logger(KpiSelfHealCron.name);
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(private results: KpiResultsService) {}

  @Cron('0 30 3 * * *', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.results.selfHeal(new Date());
      if (r.cancelled || r.written) {
        this.logger.log(`KPI repair: ${r.written} written, ${r.cancelled} cancelled`);
      }
    } finally {
      this.running = false;
    }
  }
}
```

`kpi.module.ts`: `import { KpiSelfHealCron } from './kpi-self-heal.cron';` va `providers` ro'yxatining oxiriga `KpiSelfHealCron` (cron `CRONS_ENABLED=false` da ishga tushmaydi — `ScheduleModule` umuman yuklanmaydi).

- [ ] **Step 4: Backfill tiklash qoidalari (sof)**

`server/src/kpi/kpi-backfill-restore.ts`:

```ts
import { LeadConversionKind } from '@prisma/client';
import {
  enrollmentStatusOn,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../students/shared/enrollment-status-on';

/**
 * What the one-time backfill restores for the days between KPI_START and the
 * deploy (spec §7.6): the facts stage 2 now writes live, but nobody wrote then.
 */

export interface EnrollmentAtConversion {
  createdAt: Date;
  statusChangedAt: Date | null;
  status: string;
  /** `EnrollmentStateLog` rows, ascending by `transitionAt`. */
  log: EnrollmentStatusEvent[];
}

/**
 * The kind of a lead converted before stage 2 shipped. A lead not linked to
 * an existing card opened a new student. A linked lead brought back a
 * student who was not studying at the conversion (RETURNING), or earned
 * nothing (ALREADY_STUDYING). "Studying" is an enrollment ACTIVE at that
 * moment, read by `enrollmentStatusOn`.
 */
export function restoredConversionKind(
  linked: boolean,
  enrollments: readonly EnrollmentAtConversion[],
  at: Date,
): LeadConversionKind {
  if (!linked) return LeadConversionKind.NEW_STUDENT;
  const studying = enrollments.some((e) => {
    const log = [...e.log];
    supplyOpeningRow(log, e.createdAt);
    return enrollmentStatusOn(log, at, e) === 'ACTIVE';
  });
  return studying ? LeadConversionKind.ALREADY_STUDYING : LeadConversionKind.RETURNING;
}

/**
 * `settleKeptPromises` stamps `resolvedAt` inside the payment's own
 * transaction, after the payment row (the transaction times out at 15 s), so
 * the payment that kept a promise was made at most this long before it.
 */
export const RESOLVE_WINDOW_MS = 60_000;

/**
 * The payment that made a promise KEPT before `resolvedPaymentId` existed:
 * the student's latest COMPLETED payment made in the 60 seconds up to
 * `resolvedAt` (`payments` are that student's COMPLETED payments). None in
 * the window — null, and the promise earns nothing (a payment since reversed
 * is not COMPLETED, so its promise earns nothing either, as live).
 */
export function resolvingPaymentId(
  resolvedAt: Date,
  payments: readonly { id: string; createdAt: Date }[],
): string | null {
  const to = resolvedAt.getTime();
  const from = to - RESOLVE_WINDOW_MS;
  let best: { id: string; createdAt: Date } | null = null;
  for (const p of payments) {
    const t = p.createdAt.getTime();
    if (t < from || t > to) continue;
    if (!best || t > best.createdAt.getTime()) best = p;
  }
  return best?.id ?? null;
}
```

- [ ] **Step 5: Backfill skripti**

`server/scripts/kpi-backfill.ts`:

```ts
/**
 * KPI results since KPI_START (ADR-0095, spec §7.6), written by the same
 * `KpiResultsService` the payment events use. Run once after the deploy.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/kpi-backfill.ts [--expect=<N>] [--apply]
 *
 * Dry run (default): the connection is read-only (checked, else it stops).
 * It restores in memory (1) the `conversionKind` of the leads converted since
 * KPI_START that have none, and (2) the `resolvedPaymentId` of the promises
 * KEPT since KPI_START that have none (`resolvingPaymentId`: the student's
 * latest COMPLETED payment in the 60 seconds up to `resolvedAt`); then it
 * plans every COMPLETED payment since KPI_START oldest first and prints the
 * kinds, the links, the results per type and N (kinds + links + results).
 * `--apply --expect=<N>` plans again and stops before writing if the count
 * differs; then it writes the kinds and the links and records the payments
 * one by one. A failed payment is logged, the run goes on and exits
 * non-zero; a repeat writes nothing new.
 */
import {
  LeadConversionKind,
  LeadStatus,
  PaymentPromiseStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { KpiSettingsService } from '../src/kpi/kpi-settings.service';
import {
  KpiResultsService,
  type KpiDraft,
  type KpiRestore,
} from '../src/kpi/kpi-results.service';
import { KPI_START } from '../src/kpi/kpi-rules';
import {
  RESOLVE_WINDOW_MS,
  resolvingPaymentId,
  restoredConversionKind,
} from '../src/kpi/kpi-backfill-restore';
import { LEAD_LINKED_REASON } from '../src/leads/leads.service';
import { formatSom } from '../src/payments/shared/format-som';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';

const USAGE =
  'Usage: kpi-backfill.ts [--expect=<N>] [--apply]  (--apply requires --expect=<N>)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

/** The kind each lead converted since KPI_START without one gets back. */
async function missingKinds(prisma: PrismaService): Promise<Map<string, LeadConversionKind>> {
  const leads = await prisma.lead.findMany({
    where: {
      statusEnum: LeadStatus.CONVERTED,
      conversionKind: null,
      convertedStudentId: { not: null },
      statusChangedAt: { gte: KPI_START },
    },
    select: { id: true, convertedStudentId: true, statusChangedAt: true, statusChangeReason: true },
  });
  const out = new Map<string, LeadConversionKind>();
  for (const lead of leads) {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: lead.convertedStudentId as number, deletedAt: null },
      select: {
        createdAt: true,
        statusChangedAt: true,
        status: true,
        stateLog: { select: { status: true, transitionAt: true }, orderBy: { transitionAt: 'asc' } },
      },
    });
    out.set(
      lead.id,
      restoredConversionKind(
        lead.statusChangeReason === LEAD_LINKED_REASON,
        enrollments.map((e) => ({
          createdAt: e.createdAt,
          statusChangedAt: e.statusChangedAt,
          status: e.status,
          log: e.stateLog,
        })),
        lead.statusChangedAt as Date,
      ),
    );
  }
  return out;
}

/** promise id → the payment that kept it, for KEPT promises since KPI_START without one. */
async function missingResolvers(prisma: PrismaService): Promise<Map<string, string>> {
  const promises = await prisma.paymentPromise.findMany({
    where: {
      status: PaymentPromiseStatus.KEPT,
      resolvedPaymentId: null,
      resolvedAt: { gte: KPI_START },
    },
    select: { id: true, studentId: true, resolvedAt: true },
  });
  const out = new Map<string, string>();
  let unmatched = 0;
  for (const p of promises) {
    const resolvedAt = p.resolvedAt as Date;
    const payments = await prisma.payment.findMany({
      where: {
        studentId: p.studentId,
        status: PaymentStatus.COMPLETED,
        createdAt: { gte: new Date(resolvedAt.getTime() - RESOLVE_WINDOW_MS), lte: resolvedAt },
      },
      select: { id: true, createdAt: true },
    });
    const paymentId = resolvingPaymentId(resolvedAt, payments);
    if (paymentId) out.set(p.id, paymentId);
    else unmatched += 1;
  }
  console.log(`promises KEPT without a payment: ${promises.length}, linked: ${out.size}, unmatched: ${unmatched}`);
  return out;
}

function paymentsSinceStart(prisma: PrismaService) {
  return prisma.payment.findMany({
    where: { status: PaymentStatus.COMPLETED, createdAt: { gte: KPI_START } },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** What would be written: one result per lead and per promise. */
async function plan(
  prisma: PrismaService,
  results: KpiResultsService,
  restore: KpiRestore,
): Promise<KpiDraft[]> {
  const byKey = new Map<string, KpiDraft>();
  for (const p of await paymentsSinceStart(prisma)) {
    for (const d of await results.planForPayment(p.id, restore)) {
      const key = d.type === 'LEAD_PAID' ? `L:${d.leadId}` : `P:${d.promiseId}`;
      if (!byKey.has(key)) byKey.set(key, d);
    }
  }
  return [...byKey.values()];
}

async function main() {
  // Refuse a bad command line before anything connects.
  const { apply: APPLY, expect } = parseApplyExpectArgs(process.argv.slice(2), USAGE);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  // No Redis: the settings cache reads the database (settings-cache.ts); the
  // script never writes a setting, so history is never asked for.
  const settings = new SettingsService(prisma, null as never, null as never);
  const results = new KpiResultsService(prisma, new KpiSettingsService(settings));
  try {
    printHeader(`KPI backfill since ${KPI_START.toISOString()} — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<{ default_transaction_read_only: string }[]>`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const restore: KpiRestore = {
      kinds: await missingKinds(prisma),
      resolvers: await missingResolvers(prisma),
    };
    const drafts = await plan(prisma, results, restore);
    for (const kind of Object.values(LeadConversionKind)) {
      console.log(`kind ${kind}\t${[...restore.kinds.values()].filter((k) => k === kind).length}`);
    }
    for (const type of ['LEAD_PAID', 'PROMISE_KEPT'] as const) {
      const list = drafts.filter((d) => d.type === type);
      console.log(`${type}\t${list.length}\t${formatSom(list.reduce((s, d) => s + d.amount, 0))} so'm`);
    }
    const total = restore.kinds.size + restore.resolvers.size + drafts.length;
    console.log(`\ntotal: ${total} (kinds ${restore.kinds.size} + links ${restore.resolvers.size} + results ${drafts.length})`);
    if (!APPLY) return;

    // What was reviewed is what gets written.
    if (expect !== total) {
      throw new UsageError(
        `This run found ${total} but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    // The kinds and the links first: the results need them.
    for (const [id, kind] of restore.kinds) {
      await prisma.lead.updateMany({ where: { id, conversionKind: null }, data: { conversionKind: kind } });
    }
    for (const [id, paymentId] of restore.resolvers) {
      await prisma.paymentPromise.updateMany({
        where: { id, resolvedPaymentId: null },
        data: { resolvedPaymentId: paymentId },
      });
    }
    let written = 0;
    let failed = 0;
    for (const p of await paymentsSinceStart(prisma)) {
      try {
        written += (await results.recordForPayment(p.id)).length;
      } catch (err) {
        failed += 1;
        console.error(`FAILED ${p.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(
      `kinds written: ${restore.kinds.size}, links written: ${restore.resolvers.size}, results written: ${written}`,
    );
    if (failed > 0) {
      console.error(`${failed} payment(s) failed — repeat the same command to retry them.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? err.message : err);
  process.exitCode = 1;
});
```

`server/tsconfig.check.json` `include` ro'yxatining oxiriga (`"scripts/lib/receipt-code-plan.spec.ts"` dan keyin): `"scripts/kpi-backfill.ts"` — natija yozadigan skript `src/` darajasida tekshiriladi.

- [ ] **Step 6: Testlar va tip tekshiruvi**

```bash
cd server
npx jest src/kpi
npm run typecheck
```

Expected: PASS, typecheck xatosiz (skript ham). Skriptni dev bazada ishga tushirish shart emas: umumiy dev bazada mainning ko'p migratsiyasi yo'q; quruq ishga tushirish Task 20 dagi vaqtinchalik bazada qilinadi.

- [ ] **Step 7: Format, lint, commit**

```bash
cd server
npx prettier --write src/kpi scripts/kpi-backfill.ts
npx eslint src/kpi scripts/kpi-backfill.ts --quiet
cd ..
git add server/src/kpi server/scripts/kpi-backfill.ts server/tsconfig.check.json
git commit -m "feat(kpi): nightly 03:30 repair and the one-time backfill script (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Arxivdan tiklash — aylangan lid egasi bilan qaytadi

**Files:**
- Modify: `server/src/archive/archive-restore.service.ts`
- Test: `server/src/archive/archive-restore.lead-owner.spec.ts`

**Interfaces:**
- Produces: umumiy `/archive` tiklash (bitta lid va partiya) `convertedStudentId` bor lidni `CONVERTED` holicha, egasi bilan, `statusChangedAt` / `statusChangedById` / `statusChangeReason` ga tegmay qaytaradi (`restoreRelease` qoidasi bilan bir xil: aylangan lid bo'shatilmaydi).

- [ ] **Step 1: Yiqiladigan testlar**

`archive-restore.lead-owner.spec.ts` da `describe('one lead'` ichiga:

```ts
    it('brings a converted lead back CONVERTED, with its owner and its conversion time (ADR-0095)', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...OWNED,
        statusEnum: 'CONVERTED',
        convertedStudentId: 10500,
      });

      await restoreOne();

      expect(prisma.lead.update).toHaveBeenCalledTimes(1);
      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ deletedAt: null, statusEnum: 'CONVERTED' });
      expect(data).not.toHaveProperty('ownerId');
      expect(data).not.toHaveProperty('statusChangedAt');
      expect(data).not.toHaveProperty('statusChangeReason');
      expect(statusHistory.changeStatus).not.toHaveBeenCalled();
      expect(ownership.recordChange).not.toHaveBeenCalled();
      expect(history.recordRestore).toHaveBeenCalledWith(
        expect.objectContaining({ newValues: { status: 'CONVERTED' } }),
      );
    });

    it('a converted lead deleted as LOST comes back CONVERTED too', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...OWNED, convertedStudentId: 10500 });

      await restoreOne();

      expect(statusHistory.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ fromStatus: 'LOST', toStatus: 'CONVERTED' }),
      );
      expect(prisma.lead.update.mock.calls[0][0].data.statusEnum).toBe('CONVERTED');
    });
```

`describe('a deletion batch'` ichiga:

```ts
    it("restores the batch's converted leads CONVERTED first, before the rest are released", async () => {
      tx.lead.findMany.mockResolvedValue([BATCH_LEAD]);

      await restoreOne();

      expect(tx.lead.updateMany).toHaveBeenNthCalledWith(1, {
        where: { deletionBatchId: 'batch-1', convertedStudentId: { not: null } },
        data: { deletedAt: null, deletedById: null, deletionBatchId: null, statusEnum: 'CONVERTED' },
      });
      expect(tx.lead.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.lead.findMany.mock.invocationCallOrder[0],
      );
    });
```

Run: `cd server && npx jest src/archive/archive-restore.lead-owner.spec.ts`
Expected: FAIL (aylangan lid `NEW` bo'lib, egasiz qaytadi).

- [ ] **Step 2: Bitta lid**

`archive-restore.service.ts` `restore()` da `const defaultStatus = ENTITY_DEFAULT_STATUS[entityType];` qatorini almashtiring:

```ts
    // ADR-0095: a converted lead comes back CONVERTED with its owner and its
    // conversion time — its KPI is credited to that owner from that moment
    // (the same rule as `restoreRelease`).
    const keepsConversion =
      entityType === ArchiveEntityType.LEADS && record.convertedStudentId != null;
    const defaultStatus = keepsConversion
      ? LeadStatus.CONVERTED
      : ENTITY_DEFAULT_STATUS[entityType];
```

va `restoreData` ni:

```ts
      const restoreData: any = {
        deletedAt: null,
        deletedById: null,
        deletionBatchId: null,
        // A converted lead keeps the moment and the marker of its conversion.
        ...(keepsConversion
          ? {}
          : {
              statusChangedAt: new Date(),
              statusChangedById: userId,
              statusChangeReason: 'Arxivdan tiklandi',
            }),
      };
```

(`restoreLead` endi `restoreData.statusEnum = CONVERTED` ni oladi: `restoreRelease` `null` qaytaradi va oddiy `update` bo'ladi.)

- [ ] **Step 3: Partiya**

`restoreBatch` da `const ownedLeads = await tx.lead.findMany({` dan OLDIN:

```ts
      // ADR-0095: the batch's converted leads keep CONVERTED, their owner and
      // their conversion time; only the others come back NEW and unowned.
      await tx.lead.updateMany({
        where: { deletionBatchId: batchId, convertedStudentId: { not: null } },
        data: {
          deletedAt: null,
          deletedById: null,
          deletionBatchId: null,
          statusEnum: LeadStatus.CONVERTED,
        },
      });
```

Shu yozuvdan keyin aylangan lidlarda `deletionBatchId` qolmaydi, shuning uchun keyingi `findMany` va `NEW` `updateMany` faqat aylanmaganlarni oladi — ularning `where` lari o'zgarmaydi.

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/archive src/leads`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server
npx prettier --write src/archive/archive-restore.service.ts src/archive/archive-restore.lead-owner.spec.ts
npx eslint src/archive/archive-restore.service.ts --quiet
cd ..
git add server/src/archive
git commit -m "fix(archive): a restored converted lead keeps CONVERTED, its owner and its conversion time (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client — tiplar, formatlash, so'rovlar

**Files:**
- Create: `client/src/components/reports/admin-kpi/kpi-types.ts`, `kpi-queries.ts`, `kpi-format.ts`, `kpi-format.test.ts`, `kpi-trend.tsx`

Menyu havolalari sahifalar bilan birga qo'shiladi: «KPI sozlamalari» — Task 15, «Xodimlar KPI» — Task 16 (sahifasi yo'q havola bo'lmasin).

**Interfaces:**
- Consumes: Task 11 dagi HTTP javoblari (`Date` lar ISO satr bo'lib keladi).
- Produces:
  - Tiplar: `KpiResultType`, `KpiResultStatus`, `KpiRuleMode`, `KpiRule`, `KpiSettings`, `KpiSettingsPatch`, `KpiPair`, `KpiSignal`, `KpiAdminRow`, `KpiOverview`, `KpiResultView`, `KpiUserView` (server bilan bir xil maydonlar).
  - So'rovlar: `useKpiOverview(month: string, compare: string)`, `useKpiUser(userId: number | null, month?: string)`, `useKpiSettings()`, `saveKpiSettings(patch: KpiSettingsPatch): Promise<KpiSettings>`, `KPI_SETTINGS_KEY`.
  - Formatlash: `KPI_FIRST_MONTH`, `COMPARE_FLOOR_MONTH`, `KPI_MAX_SOM`, `kpiMonth(oy, current)`, `kpiCompare(bilan, month, current)`, `deltaLine(value, compare, unit: DeltaUnit)`, `deltaTone(value, compare, higherIsBetter?)`, `ratioText(pct, part, whole)`, `switchText(status)`, `RESULT_TYPE_LABEL`, `dayText(iso)`, `ruleError(rule)`, `settingsPatch(saved, draft)`, `KPI_DEFINITIONS`.
  - Komponentlar: `TrendLine({ value, compare, unit, higherIsBetter?, suffix? })`, `TrendMark({ value, compare, higherIsBetter? })`.

- [ ] **Step 1: Yiqiladigan testlar**

`client/src/components/reports/admin-kpi/kpi-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  dayText,
  deltaLine,
  deltaTone,
  kpiCompare,
  kpiMonth,
  ratioText,
  ruleError,
  settingsPatch,
  switchText,
} from "./kpi-format";
import type { KpiSettings } from "./kpi-types";

describe("kpiMonth / kpiCompare", () => {
  it("keeps the page month inside [2026-10, today's month]", () => {
    expect(kpiMonth("", "2026-11")).toBe("2026-11");
    expect(kpiMonth("2026-09", "2026-11")).toBe("2026-10");
    expect(kpiMonth("2026-12", "2026-11")).toBe("2026-11");
    expect(kpiMonth("bad", "2026-11")).toBe("2026-11");
  });

  it("compares with the month before unless one is picked", () => {
    expect(kpiCompare("", "2026-10", "2026-11")).toBe("2026-09");
    expect(kpiCompare("2026-08", "2026-11", "2026-11")).toBe("2026-09");
    expect(kpiCompare("2026-10", "2026-11", "2026-11")).toBe("2026-10");
  });
});

describe("deltaLine / deltaTone", () => {
  it("prints the arrow and the difference", () => {
    expect(deltaLine(5, 3, "count")).toBe("▲ 2");
    expect(deltaLine(3, 3, "count")).toBe("o'zgarmadi");
    expect(deltaLine(50_000, 70_000, "som")).toBe(`▼ ${formatPrice(20_000)} so'm`);
    expect(deltaLine(55, 50, "pct")).toBe("▲ 5 foiz punkt");
  });

  it("is green when better: more results, fewer returned leads", () => {
    expect(deltaTone(5, 3)).toBe("good");
    expect(deltaTone(3, 5)).toBe("bad");
    expect(deltaTone(5, 3, false)).toBe("bad");
    expect(deltaTone(3, 3)).toBe("flat");
  });
});

describe("texts", () => {
  it("prints a share with its parts, or a dash", () => {
    expect(ratioText(50, 1, 2)).toBe("50% (1 / 2)");
    expect(ratioText(null, 0, 0)).toBe("—");
  });

  it("states the switch and when it flipped", () => {
    expect(switchText({ enabled: true, changedAt: null })).toBe("KPI hisoblash yoqilgan");
    expect(switchText({ enabled: false, changedAt: "2026-10-20T05:00:00.000Z" })).toBe(
      "KPI hisoblash o'chiq (20.10 dan)",
    );
  });

  it("prints a day as dd.MM.yyyy on the Tashkent clock", () => {
    expect(dayText("2026-10-19T20:30:00.000Z")).toBe("20.10.2026");
  });
});

describe("settings form", () => {
  const SAVED: KpiSettings = {
    enabled: true,
    changedAt: null,
    leadPaid: { mode: "FIXED", value: 50_000 },
    promiseKept: { mode: "FIXED", value: 20_000 },
  };

  it("refuses a percent over 100 and a sum over 10 000 000", () => {
    expect(ruleError({ mode: "PERCENT", value: 101 })).toBe("Foiz 0 dan 100 gacha bo'ladi");
    expect(ruleError({ mode: "FIXED", value: 10_000_001 })).toBe("Summa 10 000 000 so'mdan oshmasin");
    expect(ruleError({ mode: "FIXED", value: 1.5 })).toBe("Butun son kiriting");
    expect(ruleError({ mode: "PERCENT", value: 5 })).toBeNull();
  });

  it("sends only what changed", () => {
    expect(settingsPatch(SAVED, SAVED)).toEqual({});
    expect(settingsPatch(SAVED, { ...SAVED, enabled: false })).toEqual({ enabled: false });
    expect(
      settingsPatch(SAVED, { ...SAVED, promiseKept: { mode: "PERCENT", value: 5 } }),
    ).toEqual({ promiseKept: { mode: "PERCENT", value: 5 } });
  });
});
```

Run: `cd client && npx vitest run src/components/reports/admin-kpi`
Expected: FAIL.

- [ ] **Step 2: Tiplar**

`client/src/components/reports/admin-kpi/kpi-types.ts`:

```ts
/** The JSON of `/kpi/*` (server `src/kpi/`, ADR-0095). Dates arrive as ISO strings. */
export type KpiResultType = "LEAD_PAID" | "PROMISE_KEPT";
export type KpiResultStatus = "ACTIVE" | "CANCELLED";
export type KpiRuleMode = "FIXED" | "PERCENT";

export interface KpiRule {
  mode: KpiRuleMode;
  value: number;
}

export interface KpiSettings {
  enabled: boolean;
  /** When the switch last flipped; null = never. */
  changedAt: string | null;
  leadPaid: KpiRule;
  promiseKept: KpiRule;
}

export interface KpiSettingsPatch {
  enabled?: boolean;
  leadPaid?: KpiRule;
  promiseKept?: KpiRule;
}

export interface KpiPair {
  value: number;
  compare: number;
}

export interface KpiSignal {
  kind: "DROP" | "SILENT" | "EXPIRED" | "PROMISE_LOW" | "SURGE" | "BEST_CONVERSION";
  userId: number;
  tone: "bad" | "good";
  text: string;
  weight: number;
}

export interface KpiAdminRow {
  userId: number;
  name: string;
  leadPaid: { count: number; amount: number; compare: number };
  promiseKept: { count: number; amount: number; compare: number };
  leadToPaid: { paid: number; received: number; pct: number | null };
  promiseRate: { kept: number; closed: number; pct: number | null };
  expired: { count: number; compare: number };
  held: number;
  total: number;
}

export interface KpiOverview {
  month: string;
  compare: string;
  status: { enabled: boolean; changedAt: string | null };
  cards: {
    results: KpiPair;
    amount: KpiPair;
    leadToPaid: { value: number | null; compare: number | null };
    forecast: number | null;
  };
  signals: KpiSignal[];
  daily: { day: number; current: number | null; compare: number | null }[];
  months: { month: string; leadPaid: number; promiseKept: number; amount: number }[];
  rows: KpiAdminRow[];
}

export interface KpiResultView {
  id: string;
  type: KpiResultType;
  occurredAt: string;
  studentId: number;
  studentName: string;
  paymentAmount: number;
  amount: number;
  /** «Qanday hisoblandi», written by the server. */
  explanation: string;
  status: KpiResultStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface KpiUserView {
  user: { id: number; name: string };
  month: string;
  hasAny: boolean;
  total: number;
  compareTotal: number;
  months: { month: string; count: number; amount: number }[];
  results: KpiResultView[];
}
```

- [ ] **Step 3: Formatlash**

`client/src/components/reports/admin-kpi/kpi-format.ts`:

```ts
import { clampMonth } from "@/components/payments/overview/overview-math";
import { addMonths } from "@/components/payments/salary-utils";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { tashkentDdMm, tashkentWallClock } from "@/lib/tashkent-time";
import type { KpiResultType, KpiRule, KpiSettings, KpiSettingsPatch } from "./kpi-types";

/** The KPI pages start with the results (spec §7.1/9). */
export const KPI_FIRST_MONTH = "2026-10";
/** The compare month may be the one before: October compares with an empty September. */
export const COMPARE_FLOOR_MONTH = "2026-09";
export const KPI_MAX_SOM = 10_000_000;

/** `?oy=` inside [2026-10, the current month]; empty or unreadable = the current month. */
export function kpiMonth(oy: string, current: string): string {
  return clampMonth(oy || current, KPI_FIRST_MONTH, current);
}

/** `?bilan=`; empty = the month before the page's month. */
export function kpiCompare(bilan: string, month: string, current: string): string {
  return bilan ? clampMonth(bilan, COMPARE_FLOOR_MONTH, current) : addMonths(month, -1);
}

export type DeltaUnit = "count" | "som" | "pct";

/** «▲ 2», «▼ 20 000 so'm», «▲ 5 foiz punkt», or «o'zgarmadi». */
export function deltaLine(value: number, compare: number, unit: DeltaUnit): string {
  if (value === compare) return "o'zgarmadi";
  const diff = Math.abs(value - compare);
  const text =
    unit === "som" ? `${formatPrice(diff)} so'm` : unit === "pct" ? `${formatNumber(diff)} foiz punkt` : formatNumber(diff);
  return `${value > compare ? "▲" : "▼"} ${text}`;
}

/** Green when better: more is better unless `higherIsBetter` is false (returned leads). */
export function deltaTone(value: number, compare: number, higherIsBetter = true): "good" | "bad" | "flat" {
  if (value === compare) return "flat";
  return value > compare === higherIsBetter ? "good" : "bad";
}

/** «50% (1 / 2)», or «—» when there is nothing to divide. */
export function ratioText(pct: number | null, part: number, whole: number): string {
  return pct === null ? "—" : `${formatNumber(pct)}% (${formatNumber(part)} / ${formatNumber(whole)})`;
}

/** «KPI hisoblash o'chiq (20.10 dan)» (spec §7.4). */
export function switchText(s: { enabled: boolean; changedAt: string | null }): string {
  const since = s.changedAt ? ` (${tashkentDdMm(s.changedAt)} dan)` : "";
  return `KPI hisoblash ${s.enabled ? "yoqilgan" : "o'chiq"}${since}`;
}

export const RESULT_TYPE_LABEL: Record<KpiResultType, string> = {
  LEAD_PAID: "Lid to'lov qildi",
  PROMISE_KEPT: "Va'da bajarildi",
};

/** dd.MM.yyyy on the Tashkent clock. */
export function dayText(iso: string): string {
  return `${tashkentDdMm(iso)}.${tashkentWallClock(iso).getUTCFullYear()}`;
}

/** The settings form's check; the server checks again. */
export function ruleError(rule: KpiRule): string | null {
  if (!Number.isInteger(rule.value) || rule.value < 0) return "Butun son kiriting";
  if (rule.mode === "PERCENT" && rule.value > 100) return "Foiz 0 dan 100 gacha bo'ladi";
  if (rule.mode === "FIXED" && rule.value > KPI_MAX_SOM) return "Summa 10 000 000 so'mdan oshmasin";
  return null;
}

/** Only what changed: the switch's time is the flip, so it is never re-sent. */
export function settingsPatch(saved: KpiSettings, draft: KpiSettings): KpiSettingsPatch {
  const patch: KpiSettingsPatch = {};
  if (draft.enabled !== saved.enabled) patch.enabled = draft.enabled;
  for (const key of ["leadPaid", "promiseKept"] as const) {
    if (draft[key].mode !== saved[key].mode || draft[key].value !== saved[key].value) {
      patch[key] = draft[key];
    }
  }
  return patch;
}

/** The metric definitions of spec §7.7, printed under the table. */
export const KPI_DEFINITIONS = [
  {
    term: "Lid → to'lov",
    text: "oyda xodimga kelgan lidlar (o'zi band qilgan yoki unga berilgan, har lid bir marta) dan nechtasida uning «Lid to'lov qildi» natijasi bor. Joriy oyda hali to'lamaganlar ham hisobda.",
  },
  {
    term: "Va'da bajarilishi",
    text: "xodim yozgan, va'da kuni shu oyga tushgan va'dalardan bajarilganlari: bajarilgan / (bajarilgan + buzilgan). Ochiq va'da kirmaydi.",
  },
  {
    term: "Qaytgan lidlar",
    text: "shu oyda muddati o'tib xodimdan umumiy ro'yxatga qaytgan lidlar.",
  },
  {
    term: "Taqqoslash",
    text: "joriy oy taqqoslanayotgan oyning shu kunigacha bo'lgan qismi bilan solishtiriladi.",
  },
] as const;
```

- [ ] **Step 4: So'rovlar va o'zgarish belgisi**

`client/src/components/reports/admin-kpi/kpi-queries.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import { retryDrawer } from "@/components/payments/debt/debt-queries";
import type { KpiOverview, KpiSettings, KpiSettingsPatch, KpiUserView } from "./kpi-types";

export const KPI_SETTINGS_KEY = ["kpi", "settings"] as const;

/** The page in one answer; the branch rides in the key (the server reads `X-Branch-Id`). */
export function useKpiOverview(month: string, compare: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["kpi", "overview", branchId, month, compare],
    queryFn: () => api.get<KpiOverview>("/kpi/overview", { params: { month, compare } }).then((r) => r.data),
    staleTime: 0,
  });
}

/** One person's month; no `month` = the server's current month. A 404 (outside the branch) is an answer, not retried. */
export function useKpiUser(userId: number | null, month?: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["kpi", "user", branchId, userId, month ?? null],
    queryFn: () =>
      api.get<KpiUserView>(`/kpi/users/${userId}`, { params: month ? { month } : undefined }).then((r) => r.data),
    enabled: userId !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

export function useKpiSettings() {
  return useQuery({
    queryKey: KPI_SETTINGS_KEY,
    queryFn: () => api.get<KpiSettings>("/kpi/settings").then((r) => r.data),
  });
}

export async function saveKpiSettings(patch: KpiSettingsPatch): Promise<KpiSettings> {
  return (await api.patch<KpiSettings>("/kpi/settings", patch)).data;
}
```

`client/src/components/reports/admin-kpi/kpi-trend.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { deltaLine, deltaTone, type DeltaUnit } from "./kpi-format";

const TONE = { good: "text-green-600", bad: "text-destructive", flat: "text-muted-foreground" } as const;

/** «▲ 3 — taqqoslanayotgan oyga nisbatan», green when better, red when worse. */
export function TrendLine({
  value,
  compare,
  unit,
  higherIsBetter = true,
  suffix = " — taqqoslanayotgan oyga nisbatan",
}: {
  value: number;
  compare: number;
  unit: DeltaUnit;
  higherIsBetter?: boolean;
  suffix?: string;
}) {
  return (
    <p className={cn("text-xs", TONE[deltaTone(value, compare, higherIsBetter)])}>
      {deltaLine(value, compare, unit)}
      {suffix}
    </p>
  );
}

/** The arrow alone, for a table cell. */
export function TrendMark({
  value,
  compare,
  higherIsBetter = true,
}: {
  value: number;
  compare: number;
  higherIsBetter?: boolean;
}) {
  if (value === compare) return null;
  return (
    <span
      className={cn("ml-1 text-xs", TONE[deltaTone(value, compare, higherIsBetter)])}
      aria-label={`taqqoslanayotgan oyda ${compare}`}
    >
      {value > compare ? "▲" : "▼"}
    </span>
  );
}
```

- [ ] **Step 5: Testlar va lint**

```bash
cd client
npx vitest run src/components/reports/admin-kpi src/lib/permission-keys.test.ts
npx eslint src/components/reports/admin-kpi
```

Expected: PASS, lint xatosiz.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/reports/admin-kpi
git commit -m "feat(kpi): client types, formatting and queries (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Sozlamalar → «KPI sozlamalari»

**Files:**
- Create: `client/src/app/(dashboard)/settings/kpi/page.tsx`
- Create: `client/src/components/settings/kpi-settings-client.tsx`
- Modify: `client/src/lib/settings-nav.ts` (+ `settings-nav.test.ts`), `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: `useKpiSettings`, `saveKpiSettings`, `KPI_SETTINGS_KEY`, `ruleError`, `settingsPatch`, `switchText`, `KpiRule`, `KpiSettings` (Task 14).

- [ ] **Step 0: Menyu testi (avval yiqiladi)**

`client/src/lib/settings-nav.test.ts`: `"the CEO sees all 14 items in two sections"` → `"the CEO sees all 15 items in two sections"`, `toHaveLength(14)` → `toHaveLength(15)`. Oxiriga:

```ts
describe("«KPI sozlamalari» — CEO only (ADR-0095)", () => {
  const PATH = "/settings/kpi";
  it("only the CEO sees and opens it", () => {
    const ceo = getVisibleSettingsSections(canForRoles([CEO]), true).flatMap((s) => s.items);
    expect(ceo.map((item) => item.url)).toContain(PATH);
    expect(canOpenSettingsPath(PATH, canForRoles([BRANCH_DIRECTOR]), false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([CEO]), true)).toBe(true);
  });
});
```

Run: `cd client && npx vitest run src/lib/settings-nav.test.ts` — FAIL.

`client/src/lib/settings-nav.ts`: `lucide-react` importiga `Trophy`; «CEO» bo'limida «Lidlar egaligi» dan keyin:

```ts
      {
        // The write is `@CeoOnly()` (ADR-0095): identity, not a capability.
        title: "KPI sozlamalari",
        url: "/settings/kpi",
        icon: Trophy,
        description: "KPI narxlari va hisoblash kaliti",
        ceoOnly: true,
      },
```

`client/src/lib/breadcrumb-routes.ts` ga `"lead-ownership"` dan keyin:

```ts
  // /settings/kpi — «KPI sozlamalari», CEO only (ADR-0095).
  kpi: "KPI sozlamalari",
```

Run: `cd client && npx vitest run src/lib/settings-nav.test.ts` — PASS.

- [ ] **Step 1: Sahifa**

`client/src/app/(dashboard)/settings/kpi/page.tsx`:

```tsx
import { Suspense } from "react";
import { KpiSettingsClient } from "@/components/settings/kpi-settings-client";

export default function KpiSettingsPage() {
  return (
    <Suspense>
      <KpiSettingsClient />
    </Suspense>
  );
}
```

`client/src/components/settings/kpi-settings-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/get-error-message";
import { KPI_SETTINGS_KEY, saveKpiSettings, useKpiSettings } from "@/components/reports/admin-kpi/kpi-queries";
import { ruleError, settingsPatch, switchText } from "@/components/reports/admin-kpi/kpi-format";
import type { KpiRule, KpiSettings } from "@/components/reports/admin-kpi/kpi-types";
import { SettingsPageHeader } from "./settings-page-header";

const RULES = [
  { key: "leadPaid", title: "Lid to'lov qildi", base: "Foiz bazasi — o'quvchining birinchi to'lovi" },
  { key: "promiseKept", title: "Va'da bajarildi", base: "Foiz bazasi — va'da paytidagi qarz" },
] as const;

const TITLE = "KPI sozlamalari";
const DESCRIPTION = "KPI narxlari va hisoblash kaliti";

/** CEO-only (ADR-0095): the switch and the two prices. A price changes only the results after it. */
export function KpiSettingsClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useKpiSettings();
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<KpiSettings | null>(null);

  const save = useMutation({
    mutationFn: saveKpiSettings,
    onSuccess: (saved) => {
      setDraft(null);
      queryClient.setQueryData(KPI_SETTINGS_KEY, saved);
      queryClient.invalidateQueries({ queryKey: ["kpi"] });
      toast.success("Saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Sozlamalarni yuklab bo&apos;lmadi.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Qayta urinish
        </Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? data;
  const patch = settingsPatch(data, form);
  const invalid = RULES.some((r) => ruleError(form[r.key]) !== null);

  return (
    <div>
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
      <div className="max-w-xl space-y-6 rounded-lg border p-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="kpi-enabled"
              checked={form.enabled}
              disabled={save.isPending}
              onCheckedChange={(enabled) => setDraft({ ...form, enabled })}
            />
            <Label htmlFor="kpi-enabled">KPI hisoblash</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {switchText(data)}. O&apos;chiq paytda yangi natija yozilmaydi va bu davr keyin to&apos;ldirilmaydi;
            bekor qilish ishlayveradi.
          </p>
        </div>

        {RULES.map((r) => (
          <div key={r.key} className="space-y-1.5">
            <Label htmlFor={`${r.key}-value`}>{r.title}</Label>
            <RuleFields
              id={r.key}
              rule={form[r.key]}
              disabled={save.isPending}
              onChange={(rule) => setDraft({ ...form, [r.key]: rule })}
            />
            <p className="text-xs text-muted-foreground">{r.base}</p>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Kuzatuv: natijalar yoziladi, lekin oylikka qo&apos;shilmaydi. Summa natija yozilgan paytdagi narx bilan
          qoladi — narx o&apos;zgarsa faqat keyingi natijalarga ta&apos;sir qiladi.
        </p>
        <Button
          disabled={Object.keys(patch).length === 0 || invalid || save.isPending}
          onClick={() => save.mutate(patch)}
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Saqlash
        </Button>
      </div>
    </div>
  );
}

function RuleFields({
  id,
  rule,
  disabled,
  onChange,
}: {
  id: string;
  rule: KpiRule;
  disabled: boolean;
  onChange: (rule: KpiRule) => void;
}) {
  const error = ruleError(rule);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Select
        value={rule.mode}
        disabled={disabled}
        onValueChange={(mode) => onChange({ mode: mode as KpiRule["mode"], value: rule.value })}
      >
        <SelectTrigger id={`${id}-mode`} className="w-40" aria-label="Hisoblash usuli">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="FIXED">Qat&apos;iy summa</SelectItem>
          <SelectItem value="PERCENT">Foiz</SelectItem>
        </SelectContent>
      </Select>
      {rule.mode === "FIXED" ? (
        <PriceInput
          id={`${id}-value`}
          className="max-w-48"
          value={String(rule.value)}
          disabled={disabled}
          onChange={(e) => onChange({ ...rule, value: Number(e.target.value || 0) })}
        />
      ) : (
        <div className="flex items-center gap-1">
          <Input
            id={`${id}-value`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className="max-w-24"
            value={rule.value}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange({ ...rule, value: n });
            }}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      )}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Tekshiruv va commit**

```bash
cd client
npx vitest run src/lib/settings-nav.test.ts
npx eslint src/components/settings/kpi-settings-client.tsx "src/app/(dashboard)/settings/kpi/page.tsx" src/lib/settings-nav.ts src/lib/breadcrumb-routes.ts
npx tsc --noEmit -p .
cd ..
git add client/src
git commit -m "feat(kpi): KPI settings page for the CEO (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: lint va tsc xatosiz.

---

### Task 16: «Xodimlar KPI» sahifasi — kartalar, «Diqqat», jadval

**Files:**
- Create: `client/src/app/(dashboard)/reports/xodimlar-kpi/page.tsx`
- Create: `client/src/components/reports/admin-kpi/kpi-overview-page.tsx`, `kpi-summary-cards.tsx`, `kpi-attention.tsx`, `kpi-admin-table.tsx`
- Modify: `client/src/lib/reports-nav.ts` (+ `reports-nav.test.ts`), `client/src/lib/nav-items.ts` (+ `nav-items.test.ts`), `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: `useKpiOverview`, `kpiMonth`, `kpiCompare`, `KPI_FIRST_MONTH`, `COMPARE_FLOOR_MONTH`, `switchText`, `ratioText`, `KPI_DEFINITIONS`, `TrendLine`, `TrendMark` (Task 14).
- Produces: `KpiOverviewPage` (URL `oy`, `bilan`, `xodim`), `KpiSummaryCards({ data, isCurrent })`, `KpiAttention({ signals, onOpen })`, `KpiAdminTable({ rows, onOpen })`. Task 17 bu sahifaga `KpiDailyChart`, `KpiMonthsChart` va `KpiUserDrawer` ni qo'shadi.

- [ ] **Step 0: Menyu (avval yiqiladigan testlar)**

`client/src/lib/reports-nav.test.ts` oxiriga:

```ts
describe("Xodimlar KPI — kpi.view (ADR-0095)", () => {
  it("CEO va filial direktori ochadi; administrator, o'qituvchi va kassir ochmaydi", () => {
    for (const role of [1, 2]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/xodimlar-kpi", [role])).toBe(true);
    }
    for (const role of [3, 4, 5]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/xodimlar-kpi", [role])).toBe(false);
    }
    expect(routeLabels["xodimlar-kpi"]).toBe("Xodimlar KPI");
  });
});
```

`client/src/lib/nav-items.test.ts` oxiriga:

```ts
describe("navItems — «Hisobotlar»", () => {
  it("opens for kpi.view too, so a role given only the KPI page still reaches it (ADR-0095)", () => {
    expect(navItems.find((item) => item.url === "/reports")?.permission).toEqual([
      "reports.finance",
      "reports.payments",
      "reports.students",
      "reports.leads",
      "kpi.view",
    ]);
  });
});
```

Run: `cd client && npx vitest run src/lib/reports-nav.test.ts src/lib/nav-items.test.ts` — FAIL.

`client/src/lib/reports-nav.ts`: `lucide-react` importiga `Trophy`; «Marketing va faoliyat» bo'limida «Lidlar hisoboti» dan keyin:

```ts
      // «Xodimlar KPI» (ADR-0095): the managers' observation page.
      { title: "Xodimlar KPI", url: "/reports/xodimlar-kpi", icon: Trophy, permission: "kpi.view" },
```

`client/src/lib/nav-items.ts` «Hisobotlar» yozuvida `permission: ["reports.finance", "reports.payments", "reports.students", "reports.leads"]` → `permission: ["reports.finance", "reports.payments", "reports.students", "reports.leads", "kpi.view"]`.

`client/src/lib/breadcrumb-routes.ts` ga `"dars-baholari"` dan keyin: `"xodimlar-kpi": "Xodimlar KPI",`.

Run: `cd client && npx vitest run src/lib/reports-nav.test.ts src/lib/nav-items.test.ts` — PASS.

- [ ] **Step 1: Yo'l**

`client/src/app/(dashboard)/reports/xodimlar-kpi/page.tsx`:

```tsx
import { Suspense } from "react";
import { KpiOverviewPage } from "@/components/reports/admin-kpi/kpi-overview-page";

export default function AdminKpiPage() {
  // The month, the compare month and the open person live in the URL (useSearchParams).
  return (
    <Suspense fallback={null}>
      <KpiOverviewPage />
    </Suspense>
  );
}
```

- [ ] **Step 2: Kartalar**

`client/src/components/reports/admin-kpi/kpi-summary-cards.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format-utils";
import { TrendLine } from "./kpi-trend";
import type { KpiOverview } from "./kpi-types";

function StatCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The cards of spec §7.7, each with its ▲/▼; the forecast only in the current month. */
export function KpiSummaryCards({ data, isCurrent }: { data: KpiOverview; isCurrent: boolean }) {
  const c = data.cards;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Natijalar">
        <p className="text-2xl font-semibold tabular-nums">{formatNumber(c.results.value)}</p>
        <TrendLine value={c.results.value} compare={c.results.compare} unit="count" />
      </StatCard>
      <StatCard title="Berilganda bo'lardi">
        <p className="text-2xl font-semibold tabular-nums">{formatPrice(c.amount.value)} so&apos;m</p>
        <TrendLine value={c.amount.value} compare={c.amount.compare} unit="som" />
      </StatCard>
      <StatCard title="Lid → to'lov">
        <p className="text-2xl font-semibold tabular-nums">{formatPercent(c.leadToPaid.value)}</p>
        {c.leadToPaid.value !== null && c.leadToPaid.compare !== null ? (
          <TrendLine value={c.leadToPaid.value} compare={c.leadToPaid.compare} unit="pct" />
        ) : (
          <p className="text-xs text-muted-foreground">joriy oyda hali to&apos;lamaganlar ham hisobda</p>
        )}
      </StatCard>
      {isCurrent && (
        <StatCard title="Oy oxiriga taxmin">
          <p className="text-2xl font-semibold tabular-nums">
            {c.forecast === null ? "—" : `≈ ${formatNumber(c.forecast)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {c.forecast === null ? "oyning 3-ish kunidan ko'rinadi" : "natija, shu sur'at saqlansa"}
          </p>
        </StatCard>
      )}
    </div>
  );
}
```

- [ ] **Step 3: «Diqqat»**

`client/src/components/reports/admin-kpi/kpi-attention.tsx`:

```tsx
"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiSignal } from "./kpi-types";

/** «Diqqat» (spec §7.9): the server's signals, numbers included; a click opens the person. */
export function KpiAttention({ signals, onOpen }: { signals: KpiSignal[]; onOpen: (userId: number) => void }) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">Diqqat</h3>
      {signals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Bu oyda e&apos;tibor talab qiladigan holat yo&apos;q</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((s, i) => (
            <li key={`${s.kind}-${s.userId}-${i}`}>
              <button
                type="button"
                onClick={() => onOpen(s.userId)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border border-l-4 p-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  s.tone === "bad" ? "border-l-destructive" : "border-l-green-600",
                )}
              >
                {s.tone === "bad" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : (
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-green-600" />
                )}
                <span>{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Jadval**

`client/src/components/reports/admin-kpi/kpi-admin-table.tsx`:

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { ratioText } from "./kpi-format";
import { TrendMark } from "./kpi-trend";
import type { KpiAdminRow } from "./kpi-types";

function CountCell({ count, amount, compare }: { count: number; amount: number; compare: number }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatNumber(count)} · {formatPrice(amount)} so&apos;m
      <TrendMark value={count} compare={compare} />
    </span>
  );
}

/** Every administrator of the month (spec §7.7). Not paginated: the team at a glance, like the payroll table. */
export function KpiAdminTable({ rows, onOpen }: { rows: KpiAdminRow[]; onOpen: (userId: number) => void }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Bu oyda natija ham, band lid ham yo&apos;q — boshqa oyni tanlab ko&apos;ring
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Xodim</TableHead>
          <TableHead>Lid to&apos;lov qildi</TableHead>
          <TableHead>Va&apos;da bajarildi</TableHead>
          <TableHead>Lid → to&apos;lov</TableHead>
          <TableHead>Va&apos;da bajarilishi</TableHead>
          <TableHead>Qaytgan lidlar</TableHead>
          <TableHead className="text-right">Jami summa</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow
            key={r.userId}
            tabIndex={0}
            aria-label={`${r.name} — natijalarni ochish`}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpen(r.userId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(r.userId);
              }
            }}
          >
            <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <CountCell count={r.leadPaid.count} amount={r.leadPaid.amount} compare={r.leadPaid.compare} />
            </TableCell>
            <TableCell>
              <CountCell count={r.promiseKept.count} amount={r.promiseKept.amount} compare={r.promiseKept.compare} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {ratioText(r.leadToPaid.pct, r.leadToPaid.paid, r.leadToPaid.received)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {ratioText(r.promiseRate.pct, r.promiseRate.kept, r.promiseRate.closed)}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatNumber(r.expired.count)}
              <TrendMark value={r.expired.count} compare={r.expired.compare} higherIsBetter={false} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatPrice(r.total)} so&apos;m</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 5: Sahifa**

`client/src/components/reports/admin-kpi/kpi-overview-page.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/month-picker";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { KpiAdminTable } from "./kpi-admin-table";
import { KpiAttention } from "./kpi-attention";
import {
  COMPARE_FLOOR_MONTH,
  KPI_DEFINITIONS,
  KPI_FIRST_MONTH,
  kpiCompare,
  kpiMonth,
  switchText,
} from "./kpi-format";
import { useKpiOverview } from "./kpi-queries";
import { KpiSummaryCards } from "./kpi-summary-cards";

const FILTERS = {
  oy: { type: "string" as const, defaultValue: "" },
  bilan: { type: "string" as const, defaultValue: "" },
  xodim: { type: "number" as const, defaultValue: 0 },
};

/** «Xodimlar KPI» (spec §7.7). Every figure is the server's; the page only formats. `kpi.view`: CEO and Branch Director. */
export function KpiOverviewPage() {
  const { filters, setFilter, setFilters } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = kpiMonth(filters.oy, current);
  const compare = kpiCompare(filters.bilan, month, current);
  const q = useKpiOverview(month, compare);
  const open = (userId: number) => setFilter("xodim", userId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Xodimlar KPI</h2>
        <div className="flex flex-wrap items-center gap-3">
          <MonthStepper
            value={month}
            min={KPI_FIRST_MONTH}
            max={current}
            onChange={(m) => setFilters({ oy: m === current ? "" : m, bilan: "", xodim: 0 })}
          />
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Taqqoslash</Label>
            <MonthPicker
              value={compare}
              minMonth={COMPARE_FLOOR_MONTH}
              maxMonth={current}
              onChange={(m) => setFilter("bilan", m)}
              className="w-44"
            />
          </div>
        </div>
      </div>

      {q.isPending ? (
        <BlockSkeleton className="h-64" />
      ) : q.isError ? (
        <BlockError title="Xodimlar KPI" onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm">
            <span className={q.data.status.enabled ? undefined : "text-destructive"}>{switchText(q.data.status)}</span>
            <span className="text-muted-foreground">Kuzatuv: pul hali berilmaydi</span>
          </div>
          <KpiSummaryCards data={q.data} isCurrent={month === current} />
          <KpiAttention signals={q.data.signals} onOpen={open} />
          <section className="space-y-3">
            <h3 className="font-medium">Administratorlar</h3>
            <KpiAdminTable rows={q.data.rows} onOpen={open} />
            <dl className="space-y-1 text-xs text-muted-foreground">
              {KPI_DEFINITIONS.map((d) => (
                <div key={d.term}>
                  <dt className="inline font-medium text-foreground">{d.term}</dt> — <dd className="inline">{d.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Tekshiruv va commit**

```bash
cd client
npx vitest run src/lib/reports-nav.test.ts src/lib/nav-items.test.ts
npx eslint src/components/reports/admin-kpi "src/app/(dashboard)/reports/xodimlar-kpi/page.tsx" src/lib/reports-nav.ts src/lib/nav-items.ts src/lib/breadcrumb-routes.ts
npx tsc --noEmit -p .
cd ..
git add client/src
git commit -m "feat(kpi): the «Xodimlar KPI» page — cards, «Diqqat» and the admin table (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: lint va tsc xatosiz.

---

### Task 17: Diagrammalar va xodim oynasi (`?xodim=`)

**Files:**
- Create: `client/src/components/reports/admin-kpi/kpi-charts.tsx`, `kpi-user-panel.tsx`, `kpi-user-drawer.tsx`
- Modify: `client/src/components/reports/admin-kpi/kpi-overview-page.tsx`

**Interfaces:**
- Consumes: `useKpiUser`, `RESULT_TYPE_LABEL`, `dayText`, `KPI_FIRST_MONTH`, `TrendLine` (Task 14), `KpiOverviewPage` (Task 16).
- Produces: `KpiDailyChart({ data, month, compare })`, `KpiMonthsChart({ data })`, `KpiUserMonthsChart({ data })`, `KpiUserPanel({ userId, month, onMonthChange? })`, `KpiUserDrawer({ userId, name, month, onClose })`.

- [ ] **Step 1: Diagrammalar**

`client/src/components/reports/admin-kpi/kpi-charts.tsx`:

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { monthLabel, monthShort } from "@/components/payments/salary-utils";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import type { KpiOverview, KpiUserView } from "./kpi-types";

// Literal colours: SVG attributes ignore CSS variables (client/CLAUDE.md, charts).
const CURRENT = "#2563eb"; // blue-600
const COMPARE = "#94a3b8"; // slate-400
const LEAD = "#f59e0b"; // amber-500
const PROMISE = "#8b5cf6"; // violet-500
const GRID = "#e2e8f0";
const TICK = { fontSize: 11, fill: "#64748b" };

// Recharts injects its own loosely typed payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TooltipProps = { active?: boolean; payload?: ReadonlyArray<any> };

/** «Oy davomida»: cumulative results by day of month, the month and the compare month (spec §7.7). */
export function KpiDailyChart({ data, month, compare }: { data: KpiOverview["daily"]; month: string; compare: string }) {
  const isEmpty = data.every((d) => !d.current && !d.compare);
  return (
    <ChartCard
      title="Oy davomida"
      subtitle={`${monthLabel(month)} va ${monthLabel(compare)} — yig'ma natijalar soni, oy kuni bo'yicha`}
      isEmpty={isEmpty}
      emptyMessage="Ikki oyda ham natija yo'q — boshqa oyni tanlab ko'ring"
      bodyHeightClass="h-[260px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
          <XAxis dataKey="day" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={(p) => <DailyTooltip {...p} month={month} compare={compare} />} />
          <Line type="monotone" dataKey="compare" stroke={COMPARE} strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="current" stroke={CURRENT} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DailyTooltip({ active, payload, month, compare }: TooltipProps & { month: string; compare: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as { day: number; current: number | null; compare: number | null };
  return (
    <div className="min-w-[180px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{row.day}-kun</div>
      {[
        { label: monthLabel(month), value: row.current, color: CURRENT },
        { label: monthLabel(compare), value: row.compare, color: COMPARE },
      ]
        .filter((l) => l.value !== null)
        .map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="flex-1">{l.label}</span>
            <span className="font-semibold tabular-nums">{formatNumber(l.value ?? 0)}</span>
          </div>
        ))}
    </div>
  );
}

/** «Oylar bo'yicha»: the last six months from 2026-10, lead and promise parts stacked (spec §7.7). */
export function KpiMonthsChart({ data }: { data: KpiOverview["months"] }) {
  const rows = data.map((m) => ({ ...m, label: monthShort(m.month), _total: m.leadPaid + m.promiseKept }));
  return (
    <ChartCard
      title="Oylar bo'yicha"
      subtitle="Natijalar soni: lid va va'da qismlari"
      isEmpty={rows.every((r) => r._total === 0)}
      emptyMessage="Hali natija yo'q — birinchi to'lovdan keyin chiqadi"
      bodyHeightClass="h-[260px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
          <Tooltip cursor={{ fill: "rgba(100, 116, 139, 0.12)" }} content={(p) => <MonthsTooltip {...p} />} />
          <Bar dataKey="leadPaid" stackId="k" fill={LEAD} />
          <Bar dataKey="promiseKept" stackId="k" fill={PROMISE} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="_total"
              position="top"
              style={{ fill: "#64748b", fontSize: 11 }}
              formatter={(v: unknown) => (typeof v === "number" && v > 0 ? String(v) : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function MonthsTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as KpiOverview["months"][number];
  return (
    <div className="min-w-[200px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{monthLabel(row.month)}</div>
      {[
        { label: "Lid to'lov qildi", value: row.leadPaid, color: LEAD },
        { label: "Va'da bajarildi", value: row.promiseKept, color: PROMISE },
      ]
        .filter((l) => l.value > 0)
        .map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="flex-1">{l.label}</span>
            <span className="font-semibold tabular-nums">{formatNumber(l.value)}</span>
          </div>
        ))}
      <div className="mt-1 flex justify-between border-t pt-1">
        <span>Jami</span>
        <span className="font-semibold tabular-nums">
          {formatNumber(row.leadPaid + row.promiseKept)} · {formatPrice(row.amount)} so&apos;m
        </span>
      </div>
    </div>
  );
}

/** One person's last months (spec §7.8): the sum each month would have paid. */
export function KpiUserMonthsChart({ data }: { data: KpiUserView["months"] }) {
  const rows = data.map((m) => ({ ...m, label: monthShort(m.month) }));
  return (
    <ChartCard
      title="Oxirgi oylar"
      subtitle="Har oy berilganda bo'ladigan summa"
      isEmpty={rows.every((r) => r.amount === 0)}
      emptyMessage="Hali natija yo'q"
      bodyHeightClass="h-[180px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatPrice(v)} />
          <Tooltip content={(p) => <UserMonthsTooltip {...p} />} />
          <Line type="monotone" dataKey="amount" stroke={CURRENT} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function UserMonthsTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as KpiUserView["months"][number];
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{monthLabel(row.month)}</div>
      <div className="tabular-nums">
        {formatNumber(row.count)} ta natija · {formatPrice(row.amount)} so&apos;m
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Xodim paneli va oynasi**

`client/src/components/reports/admin-kpi/kpi-user-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError } from "@/components/payments/overview/block-state";
import { currentMonthKey, monthLabel } from "@/components/payments/salary-utils";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { KpiUserMonthsChart } from "./kpi-charts";
import { KPI_FIRST_MONTH, RESULT_TYPE_LABEL, dayText } from "./kpi-format";
import { useKpiUser } from "./kpi-queries";
import { TrendLine } from "./kpi-trend";

/**
 * One person's month (spec §7.8): the sum, the last months and every result
 * with how it was counted. Shared by the page's drawer and the employee
 * «KPI» tab; callers key it by person and month, which resets the page.
 */
export function KpiUserPanel({
  userId,
  month,
  onMonthChange,
}: {
  userId: number;
  month: string;
  onMonthChange?: (month: string) => void;
}) {
  const q = useKpiUser(userId, month);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const stepper = onMonthChange ? (
    <MonthStepper value={month} min={KPI_FIRST_MONTH} max={currentMonthKey()} onChange={onMonthChange} />
  ) : null;

  if (q.isPending) {
    return (
      <div className="space-y-4">
        {stepper}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="space-y-4">
        {stepper}
        <BlockError title="KPI" onRetry={() => q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const rows = d.results.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="space-y-6">
      {stepper}
      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{monthLabel(d.month)} KPI</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">{formatPrice(d.total)} so&apos;m</p>
        <TrendLine value={d.total} compare={d.compareTotal} unit="som" suffix=" — o'tgan oyga nisbatan" />
        <p className="mt-1 text-xs text-muted-foreground">Oylikka qo&apos;shilmaydi — kuzatuv</p>
      </div>

      <KpiUserMonthsChart data={d.months} />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Natijalar</h3>
        {d.results.length === 0 ? (
          <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">
            Bu oyda natija yo&apos;q — boshqa oyni tanlab ko&apos;ring
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Natija</TableHead>
                  <TableHead>Qanday hisoblandi</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const cancelled = r.status === "CANCELLED";
                  return (
                    <TableRow key={r.id} className={cn(cancelled && "text-muted-foreground")}>
                      <TableCell className="border-r text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell className="whitespace-nowrap">{dayText(r.occurredAt)}</TableCell>
                      <TableCell>
                        <div className={cn(cancelled && "line-through")}>{RESULT_TYPE_LABEL[r.type]}</div>
                        <Link href={`/students/profile/${r.studentId}`} className="text-xs hover:underline">
                          {r.studentName}
                        </Link>
                        {cancelled && (
                          <div className="text-xs text-destructive">
                            {r.cancelReason}
                            {r.cancelledAt ? ` · ${dayText(r.cancelledAt)}` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={cn(cancelled && "line-through")}>{r.explanation}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", cancelled && "line-through")}>
                        {formatPrice(r.amount)} so&apos;m
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={d.results.length}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
```

`client/src/components/reports/admin-kpi/kpi-user-drawer.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { monthLabel } from "@/components/payments/salary-utils";
import { KpiUserPanel } from "./kpi-user-panel";

/** Row click on «Xodimlar KPI» (spec §7.7): the person's results of the page's month. Closing deletes `?xodim=`. */
export function KpiUserDrawer({
  userId,
  name,
  month,
  onClose,
}: {
  userId: number | null;
  name: string | undefined;
  month: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the title clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">{name ?? "Xodim natijalari"}</SheetTitle>
            <SheetDescription>{monthLabel(month)} natijalari</SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {userId !== null && <KpiUserPanel key={`${userId}-${month}`} userId={userId} month={month} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Sahifaga ulash**

`kpi-overview-page.tsx`:
1. Importlar: `import { KpiDailyChart, KpiMonthsChart } from "./kpi-charts";` va `import { KpiUserDrawer } from "./kpi-user-drawer";`.
2. `const open = …` dan keyin:

```tsx
  const openUser = filters.xodim || null;
  const openName = q.data?.rows.find((r) => r.userId === openUser)?.name;
```

3. `<KpiAttention … />` dan keyin:

```tsx
          <div className="grid gap-4 lg:grid-cols-2">
            <KpiDailyChart data={q.data.daily} month={q.data.month} compare={q.data.compare} />
            <KpiMonthsChart data={q.data.months} />
          </div>
```

4. Eng tashqi `<div className="space-y-6">` yopilishidan oldin:

```tsx
      <KpiUserDrawer userId={openUser} name={openName} month={month} onClose={() => setFilter("xodim", 0)} />
```

- [ ] **Step 4: Tekshiruv va commit**

```bash
cd client
npx eslint src/components/reports/admin-kpi
npx tsc --noEmit -p .
npx vitest run src/components/reports/admin-kpi
cd ..
git add client/src/components/reports/admin-kpi
git commit -m "feat(kpi): month and six-month charts, the person drawer (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: hammasi xatosiz.

---

### Task 18: Xodim sahifasidagi «KPI» yorlig'i

**Files:**
- Create: `client/src/components/reports/admin-kpi/employee-kpi-tab.tsx`
- Modify: `client/src/components/settings/employee-profile-client.tsx`
- Modify: `client/src/components/settings/employee-profile-tabs.tsx`

**Interfaces:**
- Consumes: `KpiUserPanel` (Task 17), `kpiMonth` (Task 14).
- Produces: `/settings/employees/[id]?tab=kpi` (oy — `?kpi_oy=`), `EmployeeProfileTabs` ga `showKpi?: boolean` prop.

**Qaror (spec §7.8 «Administrator roli bor yoki KPI natijasi bor xodimda»):** sahifa ochilganda `/kpi/users/:id` ga oldindan so'rov yuborilmaydi. Yorliq faqat xodimda **hozir** Administrator roli bo'lsa va ko'ruvchida `kpi.view` bo'lsa chiqadi; ma'lumot yorliq ochilganda yuklanadi (Radix faqat faol yorliqni chizadi). Endi administrator bo'lmagan sobiq administratorning natijalari «Xodimlar KPI» sahifasida qoladi (jadval oyda natijasi bor har xodimni ko'rsatadi, qator bosilsa — `?xodim=` oynasi). Rol ro'yxati serverdan keladi, client hisoblamaydi.

- [ ] **Step 1: Yorliq komponenti**

`client/src/components/reports/admin-kpi/employee-kpi-tab.tsx`:

```tsx
"use client";

import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { kpiMonth } from "./kpi-format";
import { KpiUserPanel } from "./kpi-user-panel";

const FILTERS = { kpi_oy: { type: "string" as const, defaultValue: "" } };

/** The employee page's «KPI» tab (spec §7.8). The month is `?kpi_oy=` (a page-level `?tab=` already exists). */
export function EmployeeKpiTab({ userId }: { userId: number }) {
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = kpiMonth(filters.kpi_oy, current);
  return (
    <KpiUserPanel
      key={month}
      userId={userId}
      month={month}
      onMonthChange={(m) => setFilter("kpi_oy", m === current ? "" : m)}
    />
  );
}
```

- [ ] **Step 2: Profil sahifasi**

`employee-profile-client.tsx`:
1. `const canManageEmployees = useCan("employees.manage");` dan keyin:

```tsx
  const canSeeKpi = useCan("kpi.view");
```

2. `const isTeacher = …` dan keyin:

```tsx
  // Spec §7.8: the «KPI» tab of a current Administrator, for `kpi.view`. No request
  // on page load — the tab loads its month when opened. A former administrator's
  // results stay on «Xodimlar KPI».
  const hasKpiTab = canSeeKpi && (employee?.roles.some((r) => r.id === 3) ?? false);
```

3. `availableTabs` oxiriga: `...(hasKpiTab ? ["kpi"] : []),`.
4. Ikkala `<EmployeeProfileTabs … />` chaqiruviga: `showKpi={hasKpiTab}`.

- [ ] **Step 3: Yorliqlar**

`employee-profile-tabs.tsx`:
1. Import: `import { EmployeeKpiTab } from "@/components/reports/admin-kpi/employee-kpi-tab";`.
2. `EmployeeProfileTabsProps` ga:

```tsx
  /** «KPI» (spec §7.8): decided by the parent, which also lists it in its available tabs. */
  showKpi?: boolean;
```

va destrukturlashga `showKpi = false,`.
3. `TabsList` ichida «Ish haqi» trigger'idan keyin:

```tsx
        {showKpi && <TabsTrigger value="kpi">KPI</TabsTrigger>}
```

4. Oxirgi `TabsContent` dan keyin (Radix faqat faol yorliqni chizadi — so'rov yorliq ochilganda ketadi):

```tsx
      {/* KPI — CEO va filial direktori (`kpi.view`), hozirgi administratorda */}
      {showKpi && (
        <TabsContent value="kpi">
          <EmployeeKpiTab userId={employee.id} />
        </TabsContent>
      )}
```

- [ ] **Step 4: Tekshiruv va commit**

```bash
cd client
npx eslint src/components/settings/employee-profile-client.tsx src/components/settings/employee-profile-tabs.tsx src/components/reports/admin-kpi/employee-kpi-tab.tsx
npx tsc --noEmit -p .
cd ..
git add client/src/components
git commit -m "feat(kpi): the employee page's «KPI» tab (ADR-0095)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: xatosiz.

---

### Task 19: Hujjatlar — ADR-0095, CLAUDE.md, qo'llanma

**Files:**
- Create: `docs/adr/0095-kpi-natijasi.md`; Modify: `docs/adr/README.md`
- Modify: `server/CLAUDE.md`, `client/CLAUDE.md`
- Create: `client/src/qollanma/kontent/hisobotlar/xodimlar-kpi.mdx`
- Modify: `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR-0095**

`docs/adr/0095-kpi-natijasi.md`:

```markdown
# ADR-0095: KPI natijasi — administratorga, bir marta, summa muhrlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** spec `docs/superpowers/specs/2026-10-16-admin-kpi-design.md` §7, ADR-0093, ADR-0072, ADR-0088, ADR-0079, ADR-0087

## Kontekst

1-bosqich (ADR-0093) har lidga bitta egani berdi. 2-bosqich natijalarni yozishi va bir oy pulsiz kuzatishi kerak: kim qancha natija qilgani, o'sish va kamayish. 16.09–15.10.2026 da 150 va'dadan 34 tasi bajarilgan, 10 tasida to'lovni boshqa admin kiritgan — va'da KPI'si to'lovni kiritganga emas, va'dani yozganga borishi kerak.

## Qaror

1. Natija `KpiResult` jadvaliga yoziladi, faqat `KpiResultsService` orqali. Ikki tur: `LEAD_PAID` — lid egasiga, aylanishdan keyingi birinchi `COMPLETED` to'lovda; `PROMISE_KEPT` — va'da `createdById` ga, va'dani `KEPT` qilgan to'lovda (`PaymentPromise.resolvedPaymentId`, to'lov tranzaksiyasida yoziladi).
2. Natija paytida Administrator roli bor va CEO hamda Filial direktori rollari yo'q xodimga yoziladi; rollar bazadan o'qiladi.
3. `Lead.conversionKind`: `NEW_STUDENT` va `RETURNING` (bog'lash paytida o'qimayotgan eski o'quvchi) hisoblanadi; `ALREADY_STUDYING` — yo'q.
4. Narx har tur uchun `FIXED` yoki `PERCENT` (Sozlamalar, faqat CEO). Summa yozilganda muhrlanadi (`ruleMode`, `ruleValue`, `baseAmount`, `amount`).
5. Bitta lidga, bitta to'lovga (LEAD_PAID) va bitta va'daga bitta faol natija — qisman unikal indekslar. To'lov bekor qilinsa natija `CANCELLED` va lid keyingi to'lovni oladi; summa tuzatilsa natija yangi to'lovga eski qoidasi bilan o'tadi.
6. Hisob 17.10.2026 00:00 (Toshkent) dan; natija oyi — to'lovning Toshkent oyi. Kalit o'chiq bo'lsa yangi natija yo'q va o'chiq davr keyin to'ldirilmaydi; bekor qilish ishlaydi.
7. Ko'radi: CEO va filial direktori (`kpi.view`). Administrator kuzatuvda ko'rmaydi.
8. Pul yo'q: oylik, kassa va foyda hisobotlari `KpiResult` ni o'qimaydi — bu 3-bosqich.

## Ko'rib chiqilgan muqobillar

- **Natijani har safar hisobotda hisoblash (saqlamaslik)** — narx o'zgarsa o'tgan oylar o'zgarardi, bekor qilish va tuzatishning izi qolmasdi; rad etildi.
- **Va'da KPI'sini to'lovni kiritganga berish** — 34 dan 10 holatda boshqa admin edi; rad etildi.
- **O'chiq davrni keyin to'ldirish** — CEO o'chirgan davr uchun talab paydo bo'lardi; rad etildi.

## Oqibatlari

- 3-bosqich oylikka faqat `ACTIVE` natijalarni oladi.
- Tungi tuzatish o'tkazib yuborilgan natijani joriy narxda yozadi.
- Kalit qayta yoqilsa, undan oldingi yoqilgan davrda o'tkazib yuborilgan natija tungi tuzatishda yozilmaydi (kalit oynasi oxirgi yoqilgan paytdan).
- Arxivdan tiklangan aylangan lid egasini va aylanish vaqtini saqlaydi.
- Tuzatishning qayta yozilishi muvaffaqiyatsiz bo'lsa (eski to'lov bekor qilindi, yangisi yozilmadi), natijalar «To'lov tuzatildi» bilan bekor holda qoladi. `LEAD_PAID` o'quvchining keyingi to'lovida yoki tungi tuzatishda qolgan eng birinchi to'lovga qayta tanlanadi; `PROMISE_KEPT` esa yo'qoladi — va'da bekor qilingan to'lovga bog'liq qoladi (ma'lum chegara).
- Backfill `KPI_START` va deploy orasida `KEPT` bo'lgan va'daning to'lovini `resolvedAt` gacha bo'lgan 60 soniya ichidagi o'quvchining eng so'nggi `COMPLETED` to'lovi deb tiklaydi; topilmasa — natija yo'q.
```

`docs/adr/README.md` jadvaliga 0093 qatoridan keyin:

```markdown
| [0095](0095-kpi-natijasi.md) | KPI natijasi: administratorga, bir marta, summa muhrlanadi | Qabul qilindi | 2026-10-16 |
```

(PR ochishdan oldin `main` ni tortib ADR raqami bandligini tekshiring; band bo'lsa `git mv` bilan qayta raqamlang.)

- [ ] **Step 2: CLAUDE.md**

`server/CLAUDE.md`:
- «The capability catalog is `common/permissions/permission-catalog.ts` — 69 capabilities in 14 sections» → «70 capabilities in 14 sections».
- «### Custom Form Submissions» bo'limidan oldin:

```markdown
### Admin KPI results (`src/kpi/`, ADR-0095)

- Stage 2 of the admin KPI: results are recorded, no money moves — no `Transaction`, `Expense`, `CashMovement` or payroll row; the salary, cash and profit reports do not read `KpiResult`. Spec `docs/superpowers/specs/2026-10-16-admin-kpi-design.md` §7.
- **One writer**: `KpiResult` rows are written only by `KpiResultsService` (`kpi-write.single-source.spec.ts`); the planning reads live in `kpi-results.plan.ts`, which writes nothing. `LEAD_PAID` — the converted lead's frozen owner (ADR-0093), on the student's first `COMPLETED` payment after `Lead.statusChangedAt` that no other lead holds, for `conversionKind` `NEW_STUDENT` or `RETURNING` (`ALREADY_STUDYING` earns nothing). `PROMISE_KEPT` — the promise's `createdById`, on the payment `settleKeptPromises` wrote into `PaymentPromise.resolvedPaymentId` in the same transaction; base `max(0, −balanceAtPromise)`.
- Counted from `KPI_START` (17.10.2026 00:00 Tashkent); the month is the Tashkent month of the payment's `createdAt`; the owner or writer must hold Administrator and neither CEO nor Branch Director when the result is written (`isKpiEligible`, roles read through `whereUserMayAct()`). The amount is sealed: `ruleMode`, `ruleValue`, `baseAmount`, `amount` (percent = `Math.round(base × value / 100)`).
- One ACTIVE result per lead and per payment (LEAD_PAID) and per promise: partial unique indexes in `20261016150000_kpi_results` (Prisma cannot express them); a concurrent second insert is `P2002` and is skipped.
- `Lead.conversionKind` is written by `LeadsService.convert` (link path: `activeStudentWhere()` at the link → `ALREADY_STUDYING`, else `RETURNING`; create path `NEW_STUDENT`) and by `StudentLeadOriginService` (`NEW_STUDENT`).
- Events: `KpiRecorderListener` — `payment.received` → `recordForPayment`; `payment.reversed` → `cancelForPayment` («To'lov bekor qilindi», then the lead takes its next earliest payment). A correction's reversal carries `correction: true` (`PaymentReversedPayload`): its results are cancelled «To'lov tuzatildi» and the re-post (`correctsPaymentId`) re-creates them under the sealed rule (`replacesResultId`; a percent LEAD_PAID is re-read from the new amount). Failures are logged; `KpiSelfHealCron` (03:30 Tashkent) cancels the results of payments that no longer stand and records the last two days' payments again. All of it is idempotent.
- Switch `kpi.enabled` (company-level, CEO): off = no new result; a result is written only for a payment made since the switch last came on (`recordingSince`: the switch row's `updatedAt` via `SettingsService.lastWrittenAt`, written only on a flip). Prices are saved through `SettingsService.setMany` — a rule's mode and value in one transaction. An off period is never filled in. Cancelling works while off, and so does a correction's move (a moved result is not a new one).
- Routes (`KpiController`): `GET /kpi/overview?month&compare`, `GET /kpi/users/:id?month`, `GET /kpi/settings` (`kpi.view`: CEO + Branch Director, allowed to the Director only; the first two take `@BranchScope()`, an empty scope is 403), `PATCH /kpi/settings` (`@CeoOnly()`). The «Diqqat» signals and the month-end forecast are the pure `kpiSignals` / `monthEndForecast` (`kpi-signals.ts`); the page figures are `assembleOverview` (`kpi-overview.math.ts`). In the current month every comparison stops at the same day of the compare month.
- The generic `/archive` restore brings a lead with `convertedStudentId` back CONVERTED, with its owner and its `statusChanged*` untouched, one lead and batch alike.
- One-time `scripts/kpi-backfill.ts` (dry run by default; `--apply --expect=<N>`) restores `conversionKind` through `enrollmentStatusOn` and the `resolvedPaymentId` of promises KEPT since `KPI_START` (the student's latest COMPLETED payment in the 60 s up to `resolvedAt`; both in `kpi-backfill-restore.ts`), then records every COMPLETED payment since `KPI_START` through the same service.
```

`client/CLAUDE.md` da «### Lead Forms and Their Responses» bo'limidan oldin:

```markdown
### Admin KPI (`/reports/xodimlar-kpi`, ADR-0095)

- «Xodimlar KPI» in «Marketing va faoliyat» (`reports-nav.ts`, `permission: "kpi.view"`: CEO and Branch Director). Files in `components/reports/admin-kpi/`: `kpi-overview-page.tsx`, `kpi-summary-cards.tsx`, `kpi-attention.tsx`, `kpi-charts.tsx`, `kpi-admin-table.tsx`, `kpi-user-drawer.tsx`, `kpi-user-panel.tsx` (shared by the drawer and the employee tab), `employee-kpi-tab.tsx`, `kpi-trend.tsx`, `kpi-queries.ts`, `kpi-types.ts`, `kpi-format.ts` (pure, vitest).
- URL: `oy` (empty = the current month, `MonthStepper` from 2026-10), `bilan` (empty = the month before), `xodim` (the open drawer); the employee tab's month is `kpi_oy`. Every figure, signal text and «Qanday hisoblandi» line is the server's; the client only formats and draws. The admin table is not paginated (the team at a glance); the results table of the drawer and the tab is (10–50).
- The employee page shows «KPI» (`?tab=kpi`) to `useCan("kpi.view")` only while the employee holds Administrator; nothing is fetched until the tab opens. A former administrator's results stay visible on «Xodimlar KPI». «Hisobotlar» in `nav-items.ts` opens for `kpi.view` too. Sozlamalar → «KPI sozlamalari» (`/settings/kpi`) is `ceoOnly`; it sends only what changed (`settingsPatch`), so the switch's time stays the flip.
```

- [ ] **Step 3: Qo'llanma**

`client/src/qollanma/sahifalar/hisobotlar.ts` ro'yxati oxiriga:

```ts
  {
    bolim: "hisobotlar",
    sahifa: "xodimlar-kpi",
    sarlavha: "Xodimlar KPI",
    qisqacha:
      "Administrator egasi bo'lgan lid birinchi to'lovni qilganda va u yozgan to'lov va'dasi bajarilganda natija yoziladi. CEO va filial direktori kim qancha natija qilganini, o'sish va kamayishni shu sahifada ko'radi. Hozir kuzatuv: pul berilmaydi.",
    rollar: [1, 2],
    adr: ["0095", "0093"],
    yollar: ["/reports/xodimlar-kpi", "/settings/kpi"],
    kalitSozlar: ["KPI", "xodim natijasi", "administrator", "lid to'lov qildi", "va'da bajarildi", "mukofot", "kuzatuv"],
    yangilangan: "2026-10-16",
  },
```

`client/src/qollanma/kontent/hisobotlar/xodimlar-kpi.mdx`:

```mdx
## Nima hisoblanadi

Ikki natija yoziladi:

- **Lid to'lov qildi** — lid egasi bo'lgan administratorga, lid o'quvchiga aylangandan keyingi birinchi to'lovda, bir marta.
- **Va'da bajarildi** — to'lov va'dasini yozgan administratorga, qarz va'da kunigacha yopilganda, har va'daga bir marta. To'lovni kim kiritgani ahamiyatsiz.

Natija faqat administratorga yoziladi: CEO, filial direktori va kassir natijasi yozilmaydi.

Eski o'quvchiga bog'langan lid: bog'lash paytida o'quvchi o'qimayotgan bo'lsa — hisoblanadi, o'qiyotgan bo'lsa — yo'q.

<Eslatma tur="malumot">
Hozir kuzatuv oyi: natijalar yoziladi, lekin oylikka qo'shilmaydi va pul berilmaydi.
</Eslatma>

## Narx

Har natija uchun qat'iy summa yoki foiz. Boshida «Lid to'lov qildi» — 50 000 so'm, «Va'da bajarildi» — 20 000 so'm. Foizda baza: lid uchun — birinchi to'lov summasi, va'da uchun — va'da paytidagi qarz. Summa natija yozilgan paytdagi narx bilan qoladi; narx o'zgarsa, faqat keyingi natijalarga ta'sir qiladi.

## Bekor qilish

- To'lov bekor qilinsa, unga bog'langan natija ham bekor bo'ladi; lid uchun keyingi to'lov natija bo'ladi.
- To'lov summasi tuzatilsa, natija yangi to'lovga o'tadi.
- Bekor qilingan natija summaga kirmaydi; xodim oynasida ustidan chizilgan holda, sababi bilan ko'rinadi.

## Sahifa

Hisobotlar → «Xodimlar KPI». Oy va taqqoslanadigan oy tanlanadi.

- **Kartalar** — natijalar soni, berilganda bo'ladigan summa, «Lid → to'lov» ulushi va joriy oyda oy oxiriga taxmin (oyning 3-ish kunidan).
- **Diqqat** — keskin o'sish yoki tushish, uzoq natijasiz turgan band lidlar, ko'p qaytgan lidlar, past va'da bajarilishi va eng yaxshi ulush; har biri raqami bilan.
- **Oy davomida** va **Oylar bo'yicha** — natijalar soni kunlar va oylar kesimida.
- **Jadval** — har administrator; qatorni bossangiz uning natijalari ochiladi.

Joriy oy taqqoslanayotgan oyning shu kunigacha bo'lgan qismi bilan solishtiriladi.

## Xodim sahifasi

Sozlamalar → Xodimlar → xodim → «KPI» yorlig'i: oy bo'yicha summa, oxirgi oylar chizig'i va har natija qanday hisoblangani.

## Kim ko'radi

CEO — hamma filialni, filial direktori — o'z filialini. Administrator kuzatuv paytida o'z KPI'sini ko'rmaydi.

## Sozlamalar

Sozlamalar → «KPI sozlamalari» (faqat CEO): hisoblash kaliti va ikki narx. Kalit o'chirilsa yangi natija yozilmaydi va o'chiq davr keyin to'ldirilmaydi.
```

`client/src/qollanma/yangiliklar.ts` ro'yxatining BOSHIGA:

```ts
  {
    sana: "2026-10-16",
    sarlavha: "Xodimlar KPI",
    matn: "Hisobotlarda «Xodimlar KPI» sahifasi qo'shildi. Administrator egasi bo'lgan lid birinchi to'lovni qilganda va u yozgan to'lov va'dasi bajarilganda natija yoziladi; summa o'sha paytdagi narx bilan muhrlanadi. Sahifada natijalar, berilganda bo'ladigan summa, «Lid → to'lov» ulushi, «Diqqat» bloki, kunlar va oylar bo'yicha diagrammalar va administratorlar jadvali bor; xodim sahifasida «KPI» yorlig'i chiqdi. Narxlar va hisoblash kaliti — Sozlamalar → «KPI sozlamalari» (faqat CEO). Hozir kuzatuv: pul berilmaydi.",
    rollar: [1, 2],
    sahifa: { bolim: "hisobotlar", sahifa: "xodimlar-kpi" },
  },
```

- [ ] **Step 4: Tekshiruv va commit**

```bash
cd client && npx vitest run src/qollanma
cd ..
git add docs client/src/qollanma server/CLAUDE.md client/CLAUDE.md
git commit -m "docs: ADR-0095 KPI results, CLAUDE.md and the user guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: qo'llanma testlari (`reyestr.test.ts` va boshqalar) PASS.

---

### Task 20: To'liq tekshiruv

- [ ] **Step 1: Server**

```bash
cd server
npm test
npm run typecheck
npx eslint src scripts/kpi-backfill.ts --quiet
npx prettier --check "src/**/*.ts" scripts/kpi-backfill.ts
npm run build
```

Expected: hammasi o'tadi. Yiqilgan testni tuzatib, faqat o'sha spec'ni qayta ishga tushiring; kod o'zgarmaguncha butun to'plam qayta ishga tushirilmaydi.

- [ ] **Step 2: Client**

```bash
cd client
npm test
npx tsc --noEmit -p .
npx eslint src --quiet
npm run build
```

Expected: o'tadi.

- [ ] **Step 3: Brauzerda tekshirish — vaqtinchalik bazada (controller bajaradi)**

Umumiy dev bazada mainning ko'p migratsiyasi yo'q — brauzer tekshiruvi vaqtinchalik bazada (xotira: `reference_throwaway_local_db.md`):
1. `docker exec daf-postgres createdb -U daf_user <nom>`; URL `127.0.0.1:5433`, parol `docker exec daf-postgres printenv POSTGRES_PASSWORD` dan (ekranga chiqarilmaydi).
2. `migrate deploy` ikki joyda to'xtaydi: `20260805120000_branch_tenancy_leads_holidays_mock` oldidan `Company` 1001, `20260806120000_drop_company_defaults_and_branch_sequence` oldidan `Branch` 1 (`companyId` 1001) qo'shiladi; har biridan keyin `migrate resolve --rolled-back <nom>` va qayta `deploy`. Shu jumladan `20261016150000_kpi_results`.
3. Seed: `server/.env` symlinkini vaqtincha `server/.env.aside` ga o'tkazib, aniq `DATABASE_URL` bilan `npx ts-node --transpile-only prisma/seed.ts`; keyin symlinkni qaytarish.
4. Backend: `PORT=4300 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN=`, o'z Redis'i (`redis:7-alpine` konteyner), vaqtinchalik `DATABASE_URL`. Client 3001-portda, 4300 ga CORS proksi orqali.
5. **Sana:** natijalar `KPI_START` (17.10.2026 00:00 Toshkent) dan keyingi to'lovlarga yoziladi. Tekshiruv undan oldin bo'lsa, vaqtinchalik bazada SQL bilan tegishli `Lead.statusChangedAt` va `Payment.createdAt` ni 17.10 dan keyinga surib, `npx ts-node --transpile-only scripts/kpi-backfill.ts` (quruq) → `--apply --expect=<N>` bilan yozing.

Tekshiriladi (har qadamda ekran va konsol xatolari):
1. Administrator lidni band qiladi → CEO lidni yangi o'quvchiga aylantiradi → to'lov kiritiladi → «Xodimlar KPI» da administrator qatori «Lid to'lov qildi 1 · 50 000 so'm», kartalar va «Oy davomida» yangilanadi.
2. Qisman to'lov va'da bilan → keyingi to'lov qarzni yopadi → «Va'da bajarildi» va'dani yozgan administratorga.
3. To'lov summasi tuzatiladi → oynada eski natija ustidan chizilgan «To'lov tuzatildi», yangi to'lovda yangi natija; CEO to'lovni bekor qiladi → natija «To'lov bekor qilindi».
4. Qator bosiladi → oyna (`?xodim=`), «Qanday hisoblandi»; Sozlamalar → «KPI sozlamalari» — foizga o'tkazish, saqlash, kalitni o'chirish («KPI hisoblash o'chiq (dd.mm dan)»), o'chiq paytdagi to'lov natija bermaydi.
5. Xodim sahifasi → «KPI» yorlig'i (`?tab=kpi`, `?kpi_oy=`).
6. Filial direktori — faqat o'z filiali; administrator — sahifa menyuda yo'q va URL bilan ochilmaydi (bosh sahifaga qaytaradi).
7. Umumiy `/archive` dan aylangan lidni tiklash → `CONVERTED` va egasi bilan qaytadi.

Keyin vaqtinchalik baza `dropdb`, Redis konteyner `docker rm -f`.

- [ ] **Step 4: Natija**

Hamma qadam o'tsa, shox tayyor. PR ochish va saytga chiqarish — foydalanuvchi aytganda; saytga chiqqandan keyin bir marta `scripts/kpi-backfill.ts` (avval quruq, keyin `--apply --expect=<N>`).

---

## Spec qamrovi (o'z-o'zini tekshirish)

| Spec | Task |
| --- | --- |
| §7.1/1 faqat administrator, natija paytidagi rollar | 2 (`isKpiEligible`), 6 (`eligibility`) |
| §7.1/2, §7.4 narx, foiz bazasi, sozlamalar, kalit vaqti, `@CeoOnly()` | 2, 11, 15 |
| §7.1/3, §7.2 `conversionKind` | 1, 4, 12 (backfill) |
| §7.1/4, §7.10 ko'rish, `kpi.view`, `@BranchScope()`, yo'llar | 3, 10, 11, 14 |
| §7.1/5 darhol yoziladi, summa muhrlanadi | 6, 7 |
| §7.1/6, §7.8 xodim «KPI» yorlig'i, serverdan izoh | 10, 17, 18 |
| §7.1/7 kalit (faqat CEO) | 2, 11, 15 |
| §7.1/8, §7.9 «Diqqat», raqamli signallar, oy oxiri taxmini | 8, 9, 16 |
| §7.1/9 `KPI_START` | 2 |
| §7.2 `LEAD_PAID`, `PROMISE_KEPT`, `resolvedPaymentId`, natija oyi, kalit | 1, 5, 6 |
| §7.3 bekor qilish, qayta tanlash, tuzatish ko'chirishi | 5, 7 |
| §7.5 model, qisman unikal indekslar, yagona yozuvchi + spec testi | 1, 6 |
| §7.6 hodisalar, xato to'lovni to'xtatmaydi, 03:30, backfill | 7, 12 |
| §7.7 sahifa, kartalar, kalit qatori, diagrammalar, jadval (sahifalanmaydi), `?xodim=`, ta'riflar | 9, 10, 14, 16, 17 |
| §7.11 arxivdan tiklash tuzatishi | 13 |
| §7.12 bu bosqichga kirmaydi (pul yo'q, admin o'zini ko'rmaydi) | Global Constraints, 3, 14 |
| §7.13 ADR-0095 + hujjatlar | 19 |
