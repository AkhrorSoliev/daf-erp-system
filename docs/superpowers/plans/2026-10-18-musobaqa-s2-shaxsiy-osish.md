# Musobaqa S2 — shaxsiy o'sish (kunlik maqsad, nishonlar): implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi o'zi tanlagan kunlik maqsadni (40 / 80 / 160 ball) yo'l tepasidagi halqada ko'radi, seans oxirida «maqsad bajarildi» va yangi nishonlarni oladi, «Darajam» tabida hamma nishonlarni ko'radi; mavjud o'quvchilarga nishonlar bir martalik skript bilan beriladi.

**Architecture:** Ikki yangi jadval: `DafStudentSetting` (asl tanlov, o'quvchiga bitta qator) va `DafStudentBadge` (olingan nishon kaliti, qaytarib olinmaydi). Bugungi ball va maqsad darajasi `oquvchiRaqamlari` ning MAVJUD bitta SQL so'roviga qo'shiladi (yangi so'rov yo'q). Nishonlarni faqat `grantBadges` yozadi (`INSERT … ON CONFLICT DO NOTHING RETURNING key`, qorovul test bilan), faqat seans oxirida, `seansNatijasi` ichida, o'z xavfsiz o'rami bilan. Katalog va maqsad ballari kodda.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), jest (server), Next.js + vitest (client), ts-node skriptlar.

**Spec:** [`docs/superpowers/specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md`](../specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md)

## Global Constraints

- Maqsad ballari: `YENGIL` = 40, `ORTA` = 80, `JIDDIY` = 160 — kodda (`server/src/daf/uebung/punkte.ts`, `MAQSAD_BALL`), bazada emas. Tanlov yo'q = `ORTA`; hech narsa so'ralmaydi.
- Bugungi ball = `DafStudentDay` dagi bugungi Toshkent kuni qatorlari (hamma `groupKey`) `points` yig'indisi. Kun — `kunlikKalit`/`tashkentDateStr` (S1 bilan bir xil).
- `bosh` = muddati kelgan so'z yo'q (`faelligeWoerter == 0`) **va** ochiq, tugatilmagan dars yo'q; `bosh` da maqsad «bajarildi», `yangiBajarildi` esa yolg'on.
- Nishon katalogi: `SERIE_3, SERIE_7, SERIE_14, SERIE_30, SERIE_60, SERIE_100` (joriy seriya ≥ N), `WOERTER_50, WOERTER_150, WOERTER_300, WOERTER_592` (`DafLexemeState.correctCount ≥ 1` qatorlar soni ≥ N). Nishon bir marta beriladi va **hech qachon olib qo'yilmaydi**.
- `DafStudentBadge` ni faqat `grantBadges` yozadi (`daf/nishon/nishon-berish.ts`); `nishon-berish.single-source.spec.ts` boshqa yozuvni yiqitadi.
- Nishon faqat seans oxirida, `seansNatijasi` ichida beriladi. **`GET` hech narsa yozmaydi.** Nishon berishdagi xato `natija` ni `null` qilmaydi (`yangiNishonlar: []`).
- `fortschritt` da qo'shimcha so'rov yo'q (round trip qo'shilmaydi); «ochiq dars bor» faqat `faelligeWoerter == 0` bo'lganda o'qiladi.
- Yuklama chegarasi o'zgarmaydi: p95 < 200 ms (`fortschritt`, ikki reyting, `recordAttempt`, yangi `nishonlar`), `seansNatijasi` p95 < 300 ms — 5 000 o'quvchi, 50 parallel.
- Raw SQL faqat tagged `$queryRaw` / `$executeRaw` (yoki `Prisma.sql`); `*Unsafe` taqiqlangan.
- Ekrandagi matn — faqat lotin o'zbekcha, inglizcha (yoki «Serie/Streak» kabi chet) so'z yo'q. Nemischa faqat daraja nomlarida.
- Kommit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Server fayllari: `npx prettier --write` → `npx eslint --quiet` → `npx jest <yo'l>`. **Client fayllariga prettier ISHLATILMAYDI.**
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2`. Hamma buyruq shu ildizdan (yoki `server/`, `client/` ichidan). Asosiy katalogda commit qilinmaydi.
- `server/src/daf/fortschritt/fortschritt.service.ts` allaqachon 579 qator (500 dan oshgan): unga faqat zarur ulanishlar qo'shiladi, yangi mantiq alohida fayllarda (`maqsad.ts`, `nishon/*`).

## Fayl xaritasi

| Fayl | Nima | Vazifa |
| --- | --- | --- |
| `server/prisma/schema.prisma` | `DafDailyGoal` enum, `DafStudentSetting`, `DafStudentBadge`, `Student` relatsiyalari | 1 |
| `server/prisma/migrations/20261018220000_daf_goal_and_badges/migration.sql` | enum + ikki jadval | 1 |
| `server/src/daf/daf-schema.spec.ts` | sxema qorovuli | 1 |
| `server/src/daf/uebung/punkte.ts` (+spec) | `MAQSAD_BALL`, `maqsadDarajasi`, `maqsadHolati`, `yangiBajarildi` | 2 |
| `server/src/daf/nishon/nishon-katalogi.ts` (+spec) | katalog, `shartBajarilganlar`, `qoldi` | 2 |
| `server/src/daf/nishon/nishon-berish.ts` (+spec) | `grantBadges`, `woerterSoni`, `nishonlarniBerXavfsiz` | 3 |
| `server/src/daf/nishon/nishon-berish.single-source.spec.ts` | «faqat bitta yozuvchi» qorovuli | 3 |
| `server/src/daf/daf-portal-read.service.ts` | `TAYYOR_SOZ` eksport | 4 |
| `server/src/daf/fortschritt/maqsad.ts` (+spec) | `bugunBoshmi`, `maqsadniSaqla` | 4, 6 |
| `server/src/daf/fortschritt/fortschritt.service.ts` | `uebersicht.maqsad`, SQL, `seansNatijasi.maqsad/yangiNishonlar`, ikki ulanish metod | 4, 5, 6 |
| `server/src/daf/fortschritt/zentrum-sql.fake-spec.ts` | soxta SQL: `heutePunkte`, `dailyGoal` | 4 |
| `server/src/daf/fortschritt/fortschritt.service.spec.ts`, `fortschritt.parity.spec.ts`, `seans-natija.spec.ts` | testlar | 4, 5 |
| `server/src/daf/nishon/nishonlar.ts` (+spec) | `nishonlarRoyxati` (GET) | 6 |
| `server/src/daf/dto/maqsad.dto.ts` (+spec) | `MaqsadDto` | 6 |
| `server/src/daf/daf-portal.controller.ts` (+spec) | `PATCH maqsad`, `GET nishonlar` | 6 |
| `server/src/daf/daf-portal.student-card.e2e.spec.ts` | `patch` qo'llovi | 6 |
| `server/src/common/auth/branch-route-policy.ts` | SELF bloki | 6 |
| `server/src/common/permissions/route-access.snapshot.json` | ikki qator | 6 |
| `server/scripts/lib/daf-badges-backfill-plan.ts` (+spec) | sof rejalovchi | 7 |
| `server/scripts/daf-badges-backfill.ts` | bir martalik berish (dry run / `--apply --expect`) | 7 |
| `client/src/components/student-portal/lernen/types.ts` | `Maqsad`, `NishonQatori`, `SeansNatijasi` kengayishi | 8 |
| `client/.../lernen/queries.ts` | `useMaqsadOzgartir`, `useNishonlar`, invalidatsiya | 8 |
| `client/.../lernen/maqsad.ts` (+test) | `MAQSAD_VARIANTLARI`, `maqsadKartasi` | 8 |
| `client/.../lernen/nishon.ts` (+test) | `nishonNomi`, `nishonQoldi` | 8 |
| `client/.../lernen/uebung/natija-xabari.ts` (+test) | `maqsad`, `nishonlar` qatorlari | 8 |
| `client/.../lernen/yol/maqsad-kartasi.tsx` (+test) | halqa + oynacha | 9 |
| `client/.../lernen/yol/yol-tepasi.tsx` | karta joylashuvi | 9 |
| `client/.../lernen/uebung/natija-ekrani.tsx` | ikki qator | 9 |
| `client/.../lernen/reyting/nishonlarim.tsx` (+test) | «Nishonlarim» bo'limi | 9 |
| `client/.../lernen/reyting/reyting-ekrani.tsx` | «Darajam» ichiga bo'lim | 9 |
| `server/scripts/load/daf-yuklama-olchov.ts` | `nishonlar` o'lchovi, nishon parallel sinovi, sozlama qatorlari | 10 |
| `docs/superpowers/specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md` | §8 yuklama natijalari | 10 |
| `docs/adr/0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md`, `docs/adr/README.md` | ADR | 11 |
| `server/CLAUDE.md` | DaF bo'limi bandlari | 11 |
| `client/src/qollanma/yangiliklar.ts` | xodimlar uchun bitta yangilik | 11 |

**Qo'llanma qarori (spec §6).** `client/src/qollanma/` — xodimlar qo'llanmasi (`RolId = 1 | 2 | 3 | 4 | 5`), o'quvchi qo'llanmasi yo'q; «DaF ilovasi» bo'limi (`bolimlar.ts`) da sahifa ham yo'q. Shuning uchun qo'llanma sahifasi vazifasi YO'Q; xodimlar bilsin deb Task 11 da `yangiliklar.ts` ga bitta yozuv (sahifasiz) qo'shiladi.

---

### Task 0: Worktree tayyorlash

**Files:** yo'q (muhit).

- [ ] **Step 1: Paketlarni o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npm install
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/client && npm install
```

- [ ] **Step 2: Prisma klienti va boshlang'ich holat**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prisma generate && npx jest src/daf src/common/permissions src/common/auth
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/client && npx vitest run src/components/student-portal
```

Expected: hammasi PASS. Yiqilsa — ishni boshlamasdan sababini yozib, to'xtash.

- [ ] **Step 3: Commit** — bu vazifada o'zgarish yo'q. `git status --short` bo'sh bo'lishi kerak (yo'q bo'lsa — nimaligini tekshirib, bu vazifaga tegishli bo'lmasa to'xtash).

---

### Task 1: Sxema va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Student` ichida `dafStudentDays    DafStudentDay[]` qatoridan keyin; `model DafStudentDay { … }` blokidan keyin yangi modellar)
- Create: `server/prisma/migrations/20261018220000_daf_goal_and_badges/migration.sql`
- Modify: `server/src/daf/daf-schema.spec.ts`

**Interfaces:**
- Produces: Prisma enum `DafDailyGoal` (`YENGIL | ORTA | JIDDIY`, `@prisma/client` dan eksport); modellar `dafStudentSetting` (`studentId` @id, `companyId`, `dailyGoal` default `ORTA`, `updatedAt`) va `dafStudentBadge` (`id`, `studentId`, `companyId`, `key`, `earnedAt` default now; unique `studentId_key`). Jadval nomlari SQL'da: `"DafStudentSetting"`, `"DafStudentBadge"`.

- [ ] **Step 1: Yiqiladigan sxema testi** — `daf-schema.spec.ts` boshidagi importlar:

```ts
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DafDailyGoal, Prisma } from '@prisma/client';
```

va `describe('Daf sxemasi'` blokining oxiriga (`DafStudentDay is derived…` testidan keyin, blokni yopuvchi `});` dan oldin):

```ts
  // S2 (ADR-0115). The goal is the student's CHOICE — it cannot be rebuilt
  // from attempts, so it is stored; one row per student. A badge is earned
  // once and never taken back: one row per (student, key), and no column
  // that could revoke it.
  it('DafStudentSetting is one row per student, DafStudentBadge one per key', () => {
    const schema = readFileSync(
      join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const body = (name: string) => {
      const start = schema.indexOf(`model ${name} {`);
      expect(start).toBeGreaterThan(-1);
      const block = schema.slice(start);
      return block.slice(0, block.indexOf('\n}'));
    };
    expect(body('DafStudentSetting')).toMatch(/studentId\s+Int\s+@id/);
    expect(body('DafStudentSetting')).toMatch(
      /dailyGoal\s+DafDailyGoal\s+@default\(ORTA\)/,
    );
    expect(body('DafStudentBadge')).toMatch(/@@unique\(\[studentId, key\]\)/);
    expect(fieldsOf('DafStudentBadge')).not.toContain('revokedAt');
    expect(DafDailyGoal).toEqual({
      YENGIL: 'YENGIL',
      ORTA: 'ORTA',
      JIDDIY: 'JIDDIY',
    });
  });
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts -t DafStudentSetting`
Expected: FAIL (`expect(start).toBeGreaterThan(-1)` — model yo'q).

- [ ] **Step 3: Sxemaga qo'shish** — `model Student` ichida:

```prisma
  dafStudentDays    DafStudentDay[]
```

qatorini quyidagiga almashtirish:

```prisma
  dafStudentDays    DafStudentDay[]
  dafSetting        DafStudentSetting?
  dafBadges         DafStudentBadge[]
```

`model DafStudentDay { … }` blokidan (u `@@index([groupKey, day])` va `}` bilan tugaydi) keyin:

```prisma
/// Kunlik maqsad darajasi. Ballari kodda (`src/daf/uebung/punkte.ts`,
/// `MAQSAD_BALL`), shuning uchun ularni o'zgartirish deploy bilan.
enum DafDailyGoal {
  YENGIL
  ORTA
  JIDDIY
}

/// The student's own choice — NOT derived, cannot be rebuilt (ADR-0115).
/// No row = ORTA. Written by `PATCH student-portal/lernen/maqsad` (upsert).
model DafStudentSetting {
  studentId Int          @id
  companyId Int
  dailyGoal DafDailyGoal @default(ORTA)
  updatedAt DateTime     @updatedAt

  student Student @relation(fields: [studentId], references: [id])
}

/// A badge the student earned: given once, NEVER taken back (ADR-0115).
/// Only the catalogue key is stored (`src/daf/nishon/nishon-katalogi.ts`).
/// One writer: `grantBadges` (`src/daf/nishon/nishon-berish.ts`).
model DafStudentBadge {
  id        Int      @id @default(autoincrement())
  studentId Int
  companyId Int
  key       String
  earnedAt  DateTime @default(now())

  student Student @relation(fields: [studentId], references: [id])

  @@unique([studentId, key])
}
```

(Spec'dagi `@@index([studentId])` qo'yilmaydi: `@@unique([studentId, key])` indeksining birinchi ustuni `studentId`, u shu so'rovlarga xizmat qiladi — ikkinchi indeks yozuvni sekinlashtiradi, foyda bermaydi.)

- [ ] **Step 4: Migratsiya** — `server/prisma/migrations/20261018220000_daf_goal_and_badges/migration.sql`:

```sql
-- S2: the student's daily goal (a choice) and earned badges (ADR-0115).
CREATE TYPE "DafDailyGoal" AS ENUM ('YENGIL', 'ORTA', 'JIDDIY');

CREATE TABLE "DafStudentSetting" (
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "dailyGoal" "DafDailyGoal" NOT NULL DEFAULT 'ORTA',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafStudentSetting_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE "DafStudentBadge" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DafStudentBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafStudentBadge_studentId_key_key" ON "DafStudentBadge"("studentId", "key");

ALTER TABLE "DafStudentSetting" ADD CONSTRAINT "DafStudentSetting_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafStudentBadge" ADD CONSTRAINT "DafStudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Klientni yaratish**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 6: Lokal sinov bazasida migratsiyani tekshirish.** Baza nomi `daf_s1_yuklama` (yuklama qorovuli `scripts/load/local-db-guard.ts` faqat shu nomni qabul qiladi; Task 10 ham shu bazani ishlatadi). Parolni ekranga chiqarmay URL yig'ish:

```bash
export S1_DB="postgresql://daf_user:$(docker exec daf-postgres printenv POSTGRES_PASSWORD)@127.0.0.1:5433/daf_s1_yuklama"
docker exec daf-postgres psql -U daf_user -lqt | cut -d '|' -f1 | grep -qw daf_s1_yuklama && echo bor || docker exec daf-postgres createdb -U daf_user daf_s1_yuklama
cd server && DATABASE_URL="$S1_DB" node node_modules/prisma/build/index.js migrate deploy
```

Baza yangi bo'lsa deploy ikki marta to'xtaydi (xotira `reference_throwaway_local_db`): `20260805120000_branch_tenancy_leads_holidays_mock` oldidan `INSERT INTO "Company"(id, name, ...)` (id 1001), `20260806120000_drop_company_defaults_and_branch_sequence` oldidan `INSERT INTO "Branch"(id, "companyId", ...)` (id 1, companyId 1001); har biridan keyin `migrate resolve --rolled-back <nom>` va deploy qayta. Expected oxirida: `20261018220000_daf_goal_and_badges` qo'llandi. Keyin:

```bash
cd server && DATABASE_URL="$S1_DB" npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
```

Expected: faqat `DROP INDEX "DafStudentDay_companyId_day_cover_idx";` (ADR-0114 dagi kutilgan farq — qo'lda yozilgan qamrab oluvchi indeks). `DafStudentSetting`, `DafStudentBadge` yoki `DafDailyGoal` haqida HECH NARSA yo'q — qo'lda yozilgan SQL sxemaga aynan mos.

- [ ] **Step 7: Sxema testi**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2 && npx --prefix server prettier --write server/src/daf/daf-schema.spec.ts && git add server/prisma/schema.prisma server/prisma/migrations/20261018220000_daf_goal_and_badges server/src/daf/daf-schema.spec.ts && git commit -m "feat(daf): DafStudentSetting and DafStudentBadge tables

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sof mantiq — maqsad va nishon katalogi

**Files:**
- Modify: `server/src/daf/uebung/punkte.ts`, `server/src/daf/uebung/punkte.spec.ts`
- Create: `server/src/daf/nishon/nishon-katalogi.ts`, `server/src/daf/nishon/nishon-katalogi.spec.ts`

**Interfaces:**
- Consumes: `DafDailyGoal` (Task 1).
- Produces (`punkte.ts`):
  - `MAQSAD_BALL: Record<DafDailyGoal, number>`
  - `maqsadDarajasi(raw: string | null | undefined): DafDailyGoal`
  - `interface MaqsadHolati { daraja: DafDailyGoal; ball: number; hozir: number; bajarildi: boolean; bosh: boolean }`
  - `maqsadHolati(daraja: DafDailyGoal, hozir: number, bosh: boolean): MaqsadHolati`
  - `yangiBajarildi(ball: number, hozir: number, seansBugun: number, bosh: boolean): boolean`
- Produces (`nishon-katalogi.ts`):
  - `type NishonTuri = 'SERIE' | 'WOERTER'`
  - `interface Nishon { key: string; tur: NishonTuri; chegara: number }`
  - `NISHON_KATALOGI: readonly Nishon[]`
  - `interface NishonSharoiti { serie: number; woerter: number }`
  - `shartBajarilganlar(s: NishonSharoiti): string[]` (katalog tartibida)
  - `qoldi(n: Nishon, s: NishonSharoiti): number`

- [ ] **Step 1: Yiqiladigan testlar (maqsad)** — `punkte.spec.ts` import blokini:

```ts
import {
  MAQSAD_BALL,
  PUNKTE_PRO_WORT,
  maqsadDarajasi,
  maqsadHolati,
  punkteFuer,
  serieAus,
  stufeFuer,
  wochenStartTag,
  wochenStartUtc,
  yangiBajarildi,
} from './punkte';
```

ga almashtirish va fayl oxiriga:

```ts
describe('kunlik maqsad', () => {
  it('uch daraja: 40 / 80 / 160', () => {
    expect(MAQSAD_BALL).toEqual({ YENGIL: 40, ORTA: 80, JIDDIY: 160 });
  });

  it("tanlov yo'q yoki noma'lum qiymat — O'RTA", () => {
    expect(maqsadDarajasi(null)).toBe('ORTA');
    expect(maqsadDarajasi(undefined)).toBe('ORTA');
    expect(maqsadDarajasi('KATTA')).toBe('ORTA');
    expect(maqsadDarajasi('JIDDIY')).toBe('JIDDIY');
  });

  it('aynan maqsadga teng ball — bajarildi; bir ball kam — yo`q', () => {
    expect(maqsadHolati('ORTA', 80, false)).toEqual({
      daraja: 'ORTA',
      ball: 80,
      hozir: 80,
      bajarildi: true,
      bosh: false,
    });
    expect(maqsadHolati('ORTA', 79, false).bajarildi).toBe(false);
  });

  it('bosh + 0 ball — bajarildi (ball topib bo`lmaydi, ayb emas)', () => {
    expect(maqsadHolati('JIDDIY', 0, true)).toMatchObject({
      bajarildi: true,
      bosh: true,
      hozir: 0,
    });
  });
});

describe('yangiBajarildi', () => {
  it('seans maqsadni kesib o`tdi', () => {
    // Oldin 50, seans +40 → 90; maqsad 80.
    expect(yangiBajarildi(80, 90, 40, false)).toBe(true);
  });

  it('aynan maqsadga yetdi — yangi', () => {
    expect(yangiBajarildi(80, 80, 30, false)).toBe(true);
  });

  it('seansdan oldin ham bajarilgan edi — yangi emas', () => {
    expect(yangiBajarildi(80, 120, 40, false)).toBe(false);
    expect(yangiBajarildi(80, 110, 30, false)).toBe(false);
  });

  it('hali yetmadi — yangi emas', () => {
    expect(yangiBajarildi(80, 70, 70, false)).toBe(false);
  });

  it('bir seansda bir necha chegara kesilsa ham faqat tanlangan maqsad hisoblanadi', () => {
    // 30 → 170: 40, 80 va 160 dan o'tdi; maqsad 80 — bitta «yangi».
    expect(yangiBajarildi(80, 170, 140, false)).toBe(true);
    expect(yangiBajarildi(160, 170, 140, false)).toBe(true);
  });

  it('bosh holatda yutuq ko`rsatilmaydi', () => {
    expect(yangiBajarildi(80, 90, 40, true)).toBe(false);
  });

  it('0 balli seans hech narsani kesmaydi', () => {
    expect(yangiBajarildi(40, 40, 0, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/uebung/punkte.spec.ts`
Expected: FAIL (`MAQSAD_BALL` / `maqsadHolati` eksport qilinmagan — TS xatosi yoki `undefined`).

- [ ] **Step 3: `punkte.ts` ga yozish** — fayl tepasidagi importdan keyin:

```ts
import type { DafDailyGoal } from '@prisma/client';
```

va fayl oxiriga:

```ts
/**
 * Kunlik maqsad — o'quvchi o'zi tanlaydi (CEO, 2026-10-18). Bir seans ≈
 * 70–90 ball: Yengil ≈ yarim seans, O'rta ≈ bir seans, Jiddiy ≈ ikki seans.
 * Qiymatlar shu yerda, bazada faqat kalit — o'zgartirish deploy bilan.
 * Mijoz oynachasi shu raqamlarni ko'rsatadi; `client/.../lernen/maqsad.test.ts`
 * ularni shu fayldan o'qib solishtiradi.
 */
