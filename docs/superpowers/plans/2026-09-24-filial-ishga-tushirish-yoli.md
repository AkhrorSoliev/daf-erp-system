# Filialni ishga tushirish yo'li — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yangi filial direktori bo'sh filialni hech kimdan so'ramasdan birinchi
to'lovgacha olib chiqsin — bosh sahifada 8 bekatli yo'l xaritasi, bekat bosilganda
kerakli sahifada kerakli tugmani yorituvchi tur, va direktor o'z filiali
ustozlariga stavka qo'ya oladigan bo'lsin.

**Architecture:** Server tomonida mavjud, lekin ishlatilmagan
`GET /branches/:id/readiness` kengayadi: faktlar `BranchesService` da yig'iladi,
ular tekshiruvga SOF `buildBranchReadiness` da aylanadi. Stavka yozish huquqi
SOF `teacherRateRefusal` qaroriga va uni chaqiradigan ikki yuklovchiga ajraladi;
`SalaryService` fasadi yozishdan oldin ularni chaqiradi. Klient tomonida karta
(`BranchLaunchCard`) va tur (`SpotlightHost` + `useSpotlight` store) — butun
mantiq vitest bilan sinaladigan sof funksiyalarda, komponentlar faqat chizadi.

**Tech Stack:** NestJS 11 + Prisma (jest, `ts-jest`), Next.js 16 App Router,
React 19, TanStack Query 5, zustand 5, shadcn/ui (Radix Popover), vitest
(`environment: "node"` — render testi yo'q).

**Spec:** [2026-09-24-filial-ishga-tushirish-yoli-design.md](../specs/2026-09-24-filial-ishga-tushirish-yoli-design.md)

## Global Constraints

- **Til:** foydalanuvchi matni, izohlar va commit xabarlari lotin o'zbekchada (kod identifikatorlari inglizcha).
- **Ish joyi:** `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/filial-ishga-tushirish`, shox `worktree-filial-ishga-tushirish` (`origin/main` 68f6f134 dan). Asosiy checkout'ga (`/Users/a1111/Desktop/daf-erp-system`) tegilmaydi.
- **Har commit** quyidagi qator bilan tugaydi: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Yangi npm bog'liqlik qo'shilmaydi** (spec Q5).
- **ADR-0012:** `DashboardSummaryService` ga tegilmaydi.
- **ADR-0003:** har route manifestda aniq bir marta; `server/src/common/auth/branch-route-policy.spec.ts` yashil.
- **Rol tekshiruvi:** klientda ID bilan (1 CEO, 2 Filial direktori, 3 Administrator, 4 Ustoz, 5 Kassir), serverda nom bilan (`'CEO'`, `'Branch Director'`, `'Teacher'`).
- **vitest `environment: "node"`** — jsdom yo'q; mantiq sof funksiyada, test fayllari `src/**/*.test.ts`.
- **ADR raqami:** 0026 (`origin/main` da 0025 gacha band). Birlashtirishdan oldin `git fetch && git ls-tree --name-only origin/main docs/adr/` bilan qayta tekshiriladi.
- **Buyruqlar:** server testi `cd server && npx jest <yo'l>`, server tipi `cd server && npm run typecheck`; klient testi `cd client && npx vitest run <yo'l>`, klient tipi `cd client && npm run typecheck`, lint `cd client && npm run lint`.

---

## Fayl tuzilishi

**Yangi (server):**

| Fayl | Vazifa |
|---|---|
| `server/src/branches/branch-readiness.ts` | SOF: faktlar → tekshiruvlar, `ready`, `launched` |
| `server/src/branches/branch-readiness.spec.ts` | uning testi |
| `server/src/salary/shared/teacher-rate-permission.ts` | SOF qaror `teacherRateRefusal` + ikki yuklovchi |
| `server/src/salary/shared/teacher-rate-permission.spec.ts` | uning testi |
| `server/src/salary/salary.service.rate-gate.spec.ts` | fasad darvozasi testi |
| `docs/adr/0026-direktor-oz-filiali-ustozlariga-stavka-qoyadi.md` | ADR |

**O'zgaradi (server):**

| Fayl | O'zgarish |
|---|---|
| `server/src/branches/branches.service.ts` | `getReadiness` yangi faktlarni yig'ib `buildBranchReadiness` ga beradi |
| `server/src/branches/branches.service.spec.ts` | readiness testlari yangi so'rovlarga moslanadi |
| `server/src/salary/salary-config.service.ts` | `assertCallerMayCreateRate`, `assertCallerMayUpdateRate` |
| `server/src/salary/salary.service.ts` | `createConfig`/`updateConfig` yozishdan oldin darvozadan o'tadi |
| `server/src/salary/salary.controller.ts` | ikki endpoint `@Roles('CEO', 'Branch Director')` |
| `server/src/salary/salary.controller.spec.ts` | rol metama'lumoti testi |
| `server/src/common/auth/branch-route-policy.ts` | ikki route `BRANCH_SCOPED_BY_ENTITY` ga |
| `docs/adr/README.md`, `docs/role-access.md`, `server/CLAUDE.md` | hujjat |

**Yangi (klient, `client/src/`):**

| Fayl | Vazifa |
|---|---|
| `components/dashboard/launch/launch-types.ts` | server javobining tiplari |
| `components/dashboard/launch/launch-stations.ts` | 8 bekat + 3 qo'shimcha: nom, tur matni, sahifa, `data-tour` |
| `components/dashboard/launch/resolve-launch-journey.ts` (+ `.test.ts`) | SOF: tekshiruvlar → xarita |
| `components/dashboard/launch/resolve-launch-visibility.ts` (+ `.test.ts`) | SOF: karta holati |
| `components/dashboard/launch/launch-storage.ts` (+ `.test.ts`) | `localStorage` belgilari |
| `components/dashboard/launch/launch-targets.test.ts` | har tur nishoni manbada borligi |
| `components/dashboard/launch/branch-launch-card.tsx` | karta |
| `hooks/use-branch-readiness.ts` | React Query |
| `hooks/use-spotlight.ts` | tur store'i |
| `components/spotlight/spotlight-target.ts` (+ `.test.ts`) | SOF: selektor, nomzod, quti |
| `components/spotlight/spotlight-host.tsx` | tur chizuvchisi |
| `components/payments/salary-settings-access.ts` (+ `.test.ts`) | SOF: oylik sozlamalari huquqi |
| `components/groups/group-form-empty-hints.ts` (+ `.test.ts`) | SOF: bo'sh ro'yxat izohlari |
| `components/groups/select-empty-state.tsx` | bo'sh ro'yxat qutisi |

**O'zgaradi (klient):** `components/dashboard-client.tsx`, `app/(dashboard)/layout.tsx`,
10 ta tugma fayli (8-vazifa), `components/payments/salary-client.tsx`,
`salary-monthly-view.tsx`, `salary-settings-sheet.tsx`, `salary-config-row-sheet.tsx`,
`components/groups/group-course-select.tsx`, `group-room-select.tsx`,
`group-teacher-select.tsx`, `edit-group-form.tsx`, `client/CLAUDE.md`.

---

### Task 1: Server — SOF readiness quruvchisi

**Files:**
- Create: `server/src/branches/branch-readiness.ts`
- Test: `server/src/branches/branch-readiness.spec.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type ReadinessKey = 'cashAccount' | 'bankAccount' | 'workingHours' | 'room' | 'course' | 'teachers' | 'teacherRates' | 'group' | 'enrollment' | 'payment' | 'administrator' | 'leadSection' | 'telegramGroup'`
  - `interface ReadinessCheck { key: ReadinessKey; label: string; ok: boolean; required: boolean; hint: string; details?: { id: number; name: string }[] }`
  - `interface BranchReadiness { branchId: number; branchName: string; ready: boolean; launched: boolean; checks: ReadinessCheck[] }`
  - `interface ReadinessFacts { branchId: number; branchName: string; hasCash: boolean; hasBank: boolean; hasWorkingHours: boolean; roomCount: number; courseCount: number; adminCount: number; teachers: { id: number; name: string; hasRate: boolean }[]; groupCount: number; hasRunnableGroup: boolean; hasStudent: boolean; hasEnrollment: boolean; hasPayment: boolean; hasLeadSection: boolean; hasTelegramGroup: boolean }`
  - `function buildBranchReadiness(f: ReadinessFacts): BranchReadiness`

- [ ] **Step 1: Failing testni yozing**

`server/src/branches/branch-readiness.spec.ts`:

```ts
import { buildBranchReadiness, ReadinessFacts } from './branch-readiness';

const launchedFacts: ReadinessFacts = {
  branchId: 2,
  branchName: 'Namangan',
  hasCash: true,
  hasBank: true,
  hasWorkingHours: true,
  roomCount: 1,
  courseCount: 1,
  adminCount: 1,
  teachers: [{ id: 90020, name: 'Ali Valiyev', hasRate: true }],
  groupCount: 1,
  hasRunnableGroup: true,
  hasStudent: true,
  hasEnrollment: true,
  hasPayment: true,
  hasLeadSection: true,
  hasTelegramGroup: true,
};

const facts = (over: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  ...launchedFacts,
  ...over,
});

const check = (f: ReadinessFacts, key: string) =>
  buildBranchReadiness(f).checks.find((c) => c.key === key)!;

describe('buildBranchReadiness', () => {
  it('lists every check in a fixed order', () => {
    expect(buildBranchReadiness(facts()).checks.map((c) => c.key)).toEqual([
      'cashAccount',
      'bankAccount',
      'workingHours',
      'room',
      'course',
      'teachers',
      'teacherRates',
      'group',
      'enrollment',
      'payment',
      'administrator',
      'leadSection',
      'telegramGroup',
    ]);
  });

  it('is ready and launched when everything is in place', () => {
    const r = buildBranchReadiness(facts());
    expect(r).toMatchObject({
      branchId: 2,
      branchName: 'Namangan',
      ready: true,
      launched: true,
    });
  });

  it('does NOT pass teacherRates for a branch with no teachers', () => {
    // Bo'sh ro'yxat ilgari `every` bilan `ok: true` berardi — ustozsiz
    // filial «stavkalar joyida» deb chiqardi.
    const f = facts({ teachers: [] });
    expect(check(f, 'teachers').ok).toBe(false);
    expect(check(f, 'teacherRates').ok).toBe(false);
    expect(check(f, 'teacherRates').hint).toBe("Avval ustoz qo'shing");
  });

  it('names the teachers without a rate', () => {
    const c = check(
      facts({
        teachers: [
          { id: 90020, name: 'Ali Valiyev', hasRate: false },
          { id: 10002, name: 'Zuhra Karimova', hasRate: true },
        ],
      }),
      'teacherRates',
    );
    expect(c.ok).toBe(false);
    expect(c.hint).toBe("1 ta ustozga stavka qo'yilmagan");
    expect(c.details).toEqual([{ id: 90020, name: 'Ali Valiyev' }]);
  });

  it('tells an incomplete group apart from no group at all', () => {
    expect(
      check(facts({ hasRunnableGroup: false, groupCount: 0 }), 'group').hint,
    ).toBe('Kurs, ustoz va jadval bilan birinchi guruhni oching');
    expect(
      check(facts({ hasRunnableGroup: false, groupCount: 2 }), 'group').hint,
    ).toBe(
      'Guruh bor, lekin ustoz, dars kunlari yoki boshlanish sanasi kiritilmagan',
    );
  });

  it('tells students-not-enrolled apart from no students', () => {
    expect(
      check(facts({ hasEnrollment: false, hasStudent: false }), 'enrollment')
        .hint,
    ).toBe("O'quvchi qo'shib, guruhga yozing");
    expect(
      check(facts({ hasEnrollment: false, hasStudent: true }), 'enrollment')
        .hint,
    ).toBe("O'quvchilar bor, lekin hech biri guruhga yozilmagan");
  });

  it('never lets the optional checks block ready or launched', () => {
    const r = buildBranchReadiness(
      facts({ adminCount: 0, hasLeadSection: false, hasTelegramGroup: false }),
    );
    expect(r.ready).toBe(true);
    expect(r.launched).toBe(true);
    expect(r.checks.filter((c) => !c.required).map((c) => c.key)).toEqual([
      'administrator',
      'leadSection',
      'telegramGroup',
    ]);
  });

  it('launched depends only on group, enrollment and payment', () => {
    // Farg'onada stavkasiz test ustoz bor — ishlab turgan filial shu sabab
    // «ishga tushmagan» chiqmasligi kerak.
    const r = buildBranchReadiness(
      facts({
        hasWorkingHours: false,
        teachers: [{ id: 90020, name: 'Test Ustoz', hasRate: false }],
      }),
    );
    expect(r.ready).toBe(false);
    expect(r.launched).toBe(true);

    for (const missing of [
      'hasRunnableGroup',
      'hasEnrollment',
      'hasPayment',
    ] as const) {
      expect(buildBranchReadiness(facts({ [missing]: false })).launched).toBe(
        false,
      );
    }
  });

  it('restores the missing apostrophe in the course hint', () => {
    expect(check(facts({ courseCount: 0 }), 'course').hint).toBe(
      "Kurssiz guruh ochib bo'lmaydi",
    );
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshiring**

Run: `cd server && npx jest src/branches/branch-readiness.spec.ts`
Expected: FAIL — `Cannot find module './branch-readiness'`.

- [ ] **Step 3: Quruvchini yozing**

`server/src/branches/branch-readiness.ts`:

```ts
/**
 * Filialni ishga tushirish tekshiruvi — SOF qism.
 *
 * `BranchesService.getReadiness` bazadan faktlarni yig'adi, bu fayl esa ularni
 * tekshiruvlar ro'yxatiga aylantiradi. Ajratilgani sababi: qaysi holat
 * «bajarildi» hisoblanishi — klientdagi yo'l xaritasini va kartaning qachon
 * yo'qolishini hal qiladigan qaror, u Prisma mock'isiz sinalishi kerak.
 */

export type ReadinessKey =
  | 'cashAccount'
  | 'bankAccount'
  | 'workingHours'
  | 'room'
  | 'course'
  | 'teachers'
  | 'teacherRates'
  | 'group'
  | 'enrollment'
  | 'payment'
  | 'administrator'
  | 'leadSection'
  | 'telegramGroup';

export interface ReadinessCheck {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  /** `false` — «Qo'shimcha»: `ready` ga ham, `launched` ga ham kirmaydi. */
  required: boolean;
  /** Holatga qarab o'zgaradi — chala holatda aynan nima yetishmayotganini aytadi. */
  hint: string;
  details?: { id: number; name: string }[];
}

export interface BranchReadiness {
  branchId: number;
  branchName: string;
  /** Barcha majburiy tekshiruv bajarilgan. */
  ready: boolean;
  /** Filial ishlayapti: to'liq guruh + yozilgan o'quvchi + to'lov. */
  launched: boolean;
  checks: ReadinessCheck[];
}

export interface ReadinessFacts {
  branchId: number;
  branchName: string;
  hasCash: boolean;
  hasBank: boolean;
  hasWorkingHours: boolean;
  roomCount: number;
  courseCount: number;
  adminCount: number;
  teachers: { id: number; name: string; hasRate: boolean }[];
  groupCount: number;
  /** Ustozi, dars kunlari, boshlanish vaqti va sanasi bor guruh bormi. */
  hasRunnableGroup: boolean;
  hasStudent: boolean;
  hasEnrollment: boolean;
  hasPayment: boolean;
  hasLeadSection: boolean;
  hasTelegramGroup: boolean;
}

export function buildBranchReadiness(f: ReadinessFacts): BranchReadiness {
  const hasTeachers = f.teachers.length > 0;
  // Ism bilan — UI «qaysidir ustoz» emas, aynan kimni tuzatishni aytsin.
  const withoutRate = f.teachers
    .filter((t) => !t.hasRate)
    .map((t) => ({ id: t.id, name: t.name }));

  const checks: ReadinessCheck[] = [
    {
      key: 'cashAccount',
      label: 'Naqd kassa',
      ok: f.hasCash,
      required: true,
      hint: "Filialga faol CASH kassasi kerak — busiz naqd to'lov qabul qilinmaydi",
    },
    {
      key: 'bankAccount',
      label: 'Bank hisobi',
      ok: f.hasBank,
      required: true,
      hint: 'Bank/karta tushumi uchun faol BANK hisobi kerak',
    },
    {
      key: 'workingHours',
      label: 'Ish vaqti',
      ok: f.hasWorkingHours,
      required: true,
      hint: 'Ish vaqti belgilanmasa jadval 08:00–20:00 ga tushadi',
    },
    {
      key: 'room',
      label: 'Xona',
      ok: f.roomCount > 0,
      required: true,
      hint: 'Xonasiz guruh kunlik jadvalda chizilmaydi',
    },
    {
      key: 'course',
      label: 'Kurs',
      ok: f.courseCount > 0,
      required: true,
      hint: "Kurssiz guruh ochib bo'lmaydi",
    },
    {
      key: 'teachers',
      label: 'Ustoz',
      ok: hasTeachers,
      required: true,
      hint: "Ustozlarni Telegram havola orqali yoki qo'lda qo'shing",
    },
    {
      key: 'teacherRates',
      label: 'Ustoz stavkalari',
      // Ustozsiz filial «hammaning stavkasi bor» degani emas — tekshiriladigan
      // odamning o'zi yo'q. Ilgari bo'sh ro'yxat aynan shu sabab `ok` berardi.
      ok: hasTeachers && withoutRate.length === 0,
      required: true,
      hint: !hasTeachers
        ? "Avval ustoz qo'shing"
        : withoutRate.length > 0
          ? `${withoutRate.length} ta ustozga stavka qo'yilmagan`
          : "Stavkasiz ustozning darslari uchun oylik YOZILMAYDI va keyin orqaga surib bo'lmaydi",
      details: withoutRate,
    },
    {
      key: 'group',
      label: 'Guruh',
      ok: f.hasRunnableGroup,
      required: true,
      hint: f.hasRunnableGroup
        ? 'Ustozi va jadvali bor guruh ochilgan'
        : f.groupCount === 0
          ? 'Kurs, ustoz va jadval bilan birinchi guruhni oching'
          : 'Guruh bor, lekin ustoz, dars kunlari yoki boshlanish sanasi kiritilmagan',
    },
    {
      key: 'enrollment',
      label: "O'quvchi",
      ok: f.hasEnrollment,
      required: true,
      hint: f.hasEnrollment
        ? "O'quvchilar guruhga yozilgan"
        : f.hasStudent
          ? "O'quvchilar bor, lekin hech biri guruhga yozilmagan"
          : "O'quvchi qo'shib, guruhga yozing",
    },
    {
      key: 'payment',
      label: "To'lov",
      ok: f.hasPayment,
      required: true,
      hint: f.hasPayment
        ? "Birinchi to'lov qayd qilingan"
        : "Birinchi to'lovni qayd qiling",
    },
    {
      key: 'administrator',
      label: 'Administrator',
      ok: f.adminCount > 0,
      required: false,
      hint: 'Administratorsiz davomat ogohlantirishlari hech kimga bormaydi',
    },
    {
      key: 'leadSection',
      label: "Lid bo'limi",
      ok: f.hasLeadSection,
      required: false,
      hint: "Lidlar va onlayn formalar uchun kamida bitta bo'lim kerak",
    },
    {
      key: 'telegramGroup',
      label: 'Telegram guruh',
      ok: f.hasTelegramGroup,
      required: false,
      hint: 'Kunlik hisobot Telegram guruhga borishi uchun guruhni ulang',
    },
  ];

  return {
    branchId: f.branchId,
    branchName: f.branchName,
    ready: checks.every((c) => !c.required || c.ok),
    // 1–5-bekatlar tayyorgarlik; filial ISHLAYOTGANINI faqat shu uchtasi
    // ko'rsatadi (spec Q4).
    launched: f.hasRunnableGroup && f.hasEnrollment && f.hasPayment,
    checks,
  };
}
```

- [ ] **Step 4: Test o'tishini tekshiring**

Run: `cd server && npx jest src/branches/branch-readiness.spec.ts`
Expected: PASS (9 ta test).

- [ ] **Step 5: Commit**

```bash
git add server/src/branches/branch-readiness.ts server/src/branches/branch-readiness.spec.ts
git commit -m "$(cat <<'EOF'
Readiness: tekshiruvlar sof quruvchiga ajratildi

Ustozsiz filial endi «stavkalar joyida» deb chiqmaydi; guruh, yozilish
va to'lov tekshiruvlari qo'shildi, launched = shu uchtasi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server — `getReadiness` yangi faktlarni yig'adi

**Files:**
- Modify: `server/src/branches/branches.service.ts` (importlar; `getReadiness`, hozir ~211–336-qatorlar)
- Test: `server/src/branches/branches.service.spec.ts` («branch onboarding» describe, ~214–420-qatorlar)

**Interfaces:**
- Consumes: `buildBranchReadiness`, `BranchReadiness` (Task 1)
- Produces: `BranchesService.getReadiness(id, companyId, userId): Promise<BranchReadiness>` — HTTP javobi `GET /branches/:id/readiness` (klient Task 5–7 shu shaklga tayanadi).

- [ ] **Step 1: Testlarni yangilang (avval yiqiladigan holatga)**

`branches.service.spec.ts` dagi `describe('BranchesService — branch onboarding', …)` ning
`beforeEach` idagi `prisma = { … }` obyektiga `user: { … }` dan keyin quyidagilarni qo'shing:

```ts
      group: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      studentBranch: { findFirst: jest.fn().mockResolvedValue(null) },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      leadSection: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramGroup: { findFirst: jest.fn().mockResolvedValue(null) },
```

Shu describe ichidagi `describe('readiness', () => { … })` blokini to'liq quyidagiga almashtiring:

```ts
  describe('readiness', () => {
    beforeEach(() => {
      prisma.branch.findFirst.mockResolvedValue({
        id: 2,
        name: 'Namangan',
        startOfWorkingDay: '08:00',
        endOfWorkingDay: '22:30',
      });
    });

    it('reports NOT ready and names each missing piece', async () => {
      const res = await service.getReadiness(2, 1001, 1);

      expect(res.ready).toBe(false);
      expect(res.launched).toBe(false);
      const failing = res.checks.filter((c) => !c.ok).map((c) => c.key);
      expect(failing).toEqual(
        expect.arrayContaining([
          'cashAccount',
          'bankAccount',
          'course',
          'room',
          'teachers',
          'teacherRates',
          'group',
          'enrollment',
          'payment',
          'administrator',
        ]),
      );
    });

    it('names the teachers who have no salary rate', async () => {
      // A lesson taught without an active rate accrues NOTHING, and a rate
      // cannot be back-dated into a closed period — so this must be caught
      // BEFORE the first lesson, not after.
      prisma.user.findMany.mockResolvedValue([
        { id: 90020, firstName: 'Ali', lastName: 'Valiyev', salaryConfigs: [] },
        {
          id: 10002,
          firstName: 'Zuhra',
          lastName: 'Karimova',
          salaryConfigs: [{ id: 'c1' }],
        },
      ]);

      const res = await service.getReadiness(2, 1001, 1);
      const check = res.checks.find((c) => c.key === 'teacherRates')!;

      expect(check.ok).toBe(false);
      expect(check.details).toEqual([{ id: 90020, name: 'Ali Valiyev' }]);
    });

    it('counts only ACTIVE cash accounts', async () => {
      // To'lov faqat faol kassaga yoziladi (`resolveAccountId`) — nofaol
      // kassa «bor» deb sanalsa, filial tayyor ko'rinib, to'lovda yiqiladi.
      await service.getReadiness(2, 1001, 1);
      expect(prisma.cashAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 2, isActive: true }),
        }),
      );
    });

    it('looks for a RUNNABLE group: teacher, days, start time and date', async () => {
      await service.getReadiness(2, 1001, 1);
      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: 2,
            deletedAt: null,
            teachers: { some: {} },
            exactDays: { isEmpty: false },
            lessonStartTime: { not: null },
            startDate: { not: null },
          }),
        }),
      );
    });

    it('is not launched until the first payment', async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'g1' });
      prisma.enrollment.findFirst.mockResolvedValue({ id: 'e1' });
      expect((await service.getReadiness(2, 1001, 1)).launched).toBe(false);

      prisma.payment.findFirst.mockResolvedValue({ id: 'p1' });
      expect((await service.getReadiness(2, 1001, 1)).launched).toBe(true);
    });

    it('reports ready when every check passes', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { type: 'CASH' },
        { type: 'BANK' },
      ]);
      prisma.room.count.mockResolvedValue(1);
      prisma.course.count.mockResolvedValue(1);
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 90020,
          firstName: 'Ali',
          lastName: 'Valiyev',
          salaryConfigs: [{ id: 'c1' }],
        },
      ]);
      prisma.group.count.mockResolvedValue(1);
      prisma.group.findFirst.mockResolvedValue({ id: 'g1' });
      prisma.studentBranch.findFirst.mockResolvedValue({ studentId: 20001 });
      prisma.enrollment.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.payment.findFirst.mockResolvedValue({ id: 'p1' });

      const res = await service.getReadiness(2, 1001, 1);
      expect(res.ready).toBe(true);
      expect(res.launched).toBe(true);
    });

    it('404s for a branch outside the company', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(service.getReadiness(99, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
```

- [ ] **Step 2: Testlar yiqilishini tekshiring**

Run: `cd server && npx jest src/branches/branches.service.spec.ts`
Expected: FAIL — `launched` `undefined`, `group.findFirst` chaqirilmagan va h.k.

- [ ] **Step 3: `getReadiness` ni qayta yozing**

`branches.service.ts` importlari:

```ts
import {
  BranchStatus,
  CashAccountType,
  PaymentStatus,
  TelegramGroupStatus,
} from '@prisma/client';
```

va `import { ReportBranchIds } …` qatoridan keyin:

```ts
import { buildBranchReadiness, BranchReadiness } from './branch-readiness';
```

`getReadiness` ning izohi va tanasini (`async getReadiness(…) {` dan to'g'ri
`assertCallerMayTouchBranch` izohigacha) quyidagiga almashtiring:

```ts
  /**
   * What still stands between this branch and its first real student — and
   * whether it is already running (`launched`).
   *
   * Everything listed here was discovered the hard way while opening branch #2:
   * a course is required to create a group, a group with no room is never drawn
   * on the daily schedule, a teacher with no salary rate accrues NOTHING for
   * every lesson they teach and it cannot be back-dated afterwards (~20 mln so'm
   * went missing this way in May 2026), and with no branch administrator the
   * attendance-escalation cron drops its alerts silently.
   *
   * Read-only. It reports; it does not fix. The rules live in
   * `buildBranchReadiness` so they are tested without Prisma; this method only
   * gathers facts. «Is there any?» questions use `findFirst`, never `count` —
   * Fargona's payment and enrollment tables are large and the answer is binary.
   */
  async getReadiness(
    id: number,
    companyId: number,
    userId: number,
  ): Promise<BranchReadiness> {
    // `@Roles('CEO','Branch Director')` proves the caller holds a role, not that
    // this branch is theirs. Without this a Fargona director could read
    // Namangan's readiness — including the names of teachers with no salary rate.
    await this.assertCallerMayTouchBranch(id, userId);

    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null, companyId },
      select: {
        id: true,
        name: true,
        startOfWorkingDay: true,
        endOfWorkingDay: true,
      },
    });
    if (!branch) throw new NotFoundException(`Branch #${id} topilmadi`);

    const [
      cashTypes,
      roomCount,
      courseCount,
      adminCount,
      teachers,
      groupCount,
      runnableGroup,
      student,
      enrollment,
      payment,
      leadSection,
      telegramGroup,
    ] = await Promise.all([
      // Only ACTIVE accounts: `resolveAccountId` books payments to active ones.
      this.prisma.cashAccount.findMany({
        where: { branchId: id, companyId, deletedAt: null, isActive: true },
        select: { type: true },
      }),
      this.prisma.room.count({ where: { branchId: id, deletedAt: null } }),
      this.prisma.course.count({ where: { branchId: id, deletedAt: null } }),
      this.prisma.user.count({
        where: {
          companyId,
          deletedAt: null,
          isActive: true,
          roles: { some: { role: { name: 'Administrator' } } },
          branches: { some: { branchId: id } },
        },
      }),
      this.prisma.user.findMany({
        where: {
          companyId,
          deletedAt: null,
          isActive: true,
          roles: { some: { role: { name: 'Teacher' } } },
          branches: { some: { branchId: id } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          salaryConfigs: {
            where: { isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.group.count({ where: { branchId: id, deletedAt: null } }),
      // A group that can actually hold a lesson: attendance needs a teacher,
      // a scheduled day and a start date (attendance-validation.service.ts).
      this.prisma.group.findFirst({
        where: {
          branchId: id,
          deletedAt: null,
          teachers: { some: {} },
          exactDays: { isEmpty: false },
          lessonStartTime: { not: null },
          startDate: { not: null },
        },
        select: { id: true },
      }),
      this.prisma.studentBranch.findFirst({
        where: { branchId: id, student: { deletedAt: null } },
        select: { studentId: true },
      }),
      // Any status: the question is «has this step ever been done?», so a
      // branch on summer break does not fall back to «not launched».
      this.prisma.enrollment.findFirst({
        where: { deletedAt: null, group: { branchId: id } },
        select: { id: true },
      }),
      // REFUNDED too: money did come in, the branch did launch.
      this.prisma.payment.findFirst({
        where: {
          branchId: id,
          companyId,
          status: { in: [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED] },
        },
        select: { id: true },
      }),
      this.prisma.leadSection.findFirst({
        where: { deletedAt: null, column: { branchId: id, deletedAt: null } },
        select: { id: true },
      }),
      this.prisma.telegramGroup.findFirst({
        where: {
          branchId: id,
          status: TelegramGroupStatus.APPROVED,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    const types = new Set(cashTypes.map((c) => c.type));

    return buildBranchReadiness({
      branchId: branch.id,
      branchName: branch.name,
      hasCash: types.has(CashAccountType.CASH),
      hasBank: types.has(CashAccountType.BANK),
      hasWorkingHours: !!branch.startOfWorkingDay && !!branch.endOfWorkingDay,
      roomCount,
      courseCount,
      adminCount,
      teachers: teachers.map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        hasRate: t.salaryConfigs.length > 0,
      })),
      groupCount,
      hasRunnableGroup: runnableGroup !== null,
      hasStudent: student !== null,
      hasEnrollment: enrollment !== null,
      hasPayment: payment !== null,
      hasLeadSection: leadSection !== null,
      hasTelegramGroup: telegramGroup !== null,
    });
  }
```

- [ ] **Step 4: Testlar o'tishini tekshiring**

Run: `cd server && npx jest src/branches`
Expected: PASS — `branches.service.spec.ts`, `branch-readiness.spec.ts`, `branches.controller.spec.ts` va reset spec'lari yashil.

Run: `cd server && npm run typecheck`
Expected: xatosiz.

- [ ] **Step 5: Commit**

```bash
git add server/src/branches/branches.service.ts server/src/branches/branches.service.spec.ts
git commit -m "$(cat <<'EOF'
Readiness: guruh, yozilish, to'lov, lid bo'limi va Telegram guruh

getReadiness faqat faktlarni yig'adi, qoidalar buildBranchReadiness da.
Faqat faol kassalar sanaladi; «bormi?» savollari findFirst bilan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server — ustoz stavkasini yozish huquqi (sof qaror + yuklovchilar)

**Files:**
- Create: `server/src/salary/shared/teacher-rate-permission.ts`
- Test: `server/src/salary/shared/teacher-rate-permission.spec.ts`

**Interfaces:**
- Consumes: `resolveCallerBranchScope(prisma, userId)` — `server/src/common/auth/branch-scope.ts` (CEO → `{ kind: 'all' }`, boshqa → `{ kind: 'branches', branchIds }`, `userId` yo'q → `ForbiddenException`).
- Produces:
  - `interface RateTarget { id: number; mainBranch: number | null; branches: { branchId: number }[]; roles: { role: { name: string } }[] }`
  - `function teacherRateRefusal(input: { callerId: number; callerBranchIds: number[]; target: RateTarget; groupBranchId?: number | null; deactivates?: boolean }): string | null`
  - `function assertCallerMaySetTeacherRate(prisma, callerId: number | undefined, targetUserId: number, groupId?: string | null): Promise<void>`
  - `function assertCallerMayUpdateTeacherRate(prisma, callerId: number | undefined, configId: string, companyId: number, dto: { isActive?: boolean }): Promise<void>`

- [ ] **Step 1: Failing testni yozing**

`server/src/salary/shared/teacher-rate-permission.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  assertCallerMaySetTeacherRate,
  assertCallerMayUpdateTeacherRate,
  RateTarget,
  teacherRateRefusal,
} from './teacher-rate-permission';

const teacher = (over: Partial<RateTarget> = {}): RateTarget => ({
  id: 20001,
  mainBranch: 2,
  branches: [{ branchId: 2 }],
  roles: [{ role: { name: 'Teacher' } }],
  ...over,
});

describe('teacherRateRefusal', () => {
  const base = { callerId: 90010, callerBranchIds: [2] };

  it('allows a pure teacher of the caller branch', () => {
    expect(teacherRateRefusal({ ...base, target: teacher() })).toBeNull();
  });

  it('accepts membership through mainBranch alone', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher({ branches: [] }) }),
    ).toBeNull();
  });

  it('refuses the caller own rate', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher({ id: 90010 }) }),
    ).toBe("O'zingizga stavka qo'ya olmaysiz");
  });

  it('refuses anyone with a role besides Teacher', () => {
    // Administrator-ustoz yoki boshqa direktor — oyligi CEO'da (ADR-0026).
    const adminTeacher = teacher({
      roles: [{ role: { name: 'Teacher' } }, { role: { name: 'Administrator' } }],
    });
    const director = teacher({ roles: [{ role: { name: 'Branch Director' } }] });
    expect(teacherRateRefusal({ ...base, target: adminTeacher })).toBe(
      'Bu xodimning oyligini CEO belgilaydi',
    );
    expect(teacherRateRefusal({ ...base, target: director })).toBe(
      'Bu xodimning oyligini CEO belgilaydi',
    );
  });

  it('refuses a teacher of another branch', () => {
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher({ mainBranch: 1, branches: [{ branchId: 1 }] }),
      }),
    ).toBe('Bu ustoz sizning filialingizda emas');
  });

  it('refuses when the caller has no branch at all (fail closed)', () => {
    expect(
      teacherRateRefusal({
        callerId: 90010,
        callerBranchIds: [],
        target: teacher(),
      }),
    ).toBe('Bu ustoz sizning filialingizda emas');
  });

  it('checks the group of a per-group rate', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher(), groupBranchId: 1 }),
    ).toBe('Bu guruh sizning filialingizda emas');
    expect(
      teacherRateRefusal({ ...base, target: teacher(), groupBranchId: null }),
    ).toBe('Bu guruh sizning filialingizda emas');
    expect(
      teacherRateRefusal({ ...base, target: teacher(), groupBranchId: 2 }),
    ).toBeNull();
  });

  it('refuses a deactivation even for an own-branch teacher', () => {
    // O'chirilgan stavka = keyingi darslar uchun oylik yozilmaydi.
    expect(
      teacherRateRefusal({ ...base, target: teacher(), deactivates: true }),
    ).toBe("Stavkani faqat CEO o'chira oladi");
  });
});

describe('assertCallerMaySetTeacherRate / assertCallerMayUpdateTeacherRate', () => {
  const ceo = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const director = {
    mainBranch: 2,
    branches: [{ branchId: 2 }],
    roles: [{ role: { name: 'Branch Director' } }],
  };
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      group: { findFirst: jest.fn() },
      employeeSalaryConfig: { findFirst: jest.fn() },
    };
  });

  it('lets the CEO through without reading the target', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(ceo);
    await expect(
      assertCallerMaySetTeacherRate(prisma, 90001, 20001),
    ).resolves.toBeUndefined();
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  });

  it('lets a director set an own-branch teacher rate', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(teacher());
    await expect(
      assertCallerMaySetTeacherRate(prisma, 90010, 20001),
    ).resolves.toBeUndefined();
  });

  it('refuses a director on another branch teacher with 403', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(teacher({ mainBranch: 1, branches: [{ branchId: 1 }] }));
    await expect(
      assertCallerMaySetTeacherRate(prisma, 90010, 20001),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reads the group branch for a per-group rate', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(teacher());
    prisma.group.findFirst.mockResolvedValue({ branchId: 1 });
    await expect(
      assertCallerMaySetTeacherRate(prisma, 90010, 20001, 'g-1'),
    ).rejects.toThrow('Bu guruh sizning filialingizda emas');
  });

  it('404s for an unknown target', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(null);
    await expect(
      assertCallerMaySetTeacherRate(prisma, 90010, 99999),
    ).rejects.toThrow(NotFoundException);
  });

  it('fails closed without a caller id', async () => {
    await expect(
      assertCallerMaySetTeacherRate(prisma, undefined, 20001),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checks an update against the config owner and refuses a deactivation', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(teacher());
    prisma.employeeSalaryConfig.findFirst.mockResolvedValue({
      userId: 20001,
      groupId: null,
    });
    await expect(
      assertCallerMayUpdateTeacherRate(prisma, 90010, 'cfg-1', 1001, {
        isActive: false,
      }),
    ).rejects.toThrow("Stavkani faqat CEO o'chira oladi");
    expect(prisma.employeeSalaryConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cfg-1', companyId: 1001 } }),
    );
  });

  it('lets a director change the value of an own-branch teacher rate', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(teacher());
    prisma.employeeSalaryConfig.findFirst.mockResolvedValue({
      userId: 20001,
      groupId: null,
    });
    await expect(
      assertCallerMayUpdateTeacherRate(prisma, 90010, 'cfg-1', 1001, {}),
    ).resolves.toBeUndefined();
  });

  it('404s for an unknown config', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(director);
    prisma.employeeSalaryConfig.findFirst.mockResolvedValue(null);
    await expect(
      assertCallerMayUpdateTeacherRate(prisma, 90010, 'nope', 1001, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets the CEO update without reading the config', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(ceo);
    await expect(
      assertCallerMayUpdateTeacherRate(prisma, 90001, 'cfg-1', 1001, {
        isActive: false,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.employeeSalaryConfig.findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshiring**

Run: `cd server && npx jest src/salary/shared/teacher-rate-permission.spec.ts`
Expected: FAIL — `Cannot find module './teacher-rate-permission'`.

- [ ] **Step 3: Qaror va yuklovchilarni yozing**

`server/src/salary/shared/teacher-rate-permission.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCallerBranchScope } from '../../common/auth/branch-scope';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Ustoz stavkasini yozish huquqi (ADR-0026).
 *
 * CEO har qanday stavkani qo'yadi. Filial direktori — faqat o'z filialidagi,
 * FAQAT Ustoz roli bor xodimga; o'ziga emas; va stavkani o'chira olmaydi
 * (o'chirilgan stavka = keyingi darslar uchun oylik yozilmaydi). «Faqat Ustoz»
 * qoidasi xodimlar oyligini (administrator, kassir, direktor) ham avtomatik
 * CEO'da qoldiradi — ularning hammasida Ustozdan boshqa rol bor.
 *
 * `teacherRateRefusal` — sof qaror (test uchun); bazani o'qish pastdagi
 * yuklovchilarda.
 */
export interface RateTarget {
  id: number;
  mainBranch: number | null;
  branches: { branchId: number }[];
  roles: { role: { name: string } }[];
}

/** Rad etish matni yoki `null` (ruxsat). CEO bu funksiyaga umuman kelmaydi. */
export function teacherRateRefusal(input: {
  callerId: number;
  callerBranchIds: number[];
  target: RateTarget;
  /** `undefined` — stavka guruhga bog'lanmagan; `null` — guruh topilmadi. */
  groupBranchId?: number | null;
  deactivates?: boolean;
}): string | null {
  const { callerId, callerBranchIds, target, groupBranchId, deactivates } =
    input;

  if (target.id === callerId) return "O'zingizga stavka qo'ya olmaysiz";

  const roleNames = target.roles.map((r) => r.role.name);
  if (roleNames.length !== 1 || roleNames[0] !== 'Teacher') {
    return 'Bu xodimning oyligini CEO belgilaydi';
  }

  const mine = new Set(callerBranchIds);
  const targetBranches = [
    ...target.branches.map((b) => b.branchId),
    ...(target.mainBranch != null ? [target.mainBranch] : []),
  ];
  // Bo'sh to'plam — hech narsa, hech qachon «hammasi» emas (ADR-0002).
  if (!targetBranches.some((b) => mine.has(b))) {
    return 'Bu ustoz sizning filialingizda emas';
  }

  if (
    groupBranchId !== undefined &&
    (groupBranchId === null || !mine.has(groupBranchId))
  ) {
    return 'Bu guruh sizning filialingizda emas';
  }

  if (deactivates) return "Stavkani faqat CEO o'chira oladi";
  return null;
}

async function refuseForBranchCaller(
  prisma: PrismaLike,
  callerId: number,
  callerBranchIds: number[],
  targetUserId: number,
  groupId: string | null | undefined,
  deactivates: boolean,
): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    select: {
      id: true,
      mainBranch: true,
      branches: { select: { branchId: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!target) throw new NotFoundException('Xodim topilmadi');

  let groupBranchId: number | null | undefined;
  if (groupId) {
    const group = await prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { branchId: true },
    });
    groupBranchId = group?.branchId ?? null;
  }

  const refusal = teacherRateRefusal({
    callerId,
    callerBranchIds,
    target,
    groupBranchId,
    deactivates,
  });
  if (refusal) throw new ForbiddenException(refusal);
}

/** `POST /salary/config` darvozasi. */
export async function assertCallerMaySetTeacherRate(
  prisma: PrismaLike,
  callerId: number | undefined,
  targetUserId: number,
  groupId?: string | null,
): Promise<void> {
  const scope = await resolveCallerBranchScope(prisma, callerId);
  if (scope.kind === 'all') return;
  // `resolveCallerBranchScope` `callerId` yo'q bo'lsa allaqachon rad etgan.
  await refuseForBranchCaller(
    prisma,
    callerId as number,
    scope.branchIds,
    targetUserId,
    groupId,
    false,
  );
}

/** `PATCH /salary/config/:id` darvozasi — egasi config'ning o'zidan olinadi. */
export async function assertCallerMayUpdateTeacherRate(
  prisma: PrismaLike,
  callerId: number | undefined,
  configId: string,
  companyId: number,
  dto: { isActive?: boolean },
): Promise<void> {
  const scope = await resolveCallerBranchScope(prisma, callerId);
  if (scope.kind === 'all') return;

  const config = await prisma.employeeSalaryConfig.findFirst({
    where: { id: configId, companyId },
    select: { userId: true, groupId: true },
  });
  if (!config) throw new NotFoundException('Salary config topilmadi');

  await refuseForBranchCaller(
    prisma,
    callerId as number,
    scope.branchIds,
    config.userId,
    config.groupId,
    dto.isActive === false,
  );
}
```

- [ ] **Step 4: Test o'tishini tekshiring**

Run: `cd server && npx jest src/salary/shared/teacher-rate-permission.spec.ts`
Expected: PASS (18 ta test).

- [ ] **Step 5: Commit**

```bash
git add server/src/salary/shared/teacher-rate-permission.ts server/src/salary/shared/teacher-rate-permission.spec.ts
git commit -m "$(cat <<'EOF'
Stavka yozish huquqi: sof qaror va ikki darvoza

Direktor faqat o'z filialining sof ustoziga, o'ziga emas, o'chirmasdan.
CEO uchun hech narsa o'zgarmaydi. Hali hech qayerga ulanmagan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Server — darvozani ulash, rollar, manifest, ADR-0026, hujjatlar

**Files:**
- Modify: `server/src/salary/salary-config.service.ts` (import; `createConfig` dan oldin ikki metod)
- Modify: `server/src/salary/salary.service.ts:48-69`
- Modify: `server/src/salary/salary.controller.ts:112-114` (izoh), `:151-152`, `:171-172`
- Modify: `server/src/salary/salary.controller.spec.ts:17-24`
- Modify: `server/src/common/auth/branch-route-policy.ts` (~462–481-qatorlardagi salary `COMPANY_WIDE` bloki)
- Create: `server/src/salary/salary.service.rate-gate.spec.ts`
- Create: `docs/adr/0026-direktor-oz-filiali-ustozlariga-stavka-qoyadi.md`
- Modify: `docs/adr/README.md`, `docs/role-access.md:48`, `server/CLAUDE.md:610`, `server/CLAUDE.md:1161`

**Interfaces:**
- Consumes: `assertCallerMaySetTeacherRate`, `assertCallerMayUpdateTeacherRate` (Task 3)
- Produces: `SalaryConfigService.assertCallerMayCreateRate(callerId: number | undefined, dto: CreateSalaryConfigDto): Promise<void>`, `SalaryConfigService.assertCallerMayUpdateRate(callerId: number | undefined, id: string, companyId: number, dto: UpdateSalaryConfigDto): Promise<void>`; HTTP: direktor `POST /salary/config` va `PATCH /salary/config/:id` ni chaqira oladi (klient Task 9 shunga tayanadi).

- [ ] **Step 1: Failing testlarni yozing**

`server/src/salary/salary.service.rate-gate.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { SalaryService } from './salary.service';

/**
 * ADR-0026: stavka yozishdan OLDIN chaqiruvchi tekshiriladi. Darvoza fasadda,
 * chunki `SalaryConfigService.createConfig` ni boshqa hech kim chaqirmaydi —
 * yagona yo'l controller → shu fasad.
 */
describe('SalaryService — rate write gate (ADR-0026)', () => {
  const make = (config: any) =>
    new SalaryService(
      config,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('checks the caller before creating a rate', async () => {
    const calls: string[] = [];
    const config = {
      assertCallerMayCreateRate: jest.fn(async () => {
        calls.push('gate');
      }),
      createConfig: jest.fn(async () => {
        calls.push('write');
        return { id: 'cfg' };
      }),
    };
    const dto = { userId: 20001, salaryType: 'PERCENTAGE', value: 40 } as any;

    await make(config).createConfig(dto, 1001, 90010);

    expect(config.assertCallerMayCreateRate).toHaveBeenCalledWith(90010, dto);
    expect(calls).toEqual(['gate', 'write']);
  });

  it('never writes when the gate refuses', async () => {
    const config = {
      assertCallerMayCreateRate: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('rad')),
      createConfig: jest.fn(),
    };
    await expect(
      make(config).createConfig({} as any, 1001, 90010),
    ).rejects.toThrow(ForbiddenException);
    expect(config.createConfig).not.toHaveBeenCalled();
  });

  it('checks the caller before updating a rate', async () => {
    const config = {
      assertCallerMayUpdateRate: jest.fn().mockResolvedValue(undefined),
      updateConfig: jest.fn().mockResolvedValue({ id: 'cfg' }),
    };
    const dto = { value: 45 } as any;

    await make(config).updateConfig('cfg', dto, 1001, 90010);

    expect(config.assertCallerMayUpdateRate).toHaveBeenCalledWith(
      90010,
      'cfg',
      1001,
      dto,
    );
    expect(config.updateConfig).toHaveBeenCalledWith('cfg', dto, 1001, 90010);
  });
});
```

`server/src/salary/salary.controller.spec.ts` dagi quyidagi qismni:

```ts
  describe('CEO-only writes (Faza 2 narrowing)', () => {
    it.each(['createConfig', 'applyGlobalConfig', 'updateConfig'] as const)(
      '%s requires CEO',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO']);
      },
    );
```

bunga almashtiring:

```ts
  describe('CEO-only writes (Faza 2 narrowing)', () => {
    // A company-wide bulk rate moves every branch at once — CEO only.
    it('applyGlobalConfig requires CEO', () => {
      expect(rolesFor('applyGlobalConfig')).toEqual(['CEO']);
    });
```

va `describe('CEO + Branch Director allowed (payouts)', …)` blokidan keyin qo'shing:

```ts
  describe('Teacher rate writes — CEO + own-branch Branch Director (ADR-0026)', () => {
    // The role gate only admits the director; WHICH teacher they may touch is
    // decided in `shared/teacher-rate-permission.ts` (own branch, pure
    // Teacher, not self, never a deactivation).
    it.each(['createConfig', 'updateConfig'] as const)(
      '%s allows CEO and Branch Director',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO', 'Branch Director']);
      },
    );
  });
```

- [ ] **Step 2: Testlar yiqilishini tekshiring**

Run: `cd server && npx jest src/salary/salary.service.rate-gate.spec.ts src/salary/salary.controller.spec.ts`
Expected: FAIL — `assertCallerMayCreateRate` chaqirilmagan; `createConfig` rollari `['CEO']`.

- [ ] **Step 3: Darvozani ulang**

`server/src/salary/salary-config.service.ts` importlariga qo'shing:

```ts
import {
  assertCallerMaySetTeacherRate,
  assertCallerMayUpdateTeacherRate,
} from './shared/teacher-rate-permission';
```

va `async createConfig(` metodidan OLDIN:

```ts
  /**
   * HTTP yozish darvozasi (ADR-0026): CEO o'tadi; filial direktori faqat o'z
   * filialining sof ustoziga, o'ziga emas. Yozuvning o'zidan ajratilgan, chunki
   * `createConfig`/`updateConfig` pul qoidalarini (versiya, yopiq davr) biladi,
   * kim chaqirayotganini emas.
   */
  assertCallerMayCreateRate(
    callerId: number | undefined,
    dto: CreateSalaryConfigDto,
  ): Promise<void> {
    return assertCallerMaySetTeacherRate(
      this.prisma,
      callerId,
      dto.userId,
      dto.groupId ?? null,
    );
  }

  /** Xuddi shu, `PATCH` uchun: direktor stavkani o'chira olmaydi. */
  assertCallerMayUpdateRate(
    callerId: number | undefined,
    id: string,
    companyId: number,
    dto: UpdateSalaryConfigDto,
  ): Promise<void> {
    return assertCallerMayUpdateTeacherRate(
      this.prisma,
      callerId,
      id,
      companyId,
      dto,
    );
  }
```

`server/src/salary/salary.service.ts` dagi `createConfig` va `updateConfig` ni almashtiring:

```ts
  async createConfig(
    dto: CreateSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    await this.config.assertCallerMayCreateRate(changedById, dto);
    return this.config.createConfig(dto, companyId, changedById);
  }
```

```ts
  async updateConfig(
    id: string,
    dto: UpdateSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    await this.config.assertCallerMayUpdateRate(changedById, id, companyId, dto);
    return this.config.updateConfig(id, dto, companyId, changedById);
  }
```

`server/src/salary/salary.controller.ts`:
- izoh `// CONFIG — write = CEO-only; read = CEO/BD/Administrator.` →
  `// CONFIG — write = CEO + own-branch Branch Director (ADR-0026, gated in SalaryService); read = CEO/BD/Administrator.`
- `@Post('config')` ostidagi `@Roles('CEO')` → `@Roles('CEO', 'Branch Director')`
- `@Patch('config/:id')` ostidagi `@Roles('CEO')` → `@Roles('CEO', 'Branch Director')`
- `@Post('config/global')` ostidagi `@Roles('CEO')` **o'zgarmaydi**.

- [ ] **Step 4: Route manifestini yangilang**

`server/src/common/auth/branch-route-policy.ts` dagi salary `COMPANY_WIDE` blokini
(`'Company-level configuration, not branch data. A salary RATE …'`) quyidagi IKKI blokka almashtiring:

```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'A teacher RATE write (ADR-0026). The CEO sets any rate; a Branch ' +
      'Director only a pure Teacher of their own branch — never their own ' +
      'rate, never a deactivation. The branch comes from the TARGET teacher ' +
      '(and from the group for a per-group rate), not from the header: ' +
      '`assertCallerMaySetTeacherRate` / `assertCallerMayUpdateTeacherRate`.',
    routes: ['PATCH /salary/config/:id', 'POST /salary/config'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Company-level configuration, not branch data. Rate READS, the ' +
      'company-wide bulk rate and the payroll cycle apply to the whole company ' +
      'by design (a rate is per employee, and the employee already carries a ' +
      'branch); `POST /salary/calculate` is cron-internal and settles every ' +
      'branch in one run, which is why it is CEO-only and has no UI trigger.',
    routes: [
      'GET /salary/config-history/:userId',
      'GET /salary/config/:userId',
      'GET /salary/configs/by-users',
      'GET /salary/period-preview',
      'GET /salary/period-settings',
      'POST /salary/calculate',
      'POST /salary/config/global',
      'POST /salary/period-settings',
    ],
  },
```

- [ ] **Step 5: Testlar o'tishini tekshiring**

Run: `cd server && npx jest src/salary src/common/auth`
Expected: PASS — shu jumladan `branch-route-policy.spec.ts` («classifies every route exactly once»).

Run: `cd server && npm run typecheck`
Expected: xatosiz.

- [ ] **Step 6: ADR-0026 va hujjatlar**

`docs/adr/0026-direktor-oz-filiali-ustozlariga-stavka-qoyadi.md`:

```md
# ADR-0026 — Filial direktori o'z filiali ustozlariga stavka qo'yadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0002, ADR-0022, `server/src/salary/shared/teacher-rate-permission.ts`, `server/src/salary/salary.controller.ts`, spec `docs/superpowers/specs/2026-09-24-filial-ishga-tushirish-yoli-design.md`

## Kontekst

Ustoz stavkasini yozish (`POST /salary/config`, `PATCH /salary/config/:id`)
2026-04 dan beri faqat CEO'da edi. Stavkasiz ustozni guruhga biriktirib
bo'lmaydi (`assertTeachersHaveRate`): stavkasiz o'tilgan dars uchun oylik
umuman yozilmaydi va keyin orqaga tuzatib bo'lmaydi (2026-yil may, ~20 mln
so'm). Natijada yangi filial direktori «birinchi guruh» qadamida to'xtab, CEO
stavka qo'yishini kutardi — ishga tushirish yo'lida CEO'ga bog'liq yagona
qadam shu edi. `docs/role-access.md` esa «direktor stavka qo'ya oladi» deb
yozgan edi — hujjat kod bilan zid edi.

## Qaror

Filial direktori ustoz stavkasini yozadi, lekin faqat:

- o'z filialidagi (UserBranch ∪ mainBranch) xodimga;
- rollari aynan `{Teacher}` bo'lgan xodimga — boshqa roli bor har kim
  (administrator, kassir, direktor, administrator-ustoz) CEO'da qoladi;
- o'zidan boshqaga;
- guruhga bog'langan stavkada — guruh ham o'z filialida.

**Taqiqlanadi:**
- Direktorga stavkani o'chirish (`isActive: false`) — o'chirilgan stavka keyingi
  darslar uchun oylik yozilmasligini bildiradi.
- Direktorga `POST /salary/config/global`, hisoblash davri, oylikni hisoblash
  va tasdiqlash — CEO'da qoladi.

Mavjud pul qo'riqchilari hamma uchun: yangi versiya oldingisidan oldin
bo'lmaydi va APPROVED/PAID davrga tushmaydi; kim o'zgartirgani `changedById` da.

## Ko'rib chiqilgan muqobillar

**Faqat CEO (avvalgidek).** Rad etildi: yangi filialni ishga tushirish yo'lini
to'sadi.

**Direktor o'z filialining har bir xodimiga.** Rad etildi: xodimlar oyligiga,
jumladan boshqa direktorlar va o'zining oyligiga yo'l ochardi.

**Har o'zgarishda CEO'ga bildirishnoma.** Hozircha qilinmadi: versiya tarixida
kim o'zgartirgani bor, oylikni baribir CEO tasdiqlaydi.

## Oqibatlari

**Yutuq:** direktor yangi filialni CEO'ni kutmasdan ishga tushiradi.

**Narx:** oylik huquqi kengaydi — direktor ustoz stavkasini o'zgartira oladi;
nazorat — versiya tarixi va CEO tasdig'i.

**Endi taqiqlangan:** direktorning stavka o'chirishi; direktorning ustoz
bo'lmagan yoki ko'p rolli xodimga stavka qo'yishi.
```

`docs/adr/README.md` indeksida `| [0025](0025-…) | … |` qatoridan keyin:

```md
| [0026](0026-direktor-oz-filiali-ustozlariga-stavka-qoyadi.md) | Filial direktori o'z filiali ustozlariga stavka qo'yadi | Qabul qilindi | 2026-09-24 |
```

`docs/role-access.md:48`:
- `| Set salary config | Yes | Yes | No | No | No |` →
  `| Set salary config | Yes | Own-branch teachers only (ADR-0026) | No | No | No |`
- `- **CEO-only actions**: …` qatoridan keyin yangi qator:
  `- **Salary config (ADR-0026)**: a Branch Director may set a rate only for a user whose ONLY role is Teacher and who belongs to their branch — never their own rate; deactivating a rate, \`POST /salary/config/global\` and the payroll period stay CEO-only.`

`server/CLAUDE.md`:
- 610-qatordagi `Writing a rate is still the existing CEO-only \`POST /salary/config\`.` jumlasini
  `Writing a rate is \`POST /salary/config\` — the CEO for anyone, a Branch Director only for a pure Teacher of their own branch (ADR-0026); staff rates therefore stay CEO-only, because every staff member holds a non-Teacher role.` ga almashtiring.
- 1161-qatordagi `| Salary config` katagini `| Salary config (BD: own-branch teachers, ADR-0026)` ga almashtiring (qolgan ustunlar o'zgarmaydi).

- [ ] **Step 7: Commit**

```bash
git add server/src/salary docs/adr docs/role-access.md server/CLAUDE.md server/src/common/auth/branch-route-policy.ts
git commit -m "$(cat <<'EOF'
Filial direktori o'z filiali ustozlariga stavka qo'yadi (ADR-0026)

POST/PATCH /salary/config endi CEO + direktor; kimga ekanini
teacher-rate-permission hal qiladi. global, davr va hisob CEO'da.
Manifest: ikki route BRANCH_SCOPED_BY_ENTITY ga ko'chdi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Klient — tiplar, bekatlar, xarita va ko'rinish mantiqi, xotira

**Files:**
- Create: `client/src/components/dashboard/launch/launch-types.ts`
- Create: `client/src/components/dashboard/launch/launch-stations.ts`
- Create: `client/src/components/dashboard/launch/resolve-launch-journey.ts`
- Create: `client/src/components/dashboard/launch/resolve-launch-visibility.ts`
- Create: `client/src/components/dashboard/launch/launch-storage.ts`
- Test: `client/src/components/dashboard/launch/resolve-launch-journey.test.ts`, `resolve-launch-visibility.test.ts`, `launch-storage.test.ts`

**Interfaces:**
- Consumes: `GET /branches/:id/readiness` javob shakli (Task 2); `ROLE_CEO`, `ROLE_BRANCH_DIRECTOR` — `client/src/components/dashboard/dashboard-home-visibility.ts`
- Produces:
  - `launch-types.ts`: `ReadinessKey`, `ReadinessCheck`, `BranchReadiness` (Task 1 dagi server tiplari bilan AYNAN bir xil maydonlar)
  - `launch-stations.ts`: `interface LaunchStation { key: ReadinessKey; short: string; action: string; tourTitle: string; tourBody: string; route: (branchId: number) => string; targets: string[] }`, `LAUNCH_STATIONS: LaunchStation[]` (8), `LAUNCH_EXTRAS: LaunchStation[]` (3)
  - `resolve-launch-journey.ts`: `type StationState = "done" | "current" | "todo"`, `interface JourneyStation { station: LaunchStation; state: StationState; hint: string; details: { id: number; name: string }[] }`, `interface JourneyExtra { station: LaunchStation; ok: boolean; hint: string }`, `interface LaunchJourney { stations: JourneyStation[]; extras: JourneyExtra[]; doneCount: number; total: number; current: JourneyStation | null }`, `resolveLaunchJourney(checks: ReadinessCheck[]): LaunchJourney`
  - `resolve-launch-visibility.ts`: `type LaunchVisibility = "hidden" | "journey" | "celebrate"`, `canSeeLaunchJourney(roleIds: number[]): boolean`, `resolveLaunchVisibility(input: { roleIds: number[]; selectedBranchId: number | null; readiness: BranchReadiness | undefined; flags: { seen: boolean; celebrated: boolean } }): LaunchVisibility`
  - `launch-storage.ts`: `type LaunchFlag = "collapsed" | "seen" | "celebrated"`, `interface StorageLike`, `launchStorageKey(userId, branchId, flag): string`, `readLaunchFlag(userId, branchId, flag, store?): boolean`, `writeLaunchFlag(userId, branchId, flag, value, store?): void`

- [ ] **Step 1: Failing testlarni yozing**

`client/src/components/dashboard/launch/resolve-launch-journey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ReadinessCheck, ReadinessKey } from "./launch-types";
import { resolveLaunchJourney } from "./resolve-launch-journey";

const c = (
  key: ReadinessKey,
  ok: boolean,
  extra: Partial<ReadinessCheck> = {},
): ReadinessCheck => ({ key, label: key, ok, required: true, hint: `${key}-hint`, ...extra });

const STATION_KEYS: ReadinessKey[] = [
  "workingHours",
  "room",
  "course",
  "teachers",
  "teacherRates",
  "group",
  "enrollment",
  "payment",
];

describe("resolveLaunchJourney", () => {
  it("8 bekat qat'iy tartibda", () => {
    const j = resolveLaunchJourney([]);
    expect(j.stations.map((s) => s.station.key)).toEqual(STATION_KEYS);
    expect(j.total).toBe(8);
  });

  it("joriy — tartibdagi birinchi bajarilmagan bekat", () => {
    const j = resolveLaunchJourney([
      c("workingHours", true),
      c("room", true),
      c("course", false),
      c("teachers", false),
    ]);
    expect(j.stations.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
    expect(j.current?.station.key).toBe("course");
    expect(j.doneCount).toBe(2);
  });

  it("qulf yo'q: keyingi bekat oldinroq bajarilsa ham done", () => {
    const j = resolveLaunchJourney([c("workingHours", false), c("enrollment", true)]);
    expect(j.stations.find((s) => s.station.key === "enrollment")?.state).toBe("done");
    expect(j.current?.station.key).toBe("workingHours");
  });

  it("serverda yo'q kalit — bajarilmagan hisoblanadi", () => {
    const j = resolveLaunchJourney([c("workingHours", true)]);
    expect(j.stations.find((s) => s.station.key === "payment")?.state).toBe("todo");
  });

  it("izoh va ismlar serverdan keladi", () => {
    const j = resolveLaunchJourney([
      c("teacherRates", false, {
        hint: "1 ta ustozga stavka qo'yilmagan",
        details: [{ id: 1, name: "Ali Valiyev" }],
      }),
    ]);
    const rates = j.stations.find((s) => s.station.key === "teacherRates")!;
    expect(rates.hint).toBe("1 ta ustozga stavka qo'yilmagan");
    expect(rates.details).toEqual([{ id: 1, name: "Ali Valiyev" }]);
  });

  it("qo'shimcha uchtasi alohida, holati bilan", () => {
    const j = resolveLaunchJourney([
      c("administrator", true, { required: false }),
      c("leadSection", false, { required: false }),
    ]);
    expect(j.extras.map((x) => [x.station.key, x.ok])).toEqual([
      ["administrator", true],
      ["leadSection", false],
      ["telegramGroup", false],
    ]);
  });

  it("hammasi bajarilgan — joriy bekat yo'q", () => {
    const j = resolveLaunchJourney(STATION_KEYS.map((k) => c(k, true)));
    expect(j.current).toBeNull();
    expect(j.doneCount).toBe(8);
  });
});
```

`client/src/components/dashboard/launch/resolve-launch-visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BranchReadiness } from "./launch-types";
import { resolveLaunchVisibility } from "./resolve-launch-visibility";

const readiness = (over: Partial<BranchReadiness> = {}): BranchReadiness => ({
  branchId: 2,
  branchName: "Namangan",
  ready: false,
  launched: false,
  checks: [],
  ...over,
});

const base = {
  roleIds: [2],
  selectedBranchId: 2,
  readiness: readiness(),
  flags: { seen: false, celebrated: false },
};

describe("resolveLaunchVisibility", () => {
  it("direktor, ishga tushmagan filial → xarita", () => {
    expect(resolveLaunchVisibility(base)).toBe("journey");
  });

  it("CEO aniq filialni tanlaganda ham ko'radi", () => {
    expect(resolveLaunchVisibility({ ...base, roleIds: [1] })).toBe("journey");
  });

  it("CEO «Barcha filiallar»da ko'rmaydi", () => {
    expect(
      resolveLaunchVisibility({ ...base, roleIds: [1], selectedBranchId: null }),
    ).toBe("hidden");
  });

  it.each([[[3]], [[4]], [[5]], [[3, 5]], [[]]])("%j rollariga ko'rinmaydi", (roleIds) => {
    expect(resolveLaunchVisibility({ ...base, roleIds })).toBe("hidden");
  });

  it("direktor + administrator — ko'radi", () => {
    expect(resolveLaunchVisibility({ ...base, roleIds: [2, 3] })).toBe("journey");
  });

  it("so'rov yiqilgan yoki hali kelmagan → yashirin", () => {
    expect(resolveLaunchVisibility({ ...base, readiness: undefined })).toBe("hidden");
  });

  it("eski server (launched maydoni yo'q) → yashirin", () => {
    const old = { branchId: 2, branchName: "N", ready: false, checks: [] } as unknown as BranchReadiness;
    expect(resolveLaunchVisibility({ ...base, readiness: old })).toBe("hidden");
  });

  it("boshqa filialning eskirgan javobi → yashirin", () => {
    expect(
      resolveLaunchVisibility({ ...base, readiness: readiness({ branchId: 1 }) }),
    ).toBe("hidden");
  });

  it("ishga tushdi, karta ko'rilgan, tabrik hali yo'q → tabrik", () => {
    expect(
      resolveLaunchVisibility({
        ...base,
        readiness: readiness({ launched: true }),
        flags: { seen: true, celebrated: false },
      }),
    ).toBe("celebrate");
  });

  it("tabrik yopilgan → yashirin", () => {
    expect(
      resolveLaunchVisibility({
        ...base,
        readiness: readiness({ launched: true }),
        flags: { seen: true, celebrated: true },
      }),
    ).toBe("hidden");
  });

  it("Farg'ona: ishlab turgan, karta hech qachon ko'rilmagan → yashirin", () => {
    expect(
      resolveLaunchVisibility({ ...base, readiness: readiness({ launched: true }) }),
    ).toBe("hidden");
  });
});
```

`client/src/components/dashboard/launch/launch-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { launchStorageKey, readLaunchFlag, writeLaunchFlag } from "./launch-storage";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("launch-storage", () => {
  it("kalitda foydalanuvchi va filial bor", () => {
    expect(launchStorageKey(90010, 2, "seen")).toBe("daf.launch.90010.2.seen");
  });

  it("yozilgan belgi o'qiladi va boshqa foydalanuvchi yoki filialga o'tmaydi", () => {
    const s = memoryStore();
    writeLaunchFlag(90010, 2, "seen", true, s);
    expect(readLaunchFlag(90010, 2, "seen", s)).toBe(true);
    expect(readLaunchFlag(90999, 2, "seen", s)).toBe(false);
    expect(readLaunchFlag(90010, 1, "seen", s)).toBe(false);
  });

  it("false yozish belgini o'chiradi", () => {
    const s = memoryStore();
    writeLaunchFlag(90010, 2, "collapsed", true, s);
    writeLaunchFlag(90010, 2, "collapsed", false, s);
    expect(s.m.size).toBe(0);
  });

  it("xotira yo'q yoki taqiqlangan — xato chiqarmaydi", () => {
    const denied = () => {
      throw new Error("denied");
    };
    const broken = { getItem: denied, setItem: denied, removeItem: denied };
    expect(readLaunchFlag(1, 2, "seen", broken)).toBe(false);
    expect(() => writeLaunchFlag(1, 2, "seen", true, broken)).not.toThrow();
    expect(readLaunchFlag(1, 2, "seen", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Testlar yiqilishini tekshiring**

Run: `cd client && npx vitest run src/components/dashboard/launch`
Expected: FAIL — modullar topilmaydi.

- [ ] **Step 3: Tiplar va bekatlar**

`client/src/components/dashboard/launch/launch-types.ts`:

```ts
/**
 * `GET /branches/:id/readiness` javobi — `server/src/branches/branch-readiness.ts`
 * dagi tiplar bilan AYNAN bir xil. Biri o'zgarsa, ikkinchisi ham.
 */
export type ReadinessKey =
  | "cashAccount"
  | "bankAccount"
  | "workingHours"
  | "room"
  | "course"
  | "teachers"
  | "teacherRates"
  | "group"
  | "enrollment"
  | "payment"
  | "administrator"
  | "leadSection"
  | "telegramGroup";

export interface ReadinessCheck {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  /** `false` — «Qo'shimcha»: kartaning `launched` holatiga ta'sir qilmaydi. */
  required: boolean;
  hint: string;
  details?: { id: number; name: string }[];
}

export interface BranchReadiness {
  branchId: number;
  branchName: string;
  ready: boolean;
  /** To'liq guruh + yozilgan o'quvchi + to'lov — karta shunda yo'qoladi. */
  launched: boolean;
  checks: ReadinessCheck[];
}
```

`client/src/components/dashboard/launch/launch-stations.ts`:

```ts
import type { ReadinessKey } from "./launch-types";

/**
 * Yo'l xaritasining bekatlari — nom, tur matni va tur qayerga olib borishi.
 *
 * `targets` — sahifadagi tugmaning `data-tour` qiymati (CSS klass emas: klass
 * uslub bilan birga o'zgaradi, atribut esa faqat shu maqsadda turadi).
 * Bir nechta bo'lsa, birinchi topilgani yoritiladi. `launch-targets.test.ts`
 * har biri manbada borligini tekshiradi.
 */
export interface LaunchStation {
  key: ReadinessKey;
  /** Xaritadagi qisqa nom. */
  short: string;
  /** Tugma matni — fe'l bilan. */
  action: string;
  tourTitle: string;
  tourBody: string;
  route: (branchId: number) => string;
  targets: string[];
}

export const LAUNCH_STATIONS: LaunchStation[] = [
  {
    key: "workingHours",
    short: "Ish vaqti",
    action: "Ish vaqtini kiritish",
    tourTitle: "Ish vaqti",
    tourBody:
      "Filial qaysi soatda ochilib yopilishini kiriting. Guruh jadvali shu oraliqda tuziladi.",
    route: (id) => `/settings/branches/${id}`,
    targets: ["branch-edit"],
  },
  {
    key: "room",
    short: "Xona",
    action: "Xona qo'shish",
    tourTitle: "Xona qo'shing",
    tourBody: "Xonasiz guruh kunlik jadvalda ko'rinmaydi.",
    route: (id) => `/settings/rooms/${id}`,
    targets: ["room-add"],
  },
  {
    key: "course",
    short: "Kurs",
    action: "Kurs qo'shish",
    tourTitle: "Kurs qo'shing",
    tourBody:
      "Nomi, narxi, to'lov modeli va necha darsga bo'linishi. Guruh ochish uchun kamida bitta kurs kerak.",
    route: () => "/settings/courses",
    targets: ["course-add"],
  },
  {
    key: "teachers",
    short: "Ustoz",
    action: "Ustoz qo'shish",
    tourTitle: "Ustozlarni qo'shing",
    tourBody:
      "Havolani ustozlarga yuboring — ular Telegram orqali o'zi ro'yxatdan o'tadi va shu filialga tushadi. Yoki qo'lda qo'shing.",
    route: () => "/teachers",
    targets: ["teacher-invite-link", "teacher-add"],
  },
  {
    key: "teacherRates",
    short: "Stavka",
    action: "Stavka qo'yish",
    tourTitle: "Stavka qo'ying",
    tourBody:
      "«Sozlamalar» → «Ustoz stavkalari». Stavkasiz ustozni guruhga biriktirib bo'lmaydi.",
    route: () => "/payments/salary",
    targets: ["salary-settings"],
  },
  {
    key: "group",
    short: "Guruh",
    action: "Guruh ochish",
    tourTitle: "Guruh oching",
    tourBody: "Kurs, xona, ustoz, dars kunlari va boshlanish sanasini kiriting.",
    route: () => "/groups",
    targets: ["group-add"],
  },
  {
    key: "enrollment",
    short: "O'quvchi",
    action: "O'quvchi qo'shish",
    tourTitle: "O'quvchi qo'shing",
    tourBody: "O'quvchini qo'shing va guruhga yozing.",
    route: () => "/students",
    targets: ["student-add"],
  },
  {
    key: "payment",
    short: "To'lov",
    action: "To'lov qayd qilish",
    tourTitle: "Birinchi to'lov",
    tourBody:
      "Birinchi to'lovni qayd qiling — shundan keyin filial ishga tushgan hisoblanadi.",
    route: () => "/payments/overview",
    targets: ["payment-record"],
  },
];

/** Ixtiyoriy — `launched` ga kirmaydi. */
export const LAUNCH_EXTRAS: LaunchStation[] = [
  {
    key: "administrator",
    short: "Administrator",
    action: "Administrator qo'shish",
    tourTitle: "Administrator qo'shing",
    tourBody: "Administratorsiz davomat ogohlantirishlari hech kimga bormaydi.",
    route: () => "/settings/employees",
    targets: ["employee-add"],
  },
  {
    key: "leadSection",
    short: "Lid bo'limi",
    action: "Lid bo'limi ochish",
    tourTitle: "Lid bo'limi oching",
    tourBody: "Lidlar va onlayn formalar shu bo'limga tushadi.",
    route: () => "/leads",
    targets: ["lead-section-add"],
  },
  {
    key: "telegramGroup",
    short: "Telegram guruh",
    action: "Telegram guruhni ulash",
    tourTitle: "Telegram hisobot guruhi",
    tourBody: "Sahifadagi yo'riqnoma bo'yicha botni guruhga qo'shing va tasdiqlang.",
    route: () => "/settings/telegram-groups",
    // Sahifaning o'zida qadamma-qadam yo'riqnoma bor — yoritadigan tugma yo'q.
    targets: [],
  },
];
```

- [ ] **Step 4: Sof funksiyalar va xotira**

`client/src/components/dashboard/launch/resolve-launch-journey.ts`:

```ts
import { LAUNCH_EXTRAS, LAUNCH_STATIONS, type LaunchStation } from "./launch-stations";
import type { ReadinessCheck, ReadinessKey } from "./launch-types";

export type StationState = "done" | "current" | "todo";

export interface JourneyStation {
  station: LaunchStation;
  state: StationState;
  hint: string;
  details: { id: number; name: string }[];
}

export interface JourneyExtra {
  station: LaunchStation;
  ok: boolean;
  hint: string;
}

export interface LaunchJourney {
  stations: JourneyStation[];
  extras: JourneyExtra[];
  doneCount: number;
  total: number;
  current: JourneyStation | null;
}

/**
 * Server tekshiruvlari → yo'l xaritasi. «Joriy» — tartibdagi birinchi
 * bajarilmagan bekat; qulf yo'q, tartib faqat tavsiya (o'quvchini guruhsiz
 * ham qo'shish mumkin). Serverda yo'q kalit bajarilmagan deb olinadi — eski
 * server bilan jimgina «bajarildi» chiqmasin.
 */
export function resolveLaunchJourney(checks: ReadinessCheck[]): LaunchJourney {
  const byKey = new Map<ReadinessKey, ReadinessCheck>(checks.map((c) => [c.key, c]));
  let currentTaken = false;

  const stations = LAUNCH_STATIONS.map((station): JourneyStation => {
    const check = byKey.get(station.key);
    const ok = check?.ok ?? false;
    let state: StationState = ok ? "done" : "todo";
    if (!ok && !currentTaken) {
      state = "current";
      currentTaken = true;
    }
    return { station, state, hint: check?.hint ?? "", details: check?.details ?? [] };
  });

  const extras = LAUNCH_EXTRAS.map((station): JourneyExtra => {
    const check = byKey.get(station.key);
    return { station, ok: check?.ok ?? false, hint: check?.hint ?? "" };
  });

  return {
    stations,
    extras,
    doneCount: stations.filter((s) => s.state === "done").length,
    total: stations.length,
    current: stations.find((s) => s.state === "current") ?? null,
  };
}
```

`client/src/components/dashboard/launch/resolve-launch-visibility.ts`:

```ts
import { ROLE_BRANCH_DIRECTOR, ROLE_CEO } from "../dashboard-home-visibility";
import type { BranchReadiness } from "./launch-types";

export type LaunchVisibility = "hidden" | "journey" | "celebrate";

/**
 * Kartani CEO va filial direktori ko'radi. `readiness` endpointi ham faqat
 * shularga ochiq — boshqasiga so'rov yuborilsa 403 global toast chiqadi,
 * shuning uchun bu funksiya so'rovni yoqish/yoqmaslikni ham hal qiladi.
 */
export function canSeeLaunchJourney(roleIds: number[]): boolean {
  return roleIds.includes(ROLE_CEO) || roleIds.includes(ROLE_BRANCH_DIRECTOR);
}

/**
 * Kartaning uch holati (spec §4.4):
 * - `journey` — filial hali ishga tushmagan;
 * - `celebrate` — ishga tushdi va bu foydalanuvchi kartani avval ko'rgan;
 * - `hidden` — qolgan hamma holat. Ishlab turgan filialda (Farg'ona) karta
 *   hech qachon ko'rilmagan, shuning uchun tabrik ham chiqmaydi.
 */
export function resolveLaunchVisibility(input: {
  roleIds: number[];
  selectedBranchId: number | null;
  readiness: BranchReadiness | undefined;
  flags: { seen: boolean; celebrated: boolean };
}): LaunchVisibility {
  const { roleIds, selectedBranchId, readiness, flags } = input;
  if (!canSeeLaunchJourney(roleIds)) return "hidden";
  // CEO «Barcha filiallar»: qaysi filialning yo'li ekani noaniq.
  if (selectedBranchId === null) return "hidden";
  // So'rov yiqilgan yoki eski server — yordamchi vosita jim turadi.
  if (!readiness || typeof readiness.launched !== "boolean") return "hidden";
  if (readiness.branchId !== selectedBranchId) return "hidden";
  if (!readiness.launched) return "journey";
  if (flags.seen && !flags.celebrated) return "celebrate";
  return "hidden";
}
```

`client/src/components/dashboard/launch/launch-storage.ts`:

```ts
/**
 * Karta belgilari brauzerda — har foydalanuvchi va har filial uchun alohida.
 *
 * `userId` kalitda SHART: logout faqat `companyId` va `branchId` ni tozalaydi
 * (`hooks/use-auth.ts`), kalitsiz belgi shu kompyuterdagi keyingi xodimga
 * o'tib ketardi. Har o'qish/yozish `try/catch` ichida — xotira taqiqlangan
 * brauzerda karta baribir ishlaydi, faqat eslab qolmaydi.
 */
export type LaunchFlag = "collapsed" | "seen" | "celebrated";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function launchStorageKey(userId: number, branchId: number, flag: LaunchFlag): string {
  return `daf.launch.${userId}.${branchId}.${flag}`;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLaunchFlag(
  userId: number,
  branchId: number,
  flag: LaunchFlag,
  store: StorageLike | null = browserStorage(),
): boolean {
  try {
    return store?.getItem(launchStorageKey(userId, branchId, flag)) === "1";
  } catch {
    return false;
  }
}

export function writeLaunchFlag(
  userId: number,
  branchId: number,
  flag: LaunchFlag,
  value: boolean,
  store: StorageLike | null = browserStorage(),
): void {
  try {
    const key = launchStorageKey(userId, branchId, flag);
    if (value) store?.setItem(key, "1");
    else store?.removeItem(key);
  } catch {
    // Xotira yo'q — eslab qolmaymiz, karta baribir ishlaydi.
  }
}
```

- [ ] **Step 5: Testlar o'tishini tekshiring**

Run: `cd client && npx vitest run src/components/dashboard/launch`
Expected: PASS (3 fayl).

Run: `cd client && npm run typecheck`
Expected: xatosiz.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/dashboard/launch
git commit -m "$(cat <<'EOF'
Ishga tushirish yo'li: bekatlar va sof mantiq

8 bekat + 3 qo'shimcha, xarita holati, karta ko'rinishi va
foydalanuvchi+filial kalitli brauzer belgilari — testlar bilan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Klient — tur (spotlight): store, sof yordamchilar, chizuvchi

**Files:**
- Create: `client/src/components/spotlight/spotlight-target.ts`
- Test: `client/src/components/spotlight/spotlight-target.test.ts`
- Create: `client/src/hooks/use-spotlight.ts`
- Create: `client/src/components/spotlight/spotlight-host.tsx`
- Modify: `client/src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `registerBranchScopedStore` — `client/src/lib/branch-scoped-stores.ts`; `Popover`, `PopoverAnchor`, `PopoverContent`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription` — `client/src/components/ui/popover.tsx`
- Produces:
  - `spotlightSelector(id: string): string`, `resolveSpotlightTarget<T>(targets: string[], lookup: (selector: string) => T | null): T | null`, `interface SpotlightBox { top: number; left: number; width: number; height: number }`, `spotlightBox(rect, padding = 6): SpotlightBox`
  - `interface SpotlightStep { route: string; targets: string[]; title: string; body: string }`, `useSpotlight` (zustand: `step: SpotlightStep | null`, `seq: number`, `start(step)`, `stop()`)
  - `SpotlightHost` (props yo'q)

- [ ] **Step 1: Failing testni yozing**

`client/src/components/spotlight/spotlight-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSpotlightTarget, spotlightBox, spotlightSelector } from "./spotlight-target";

describe("spotlight-target", () => {
  it("data-tour selektori", () => {
    expect(spotlightSelector("room-add")).toBe('[data-tour="room-add"]');
  });

  it("birinchi mavjud nomzod tanlanadi", () => {
    const dom: Record<string, string> = { '[data-tour="teacher-add"]': "add" };
    expect(
      resolveSpotlightTarget(["teacher-invite-link", "teacher-add"], (s) => dom[s] ?? null),
    ).toBe("add");
  });

  it("ikkalasi bo'lsa — tartibdagi birinchisi", () => {
    const dom: Record<string, string> = {
      '[data-tour="teacher-invite-link"]': "link",
      '[data-tour="teacher-add"]': "add",
    };
    expect(
      resolveSpotlightTarget(["teacher-invite-link", "teacher-add"], (s) => dom[s] ?? null),
    ).toBe("link");
  });

  it("hech biri yo'q → null", () => {
    expect(resolveSpotlightTarget(["x"], () => null)).toBeNull();
  });

  it("quti elementdan har tomonga 6px kengroq", () => {
    expect(spotlightBox({ top: 100, left: 50, width: 80, height: 32 })).toEqual({
      top: 94,
      left: 44,
      width: 92,
      height: 44,
    });
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshiring**

Run: `cd client && npx vitest run src/components/spotlight`
Expected: FAIL — modul topilmaydi.

- [ ] **Step 3: Sof yordamchilar va store**

`client/src/components/spotlight/spotlight-target.ts`:

```ts
/** Tur nishoni — `data-tour` atributi (CSS klass emas, u uslub bilan o'zgaradi). */
export function spotlightSelector(id: string): string {
  return `[data-tour="${id}"]`;
}

/**
 * Nomzodlardan birinchi mavjudini qaytaradi; tartib — ustuvorlik
 * (masalan, «Havola olish» bo'lmasa «Yangi o'qituvchi»). `lookup` DOM'ni
 * ko'radi — shu sabab funksiya node testida soxta `lookup` bilan sinaladi.
 */
export function resolveSpotlightTarget<T>(
  targets: string[],
  lookup: (selector: string) => T | null,
): T | null {
  for (const id of targets) {
    const found = lookup(spotlightSelector(id));
    if (found) return found;
  }
  return null;
}

export interface SpotlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function spotlightBox(
  rect: { top: number; left: number; width: number; height: number },
  padding = 6,
): SpotlightBox {
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}
```

`client/src/hooks/use-spotlight.ts`:

```ts
import { create } from "zustand";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";

/** Bitta yoritish: qaysi sahifada, qaysi tugma, qanday izoh. */
export interface SpotlightStep {
  /** Faqat shu sahifada qidiriladi (`usePathname()` bilan aynan teng). */
  route: string;
  /** `data-tour` nomzodlari — birinchi topilgani yoritiladi. */
  targets: string[];
  title: string;
  body: string;
}

interface SpotlightState {
  step: SpotlightStep | null;
  /** Har `start` da oshadi — chizuvchi yangi turni noldan boshlashi uchun `key`. */
  seq: number;
  start: (step: SpotlightStep) => void;
  stop: () => void;
}

export const useSpotlight = create<SpotlightState>((set) => ({
  step: null,
  seq: 0,
  start: (step) => set((s) => ({ step, seq: s.seq + 1 })),
  stop: () => set({ step: null }),
}));

// Filial almashsa, ochiq tur boshqa filialning sahifasida qolib ketmasin.
registerBranchScopedStore(useSpotlight);
```

- [ ] **Step 4: Chizuvchi va uni layout'ga ulash**

`client/src/components/spotlight/spotlight-host.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { useSpotlight, type SpotlightStep } from "@/hooks/use-spotlight";
import { resolveSpotlightTarget, spotlightBox, type SpotlightBox } from "./spotlight-target";

/** Sahifa ochilgach tugma shuncha kutiladi — ma'lumot yuklanib tugma chiqadi. */
const FIND_TIMEOUT_MS = 5_000;
/** Tur boshlandi-yu, sahifaga yetib kelinmadi — eskirgan turni tashlash. */
const ARRIVE_TIMEOUT_MS = 15_000;

function findVisible(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length > 0 ? el : null;
}

/**
 * Turning yagona chizuvchisi — layout'da bir marta, `<main>` dan TASHQARIDA,
 * chunki tur sahifa almashgandan KEYIN boshlanadi.
 *
 * `step` bor va `pathname === step.route` → tugma 5 soniyagacha kutiladi →
 * topilsa atrofi xiralashadi va Popover ochiladi, topilmasa izoh toast bo'lib
 * chiqadi. Yopilish: «Tushundim», Esc yoki istalgan joyni bosish — Radix
 * `onOpenChange(false)` beradi, bosilgan tugma esa o'z ishini baribir qiladi
 * (modal emas, tashqi bosish bloklanmaydi); boshqa sahifaga o'tish ham yopadi.
 */
export function SpotlightHost() {
  const step = useSpotlight((s) => s.step);
  const seq = useSpotlight((s) => s.seq);
  if (!step) return null;
  // `key` — yangi tur oldingisining holatini (topilgan tugma, quti) meros
  // olmaydi; tozalash effekti kerak emas.
  return <SpotlightRunner key={seq} step={step} />;
}

function SpotlightRunner({ step }: { step: SpotlightStep }) {
  const stop = useSpotlight((s) => s.stop);
  const pathname = usePathname();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<SpotlightBox | null>(null);
  const arrivedRef = useRef(false);

  // Sahifaga yetib keldikmi? Yetib kelib, keyin boshqa sahifaga o'tilsa —
  // yopish; umuman yetib kelinmasa — eskirgan turni tashlash.
  useEffect(() => {
    if (pathname === step.route) {
      arrivedRef.current = true;
      return;
    }
    if (arrivedRef.current) {
      stop();
      return;
    }
    const t = window.setTimeout(stop, ARRIVE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [step.route, pathname, stop]);

  // Tugmani kutish.
  useEffect(() => {
    if (pathname !== step.route || target) return;
    const lookup = () => resolveSpotlightTarget(step.targets, findVisible);
    const show = (el: HTMLElement) => {
      el.scrollIntoView({ block: "center" });
      setTarget(el);
    };

    const found = lookup();
    if (found) {
      show(found);
      return;
    }

    let timer = 0;
    const observer = new MutationObserver(() => {
      const el = lookup();
      if (!el) return;
      observer.disconnect();
      window.clearTimeout(timer);
      show(el);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    timer = window.setTimeout(() => {
      observer.disconnect();
      toast(`${step.title}: ${step.body}`, { duration: 6000 });
      stop();
    }, FIND_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [step, pathname, target, stop]);

  // Joylashuv: scroll va o'lcham o'zgarsa qayta o'lchanadi; tugma DOM'dan
  // chiqib ketsa (ro'yxat qayta chizildi) — tur yopiladi.
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target.isConnected) {
          stop();
          return;
        }
        setBox(spotlightBox(target.getBoundingClientRect()));
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [target, stop]);

  if (!target || !box) return null;

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) stop();
      }}
    >
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
          }}
        />
      </PopoverAnchor>
      <PopoverContent side="bottom" align="start" className="z-[61] w-80">
        <PopoverHeader>
          <PopoverTitle>{step.title}</PopoverTitle>
          <PopoverDescription>{step.body}</PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={stop}>
            Tushundim
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

`client/src/app/(dashboard)/layout.tsx` — import qo'shing:

```tsx
import { SpotlightHost } from "@/components/spotlight/spotlight-host";
```

va `<BranchScopedMain>{children}</BranchScopedMain>` qatoridan keyin (hali
`SidebarInset` ichida):

```tsx
        {/* Tur sahifa almashgandan keyin boshlanadi — shuning uchun `<main>`
            dan tashqarida: filial almashganda qayta mount bo'lmaydi, store'i
            esa `registerBranchScopedStore` bilan o'zi tozalanadi. */}
        <SpotlightHost />
```

- [ ] **Step 5: Testlar o'tishini tekshiring**

Run: `cd client && npx vitest run src/components/spotlight src/lib/branch-scoped-stores.test.ts`
Expected: PASS.

Run: `cd client && npm run typecheck && npm run lint`
Expected: xatosiz.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/spotlight client/src/hooks/use-spotlight.ts "client/src/app/(dashboard)/layout.tsx"
git commit -m "$(cat <<'EOF'
Tur: kerakli tugmani yorituvchi spotlight

data-tour nomzodlari, 5 soniya kutish, topilmasa toast; Radix Popover
Esc va tashqi bosishni o'zi yopadi. Yangi kutubxona yo'q.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Klient — «Filialni ishga tushirish» kartasi

**Files:**
- Create: `client/src/hooks/use-branch-readiness.ts`
- Create: `client/src/components/dashboard/launch/branch-launch-card.tsx`
- Modify: `client/src/components/dashboard-client.tsx`

**Interfaces:**
- Consumes: `BranchReadiness` (Task 5), `LAUNCH_*`, `resolveLaunchJourney`, `canSeeLaunchJourney`, `resolveLaunchVisibility`, `readLaunchFlag`, `writeLaunchFlag` (Task 5); `useSpotlight`, `SpotlightStep` (Task 6); `useAuth` (`user.id`, `user.roles[].id`), `useBranchSwitcher` (`selectedBranch`, `loaded`)
- Produces: `useBranchReadiness(branchId: number | null, enabled: boolean)`, `BranchLaunchCard` (props yo'q)

Render testi yo'q (vitest `node`); qaror mantiqi Task 5 da sinalgan. Bu vazifaning
tekshiruvi — typecheck, lint va 11-vazifadagi qo'lda yurish.

- [ ] **Step 1: So'rov hook'i**

`client/src/hooks/use-branch-readiness.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BranchReadiness } from "@/components/dashboard/launch/launch-types";

/**
 * `GET /branches/:id/readiness` — faqat CEO va filial direktoriga ochiq.
 * `enabled` ni chaqiruvchi `canSeeLaunchJourney` bilan hal qiladi:
 * administratorga so'rov ketmasligi SHART, aks holda 403 global toast chiqadi
 * (`lib/api.ts`).
 */
export function useBranchReadiness(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["branch-readiness", branchId],
    queryFn: () =>
      api.get<BranchReadiness>(`/branches/${branchId}/readiness`).then((r) => r.data),
    enabled: enabled && branchId !== null,
    // Direktor bekatni bajarib bosh sahifaga qaytganda xarita darhol yangilansin.
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
}
```

- [ ] **Step 2: Karta**

`client/src/components/dashboard/launch/branch-launch-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useBranchReadiness } from "@/hooks/use-branch-readiness";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useSpotlight } from "@/hooks/use-spotlight";
import type { LaunchStation } from "./launch-stations";
import { readLaunchFlag, writeLaunchFlag } from "./launch-storage";
import { resolveLaunchJourney, type JourneyStation } from "./resolve-launch-journey";
import { canSeeLaunchJourney, resolveLaunchVisibility } from "./resolve-launch-visibility";

/**
 * «Filialni ishga tushirish» — bosh sahifadagi yo'l xaritasi
 * (docs/superpowers/specs/2026-09-24-filial-ishga-tushirish-yoli-design.md).
 *
 * Bekat holati bazadan keladi, qo'lda belgilanmaydi. Kim ko'rishi va karta
 * qachon yo'qolishi — `resolveLaunchVisibility` da, test bilan.
 */
export function BranchLaunchCard() {
  const user = useAuth((s) => s.user);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const startSpotlight = useSpotlight((s) => s.start);
  const router = useRouter();

  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const branchId = selectedBranch?.id ?? null;
  const { data } = useBranchReadiness(branchId, branchLoaded && canSeeLaunchJourney(roleIds));

  // Brauzer xotirasi faqat mount'dan keyin o'qiladi — server render bilan mos.
  const [flags, setFlags] = useState({ seen: false, celebrated: false, collapsed: false });
  useEffect(() => {
    if (!user || branchId === null) return;
    setFlags({
      seen: readLaunchFlag(user.id, branchId, "seen"),
      celebrated: readLaunchFlag(user.id, branchId, "celebrated"),
      collapsed: readLaunchFlag(user.id, branchId, "collapsed"),
    });
  }, [user, branchId]);

  const visibility = resolveLaunchVisibility({
    roleIds,
    selectedBranchId: branchId,
    readiness: data,
    flags,
  });

  // Karta xarita holatida chizildi — «ko'rilgan». Keyin `launched` bo'lganda
  // tabrik faqat shunday foydalanuvchiga chiqadi.
  useEffect(() => {
    if (visibility !== "journey" || !user || branchId === null || flags.seen) return;
    writeLaunchFlag(user.id, branchId, "seen", true);
    setFlags((f) => ({ ...f, seen: true }));
  }, [visibility, user, branchId, flags.seen]);

  if (visibility === "hidden" || !user || branchId === null || !data) return null;

  if (visibility === "celebrate") {
    const close = () => {
      writeLaunchFlag(user.id, branchId, "celebrated", true);
      setFlags((f) => ({ ...f, celebrated: true }));
    };
    return (
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <PartyPopper className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Filial ishga tushdi</p>
            <p className="text-sm text-muted-foreground">
              Guruh ochildi, o&apos;quvchilar yozildi va birinchi to&apos;lov qayd qilindi.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={close}>
            Yopish
          </Button>
        </div>
      </section>
    );
  }

  const journey = resolveLaunchJourney(data.checks);

  const go = (station: LaunchStation) => {
    const route = station.route(branchId);
    if (station.targets.length > 0) {
      startSpotlight({
        route,
        targets: station.targets,
        title: station.tourTitle,
        body: station.tourBody,
      });
    }
    router.push(route);
  };

  const toggleCollapsed = () => {
    const next = !flags.collapsed;
    writeLaunchFlag(user.id, branchId, "collapsed", next);
    setFlags((f) => ({ ...f, collapsed: next }));
  };

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="launch-title">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="launch-title" className="text-sm font-semibold">
          Filialni ishga tushirish
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {journey.doneCount} / {journey.total}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={toggleCollapsed}
            aria-expanded={!flags.collapsed}
            aria-label={flags.collapsed ? "Xaritani ochish" : "Xaritani yig'ish"}
          >
            {flags.collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </div>
      </div>

      {!flags.collapsed && (
        <div className="space-y-4 px-4 py-4">
          <ol className="grid gap-1 sm:grid-cols-8 sm:gap-0">
            {journey.stations.map((s, i) => (
              <StationStop
                key={s.station.key}
                item={s}
                index={i}
                isLast={i === journey.stations.length - 1}
                onClick={() => go(s.station)}
              />
            ))}
          </ol>

          {journey.current && (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p>
                  <span className="text-muted-foreground">Keyingi: </span>
                  {journey.current.hint}
                </p>
                {journey.current.details.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    {journey.current.details.map((d) => d.name).join(", ")}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => go(journey.current!.station)}
              >
                {journey.current.station.action}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Qo&apos;shimcha:</span>
            {journey.extras.map((x) => (
              <button
                key={x.station.key}
                type="button"
                onClick={() => go(x.station)}
                title={x.hint}
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                {x.ok ? (
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                )}
                {x.station.short}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StationStop({
  item,
  index,
  isLast,
  onClick,
}: {
  item: JourneyStation;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) {
  const { state, station } = item;
  return (
    <li className="relative">
      {/* Bekatlar orasidagi chiziq — faqat gorizontal xaritada. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-[18px] left-[calc(50%+16px)] right-[calc(-50%+16px)] hidden border-t border-dashed sm:block"
        />
      )}
      <button
        type="button"
        onClick={onClick}
        aria-current={state === "current" ? "step" : undefined}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60 sm:flex-col sm:gap-1.5 sm:text-center"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            state === "done" &&
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
            state === "current" && "bg-primary/10 text-primary ring-2 ring-primary",
            state === "todo" && "border bg-background text-muted-foreground",
          )}
        >
          {state === "done" ? <Check className="size-4" /> : index + 1}
        </span>
        <span
          className={cn(
            "text-xs",
            state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {station.short}
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 3: Bosh sahifaga ulash**

`client/src/components/dashboard-client.tsx` — import:

```tsx
import { BranchLaunchCard } from "@/components/dashboard/launch/branch-launch-card";
```

oxirgi `return <HomeOverview />;` ni almashtiring:

```tsx
  // Karta o'z so'rovi bilan — panel (`/dashboard/summary`) yuklanishini ham,
  // yiqilishini ham kutmaydi. Ko'rinmasa `null`, bo'sh joy qoldirmaydi.
  return (
    <div className="space-y-4 sm:space-y-6">
      <BranchLaunchCard />
      <HomeOverview />
    </div>
  );
```

- [ ] **Step 4: Tekshiring**

Run: `cd client && npm run typecheck && npm run lint && npx vitest run`
Expected: xatosiz, barcha testlar yashil.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/use-branch-readiness.ts client/src/components/dashboard/launch/branch-launch-card.tsx client/src/components/dashboard-client.tsx
git commit -m "$(cat <<'EOF'
Bosh sahifa: «Filialni ishga tushirish» kartasi

8 bekatli xarita, «Keyingi» izohi va tugmasi, qo'shimcha qatori;
bekat bosilganda sahifaga o'tib tugma yoritiladi. Filial ishga
tushganda bir marta tabrik, keyin karta yo'qoladi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Klient — tur nishonlari (`data-tour`) va ularning qo'riqchi testi

**Files:**
- Test: `client/src/components/dashboard/launch/launch-targets.test.ts`
- Modify (hammasi `client/src/components/` ostida):
  - `settings/branch-detail-client.tsx` (~136) — «Tahrirlash»
  - `settings/rooms-settings-client.tsx` (~256) — «Yangi xona»
  - `settings/courses-settings-client.tsx` (~133) — «Yangi kurs»
  - `teachers/teachers-client.tsx` (~136, ~199) — faol «Havola olish», faol «Yangi o'qituvchi»
  - `payments/salary-monthly-view.tsx` (~308) — «Sozlamalar»
  - `groups/groups-client.tsx` (~293) — faol «Yangi guruh»
  - `students/students-client.tsx` (~174) — faol «Yangi o'quvchi»
  - `payments/overview-client.tsx` (~78) — «To'lov qayd qilish»
  - `settings/employees-settings-client.tsx` (~213) — «Yangi xodim»
  - `leads/lead-column.tsx` (~232) — «Birinchi bo'limni yarating»

**Interfaces:**
- Consumes: `LAUNCH_STATIONS`, `LAUNCH_EXTRAS` (Task 5)
- Produces: 11 ta `data-tour` atributi; Task 6 dagi `SpotlightHost` ularni topadi.

- [ ] **Step 1: Failing testni yozing**

`client/src/components/dashboard/launch/launch-targets.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_EXTRAS, LAUNCH_STATIONS } from "./launch-stations";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * Tur tugmani `data-tour` bo'yicha topadi. Refaktorda atribut tushib qolsa,
 * tur jimgina toast'ga aylanadi — bu test o'sha uzilishni CI'da ushlaydi.
 */
describe("har bir tur nishoni manbada bor", () => {
  const source = tsxFiles(join(__dirname, "..", ".."))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const ids = [...LAUNCH_STATIONS, ...LAUNCH_EXTRAS].flatMap((s) => s.targets);

  it("11 ta nishon (8 bekat + 2 qo'shimcha, «Ustoz» da ikkita)", () => {
    expect(ids.length).toBe(11);
  });

  it.each(ids)('data-tour="%s"', (id) => {
    expect(source).toContain(`data-tour="${id}"`);
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshiring**

Run: `cd client && npx vitest run src/components/dashboard/launch/launch-targets.test.ts`
Expected: FAIL — 11 ta nishonning hech biri topilmaydi.

- [ ] **Step 3: Atributlarni qo'shing**

Har birida faqat `<Button` ochilish tegiga atribut qo'shiladi; qolgan props o'zgarmaydi.
**O'chirilgan (`disabled`) variantlarga qo'yilmaydi** — tur faqat bosiladigan tugmani yoritadi.
Quyidagi «→» juftliklarida `\n` — yangi qator; chekinishlar fayldagidek qoladi.

1. `settings/branch-detail-client.tsx`:
   `<Button\n              size="sm"\n              variant="outline"\n              onClick={() => openDrawer(branch)}\n            >` →
   `<Button\n              size="sm"\n              variant="outline"\n              data-tour="branch-edit"\n              onClick={() => openDrawer(branch)}\n            >`
2. `settings/rooms-settings-client.tsx`:
   `<Button size="sm" onClick={() => openAddDrawer(branch.id)}>` →
   `<Button size="sm" data-tour="room-add" onClick={() => openAddDrawer(branch.id)}>`
3. `settings/courses-settings-client.tsx` («Yangi kurs» tugmasi):
   `<Button\n                  size="sm"\n                  onClick={openAddDrawer}\n                  disabled={!selectedBranch}\n                >` →
   `<Button\n                  size="sm"\n                  data-tour="course-add"\n                  onClick={openAddDrawer}\n                  disabled={!selectedBranch}\n                >`
4. `teachers/teachers-client.tsx`:
   - `<Button variant="outline" className="size-9 sm:size-auto sm:h-9 sm:px-4" onClick={handleCopyLink}>` →
     `<Button variant="outline" className="size-9 sm:size-auto sm:h-9 sm:px-4" data-tour="teacher-invite-link" onClick={handleCopyLink}>`
   - `<Button onClick={openAddDrawer} className="size-9 sm:size-auto sm:h-9 sm:px-4">` →
     `<Button onClick={openAddDrawer} data-tour="teacher-add" className="size-9 sm:size-auto sm:h-9 sm:px-4">`
5. `payments/salary-monthly-view.tsx` («Sozlamalar», `{isCeo && (` ostida):
   `<Button\n            variant="outline"\n            className="shrink-0"\n            onClick={() => setSettingsOpen(true)}\n          >` →
   `<Button\n            variant="outline"\n            className="shrink-0"\n            data-tour="salary-settings"\n            onClick={() => setSettingsOpen(true)}\n          >`
   (Tugmani direktorga ochish — Task 9.)
6. `groups/groups-client.tsx` (faol «Yangi guruh»):
   `<Button\n                  onClick={openAddDrawer}\n                  className="size-9 sm:size-auto sm:h-9 sm:px-4 shrink-0"\n                >` →
   `<Button\n                  onClick={openAddDrawer}\n                  data-tour="group-add"\n                  className="size-9 sm:size-auto sm:h-9 sm:px-4 shrink-0"\n                >`
7. `students/students-client.tsx`:
   `<Button onClick={() => setAddOpen(true)} className="shrink-0">` →
   `<Button onClick={() => setAddOpen(true)} data-tour="student-add" className="shrink-0">`
8. `payments/overview-client.tsx`:
   `<Button onClick={() => setDialogOpen(true)}>` →
   `<Button data-tour="payment-record" onClick={() => setDialogOpen(true)}>`
9. `settings/employees-settings-client.tsx` («Yangi xodim» — `Yangi xodim` matni turgan tugma):
   `<Button size="sm" onClick={openAddDrawer}>\n                  <Plus className="mr-1.5 h-4 w-4" />\n                  Yangi xodim` →
   `<Button size="sm" data-tour="employee-add" onClick={openAddDrawer}>\n                  <Plus className="mr-1.5 h-4 w-4" />\n                  Yangi xodim`
10. `leads/lead-column.tsx` (bo'sh ustundagi «Birinchi bo'limni yarating»):
    `<Button\n              variant="outline"\n              size="sm"\n              onClick={() => openCreateSection(column.id, column.name)}\n            >\n              <FolderPlus className="size-3.5" />\n              Birinchi` →
    `<Button\n              variant="outline"\n              size="sm"\n              data-tour="lead-section-add"\n              onClick={() => openCreateSection(column.id, column.name)}\n            >\n              <FolderPlus className="size-3.5" />\n              Birinchi`

- [ ] **Step 4: Test o'tishini tekshiring**

Run: `cd client && npx vitest run src/components/dashboard/launch && npm run typecheck`
Expected: PASS, tip xatosi yo'q.

- [ ] **Step 5: Commit**

```bash
git add client/src/components
git commit -m "$(cat <<'EOF'
Tur nishonlari: 11 ta tugmaga data-tour

launch-targets.test.ts har bir nishon manbada turganini tekshiradi —
refaktorda atribut tushib qolsa, tur jimgina buzilmaydi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Klient — oylik sozlamalari direktorga (faqat ustoz stavkalari)

**Files:**
- Create: `client/src/components/payments/salary-settings-access.ts`
- Test: `client/src/components/payments/salary-settings-access.test.ts`
- Modify: `client/src/components/payments/salary-client.tsx` (~16–17, ~67–73)
- Modify: `client/src/components/payments/salary-monthly-view.tsx` (Props ~120–126, destrukturizatsiya ~193–199, tugma ~307, sheet ~643)
- Modify: `client/src/components/payments/salary-settings-sheet.tsx` (Props ~84–93, izoh ~95–100, funksiya ~101–106, tavsif ~146–149, davr ~154, xodimlar ~280, row sheet ~306)
- Modify: `client/src/components/payments/salary-config-row-sheet.tsx` (Props ~73–78, ~80, o'chirish tugmasi ~312–324)
- Modify: `client/CLAUDE.md:687`, `client/CLAUDE.md:705-706`

**Interfaces:**
- Consumes: server — direktor `POST /salary/config` va `PATCH /salary/config/:id` ni chaqira oladi (Task 4); `GET /salary/overview` direktorga allaqachon ochiq va filialga toraygan.
- Produces: `interface SalarySettingsAccess { canOpen: boolean; canManageCompanyPayroll: boolean; canDeactivateRate: boolean }`, `resolveSalarySettingsAccess(roleIds: number[]): SalarySettingsAccess`; `SalaryMonthlyView` yangi prop `settingsAccess`; `SalarySettingsSheet` yangi prop `access`; `SalaryConfigRowSheet` yangi ixtiyoriy prop `canDeactivate` (standart `true`).

- [ ] **Step 1: Failing testni yozing**

`client/src/components/payments/salary-settings-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSalarySettingsAccess } from "./salary-settings-access";

describe("resolveSalarySettingsAccess", () => {
  it("CEO: hammasi", () => {
    expect(resolveSalarySettingsAccess([1])).toEqual({
      canOpen: true,
      canManageCompanyPayroll: true,
      canDeactivateRate: true,
    });
  });

  it("filial direktori: faqat ustoz stavkalari (ADR-0026)", () => {
    expect(resolveSalarySettingsAccess([2])).toEqual({
      canOpen: true,
      canManageCompanyPayroll: false,
      canDeactivateRate: false,
    });
  });

  it("direktor + administrator — direktor huquqi", () => {
    expect(resolveSalarySettingsAccess([2, 3]).canOpen).toBe(true);
  });

  it.each([[[3]], [[4]], [[5]], [[]]])("%j: «Sozlamalar» yo'q", (roleIds) => {
    expect(resolveSalarySettingsAccess(roleIds).canOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshiring**

Run: `cd client && npx vitest run src/components/payments/salary-settings-access.test.ts`
Expected: FAIL — modul topilmaydi.

- [ ] **Step 3: Huquq funksiyasi**

`client/src/components/payments/salary-settings-access.ts`:

```ts
/**
 * ⚙ Oylik sozlamalari — kim nimani ko'radi (ADR-0026).
 *
 * Server shu qoidani o'zi majburlaydi (`teacher-rate-permission.ts`); bu yerda
 * faqat UI: direktorga u bosganda baribir 403 oladigan narsa ko'rsatilmaydi.
 */
export interface SalarySettingsAccess {
  /** «Sozlamalar» tugmasi va «Ustoz stavkalari» ro'yxati. */
  canOpen: boolean;
  /** Hisoblash davri va «Xodimlar stavkalari» — faqat CEO. */
  canManageCompanyPayroll: boolean;
  /** Stavkani o'chirish — faqat CEO: o'chirilgan stavka = oylik yozilmaydi. */
  canDeactivateRate: boolean;
}

export function resolveSalarySettingsAccess(roleIds: number[]): SalarySettingsAccess {
  const ceo = roleIds.includes(1);
  const director = roleIds.includes(2);
  return {
    canOpen: ceo || director,
    canManageCompanyPayroll: ceo,
    canDeactivateRate: ceo,
  };
}
```

- [ ] **Step 4: Proplarni o'tkazing**

`salary-client.tsx`:
- import: `import { resolveSalarySettingsAccess } from "./salary-settings-access";`
- `const canPay = …;` qatoridan keyin:
  `const settingsAccess = resolveSalarySettingsAccess(user?.roles.map((r) => r.id) ?? []);`
- `<SalaryMonthlyView` ga `canPay={canPay}` dan keyin `settingsAccess={settingsAccess}` qo'shing.

`salary-monthly-view.tsx`:
- import: `import type { SalarySettingsAccess } from "./salary-settings-access";`
- `interface Props` ga `canPay: boolean;` dan keyin:
  ```ts
  /** ⚙ Sozlamalar: CEO — hammasi, direktor — faqat ustoz stavkalari (ADR-0026). */
  settingsAccess: SalarySettingsAccess;
  ```
- destrukturizatsiya: `  canPay,` dan keyin `  settingsAccess,`
- «Sozlamalar» tugmasini o'rab turgan `{isCeo && (` (tugmada `data-tour="salary-settings"` bor) → `{settingsAccess.canOpen && (`
- `{/* Settings (rate rules + cycle day) — CEO */}\n      {isCeo && (\n        <SalarySettingsSheet` →
  `{/* Sozlamalar — CEO hammasi; direktor faqat o'z filiali ustozlarining stavkalari (ADR-0026) */}\n      {settingsAccess.canOpen && (\n        <SalarySettingsSheet\n          access={settingsAccess}`

`salary-settings-sheet.tsx`:
- import: `import type { SalarySettingsAccess } from "./salary-settings-access";`
- `interface Props` ga `onChanged: () => void;` dan keyin `access: SalarySettingsAccess;`
- funksiya izohi `⚙ Sozlamalar — CEO-only surface for the salary *rules* (rate config per\n * teacher + the cycle start day),` → `⚙ Sozlamalar — the salary *rules* surface: CEO sees rates, staff rates and\n * the cycle start day; a Branch Director sees only their branch's teacher\n * rates (ADR-0026),`
- funksiya parametrlari: `  onChanged,` dan keyin `  access,`
- `<SheetDescription>` ichidagi matnni almashtiring:
  ```tsx
            {access.canManageCompanyPayroll
              ? "Ustoz va xodim stavkalari, hisoblash davri. Jadval shu sozlamalar asosida hisoblanadi."
              : "Filialingiz ustozlarining stavkalari. Xodimlar oyligi va hisoblash davrini CEO belgilaydi."}
  ```
- `{period && (` (Hisoblash davri bo'limi) → `{access.canManageCompanyPayroll && period && (`
- «Xodimlar stavkalari» bloki (`{/* Non-teaching payroll. …*/}` izohidan keyingi `<div className="space-y-3">` … `</div>`) ni `{access.canManageCompanyPayroll && ( … )}` bilan o'rang.
- `<SalaryConfigRowSheet` ga `onSaved={afterRateChange}` dan keyin `canDeactivate={access.canDeactivateRate}` qo'shing.

`salary-config-row-sheet.tsx`:
- `interface Props` ga `onSaved: () => void;` dan keyin:
  ```ts
  /** Stavkani o'chirish — faqat CEO (ADR-0026). */
  canDeactivate?: boolean;
  ```
- `export function SalaryConfigRowSheet({ userId, employee, onClose, onSaved }: Props) {` →
  `export function SalaryConfigRowSheet({ userId, employee, onClose, onSaved, canDeactivate = true }: Props) {`
- `onClick={() => handleDeactivate(c.id)}` turgan `<Button` … `</Button>` ni `{canDeactivate && ( … )}` bilan o'rang.

`client/CLAUDE.md`:
- 687-qator: `(CEO-only button in the filter row)` → `(CEO and Branch Director button in the filter row; a Branch Director sees only **Ustoz stavkalari** for their own branch and cannot deactivate a rate — ADR-0026)`
- 706-qatordan keyin yangi qator:
  `  - Branch Director: ⚙ Sozlamalar → own-branch teacher rates only (pencil / bulk); no cycle day, no staff rates, no deactivation (\`salary-settings-access.ts\`).`

- [ ] **Step 5: Tekshiring**

Run: `cd client && npx vitest run src/components/payments && npm run typecheck && npm run lint`
Expected: PASS, xatosiz.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/payments client/CLAUDE.md
git commit -m "$(cat <<'EOF'
Oylik sozlamalari: direktor o'z filiali ustozlariga stavka qo'yadi

«Sozlamalar» direktorga ochildi: faqat «Ustoz stavkalari»; hisoblash
davri, xodimlar stavkasi va stavkani o'chirish CEO'da (ADR-0026).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Klient — guruh formasidagi boshi berk joylar

**Files:**
- Create: `client/src/components/groups/group-form-empty-hints.ts`
- Test: `client/src/components/groups/group-form-empty-hints.test.ts`
- Create: `client/src/components/groups/select-empty-state.tsx`
- Modify: `client/src/components/groups/group-course-select.tsx`
- Modify: `client/src/components/groups/group-room-select.tsx` (bo'sh holat ~44–50)
- Modify: `client/src/components/groups/group-teacher-select.tsx` (bo'sh holat ~47–53)
- Modify: `client/src/components/groups/edit-group-form.tsx` (importlar; ~307, ~390, ~406)

**Interfaces:**
- Consumes: `useAuth`, `useBranchSwitcher`; `EditGroupForm` ning `onClose` propi (havola bosilganda drawer yopilishi uchun — aks holda `useEditGroup.open` `true` qolib, `/groups` ga qaytganda drawer o'zi ochilib qolardi).
- Produces: `interface EmptyHint { text: string; action?: { href: string; label: string } }`, `groupFormEmptyHints(roleIds: number[], branchId: number | null): { course: EmptyHint; room: EmptyHint; teacher: EmptyHint }`, `SelectEmptyState({ text, action? })` (`action.onNavigate?: () => void`); uch select komponentiga ixtiyoriy `emptyState?: React.ReactNode`.

- [ ] **Step 1: Failing testni yozing**

`client/src/components/groups/group-form-empty-hints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupFormEmptyHints } from "./group-form-empty-hints";

describe("groupFormEmptyHints", () => {
  it("direktor: kurs, xona va ustozga havola", () => {
    const h = groupFormEmptyHints([2], 7);
    expect(h.course.action).toEqual({ href: "/settings/courses", label: "Kurs qo'shish" });
    expect(h.room.action).toEqual({ href: "/settings/rooms/7", label: "Xona qo'shish" });
    expect(h.teacher.action).toEqual({ href: "/teachers", label: "Ustoz qo'shish" });
  });

  it("administrator: kurs va ustoz havolasiz, kim qo'shishini aytadi", () => {
    const h = groupFormEmptyHints([3], 7);
    expect(h.course).toEqual({
      text: "Bu filialda hali kurs yo'q. Kursni filial direktori qo'shadi.",
    });
    expect(h.teacher).toEqual({
      text: "Hozircha o'qituvchi yo'q. Ustozni filial direktori qo'shadi.",
    });
    // Administrator xona qo'sha oladi (rooms.controller: CEO/BD/Administrator).
    expect(h.room.action?.href).toBe("/settings/rooms/7");
  });

  it("filial tanlanmagan: xona havolasi yo'q", () => {
    expect(groupFormEmptyHints([1], null).room).toEqual({ text: "Hozircha xona yo'q." });
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshiring**

Run: `cd client && npx vitest run src/components/groups/group-form-empty-hints.test.ts`
Expected: FAIL — modul topilmaydi.

- [ ] **Step 3: Izohlar funksiyasi va quti komponenti**

`client/src/components/groups/group-form-empty-hints.ts`:

```ts
/**
 * Guruh formasida kurs, xona yoki ustoz ro'yxati bo'sh bo'lsa — nega va qayerga
 * borish kerak. Havola faqat o'sha narsani qo'sha oladigan rolga ko'rsatiladi:
 * kurs va ustozni CEO/direktor qo'shadi, xonani administrator ham.
 */
export interface EmptyHint {
  text: string;
  action?: { href: string; label: string };
}

export function groupFormEmptyHints(
  roleIds: number[],
  branchId: number | null,
): { course: EmptyHint; room: EmptyHint; teacher: EmptyHint } {
  const managesStructure = roleIds.includes(1) || roleIds.includes(2);
  return {
    course: managesStructure
      ? {
          text: "Bu filialda hali kurs yo'q.",
          action: { href: "/settings/courses", label: "Kurs qo'shish" },
        }
      : { text: "Bu filialda hali kurs yo'q. Kursni filial direktori qo'shadi." },
    room:
      branchId !== null
        ? {
            text: "Hozircha xona yo'q.",
            action: { href: `/settings/rooms/${branchId}`, label: "Xona qo'shish" },
          }
        : { text: "Hozircha xona yo'q." },
    teacher: managesStructure
      ? {
          text: "Hozircha o'qituvchi yo'q.",
          action: { href: "/teachers", label: "Ustoz qo'shish" },
        }
      : { text: "Hozircha o'qituvchi yo'q. Ustozni filial direktori qo'shadi." },
  };
}
```

`client/src/components/groups/select-empty-state.tsx`:

```tsx
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface SelectEmptyStateProps {
  text: string;
  /** Berilsa — tuzatish sahifasiga havola; `onNavigate` drawer'ni yopadi. */
  action?: { href: string; label: string; onNavigate?: () => void };
}

/** Formadagi bo'sh ro'yxat o'rniga: nega bo'sh va qayerda tuzatiladi. */
export function SelectEmptyState({ text, action }: SelectEmptyStateProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
      <span className="text-muted-foreground">{text}</span>
      {action && (
        <Link
          href={action.href}
          onClick={action.onNavigate}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {action.label}
          <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Selectlar va forma**

`group-course-select.tsx`:
- fayl boshidagi importlarga: `import type { ReactNode } from "react";`
- `interface GroupCourseSelectProps` ga `error?: string;` dan keyin:
  ```ts
  /** Ro'yxat bo'sh bo'lganda dropdown o'rniga chiziladi. */
  emptyState?: ReactNode;
  ```
- parametrlar: `  error,` dan keyin `  emptyState,`
- `<Select value={value} onValueChange={onChange}>` … `</Select>` ni o'rang:
  ```tsx
      {courses.length === 0 && emptyState ? (
        emptyState
      ) : (
        <Select value={value} onValueChange={onChange}>
          …(mavjud tarkib o'zgarmaydi)…
        </Select>
      )}
  ```

`group-room-select.tsx`:
- `import { useMemo, useState } from "react";` → `import { useMemo, useState, type ReactNode } from "react";`
- `interface GroupRoomSelectProps` ga `rooms: AvailableRoom[];` dan keyin
  `emptyState?: ReactNode;`; parametrlar: `  rooms,` dan keyin `  emptyState,`
- bo'sh holat:
  ```tsx
  if (rooms.length === 0) {
    return (
      emptyState ?? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
          Hozircha xona yo&apos;q
        </p>
      )
    );
  }
  ```

`group-teacher-select.tsx` — xuddi shu: react importiga `type ReactNode` qo'shing
(`import { useMemo, useState, type ReactNode } from "react";`), `emptyState?: ReactNode;`
prop, parametr, va

```tsx
  if (teachers.length === 0) {
    return (
      emptyState ?? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
          Hozircha o&apos;qituvchi yo&apos;q
        </p>
      )
    );
  }
```

`edit-group-form.tsx`:
- importlar:
  ```tsx
  import { useAuth } from "@/hooks/use-auth";
  import { groupFormEmptyHints, type EmptyHint } from "./group-form-empty-hints";
  import { SelectEmptyState } from "./select-empty-state";
  ```
- `const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);` dan keyin:
  ```tsx
  // `user` ni olib, massivni tashqarida quramiz: selektor ichida `.map()`
  // har renderda yangi massiv qaytarib, zustand v5 da cheksiz render beradi
  // (`home-overview.tsx` naqshi).
  const user = useAuth((s) => s.user);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const emptyHints = groupFormEmptyHints(roleIds, selectedBranch?.id ?? null);
  // Havola bosilganda drawer yopiladi — aks holda `useEditGroup.open` true
  // qolib, /groups ga qaytganda forma o'zi ochilib qolardi.
  const renderEmpty = (hint: EmptyHint) => (
    <SelectEmptyState
      text={hint.text}
      action={hint.action && { ...hint.action, onNavigate: onClose }}
    />
  );
  ```
- `<GroupCourseSelect … error={form.formState.errors.courseId?.message}` dan keyin
  `emptyState={renderEmpty(emptyHints.course)}`
- `<GroupRoomSelect … rooms={smartRooms}` dan keyin `emptyState={renderEmpty(emptyHints.room)}`
- `<GroupTeacherSelect … teachers={smartTeachers}` dan keyin `emptyState={renderEmpty(emptyHints.teacher)}`

- [ ] **Step 5: Tekshiring**

Run: `cd client && npx vitest run src/components/groups && npm run typecheck && npm run lint`
Expected: PASS, xatosiz.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/groups
git commit -m "$(cat <<'EOF'
Guruh formasi: bo'sh kurs, xona va ustoz ro'yxatida yo'l ko'rsatish

Nega bo'shligi va qayerda tuzatilishi aytiladi; havola faqat qo'sha
oladigan rolga, bosilganda drawer yopiladi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: To'liq tekshiruv va qo'lda yurib chiqish

**Files:** o'zgarish yo'q (topilgan nuqson tegishli vazifa fayllarida tuzatiladi va alohida commit qilinadi).

- [ ] **Step 1: Barcha avtomatik tekshiruvlar**

Run: `cd server && npx jest`
Expected: hammasi yashil.

Run: `cd server && npm run typecheck`
Expected: xatosiz.

Run: `cd client && npx vitest run && npm run typecheck && npm run lint`
Expected: hammasi yashil, xatosiz.

- [ ] **Step 2: Lokal muhit — PROD'ga tegmaslik tekshiruvi**

```bash
cp /Users/a1111/Desktop/daf-erp-system/server/.env server/.env
cp /Users/a1111/Desktop/daf-erp-system/client/.env.local client/.env.local
grep DATABASE_URL server/.env
```

Expected: `localhost:5433` (lokal docker). **Boshqa host chiqsa (Railway, Neon) — TO'XTANG va foydalanuvchidan so'rang.** Keyin:

```bash
docker compose up -d
cd server && npx prisma migrate deploy && npm run start:dev
```

(boshqa terminalda) `cd client && npm run dev`.

- [ ] **Step 3: Direktor sifatida yo'lni bosib chiqish** (spec §8, `http://localhost:3000`)

1. `ceo` / `123456` bilan kiring. Sozlamalar → Filiallar → yangi filial «Sinov filiali» (ish vaqtini BO'SH qoldiring). Sozlamalar → Xodimlar → yangi xodim: rol «Filial direktori», filial «Sinov filiali», login/parol.
2. CEO sifatida filial tanlagichda «Farg'ona»ni tanlang → bosh sahifada karta **yo'q**. «Sinov filiali»ni tanlang → karta **bor**, «1 / 8» emas «0 / 8» (ish vaqti bo'sh).
3. Chiqing, direktor bilan kiring. Karta ko'rinadi; har bekatni bosing — to'g'ri sahifa ochiladi va tugma yoritiladi; «Tushundim», Esc, tashqariga bosish yopadi; yoritilgan tugma bosilganda forma ochiladi.
4. Tartib bilan bajaring: ish vaqti → xona → kurs → ustoz («Havola olish» bot sozlanmagan bo'lsa ko'rinmaydi — tur «Yangi o'qituvchi»ni yoritishi kerak) → **Oylik → Sozlamalar**: faqat «Ustoz stavkalari» ko'rinadi, o'chirish tugmasi yo'q; stavka qo'ying → guruh (kurs, xona, ustoz, kunlar, vaqt, bugungi sana) → o'quvchi + guruhga yozish → to'lov. Har qadamdan keyin bosh sahifada hisob oshadi.
5. Birinchi to'lovdan keyin bosh sahifada «Filial ishga tushdi» chiqadi; «Yopish» → karta yo'qoladi va sahifa yangilanganda qaytmaydi.
6. Guruh formasini kurs yo'q holatda oching (boshqa yangi filialda): «Bu filialda hali kurs yo'q.» + «Kurs qo'shish» havolasi; bosilganda drawer yopiladi va `/groups` ga qaytganda o'zi ochilmaydi.
7. Yangi filialga administrator qo'shib, u bilan kiring: karta yo'q, 403 toast yo'q.
8. Direktor tokeni bilan (brauzer cookie `token`) boshqa filial ustoziga stavka:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/salary/config \
     -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
     -d '{"userId": <FARGONA_USTOZ_ID>, "salaryType": "PERCENTAGE", "value": 40}'
   ```
   Expected: `403`.
9. Brauzer kengligini 375px qiling: karta vertikal ro'yxat bo'lib chiziladi, gorizontal scroll yo'q.

- [ ] **Step 4: Yakuniy kod ko'rigi**

superpowers:requesting-code-review bilan butun shoxni (`origin/main...HEAD`) ko'rib chiqing; topilganlar tegishli vazifa fayllarida tuzatiladi.

- [ ] **Step 5: ADR raqamini qayta tekshiring**

```bash
git fetch origin
git ls-tree --name-only origin/main docs/adr/ | grep 0026
```

Expected: bo'sh. Agar 0026 band bo'lsa — faylni keyingi bo'sh raqamga qayta nomlang, `README.md` indeksi, `role-access.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, kod izohlari (`grep -rn "ADR-0026" server client docs`) va manifest sababidagi raqamni yangilang, alohida commit qiling.
