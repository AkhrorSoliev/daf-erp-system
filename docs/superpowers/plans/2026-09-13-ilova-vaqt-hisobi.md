# Ilova vaqt hisobi — amalga oshirish rejasi (2-bosqich)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi veb portalda faol o'tkazgan vaqtini, radio tinglagan vaqtini va vaqtning «ta'lim / boshqa» bo'yicha taqsimotini o'lchab, har daqiqada serverga yuborish va `StudentAppSession` jadvalida saqlash.

**Architecture:** Klient faollikni o'zi o'lchaydi (sof `activity-tracker.ts` moduli + brauzer bilan ishlaydigan yupqa `activity-runtime.ts`), seans uuid'i bilan **jami** qiymatlarni yuboradi. Server `POST /student-portal/activity` da har maydonda `max(eski, yangi)` oladi, soat bilan qirqadi (`firstSeenAt` dan o'tgan vaqt + 120 s), seans egaligini (403) va Toshkent kunini (409) tekshiradi. Ta'lim audiosi umumiy media reyestriga yoziladi; radio vaqti pleyer pozitsiyasi o'sishidan olinadi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), jest; Next.js 16 + zustand, vitest (`environment: "node"`, jsdom yo'q). Spec: `docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md` — 3-bo'lim (ta'riflar) va 4-bo'lim (vaqt hisobi).

## Global Constraints

- UI matni va kod izohlari **lotin o'zbekcha**; kirill harflari yo'q.
- **Faol vaqt** = ilova ekranda ochiq (`document.visibilityState === "visible"`) **va** oyna fokusda (`document.hasFocus()`) **va** (oxirgi 2 daqiqada `pointerdown`/`keydown`/`touchstart`/`wheel`/`scroll` bo'lgan **yoki** ta'lim audiosi ijro etilyapti).
- **Radio vaqti** = radio ovozi haqiqatan yangragan vaqt, pleyer pozitsiyasi (`currentTime`) o'sishidan; ekran yopiq bo'lsa ham sanaladi; faol vaqtga **qo'shilmaydi** va o'quvchini «faol» qilmaydi.
- Bo'lim: `/portal/lernen` va `/portal/lernen/*` → `LERNEN`, qolgani → `OTHER`.
- Tick har 1 s; bir tickdagi faol qadam 5 s dan oshmaydi; `localStorage` ga har 15 s; serverga har 60 s va sahifa yashirinayotganda/yopilayotganda.
- Yangi seans: 30 daqiqa harakatsizlikdan keyin harakat boshlanganda, Toshkent kuni o'zgarganda, chiqish (qobiq yopilishi) va yangi kirishda.
- Server: `studentId`/`companyId` faqat tokendan; begona seans → 403; seansning Toshkent kuni bugun emas → 409; `activeSeconds` va `radioSeconds` ≤ `(hozir − firstSeenAt)` soniya + 120; `sections` har kalit bo'yicha `max`, yig'indisi `activeSeconds` dan oshsa mutanosib kamaytiriladi; `branchId` birinchi yozuvda muhrlanadi.
- `prisma migrate dev` bu repoda ISHLAMAYDI — migratsiya: sxema → `migrate diff` → tozalangan SQL → `db execute` → `migrate resolve --applied`.
- Yangi HTTP route `server/src/common/auth/branch-route-policy.ts` da toifalanishi SHART.
- DTO'da `studentId` hech qachon bo'lmaydi.
- Toshkent sanasi serverda faqat `server/src/common/date/tashkent.ts` orqali (AST qorovuli bor).
- Har taskdan keyin: server `npm test`, `npm run typecheck`, **`npx eslint src` (0 error)**; klient `npm test`, `npm run typecheck`, `npx eslint src` (0 error). Prettier formatlashi CI da xato beradi — `npx eslint --fix <o'zgargan fayllar>`.
- Commit xabari lotin o'zbekcha, oxirida `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ish `.worktrees/ilova-vaqt-hisobi` da (shox `feat/ilova-vaqt-hisobi`), server va klient `node_modules` worktree'ning o'zida. Asosiy katalogga tegilmaydi, `git stash` ishlatilmaydi.

---

## Fayl tuzilmasi

| Fayl | Mas'uliyati |
| --- | --- |
| `server/prisma/schema.prisma` | `AppPlatform` enum, `StudentAppSession` modeli, `Student.appSessions` |
| `server/prisma/migrations/20260913200000_student_app_session/migration.sql` | Faqat shu o'zgarish |
| `server/src/app-activity/heartbeat-merge.ts` (+ spec) | Sof: jami qiymatlarni birlashtirish va qirqish |
| `server/src/app-activity/dto/activity-heartbeat.dto.ts` (+ spec) | So'rov validatsiyasi |
| `server/src/app-activity/app-activity-write.service.ts` (+ spec) | Yaratish/yangilash, 403/409, P2002, qatorni qulflash |
| `server/src/app-activity/student-activity.controller.ts` (+ spec) | `POST /student-portal/activity` |
| `server/src/app-activity/app-activity.module.ts` | Modul |
| `server/src/app.module.ts` | Modulni ulash |
| `server/src/common/auth/branch-route-policy.ts` | Yangi SELF bloki |
| `client/src/components/student-portal/lib/media-registry.ts` (+ test) | Ta'lim audiosi reyestri |
| `client/src/components/student-portal/lib/radio-store.ts` (+ test) | `radioOvozHolati()` |
| `client/src/components/student-portal/lernen/use-clip-player.ts` | Reyestrga yozilish |
| `client/src/components/student-portal/lernen/uebung/ovoz-tugmasi.tsx` | Reyestrga yozilish |
| `client/src/components/student-portal/lernen/uebung/suhbat-pleyer.tsx` | Reyestrga yozilish |
| `client/src/components/student-portal/lib/activity-tracker.ts` (+ test) | Sof o'lchash mantig'i |
| `client/src/components/student-portal/lib/activity-storage.ts` (+ test) | `localStorage`: joriy seans va yuborilmaganlar |
| `client/src/components/student-portal/lib/activity-sender.ts` (+ test) | Serverga yuborish |
| `client/src/components/student-portal/lib/activity-runtime.ts` | Brauzer hodisalari, taymerlar |
| `client/src/components/student-portal/activity/activity-host.tsx` | Qobiqdagi boshsiz komponent |
| `client/src/components/student-portal/student-portal-layout.tsx` | `<ActivityHost />` |
| `docs/adr/0020-ilova-faolligi-klientda-olchanadi.md`, `docs/adr/README.md`, `client/CLAUDE.md`, spec | Hujjatlar |

---

### Task 1: Sxema va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model DafSession` blokidan keyin; `model Student` ichida `dafAttempts DafAttempt[]` qatoridan keyin)
- Create: `server/prisma/migrations/20260913200000_student_app_session/migration.sql`

**Interfaces:**
- Produces: `prisma.studentAppSession` modeli: `id (String, klient uuid), studentId, companyId, branchId?, platform (AppPlatform: WEB|ANDROID|IOS), appVersion?, day (@db.Date), firstSeenAt, lastSeenAt, activeSeconds (Int, default 0), radioSeconds (Int, default 0), sections (Json, default {}), createdAt, updatedAt`.

- [ ] **Step 1: Sxemaga qo'shish**

`model DafSession { ... }` blokidan keyin:

```prisma
/// Faollik seansi qaysi klientdan kelgani (dizayn 4.4).
enum AppPlatform {
  WEB
  ANDROID
  IOS
}

/// Bitta faollik seansi (dizayn 4). Klient seans boshidan JAMI qiymatlarni
/// yuboradi; server har maydonda `max` oladi va soat bilan qirqadi, shuning
/// uchun takroriy so'rov vaqtni ko'paytirmaydi. `id` — klient yaratgan uuid.
model StudentAppSession {
  id            String      @id
  studentId     Int
  companyId     Int
  /// Birinchi yozuvda MUHRLANADI — jonli bog'lanishdan o'qilmaydi.
  branchId      Int?
  platform      AppPlatform
  appVersion    String?
  /// Toshkent kuni (`firstSeenAt` dan). Bitta seans hech qachon ikki kunga tushmaydi.
  day           DateTime    @db.Date
  firstSeenAt   DateTime
  lastSeenAt    DateTime
  activeSeconds Int         @default(0)
  radioSeconds  Int         @default(0)
  /// `{ LERNEN?: number, OTHER?: number }` — faol vaqtning taqsimoti, soniya.
  sections      Json        @default("{}")
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  student Student @relation(fields: [studentId], references: [id])

  @@index([studentId, day])
  @@index([companyId, day])
  @@index([branchId, day])
}
```

`model Student` ichida `dafAttempts       DafAttempt[]` qatoridan keyin:

```prisma
  appSessions       StudentAppSession[]
```

- [ ] **Step 2: Diff va tozalash**

Run (server katalogida):
```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/student-app-session-diff.sql
```
Faylda faqat `AppPlatform` va `StudentAppSession` ga tegishli qatorlarni qoldiring (dev bazadagi boshqa shoxlar driftini — boshqa jadvallar, `DROP` lar — OLIB TASHLANG). Kutilgan natija:

```sql
-- CreateEnum
CREATE TYPE "AppPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "StudentAppSession" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "platform" "AppPlatform" NOT NULL,
    "appVersion" TEXT,
    "day" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "radioSeconds" INTEGER NOT NULL DEFAULT 0,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentAppSession_studentId_day_idx" ON "StudentAppSession"("studentId", "day");

-- CreateIndex
CREATE INDEX "StudentAppSession_companyId_day_idx" ON "StudentAppSession"("companyId", "day");

-- CreateIndex
CREATE INDEX "StudentAppSession_branchId_day_idx" ON "StudentAppSession"("branchId", "day");

-- AddForeignKey
ALTER TABLE "StudentAppSession" ADD CONSTRAINT "StudentAppSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Tozalangan SQL ni `server/prisma/migrations/20260913200000_student_app_session/migration.sql` ga yozing.

- [ ] **Step 3: Dev bazaga qo'llash**

Avval ob'ekt allaqachon yo'qligini tekshiring (`information_schema.tables` da `StudentAppSession` yo'q). Keyin:
```bash
npx prisma db execute --file prisma/migrations/20260913200000_student_app_session/migration.sql
npx prisma migrate resolve --applied 20260913200000_student_app_session
npx prisma generate
```
Expected: xatosiz.

- [ ] **Step 4: Tekshirish**

Run: `npm run typecheck` va `npm test -- daf students` → PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260913200000_student_app_session
git commit -m "StudentAppSession jadvali: ilova faollik seansi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Jami qiymatlarni birlashtirish (sof funksiya)

**Files:**
- Create: `server/src/app-activity/heartbeat-merge.ts`
- Test: `server/src/app-activity/heartbeat-merge.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SOAT_ZAXIRASI_S = 120;
  export type Bolim = 'LERNEN' | 'OTHER';
  export const BOLIMLAR: readonly Bolim[];
  export type Bolimlar = Partial<Record<Bolim, number>>;
  export interface SeansQiymatlari { activeSeconds: number; radioSeconds: number; sections: Bolimlar }
  export function bolimlarniOqi(json: unknown): Bolimlar
  export function birlashtir(mavjud: SeansQiymatlari | null, kelgan: SeansQiymatlari, firstSeenAt: Date, now: Date): SeansQiymatlari
  ```

- [ ] **Step 1: Yiqiladigan test**

```ts
// server/src/app-activity/heartbeat-merge.spec.ts
import { birlashtir, bolimlarniOqi } from './heartbeat-merge';

const T0 = new Date('2026-09-13T10:00:00.000Z');
const soniyadan = (s: number) => new Date(T0.getTime() + s * 1000);
const q = (activeSeconds: number, radioSeconds = 0, sections = {}) => ({
  activeSeconds,
  radioSeconds,
  sections,
});

describe('birlashtir', () => {
  it('birinchi yozuv: kelgan qiymat soat zaxirasi (120 s) ichida saqlanadi', () => {
    expect(birlashtir(null, q(60, 30), T0, T0)).toEqual(q(60, 30));
  });

  it('soxta katta raqam soat bilan qirqiladi: firstSeenAt dan 60 s o`tgan — ko`pi bilan 180', () => {
    const r = birlashtir(q(60), q(5000, 5000), T0, soniyadan(60));
    expect(r.activeSeconds).toBe(180);
    expect(r.radioSeconds).toBe(180);
  });

  it('takroriy yoki eskirgan so`rov vaqtni kamaytirmaydi — max olinadi', () => {
    const r = birlashtir(q(300, 200), q(200, 100), T0, soniyadan(3600));
    expect(r).toEqual(q(300, 200));
  });

  it('manfiy va o`nlik qiymatlar: 0 dan kichik emas, butunga tushiriladi', () => {
    const r = birlashtir(null, q(-5, 12.7), T0, soniyadan(600));
    expect(r.activeSeconds).toBe(0);
    expect(r.radioSeconds).toBe(12);
  });

  it('bo`limlar kalit bo`yicha max; yig`indi faol vaqtdan oshsa mutanosib kamayadi', () => {
    const r = birlashtir(
      q(60, 0, { LERNEN: 50 }),
      q(60, 0, { LERNEN: 40, OTHER: 30 }),
      T0,
      soniyadan(3600),
    );
    // LERNEN max(50,40)=50, OTHER 30 → 80 > 60 → koeffitsient 0.75
    expect(r.sections).toEqual({ LERNEN: 37, OTHER: 22 });
  });

  it('bo`limlar yig`indisi faol vaqtdan oshmasa o`zgarmaydi', () => {
    const r = birlashtir(null, q(100, 0, { LERNEN: 70, OTHER: 30 }), T0, soniyadan(3600));
    expect(r.sections).toEqual({ LERNEN: 70, OTHER: 30 });
  });
});

describe('bolimlarniOqi', () => {
  it('faqat LERNEN va OTHER, musbat sonlar; boshqa kalit va noto`g`ri qiymat tashlanadi', () => {
    expect(
      bolimlarniOqi({ LERNEN: 12.9, OTHER: 'x', RADIO: 5, foo: 1 }),
    ).toEqual({ LERNEN: 12 });
    expect(bolimlarniOqi(null)).toEqual({});
    expect(bolimlarniOqi([1, 2])).toEqual({});
    expect(bolimlarniOqi({ LERNEN: -3, OTHER: 0 })).toEqual({});
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- heartbeat-merge` → FAIL (`Cannot find module './heartbeat-merge'`).

- [ ] **Step 3: Funksiya**

```ts
// server/src/app-activity/heartbeat-merge.ts
/**
 * Faollik seansining jami qiymatlarini birlashtiradi (dizayn 4.2–4.3).
 *
 * Klient seans boshidan JAMI qiymat yuboradi, delta emas. Shuning uchun har
 * maydonda `max(eski, yangi)` olinadi — takroriy yoki kechikib kelgan so'rov
 * vaqtni hech qachon ko'paytirmaydi va kamaytirmaydi.
 *
 * SOAT BILAN QIRQISH: qiymat server ko'rgan davomiylikdan (`hozir −
 * firstSeenAt`) + 120 s dan oshmaydi. Qo'lda soxta katta raqam yuborib
 * bo'lmaydi — eng yomon holatda «ilova ochiq bo'lgan butun vaqt» sanaladi.
 */
export const SOAT_ZAXIRASI_S = 120;

export type Bolim = 'LERNEN' | 'OTHER';
export const BOLIMLAR: readonly Bolim[] = ['LERNEN', 'OTHER'];
export type Bolimlar = Partial<Record<Bolim, number>>;

export interface SeansQiymatlari {
  activeSeconds: number;
  radioSeconds: number;
  sections: Bolimlar;
}

function butun(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

/** Bazadagi yoki so'rovdagi `sections` ni xavfsiz o'qiydi: faqat ma'lum kalitlar, musbat butun son. */
export function bolimlarniOqi(json: unknown): Bolimlar {
  const natija: Bolimlar = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return natija;
  for (const b of BOLIMLAR) {
    const v = (json as Record<string, unknown>)[b];
    if (typeof v === 'number' && butun(v) > 0) natija[b] = butun(v);
  }
  return natija;
}

export function birlashtir(
  mavjud: SeansQiymatlari | null,
  kelgan: SeansQiymatlari,
  firstSeenAt: Date,
  now: Date,
): SeansQiymatlari {
  const ship =
    Math.max(0, Math.floor((now.getTime() - firstSeenAt.getTime()) / 1000)) +
    SOAT_ZAXIRASI_S;
  const qirq = (eski: number, yangi: number) =>
    Math.min(Math.max(butun(eski), butun(yangi)), ship);

  const activeSeconds = qirq(mavjud?.activeSeconds ?? 0, kelgan.activeSeconds);
  const radioSeconds = qirq(mavjud?.radioSeconds ?? 0, kelgan.radioSeconds);

  const sections: Bolimlar = {};
  let jami = 0;
  for (const b of BOLIMLAR) {
    const v = Math.max(butun(mavjud?.sections[b] ?? 0), butun(kelgan.sections[b] ?? 0));
    if (v > 0) {
      sections[b] = v;
      jami += v;
    }
  }
  // Bo'limlar faol vaqtning taqsimoti — yig'indisi undan oshsa, mutanosib kamaytiriladi.
  if (jami > activeSeconds) {
    const koef = activeSeconds / jami;
    for (const b of BOLIMLAR) {
      const v = sections[b];
      if (v !== undefined) sections[b] = Math.floor(v * koef);
    }
  }
  return { activeSeconds, radioSeconds, sections };
}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test -- heartbeat-merge` → PASS. `npx eslint --fix src/app-activity/heartbeat-merge.ts src/app-activity/heartbeat-merge.spec.ts`, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/app-activity/heartbeat-merge.ts src/app-activity/heartbeat-merge.spec.ts
git commit -m "Faollik seansi: jami qiymatlarni max va soat bilan birlashtirish

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DTO, yozish servisi, controller, modul va route siyosati

**Files:**
- Create: `server/src/app-activity/dto/activity-heartbeat.dto.ts`, `server/src/app-activity/dto/activity-heartbeat.dto.spec.ts`
- Create: `server/src/app-activity/app-activity-write.service.ts`, `server/src/app-activity/app-activity-write.service.spec.ts`
- Create: `server/src/app-activity/student-activity.controller.ts`, `server/src/app-activity/student-activity.controller.spec.ts`
- Create: `server/src/app-activity/app-activity.module.ts`
- Modify: `server/src/app.module.ts` (import + `imports` massiviga `AppActivityModule`, `DafModule` dan keyin)
- Modify: `server/src/common/auth/branch-route-policy.ts` (`ROUTE_POLICIES` ichida, `'POST /student-portal/lernen/uebung/juft'` turgan SELF blokidan keyin yangi blok)

**Interfaces:**
- Consumes: Task 1 `prisma.studentAppSession`; Task 2 `birlashtir`, `bolimlarniOqi`.
- Produces: `POST /api/student-portal/activity` (Student), body `{ sessionId: uuid v4, platform: 'WEB'|'ANDROID'|'IOS', appVersion?: string (≤40), activeSeconds: int 0..86400, radioSeconds: int 0..86400, sections: { LERNEN?: int 0..86400, OTHER?: int 0..86400 } }` → `201 { activeSeconds, radioSeconds }`; begona seans → 403; kuni o'tgan seans → 409. Klient (Task 6) 2xx → yuborildi, 400/403/409 → rad, boshqasi → keyin qayta.

- [ ] **Step 1: Yiqiladigan testlar**

```ts
// server/src/app-activity/dto/activity-heartbeat.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityHeartbeatDto } from './activity-heartbeat.dto';

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
const toliq = {
  sessionId: UUID,
  platform: 'WEB',
  activeSeconds: 120,
  radioSeconds: 30,
  sections: { LERNEN: 80, OTHER: 40 },
};

async function xatolar(body: object) {
  const dto = plainToInstance(ActivityHeartbeatDto, body);
  return (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map(
    (x) => x.property,
  );
}

describe('ActivityHeartbeatDto', () => {
  it('to`liq so`rov o`tadi; appVersion ixtiyoriy', async () => {
    expect(await xatolar(toliq)).toEqual([]);
    expect(await xatolar({ ...toliq, appVersion: '1.2.0' })).toEqual([]);
    expect(await xatolar({ ...toliq, sections: {} })).toEqual([]);
  });

  it('noto`g`ri uuid, platforma, manfiy va sutkadan katta qiymat rad etiladi', async () => {
    const r = await xatolar({
      ...toliq,
      sessionId: 'seans-1',
      platform: 'DESKTOP',
      activeSeconds: -1,
      radioSeconds: 86_401,
    });
    expect(r.sort()).toEqual(['activeSeconds', 'platform', 'radioSeconds', 'sessionId']);
  });

  it('sections ichida noma`lum kalit yoki manfiy qiymat rad etiladi', async () => {
    expect(await xatolar({ ...toliq, sections: { RADIO: 5 } })).toEqual(['sections']);
    expect(await xatolar({ ...toliq, sections: { LERNEN: -2 } })).toEqual(['sections']);
  });

  it('studentId maydoni qabul qilinmaydi', async () => {
    expect(await xatolar({ ...toliq, studentId: 5 })).toEqual(['studentId']);
  });
});
```

```ts
// server/src/app-activity/app-activity-write.service.spec.ts
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppActivityWriteService } from './app-activity-write.service';

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
const ctx = { studentId: 55, companyId: 1 };
// 2026-09-13 15:00 Toshkent
const NOW = new Date('2026-09-13T10:00:00.000Z');
const dto = {
  sessionId: UUID,
  platform: 'WEB' as const,
  activeSeconds: 60,
  radioSeconds: 20,
  sections: { LERNEN: 40, OTHER: 20 },
};

function fakePrisma(mavjud: Record<string, unknown> | null = null) {
  const p: any = {
    studentAppSession: {
      findUnique: jest.fn(async () => mavjud),
      create: jest.fn(async (a: any) => a.data),
      update: jest.fn(async (a: any) => a.data),
    },
    studentBranch: { findFirst: jest.fn(async () => ({ branchId: 7 })) },
    enrollment: { findFirst: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => []),
  };
  p.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(p));
  return p;
}

function seans(ortiqcha: Record<string, unknown> = {}) {
  return {
    studentId: 55,
    day: new Date('2026-09-13T00:00:00.000Z'),
    firstSeenAt: new Date('2026-09-13T09:50:00.000Z'),
    activeSeconds: 300,
    radioSeconds: 100,
    sections: { LERNEN: 200, OTHER: 100 },
    appVersion: null,
    ...ortiqcha,
  };
}

describe('AppActivityWriteService.heartbeat', () => {
  it('yangi seans: Toshkent kuni, firstSeenAt, muhrlangan filial bilan yaratiladi', async () => {
    const prisma = fakePrisma(null);
    const r = await new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW);
    const data = prisma.studentAppSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      id: UUID,
      studentId: 55,
      companyId: 1,
      branchId: 7,
      platform: 'WEB',
      appVersion: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      activeSeconds: 60,
      radioSeconds: 20,
      sections: { LERNEN: 40, OTHER: 20 },
    });
    expect(data.day.toISOString()).toBe('2026-09-13T00:00:00.000Z');
    expect(r).toEqual({ activeSeconds: 60, radioSeconds: 20 });
    expect(prisma.studentAppSession.update).not.toHaveBeenCalled();
  });

  it('Toshkent yarim tunidan keyin UTC hali kechagi kun bo`lsa ham kun Toshkentniki', async () => {
    const prisma = fakePrisma(null);
    // 2026-09-13T19:30Z = 14-sentabr 00:30 Toshkent
    await new AppActivityWriteService(prisma).heartbeat(dto, ctx, new Date('2026-09-13T19:30:00.000Z'));
    const data = prisma.studentAppSession.create.mock.calls[0][0].data;
    expect(data.day.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('o`z seansi: qator qulflanadi, max va soat bilan yangilanadi', async () => {
    const prisma = fakePrisma(seans());
    const r = await new AppActivityWriteService(prisma).heartbeat(
      { ...dto, activeSeconds: 900, radioSeconds: 50, sections: { LERNEN: 100, OTHER: 700 } },
      ctx,
      NOW,
    );
    expect(prisma.$queryRaw).toHaveBeenCalled();
    const upd = prisma.studentAppSession.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: UUID });
    // firstSeenAt dan 600 s o'tgan → ship 720; active max(300,900)=900 → 720; radio max(100,50)=100
    expect(upd.data).toMatchObject({ lastSeenAt: NOW, activeSeconds: 720, radioSeconds: 100 });
    // LERNEN 200, OTHER 700 → 900 > 720 → koef 0.8
    expect(upd.data.sections).toEqual({ LERNEN: 160, OTHER: 560 });
    expect(r).toEqual({ activeSeconds: 720, radioSeconds: 100 });
    expect(prisma.studentAppSession.create).not.toHaveBeenCalled();
  });

  it('begona seans — 403, hech narsa yozilmaydi', async () => {
    const prisma = fakePrisma(seans({ studentId: 99 }));
    await expect(
      new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.studentAppSession.update).not.toHaveBeenCalled();
  });

  it('kechagi seans — 409, hech narsa yozilmaydi', async () => {
    const prisma = fakePrisma(seans({ day: new Date('2026-09-12T00:00:00.000Z') }));
    await expect(
      new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.studentAppSession.update).not.toHaveBeenCalled();
  });

  it('bir vaqtda ikki birinchi so`rov (P2002): ikkinchisi yangilash yo`liga o`tadi', async () => {
    const prisma = fakePrisma(null);
    let chaqiruv = 0;
    prisma.studentAppSession.findUnique = jest.fn(async () => (chaqiruv++ === 0 ? null : seans()));
    prisma.studentAppSession.create = jest.fn(async () => {
      throw new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });
    await new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW);
    expect(prisma.studentAppSession.update).toHaveBeenCalled();
  });

  it('P2002 bo`lmagan yaratish xatosi yuqoriga chiqadi', async () => {
    const prisma = fakePrisma(null);
    prisma.studentAppSession.create = jest.fn(async () => {
      throw new Error('DB down');
    });
    await expect(
      new AppActivityWriteService(prisma).heartbeat(dto, ctx, NOW),
    ).rejects.toThrow('DB down');
  });
});
```

```ts
// server/src/app-activity/student-activity.controller.spec.ts
import 'reflect-metadata';
import { NotFoundException, RequestMethod } from '@nestjs/common';
import { RolesGuard } from '../common/guards';
import { StudentActivityController } from './student-activity.controller';

describe('StudentActivityController', () => {
  it('faqat Student roli, RolesGuard bilan', () => {
    expect(Reflect.getMetadata('roles', StudentActivityController)).toEqual(['Student']);
    const guards = Reflect.getMetadata('__guards__', StudentActivityController) as unknown[];
    expect(guards).toContain(RolesGuard);
  });

  it('POST student-portal/activity', () => {
    expect(Reflect.getMetadata('path', StudentActivityController)).toBe('student-portal');
    const metod = StudentActivityController.prototype.heartbeat;
    expect(Reflect.getMetadata('path', metod)).toBe('activity');
    expect(Reflect.getMetadata('method', metod)).toBe(RequestMethod.POST);
  });

  it('studentId va companyId tokendan servisga uzatiladi', async () => {
    const servis = { heartbeat: jest.fn(async () => ({ activeSeconds: 1, radioSeconds: 0 })) };
    const c = new StudentActivityController(servis as any);
    const body = {
      sessionId: '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f',
      platform: 'WEB' as const,
      activeSeconds: 1,
      radioSeconds: 0,
      sections: {},
    };
    await c.heartbeat(body, 55, 1);
    expect(servis.heartbeat).toHaveBeenCalledWith(body, { studentId: 55, companyId: 1 });
  });

  it('tokenda studentId yo`q — 404', () => {
    const c = new StudentActivityController({ heartbeat: jest.fn() } as any);
    expect(() =>
      c.heartbeat(
        { sessionId: 'x', platform: 'WEB', activeSeconds: 0, radioSeconds: 0, sections: {} },
        0,
        1,
      ),
    ).toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- app-activity` → FAIL (modullar yo'q).

- [ ] **Step 3: DTO**

```ts
// server/src/app-activity/dto/activity-heartbeat.dto.ts
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Bir sutkadagi soniyalar — bitta seans bundan uzun bo'la olmaydi (seans kun almashganda yopiladi). */
const SUTKA_S = 86_400;

export class ActivitySectionsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  LERNEN?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  OTHER?: number;
}

/**
 * Faollik yuborishi (dizayn 4.2). Barcha sonlar seans boshidan JAMI — delta
 * emas. `studentId` ATAYLAB YO'Q: u tokendan olinadi.
 */
export class ActivityHeartbeatDto {
  @IsUUID('4')
  sessionId!: string;

  @IsIn(['WEB', 'ANDROID', 'IOS'])
  platform!: 'WEB' | 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  activeSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  radioSeconds!: number;

  @ValidateNested()
  @Type(() => ActivitySectionsDto)
  sections!: ActivitySectionsDto;
}
```

- [ ] **Step 4: Servis**

```ts
// server/src/app-activity/app-activity-write.service.ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { birlashtir, bolimlarniOqi, type SeansQiymatlari } from './heartbeat-merge';
import type { ActivityHeartbeatDto } from './dto/activity-heartbeat.dto';

export interface FaollikKonteksti {
  studentId: number;
  companyId: number;
}

/**
 * Ilova faollik seansini yozadi (dizayn 4.3).
 *
 * Yangi seans birinchi so'rovda yaratiladi (`firstSeenAt`, Toshkent `day`,
 * muhrlangan `branchId`). Keyingilari qatorni `FOR UPDATE` bilan qulflab
 * yangilaydi: bir vaqtda kelgan ikki so'rov eskirgan qiymatni o'qib, bir-birini
 * pastroq raqam bilan bosib ketmasin.
 */
@Injectable()
export class AppActivityWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(
    dto: ActivityHeartbeatDto,
    ctx: FaollikKonteksti,
    now: Date = new Date(),
  ): Promise<{ activeSeconds: number; radioSeconds: number }> {
    const kelgan: SeansQiymatlari = {
      activeSeconds: dto.activeSeconds,
      radioSeconds: dto.radioSeconds,
      sections: bolimlarniOqi(dto.sections),
    };

    const bor = await this.prisma.studentAppSession.findUnique({
      where: { id: dto.sessionId },
      select: { studentId: true },
    });
    if (!bor) {
      const yaratildi = await this.yarat(dto, ctx, kelgan, now);
      if (yaratildi) return yaratildi;
    }
    return this.yangila(dto, ctx, kelgan, now);
  }

  /** `null` — shu orada boshqa so'rov yaratib ulgurdi (P2002), yangilash yo'liga o'tiladi. */
  private async yarat(
    dto: ActivityHeartbeatDto,
    ctx: FaollikKonteksti,
    kelgan: SeansQiymatlari,
    now: Date,
  ): Promise<{ activeSeconds: number; radioSeconds: number } | null> {
    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const q = birlashtir(null, kelgan, now, now);
    try {
      await this.prisma.studentAppSession.create({
        data: {
          id: dto.sessionId,
          studentId: ctx.studentId,
          companyId: ctx.companyId,
          branchId,
          platform: dto.platform,
          appVersion: dto.appVersion ?? null,
          day: utcMidnightFromDateStr(tashkentDateStr(now)),
          firstSeenAt: now,
          lastSeenAt: now,
          activeSeconds: q.activeSeconds,
          radioSeconds: q.radioSeconds,
          sections: q.sections,
        },
      });
      return { activeSeconds: q.activeSeconds, radioSeconds: q.radioSeconds };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return null;
      }
      throw err;
    }
  }

  private yangila(
    dto: ActivityHeartbeatDto,
    ctx: FaollikKonteksti,
    kelgan: SeansQiymatlari,
    now: Date,
  ): Promise<{ activeSeconds: number; radioSeconds: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StudentAppSession" WHERE "id" = ${dto.sessionId} FOR UPDATE`;
      const mavjud = await tx.studentAppSession.findUnique({
        where: { id: dto.sessionId },
        select: {
          studentId: true,
          day: true,
          firstSeenAt: true,
          activeSeconds: true,
          radioSeconds: true,
          sections: true,
          appVersion: true,
        },
      });
      if (!mavjud || mavjud.studentId !== ctx.studentId) {
        throw new ForbiddenException("Bu seans boshqa o'quvchiga tegishli");
      }
      // `day` @db.Date — Prisma uni UTC yarim tuni sifatida qaytaradi.
      if (mavjud.day.toISOString().slice(0, 10) !== tashkentDateStr(now)) {
        throw new ConflictException('Seans kuni tugagan — yangi seans oching');
      }
      const q = birlashtir(
        {
          activeSeconds: mavjud.activeSeconds,
          radioSeconds: mavjud.radioSeconds,
          sections: bolimlarniOqi(mavjud.sections),
        },
        kelgan,
        mavjud.firstSeenAt,
        now,
      );
      await tx.studentAppSession.update({
        where: { id: dto.sessionId },
        data: {
          lastSeenAt: now,
          appVersion: dto.appVersion ?? mavjud.appVersion,
          activeSeconds: q.activeSeconds,
          radioSeconds: q.radioSeconds,
          sections: q.sections,
        },
      });
      return { activeSeconds: q.activeSeconds, radioSeconds: q.radioSeconds };
    });
  }
}
```

Eslatma: `sections: q.sections` Prisma `Json` maydoniga tip bermasa (`Partial<Record>` qiymatlari `undefined` bo'lishi mumkinligi uchun), `import type { Prisma }` bilan `q.sections as Prisma.InputJsonObject` qiling — ob'ektda `undefined` qiymat hech qachon bo'lmaydi (`birlashtir` faqat musbat kalitlarni qo'yadi). Testdagi soxta `$transaction` callback'ni o'sha `p` ob'ekti bilan chaqiradi. Agar `tx` tipi `$queryRaw`/`studentAppSession` bo'yicha typecheck bermasa, `this.prisma.$transaction` ning Prisma tipidan foydalaning (loyihadagi boshqa `$transaction(async (tx) => …)` joylari kabi) — `as any` ishlatmang.

- [ ] **Step 5: Controller, modul, ulash, route siyosati**

```ts
// server/src/app-activity/student-activity.controller.ts
import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ActivityHeartbeatDto } from './dto/activity-heartbeat.dto';
import { AppActivityWriteService } from './app-activity-write.service';

/**
 * O'quvchi ilovasining faollik yuborishi (dizayn 4). `studentId` TOKENDAN —
 * DTO'da bunday maydon yo'q, begona seans servisda 403 bilan rad etiladi.
 */
@Controller('student-portal')
@UseGuards(RolesGuard)
@Roles('Student')
export class StudentActivityController {
  constructor(private readonly faollik: AppActivityWriteService) {}

  @Post('activity')
  heartbeat(
    @Body() dto: ActivityHeartbeatDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.faollik.heartbeat(dto, { studentId, companyId });
  }
}
```

```ts
// server/src/app-activity/app-activity.module.ts
import { Module } from '@nestjs/common';
import { StudentActivityController } from './student-activity.controller';
import { AppActivityWriteService } from './app-activity-write.service';

@Module({
  controllers: [StudentActivityController],
  providers: [AppActivityWriteService],
  exports: [AppActivityWriteService],
})
export class AppActivityModule {}
```

`server/src/app.module.ts`: `import { AppActivityModule } from './app-activity/app-activity.module';` va `imports` massivida `DafModule,` qatoridan keyin `AppActivityModule,`.

`server/src/common/auth/branch-route-policy.ts` — `ROUTE_POLICIES` ichida `'POST /student-portal/lernen/uebung/juft'` joylashgan SELF blokidan keyin yangi element:

```ts
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` — the caller is the subject and the " +
      'DTO has no `studentId`. A session id owned by another student is refused ' +
      "(403). The row's branch is STAMPED from the student's own record on the " +
      'first write, never taken from a header, so a later transfer does not move ' +
      'past activity into the new branch.',
    routes: ['POST /student-portal/activity'],
  },
```

- [ ] **Step 6: Tekshirish**

Run: `npm test -- app-activity` → PASS. Keyin `npx eslint --fix` yangi/o'zgargan fayllarga, `npm test` (to'liq, `branch-route-policy` spec'i ham), `npm run typecheck`, `npm run build`, `npx eslint src` (0 error).

- [ ] **Step 7: Commit**

```bash
git add src/app-activity src/app.module.ts src/common/auth/branch-route-policy.ts
git commit -m "POST /student-portal/activity: faollik seansini yozish (403/409, qulf, P2002)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ta'lim audiosi reyestri va radio holati

**Files:**
- Create: `client/src/components/student-portal/lib/media-registry.ts`, `client/src/components/student-portal/lib/media-registry.test.ts`
- Modify: `client/src/components/student-portal/lib/radio-store.ts` (fayl oxiriga funksiya)
- Create: `client/src/components/student-portal/lib/radio-ovoz-holati.test.ts`
- Modify: `client/src/components/student-portal/lernen/use-clip-player.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/ovoz-tugmasi.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/suhbat-pleyer.tsx`

**Interfaces:**
- Produces: `registerMedia(el: { readonly paused: boolean; readonly ended: boolean }): () => void`; `anyMediaPlaying(): boolean`; `_reyestrniTozala(): void` (faqat testlar); `radioOvozHolati(): { position: number; audible: boolean } | null`.

- [ ] **Step 1: Yiqiladigan testlar**

```ts
// client/src/components/student-portal/lib/media-registry.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { _reyestrniTozala, anyMediaPlaying, registerMedia } from "./media-registry";

const el = (paused: boolean, ended = false) => ({ paused, ended });

afterEach(() => _reyestrniTozala());

describe("media-registry", () => {
  it("bo'sh reyestr — ijro yo'q", () => {
    expect(anyMediaPlaying()).toBe(false);
  });

  it("pauzadagi element ijro emas, o'ynayotgani ijro", () => {
    registerMedia(el(true));
    expect(anyMediaPlaying()).toBe(false);
    registerMedia(el(false));
    expect(anyMediaPlaying()).toBe(true);
  });

  it("tugagan (ended) element ijro hisoblanmaydi", () => {
    registerMedia({ paused: false, ended: true });
    expect(anyMediaPlaying()).toBe(false);
  });

  it("ro'yxatdan chiqarilgan element hisobga kirmaydi", () => {
    const chiqar = registerMedia(el(false));
    chiqar();
    expect(anyMediaPlaying()).toBe(false);
  });
});
```

```ts
// client/src/components/student-portal/lib/radio-ovoz-holati.test.ts
import { describe, expect, it } from "vitest";
import { radioOvozHolati } from "./radio-store";

describe("radioOvozHolati", () => {
  it("radio hali yoqilmagan (element yaratilmagan) — null", () => {
    expect(radioOvozHolati()).toBeNull();
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run (client): `npm test -- media-registry radio-ovoz-holati` → FAIL.

- [ ] **Step 3: Reyestr**

```ts
// client/src/components/student-portal/lib/media-registry.ts
/**
 * Ta'lim audiosi reyestri (dizayn 4.5).
 *
 * Faollik hisobi «o'quvchi hozir ta'lim audiosini tinglayaptimi» degan savolga
 * shu yerdan javob oladi: audio ijro etilayotganda o'quvchi ekranga tegmasa ham
 * faol hisoblanadi. `use-clip-player` `new Audio()` yaratadi va u DOM'da yo'q —
 * `querySelector("audio")` uni topmaydi, shuning uchun har pleyer o'zi yoziladi.
 *
 * RADIO BU YERGA KIRMAYDI: radio vaqti alohida o'lchanadi va o'quvchini «faol»
 * qilmaydi. Yangi ta'lim audio pleyeri qo'shilsa, u ham `registerMedia` qilishi SHART.
 */
export interface IjroEtuvchi {
  readonly paused: boolean;
  readonly ended: boolean;
}

const royxat = new Set<IjroEtuvchi>();

/** Elementni yozadi; qaytgan funksiya uni ro'yxatdan chiqaradi. */
export function registerMedia(el: IjroEtuvchi): () => void {
  royxat.add(el);
  return () => {
    royxat.delete(el);
  };
}

export function anyMediaPlaying(): boolean {
  for (const el of royxat) {
    if (!el.paused && !el.ended) return true;
  }
  return false;
}

/** Faqat testlar uchun. */
export function _reyestrniTozala(): void {
  royxat.clear();
}
```

- [ ] **Step 4: Radio holati** (`radio-store.ts` oxiriga)

```ts
/**
 * Faollik hisobi uchun radio holati (dizayn 4.5): pozitsiya (`currentTime`,
 * soniya) va ovoz hozir haqiqatan eshitilyaptimi. Element hali yaratilmagan
 * bo'lsa `null`. Radio vaqti soat bilan emas, pozitsiya o'sishi bilan
 * o'lchanadi — brauzer fon tabida taymerlarni uxlatsa ham siljish yo'qolmaydi,
 * yuklanish (buffering) paytida esa pozitsiya o'smaydi.
 */
export function radioOvozHolati(): { position: number; audible: boolean } | null {
  if (!audio) return null;
  const { status, muted, volume } = useRadio.getState();
  return {
    position: audio.currentTime,
    audible: status === "playing" && !audio.paused && !muted && volume > 0,
  };
}
```

- [ ] **Step 5: Pleyerlarni reyestrga ulash**

`use-clip-player.ts`: importga `import { registerMedia } from "../lib/media-registry";`. `audioRef` yonida:

```ts
  // Faollik hisobi uchun reyestrdan chiqaruvchi (dizayn 4.5).
  const unregisterRef = React.useRef<(() => void) | null>(null);
```

Mavjud `React.useEffect(() => stop, [stop]);` qatorini shu bilan almashtiring:

```ts
  React.useEffect(
    () => () => {
      stop();
      unregisterRef.current?.();
      unregisterRef.current = null;
    },
    [stop],
  );
```

Mavjud klip almashish effektida `audioRef.current = null;` qatoridan OLDIN:

```ts
    unregisterRef.current?.();
    unregisterRef.current = null;
```

`audioRef.current ??= new Audio(clip.url);` qatorini shu bilan almashtiring:

```ts
    if (!audioRef.current) {
      audioRef.current = new Audio(clip.url);
      unregisterRef.current = registerMedia(audioRef.current);
    }
```

`ovoz-tugmasi.tsx` va `suhbat-pleyer.tsx` — ikkalasida importga `import { registerMedia } from "../../lib/media-registry";` va `audioRef` e'lonidan keyin:

```tsx
  // Faollik hisobi: bu audio ijro etilayotganda o'quvchi ekranga tegmasa ham
  // faol (dizayn 4.5). `<audio key={url}>` url almashganda qayta yaratiladi —
  // effekt ham url bilan qayta ulanadi.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    return registerMedia(a);
  }, [url]);
```

- [ ] **Step 6: Tekshirish**

Run: `npm test -- media-registry radio-ovoz-holati` → PASS. `npx eslint --fix` o'zgargan fayllarga; `npm test`, `npm run typecheck`, `npx eslint src` (0 error).

- [ ] **Step 7: Commit**

```bash
git add src/components/student-portal/lib/media-registry.ts src/components/student-portal/lib/media-registry.test.ts src/components/student-portal/lib/radio-store.ts src/components/student-portal/lib/radio-ovoz-holati.test.ts src/components/student-portal/lernen/use-clip-player.ts src/components/student-portal/lernen/uebung/ovoz-tugmasi.tsx src/components/student-portal/lernen/uebung/suhbat-pleyer.tsx
git commit -m "Ta'lim audiosi reyestri va radio ovoz holati (faollik hisobi uchun)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Faollik o'lchagichi (sof modul)

**Files:**
- Create: `client/src/components/student-portal/lib/activity-tracker.ts`
- Test: `client/src/components/student-portal/lib/activity-tracker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Bolim = "LERNEN" | "OTHER";
  export const FAOLSIZLIK_MS = 120_000; TICK_QIRQISH_MS = 5_000; SEANS_TANAFFUSI_MS = 1_800_000;
  export interface FaollikSeansi { sessionId: string; userId: number; kun: string; activeMs: number; radioMs: number; sections: Record<Bolim, number>; lastActiveAt: number }
  export interface TrackerHolati { seans: FaollikSeansi; lastTickAt: number; lastRadioPos: number | null }
  export interface TickKirish { now: number; visible: boolean; focused: boolean; lastInputAt: number; mediaPlaying: boolean; pathname: string; radio: { position: number; audible: boolean } | null }
  export interface TickNatija { holat: TrackerHolati; yopilgan: FaollikSeansi | null }
  export interface FaollikPayload { sessionId: string; platform: "WEB"; activeSeconds: number; radioSeconds: number; sections: { LERNEN: number; OTHER: number } }
  export function tashkentKuni(ms: number): string
  export function bolimFor(pathname: string): Bolim
  export function yangiSeans(userId: number, now: number, sessionId: string): FaollikSeansi
  export function boshlangichHolat(seans: FaollikSeansi, now: number): TrackerHolati
  export function tick(h: TrackerHolati, k: TickKirish, idYarat: () => string): TickNatija
  export function payloadFor(s: FaollikSeansi): FaollikPayload
  export function yuborishgaArziydi(s: FaollikSeansi): boolean
  ```

- [ ] **Step 1: Yiqiladigan test**

```ts
// client/src/components/student-portal/lib/activity-tracker.test.ts
import { describe, expect, it } from "vitest";
import {
  bolimFor,
  boshlangichHolat,
  payloadFor,
  tashkentKuni,
  tick,
  yangiSeans,
  yuborishgaArziydi,
  type TickKirish,
  type TrackerHolati,
} from "./activity-tracker";

// 2026-09-13 15:00 Toshkent
const T0 = Date.parse("2026-09-13T10:00:00.000Z");

function holat(ortiqcha: Partial<TrackerHolati> = {}): TrackerHolati {
  return { ...boshlangichHolat(yangiSeans(7, T0, "s1"), T0), ...ortiqcha };
}

function kirish(ortiqcha: Partial<TickKirish> = {}): TickKirish {
  return {
    now: T0 + 1000,
    visible: true,
    focused: true,
    lastInputAt: T0,
    mediaPlaying: false,
    pathname: "/portal/lernen/lessons/5",
    radio: null,
    ...ortiqcha,
  };
}

let n = 0;
const id = () => `yangi-${++n}`;

describe("tick — faol vaqt", () => {
  it("ko'rinib turgan, fokusdagi, yaqinda tegilgan ekran: qadam faol vaqtga va bo'limga qo'shiladi", () => {
    const r = tick(holat(), kirish(), id);
    expect(r.holat.seans.activeMs).toBe(1000);
    expect(r.holat.seans.sections).toEqual({ LERNEN: 1000, OTHER: 0 });
    expect(r.holat.seans.lastActiveAt).toBe(T0 + 1000);
    expect(r.holat.lastTickAt).toBe(T0 + 1000);
    expect(r.yopilgan).toBeNull();
  });

  it("tab yashirin yoki oyna fokusda emas — sanalmaydi", () => {
    expect(tick(holat(), kirish({ visible: false }), id).holat.seans.activeMs).toBe(0);
    expect(tick(holat(), kirish({ focused: false }), id).holat.seans.activeMs).toBe(0);
  });

  it("oxirgi tegilganidan 2 daqiqa o'tgan — sanalmaydi, lekin ta'lim audiosi o'ynasa sanaladi", () => {
    const eski = { lastInputAt: T0 - 120_001 };
    expect(tick(holat(), kirish(eski), id).holat.seans.activeMs).toBe(0);
    expect(tick(holat(), kirish({ ...eski, mediaPlaying: true }), id).holat.seans.activeMs).toBe(1000);
  });

  it("uzoq tanaffusdan keyingi tick 5 soniyaga qirqiladi (kompyuter uxlagan)", () => {
    const r = tick(holat(), kirish({ now: T0 + 60_000, lastInputAt: T0 + 59_000 }), id);
    expect(r.holat.seans.activeMs).toBe(5000);
  });

  it("boshqa sahifa OTHER bo'limiga tushadi", () => {
    const r = tick(holat(), kirish({ pathname: "/portal/payments" }), id);
    expect(r.holat.seans.sections).toEqual({ LERNEN: 0, OTHER: 1000 });
  });
});

describe("tick — radio", () => {
  const radio = (position: number, audible = true) => ({ position, audible });

  it("pozitsiya o'sishi radio vaqtiga qo'shiladi, faol vaqtga emas, ekran yashirin bo'lsa ham", () => {
    const h = holat({ lastRadioPos: 10 });
    const r = tick(h, kirish({ radio: radio(10.8), visible: false }), id);
    expect(r.holat.seans.radioMs).toBeCloseTo(800, 5);
    expect(r.holat.seans.activeMs).toBe(0);
    expect(r.holat.lastRadioPos).toBe(10.8);
  });

  it("bir o'lchovdagi siljish o'tgan soat vaqti + 1 s dan oshmaydi", () => {
    const h = holat({ lastRadioPos: 0 });
    const r = tick(h, kirish({ radio: radio(30) }), id); // devor 1 s → ko'pi bilan 2 s
    expect(r.holat.seans.radioMs).toBe(2000);
  });

  it("stansiya almashdi (pozitsiya kamaydi), birinchi o'lchov yoki eshitilmayapti — 0", () => {
    expect(tick(holat({ lastRadioPos: 50 }), kirish({ radio: radio(1) }), id).holat.seans.radioMs).toBe(0);
    expect(tick(holat({ lastRadioPos: null }), kirish({ radio: radio(5) }), id).holat.seans.radioMs).toBe(0);
    expect(tick(holat({ lastRadioPos: 5 }), kirish({ radio: radio(5.9, false) }), id).holat.seans.radioMs).toBe(0);
  });
});

describe("tick — seans almashishi", () => {
  it("30 daqiqadan uzoq harakatsizlikdan keyin harakat boshlansa: eski seans yopiladi, yangisi shu tickni oladi", () => {
    const h = holat({ lastTickAt: T0 + 31 * 60_000 - 1000 });
    const now = T0 + 31 * 60_000;
    const r = tick(h, kirish({ now, lastInputAt: now }), id);
    expect(r.yopilgan?.sessionId).toBe("s1");
    expect(r.holat.seans.sessionId).not.toBe("s1");
    expect(r.holat.seans.activeMs).toBe(1000);
  });

  it("harakatsiz qolsa seans almashmaydi", () => {
    const h = holat({ lastTickAt: T0 + 40 * 60_000 - 1000 });
    const r = tick(h, kirish({ now: T0 + 40 * 60_000, visible: false }), id);
    expect(r.yopilgan).toBeNull();
    expect(r.holat.seans.sessionId).toBe("s1");
  });

  it("Toshkent yarim tunida harakat bo'lsa yangi seans", () => {
    const kechqurun = Date.parse("2026-09-13T18:59:59.000Z"); // 23:59:59 Toshkent
    const h = boshlangichHolat(yangiSeans(7, kechqurun, "s1"), kechqurun);
    const r = tick(h, kirish({ now: kechqurun + 2000, lastInputAt: kechqurun + 2000 }), id);
    expect(r.yopilgan?.sessionId).toBe("s1");
    expect(r.holat.seans.kun).toBe("2026-09-14");
  });
});

describe("yordamchilar", () => {
  it("tashkentKuni UTC+5", () => {
    expect(tashkentKuni(Date.parse("2026-09-13T18:59:59.000Z"))).toBe("2026-09-13");
    expect(tashkentKuni(Date.parse("2026-09-13T19:00:00.000Z"))).toBe("2026-09-14");
  });

  it("bolimFor: faqat /portal/lernen va uning ichi LERNEN", () => {
    expect(bolimFor("/portal/lernen")).toBe("LERNEN");
    expect(bolimFor("/portal/lernen/units/2")).toBe("LERNEN");
    expect(bolimFor("/portal/lernenx")).toBe("OTHER");
    expect(bolimFor("/portal/radio")).toBe("OTHER");
  });

  it("payloadFor soniyaga pastga yumaloqlaydi; yuborishgaArziydi kamida 1 s bo'lsa", () => {
    const s = { ...yangiSeans(7, T0, "s1"), activeMs: 61_900, radioMs: 999, sections: { LERNEN: 40_500, OTHER: 21_400 } };
    expect(payloadFor(s)).toEqual({
      sessionId: "s1",
      platform: "WEB",
      activeSeconds: 61,
      radioSeconds: 0,
      sections: { LERNEN: 40, OTHER: 21 },
    });
    expect(yuborishgaArziydi(s)).toBe(true);
    expect(yuborishgaArziydi(yangiSeans(7, T0, "s2"))).toBe(false);
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- activity-tracker` → FAIL.

- [ ] **Step 3: Modul**

```ts
// client/src/components/student-portal/lib/activity-tracker.ts
/**
 * Ilova faolligini o'lchash — SOF modul (dizayn 3 va 4.5). Brauzer API'lariga
 * tegmaydi: har soniyadagi holatni (`TickKirish`) oladi va yangi holat qaytaradi.
 * Brauzer bilan bog'lash `activity-runtime.ts` da.
 *
 * FAOL VAQT = ekran ko'rinib turibdi VA oyna fokusda VA (oxirgi 2 daqiqada
 * teginish/bosish/klaviatura/aylantirish bo'lgan YOKI ta'lim audiosi o'ynayapti).
 * Ikki ochiq tab vaqtni ikki marta sanamaydi — fokus faqat bittasida.
 *
 * RADIO VAQTI = pleyer pozitsiyasining o'sishi; faol vaqtga qo'shilmaydi.
 */
export type Bolim = "LERNEN" | "OTHER";

export const FAOLSIZLIK_MS = 120_000;
export const TICK_QIRQISH_MS = 5_000;
export const SEANS_TANAFFUSI_MS = 30 * 60_000;
const TOSHKENT_SILJISHI_MS = 5 * 60 * 60 * 1000;

export interface FaollikSeansi {
  sessionId: string;
  userId: number;
  /** Seans boshlangan Toshkent kuni, 'YYYY-MM-DD'. */
  kun: string;
  activeMs: number;
  radioMs: number;
  sections: Record<Bolim, number>;
  /** Oxirgi faol soniya yoki radio eshitilgan payt (ms). */
  lastActiveAt: number;
}

export interface TrackerHolati {
  seans: FaollikSeansi;
  lastTickAt: number;
  lastRadioPos: number | null;
}

export interface TickKirish {
  now: number;
  visible: boolean;
  focused: boolean;
  lastInputAt: number;
  mediaPlaying: boolean;
  pathname: string;
  radio: { position: number; audible: boolean } | null;
}

export interface TickNatija {
  holat: TrackerHolati;
  /** Shu tickda yopilgan seans — yakuniy yuborish uchun. */
  yopilgan: FaollikSeansi | null;
}

export interface FaollikPayload {
  sessionId: string;
  platform: "WEB";
  activeSeconds: number;
  radioSeconds: number;
  sections: { LERNEN: number; OTHER: number };
}

/** Toshkent kuni (UTC+5, yozgi vaqt yo'q). */
export function tashkentKuni(ms: number): string {
  return new Date(ms + TOSHKENT_SILJISHI_MS).toISOString().slice(0, 10);
}

export function bolimFor(pathname: string): Bolim {
  return pathname === "/portal/lernen" || pathname.startsWith("/portal/lernen/")
    ? "LERNEN"
    : "OTHER";
}

export function yangiSeans(userId: number, now: number, sessionId: string): FaollikSeansi {
  return {
    sessionId,
    userId,
    kun: tashkentKuni(now),
    activeMs: 0,
    radioMs: 0,
    sections: { LERNEN: 0, OTHER: 0 },
    lastActiveAt: now,
  };
}

export function boshlangichHolat(seans: FaollikSeansi, now: number): TrackerHolati {
  return { seans, lastTickAt: now, lastRadioPos: null };
}

export function tick(h: TrackerHolati, k: TickKirish, idYarat: () => string): TickNatija {
  const devor = Math.max(0, k.now - h.lastTickAt);
  const qadam = Math.min(devor, TICK_QIRQISH_MS);
  const faol =
    k.visible &&
    k.focused &&
    (k.now - k.lastInputAt <= FAOLSIZLIK_MS || k.mediaPlaying);

  // Radio: pozitsiya o'sishi, lekin o'tgan soat vaqti + 1 s dan ko'p emas.
  // Stansiya almashganda pozitsiya qaytadan boshlanadi — manfiy farq 0.
  let radioQadam = 0;
  if (k.radio && k.radio.audible && h.lastRadioPos !== null) {
    const siljish = (k.radio.position - h.lastRadioPos) * 1000;
    if (siljish > 0) radioQadam = Math.min(siljish, devor + 1000);
  }

  const harakat = (faol && qadam > 0) || radioQadam > 0;
  let seans = h.seans;
  let yopilgan: FaollikSeansi | null = null;

  // Seans faqat harakat qayta boshlanganda almashadi: kun o'zgargan yoki
  // 30 daqiqadan uzoq harakat bo'lmagan.
  if (
    harakat &&
    (tashkentKuni(k.now) !== seans.kun || k.now - seans.lastActiveAt > SEANS_TANAFFUSI_MS)
  ) {
    yopilgan = seans;
    seans = yangiSeans(seans.userId, k.now, idYarat());
  }

  if (harakat) {
    const bolim = bolimFor(k.pathname);
    seans = {
      ...seans,
      activeMs: seans.activeMs + (faol ? qadam : 0),
      radioMs: seans.radioMs + radioQadam,
      sections: faol
        ? { ...seans.sections, [bolim]: seans.sections[bolim] + qadam }
        : seans.sections,
      lastActiveAt: k.now,
    };
  }

  return {
    holat: {
      seans,
      lastTickAt: k.now,
      lastRadioPos: k.radio ? k.radio.position : null,
    },
    yopilgan,
  };
}

export function payloadFor(s: FaollikSeansi): FaollikPayload {
  const sek = (ms: number) => Math.floor(ms / 1000);
  return {
    sessionId: s.sessionId,
    platform: "WEB",
    activeSeconds: sek(s.activeMs),
    radioSeconds: sek(s.radioMs),
    sections: { LERNEN: sek(s.sections.LERNEN), OTHER: sek(s.sections.OTHER) },
  };
}

/** Bo'sh seansni serverga yubormaslik uchun. */
export function yuborishgaArziydi(s: FaollikSeansi): boolean {
  return s.activeMs >= 1000 || s.radioMs >= 1000;
}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test -- activity-tracker` → PASS. `npx eslint --fix` ikkala faylga, `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/components/student-portal/lib/activity-tracker.ts src/components/student-portal/lib/activity-tracker.test.ts
git commit -m "Faollik o'lchagichi: faol vaqt, radio, bo'lim va seans almashishi (sof modul)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Saqlash va yuborish

**Files:**
- Create: `client/src/components/student-portal/lib/activity-storage.ts`, `client/src/components/student-portal/lib/activity-storage.test.ts`
- Create: `client/src/components/student-portal/lib/activity-sender.ts`, `client/src/components/student-portal/lib/activity-sender.test.ts`

**Interfaces:**
- Consumes: Task 5 `FaollikSeansi`, `FaollikPayload`, `tashkentKuni`, `SEANS_TANAFFUSI_MS`, `payloadFor`, `yuborishgaArziydi`.
- Produces:
  ```ts
  // activity-storage.ts
  export interface Saqlagich { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
  export const JORIY_KALIT = "daf.faollik.joriy"; KUTILMOQDA_KALIT = "daf.faollik.kutilmoqda"; KUTILMOQDA_MAX = 20;
  export function joriyniSaqla(s: Saqlagich, seans: FaollikSeansi): void
  export function joriyniOqi(s: Saqlagich, userId: number, now: number): { davom: FaollikSeansi | null; yopilgan: FaollikSeansi | null }
  export function joriyniOchir(s: Saqlagich): void
  export function kutilmoqdaOqi(s: Saqlagich): FaollikPayload[]
  export function kutilmoqdaQosh(s: Saqlagich, p: FaollikPayload): void
  export function kutilmoqdaOchir(s: Saqlagich, sessionId: string): void
  // activity-sender.ts
  export type YuborishNatija = "ok" | "rad" | "xato";
  export interface YuborishMuhiti { fetchFn: typeof fetch; token: string | undefined; base: string | undefined }
  export function brauzerMuhiti(): YuborishMuhiti
  export function natijaFor(status: number): YuborishNatija
  export function yubor(payload: FaollikPayload, muhit?: YuborishMuhiti): Promise<YuborishNatija>
  ```

- [ ] **Step 1: Yiqiladigan testlar**

```ts
// client/src/components/student-portal/lib/activity-storage.test.ts
import { describe, expect, it } from "vitest";
import { payloadFor, yangiSeans } from "./activity-tracker";
import {
  JORIY_KALIT,
  KUTILMOQDA_KALIT,
  KUTILMOQDA_MAX,
  joriyniOchir,
  joriyniOqi,
  joriyniSaqla,
  kutilmoqdaOchir,
  kutilmoqdaOqi,
  kutilmoqdaQosh,
  type Saqlagich,
} from "./activity-storage";

function xotira(): Saqlagich & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const T0 = Date.parse("2026-09-13T10:00:00.000Z");

describe("joriy seans", () => {
  it("saqlangan seans o'sha foydalanuvchi, o'sha kun, 30 daqiqa ichida — davom etadi", () => {
    const s = xotira();
    const seans = { ...yangiSeans(7, T0, "s1"), activeMs: 5000 };
    joriyniSaqla(s, seans);
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({ davom: seans, yopilgan: null });
  });

  it("30 daqiqadan eski yoki boshqa kun — davom etmaydi, yopilgan sifatida qaytadi", () => {
    const s = xotira();
    const seans = yangiSeans(7, T0, "s1");
    joriyniSaqla(s, seans);
    expect(joriyniOqi(s, 7, T0 + 31 * 60_000)).toEqual({ davom: null, yopilgan: seans });
    expect(joriyniOqi(s, 7, T0 + 86_400_000)).toEqual({ davom: null, yopilgan: seans });
  });

  it("boshqa foydalanuvchiniki yoki buzilgan JSON — hech narsa qaytmaydi", () => {
    const s = xotira();
    joriyniSaqla(s, yangiSeans(8, T0, "s1"));
    expect(joriyniOqi(s, 7, T0)).toEqual({ davom: null, yopilgan: null });
    s.setItem(JORIY_KALIT, "{buzuq");
    expect(joriyniOqi(s, 7, T0)).toEqual({ davom: null, yopilgan: null });
    s.setItem(JORIY_KALIT, JSON.stringify({ sessionId: 5 }));
    expect(joriyniOqi(s, 7, T0)).toEqual({ davom: null, yopilgan: null });
  });

  it("joriyniOchir kalitni o'chiradi; saqlagich xato bersa jim o'tadi", () => {
    const s = xotira();
    joriyniSaqla(s, yangiSeans(7, T0, "s1"));
    joriyniOchir(s);
    expect(s.data.has(JORIY_KALIT)).toBe(false);
    const buzuq: Saqlagich = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(() => joriyniSaqla(buzuq, yangiSeans(7, T0, "s1"))).not.toThrow();
    expect(joriyniOqi(buzuq, 7, T0)).toEqual({ davom: null, yopilgan: null });
    expect(kutilmoqdaOqi(buzuq)).toEqual([]);
  });
});

describe("yuborilmaganlar", () => {
  it("bir xil seans qayta qo'shilsa eskisi almashtiriladi; o'chirish ishlaydi", () => {
    const s = xotira();
    const a = payloadFor({ ...yangiSeans(7, T0, "a"), activeMs: 10_000 });
    kutilmoqdaQosh(s, a);
    kutilmoqdaQosh(s, { ...a, activeSeconds: 20 });
    expect(kutilmoqdaOqi(s)).toEqual([{ ...a, activeSeconds: 20 }]);
    kutilmoqdaOchir(s, "a");
    expect(kutilmoqdaOqi(s)).toEqual([]);
  });

  it("ko'pi bilan 20 ta, eng eskilari tushib qoladi; buzilgan elementlar e'tiborga olinmaydi", () => {
    const s = xotira();
    for (let i = 0; i < KUTILMOQDA_MAX + 3; i++) {
      kutilmoqdaQosh(s, payloadFor(yangiSeans(7, T0, `s${i}`)));
    }
    const royxat = kutilmoqdaOqi(s);
    expect(royxat).toHaveLength(KUTILMOQDA_MAX);
    expect(royxat[0].sessionId).toBe("s3");
    s.setItem(KUTILMOQDA_KALIT, JSON.stringify([{ foo: 1 }, royxat[0]]));
    expect(kutilmoqdaOqi(s)).toEqual([royxat[0]]);
  });
});
```

```ts
// client/src/components/student-portal/lib/activity-sender.test.ts
import { describe, expect, it, vi } from "vitest";
import { natijaFor, yubor } from "./activity-sender";

const payload = {
  sessionId: "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f",
  platform: "WEB" as const,
  activeSeconds: 60,
  radioSeconds: 0,
  sections: { LERNEN: 60, OTHER: 0 },
};

describe("natijaFor", () => {
  it("2xx ok; 400/403/409 rad (qayta yuborishdan foyda yo'q); qolgani xato (keyin qayta)", () => {
    expect(natijaFor(201)).toBe("ok");
    expect(natijaFor(400)).toBe("rad");
    expect(natijaFor(403)).toBe("rad");
    expect(natijaFor(409)).toBe("rad");
    expect(natijaFor(401)).toBe("xato");
    expect(natijaFor(404)).toBe("xato");
    expect(natijaFor(500)).toBe("xato");
  });
});

describe("yubor", () => {
  it("keepalive POST, Bearer token, JSON tana", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 201 }));
    const n = await yubor(payload, { fetchFn: fetchFn as unknown as typeof fetch, token: "tok", base: "https://api.test/api" });
    expect(n).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/student-portal/activity");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("token yoki manzil yo'q — so'rov yuborilmaydi, xato", async () => {
    const fetchFn = vi.fn();
    expect(await yubor(payload, { fetchFn: fetchFn as unknown as typeof fetch, token: undefined, base: "x" })).toBe("xato");
    expect(await yubor(payload, { fetchFn: fetchFn as unknown as typeof fetch, token: "t", base: undefined })).toBe("xato");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("tarmoq xatosi — xato", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await yubor(payload, { fetchFn: fetchFn as unknown as typeof fetch, token: "t", base: "x" })).toBe("xato");
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- activity-storage activity-sender` → FAIL.

- [ ] **Step 3: Saqlash moduli**

```ts
// client/src/components/student-portal/lib/activity-storage.ts
import {
  SEANS_TANAFFUSI_MS,
  tashkentKuni,
  type FaollikPayload,
  type FaollikSeansi,
} from "./activity-tracker";

/**
 * Faollik hisobining `localStorage` qatlami (dizayn 4.5). Joriy seans har
 * 15 s saqlanadi — sahifa yangilansa yoki brauzer yopilsa, keyingi ochilishda
 * davom etadi yoki yopilgan sifatida serverga yuboriladi. Yuborilmagan yopiq
 * seanslar alohida ro'yxatda. Saqlagich xato bersa (xususiy rejim, kvota) jim
 * o'tiladi — faollik hisobi portalni hech qachon buzmasligi kerak.
 */
export interface Saqlagich {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const JORIY_KALIT = "daf.faollik.joriy";
export const KUTILMOQDA_KALIT = "daf.faollik.kutilmoqda";
export const KUTILMOQDA_MAX = 20;

function oqi(s: Saqlagich, kalit: string): unknown {
  try {
    const raw = s.getItem(kalit);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function yoz(s: Saqlagich, kalit: string, qiymat: unknown): void {
  try {
    s.setItem(kalit, JSON.stringify(qiymat));
  } catch {
    // Kvota yoki xususiy rejim — faollik hisobi portalni buzmasin.
  }
}

const son = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function seansmi(v: unknown): v is FaollikSeansi {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const sections = o.sections as Record<string, unknown> | undefined;
  return (
    typeof o.sessionId === "string" &&
    son(o.userId) &&
    typeof o.kun === "string" &&
    son(o.activeMs) &&
    son(o.radioMs) &&
    son(o.lastActiveAt) &&
    !!sections &&
    son(sections.LERNEN) &&
    son(sections.OTHER)
  );
}

function payloadmi(v: unknown): v is FaollikPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const sections = o.sections as Record<string, unknown> | undefined;
  return (
    typeof o.sessionId === "string" &&
    o.platform === "WEB" &&
    son(o.activeSeconds) &&
    son(o.radioSeconds) &&
    !!sections &&
    son(sections.LERNEN) &&
    son(sections.OTHER)
  );
}

export function joriyniSaqla(s: Saqlagich, seans: FaollikSeansi): void {
  yoz(s, JORIY_KALIT, seans);
}

/**
 * `davom` — shu foydalanuvchining bugungi, 30 daqiqa ichidagi seansi.
 * `yopilgan` — shu foydalanuvchining eskirgan seansi (yuborish kerak).
 * Boshqa foydalanuvchining seansi e'tiborga olinmaydi: uni bizning token
 * bilan yuborib bo'lmaydi (server 403 qaytaradi).
 */
export function joriyniOqi(
  s: Saqlagich,
  userId: number,
  now: number,
): { davom: FaollikSeansi | null; yopilgan: FaollikSeansi | null } {
  const v = oqi(s, JORIY_KALIT);
  if (!seansmi(v) || v.userId !== userId) return { davom: null, yopilgan: null };
  const yangi = v.kun === tashkentKuni(now) && now - v.lastActiveAt <= SEANS_TANAFFUSI_MS;
  return yangi ? { davom: v, yopilgan: null } : { davom: null, yopilgan: v };
}

export function joriyniOchir(s: Saqlagich): void {
  try {
    s.removeItem(JORIY_KALIT);
  } catch {
    // Jim o'tiladi.
  }
}

export function kutilmoqdaOqi(s: Saqlagich): FaollikPayload[] {
  const v = oqi(s, KUTILMOQDA_KALIT);
  return Array.isArray(v) ? v.filter(payloadmi) : [];
}

export function kutilmoqdaQosh(s: Saqlagich, p: FaollikPayload): void {
  const royxat = kutilmoqdaOqi(s).filter((x) => x.sessionId !== p.sessionId);
  royxat.push(p);
  yoz(s, KUTILMOQDA_KALIT, royxat.slice(-KUTILMOQDA_MAX));
}

export function kutilmoqdaOchir(s: Saqlagich, sessionId: string): void {
  yoz(
    s,
    KUTILMOQDA_KALIT,
    kutilmoqdaOqi(s).filter((x) => x.sessionId !== sessionId),
  );
}
```

- [ ] **Step 4: Yuborish moduli**

```ts
// client/src/components/student-portal/lib/activity-sender.ts
import Cookies from "js-cookie";
import type { FaollikPayload } from "./activity-tracker";

/**
 * Faollikni serverga yuboradi (dizayn 4.5). `fetch(..., { keepalive: true })` —
 * sahifa yopilayotganda ham so'rov yetib boradi; `sendBeacon` Authorization
 * header qo'ya olmaydi.
 *
 * `ok` — qabul qilindi. `rad` — qayta yuborishdan foyda yo'q (400 noto'g'ri tana,
 * 403 begona seans, 409 seans kuni o'tgan). `xato` — keyin qayta urinish
 * (401 token muddati o'tgan, tarmoq, server). Qiymatlar jami, shuning uchun
 * keyingi yuborish yo'qolganini o'zi yetkazadi.
 */
export type YuborishNatija = "ok" | "rad" | "xato";

export interface YuborishMuhiti {
  fetchFn: typeof fetch;
  token: string | undefined;
  base: string | undefined;
}

export function brauzerMuhiti(): YuborishMuhiti {
  return {
    fetchFn: fetch,
    token: Cookies.get("token"),
    base: process.env.NEXT_PUBLIC_API_URL,
  };
}

export function natijaFor(status: number): YuborishNatija {
  if (status >= 200 && status < 300) return "ok";
  if (status === 400 || status === 403 || status === 409) return "rad";
  return "xato";
}

export async function yubor(
  payload: FaollikPayload,
  muhit: YuborishMuhiti = brauzerMuhiti(),
): Promise<YuborishNatija> {
  if (!muhit.token || !muhit.base) return "xato";
  try {
    const res = await muhit.fetchFn(`${muhit.base}/student-portal/activity`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${muhit.token}`,
      },
      body: JSON.stringify(payload),
    });
    return natijaFor(res.status);
  } catch {
    return "xato";
  }
}
```

- [ ] **Step 5: O'tishini tekshirish**

Run: `npm test -- activity-storage activity-sender` → PASS. `npx eslint --fix` to'rt faylga, `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/components/student-portal/lib/activity-storage.ts src/components/student-portal/lib/activity-storage.test.ts src/components/student-portal/lib/activity-sender.ts src/components/student-portal/lib/activity-sender.test.ts
git commit -m "Faollik hisobi: localStorage qatlami va serverga yuborish

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Brauzer bilan bog'lash va portal qobig'iga ulash

**Files:**
- Create: `client/src/components/student-portal/lib/activity-runtime.ts`
- Create: `client/src/components/student-portal/activity/activity-host.tsx`
- Modify: `client/src/components/student-portal/student-portal-layout.tsx` (import + `<RadioHost />` dan keyin `<ActivityHost />`)

**Interfaces:**
- Consumes: Task 4 `anyMediaPlaying`, `radioOvozHolati`; Task 5 `boshlangichHolat`, `payloadFor`, `tick`, `yangiSeans`, `yuborishgaArziydi`, `TrackerHolati`; Task 6 storage va `yubor`; mavjud `seansIdYarat` (`client/src/components/student-portal/lernen/seans-navbat.ts`, uuid v4 va eski brauzer zaxirasi bilan).
- Produces: `faollikniBoshla(userId: number): () => void`; `ActivityHost` komponenti.

Bu task brauzer API'lariga (window, document, taymerlar) bog'liq; vitest `node` muhitida ishlaydi, shuning uchun unit test yozilmaydi — mantiq Task 5–6 da sinalgan, bu yerda faqat ulash. Haqiqiy brauzer tekshiruvi Task 9 da.

- [ ] **Step 1: Runtime**

```ts
// client/src/components/student-portal/lib/activity-runtime.ts
import { seansIdYarat } from "../lernen/seans-navbat";
import { anyMediaPlaying } from "./media-registry";
import { radioOvozHolati } from "./radio-store";
import {
  boshlangichHolat,
  payloadFor,
  tick,
  yangiSeans,
  yuborishgaArziydi,
  type TrackerHolati,
} from "./activity-tracker";
import {
  joriyniOchir,
  joriyniOqi,
  joriyniSaqla,
  kutilmoqdaOchir,
  kutilmoqdaOqi,
  kutilmoqdaQosh,
} from "./activity-storage";
import { yubor } from "./activity-sender";

/**
 * Faollik hisobini brauzerga ulaydi (dizayn 4.5): har 1 s o'lchaydi, har 15 s
 * `localStorage` ga, har 60 s va sahifa yashirinayotganda serverga yuboradi.
 * Qaytgan funksiya hammasini to'xtatadi va joriy seansni yopadi (chiqish yoki
 * qobiq yopilishi) — keyingi kirish yangi seans bilan boshlanadi.
 */
const TICK_MS = 1_000;
const SAQLASH_MS = 15_000;
const YUBORISH_MS = 60_000;
const HODISALAR = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;

export function faollikniBoshla(userId: number): () => void {
  const storage = window.localStorage;
  let lastInputAt = Date.now();

  const oldingi = joriyniOqi(storage, userId, Date.now());
  if (oldingi.yopilgan && yuborishgaArziydi(oldingi.yopilgan)) {
    kutilmoqdaQosh(storage, payloadFor(oldingi.yopilgan));
  }
  let holat: TrackerHolati = boshlangichHolat(
    oldingi.davom ?? yangiSeans(userId, Date.now(), seansIdYarat()),
    Date.now(),
  );
  joriyniSaqla(storage, holat.seans);

  let kutilganlarYuborilmoqda = false;
  const kutilganlarniYubor = async () => {
    if (kutilganlarYuborilmoqda) return;
    kutilganlarYuborilmoqda = true;
    try {
      for (const p of kutilmoqdaOqi(storage)) {
        if ((await yubor(p)) !== "xato") kutilmoqdaOchir(storage, p.sessionId);
      }
    } finally {
      kutilganlarYuborilmoqda = false;
    }
  };

  let joriyYuborilmoqda = false;
  const joriyniYubor = async () => {
    const seans = holat.seans;
    if (joriyYuborilmoqda || !yuborishgaArziydi(seans)) return;
    joriyYuborilmoqda = true;
    try {
      const natija = await yubor(payloadFor(seans));
      // Server seansni rad etdi (kuni o'tgan yoki begona) — yangi seans ochiladi.
      if (natija === "rad" && holat.seans.sessionId === seans.sessionId) {
        holat = boshlangichHolat(yangiSeans(userId, Date.now(), seansIdYarat()), Date.now());
        joriyniSaqla(storage, holat.seans);
      }
    } finally {
      joriyYuborilmoqda = false;
    }
  };

  const belgila = () => {
    lastInputAt = Date.now();
  };

  const tickTaymer = window.setInterval(() => {
    const natija = tick(
      holat,
      {
        now: Date.now(),
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        lastInputAt,
        mediaPlaying: anyMediaPlaying(),
        pathname: window.location.pathname,
        radio: radioOvozHolati(),
      },
      seansIdYarat,
    );
    holat = natija.holat;
    if (natija.yopilgan) {
      if (yuborishgaArziydi(natija.yopilgan)) {
        kutilmoqdaQosh(storage, payloadFor(natija.yopilgan));
        void kutilganlarniYubor();
      }
      joriyniSaqla(storage, holat.seans);
    }
  }, TICK_MS);

  const saqlashTaymer = window.setInterval(() => joriyniSaqla(storage, holat.seans), SAQLASH_MS);
  const yuborishTaymer = window.setInterval(() => void joriyniYubor(), YUBORISH_MS);

  const yashirinish = () => {
    if (document.visibilityState !== "hidden") return;
    joriyniSaqla(storage, holat.seans);
    void joriyniYubor();
  };
  const ketish = () => {
    joriyniSaqla(storage, holat.seans);
    if (yuborishgaArziydi(holat.seans)) void yubor(payloadFor(holat.seans));
  };

  for (const h of HODISALAR) {
    window.addEventListener(h, belgila, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", yashirinish);
  window.addEventListener("pagehide", ketish);
  void kutilganlarniYubor();

  return () => {
    window.clearInterval(tickTaymer);
    window.clearInterval(saqlashTaymer);
    window.clearInterval(yuborishTaymer);
    for (const h of HODISALAR) {
      window.removeEventListener(h, belgila, { capture: true });
    }
    document.removeEventListener("visibilitychange", yashirinish);
    window.removeEventListener("pagehide", ketish);
    if (yuborishgaArziydi(holat.seans)) kutilmoqdaQosh(storage, payloadFor(holat.seans));
    joriyniOchir(storage);
    void kutilganlarniYubor();
  };
}
```

- [ ] **Step 2: Komponent**

```tsx
// client/src/components/student-portal/activity/activity-host.tsx
"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { faollikniBoshla } from "../lib/activity-runtime";

/**
 * Qobiqdagi boshsiz komponent (dizayn 4.5) — `RadioHost` kabi portal qobig'ida
 * bir marta chiziladi, shuning uchun sahifalar orasida o'tganda hisob uzilmaydi.
 * Foydalanuvchi o'zgarsa yoki qobiq yopilsa, joriy seans yopiladi.
 */
export function ActivityHost() {
  const userId = useAuth((s) => s.user?.id ?? null);

  useEffect(() => {
    if (userId === null) return;
    return faollikniBoshla(userId);
  }, [userId]);

  return null;
}
```

`student-portal-layout.tsx`: importlar orasiga `import { ActivityHost } from "./activity/activity-host";` va `<RadioHost />` qatoridan keyin `<ActivityHost />`. Qobiq faqat o'quvchi (rol 6) uchun shu yergacha yetadi — alohida rol tekshiruvi kerak emas.

- [ ] **Step 3: Tekshirish**

Run (client): `npx eslint --fix` uch faylga; `npm test`, `npm run typecheck`, `npx eslint src` (0 error), `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/components/student-portal/lib/activity-runtime.ts src/components/student-portal/activity/activity-host.tsx src/components/student-portal/student-portal-layout.tsx
git commit -m "Portal qobig'ida faollik hisobi: har soniya o'lchash, 15 s saqlash, 60 s yuborish

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Hujjatlar

**Files:**
- Create: `docs/adr/0020-ilova-faolligi-klientda-olchanadi.md`
- Modify: `docs/adr/README.md` (0019 qatoridan keyin)
- Modify: `client/CLAUDE.md` (`#### Radio (/portal/radio)` bo'limidan OLDIN yangi bo'lim)
- Modify: `docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md` (`**Holati:**` qatori)

- [ ] **Step 1: ADR**

```markdown
# 0020. Ilova faolligi klientda o'lchanadi, server jami qiymatni qirqadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-13
**Bog'liq:** [0019](0019-mashq-natijasi-umumiy-shartnoma.md),
[dizayn hujjati](../superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md) (3 va 4-bo'limlar)

## Kontekst

Markaz o'quvchi ilovada qancha vaqt o'tkazganini — veb, Android yoki iOS dan
kirishidan qat'iy nazar — bilishi kerak. Server faqat so'rovlarni ko'radi: o'quvchi
darsni o'qiyotganda yoki tinglayotganda deyarli so'rov yubormaydi, shuning uchun
server loglaridan chiqarilgan vaqt haqiqatdan bir necha barobar kam bo'lardi.
Tashqi analitika (PostHog, Firebase) ma'lumotni bazadan tashqariga olib chiqadi va
uni guruh, filial va profilga bog'lab bo'lmaydi.

## Qaror

1. **Faol vaqtni klient o'lchaydi, bitta qoida bilan:** ekran ko'rinib turibdi, oyna
   fokusda va oxirgi 2 daqiqada teginish/bosish/klaviatura/aylantirish bo'lgan yoki
   ta'lim audiosi o'ynayapti. Radio vaqti alohida — pleyer pozitsiyasi o'sishidan,
   ekran yopiq bo'lsa ham sanaladi va faol vaqtga qo'shilmaydi.
2. **Klient seans uuid'i bilan JAMI qiymat yuboradi** (`POST /student-portal/activity`),
   delta emas. Server har maydonda `max` oladi — takroriy so'rov vaqtni ko'paytirmaydi.
3. **Server qirqadi va tekshiradi:** qiymat `firstSeenAt` dan o'tgan vaqt + 120 s dan
   oshmaydi; begona seans — 403; seansning Toshkent kuni bugun emas — 409; qator
   yangilashda `FOR UPDATE` bilan qulflanadi; filial birinchi yozuvda muhrlanadi.
4. **Bitta seans — bitta qator** (`StudentAppSession`), vaqt «ta'lim / boshqa»
   bo'limlariga ajratiladi.

## Oqibatlar

- Hisob faqat deploy kunidan boshlanadi; o'tmishni tiklab bo'lmaydi.
- Token muddati o'tsa, yuborish keyingi token yangilanishigacha kechikadi — qiymat
  jami bo'lgani uchun yo'qolmaydi. Brauzer butunlay yopilsa, oxirgi saqlashdan keyingi
  ≤ 15 s yo'qolishi mumkin; yarim tunda yopilgan seansning oxirgi ≤ 60 s i 409 bilan
  rad etilishi mumkin.
- **Yangi ta'lim audio pleyeri `registerMedia` qilishi SHART**, aks holda o'quvchi
  audio tinglab turganda «faol emas» deb sanaladi.
- Native ilova (Android/iOS) aynan shu qoida va shu endpoint bilan o'lchashi kerak va
  bu birinchi do'kon relizidan oldin tayyor bo'lishi kerak (dizayn 8-bo'lim).
```

`docs/adr/README.md` jadvaliga (0019 qatoridan keyin, mavjud qatorlar formatida):

```markdown
| [0020](0020-ilova-faolligi-klientda-olchanadi.md) | Ilova faolligi klientda o'lchanadi, server jami qiymatni qirqadi | Qabul qilindi | 2026-09-13 |
```

- [ ] **Step 2: `client/CLAUDE.md`** — `#### Radio (`/portal/radio`)` sarlavhasidan oldin (ingliz tilida, fayl qoidasi bo'yicha):

```markdown
#### Activity tracking (whole `/portal/*` shell)

Time spent in the app is measured on the client and sent to `POST /student-portal/activity` (ADR-0020). Do not try to derive it from API traffic.

- `ActivityHost` (`activity/activity-host.tsx`) is rendered once in `student-portal-layout.tsx`, next to `RadioHost`, so navigation never interrupts it.
- The rule lives in the pure module `lib/activity-tracker.ts` (unit-tested): active = page visible AND window focused AND (input within 2 min OR lesson audio playing). Radio time is measured from the player's `currentTime` advance and is never counted as active time.
- Browser wiring is `lib/activity-runtime.ts`: 1 s tick, `localStorage` every 15 s (`daf.faollik.joriy`, `daf.faollik.kutilmoqda`), send every 60 s and on `visibilitychange → hidden` / `pagehide`, via `fetch(..., { keepalive: true })`.
- **Any new lesson audio player MUST call `registerMedia(el)` from `lib/media-registry.ts`** (and unregister on unmount), otherwise a student listening without touching the screen is counted as idle. The radio element is deliberately NOT registered.
- Values sent are running totals for the session, never deltas — the server takes `max` and clamps by wall-clock time.
```

- [ ] **Step 3: Spec holati** — `**Holati:**` qatorini: `dizayn CEO tomonidan tasdiqlangan (13.09.2026); 1-bosqich (mashq yozuvi) PRODDA (PR #485); 2-bosqich (vaqt hisobi, veb) kodda, deploy qilinmagan; 3–4 bosqichlar amalga oshirilmagan`.

- [ ] **Step 4: Yakuniy tekshiruv**

Server: `npm test && npm run typecheck && npx eslint src && npm run build`. Klient: `npm test && npm run typecheck && npx eslint src && npm run build`. Hammasi xatosiz bo'lsagina commit.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0020-ilova-faolligi-klientda-olchanadi.md docs/adr/README.md client/CLAUDE.md docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md
git commit -m "ADR-0020: ilova faolligi klientda o'lchanadi; portal qo'llanmasi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Haqiqiy brauzerda tekshirish (kod yozilmaydi)

Controller tomonidan alohida tekshiruv subagenti bilan bajariladi.

- Worktree'dan backend `PORT=4300 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN="" TELEGRAM_ADMIN_BOT_TOKEN=""` bilan, klient `NEXT_PUBLIC_API_URL=http://localhost:4300/api` bilan `:3000` da (CORS faqat `:3000` va `*.localhost:3000`).
- Playwright (`channel: "chrome"`), `student.localhost:3000`, seed o'quvchi `906549532` / `123456`.
- Ssenariy: `/portal` da 90 s sichqoncha harakati → `/portal/lernen` da 60 s → tabni 30 s yashirish (sanalmasligi kerak) → radio 90 s (mute holatida 30 s — sanalmasligi kerak) → sahifani yangilash (seans davom etishi kerak).
- Dev bazada `StudentAppSession` qatorini tekshirish: `activeSeconds` ≈ 150 (±20), `sections.LERNEN` ≈ 60, `radioSeconds` ≈ 90 (±15), bitta `sessionId`, `platform = WEB`, `branchId` to'ldirilgan.

---

## Deploy eslatmasi (reja tashqarisida, CEO ruxsati bilan)

1. Prod: `railway run -- npx prisma migrate status` — faqat `20260913200000_student_app_session` kutilayotganini tasdiqlash → `railway run -- npx prisma migrate deploy`.
2. Backend: `railway up server --path-as-root --detach` (worktree'ga `server/railway.json` nusxasi va `railway link` bilan), SUCCESS va `POST /api/student-portal/activity` → 401 (404 emas) ekanini tekshirish.
3. Klient: `cd client && vercel --prod --yes` (worktree'ga `client/.vercel` nusxasi bilan).
4. Shundan keyin PR merge. Klient serverdan OLDIN chiqsa, yuborishlar 404 oladi va har daqiqada behuda qayta urinadi (o'quvchiga zarar yo'q, lekin tartibni buzmang).
5. Prod: birinchi haqiqiy seanslardan keyin `StudentAppSession` qatorlarini o'qib tekshirish.