export const MAQSAD_BALL: Record<DafDailyGoal, number> = {
  YENGIL: 40,
  ORTA: 80,
  JIDDIY: 160,
};

/** Bazadagi tanlov (yoki uning yo'qligi) — tanlov yo'q bo'lsa O'RTA. */
export function maqsadDarajasi(raw: string | null | undefined): DafDailyGoal {
  return raw != null && raw in MAQSAD_BALL ? (raw as DafDailyGoal) : 'ORTA';
}

export interface MaqsadHolati {
  daraja: DafDailyGoal;
  /** Maqsad (kunlik ball). */
  ball: number;
  /** Bugungi ball. */
  hozir: number;
  bajarildi: boolean;
  /** Bugun qiladigan mashq qolmagan — ball topib bo'lmaydi (spec 1.1). */
  bosh: boolean;
}

/**
 * Jazo yo'q: `bosh` holatda maqsad «bajarildi» — ball topish mumkin
 * bo'lmagan o'quvchi ayb bo'lmagan narsa uchun yutqazmaydi.
 */
export function maqsadHolati(
  daraja: DafDailyGoal,
  hozir: number,
  bosh: boolean,
): MaqsadHolati {
  const ball = MAQSAD_BALL[daraja];
  return { daraja, ball, hozir, bajarildi: bosh || hozir >= ball, bosh };
}

/**
 * Shu seans maqsadni kesib o'tdimi: seansdan oldin bajarilmagan, endi
 * bajarilgan. `seansBugun` — seans ballining BUGUNGI qismi (yarim tundan
 * oldingisi kechaga tegishli). `bosh` da yutuq ko'rsatilmaydi.
 */
export function yangiBajarildi(
  ball: number,
  hozir: number,
  seansBugun: number,
  bosh: boolean,
): boolean {
  return !bosh && hozir - seansBugun < ball && ball <= hozir;
}
```

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/uebung/punkte.spec.ts`
Expected: PASS.

- [ ] **Step 5: Yiqiladigan katalog testi** — `server/src/daf/nishon/nishon-katalogi.spec.ts`:

```ts
import {
  NISHON_KATALOGI,
  qoldi,
  shartBajarilganlar,
} from './nishon-katalogi';

describe('nishon katalogi', () => {
  it('spec 2.1 dagi o`n kalit, shu tartibda', () => {
    expect(NISHON_KATALOGI.map((n) => n.key)).toEqual([
      'SERIE_3',
      'SERIE_7',
      'SERIE_14',
      'SERIE_30',
      'SERIE_60',
      'SERIE_100',
      'WOERTER_50',
      'WOERTER_150',
      'WOERTER_300',
      'WOERTER_592',
    ]);
  });

  // Mijoz nomni kalitdan quradi («14 kun ketma-ket»), shuning uchun kalit
  // tur va chegarani aynan aytishi shart.
  it('kalit = TUR_CHEGARA va takrorlanmaydi', () => {
    for (const n of NISHON_KATALOGI) expect(n.key).toBe(`${n.tur}_${n.chegara}`);
    expect(new Set(NISHON_KATALOGI.map((n) => n.key)).size).toBe(
      NISHON_KATALOGI.length,
    );
  });

  it('aynan N — shart bajarilgan; N−1 — yo`q', () => {
    expect(shartBajarilganlar({ serie: 7, woerter: 0 })).toEqual([
      'SERIE_3',
      'SERIE_7',
    ]);
    expect(shartBajarilganlar({ serie: 6, woerter: 49 })).toEqual(['SERIE_3']);
    expect(shartBajarilganlar({ serie: 0, woerter: 592 })).toEqual([
      'WOERTER_50',
      'WOERTER_150',
      'WOERTER_300',
      'WOERTER_592',
    ]);
    expect(shartBajarilganlar({ serie: 2, woerter: 49 })).toEqual([]);
  });

  it('qoldi — chegaragacha, hech qachon manfiy emas', () => {
    const serie14 = NISHON_KATALOGI.find((n) => n.key === 'SERIE_14')!;
    const soz150 = NISHON_KATALOGI.find((n) => n.key === 'WOERTER_150')!;
    expect(qoldi(serie14, { serie: 10, woerter: 0 })).toBe(4);
    expect(qoldi(soz150, { serie: 0, woerter: 120 })).toBe(30);
    expect(qoldi(serie14, { serie: 20, woerter: 0 })).toBe(0);
  });
});
```

Run: `cd server && npx jest src/daf/nishon/nishon-katalogi.spec.ts` → FAIL (`Cannot find module './nishon-katalogi'`).

- [ ] **Step 6: Katalogni yozish** — `server/src/daf/nishon/nishon-katalogi.ts`:

```ts
/**
 * Nishonlar katalogi — BITTA joyda (spec S2 2.1). Jadvalda faqat olingan
 * nishon kaliti saqlanadi, shuning uchun yangi tur (S3 musobaqa nishonlari)
 * migratsiyasiz qo'shiladi. Nom serverda yo'q: mijoz kalitdan quradi.
 */
export type NishonTuri = 'SERIE' | 'WOERTER';

export interface Nishon {
  key: string;
  tur: NishonTuri;
  chegara: number;
}

export const NISHON_KATALOGI: readonly Nishon[] = [
  { key: 'SERIE_3', tur: 'SERIE', chegara: 3 },
  { key: 'SERIE_7', tur: 'SERIE', chegara: 7 },
  { key: 'SERIE_14', tur: 'SERIE', chegara: 14 },
  { key: 'SERIE_30', tur: 'SERIE', chegara: 30 },
  { key: 'SERIE_60', tur: 'SERIE', chegara: 60 },
  { key: 'SERIE_100', tur: 'SERIE', chegara: 100 },
  { key: 'WOERTER_50', tur: 'WOERTER', chegara: 50 },
  { key: 'WOERTER_150', tur: 'WOERTER', chegara: 150 },
  { key: 'WOERTER_300', tur: 'WOERTER', chegara: 300 },
  // A1 dagi hamma so'z.
  { key: 'WOERTER_592', tur: 'WOERTER', chegara: 592 },
];

/** `serie` — joriy seriya (kun); `woerter` — kamida bir marta to'g'ri javob berilgan so'zlar. */
export interface NishonSharoiti {
  serie: number;
  woerter: number;
}

function joriy(tur: NishonTuri, s: NishonSharoiti): number {
  return tur === 'SERIE' ? s.serie : s.woerter;
}

/** Sharti bajarilgan kalitlar, katalog tartibida (olingan-olinmaganidan qat'i nazar). */
export function shartBajarilganlar(s: NishonSharoiti): string[] {
  return NISHON_KATALOGI.filter((n) => joriy(n.tur, s) >= n.chegara).map(
    (n) => n.key,
  );
}

/** «yana N kun / N ta so'z»: chegaragacha qolgani, 0 dan past emas. */
export function qoldi(n: Nishon, s: NishonSharoiti): number {
  return Math.max(0, n.chegara - joriy(n.tur, s));
}
```

- [ ] **Step 7: Testlar**

Run: `cd server && npx jest src/daf/uebung/punkte.spec.ts src/daf/nishon`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prettier --write src/daf/uebung/punkte.ts src/daf/uebung/punkte.spec.ts src/daf/nishon && npx eslint --quiet src/daf/uebung/punkte.ts src/daf/nishon && git add src/daf/uebung/punkte.ts src/daf/uebung/punkte.spec.ts src/daf/nishon && git commit -m "feat(daf): daily goal rules and badge catalogue

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bitta yozuvchi — `grantBadges` va qorovul

**Files:**
- Create: `server/src/daf/nishon/nishon-berish.ts`
- Create: `server/src/daf/nishon/nishon-berish.spec.ts`
- Create: `server/src/daf/nishon/nishon-berish.single-source.spec.ts`

**Interfaces:**
- Consumes: `NISHON_KATALOGI`, `NishonSharoiti`, `shartBajarilganlar` (Task 2).
- Produces:
  - `grantBadges(prisma: PrismaService, studentId: number, companyId: number, sharoit: NishonSharoiti, earnedAt?: Partial<Record<string, Date>>): Promise<string[]>` — shu chaqiruv HAQIQATAN yozgan kalitlar, katalog tartibida.
  - `woerterSoni(prisma: PrismaService, studentId: number): Promise<number>` — `DafLexemeState` da `correctCount ≥ 1` qatorlar soni.
  - `nishonlarniBerXavfsiz(prisma: PrismaService, studentId: number, companyId: number, serie: number): Promise<string[]>` — hech qachon otmaydi; xato bo'lsa `[]` va `warn`.
  - SQL izohi `/* nishon-berish */` (soxta `$queryRaw` lar shu bo'yicha taniydi).

- [ ] **Step 1: Yiqiladigan testlar** — `nishon-berish.spec.ts`:

```ts
import type { Prisma } from '@prisma/client';
import {
  grantBadges,
  nishonlarniBerXavfsiz,
  woerterSoni,
} from './nishon-berish';

/**
 * A stand-in for the table and its unique key (studentId, key): what
 * `INSERT … ON CONFLICT DO NOTHING RETURNING key` returns is exactly the
 * rows that did not exist yet. Each VALUES tuple binds 4 values:
 * studentId, companyId, key, earnedAt.
 */
function fakeBadgeTable(bor: string[] = [], woerter = 0) {
  const rows = new Set(bor.map((k) => `55|${k}`));
  const $queryRaw = jest.fn(async (sql: Prisma.Sql) => {
    const v = sql.values;
    const out: { key: string }[] = [];
    for (let i = 0; i < v.length; i += 4) {
      const id = `${String(v[i])}|${String(v[i + 2])}`;
      if (rows.has(id)) continue;
      rows.add(id);
      out.push({ key: v[i + 2] as string });
    }
    return out;
  });
  const count = jest.fn(async () => woerter);
  const prisma = { $queryRaw, dafLexemeState: { count } } as any;
  return { prisma, rows, $queryRaw, count };
}

describe('grantBadges', () => {
  it("sharti bajarilgan kalit yo'q — so'rov ham yo'q", async () => {
    const { prisma, $queryRaw } = fakeBadgeTable();
    expect(await grantBadges(prisma, 55, 1, { serie: 2, woerter: 10 })).toEqual(
      [],
    );
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('INSERT … ON CONFLICT DO NOTHING RETURNING bilan yozadi', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable();
    expect(await grantBadges(prisma, 55, 1, { serie: 7, woerter: 0 })).toEqual([
      'SERIE_3',
      'SERIE_7',
    ]);
    const sql = ($queryRaw.mock.calls[0][0] as Prisma.Sql).strings.join('?');
    expect(sql).toContain('/* nishon-berish */');
    expect(sql).toMatch(/INSERT INTO "DafStudentBadge"/);
    expect(sql).toMatch(/ON CONFLICT \("studentId", "key"\) DO NOTHING/);
    expect(sql).toMatch(/RETURNING "key"/);
  });

  it('ikki marta berilmaydi', async () => {
    const { prisma } = fakeBadgeTable();
    await grantBadges(prisma, 55, 1, { serie: 3, woerter: 0 });
    expect(await grantBadges(prisma, 55, 1, { serie: 3, woerter: 0 })).toEqual(
      [],
    );
  });

  it('parallel ikki chaqiruv — har kalit faqat bir marta «yangi»', async () => {
    const { prisma, rows } = fakeBadgeTable();
    const [a, b] = await Promise.all([
      grantBadges(prisma, 55, 1, { serie: 14, woerter: 0 }),
      grantBadges(prisma, 55, 1, { serie: 14, woerter: 0 }),
    ]);
    expect([...a, ...b].sort()).toEqual(['SERIE_14', 'SERIE_3', 'SERIE_7']);
    expect(rows.size).toBe(3);
  });

  it('allaqachon olingan nishon qaytmaydi, qolgani katalog tartibida', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable(['SERIE_3']);
    $queryRaw.mockResolvedValueOnce([{ key: 'WOERTER_50' }, { key: 'SERIE_7' }]);
    expect(await grantBadges(prisma, 55, 1, { serie: 7, woerter: 50 })).toEqual([
      'SERIE_7',
      'WOERTER_50',
    ]);
  });

  it('earnedAt berilsa o`sha sana, aks holda hozir yoziladi', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable();
    const kun = new Date('2026-09-03T07:00:00.000Z');
    await grantBadges(
      prisma,
      55,
      1,
      { serie: 7, woerter: 0 },
      { SERIE_3: kun },
    );
    const v = ($queryRaw.mock.calls[0][0] as Prisma.Sql).values;
    expect(v.slice(0, 4)).toEqual([55, 1, 'SERIE_3', '2026-09-03T07:00:00.000Z']);
    expect(v[6]).toBe('SERIE_7');
    expect(Date.now() - new Date(v[7] as string).getTime()).toBeLessThan(5_000);
  });
});

describe('woerterSoni', () => {
  it("kamida bir marta to'g'ri javob berilgan so'zlarni sanaydi", async () => {
    const { prisma, count } = fakeBadgeTable([], 42);
    expect(await woerterSoni(prisma, 55)).toBe(42);
    expect(count).toHaveBeenCalledWith({
      where: { studentId: 55, correctCount: { gte: 1 } },
    });
  });
});

describe('nishonlarniBerXavfsiz', () => {
  it("so'z sonini o'qiydi va beradi", async () => {
    const { prisma } = fakeBadgeTable([], 150);
    expect(await nishonlarniBerXavfsiz(prisma, 55, 1, 0)).toEqual([
      'WOERTER_50',
      'WOERTER_150',
    ]);
  });

  it('xato — bo`sh ro`yxat, otilmaydi (seans saqlangan)', async () => {
    const { prisma, $queryRaw } = fakeBadgeTable([], 50);
    $queryRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(nishonlarniBerXavfsiz(prisma, 55, 1, 3)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/nishon/nishon-berish.spec.ts`
Expected: FAIL (`Cannot find module './nishon-berish'`).

- [ ] **Step 3: Yozuvchini yozish** — `server/src/daf/nishon/nishon-berish.ts`:

```ts
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NISHON_KATALOGI,
  type NishonSharoiti,
  shartBajarilganlar,
} from './nishon-katalogi';

const logger = new Logger('NishonBerish');

/**
 * THE ONE writer of DafStudentBadge (`nishon-berish.single-source.spec.ts`,
 * ADR-0115). Every key whose condition holds is inserted with ON CONFLICT DO
 * NOTHING; RETURNING gives back only the rows THIS call wrote, so two
 * sessions finishing at once never both call one badge "new". A badge is
 * never deleted or revoked: a broken streak keeps it.
 *
 * `earnedAt` — the one-time backfill passes the historical day per key;
 * live granting leaves it empty (now). The instant is bound as an ISO
 * string read in UTC, because the column is a timestamp without time zone.
 */
export async function grantBadges(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  sharoit: NishonSharoiti,
  earnedAt: Partial<Record<string, Date>> = {},
): Promise<string[]> {
  const keys = shartBajarilganlar(sharoit);
  if (keys.length === 0) return [];
  const hozir = new Date();
  const qatorlar = keys.map(
    (key) =>
      Prisma.sql`(${studentId}, ${companyId}, ${key}, ${(earnedAt[key] ?? hozir).toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
  );
  const yozildi = await prisma.$queryRaw<{ key: string }[]>(
    Prisma.sql`/* nishon-berish */
      INSERT INTO "DafStudentBadge" ("studentId", "companyId", "key", "earnedAt")
      VALUES ${Prisma.join(qatorlar)}
      ON CONFLICT ("studentId", "key") DO NOTHING
      RETURNING "key"`,
  );
  const yangi = new Set(yozildi.map((r) => r.key));
  return NISHON_KATALOGI.map((n) => n.key).filter((k) => yangi.has(k));
}

/** O'rganilgan so'z: kamida bir marta to'g'ri javob berilgan (`correctCount` hech qachon kamaymaydi). */
export function woerterSoni(
  prisma: PrismaService,
  studentId: number,
): Promise<number> {
  return prisma.dafLexemeState.count({
    where: { studentId, correctCount: { gte: 1 } },
  });
}

/**
 * Seans oxirida beriladi (`seansNatijasi`). Bu bezak: seans allaqachon
 * saqlangan, shuning uchun xato natijani yiqitmaydi — o'tkazib yuborilgan
 * nishon keyingi seansda SHART bo'yicha qaytadan beriladi.
 */
export async function nishonlarniBerXavfsiz(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  serie: number,
): Promise<string[]> {
  try {
    const woerter = await woerterSoni(prisma, studentId);
    return await grantBadges(prisma, studentId, companyId, { serie, woerter });
  } catch (err) {
    logger.warn(
      `Nishon berilmadi (studentId=${studentId}): ${(err as Error).message}`,
    );
    return [];
  }
}
```

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/nishon/nishon-berish.spec.ts`
Expected: PASS (11 test).

- [ ] **Step 5: Qorovul testi** — `nishon-berish.single-source.spec.ts` (`attempt-writer.single-source.spec.ts` bilan bir shaklda):

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * DafStudentBadge has one door: `grantBadges` (ADR-0115). A write anywhere
 * else could give a badge twice, or — worse — take one back, which the
 * design forbids. The one-time backfill goes through `grantBadges` too.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const PRISMA_WRITE =
  /\.dafStudentBadge\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const RAW_WRITE = /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"DafStudentBadge"/g;
const WRITER = 'src/daf/nishon/nishon-berish.ts';

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

const writers = ROOTS.flatMap((root) => walk(join(SERVER, root))).flatMap(
  (file) => {
    const path = file
      .slice(SERVER.length + 1)
      .split('\\')
      .join('/');
    const text = readFileSync(file, 'utf8');
    const n =
      [...text.matchAll(PRISMA_WRITE)].length +
      [...text.matchAll(RAW_WRITE)].length;
    return n > 0 ? [path] : [];
  },
);

describe('DafStudentBadge is written only by grantBadges', () => {
  it('found the writer — a scan that matches nothing proves nothing', () => {
    expect(writers).toContain(WRITER);
  });

  it('the patterns see Prisma and raw writes', () => {
    expect([...'tx.dafStudentBadge\n  .deleteMany({})'.matchAll(PRISMA_WRITE)]).toHaveLength(1);
    expect([...'UPDATE "DafStudentBadge" SET'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'prisma.dafStudentBadge.findMany({})'.matchAll(PRISMA_WRITE)]).toHaveLength(0);
  });

  it('no other file writes the table', () => {
    expect(writers.filter((p) => p !== WRITER)).toEqual([]);
  });
});
```

Run: `cd server && npx jest src/daf/nishon/nishon-berish.single-source.spec.ts`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prettier --write src/daf/nishon && npx eslint --quiet src/daf/nishon && git add src/daf/nishon && git commit -m "feat(daf): grantBadges is the one writer of earned badges

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `fortschritt` ga `maqsad` (qo'shimcha so'rovsiz)

**Files:**
- Modify: `server/src/daf/daf-portal-read.service.ts:77` (`TAYYOR_SOZ` eksport)
- Create: `server/src/daf/fortschritt/maqsad.ts`, `server/src/daf/fortschritt/maqsad.spec.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (importlar 9-14, `Fortschritt` 16-33, `OquvchiRaqamlari` 57-64, `uebersicht` 207-221, `oquvchiRaqamlari` SQL 463-489)
- Modify: `server/src/daf/fortschritt/zentrum-sql.fake-spec.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.spec.ts`, `fortschritt.parity.spec.ts:149`

**Interfaces:**
- Consumes: `MAQSAD_BALL`, `maqsadDarajasi`, `maqsadHolati`, `MaqsadHolati` (Task 2).
- Produces:
  - `TAYYOR_SOZ` (eksport, `daf-portal-read.service.ts`)
  - `bugunBoshmi(prisma: PrismaService, studentId: number, faelligeWoerter?: number): Promise<boolean>` (`maqsad.ts`)
  - `Fortschritt.maqsad: MaqsadHolati`
  - `OquvchiRaqamlari` ga `heutePunkte: number; dailyGoal: string | null`
  - `zentrumQueryRaw(rows, dailyGoal?: () => string | null)` — soxta `oquvchi-raqamlari` qatoriga `heutePunkte`, `dailyGoal`.

**«Ochiq, tugatilmagan dars» qanday aniqlanadi.** Qulf mijozda hisoblanadi (`client/.../lernen/yol/yol-tuzilishi.ts`, `yolTugunlari`): hamma TAYYOR unitning (`bereit`: kamida bitta `core` va bo'limga bog'langan so'zi bor, `retiredAt` yo'q) bo'lim darslari va yakuniy sinovi bitta ketma-ketlikda, birinchi `completedAt == null` — ochiq. Zanjir chiziqli, demak «ochiq dars bor» ⇔ «shunday darslar ichida o'quvchi tugatmagani bor». Bitta `findFirst` (`take 1`):
`DafLesson` WHERE `unit.retiredAt IS NULL` AND unitda `DafLexeme` (`core = true`, `sectionId IS NOT NULL`) bor AND (`sectionId IS NOT NULL` OR `kind = 'UNIT_TEST'`) AND shu o'quvchining `completedAt IS NOT NULL` bo'lgan `DafLessonProgress` qatori YO'Q. U faqat `faelligeWoerter == 0` bo'lganda o'qiladi: muddati kelgan so'z bor bo'lsa ball topish mumkin, `bosh` baribir yolg'on — so'rovning keragi yo'q.

**Nega `findUnique` emas.** Spec sozlamani `Promise.all` ichida alohida `findUnique` bilan o'qishni aytadi. 50 parallel o'quvchida har parallel so'rov pul navbatidan (10 ulanish) yana bir joy oladi; S1 da `uebersicht` p95 168–193 / 200 edi. Shuning uchun sozlama ham, bugungi ball ham MAVJUD `oquvchi-raqamlari` so'roviga ikki CTE sifatida qo'shiladi — round trip ham, pul joyi ham qo'shilmaydi, va `seansNatijasi` ham ularni bepul oladi.

- [ ] **Step 1: `TAYYOR_SOZ` ni eksport qilish** — `daf-portal-read.service.ts` da:

```ts
const TAYYOR_SOZ = { core: true, sectionId: { not: null } } as const;
```

ni quyidagiga almashtirish:

```ts
export const TAYYOR_SOZ = { core: true, sectionId: { not: null } } as const;
```

- [ ] **Step 2: Yiqiladigan `bugunBoshmi` testi** — `server/src/daf/fortschritt/maqsad.spec.ts`:

```ts
import { bugunBoshmi } from './maqsad';

function fake(opts: { due: number; ochiqDars: boolean }) {
  return {
    dafLexemeState: { count: jest.fn(async () => opts.due) },
    dafLesson: {
      findFirst: jest.fn(async () => (opts.ochiqDars ? { id: 7 } : null)),
    },
  } as any;
}

describe('bugunBoshmi', () => {
  it("muddati kelgan so'z bor — bosh emas, dars so'rovi o'qilmaydi", async () => {
    const prisma = fake({ due: 2, ochiqDars: false });
    expect(await bugunBoshmi(prisma, 55)).toBe(false);
    expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
  });

  it("son tayyor berilsa qayta sanalmaydi", async () => {
    const prisma = fake({ due: 0, ochiqDars: true });
    expect(await bugunBoshmi(prisma, 55, 4)).toBe(false);
    expect(prisma.dafLexemeState.count).not.toHaveBeenCalled();
    expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
  });

  it("so'z yo'q, ochiq dars bor — bosh emas (yangi so'z ball beradi)", async () => {
    expect(await bugunBoshmi(fake({ due: 0, ochiqDars: true }), 55, 0)).toBe(
      false,
    );
  });

  it("so'z yo'q va ochiq dars yo'q — bosh", async () => {
    expect(await bugunBoshmi(fake({ due: 0, ochiqDars: false }), 55)).toBe(
      true,
    );
  });

  it("ochiq dars — yo'ldagi qulf zanjiri bilan bir xil to'plam", async () => {
    const prisma = fake({ due: 0, ochiqDars: false });
    await bugunBoshmi(prisma, 55, 0);
    expect(prisma.dafLesson.findFirst).toHaveBeenCalledWith({
      where: {
        unit: {
          retiredAt: null,
          lexemes: { some: { core: true, sectionId: { not: null } } },
        },
        OR: [{ sectionId: { not: null } }, { kind: 'UNIT_TEST' }],
        progress: { none: { studentId: 55, completedAt: { not: null } } },
      },
      select: { id: true },
    });
  });
});
```

Run: `cd server && npx jest src/daf/fortschritt/maqsad.spec.ts` → FAIL (`Cannot find module './maqsad'`).

- [ ] **Step 3: `maqsad.ts` ni yozish**:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { TAYYOR_SOZ } from '../daf-portal-read.service';

/**
 * Bugun qiladigan mashq qolmaganmi (spec S2 1.1, `bosh`): muddati kelgan so'z
 * yo'q VA ochiq, tugatilmagan dars yo'q. Dars hali bor bo'lsa (yangi so'z ball
 * beradi) bosh emas — yangi o'quvchi mashq qilmasdan «bajarildi» ko'rmaydi.
 *
 * «Ochiq dars» — yo'l qulf zanjirining (`client/.../yol/yol-tuzilishi.ts`)
 * o'sha to'plami: tayyor unitning bo'lim darslari va yakuniy sinovi. Zanjir
 * chiziqli, shuning uchun «biri tugatilmagan» ⇔ «ochiq dars bor».
 * Dars so'rovi faqat so'z yo'q bo'lganda o'qiladi.
 */
export async function bugunBoshmi(
  prisma: PrismaService,
  studentId: number,
  faelligeWoerter?: number,
): Promise<boolean> {
  const due =
    faelligeWoerter ??
    (await prisma.dafLexemeState.count({
      where: { studentId, dueAt: { lte: new Date() } },
    }));
  if (due > 0) return false;
  const ochiq = await prisma.dafLesson.findFirst({
    where: {
      unit: { retiredAt: null, lexemes: { some: TAYYOR_SOZ } },
      OR: [{ sectionId: { not: null } }, { kind: 'UNIT_TEST' }],
      progress: { none: { studentId, completedAt: { not: null } } },
    },
    select: { id: true },
  });
  return ochiq === null;
}
```

Run: `cd server && npx jest src/daf/fortschritt/maqsad.spec.ts` → PASS.

- [ ] **Step 4: Soxta SQL'ni kengaytirish** — `zentrum-sql.fake-spec.ts`:

```ts
export function zentrumQueryRaw(rows: () => KunQatori[]) {
```

ni quyidagiga:

```ts
export function zentrumQueryRaw(
  rows: () => KunQatori[],
  dailyGoal: () => string | null = () => null,
) {
```

va `oquvchi-raqamlari` javobidagi:

```ts
          heuteAttempts: mine
            .filter((r) => r.day === heuteTag)
            .reduce((s, r) => s + r.attempts, 0),
        },
```

ni quyidagiga:

```ts
          heuteAttempts: mine
            .filter((r) => r.day === heuteTag)
            .reduce((s, r) => s + r.attempts, 0),
          heutePunkte: mine
            .filter((r) => r.day === heuteTag)
            .reduce((s, r) => s + r.points, 0),
          dailyGoal: dailyGoal(),
        },
```

Fayl tepasidagi izohga (`today's attempts = the caller's rows of today.` jumlasidan keyin) qo'shish: ` Today's points likewise; the goal level is the caller's DafStudentSetting row (null = none).`

- [ ] **Step 5: Yiqiladigan servis testlari** — `fortschritt.service.spec.ts`:
  - importlarga `import { tashkentDateStr } from '../../common/date/tashkent';`
  - `fakePrisma` imzosini va tanasini:

```ts
function fakePrisma(
  week: { studentId: number; points: number }[] = [],
  extra: KunQatori[] = [],
  dailyGoal: string | null = null,
) {
  const montag = wochenStartTag(new Date());
  return {
    $queryRaw: zentrumQueryRaw(
      () => [
        ...week.map((w) => ({ ...w, companyId: 1, day: montag, attempts: 1 })),
        ...extra,
      ],
      () => dailyGoal,
    ),
```

(qolgan maydonlar o'zgarmaydi) va `dafLexemeState: { count: jest.fn(async () => 0) },` qatoridan keyin:

```ts
    // `bosh`: an open lesson exists unless a test says otherwise.
    dafLesson: { findFirst: jest.fn(async () => ({ id: 1 })) },
```

  - `describe('uebersicht'` blokining oxiriga:

```ts
  describe('maqsad (S2)', () => {
    const bugun = (points: number): KunQatori => ({
      studentId: 55,
      companyId: 1,
      day: tashkentDateStr(new Date()),
      points,
      attempts: 1,
    });

    it("sozlama yo'q — O'RTA, bugungi ball bugungi qatorlardan", async () => {
      const prisma = fakePrisma([], [bugun(30), { ...bugun(0), day: '2026-01-05', points: 500 }]);
      const f = await new FortschrittService(prisma).uebersicht(55, 1);
      expect(f.maqsad).toEqual({
        daraja: 'ORTA',
        ball: 80,
        hozir: 30,
        bajarildi: false,
        bosh: false,
      });
    });

    it('tanlangan daraja o`qiladi', async () => {
      const prisma = fakePrisma([], [bugun(160)], 'JIDDIY');
      const f = await new FortschrittService(prisma).uebersicht(55, 1);
      expect(f.maqsad).toMatchObject({ daraja: 'JIDDIY', ball: 160, bajarildi: true });
    });

    it("qo'shimcha so'rov yo'q: bitta SQL, sozlama alohida o'qilmaydi", async () => {
      const prisma = fakePrisma([], [bugun(10)], 'YENGIL');
      prisma.dafLexemeState.count = jest.fn(async () => 3);
      await new FortschrittService(prisma).uebersicht(55, 1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
      expect(prisma.dafStudentSetting).toBeUndefined();
    });

    it("so'z ham, ochiq dars ham yo'q — bosh, 0 ballda ham bajarildi", async () => {
      const prisma = fakePrisma();
      prisma.dafLesson.findFirst = jest.fn(async () => null);
      const f = await new FortschrittService(prisma).uebersicht(55, 1);
      expect(f.maqsad).toMatchObject({ hozir: 0, bajarildi: true, bosh: true });
    });

    it("so'z yo'q, lekin ochiq dars bor — bosh emas", async () => {
      const f = await new FortschrittService(fakePrisma()).uebersicht(55, 1);
      expect(f.maqsad).toMatchObject({ bajarildi: false, bosh: false });
    });
  });
```

  - `fortschritt.parity.spec.ts` dagi `dafLexemeState: { count: jest.fn(async () => 0) },` qatoridan keyin:

```ts
    dafLesson: { findFirst: jest.fn(async () => ({ id: 1 })) },
```

Run: `cd server && npx jest src/daf/fortschritt` → FAIL (`f.maqsad` undefined).

- [ ] **Step 6: Servisni o'zgartirish** — `fortschritt.service.ts`:

Importlar (9-14 qatorlar):

```ts
import {
  serieAus,
  stufeFuer,
  wochenStartTag,
  wochenStartUtc,
} from '../uebung/punkte';
```

ni quyidagiga:

```ts
import {
  maqsadDarajasi,
  maqsadHolati,
  serieAus,
  stufeFuer,
  wochenStartTag,
  wochenStartUtc,
  type MaqsadHolati,
} from '../uebung/punkte';
import { bugunBoshmi } from './maqsad';
```

`Fortschritt` interfeysida `faelligeWoerter: number;` dan keyin (yopuvchi `}` dan oldin):

```ts
  /** Kunlik maqsad (spec S2 1.3): daraja, maqsad balli, bugungi ball, holat. */
  maqsad: MaqsadHolati;
```

`OquvchiRaqamlari` da `heuteAttempts: number;` dan keyin:

```ts
  heutePunkte: number;
  /** `DafStudentSetting.dailyGoal`, qator yo'q bo'lsa `null`. */
  dailyGoal: string | null;
```

`uebersicht` da:

```ts
    const gesamt = oz.gesamt;
    const { jetzt, naechste } = stufeFuer(gesamt);
```

ni quyidagiga:

```ts
    // Kam yo'l: so'z bor bo'lsa so'rovsiz `false` (spec S2 1.3).
    const bosh = await bugunBoshmi(this.prisma, studentId, faelligeWoerter);
    const gesamt = oz.gesamt;
    const { jetzt, naechste } = stufeFuer(gesamt);
```

va qaytariladigan obyektdagi `faelligeWoerter,` dan keyin:

```ts
      maqsad: maqsadHolati(
        maqsadDarajasi(oz.dailyGoal),
        oz.heutePunkte,
        bosh,
      ),
```

`oquvchiRaqamlari` dagi SQL — `q AS (…)` qatoridan `FROM r\`,` gacha bo'lgan qismni:

```ts
      q AS (SELECT "studentId" AS id, p FROM t WHERE "studentId" = ${studentId}),
      sozlama AS (
        SELECT "dailyGoal"::text AS g FROM "DafStudentSetting"
        WHERE "studentId" = ${studentId}
      ),
      o AS (SELECT id, p, GREATEST(p - ${minus}::int, 0) AS op FROM q),
      r AS (
        SELECT o.p AS punkte,
          1 + (COUNT(*) FILTER (WHERE t."studentId" <> o.id
            AND (t.p > o.p OR (t.p = o.p AND t."studentId" < o.id))))::int AS hozir,
          1 + (COUNT(*) FILTER (WHERE t."studentId" <> o.id
            AND (t.p > o.op OR (t.p = o.op AND t."studentId" < o.id))))::int AS oldin
        FROM t CROSS JOIN o
        GROUP BY o.id, o.p, o.op
      ),
      bugun AS (
        SELECT COALESCE(SUM(points), 0)::int AS p,
               COALESCE(SUM(attempts), 0)::int AS a
        FROM mine WHERE day = ${heuteTag}::date
      )
      SELECT r.punkte, r.hozir, r.oldin,
        (SELECT COALESCE(SUM(points), 0)::int FROM mine) AS gesamt,
        ARRAY(
          SELECT DISTINCT to_char(day, 'YYYY-MM-DD') FROM mine WHERE attempts > 0
        ) AS tage,
        (SELECT a FROM bugun) AS "heuteAttempts",
        (SELECT p FROM bugun) AS "heutePunkte",
        (SELECT g FROM sozlama) AS "dailyGoal"
      FROM r`,
```

ga almashtirish (`r` CTE ning o'zi o'zgarmaydi; bog'langan qiymatlar tartibi `[companyId, montagTag, studentId, …, minus, heuteTag]` — oxirgi ikkitasi hamon `minus`, `heuteTag`, soxta `$queryRaw` shunga tayanadi). Metod ustidagi JSDoc ro'yxatiga `heuteAttempts` bandidan keyin qo'shish:

```ts
   * - `heutePunkte` — bugungi (Toshkent) ball, hamma `groupKey` (kunlik
   *   maqsad, spec S2 1.1).
   * - `dailyGoal` — `DafStudentSetting` dagi tanlov yoki `null`. Shu so'rovga
   *   CTE sifatida qo'shilgan: alohida `findUnique` 50 parallel o'quvchida
   *   ulanish navbatiga yana bir joy olardi.
```

- [ ] **Step 7: Testlar**

Run: `cd server && npx jest src/daf/fortschritt src/daf/daf-portal-read.service.spec.ts`
Expected: PASS (seans-natija spec'i ham — `seansNatijasi` hali yangi maydonlarni o'qimaydi).

- [ ] **Step 8: Typecheck**

Run: `cd server && npm run typecheck`
Expected: 0 xato.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prettier --write src/daf/fortschritt src/daf/daf-portal-read.service.ts && npx eslint --quiet src/daf/fortschritt src/daf/daf-portal-read.service.ts && git add src/daf/fortschritt src/daf/daf-portal-read.service.ts && git commit -m "feat(daf): progress answers with today's goal, no extra query

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Seans oxiri — `maqsad` va `yangiNishonlar`

**Files:**
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (`SeansNatijasi` 44-52, `seansNatijasi` 292-317)
- Modify: `server/src/daf/fortschritt/seans-natija.spec.ts`

**Interfaces:**
- Consumes: `MAQSAD_BALL`, `maqsadDarajasi`, `yangiBajarildi` (Task 2); `nishonlarniBerXavfsiz` (Task 3); `bugunBoshmi`, `OquvchiRaqamlari.heutePunkte/dailyGoal` (Task 4).
- Produces:
  ```ts
  SeansNatijasi.maqsad: { ball: number; hozir: number; bajarildi: boolean; yangiBajarildi: boolean };
  SeansNatijasi.yangiNishonlar: string[];
  ```
  Kontroller o'zgarmaydi: `postAbschluss` / `postWiederholungAbschluss` `natija` ni butunligicha qaytaradi.

- [ ] **Step 1: Soxta Prisma'ni kengaytirish** — `seans-natija.spec.ts` dagi `fake` funksiyasini butunlay quyidagiga almashtirish:

```ts
function fake(opts: {
  session: { points: number; createdAt: Date; groupId: string | null }[];
  todayAttempts: number;
  week: { studentId: number; points: number }[];
  groupWeek?: { studentId: number; points: number }[];
  groupId?: string | null;
  dailyGoal?: string | null;
  /** Muddati kelgan so'zlar (`bosh` tekshiruvi). */
  due?: number;
  ochiqDars?: boolean;
  /** O'rganilgan so'zlar (nishon sharti). */
  woerter?: number;
  /** INSERT … RETURNING javobi; `'xato'` — so'rov yiqiladi. */
  badges?: string[] | 'xato';
}) {
  // Day rows for the SQL fake: the week dated today (Monday), the caller's
  // row carrying today's attempts, and a Sunday row for the streak.
  const zentrum = zentrumQueryRaw(
    () => [
      ...opts.week.map((w) => ({
        ...w,
        companyId: 1,
        day: '2026-10-19',
        attempts: w.studentId === 55 ? opts.todayAttempts : 1,
      })),
      {
        studentId: 55,
        companyId: 1,
        day: '2026-10-18',
        points: 0,
        attempts: 1,
      },
    ],
    () => opts.dailyGoal ?? null,
  );
  return {
    $queryRaw: jest.fn((sql: Prisma.Sql) => {
      if (!sql.strings[0].includes('/* nishon-berish */')) return zentrum(sql);
      if (opts.badges === 'xato') return Promise.reject(new Error('db down'));
      return Promise.resolve((opts.badges ?? []).map((key) => ({ key })));
    }),
    dafAttempt: { findMany: jest.fn(async () => opts.session) },
    dafStudentDay: {
      // Only the group table still uses groupBy.
      groupBy: jest.fn(async () =>
        (opts.groupWeek ?? []).map((w) => ({
          studentId: w.studentId,
          _sum: { points: w.points },
        })),
      ),
    },
    dafLexemeState: {
      count: jest.fn(async ({ where }: any) =>
        where.correctCount ? (opts.woerter ?? 0) : (opts.due ?? 1),
      ),
    },
    dafLesson: {
      findFirst: jest.fn(async () => (opts.ochiqDars === false ? null : { id: 1 })),
    },
    enrollment: {
      findFirst: jest.fn(async () =>
        opts.groupId ? { groupId: opts.groupId } : null,
      ),
      findMany: jest.fn(async () =>
        (opts.groupWeek ?? []).map((w) => ({ studentId: w.studentId })),
      ),
    },
  } as any;
}
```

va fayl tepasiga `import type { Prisma } from '@prisma/client';`.

- [ ] **Step 2: Yiqiladigan testlar** — `describe('seansNatijasi'` blokining oxiriga:

```ts
  describe('maqsad (S2)', () => {
    const seans = (points: number, iso = '2026-10-19T08:50:00Z') => ({
      points,
      createdAt: new Date(iso),
      groupId: null,
    });

    it('seans maqsadni kesib o`tdi — yangiBajarildi', async () => {
      // Bugun 100 (oldin 50 + seans 50), maqsad O'RTA 80.
      const svc = new FortschrittService(
        fake({ session: [seans(50)], todayAttempts: 2, week: [{ studentId: 55, points: 100 }] }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.maqsad).toEqual({
        ball: 80,
        hozir: 100,
        bajarildi: true,
        yangiBajarildi: true,
      });
    });

    it('seansdan oldin ham bajarilgan edi — yangi emas, bosh tekshirilmaydi', async () => {
      const prisma = fake({
        session: [seans(20)],
        todayAttempts: 5,
        week: [{ studentId: 55, points: 120 }],
      });
      const n = await new FortschrittService(prisma).seansNatijasi('s-1', 55, 1);
      expect(n.maqsad.yangiBajarildi).toBe(false);
      expect(prisma.dafLesson.findFirst).not.toHaveBeenCalled();
    });

    it("yarim tun: kechagi qism bugungi baldan ayirilmaydi", async () => {
      // Yakshanba 23:55 da 30, dushanba 00:05 da 10; bugun jami 60 (oldin 50).
      // Maqsad YENGIL 40 seansdan OLDIN bajarilgan edi.
      const svc = new FortschrittService(
        fake({
          session: [seans(30, '2026-10-18T18:55:00Z'), seans(10, '2026-10-18T19:05:00Z')],
          todayAttempts: 3,
          week: [{ studentId: 55, points: 60 }],
          dailyGoal: 'YENGIL',
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.maqsad).toMatchObject({ ball: 40, hozir: 60, yangiBajarildi: false });
    });

    it("bosh holat (so'z ham, ochiq dars ham yo'q) — yutuq ko'rsatilmaydi", async () => {
      const svc = new FortschrittService(
        fake({
          session: [seans(50)],
          todayAttempts: 2,
          week: [{ studentId: 55, points: 100 }],
          due: 0,
          ochiqDars: false,
        }),
      );
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.maqsad.yangiBajarildi).toBe(false);
    });
  });

  describe('yangiNishonlar (S2)', () => {
    const asos = {
      session: [{ points: 10, createdAt: new Date('2026-10-19T08:50:00Z'), groupId: null }],
      todayAttempts: 1,
      week: [{ studentId: 55, points: 10 }],
      woerter: 50,
    };

    it('shu seans bergan kalitlar qaytadi', async () => {
      const svc = new FortschrittService(fake({ ...asos, badges: ['WOERTER_50'] }));
      const n = await svc.seansNatijasi('s-1', 55, 1);
      expect(n.yangiNishonlar).toEqual(['WOERTER_50']);
    });

    it('allaqachon olingan bo`lsa — bo`sh ro`yxat', async () => {
      const svc = new FortschrittService(fake({ ...asos, badges: [] }));
      expect((await svc.seansNatijasi('s-1', 55, 1)).yangiNishonlar).toEqual([]);
    });

    it("nishon berishdagi xato natijani yiqitmaydi", async () => {
      const svc = new FortschrittService(fake({ ...asos, badges: 'xato' }));
      const n = await svc.seansNatijasiXavfsiz('s-1', 55, 1);
      expect(n).not.toBeNull();
      expect(n!.punkte).toBe(10);
      expect(n!.yangiNishonlar).toEqual([]);
    });
  });
```

Run: `cd server && npx jest src/daf/fortschritt/seans-natija.spec.ts`
Expected: FAIL (`n.maqsad` undefined).

- [ ] **Step 3: Servisni o'zgartirish** — `fortschritt.service.ts`:

Importlarga:

```ts
import { nishonlarniBerXavfsiz } from '../nishon/nishon-berish';
```

va `../uebung/punkte` importiga `MAQSAD_BALL,` va `yangiBajarildi,` qo'shiladi (alifbo tartibida: `MAQSAD_BALL, maqsadDarajasi, maqsadHolati, serieAus, stufeFuer, wochenStartTag, wochenStartUtc, yangiBajarildi, type MaqsadHolati`).

`SeansNatijasi` interfeysida `orin: {…};` dan keyin:

```ts
  /** Kunlik maqsad: `yangiBajarildi` — shu seans uni kesib o'tdi (spec S2 1.3). */
  maqsad: {
    ball: number;
    hozir: number;
    bajarildi: boolean;
    yangiBajarildi: boolean;
  };
  /** Shu seans bergan nishon kalitlari (spec S2 2.3). */
  yangiNishonlar: string[];
```

`seansNatijasi` ichida:

```ts
    const shuHafta = shuHaftaOf(urinishlar);
    const bugungi = urinishlar.filter(
      (u) => tashkentDateStr(u.createdAt) === heute,
    ).length;
```

ni quyidagiga:

```ts
    const shuHafta = shuHaftaOf(urinishlar);
    const bugungiUrinishlar = urinishlar.filter(
      (u) => tashkentDateStr(u.createdAt) === heute,
    );
    const bugungi = bugungiUrinishlar.length;
```

va metod oxiridagi:

```ts
    return {
      punkte: sum(urinishlar),
      serie: serieAus(oz.tage, heute),
      serieYangi: bugungi > 0 && oz.heuteAttempts === bugungi,
```

ni quyidagiga:

```ts
    const serie = serieAus(oz.tage, heute);
    const ball = MAQSAD_BALL[maqsadDarajasi(oz.dailyGoal)];
    // Seansdan oldingi bugungi ball = hozir − seansning BUGUNGI qismi
    // (yarim tundan oldingi qismi kechaga tushgan).
    const kesdi = yangiBajarildi(
      ball,
      oz.heutePunkte,
      sum(bugungiUrinishlar),
      false,
    );
    // `bosh` faqat maqsad kesilganda o'qiladi — kuniga ko'pi bilan bir marta.
    // Nishonlar shu yerda (seriya va so'z soni yangilangan); xatosi o'zi
    // ushlanadi, natija `null` ga tushmaydi.
    const [bosh, yangiNishonlar] = await Promise.all([
      kesdi ? bugunBoshmi(this.prisma, studentId) : Promise.resolve(false),
      nishonlarniBerXavfsiz(this.prisma, studentId, companyId, serie),
    ]);

    return {
      punkte: sum(urinishlar),
      serie,
      serieYangi: bugungi > 0 && oz.heuteAttempts === bugungi,
```

va qaytariladigan obyektning `orin: { … },` dan keyin (yopuvchi `};` dan oldin):

```ts
      maqsad: {
        ball,
        hozir: oz.heutePunkte,
        bajarildi: oz.heutePunkte >= ball,
        yangiBajarildi: kesdi && !bosh,
      },
      yangiNishonlar,
```

(`maqsad.bajarildi` bu yerda faqat ballga qarab: `bosh` faqat kesilganda o'qiladi; mijoz natija ekranida faqat `yangiBajarildi` ni ishlatadi, halqa `fortschritt` dan o'qiydi.)

- [ ] **Step 4: Testlar**

Run: `cd server && npx jest src/daf/fortschritt src/daf/daf-portal.controller.spec.ts`
Expected: PASS (eski `seansNatijasi` testlari ham — ular maydonlarni alohida tekshiradi).

- [ ] **Step 5: Typecheck**

Run: `cd server && npm run typecheck`
Expected: 0 xato.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prettier --write src/daf/fortschritt && npx eslint --quiet src/daf/fortschritt && git add src/daf/fortschritt && git commit -m "feat(daf): session end reports the daily goal and new badges

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `PATCH maqsad`, `GET nishonlar` va marshrut manifesti

**Files:**
- Modify: `server/src/daf/fortschritt/maqsad.ts`, `maqsad.spec.ts` (`maqsadniSaqla`)
- Create: `server/src/daf/nishon/nishonlar.ts`, `server/src/daf/nishon/nishonlar.spec.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (ikki ulanish metod, `reyting` dan oldin)
- Create: `server/src/daf/dto/maqsad.dto.ts`, `server/src/daf/dto/maqsad.dto.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts` (importlar 1-10, 26-27; fayl oxiriga ikki marshrut)
- Modify: `server/src/daf/daf-portal.controller.spec.ts`
- Modify: `server/src/daf/daf-portal.student-card.e2e.spec.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (`'GET /student-portal/lernen/fortschritt'` bloki, ~915-940)
- Modify: `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `maqsadHolati`, `MaqsadHolati` (Task 2); `NISHON_KATALOGI`, `qoldi`, `NishonTuri` (Task 2); `woerterSoni` (Task 3); `bugunBoshmi` (Task 4).
- Produces:
  - `maqsadniSaqla(prisma, studentId: number, companyId: number, daraja: DafDailyGoal): Promise<MaqsadHolati>` (`maqsad.ts`)
  - `interface NishonQatori { key: string; tur: NishonTuri; chegara: number; olingan: string | null; qoldi: number | null }`; `nishonlarRoyxati(prisma, studentId: number, jetzt: Date): Promise<NishonQatori[]>` (`nishonlar.ts`)
  - `FortschrittService.maqsadniOzgartir(studentId, companyId, daraja): Promise<MaqsadHolati>`, `FortschrittService.nishonlar(studentId): Promise<NishonQatori[]>`
  - `MaqsadDto { daraja: DafDailyGoal }`
  - HTTP: `PATCH /api/student-portal/lernen/maqsad` `{ daraja }` → `MaqsadHolati`; `GET /api/student-portal/lernen/nishonlar` → `NishonQatori[]`. (Spec'dagi `daf/maqsad`, `daf/nishonlar` — shu kontrollerning yo'li `student-portal/lernen`.)

- [ ] **Step 1: Yiqiladigan `maqsadniSaqla` testi** — `maqsad.spec.ts` importini `import { bugunBoshmi, maqsadniSaqla } from './maqsad';` ga almashtirish va oxiriga:

```ts
describe('maqsadniSaqla', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T09:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  function prismaFor(bugungiBall: number) {
    return {
      dafStudentSetting: { upsert: jest.fn(async () => ({})) },
      dafStudentDay: {
        aggregate: jest.fn(async () => ({ _sum: { points: bugungiBall } })),
      },
      dafLexemeState: { count: jest.fn(async () => 2) },
      dafLesson: { findFirst: jest.fn(async () => ({ id: 1 })) },
    } as any;
  }

  it("upsert bilan saqlaydi — ikki parallel bosish ham bitta qator", async () => {
    const prisma = prismaFor(30);
    await maqsadniSaqla(prisma, 55, 1, 'JIDDIY');
    expect(prisma.dafStudentSetting.upsert).toHaveBeenCalledWith({
      where: { studentId: 55 },
      create: { studentId: 55, companyId: 1, dailyGoal: 'JIDDIY' },
      update: { dailyGoal: 'JIDDIY' },
    });
  });

  it("darrov kuchga kiradi: yangi maqsad bugungi ball bilan qaytadi", async () => {
    const prisma = prismaFor(45);
    expect(await maqsadniSaqla(prisma, 55, 1, 'YENGIL')).toEqual({
      daraja: 'YENGIL',
      ball: 40,
      hozir: 45,
      bajarildi: true,
      bosh: false,
    });
    expect(prisma.dafStudentDay.aggregate).toHaveBeenCalledWith({
      where: { studentId: 55, day: new Date('2026-10-19T00:00:00.000Z') },
      _sum: { points: true },
    });
  });
});
```

Run: `cd server && npx jest src/daf/fortschritt/maqsad.spec.ts` → FAIL (`maqsadniSaqla is not a function`).

- [ ] **Step 2: `maqsadniSaqla` ni yozish** — `maqsad.ts` importlari:

```ts
import type { DafDailyGoal } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { TAYYOR_SOZ } from '../daf-portal-read.service';
import { maqsadHolati, type MaqsadHolati } from '../uebung/punkte';
```

fayl oxiriga:

```ts
/**
 * `PATCH .../maqsad`: tanlov darrov kuchga kiradi, tarix saqlanmaydi (spec
 * S2 1.1). `upsert` — Prisma uni `INSERT … ON CONFLICT DO UPDATE` qiladi
 * (kalit `studentId`), shuning uchun ikki parallel bosish ham xavfsiz.
 * Javob — yangi maqsad bugungi ball bilan, halqa darrov to'g'ri chiziladi.
 */
export async function maqsadniSaqla(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  daraja: DafDailyGoal,
): Promise<MaqsadHolati> {
  await prisma.dafStudentSetting.upsert({
    where: { studentId },
    create: { studentId, companyId, dailyGoal: daraja },
    update: { dailyGoal: daraja },
  });
  const [bugun, bosh] = await Promise.all([
    prisma.dafStudentDay.aggregate({
      where: {
        studentId,
        day: utcMidnightFromDateStr(tashkentDateStr(new Date())),
      },
      _sum: { points: true },
    }),
    bugunBoshmi(prisma, studentId),
  ]);
  return maqsadHolati(daraja, bugun._sum.points ?? 0, bosh);
}
```

Run → PASS.

- [ ] **Step 3: Yiqiladigan `nishonlarRoyxati` testi** — `server/src/daf/nishon/nishonlar.spec.ts`:

```ts
import { nishonlarRoyxati } from './nishonlar';

const JETZT = new Date('2026-10-19T09:00:00Z'); // dushanba, Toshkent

function prismaFor(opts: {
  kunlar: string[];
  woerter: number;
  olingan: { key: string; earnedAt: Date }[];
}) {
  return {
    dafStudentDay: {
      findMany: jest.fn(async () =>
        opts.kunlar.map((d) => ({ day: new Date(`${d}T00:00:00.000Z`) })),
      ),
    },
    dafLexemeState: { count: jest.fn(async () => opts.woerter) },
    dafStudentBadge: { findMany: jest.fn(async () => opts.olingan) },
  } as any;
}

describe('nishonlarRoyxati', () => {
  it('hamma katalog: olinganiga sana, olinmaganiga «yana N»', async () => {
    const prisma = prismaFor({
      // 4 kunlik joriy seriya (16–19 oktabr).
      kunlar: ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'],
      woerter: 120,
      olingan: [
        { key: 'SERIE_3', earnedAt: new Date('2026-10-18T07:00:00.000Z') },
        { key: 'WOERTER_50', earnedAt: new Date('2026-10-01T10:00:00.000Z') },
      ],
    });
    const r = await nishonlarRoyxati(prisma, 55, JETZT);
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({
      key: 'SERIE_3',
      tur: 'SERIE',
      chegara: 3,
      olingan: '2026-10-18T07:00:00.000Z',
      qoldi: null,
    });
    expect(r.find((x) => x.key === 'SERIE_7')).toMatchObject({ olingan: null, qoldi: 3 });
    expect(r.find((x) => x.key === 'WOERTER_150')).toMatchObject({ olingan: null, qoldi: 30 });
  });

  it("uzilgan seriya bilan olingan nishon qoladi (olib qo'yilmaydi)", async () => {
    const prisma = prismaFor({
      kunlar: ['2026-10-01'],
      woerter: 0,
      olingan: [{ key: 'SERIE_7', earnedAt: new Date('2026-09-20T07:00:00.000Z') }],
    });
    const r = await nishonlarRoyxati(prisma, 55, JETZT);
    expect(r.find((x) => x.key === 'SERIE_7')!.olingan).toBe('2026-09-20T07:00:00.000Z');
  });

  it("GET hech narsa yozmaydi", async () => {
    const prisma = prismaFor({ kunlar: [], woerter: 600, olingan: [] });
    await nishonlarRoyxati(prisma, 55, JETZT);
    expect(Object.keys(prisma.dafStudentBadge)).toEqual(['findMany']);
    expect(prisma.dafStudentDay.findMany).toHaveBeenCalledWith({
      where: { studentId: 55, attempts: { gt: 0 } },
      select: { day: true },
      distinct: ['day'],
    });
  });
});
```

Run: `cd server && npx jest src/daf/nishon/nishonlar.spec.ts` → FAIL (`Cannot find module './nishonlar'`).

- [ ] **Step 4: `nishonlar.ts` ni yozish**:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { tashkentDateStr } from '../../common/date/tashkent';
import { serieAus } from '../uebung/punkte';
import { woerterSoni } from './nishon-berish';
import { NISHON_KATALOGI, qoldi, type NishonTuri } from './nishon-katalogi';

export interface NishonQatori {
  key: string;
  tur: NishonTuri;
  chegara: number;
  /** Olingan vaqt (ISO) yoki `null`. */
  olingan: string | null;
  /** Olinmagan nishon uchun «yana N kun / N ta so'z»; olinganda `null`. */
  qoldi: number | null;
}

/**
 * `GET .../nishonlar` (spec S2 2.3) — tab ochilgandagina so'raladi. Hech
 * narsa YOZMAYDI: nishon faqat seans oxirida beriladi; sharti bajarilgan,
 * lekin hali berilmagan nishon `qoldi: 0` bilan ko'rinadi va keyingi seansda
 * beriladi. Joriy seriya va so'z soni shu yerda hisoblanadi.
 */
export async function nishonlarRoyxati(
  prisma: PrismaService,
  studentId: number,
  jetzt: Date,
): Promise<NishonQatori[]> {
  const [kunlar, woerter, olinganlar] = await Promise.all([
    prisma.dafStudentDay.findMany({
      where: { studentId, attempts: { gt: 0 } },
      select: { day: true },
      distinct: ['day'],
    }),
    woerterSoni(prisma, studentId),
    prisma.dafStudentBadge.findMany({
      where: { studentId },
      select: { key: true, earnedAt: true },
    }),
  ]);
  // `@db.Date` qiymati — o'sha kalendar kunining UTC yarim tuni.
  const serie = serieAus(
    kunlar.map((k) => k.day.toISOString().slice(0, 10)),
    tashkentDateStr(jetzt),
  );
  const sharoit = { serie, woerter };
  const olingan = new Map(olinganlar.map((b) => [b.key, b.earnedAt]));
  return NISHON_KATALOGI.map((n) => {
    const at = olingan.get(n.key);
    return {
      key: n.key,
      tur: n.tur,
      chegara: n.chegara,
      olingan: at ? at.toISOString() : null,
      qoldi: at ? null : qoldi(n, sharoit),
    };
  });
}
```

Run: `cd server && npx jest src/daf/nishon` → PASS.

- [ ] **Step 5: Servisga ikki ulanish metod** — `fortschritt.service.ts` importlariga:

```ts
import type { DafDailyGoal } from '@prisma/client';
import { nishonlarRoyxati, type NishonQatori } from '../nishon/nishonlar';
```

va `import { bugunBoshmi } from './maqsad';` ni `import { bugunBoshmi, maqsadniSaqla } from './maqsad';` ga. `async reyting(` metodidan oldin:

```ts
  /** `PATCH .../maqsad` — o'quvchi faqat o'zining maqsadini o'zgartiradi. */
  maqsadniOzgartir(
    studentId: number,
    companyId: number,
    daraja: DafDailyGoal,
  ): Promise<MaqsadHolati> {
    return maqsadniSaqla(this.prisma, studentId, companyId, daraja);
  }

  /** `GET .../nishonlar` — hamma katalog, o'quvchining o'z nishonlari bilan. Yozmaydi. */
  nishonlar(studentId: number): Promise<NishonQatori[]> {
    return nishonlarRoyxati(this.prisma, studentId, new Date());
  }
```

- [ ] **Step 6: DTO va uning testi** — `server/src/daf/dto/maqsad.dto.ts`:

```ts
import { IsEnum } from 'class-validator';
import { DafDailyGoal } from '@prisma/client';

/** `PATCH .../maqsad` tanasi — uch darajadan biri (spec S2 1.3). */
export class MaqsadDto {
  @IsEnum(DafDailyGoal)
  daraja!: DafDailyGoal;
}
```

`server/src/daf/dto/maqsad.dto.spec.ts`:

```ts
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MaqsadDto } from './maqsad.dto';

/** `main.ts` dagi global pipe bilan bir xil sozlama. */
describe('MaqsadDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: MaqsadDto };

  it.each(['YENGIL', 'ORTA', 'JIDDIY'])('qabul qiladi: %s', async (daraja) => {
    await expect(pipe.transform({ daraja }, meta)).resolves.toEqual({ daraja });
  });

  it("noto'g'ri qiymat va bo'sh tana — 400", async () => {
    await expect(pipe.transform({ daraja: 'KATTA' }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(pipe.transform({}, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      pipe.transform({ daraja: 'ORTA', studentId: 7 }, meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

Run: `cd server && npx jest src/daf/dto/maqsad.dto.spec.ts` → PASS.

- [ ] **Step 7: Yiqiladigan kontroller testlari** — `daf-portal.controller.spec.ts`:
  - `describe('DafPortalController — ruxsat'` ichida `// The 16 routes…` izohini `// The 18 routes…` ga, va:

```ts
  it('has the 16 learning routes', () => {
    expect(routes).toHaveLength(16);
  });
```

ni:

```ts
  it('has the 18 learning routes', () => {
    expect(routes).toHaveLength(18);
  });
```

ga almashtirish;
  - fayl oxiriga:

```ts
describe('DafPortalController — maqsad va nishonlar (S2)', () => {
  const maqsad = {
    daraja: 'JIDDIY',
    ball: 160,
    hozir: 20,
    bajarildi: false,
    bosh: false,
  };

  function make() {
    const fortschritt = {
      maqsadniOzgartir: jest.fn(async () => maqsad),
      nishonlar: jest.fn(async () => []),
    };
    const controller = new DafPortalController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      fortschritt as any,
    );
    return { controller, fortschritt };
  }

  it('PATCH maqsad — faqat tokendagi o`quvchiniki', async () => {
    const { controller, fortschritt } = make();
    const r = await controller.patchMaqsad({ daraja: 'JIDDIY' } as any, 55, 1);
    expect(r).toEqual(maqsad);
    expect(fortschritt.maqsadniOzgartir).toHaveBeenCalledWith(55, 1, 'JIDDIY');
  });

  it('GET nishonlar — tokendagi o`quvchi', async () => {
    const { controller, fortschritt } = make();
    await controller.getNishonlar(55);
    expect(fortschritt.nishonlar).toHaveBeenCalledWith(55);
  });

  it('yo`llar va usullar', () => {
    const proto = DafPortalController.prototype as any;
    expect(Reflect.getMetadata('path', proto.patchMaqsad)).toBe('maqsad');
    expect(Reflect.getMetadata('method', proto.patchMaqsad)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata('path', proto.getNishonlar)).toBe('nishonlar');
    expect(Reflect.getMetadata('method', proto.getNishonlar)).toBe(
      RequestMethod.GET,
    );
  });
});
```

Run: `cd server && npx jest src/daf/daf-portal.controller.spec.ts` → FAIL (`patchMaqsad` yo'q, 16 ≠ 18).

- [ ] **Step 8: Kontroller** — `daf-portal.controller.ts` importlari:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
```

va `import { ReytingQueryDto } from './dto/reyting-query.dto';` dan keyin:

```ts
import { MaqsadDto } from './dto/maqsad.dto';
```

`getReyting` metodidan keyin (klassni yopuvchi `}` dan oldin):

```ts

  /**
   * Kunlik maqsad darajasi (spec S2 1.3). `studentId` TOKENDAN — o'quvchi
   * faqat o'z maqsadini o'zgartiradi. Javob — yangi maqsad bugungi ball bilan.
   */
  @Patch('maqsad')
  patchMaqsad(
    @Body() dto: MaqsadDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.fortschritt.maqsadniOzgartir(studentId, companyId, dto.daraja);
  }

  /**
   * Nishonlar katalogi o'quvchining o'z nishonlari bilan (spec S2 2.3).
   * Alohida marshrut — «Darajam» tabi ochilgandagina so'raladi. Hech narsa
   * yozmaydi: nishon seans oxirida beriladi.
   */
  @Get('nishonlar')
  getNishonlar(@CurrentUser('studentId') studentId: number) {
    return this.fortschritt.nishonlar(studentId);
  }
```

- [ ] **Step 9: e2e spec'ga `patch`** — `daf-portal.student-card.e2e.spec.ts`:

```ts
interface Route {
  handler: string;
  verb: 'get' | 'post';
  url: string;
}
```

ni:

```ts
interface Route {
  handler: string;
  verb: 'get' | 'post' | 'patch';
  url: string;
}
```

ga, va:

```ts
    if (verb !== 'get' && verb !== 'post') {
      throw new Error(`${handler}: add ${verb} support to this spec`);
    }
```

ni:

```ts
    if (verb !== 'get' && verb !== 'post' && verb !== 'patch') {
      throw new Error(`${handler}: add ${verb} support to this spec`);
    }
```

ga almashtirish. (`StudentCardGuard` pipe'dan oldin ishlaydi: `PATCH maqsad` tanasiz ham 404, so'rovsiz.)

- [ ] **Step 10: Marshrut siyosati** — `branch-route-policy.ts` dagi blok:

```ts
    routes: [
      'GET /student-portal/lernen/fortschritt',
      'GET /student-portal/lernen/reyting',
    ],
```

ni:

```ts
    routes: [
      'GET /student-portal/lernen/fortschritt',
      'GET /student-portal/lernen/reyting',
      'GET /student-portal/lernen/nishonlar',
      'PATCH /student-portal/lernen/maqsad',
    ],
```

ga almashtirish, va o'sha blokning `reason` satrlari oxiriga (`"there — that would be 'fixing' a considered decision.",` qatorini quyidagi ikki qatorga):

```ts
      "there — that would be 'fixing' a considered decision. " +
      '`GET .../nishonlar` and `PATCH .../maqsad` (S2, ADR-0115) are SELF ' +
      "the ordinary way: the caller's own badges and the caller's own goal " +
      'row (`DafStudentSetting`, keyed on the token `studentId`) — no branch question.',
```

- [ ] **Step 11: Kirish suratiga ikki qator** — `route-access.snapshot.json` da:

```json
  "GET /student-portal/lernen/levels": [
    "Student"
  ],
```

dan keyin:

```json
  "GET /student-portal/lernen/nishonlar": [
    "Student"
  ],
```

va:

```json
  "PATCH /student-portal/name": [
```

dan oldin:

```json
  "PATCH /student-portal/lernen/maqsad": [
    "Student"
  ],
```

- [ ] **Step 12: Testlar va typecheck**

Run: `cd server && npx jest src/daf src/common/permissions src/common/auth && npm run typecheck`
Expected: PASS (e2e: 18 marshrut × 3 holat, hammasi 404/404/403, so'rov 0; manifest va surat mos), typecheck 0 xato.

- [ ] **Step 13: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prettier --write src/daf src/common/auth/branch-route-policy.ts && npx eslint --quiet src/daf src/common/auth/branch-route-policy.ts && git add src/daf src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json && git commit -m "feat(daf): student sets the daily goal and reads the badge list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Mavjud o'quvchilarga bir martalik berish skripti

**Files:**
- Create: `server/scripts/lib/daf-badges-backfill-plan.ts`, `server/scripts/lib/daf-badges-backfill-plan.spec.ts`
- Create: `server/scripts/daf-badges-backfill.ts`

**Interfaces:**
- Consumes: `grantBadges` (Task 3); `NISHON_KATALOGI`, `shartBajarilganlar`, `NishonSharoiti` (Task 2); `parseApplyExpectArgs`, `UsageError` (`scripts/lib/apply-expect-args.ts`); `addDaysToDateStr` (`src/common/date/tashkent.ts`).
- Produces:
  - `seriyaTarixi(tage: string[]): { engUzun: number; yetganKun: Map<number, string> }`
  - `interface OquvchiHolati { studentId: number; companyId: number; tage: string[]; woerter: number; olingan: Set<string> }`
  - `interface BerishRejasi { studentId: number; companyId: number; sharoit: NishonSharoiti; earnedAt: Record<string, Date>; yangi: string[] }`
  - `berishRejasi(o: OquvchiHolati, hozir: Date): BerishRejasi | null`

**Qoida.** Seriya nishonlari uchun `serie` = tarixdagi ENG UZUN ketma-ket kunlar (uzilgan seriya ham nishon bergan), `earnedAt` = N-kunga BIRINCHI marta yetilgan kun (jonli berish ham aynan shu kuni yozgan bo'lardi), Toshkent kuni o'rtasi (07:00Z). So'z nishonlari uchun `earnedAt` = skript vaqti. Yozish faqat `grantBadges` orqali (`ON CONFLICT`), shuning uchun takroriy yurish hech narsa qo'shmaydi.

- [ ] **Step 1: Yiqiladigan rejalovchi testi** — `scripts/lib/daf-badges-backfill-plan.spec.ts`:

```ts
import { berishRejasi, seriyaTarixi } from './daf-badges-backfill-plan';

const HOZIR = new Date('2026-10-19T10:00:00.000Z');
const holat = (o: { tage?: string[]; woerter?: number; olingan?: string[] }) => ({
  studentId: 55,
  companyId: 1,
  tage: o.tage ?? [],
  woerter: o.woerter ?? 0,
  olingan: new Set(o.olingan ?? []),
});

describe('seriyaTarixi', () => {
  it('eng uzun qator va har uzunlikka birinchi yetilgan kun', () => {
    const t = seriyaTarixi([
      '2026-10-11',
      '2026-10-01',
      '2026-10-02',
      '2026-10-02', // takror
      '2026-10-03',
      '2026-10-10',
    ]);
    expect(t.engUzun).toBe(3);
    expect(t.yetganKun.get(1)).toBe('2026-10-01');
    expect(t.yetganKun.get(2)).toBe('2026-10-02');
    expect(t.yetganKun.get(3)).toBe('2026-10-03');
  });

  it("oy chegarasidan o'tadi", () => {
    expect(seriyaTarixi(['2026-09-30', '2026-10-01']).engUzun).toBe(2);
  });

  it("bo'sh tarix", () => {
    expect(seriyaTarixi([]).engUzun).toBe(0);
  });
});

describe('berishRejasi', () => {
  it('uzilgan 7 kunlik seriya ham SERIE_3 va SERIE_7 beradi, o`sha kunlar bilan', () => {
    const tage = [
      '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
      '2026-09-05', '2026-09-06', '2026-09-07',
      '2026-10-19', // hozirgi seriya 1
    ];
    const r = berishRejasi(holat({ tage }), HOZIR)!;
    expect(r.yangi).toEqual(['SERIE_3', 'SERIE_7']);
    expect(r.sharoit).toEqual({ serie: 7, woerter: 0 });
    expect(r.earnedAt).toEqual({
      SERIE_3: new Date('2026-09-03T07:00:00.000Z'),
      SERIE_7: new Date('2026-09-07T07:00:00.000Z'),
    });
  });

  it("so'z nishonlari skript vaqti bilan", () => {
    const r = berishRejasi(holat({ woerter: 150 }), HOZIR)!;
    expect(r.yangi).toEqual(['WOERTER_50', 'WOERTER_150']);
    expect(r.earnedAt).toEqual({ WOERTER_50: HOZIR, WOERTER_150: HOZIR });
  });

  it('allaqachon olingani rejaga kirmaydi; yangi yo`q — null', () => {
    expect(
      berishRejasi(holat({ woerter: 60, olingan: ['WOERTER_50'] }), HOZIR),
    ).toBeNull();
    const r = berishRejasi(
      holat({ woerter: 160, olingan: ['WOERTER_50'] }),
      HOZIR,
    )!;
    expect(r.yangi).toEqual(['WOERTER_150']);
    expect(Object.keys(r.earnedAt)).toEqual(['WOERTER_150']);
  });

  it('2 kunlik tarix va 49 so`z — hech narsa', () => {
    expect(
      berishRejasi(holat({ tage: ['2026-10-18', '2026-10-19'], woerter: 49 }), HOZIR),
    ).toBeNull();
  });
});
```

Run: `cd server && npx jest scripts/lib/daf-badges-backfill-plan.spec.ts` → FAIL (`Cannot find module`).

- [ ] **Step 2: Rejalovchini yozish** — `scripts/lib/daf-badges-backfill-plan.ts`:

```ts
/**
 * Pure planner for the one-time badge backfill (spec S2 2.4). The script
 * only reads, calls this, and hands the plan to `grantBadges`.
 */
import { addDaysToDateStr } from '../../src/common/date/tashkent';
import {
  NISHON_KATALOGI,
  type NishonSharoiti,
  shartBajarilganlar,
} from '../../src/daf/nishon/nishon-katalogi';

/**
 * The longest run of consecutive days, and for every length 1..longest the
 * first day a run reached it. Days are Tashkent `YYYY-MM-DD`, any order,
 * repeats allowed.
 */
export function seriyaTarixi(tage: string[]): {
  engUzun: number;
  yetganKun: Map<number, string>;
} {
  const kunlar = [...new Set(tage)].sort();
  const yetganKun = new Map<number, string>();
  let engUzun = 0;
  let joriy = 0;
  let oldingi: string | null = null;
  for (const kun of kunlar) {
    joriy =
      oldingi !== null && addDaysToDateStr(oldingi, 1) === kun ? joriy + 1 : 1;
    if (!yetganKun.has(joriy)) yetganKun.set(joriy, kun);
    engUzun = Math.max(engUzun, joriy);
    oldingi = kun;
  }
  return { engUzun, yetganKun };
}

export interface OquvchiHolati {
  studentId: number;
  companyId: number;
  /** Days with at least one attempt. */
  tage: string[];
  /** Words answered correctly at least once. */
  woerter: number;
  /** Keys already in DafStudentBadge. */
  olingan: Set<string>;
}

export interface BerishRejasi {
  studentId: number;
  companyId: number;
  /** `serie` = the LONGEST historical run: a broken streak earned its badges too. */
  sharoit: NishonSharoiti;
  earnedAt: Record<string, Date>;
  /** Keys this run will add (catalogue order). */
  yangi: string[];
}

/** Noon in Tashkent (07:00 UTC): the same calendar day in both zones. */
function kunOrtasi(kun: string): Date {
  return new Date(`${kun}T07:00:00.000Z`);
}

export function berishRejasi(
  o: OquvchiHolati,
  hozir: Date,
): BerishRejasi | null {
  const { engUzun, yetganKun } = seriyaTarixi(o.tage);
  const sharoit = { serie: engUzun, woerter: o.woerter };
  const yangi = shartBajarilganlar(sharoit).filter((k) => !o.olingan.has(k));
  if (yangi.length === 0) return null;
  const earnedAt: Record<string, Date> = {};
  for (const n of NISHON_KATALOGI) {
    if (!yangi.includes(n.key)) continue;
    earnedAt[n.key] =
      n.tur === 'SERIE' ? kunOrtasi(yetganKun.get(n.chegara)!) : hozir;
  }
  return {
    studentId: o.studentId,
    companyId: o.companyId,
    sharoit,
    earnedAt,
    yangi,
  };
}
```

Run: `cd server && npx jest scripts/lib/daf-badges-backfill-plan.spec.ts` → PASS.

- [ ] **Step 3: Skript** — `scripts/daf-badges-backfill.ts`:

```ts
/**
 * One-time badge backfill for students who practised before S2 (spec S2 2.4,
 * ADR-0115). Run once after the deploy that applies 20261018220000:
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/daf-badges-backfill.ts \
 *     [--expect=<N>] [--apply]
 *
 * Dry run by default, on a read-only connection (checked; it stops
 * otherwise): it lists every badge it would give and the count N. Then
 * `--apply --expect=<N>`: a fresh scan must give the same N, else nothing is
 * written. Writes go through `grantBadges` only (ON CONFLICT DO NOTHING), so
 * a repeat adds nothing. A student whose write fails is logged; the run goes
 * on and exits non-zero. Importing this file runs nothing.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { grantBadges } from '../src/daf/nishon/nishon-berish';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';
import {
  berishRejasi,
  type BerishRejasi,
  type OquvchiHolati,
} from './lib/daf-badges-backfill-plan';

const USAGE =
  'Usage: daf-badges-backfill.ts [--expect=<N>] [--apply]  (--apply requires --expect=<N>)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function scan(
  prisma: PrismaService,
  hozir: Date,
): Promise<BerishRejasi[]> {
  const [kunlar, sozlar, olinganlar] = await Promise.all([
    prisma.$queryRaw<{ studentId: number; companyId: number; tage: string[] }[]>`
      SELECT "studentId", MIN("companyId")::int AS "companyId",
             array_agg(DISTINCT to_char(day, 'YYYY-MM-DD')) AS tage
      FROM "DafStudentDay" WHERE attempts > 0
      GROUP BY "studentId"`,
    prisma.$queryRaw<{ studentId: number; companyId: number; n: number }[]>`
      SELECT "studentId", MIN("companyId")::int AS "companyId", COUNT(*)::int AS n
      FROM "DafLexemeState" WHERE "correctCount" >= 1
      GROUP BY "studentId"`,
    prisma.dafStudentBadge.findMany({ select: { studentId: true, key: true } }),
  ]);

  const holat = new Map<number, OquvchiHolati>();
  const ol = (studentId: number, companyId: number): OquvchiHolati => {
    let h = holat.get(studentId);
    if (!h) {
      h = { studentId, companyId, tage: [], woerter: 0, olingan: new Set() };
      holat.set(studentId, h);
    }
    return h;
  };
  for (const k of kunlar) ol(k.studentId, k.companyId).tage = k.tage;
  for (const s of sozlar) ol(s.studentId, s.companyId).woerter = s.n;
  for (const b of olinganlar) holat.get(b.studentId)?.olingan.add(b.key);

  return [...holat.values()]
    .sort((a, b) => a.studentId - b.studentId)
    .map((h) => berishRejasi(h, hozir))
    .filter((r): r is BerishRejasi => r !== null);
}

const count = (rejalar: BerishRejasi[]) =>
  rejalar.reduce((s, r) => s + r.yangi.length, 0);

async function main() {
  const { apply: APPLY, expect } = parseApplyExpectArgs(
    process.argv.slice(2),
    USAGE,
  );
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  try {
    printHeader(`DaF badges backfill — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const hozir = new Date();
    const rejalar = await scan(prisma, hozir);
    for (const r of rejalar) {
      for (const key of r.yangi) {
        console.log(
          `badge\t${r.studentId}\t${key}\t${r.earnedAt[key].toISOString()}`,
        );
      }
    }
    const n = count(rejalar);
    console.log(`\nstudents: ${rejalar.length}`);
    console.log(`badges: ${n}`);
    if (!APPLY) return;

    if (expect !== n) {
      throw new UsageError(
        `Scan found ${n} badge(s) but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    const again = await scan(prisma, hozir);
    if (count(again) !== n) {
      throw new UsageError(
        `A second scan found ${count(again)} badge(s), not ${n}. Nothing was written; run the dry run again.`,
      );
    }

    let berildi = 0;
    let failed = 0;
    for (const r of again) {
      try {
        const yangi = await grantBadges(
          prisma,
          r.studentId,
          r.companyId,
          r.sharoit,
          r.earnedAt,
        );
        berildi += yangi.length;
      } catch (err) {
        failed += 1;
        console.error(
          `FAILED ${r.studentId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    // A session finishing meanwhile may have given one already: fewer is fine.
    console.log(`Given ${berildi} of ${n}. Failed students: ${failed}.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof UsageError ? err.message : err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Sinov bazasida ishga tushirish** (Task 1 Step 6 dagi `$S1_DB`)

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/daf-badges-backfill.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/daf-badges-backfill.ts --apply
```

Expected: birinchisi `badges: N` (yuklama ma'lumoti bo'lmasa 0), ikkinchisi `--apply requires --expect=<N>…` bilan to'xtaydi, hech narsa yozilmaydi. Keyin `--apply --expect=<N>` (N — dry run bergan son) → `Given N of N`; uchinchi marta dry run → `badges: 0`.

- [ ] **Step 5: Qorovul va rejalovchi testlari**

Run: `cd server && npx jest scripts/lib/daf-badges-backfill-plan.spec.ts src/daf/nishon`
Expected: PASS (skript `grantBadges` orqali yozadi — qorovul uni ko'rmaydi).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npx prettier --write scripts/daf-badges-backfill.ts scripts/lib/daf-badges-backfill-plan.ts scripts/lib/daf-badges-backfill-plan.spec.ts && npx eslint --quiet scripts/daf-badges-backfill.ts scripts/lib/daf-badges-backfill-plan.ts && git add scripts/daf-badges-backfill.ts scripts/lib/daf-badges-backfill-plan.ts scripts/lib/daf-badges-backfill-plan.spec.ts && git commit -m "feat(daf): one-time badge backfill from the history of each student

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ilova — tiplar, so'rovlar, sof yordamchilar

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts` (`SeansNatijasi` 122-132, `Fortschritt` 296-313)
- Modify: `client/src/components/student-portal/lernen/queries.ts`
- Create: `client/src/components/student-portal/lernen/maqsad.ts`, `maqsad.test.ts`
- Create: `client/src/components/student-portal/lernen/nishon.ts`, `nishon.test.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/natija-xabari.ts`, `natija-xabari.test.ts`

**Interfaces:**
- Consumes: server javoblari (Task 4–6).
- Produces:
  - `type MaqsadDarajasi = "YENGIL" | "ORTA" | "JIDDIY"`; `interface Maqsad { daraja; ball; hozir; bajarildi; bosh }`; `Fortschritt.maqsad?: Maqsad`; `SeansNatijasi.maqsad?: { ball; hozir; bajarildi; yangiBajarildi }`; `SeansNatijasi.yangiNishonlar?: string[]`; `interface NishonQatori { key; tur: "SERIE" | "WOERTER"; chegara; olingan: string | null; qoldi: number | null }`
  - `useMaqsadOzgartir(): UseMutationResult<Maqsad, unknown, MaqsadDarajasi>`, `useNishonlar(): UseQueryResult<NishonQatori[]>` (kalit `["lernen", "nishonlar"]`)
  - `MAQSAD_VARIANTLARI: { daraja: MaqsadDarajasi; nomi: string; ball: number; seans: string }[]`; `maqsadKartasi(m: Maqsad): { holat: "jarayon" | "bajarildi" | "bosh"; foiz: number; sarlavha: string; ballMatni: string; darajaNomi: string }`
  - `nishonNomi(key: string): string`; `nishonQoldi(q: NishonQatori): string | null`
  - `natijaQatorlari(n)` → `{ ball; serie; orin; maqsad: string | null; nishonlar: string[] }`

- [ ] **Step 1: Tiplar** — `types.ts`, `SeansNatijasi` ichida `orin: {…};` dan keyin:

```ts
  /** Kunlik maqsad; `yangiBajarildi` — shu seans uni kesib o'tdi. Eski server javobida yo'q. */
  maqsad?: { ball: number; hozir: number; bajarildi: boolean; yangiBajarildi: boolean };
  /** Shu seans bergan nishon kalitlari. */
  yangiNishonlar?: string[];
```

`Fortschritt` dan oldin:

```ts
export type MaqsadDarajasi = "YENGIL" | "ORTA" | "JIDDIY";

/** Kunlik maqsad — server hisoblaydi; `bosh` — bugun qiladigan mashq qolmagan. */
export interface Maqsad {
  daraja: MaqsadDarajasi;
  ball: number;
  hozir: number;
  bajarildi: boolean;
  bosh: boolean;
}

/** `GET .../nishonlar` qatori: `olingan` — ISO sana yoki `null`, `qoldi` — chegaragacha. */
export interface NishonQatori {
  key: string;
  tur: "SERIE" | "WOERTER";
  chegara: number;
  olingan: string | null;
  qoldi: number | null;
}
```

`Fortschritt` ichida `faelligeWoerter: number;` dan keyin:

```ts
  /** Kunlik maqsad (S2). Eski server javobida yo'q — karta chizilmaydi. */
  maqsad?: Maqsad;
```

- [ ] **Step 2: Yiqiladigan yordamchi testlari** — `lernen/maqsad.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { MAQSAD_VARIANTLARI, maqsadKartasi } from "./maqsad";

const m = (o: Partial<Parameters<typeof maqsadKartasi>[0]>) => ({
  daraja: "ORTA" as const,
  ball: 80,
  hozir: 40,
  bajarildi: false,
  bosh: false,
  ...o,
});

describe("MAQSAD_VARIANTLARI", () => {
  // The client cannot import server code; the numbers must still be the server's.
  it("ballar serverdagi MAQSAD_BALL bilan bir xil", () => {
    const src = readFileSync(
      join(__dirname, "../../../../../server/src/daf/uebung/punkte.ts"),
      "utf8",
    );
    const hit = /YENGIL:\s*(\d+),\s*ORTA:\s*(\d+),\s*JIDDIY:\s*(\d+)/.exec(src);
    expect(hit).not.toBeNull();
    expect(MAQSAD_VARIANTLARI.map((v) => v.ball)).toEqual(
      hit!.slice(1).map(Number),
    );
  });

  it("uch daraja, o'zbekcha nomlar", () => {
    expect(MAQSAD_VARIANTLARI.map((v) => [v.nomi, v.seans])).toEqual([
      ["Yengil", "≈ yarim seans"],
      ["O'rta", "≈ bir seans"],
      ["Jiddiy", "≈ ikki seans"],
    ]);
  });
});

describe("maqsadKartasi", () => {
  it("jarayon: foiz va «40 / 80 ball»", () => {
    expect(maqsadKartasi(m({}))).toEqual({
      holat: "jarayon",
      foiz: 50,
      sarlavha: "Bugungi maqsad",
      ballMatni: "40 / 80 ball",
      darajaNomi: "O'rta",
    });
  });

  it("bajarildi: halqa to'liq", () => {
    expect(maqsadKartasi(m({ hozir: 130, bajarildi: true }))).toMatchObject({
      holat: "bajarildi",
      foiz: 100,
      sarlavha: "Maqsad bajarildi",
      ballMatni: "130 / 80 ball",
    });
  });

  it("bosh: halqa to'liq, «Bugun mashq qolmadi»", () => {
    expect(maqsadKartasi(m({ hozir: 0, bajarildi: true, bosh: true }))).toMatchObject({
      holat: "bosh",
      foiz: 100,
      sarlavha: "Bugun mashq qolmadi",
    });
  });

  it("maqsad bajarilgan bo'lsa bosh ham «Maqsad bajarildi» deydi", () => {
    expect(maqsadKartasi(m({ hozir: 90, bajarildi: true, bosh: true })).holat).toBe(
      "bajarildi",
    );
  });
});
```

`lernen/nishon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nishonNomi, nishonQoldi } from "./nishon";

const q = (o: Partial<Parameters<typeof nishonQoldi>[0]>) => ({
  key: "SERIE_14",
  tur: "SERIE" as const,
  chegara: 14,
  olingan: null,
  qoldi: 4,
  ...o,
});

describe("nishonNomi", () => {
  it("kalitdan nom", () => {
    expect(nishonNomi("SERIE_14")).toBe("14 kun ketma-ket");
    expect(nishonNomi("WOERTER_150")).toBe("150 ta so'z");
    expect(nishonNomi("WOERTER_592")).toBe("A1 so'zlarining hammasi");
  });

  it("noma'lum kalit o'zgarmaydi", () => {
    expect(nishonNomi("LIGA_1")).toBe("LIGA_1");
  });
});

describe("nishonQoldi", () => {
  it("olinmagan: yana N kun / N ta so'z", () => {
    expect(nishonQoldi(q({}))).toBe("yana 4 kun");
    expect(nishonQoldi(q({ key: "WOERTER_150", tur: "WOERTER", chegara: 150, qoldi: 30 }))).toBe(
      "yana 30 ta so'z",
    );
  });

  it("sharti bajarilgan, hali berilmagan", () => {
    expect(nishonQoldi(q({ qoldi: 0 }))).toBe("Keyingi mashqda beriladi");
  });

  it("olingan — matn yo'q", () => {
    expect(nishonQoldi(q({ olingan: "2026-10-18T07:00:00.000Z", qoldi: null }))).toBeNull();
  });
});
```

`natija-xabari.test.ts`: importga `natijaQatorlari` allaqachon bor. Testdagi:

```ts
    expect(natijaQatorlari(null)).toEqual({ ball: null, serie: null, orin: null });
```

ni:

```ts
    expect(natijaQatorlari(null)).toEqual({
      ball: null,
      serie: null,
      orin: null,
      maqsad: null,
      nishonlar: [],
    });
```

ga,

```ts
    expect(natijaQatorlari(base)).toEqual({
      ball: 50,
      serie: 4,
      orin: "Guruhda 1-o'rin — 2 pog'ona ko'tarildingiz",
    });
```

ni:

```ts
    expect(natijaQatorlari(base)).toEqual({
      ball: 50,
      serie: 4,
      orin: "Guruhda 1-o'rin — 2 pog'ona ko'tarildingiz",
      maqsad: null,
      nishonlar: [],
    });
```

ga almashtirish va `describe("natijaQatorlari"` oxiriga:

```ts
  it("maqsad faqat shu seansda bajarilganda", () => {
    const yangi = { ball: 80, hozir: 130, bajarildi: true, yangiBajarildi: true };
    expect(natijaQatorlari({ ...base, maqsad: yangi }).maqsad).toBe(
      "Kunlik maqsad bajarildi — 130 / 80",
    );
    expect(
      natijaQatorlari({ ...base, maqsad: { ...yangi, yangiBajarildi: false } }).maqsad,
    ).toBeNull();
    expect(
      natijaQatorlari({
        ...base,
        maqsad: { ball: 80, hozir: 30, bajarildi: false, yangiBajarildi: false },
      }).maqsad,
    ).toBeNull();
  });

  it("har yangi nishon — alohida qator", () => {
    expect(
      natijaQatorlari({ ...base, yangiNishonlar: ["SERIE_14", "WOERTER_50"] }).nishonlar,
    ).toEqual(["Yangi nishon: 14 kun ketma-ket", "Yangi nishon: 50 ta so'z"]);
  });
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/maqsad.test.ts src/components/student-portal/lernen/nishon.test.ts src/components/student-portal/lernen/uebung/natija-xabari.test.ts`
Expected: FAIL (`./maqsad`, `./nishon` topilmaydi; `maqsad`, `nishonlar` maydonlari yo'q).

- [ ] **Step 3: Yordamchilarni yozish** — `lernen/maqsad.ts`:

```ts
import type { Maqsad, MaqsadDarajasi } from "./types";

/**
 * Oynachadagi uch daraja (spec S2 3.1). Ballar serverdagi `MAQSAD_BALL`
 * (`server/src/daf/uebung/punkte.ts`) — `maqsad.test.ts` ularni o'sha fayldan
 * o'qib solishtiradi.
 */
export const MAQSAD_VARIANTLARI: {
  daraja: MaqsadDarajasi;
  nomi: string;
  ball: number;
  seans: string;
}[] = [
  { daraja: "YENGIL", nomi: "Yengil", ball: 40, seans: "≈ yarim seans" },
  { daraja: "ORTA", nomi: "O'rta", ball: 80, seans: "≈ bir seans" },
  { daraja: "JIDDIY", nomi: "Jiddiy", ball: 160, seans: "≈ ikki seans" },
];

export type MaqsadHolatBelgisi = "jarayon" | "bajarildi" | "bosh";

/**
 * Halqa kartasi nimani aytadi — serverning `bajarildi`/`bosh` bayroqlaridan.
 * Ball bilan bajarilgan maqsad «Maqsad bajarildi» deydi, `bosh` bo'lsa ham.
 */
export function maqsadKartasi(m: Maqsad): {
  holat: MaqsadHolatBelgisi;
  foiz: number;
  sarlavha: string;
  ballMatni: string;
  darajaNomi: string;
} {
  const holat: MaqsadHolatBelgisi = !m.bajarildi
    ? "jarayon"
    : m.hozir >= m.ball
      ? "bajarildi"
      : "bosh";
  const sarlavha = {
    jarayon: "Bugungi maqsad",
    bajarildi: "Maqsad bajarildi",
    bosh: "Bugun mashq qolmadi",
  }[holat];
  return {
    holat,
    foiz:
      holat === "jarayon"
        ? Math.min(100, Math.round((m.hozir / m.ball) * 100))
        : 100,
    sarlavha,
    ballMatni: `${m.hozir} / ${m.ball} ball`,
    darajaNomi:
      MAQSAD_VARIANTLARI.find((v) => v.daraja === m.daraja)?.nomi ?? "O'rta",
  };
}
```

`lernen/nishon.ts`:

```ts
import type { NishonQatori } from "./types";

/**
 * Nishon nomi KALITDAN quriladi (serverda matn yo'q, spec S2 2.3):
 * `SERIE_14` → «14 kun ketma-ket», `WOERTER_150` → «150 ta so'z».
 */
export function nishonNomi(key: string): string {
  const m = /^(SERIE|WOERTER)_(\d+)$/.exec(key);
  if (!m) return key;
  const n = Number(m[2]);
  if (m[1] === "SERIE") return `${n} kun ketma-ket`;
  return n === 592 ? "A1 so'zlarining hammasi" : `${n} ta so'z`;
}

/** Olinmagan nishonning ostidagi yozuv; olinganda `null`. */
export function nishonQoldi(q: NishonQatori): string | null {
  if (q.olingan) return null;
  if (!q.qoldi) return "Keyingi mashqda beriladi";
  return q.tur === "SERIE" ? `yana ${q.qoldi} kun` : `yana ${q.qoldi} ta so'z`;
}
```

`natija-xabari.ts` — importlarga `import { nishonNomi } from "../nishon";` va `natijaQatorlari` ni butunlay:

```ts
/**
 * The end screen's lines, straight from the server's `natija` (spec §5,
 * S2 §3.2): points only when above 0, the streak only on the day's first
 * practice, a rank only when it moved, the daily goal only when THIS session
 * reached it (an unmet goal is noise — the ring is on the path), one line per
 * new badge. The group speaks first; a student with no group gets the centre.
 */
export function natijaQatorlari(n: SeansNatijasi | null | undefined): {
  ball: number | null;
  serie: number | null;
  orin: string | null;
  maqsad: string | null;
  nishonlar: string[];
} {
  if (!n) return { ball: null, serie: null, orin: null, maqsad: null, nishonlar: [] };
  const orin = n.orin.gruppe
    ? orinXabari(n.orin.gruppe.oldin, n.orin.gruppe.hozir)
    : orinXabari(n.orin.zentrum.oldin, n.orin.zentrum.hozir, "Markazda");
  return {
    ball: n.punkte > 0 ? n.punkte : null,
    serie: n.serieYangi ? n.serie : null,
    orin,
    maqsad: n.maqsad?.yangiBajarildi
      ? `Kunlik maqsad bajarildi — ${n.maqsad.hozir} / ${n.maqsad.ball}`
      : null,
    nishonlar: (n.yangiNishonlar ?? []).map((k) => `Yangi nishon: ${nishonNomi(k)}`),
  };
}
```

- [ ] **Step 4: So'rovlar** — `queries.ts` tiplari importiga `Maqsad`, `MaqsadDarajasi`, `NishonQatori` qo'shish. `useAbschluss` dagi:

```ts
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
      // Takrorlash so'rovi `staleTime: Infinity` bilan abadiy keshda
```

ni:

```ts
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
      // Seans oxirida yangi nishon berilgan bo'lishi mumkin.
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
      // Takrorlash so'rovi `staleTime: Infinity` bilan abadiy keshda
```

ga, `useWiederholungAbschluss` dagi:

```ts
      void qc.invalidateQueries({ queryKey: ["lernen", "fortschritt"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
    },
  });
}
```

ni:

```ts
      void qc.invalidateQueries({ queryKey: ["lernen", "fortschritt"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "reyting"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
    },
  });
}
```

ga almashtirish va `useReyting` dan keyin:

```ts
/**
 * Kunlik maqsad darajasini saqlaydi. Javob — yangi maqsad bugungi ball bilan;
 * u yo'l tepasidagi keshga darrov yoziladi (halqa qayta so'rovsiz o'zgaradi).
 */
export function useMaqsadOzgartir() {
  const qc = useQueryClient();
  return useMutation<Maqsad, unknown, MaqsadDarajasi>({
    mutationFn: (daraja) =>
      api.patch(`${BASE}/maqsad`, { daraja }).then((r) => r.data),
    onSuccess: (maqsad) => {
      qc.setQueryData<Fortschritt>(["lernen", "fortschritt"], (old) =>
        old ? { ...old, maqsad } : old,
      );
    },
  });
}

/** «Darajam» tabidagi nishonlar — faqat shu bo'lim ko'ringanda so'raladi. */
export function useNishonlar() {
  return useQuery<NishonQatori[]>({
    queryKey: ["lernen", "nishonlar"],
    queryFn: () => api.get(`${BASE}/nishonlar`).then((r) => r.data),
  });
}
```

- [ ] **Step 5: Tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/client && npx vitest run src/components/student-portal/lernen && npx tsc --noEmit -p . && npx eslint src/components/student-portal/lernen
```

Expected: vitest PASS, tsc 0 xato, eslint 0 error.

- [ ] **Step 6: Commit** (client fayllariga prettier YO'Q)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2 && git add client/src/components/student-portal/lernen/types.ts client/src/components/student-portal/lernen/queries.ts client/src/components/student-portal/lernen/maqsad.ts client/src/components/student-portal/lernen/maqsad.test.ts client/src/components/student-portal/lernen/nishon.ts client/src/components/student-portal/lernen/nishon.test.ts client/src/components/student-portal/lernen/uebung/natija-xabari.ts client/src/components/student-portal/lernen/uebung/natija-xabari.test.ts && git commit -m "feat(lernen): goal and badge types, queries and texts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ilova — maqsad kartasi, natija qatorlari, «Nishonlarim»

**Files:**
- Create: `client/src/components/student-portal/lernen/yol/maqsad-kartasi.tsx`, `maqsad-kartasi.test.ts`
- Modify: `client/src/components/student-portal/lernen/yol/yol-tepasi.tsx` (importlar 1-9, qaytarish 94-122)
- Modify: `client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx` (190-193, 243-247)
- Create: `client/src/components/student-portal/lernen/reyting/nishonlarim.tsx`, `nishonlarim.test.ts`
- Modify: `client/src/components/student-portal/lernen/reyting/reyting-ekrani.tsx` (`DarajamTab` 124-153)

**Interfaces:**
- Consumes: `Maqsad`, `NishonQatori`, `useMaqsadOzgartir`, `useNishonlar`, `MAQSAD_VARIANTLARI`, `maqsadKartasi`, `nishonNomi`, `nishonQoldi`, `natijaQatorlari` (Task 8); Lumio `ProgressRing`, `BottomSheet`, `Card`, `LoadingCards`, `Section` (`../../lumio`); `loadState`, `LoadFailed`.
- Produces: `MaqsadKartasi({ maqsad }: { maqsad: Maqsad })`, `Nishonlarim()`.

- [ ] **Step 1: Yiqiladigan komponent testlari** — `yol/maqsad-kartasi.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { MaqsadKartasi } from "./maqsad-kartasi";
import type { Maqsad } from "../types";

function render(maqsad: Maqsad): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MaqsadKartasi, { maqsad }),
    ),
  );
}

const asos: Maqsad = { daraja: "ORTA", ball: 80, hozir: 40, bajarildi: false, bosh: false };

describe("MaqsadKartasi", () => {
  it("jarayon: «Bugungi maqsad», «40 / 80 ball», daraja va o'zgartirish", () => {
    const html = render(asos);
    expect(html).toContain("Bugungi maqsad");
    expect(html).toContain("40 / 80 ball");
    expect(html).toContain("O&#x27;rta · o&#x27;zgartirish");
    expect(html).not.toContain("text-success");
  });

  it("bajarildi: muvaffaqiyat rangi va «Maqsad bajarildi»", () => {
    const html = render({ ...asos, hozir: 90, bajarildi: true });
    expect(html).toContain("Maqsad bajarildi");
    expect(html).toContain("text-success");
  });

  it("bosh: «Bugun mashq qolmadi»", () => {
    const html = render({ ...asos, hozir: 0, bajarildi: true, bosh: true });
    expect(html).toContain("Bugun mashq qolmadi");
  });

  it("karta — bitta tugma, oynacha yopiq", () => {
    const html = render(asos);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("≈ ikki seans");
  });
});
```

`reyting/nishonlarim.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { Nishonlarim } from "./nishonlarim";
import type { NishonQatori } from "../types";

function render(rows: NishonQatori[]): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "nishonlar"], rows);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Nishonlarim)),
  );
}

describe("Nishonlarim", () => {
  it("olingan to'la, olinmagan chiziqli ramkada «yana N»", () => {
    const html = render([
      { key: "SERIE_3", tur: "SERIE", chegara: 3, olingan: "2026-10-18T07:00:00.000Z", qoldi: null },
      { key: "SERIE_7", tur: "SERIE", chegara: 7, olingan: null, qoldi: 3 },
      { key: "WOERTER_50", tur: "WOERTER", chegara: 50, olingan: null, qoldi: 12 },
    ]);
    expect(html).toContain("Nishonlarim");
    expect(html).toContain("3 kun ketma-ket");
    expect(html).toContain("yana 3 kun");
    expect(html).toContain("yana 12 ta so&#x27;z");
    expect(html.match(/border-dashed/g)).toHaveLength(2);
  });

  it("ekranda inglizcha so'z yo'q", () => {
    const html = render([
      { key: "SERIE_3", tur: "SERIE", chegara: 3, olingan: null, qoldi: 1 },
    ]);
    expect(html).not.toMatch(/badge|streak|serie\b/i);
  });
});
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/yol/maqsad-kartasi.test.ts src/components/student-portal/lernen/reyting/nishonlarim.test.ts`
Expected: FAIL (modullar topilmaydi).

- [ ] **Step 2: Maqsad kartasi** — `yol/maqsad-kartasi.tsx`:

```tsx
"use client";

import * as React from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { BottomSheet, ProgressRing } from "../../lumio";
import { useMaqsadOzgartir } from "../queries";
import { MAQSAD_VARIANTLARI, maqsadKartasi } from "../maqsad";
import type { Maqsad } from "../types";
import { qisqaRaqam } from "./yol-tuzilishi";

/**
 * Yo'l tepasidagi kunlik maqsad (spec S2 3.1): halqa (bugungi / maqsad),
 * sarlavha, ball va daraja nomi. Kartaning o'zi — yagona tugma: bosilsa
 * pastdan oynacha, uch daraja; tanlov darrov saqlanadi va oynacha yopiladi.
 * Bajarilmagan maqsad uchun jazo yo'q — halqa shunchaki to'lmaydi.
 */
export function MaqsadKartasi({ maqsad }: { maqsad: Maqsad }) {
  const [ochiq, setOchiq] = React.useState(false);
  const ozgartir = useMaqsadOzgartir();
  const k = maqsadKartasi(maqsad);
  const tolgan = k.holat !== "jarayon";

  return (
    <>
      <button
        type="button"
        onClick={() => setOchiq(true)}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left shadow-lumio-sm transition-transform active:translate-y-[1px]"
      >
        <ProgressRing
          value={k.foiz}
          size={52}
          stroke={7}
          className={tolgan ? "text-success" : "text-coral-500"}
          label={qisqaRaqam(maqsad.hozir)}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-extrabold text-ink-900">
            {k.sarlavha}
          </span>
          <span className="block text-sm font-semibold text-ink-600">{k.ballMatni}</span>
          <span className="block text-xs font-semibold text-ink-500">
            {k.darajaNomi} · o&apos;zgartirish
          </span>
        </span>
      </button>

      <BottomSheet open={ochiq} onOpenChange={setOchiq} title="Kunlik maqsad">
        <div className="space-y-2">
          {MAQSAD_VARIANTLARI.map((v) => {
            const tanlangan = v.daraja === maqsad.daraja;
            return (
              <button
                key={v.daraja}
                type="button"
                aria-pressed={tanlangan}
                disabled={ozgartir.isPending}
                onClick={() =>
                  ozgartir.mutate(v.daraja, {
                    onSuccess: () => setOchiq(false),
                    onError: (err) =>
                      toast.error(getErrorMessage(err, "Saqlashda xatolik")),
                  })
                }
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-card border px-4 py-3 text-left transition-colors disabled:opacity-50",
                  tanlangan ? "border-coral-500 bg-coral-500/8" : "border-line bg-surface",
                )}
              >
                <span>
                  <span className="block font-display font-extrabold text-ink-900">{v.nomi}</span>
                  <span className="block text-xs font-semibold text-ink-500">{v.seans}</span>
                </span>
                <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
                  {v.ball} ball
                </span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
```

`yol-tepasi.tsx` — importlarga `import { MaqsadKartasi } from "./maqsad-kartasi";`, komponent JSDoc'iga bitta jumla: «Ostida kunlik maqsad kartasi (S2) — to'rt belgidan keyingi qator, telefonda to'liq kenglikda.» Qaytarishdagi:

```tsx
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Belgi
```

ni:

```tsx
  return (
    <div className="space-y-3">
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Belgi
```

ga, va oxiridagi:

```tsx
        ariaLabel={`Reyting: ${data.wochePlatzZentrum}-o'rin`}
      />
    </div>
  );
}
```

ni:

```tsx
        ariaLabel={`Reyting: ${data.wochePlatzZentrum}-o'rin`}
      />
    </div>
    {data.maqsad ? (
      <div className="sm:max-w-md">
        <MaqsadKartasi maqsad={data.maqsad} />
      </div>
    ) : null}
    </div>
  );
}
```

ga almashtirish (eski server javobida `maqsad` yo'q — karta chizilmaydi).

- [ ] **Step 3: Natija ekrani** — `natija-ekrani.tsx` da:

```tsx
  const yutuqlarBormi =
    qator.ball != null || qator.serie != null || qator.orin != null;
```

ni:

```tsx
  const yutuqlarBormi =
    qator.ball != null ||
    qator.serie != null ||
    qator.orin != null ||
    qator.maqsad != null ||
    qator.nishonlar.length > 0;
```

ga, va:

```tsx
            {qator.orin ? (
              <p className="w-full text-sm font-semibold text-ink-700">
                {qator.orin}
              </p>
            ) : null}
```

ni:

```tsx
            {qator.orin ? (
              <p className="w-full text-sm font-semibold text-ink-700">
                {qator.orin}
              </p>
            ) : null}
            {qator.maqsad ? (
              <p className="w-full text-sm font-bold text-success">{qator.maqsad}</p>
            ) : null}
            {qator.nishonlar.map((matn) => (
              <p key={matn} className="w-full text-sm font-bold text-ink-900">
                {matn}
              </p>
            ))}
```

ga almashtirish (tartib: ball → seriya → o'rin → maqsad → nishonlar; xato so'zlar ro'yxati keyingi kartada, o'zgarmaydi).

- [ ] **Step 4: «Nishonlarim»** — `reyting/nishonlarim.tsx`:

```tsx
"use client";

import { BookOpen, Fire } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LoadingCards, Section } from "../../lumio";
import { useNishonlar } from "../queries";
import { nishonNomi, nishonQoldi } from "../nishon";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/**
 * «Darajam» tabi ichidagi nishonlar (spec S2 3.3). Alohida tab emas: 390px
 * da uch tab ham tor. So'rov faqat shu bo'lim chizilganda ketadi. Olingan
 * nishon to'la rangda, olinmagani chiziqli ramkada «yana N».
 */
export function Nishonlarim() {
  const query = useNishonlar();
  const { data } = query;

  return (
    <Section title="Nishonlarim">
      {loadState(query) === "loading" ? (
        <LoadingCards count={2} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.map((n) => {
            const olingan = n.olingan != null;
            const Icon = n.tur === "SERIE" ? Fire : BookOpen;
            return (
              <li
                key={n.key}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-card px-2 py-3 text-center",
                  olingan
                    ? n.tur === "SERIE"
                      ? "bg-coral-500 text-white"
                      : "bg-teal-500 text-white"
                    : "border-2 border-dashed border-line text-ink-500",
                )}
              >
                <Icon size={24} weight={olingan ? "fill" : "bold"} aria-hidden />
                <span className="font-display text-sm font-extrabold">{nishonNomi(n.key)}</span>
                {olingan ? null : (
                  <span className="text-xs font-semibold">{nishonQoldi(n)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
```

(`Section` — `lumio/section.tsx`, `title?: string` sarlavhani `<h2>` sifatida chizadi.)

`reyting-ekrani.tsx` — importlarga `import { Nishonlarim } from "./nishonlarim";`, `DarajamTab` dagi:

```tsx
  return (
    <Card className="space-y-6 text-center">
```

ni:

```tsx
  return (
    <div className="space-y-4">
    <Card className="space-y-6 text-center">
```

ga, va uning oxiridagi:

```tsx
      )}
    </Card>
  );
}
```

ni:

```tsx
      )}
    </Card>
    <Nishonlarim />
    </div>
  );
}
```

ga almashtirish; `DarajamTab` JSDoc'i oxiriga: «Ostida «Nishonlarim» (S2) — o'z so'rovi bilan, faqat shu tab ochilganda.»

- [ ] **Step 5: Tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/client && npx vitest run src/components/student-portal && npx tsc --noEmit -p . && npx eslint src/components/student-portal/lernen
```

Expected: vitest PASS (shu jumladan `student-portal-load-states.test.ts` — reyting ekrani standart «Guruhim» tabida ochiladi, `nishonlar` so'ralmaydi), tsc 0 xato, eslint 0 error.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2 && git add client/src/components/student-portal/lernen && git commit -m "feat(lernen): daily goal ring, end-screen goal and badge lines, badge list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Yuklama sinovi qayta (S1 sinovi + yangi so'rovlar)

**Files:**
- Modify: `server/scripts/load/daf-yuklama-olchov.ts`
- Modify: `docs/superpowers/specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md` (yangi §8)

**Interfaces:**
- Consumes: `FortschrittService.uebersicht/seansNatijasi/nishonlar` (Task 4–6), `grantBadges` (Task 3), `NISHON_KATALOGI` (Task 2).

**Nima o'lchanadi.** S1 jadvali (fortschritt, ikki reyting, `recordAttempt`, `seansNatijasi`) + `nishonlar`. Sinov bazasida `DafLexemeState` qatori yo'q, ya'ni hamma o'quvchida `faelligeWoerter == 0` — `fortschritt` har chaqiruvda «ochiq dars» so'rovini ham o'qiydi (eng yomon yo'l). Shu so'rov haqiqiy reja bilan o'lchansin deb A1 kontenti tushiriladi.

- [ ] **Step 1: O'lchovni kengaytirish** — `daf-yuklama-olchov.ts`:

Importlarga:

```ts
import { grantBadges } from '../../src/daf/nishon/nishon-berish';
import { NISHON_KATALOGI } from '../../src/daf/nishon/nishon-katalogi';
```

`LIMIT` ga `seansNatijasi: 300,` dan keyin `nishonlar: 200,`.

`const students = await prisma.$queryRaw…` dan keyin (raundlardan oldin):

```ts
  // S2: every other student has chosen a goal, so the setting CTE reads rows.
  await prisma.$executeRaw`
    INSERT INTO "DafStudentSetting" ("studentId", "companyId", "dailyGoal", "updatedAt")
    SELECT id, "companyId", 'JIDDIY', now() FROM "Student"
    WHERE "deletedAt" IS NULL AND id % 2 = 0
    ON CONFLICT ("studentId") DO NOTHING`;
```

Amallar ro'yxatiga `seansNatijasi` dan keyin:

```ts
      [
        'nishonlar',
        (s: (typeof students)[0]) => svc.nishonlar(s.id),
      ],
```

`console.log('same-row concurrency', …)` qatoridan keyin:

```ts
  // S2: 50 grants at once for one student — each key is "new" exactly once.
  const who = students[1];
  const bor = await prisma.dafStudentBadge.count({
    where: { studentId: who.id },
  });
  const berildi = (
    await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        grantBadges(prisma as any, who.id, who.companyId, {
          serie: 100,
          woerter: 592,
        }),
      ),
    )
  ).flat();
  const jami = await prisma.dafStudentBadge.count({
    where: { studentId: who.id },
  });
  const badgeOk =
    berildi.length === NISHON_KATALOGI.length - bor &&
    new Set(berildi).size === berildi.length &&
    jami === NISHON_KATALOGI.length;
  console.log(
    'badge concurrency',
    { bor, berildi: berildi.length, jami },
    badgeOk ? 'OK' : 'FAIL',
  );
```

va oxirgi qatorni `if (table.some((r) => !r.ok) || !sameOk || !badgeOk) process.exitCode = 1;` ga almashtirish. Fayl tepasidagi izohdagi «S1 reads» → «S1 and S2 reads».

- [ ] **Step 2: Sinov bazasini tayyorlash** (`$S1_DB`, Task 1 Step 6). Baza Task 1 da yangi ochilgan bo'lsa (o'quvchi yo'q):

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only prisma/seed.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-seed.ts
```

**Ogohlantirish:** `prisma/seed.ts` olgan bazasining HAMMA jadvalini o'chiradi — `DATABASE_URL` aniq `$S1_DB` bo'lsin (worktree'da `server/.env` yo'q). Expected: yuklama seed `week ≈ 1 000 000`, `history ≈ 300 000`, `diff: 0`. Baza S1 dan qolgan bo'lsa (o'quvchilar bor) — bu ikki buyruq o'tkazib yuboriladi.

A1 kontenti (ochiq dars so'rovi haqiqiy jadval ustida yursin):

```bash
cd server && DATABASE_URL="$S1_DB" npm run daf:a1-seed
cd server && for u in 1 2 3 4 5; do DATABASE_URL="$S1_DB" npm run daf:inhalt-seed -- --unit $u; done
```

Expected: har biri xatosiz tugaydi (idempotent).

- [ ] **Step 3: O'lchov**

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-olchov.ts
```

Expected: har qatorda `ok: true`; `same-row concurrency … OK`; `badge concurrency … OK`. Mashina yukini (`uptime`) o'lchovdan oldin yozib qo'yish.

Biror `ok: false` bo'lsa — Step 4 ga o'tilmaydi. `fortschritt` sekin bo'lsa birinchi gumon — `faelligeWoerter == 0` dagi ketma-ket `findFirst`: uni `oquvchi-raqamlari` SQL'iga `EXISTS (…) AS "ochiqDars"` sifatida qo'shish (shunda u har doim, lekin bitta so'rov ichida yuradi), `maqsad.spec.ts` va `fortschritt.service.spec.ts` ni moslab, o'lchovni qaytarish. `seansNatijasi` sekin bo'lsa — `nishonlarniBerXavfsiz` dagi so'z sonini `oquvchiRaqamlari` parallel bosqichiga ko'chirish.

- [ ] **Step 4: Natijalarni spec'ga yozish** — `2026-10-18-musobaqa-s2-shaxsiy-osish-design.md` oxiriga (§7 jadvalidan keyin):

```markdown

---

## 8. Yuklama natijalari

O'lchangan <sana>, lokal sinov bazasi `daf_s1_yuklama` (S1 §10 bilan bir xil
ma'lumot), A1 kontenti u01–u05, o'quvchilarning yarmida `JIDDIY` maqsad.
50 parallel o'quvchi × 10 raund, kod `<qisqa sha>`, load average <qiymat>.
`DafLexemeState` bo'sh — hamma o'quvchida `faelligeWoerter == 0`, ya'ni
`fortschritt` har chaqiruvda «ochiq dars» so'rovini o'qidi (eng yomon yo'l).

| Amal | p50 | p95 | Chegara (p95) | Holat |
| --- | --- | --- | --- | --- |
| `uebersicht` (fortschritt) | … | … | 200 | … |
| `reyting zentrum` | … | … | 200 | … |
| `reyting gruppe` | … | … | 200 | … |
| `recordAttempt` | … | … | 200 | … |
| `seansNatijasi` | … | … | 300 | … |
| `nishonlar` | … | … | 200 | … |

**Bir o'quvchiga 50 parallel `grantBadges`:** <bor> → <jami> qator, «yangi»
deb qaytgan kalitlar <berildi> — takror 0.
```

Burchak qavsdagi va `…` joylarni o'lchov chiqargan raqamlar bilan to'ldirish (shablon matn qolmasin).

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2 && npx --prefix server prettier --write server/scripts/load/daf-yuklama-olchov.ts && git add server/scripts/load/daf-yuklama-olchov.ts docs/superpowers/specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md && git commit -m "test(daf): S2 load test — goal, badge list and parallel badge grants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: ADR-0115, CLAUDE.md, yangilik, to'liq tekshiruv

**Files:**
- Create: `docs/adr/0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md`
- Modify: `docs/adr/README.md`
- Modify: `server/CLAUDE.md` (`### DaF progress (`src/daf/`, ADR-0114)` bo'limi)
- Modify: `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR raqamini tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2 && git fetch origin && ls docs/adr | sort | tail -3 && git ls-tree origin/main docs/adr/ --name-only | sort | tail -3
```

Expected: eng kattasi `0114` (shu shoxda) va `main` da 0115 yo'q. Band bo'lsa — keyingi bo'sh raqam olinadi va shu vazifadagi, `schema.prisma` izohlaridagi, `nishon-berish.ts`/`nishon-berish.single-source.spec.ts`/`daf-schema.spec.ts`/`branch-route-policy.ts` dagi hamma `ADR-0115` almashtiriladi (`git grep -n "ADR-0115"`).

- [ ] **Step 2: ADR** — `docs/adr/0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md`:

```markdown
# ADR-0115 — DaF kunlik maqsad: asl tanlov; nishon: bir marta, qaytarib olinmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** `docs/superpowers/specs/2026-10-18-musobaqa-s2-shaxsiy-osish-design.md`, ADR-0114, `server/src/daf/nishon/nishon-berish.ts`, `server/src/daf/uebung/punkte.ts`, `server/src/daf/fortschritt/fortschritt.service.ts`

## Kontekst

S2 o'quvchiga ikki narsa beradi: o'zi tanlaydigan kunlik maqsad (40 / 80 / 160 ball) va uzoq muddatli nishonlar (seriya va o'rganilgan so'zlar). ADR-0114 ball va seriyani urinishlardan qayta quriladigan hosila jadvalga (`DafStudentDay`) qo'ydi; maqsad va nishon esa qayta qurib bo'lmaydigan ikki narsani saqlaydi. Musobaqa tizimi jazosiz bo'lishi kerak (06.09 dizayni): nishon olingach, seriya uzilsa ham, so'z kuchsizlansa ham qoladi.

## Qaror

1. **`DafStudentSetting` — asl yozuv, hosila emas.** O'quvchining tanlovini urinishlardan chiqarib bo'lmaydi; bir o'quvchiga bitta qator (`studentId` — kalit). Qator yo'q = `ORTA`. Yozuv faqat `PATCH student-portal/lernen/maqsad` da `upsert` (parallel bosish xavfsiz). Tarix saqlanmaydi: almashtirish darrov kuchga kiradi.
2. **Maqsad ballari kodda** (`uebung/punkte.ts`, `MAQSAD_BALL`), bazada faqat kalit. O'zgartirish deploy bilan; mijoz oynachasidagi raqamlar test bilan shu faylga bog'langan.
3. **`DafStudentBadge` — bir marta beriladi, hech qachon olib qo'yilmaydi.** Jadvalda faqat katalog kaliti (`@@unique([studentId, key])`), bekor qilish ustuni yo'q. Katalog kodda (`nishon/nishon-katalogi.ts`) — S3 yangi turlarni migratsiyasiz qo'shadi.
4. **Bitta yozuvchi — `grantBadges`.** `INSERT … ON CONFLICT ("studentId","key") DO NOTHING RETURNING key`: qaytgan kalitlar aynan shu chaqiruv yozganlari, ikki parallel seans bitta nishonni ikki marta «yangi» demaydi. `nishon-berish.single-source.spec.ts` boshqa joydagi yozuvni yiqitadi; bir martalik skript ham shu funksiya orqali yozadi.
5. **Nishon faqat seans oxirida, `seansNatijasi` ichida** beriladi; xato bo'lsa `yangiNishonlar: []`, `natija` va seans saqlanadi. O'tkazib yuborilgan nishon keyingi seansda SHART bo'yicha (holatdan) qaytadan beriladi. `GET nishonlar` hech narsa yozmaydi.
6. **`fortschritt` ga qo'shimcha so'rov yo'q:** bugungi ball va maqsad darajasi mavjud `oquvchi-raqamlari` so'roviga CTE sifatida qo'shildi; «ochiq dars bor» faqat `faelligeWoerter == 0` bo'lganda o'qiladi.
7. **Mavjud o'quvchilar:** `scripts/daf-badges-backfill.ts` (dry run → `--apply --expect=<N>`), seriya uchun eng uzun tarixiy ketma-ketlik, `earnedAt` = N-kunga birinchi yetilgan kun; so'z nishonlari skript vaqti bilan.

## Ko'rib chiqilgan muqobillar

- **Nishonni har o'qishda holatdan hisoblash (jadvalsiz)** — uzilgan seriya nishonni «olib qo'yardi»; qoidaga qarshi. Rad.
- **Nishonni hodisadan (`recordAttempt` ichida) berish** — har javobda qo'shimcha yozuv va tranzaksiya; bitta yozuvchi qoidasi buziladi. Rad.
- **Maqsad ballarini bazada saqlash** — har o'zgarish uchun migratsiya yoki sozlama sahifasi kerak; CEO qiymatlarni kod bilan o'zgartirishga rozi. Rad.
- **Sozlamani `Promise.all` ichida alohida `findUnique`** (spec'dagi variant) — 50 parallel o'quvchida ulanish navbatiga yana bir joy; S1 da `uebersicht` p95 chegaraga yaqin edi. Bitta SQL ichidagi CTE tanlandi.
- **Maqsad tarixi va maqsad ketma-ketligi nishonlari** — bu bosqichda yo'q (spec §4).

## Oqibatlar

- Nishonni qo'lda olib tashlash uchun kod yo'q — xato berilgan nishon faqat ongli migratsiya bilan o'chiriladi (bitta yozuvchi qoidasi uni ham taqiqlaydi; yangi ADR kerak).
- Deploy tartibi: migratsiya `20261018220000_daf_goal_and_badges` → kod → `daf-badges-backfill` dry run → `--apply --expect=<N>`.
- Yuklama natijalari: spec §8.
```

- [ ] **Step 3: README indeksi** — `docs/adr/README.md` dagi `| [0114](…` qatoridan keyin:

```markdown
| [0115](0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md) | DaF kunlik maqsad `DafStudentSetting` — asl tanlov (bitta qator, `upsert`, ballar kodda); nishon `DafStudentBadge` — bir marta beriladi, olib qo'yilmaydi, yagona yozuvchi `grantBadges` (`ON CONFLICT DO NOTHING RETURNING`), faqat seans oxirida; bir martalik berish skripti | Qabul qilindi | 2026-10-18 |
```

- [ ] **Step 4: `server/CLAUDE.md`** — sarlavha `### DaF progress (`src/daf/`, ADR-0114)` ni `### DaF progress (`src/daf/`, ADR-0114, ADR-0115)` ga, va `- **The session end answers with `natija`**…` bandidan keyin:

```markdown
- **The daily goal is a choice, not derived (ADR-0115).** `DafStudentSetting` (one row per student, no row = `ORTA`) is written only by `PATCH student-portal/lernen/maqsad` (upsert). The points (40/80/160) are `MAQSAD_BALL` in `daf/uebung/punkte.ts`; the client sheet's numbers are tested against that file. `GET fortschritt` answers `maqsad` with NO extra query: today's points and the goal level are CTEs of the `oquvchi-raqamlari` SQL, and «an open lesson exists» (`bugunBoshmi`, `fortschritt/maqsad.ts`, the path's lock chain) is read only when `faelligeWoerter == 0`.
- **A badge is given once and never taken back (ADR-0115).** The one writer of `DafStudentBadge` is `grantBadges` (`daf/nishon/nishon-berish.ts`, `INSERT … ON CONFLICT DO NOTHING RETURNING key`); `nishon-berish.single-source.spec.ts` fails on any other write. The catalogue is code (`nishon-katalogi.ts`), the client builds the name from the key. Badges are granted only at a session's end, inside `seansNatijasi` (`natija.yangiNishonlar`); a failure there gives `[]` and never nulls `natija`. `GET nishonlar` writes nothing. Students who practised before S2: `scripts/daf-badges-backfill.ts` (dry run, then `--apply --expect=<N>`).
```

- [ ] **Step 5: Yangilik** — `client/src/qollanma/yangiliklar.ts` dagi `export const yangiliklar: Yangilik[] = [` qatoridan keyin (ro'yxat boshiga):

```ts
  {
    sana: "2026-10-18",
    sarlavha: "O'quvchi ilovasida kunlik maqsad va nishonlar",
    matn: "O'quvchi «Ta'lim» bo'limida kunlik maqsadni o'zi tanlaydi: Yengil (40 ball), O'rta (80) yoki Jiddiy (160); tanlamasa — O'rta. Yo'l tepasidagi halqa bugungi ballni ko'rsatadi; bugun qiladigan mashq qolmagan bo'lsa maqsad bajarilgan hisoblanadi. Seans oxirida maqsad bajarilsa va yangi nishon olinsa, shu haqda qator chiqadi. Nishonlar — ketma-ket mashq kunlari (3, 7, 14, 30, 60, 100) va o'rganilgan so'zlar (50, 150, 300, A1 dagi hammasi) uchun; «Reyting → Darajam» tabida ko'rinadi. Nishon olib qo'yilmaydi, maqsad bajarilmasa jazo yo'q.",
    rollar: [1, 2, 3, 4],
  },
```

- [ ] **Step 6: To'liq tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/server && npm run typecheck && npm run build && npm test
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2/client && npx tsc --noEmit -p . && npx vitest run && npx eslint src --quiet && npx next build
```

Expected: hammasi yashil. `build` va `test` parallel emas (xotira `build∥test`). Yiqilsa — sababini tuzatib, faqat yiqilgan buyruqni qayta yurgizish.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s2 && git add docs/adr/0115-daf-nishon-qaytarilmas-maqsad-asl-tanlov.md docs/adr/README.md server/CLAUDE.md client/src/qollanma/yangiliklar.ts && git commit -m "docs(adr): ADR-0115 daily goal is a choice, badges are never taken back

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Brauzer tekshiruvi (spec §5) va tozalash

**Files:** kod o'zgarmaydi (topilgan xato — o'z TDD tuzatish kommiti bilan).

- [ ] **Step 1: Backend va ilovani ko'tarish** — xotira `reference_throwaway_local_db` retsepti bo'yicha, `$S1_DB` bilan: alohida Redis, `CRONS_ENABLED=false`, bo'sh `TELEGRAM_BOT_TOKEN=` va `TELEGRAM_ADMIN_BOT_TOKEN=`, band bo'lmagan `PORT`, client `127.0.0.1:<port>` da. Yuklama urinishlari halaqit bersa: `DELETE FROM "DafAttempt"` va `scripts/rebuild-daf-student-day.ts --apply` (toza holat). O'quvchi bilan kirish: seed paroli `123456` (`prisma/seed.ts`), o'quvchi raqami bazadan.

- [ ] **Step 2: Seriya chegarasiga yaqin o'quvchi** (faqat lokal bazada) — o'quvchi id'sini olish va kecha, o'tgan kunga kunlik qator yozish, shunda bugungi birinchi seans seriyani 3 ga yetkazadi:

```bash
export SID=$(docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -tAc 'SELECT id FROM "Student" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 1')
docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c "DELETE FROM \"DafStudentBadge\" WHERE \"studentId\" = $SID; INSERT INTO \"DafStudentDay\" (\"studentId\",\"companyId\",day,\"groupKey\",points,attempts,\"updatedAt\") SELECT $SID, \"companyId\", ((now() AT TIME ZONE 'UTC') + interval '5 hours')::date - d, '', 10, 1, now() FROM \"Student\", generate_series(1,2) d WHERE id = $SID ON CONFLICT DO NOTHING;"
```

(Bu ikki to'g'ridan-to'g'ri yozuv — faqat sinov bazasida qo'lda, kod emas; qorovul testlar faqat repo fayllarini tekshiradi.)

- [ ] **Step 3: Ro'yxat** (built-in brauzer, 390×844 va desktop; yorug' va qorong'i):
  1. Yo'l tepasi: to'rt belgi o'zgarmagan, ostida maqsad kartasi to'liq kenglikda, «Bugungi maqsad», «0 / 80 ball», «O'rta · o'zgartirish» — skrinshot (390, yorug'/qorong'i).
  2. Kartani bosish: pastdan oynacha, uch daraja ball va «≈ yarim seans / bir seans / ikki seans» bilan; «Yengil» → oynacha yopiladi, karta «… / 40 ball» — skrinshot.
  3. Birinchi bajarilish: bitta dars seansi (maqsad Yengil) → natija ekranida tartib: ball → seriya → o'rin → «Kunlik maqsad bajarildi — N / 40» → «Yangi nishon: 3 kun ketma-ket» → xato so'zlar — skrinshot; yo'lga qaytganda halqa to'liq, yashil, «Maqsad bajarildi».
  4. Ikkinchi seans: maqsad qatori ham, nishon qatori ham YO'Q.
  5. «Reyting → Darajam»: «Nishonlarim» — `3 kun ketma-ket` to'la rangda, qolganlari chiziqli ramkada «yana N kun / yana N ta so'z»; tarmoq oynasida `nishonlar` so'rovi faqat shu tab ochilganda — skrinshot (390 va desktop).
  6. Ekranda inglizcha so'z yo'qligini ko'z bilan tekshirish (maqsad kartasi, oynacha, natija, nishonlar).

- [ ] **Step 4: iOS klaviatura (S1 dan qolgan)** — `mcp__Claude_Code_iOS_Simulator__control` `attach`, Safari'da `http://<mac-ip>:<port>/portal/lernen`, `Yozish` savoli: pastdagi tugma klaviatura ustida ko'rinadi — skrinshot.

- [ ] **Step 5: Natijani CEO'ga yuborish** — skrinshotlarni bir qatorli izoh bilan. Topilgan xato → alohida tuzatish (yiqiladigan test → tuzatish → test), shu bosqichda.

- [ ] **Step 6: Tozalash** — `dropdb -U daf_user daf_s1_yuklama` (`docker exec daf-postgres …`), Redis konteynerini o'chirish, backend/client jarayonlarini to'xtatish.

- [ ] **Step 7: Commit** — faqat shu vazifada tuzatish bo'lsa: tuzatilgan fayllar `git add <fayllar>` va `git commit -m "fix(lernen): <nima tuzatildi>\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"` (server fayllariga avval prettier). Tuzatish bo'lmasa — `git status --short` bo'sh.

---

## Spec qamrovi (o'z-o'zini tekshirish)

| Spec bo'limi | Vazifa |
| --- | --- |
| §1.1 daraja va ballar, tanlov yo'q = ORTA | 2 (`MAQSAD_BALL`, `maqsadDarajasi`), 4 |
| §1.1 bugungi ball = bugungi `DafStudentDay` yig'indisi | 4 (`bugun` CTE) |
| §1.1 bajarildi, `bosh` (so'z yo'q va ochiq dars yo'q) | 2 (`maqsadHolati`), 4 (`bugunBoshmi`) |
| §1.1 Toshkent kuni, darrov kuchga kiradi, tarix yo'q | 4, 6 (`maqsadniSaqla`) |
| §1.2 `DafStudentSetting`, `upsert` | 1, 6 |
| §1.3 `fortschritt.maqsad`, qo'shimcha so'rov yo'q, kam yo'l | 4 |
| §1.3 `PATCH maqsad`, `@IsEnum`, `StudentCardGuard`, manifest SELF | 6 |
| §1.3 `natija.maqsad`, `yangiBajarildi`, `bosh` da yolg'on | 2, 5 |
| §2.1 katalog, o'rganilgan so'z, olib qo'yilmaydi | 2, 3, 6 |
| §2.2 `DafStudentBadge`, `grantBadges`, `ON CONFLICT … RETURNING`, qorovul | 1, 3 |
| §2.2 faqat seans oxirida, xavfsiz, shart bo'yicha qayta, `GET` yozmaydi | 3, 5, 6 |
| §2.3 `natija.yangiNishonlar`, `GET nishonlar` (`qoldi`), nom mijozda | 5, 6, 8 |
| §2.4 bir martalik skript (dry run, `--apply --expect`, eng uzun ketma-ketlik, `earnedAt`) | 7 |
| §3.1 yo'l tepasi kartasi, oynacha, holatlar, 390px | 9 |
| §3.2 natija ekrani qatorlari va tartibi | 8, 9 |
| §3.3 «Nishonlarim» «Darajam» ichida, tab ochilganda so'rov | 8, 9 |
| §3.4 matnlar faqat lotin o'zbekcha | 8, 9 (test), 12 |
| §4 qilinmaydiganlar | rejada yo'q (maqsad tarixi, maqsad nishonlari, S3–S6) |
| §5 birlik testlari (chegara, `bosh` + 0, ikki chegara, yarim tun, N/N−1, parallel, katalog) | 2, 3, 5 |
| §5 server testlari (ORTA, PATCH 400, natija, xato yiqitmaydi, e2e 404) | 4, 5, 6 |
| §5 mijoz testlari (halqa holatlari, oynacha, natija, «Darajam») | 8, 9 |
| §5 yuklama qayta, hisobot | 10 |
| §5 brauzer (390/desktop, yorug'/qorong'i, oynacha, birinchi bajarilish, nishon, iOS) | 12 |
| §6 ADR-0115, `server/CLAUDE.md`, qo'llanma tekshiruvi, deploy tartibi | 11 (+ «Qo'llanma qarori» yuqorida) |
| §7 xavflar (p95, parallel nishon, xato seansni yiqitmaydi, mavjud o'quvchilar, 390px) | 4, 3, 5, 7, 9, 10 |

**Placeholder tekshiruvi:** «TBD/TODO» yo'q. Task 10 Step 4 dagi `<sana>`, `…` — o'lchov chiqaradigan raqamlar uchun shablon (S1 §10 bilan bir xil), qadamning o'zi ularni to'ldirishni talab qiladi.

**Nom va tip mosligi:** `MaqsadHolati` (server) ↔ `Maqsad` (client) — bir xil maydonlar; `NishonQatori` (server `nishonlar.ts`) ↔ `NishonQatori` (client `types.ts`) — bir xil; `grantBadges(prisma, studentId, companyId, sharoit, earnedAt?)` Task 3, 7, 10 da bir xil; `nishonlarniBerXavfsiz(prisma, studentId, companyId, serie)` Task 3 ↔ 5; `bugunBoshmi(prisma, studentId, faelligeWoerter?)` Task 4 ↔ 5 ↔ 6; `woerterSoni` Task 3 ↔ 6; kesh kaliti `["lernen", "nishonlar"]` Task 8 ↔ 9; SQL belgisi `/* nishon-berish */` Task 3 ↔ 5.
