# Musobaqa S3 — haftalik liga va guruhlar jadvali: implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi har hafta o'z darajasidagi (Bronza → Olmos) 30 kishilik xonada bellashadi; hafta oxirida xonaning birinchi 5 tasi (xona ≥ 15 kishi, ball ≥ 50) keyingi ligaga ko'tariladi; «Guruhlar» tabida markazning haftalik guruhlar jadvali (a'zolar o'rtachasi) ko'rinadi; ko'tarilish va g'oliblik nishonlari seans oxirida beriladi.

**Architecture:** To'rt yangi jadval: `DafStudentLeague` (doimiy daraja, faqat o'sadi), `DafLeagueRoom` + `DafLeagueEntry` (haftalik xona va a'zolik), `DafGroupWeek` (guruh haftasi natijasi). Qoidalar sof funksiyalarda (`daf/liga/liga-qoidalari.ts`), yozuvchilar faqat `liga-xona.ts` (`joinRoom`) va `liga-hisob.ts` (`settleWeek`). Hafta hisobi takrorlanuvchi: xona `UPDATE … WHERE "settledAt" IS NULL RETURNING` bilan olinadi, kompaniya bitta tranzaksiya + advisory qulf (cron kutadi, seans oxiri `pg_try_…`), `joinRoom` shu qulfni shared oladi. Ball manbai — `DafStudentDay`; seans oxirida liga holati bitta so'rov bilan birinchi bosqichda parallel o'qiladi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL, tagged `$queryRaw`), `@nestjs/schedule`, jest (server), Next.js + React Query + vitest (client), ts-node skriptlar.

**Spec:** [`docs/superpowers/specs/2026-10-18-musobaqa-s3-liga-design.md`](../specs/2026-10-18-musobaqa-s3-liga-design.md)

## Global Constraints

- Darajalar 5: Bronza (0) → Kumush (1) → Oltin (2) → Yoqut (3) → Olmos (4). Hamma qoida kodda: `server/src/daf/liga/liga-qoidalari.ts`.
- Xona sig'imi 30. Dushanba taqsimoti: o'tgan hafta kamida 1 ball topganlar o'z darajasi bo'yicha `ceil(n / 25)` xonaga **teng**, `hash(studentId, weekStart)` tartibida navbat bilan. Hafta ichida: o'z darajasining a'zosi eng kam xonasi; hammasi 30 bo'lsa yangi xona. Daraja qatori yo'q = Bronza.
- Ko'tarilish: xonaning birinchi **5** tasi, kamida **50** ball, xonada kamida **15** a'zo. Olmosda ko'tarilish yo'q. Tushish **YO'Q** — daraja faqat o'sadi (`GREATEST`).
- Saralash: ball ↓, teng bo'lsa `studentId` ↑; nol ballilar ko'rinadi. Guruhlar: baho ↓, teng bo'lsa guruh id ↑ (JS `<` bilan, kollatsiyasiz). Baho 1 o'nlik xonagacha faqat ko'rsatishda yaxlitlanadi.
- Hafta = Toshkent dushanba 00:00 – yakshanba 24:00: `wochenStartTag` (`daf/uebung/punkte.ts`), kunlar `addDaysToDateStr`. Sana SQL ga `'YYYY-MM-DD'` matni + `::date` bilan beriladi; `toISOString()` hech qachon «hozir» uchun ishlatilmaydi.
- Ball = `DafStudentDay` haftalik yig'indisi, hamma `groupKey` bo'yicha. Guruh bahosi = guruhning hozirgi faol a'zolari (`Enrollment.status = 'ACTIVE'`, guruh `statusEnum = 'ACTIVE'`, `deletedAt IS NULL`) shu hafta **shu guruh uchun** (`groupKey = groupId`) topgan ballari ÷ a'zolar soni; kamida **3** faol a'zo. Jadval: TOP 10 + o'z guruhi haqiqiy o'rni bilan.
- Liga va guruhlar jadvali **filialga cheklanmaydi** (06.09 §6.1).
- Yagona yozuvchi: `DafStudentLeague` / `DafLeagueRoom` / `DafLeagueEntry` / `DafGroupWeek` ni faqat `server/src/daf/liga/liga-xona.ts` va `liga-hisob.ts` yozadi; `liga.single-source.spec.ts` `src/` va `scripts/` ni tekshiradi. Yagona istisno: `scripts/load/daf-yuklama-s3-seed.ts` → faqat `DafStudentLeague` (sinov bazasi).
- `GET liga`, `GET guruhlar`, `GET nishonlar` hech narsa yozmaydi. Xonaga qo'shilish, kechikkan hisob va nishon faqat seans oxirida (`seansNatijasi`), xavfsiz o'ramda: xato `natija` ni yiqitmaydi.
- `settleWeek` takrorlanuvchi (ikki marta = bir marta), har kompaniya alohida tranzaksiyada, birining xatosi boshqasini to'xtatmaydi. Cron: dushanba 00:05 `Asia/Tashkent`; `CRONS_ENABLED=false` da `ScheduleModule` yuklanmaydi (alohida tekshiruv shart emas).
- Seans oxirida liga holati — **bitta** so'rov (`/* liga-sharoiti */`), birinchi bosqich bilan parallel. `natija` va yo'l tepasidagi to'rt belgi o'zgarmaydi: «o'rin» — hamon markaz o'rni.
- Yuklama chegarasi: `GET liga`, `GET guruhlar` p95 < 200 ms; `seansNatijasi` p95 < 300 ms (5 000 o'quvchi, 50 parallel). `settleWeek` vaqti 5 000 o'quvchida o'lchanadi (skript chegarasi 60 s). p95 haqidagi har gap o'lchovdan, taxmindan emas.
- Raw SQL faqat tagged `$queryRaw` / `$executeRaw` va `Prisma.sql` / `Prisma.join`; `*Unsafe` taqiqlangan. Har liga SQL'i `/* belgi */` izohi bilan boshlanadi — soxta baza (`liga-baza.fake-spec.ts`) shu bo'yicha taniydi.
- Ekrandagi matn faqat lotin o'zbekcha, inglizcha so'z yo'q. Liga nomlari: Bronza, Kumush, Oltin, Yoqut, Olmos.
- Kommit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Server fayllari: `npx prettier --write` → `npx eslint --quiet` → `npx jest <yo'l>`; spec fayllar faqat `npm run typecheck` da tip tekshiruvidan o'tadi. **Client fayllariga prettier ISHLATILMAYDI.**
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3`. Hamma buyruq shu ildizdan (yoki `server/`, `client/` ichidan). Asosiy katalogda commit qilinmaydi.
- `server/src/daf/fortschritt/fortschritt.service.ts` allaqachon 678 qator: unga faqat ulanishlar (≈ 25 qator) qo'shiladi, yangi mantiq `server/src/daf/liga/` ichida.
- Yuklama va sinov skriptlari faqat lokal `daf_s1_yuklama` bazasida (`scripts/load/local-db-guard.ts`).

## Fayl xaritasi

| Fayl | Nima | Vazifa |
| --- | --- | --- |
| `server/prisma/schema.prisma` | 4 model, `Student`/`Group` relatsiyalari | 1 |
| `server/prisma/migrations/20261018240000_daf_league_and_group_week/migration.sql` | 4 jadval, indekslar, FK | 1 |
| `server/src/daf/daf-schema.spec.ts` | sxema qorovuli | 1 |
| `server/src/daf/liga/liga-qoidalari.ts` (+spec) | konstantalar, saralash, ko'tarilish, taqsimot, hash, guruh bahosi | 2 |
| `server/src/daf/liga/liga-baza.fake-spec.ts` | liga SQL'ining soxta (mos yozuvli) bazasi | 3 |
| `server/src/daf/shared/reyting-ismi.ts` | jadvallardagi ism ko'rinishi (bitta joy) | 3 |
| `server/src/daf/liga/liga-xona.ts` (+spec) | `ligaSharoiti`, `joinRoom`, `xonalarOch`, `azolarniQosh`, `ligaJavobi` | 3 |
| `server/src/daf/shared/student-scope.ts` | `currentGroupId` parametri `Pick<…,'enrollment'>` | 4 |
| `server/src/daf/liga/guruhlar-jadvali.ts` (+spec) | `guruhlarYigindisi`, `guruhlarJavobi` | 4 |
| `server/src/daf/liga/liga-hisob.ts` (+spec) | `settleWeek`, `settleDue` | 5 |
| `server/src/daf/liga/liga.cron.ts` (+spec) | dushanba 00:05 | 5 |
| `server/src/daf/liga/liga.single-source.spec.ts` | yagona yozuvchi qorovuli | 5 |
| `server/src/daf/daf.module.ts` | `LigaCron` | 5 |
| `server/src/daf/nishon/nishon-katalogi.ts` (+spec) | 6 musobaqa nishoni, `NishonSharoiti` kengayishi | 6 |
| `server/src/daf/nishon/nishon-berish.ts` (+spec) | `nishonlarniBerXavfsiz(…, ligaP)` | 6 |
| `server/src/daf/nishon/nishonlar.ts` (+spec) | `GET nishonlar` liga holati bilan | 6 |
| `server/src/daf/liga/liga-seans.ts` (+spec) | seans oxiri: kechikkan hisob → qo'shilish → nishon sharoiti | 6 |
| `server/src/daf/fortschritt/fortschritt.service.ts` | ulanishlar: `ligaP`, `liga`, `guruhlar`, `nishonlar(…, companyId)`, `reytingIsmi` | 3, 6, 7 |
| `server/src/daf/fortschritt/seans-natija.spec.ts` | `/* liga-sharoiti */` soxtasi va testlar | 6 |
| `server/src/daf/daf-portal.controller.ts` (+spec) | `GET liga`, `GET guruhlar`; `getNishonlar(…, companyId)` | 6, 7 |
| `server/src/common/auth/branch-route-policy.ts` | SELF bloki | 7 |
| `server/src/common/permissions/route-access.snapshot.json` | ikki qator | 7 |
| `client/src/components/student-portal/lernen/types.ts` | `Liga`, `Guruhlar`, `GuruhQatori`, `NishonQatori.tur` | 8 |
| `client/.../lernen/queries.ts` | `useLiga`, `useGuruhlar`, invalidatsiya | 8 |
| `client/.../lernen/liga.ts` (+test) | nomlar, matnlar, `zonadami`, `bahoMatni` | 8 |
| `client/.../lernen/nishon.ts` (+test) | musobaqa nishonlari nomi va «qoldi» | 8 |
| `client/.../lernen/reyting/reyting-jadvali.tsx` | `ReytingQatori` (zona bilan), `ReytingJadvali` (ko'chirildi) | 9 |
| `client/.../lernen/reyting/liga-tab.tsx` (+test) | «Liga» tabi, «Butun markaz» | 9 |
| `client/.../lernen/reyting/guruhlar-tab.tsx` (+test) | «Guruhlar» tabi | 9 |
| `client/.../lernen/reyting/reyting-ekrani.tsx` (+test) | 4 tab | 9 |
| `client/.../lernen/reyting/nishonlarim.tsx` (+test) | yangi tur belgisi va rangi | 9 |
| `server/scripts/load/daf-yuklama-s3-seed.ts` | darajalar + o'tgan hafta xonalari | 10 |
| `server/scripts/load/daf-yuklama-s3-hisob.ts` | `settleWeek` hajm, vaqt, to'g'rilik | 10 |
| `server/scripts/load/daf-yuklama-kohort.ts` | `kohortOl(…, xonasiz)` | 10 |
| `server/scripts/load/daf-yuklama-olchov.ts` | `liga`, `guruhlar`, birinchi qo'shilish, parallel `joinRoom` | 6, 10 |
| `server/scripts/load/daf-yuklama-paritet.ts` | liga xonasi va guruhlar jadvali brute force bilan | 10 |
| `docs/superpowers/specs/2026-10-18-musobaqa-s3-liga-design.md` | §11 yuklama natijalari | 10 |
| `docs/adr/0116-daf-liga-faqat-kotarilish-haftalik-xona.md`, `docs/adr/README.md` | ADR | 11 |
| `server/CLAUDE.md` | DaF bo'limi bandlari | 11 |
| `client/src/qollanma/yangiliklar.ts` | xodimlar uchun bitta yangilik | 11 |

### Spec bilan kod orasida rejada qabul qilingan qarorlar

1. **Guruh bahosining surati** — mavjud guruh jadvali (`gruppeHaftaligi`) kabi: faqat hozirgi faol a'zolarning `groupKey = groupId` ballari. Guruhdan ketgan o'quvchining shu haftadagi bali guruhga qo'shilmaydi (spec «guruhning `DafStudentDay` yig'indisi» deydi — kod bilan bir xil o'qildi).
2. **`GET guruhlar` qatori** `ReytingZeile` emas: `{ groupId, name, baho, azolar, platz, selbst }` — guruhda `studentId` yo'q, baho esa o'rtacha (ball emas).
3. **Olmos xonasi**: `kotarilishZonasi = { soni: 0, faol: false }`; ekran «Eng yuqori liga — bu yerdan ko'tarilish yo'q» deydi.
4. **Standart tab** — birinchi tab «Liga».
5. **Yuklama hisoboti** spec §8 ga emas (u yerda «Hujjat va deploy» bor), yangi **§11** ga yoziladi.
6. **Kechikkan hisob seans oxirida kutib bajariladi** (fon emas): aks holda o'quvchi eski darajasining xonasiga tushardi. Bir vaqtda faqat bitta so'rov hisoblaydi (`pg_try_advisory_xact_lock`), qolganlar `joinRoom` dagi shared qulfda hisob tugashini kutadi.
7. **`settleDue`** eng eski hisoblanmagan haftadan boshlab birma-bir hisoblaydi, keyin o'tgan haftaning guruhlar jadvalini yozadi (xonasiz hafta bo'lsa ham).
8. **`GET nishonlar`** endi `companyId` oladi (liga holati so'rovi kechikkan hisobni kompaniya bo'yicha ko'radi).

---

### Task 0: Worktree tayyorlash

**Files:** yo'q (muhit).

- [ ] **Step 1: Paketlarni o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npm install
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/client && npm install
```

- [ ] **Step 2: Prisma klienti va boshlang'ich holat**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prisma generate && npx jest src/daf src/common/permissions src/common/auth
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/client && npx vitest run src/components/student-portal
```

Expected: hammasi PASS. Yiqilsa — ishni boshlamasdan sababini yozib, to'xtash.

- [ ] **Step 3: Docker konteyneri** — `docker ps --format '{{.Names}}' | grep -x daf-postgres` → `daf-postgres`. Yo'q bo'lsa repo ildizidan `docker compose up -d` va qayta tekshirish.

- [ ] **Step 4: Commit** — bu vazifada o'zgarish yo'q. `git status --short` bo'sh bo'lishi kerak.

---

### Task 1: Sxema, migratsiya va sinov bazasi

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Student` ichida `dafBadges         DafStudentBadge[]` qatoridan keyin; `model Group` ichida `lessonRatings          LessonRating[]` qatoridan keyin; `model DafStudentBadge { … }` blokidan keyin yangi modellar)
- Create: `server/prisma/migrations/20261018240000_daf_league_and_group_week/migration.sql`
- Modify: `server/src/daf/daf-schema.spec.ts`

**Interfaces:**
- Produces: Prisma modellari (`@prisma/client`): `dafStudentLeague` (`studentId` @id, `companyId`, `tier` default 0, `updatedAt`), `dafLeagueRoom` (`id`, `companyId`, `weekStart` @db.Date, `tier`, `number`, `settledAt?`; unique `companyId_weekStart_tier_number`), `dafLeagueEntry` (`id`, `roomId`, `studentId`, `companyId`, `weekStart` @db.Date, `tier`, `place?`, `points?`, `promoted` default false; unique `weekStart_studentId`), `dafGroupWeek` (`id`, `companyId`, `weekStart` @db.Date, `groupId`, `place`, `average` Float, `members`, `points`; unique `weekStart_groupId`). Relatsiya nomlari: `Student.dafLeague`, `Student.dafLeagueEntries`, `DafLeagueRoom.leagueEntries`, `Group.dafWeeks` (qorovul spec Task 5 shu nomlarni qidiradi).
- Produces (muhit): lokal baza `daf_s1_yuklama` — migratsiyalar qo'llangan, `prisma/seed.ts` bilan to'ldirilgan; shell o'zgaruvchisi `$S1_DB` (Task 3, 4, 5, 10, 12 ishlatadi).

- [ ] **Step 1: Yiqiladigan sxema testi** — `daf-schema.spec.ts` dagi `describe('Daf sxemasi'` blokining oxiriga (`DafStudentSetting is one row per student…` testidan keyin, blokni yopuvchi `});` dan oldin):

```ts
  // S3 (ADR-0116). The tier is permanent and only rises — one row per
  // student, no column that could take it back. A room is weekly and a
  // student is in one room per week. A group's week result is written once.
  it('liga: doimiy daraja, haftalik xona, haftada bitta a`zolik, guruh haftasi bir marta', () => {
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
    expect(body('DafStudentLeague')).toMatch(/studentId\s+Int\s+@id/);
    expect(body('DafStudentLeague')).toMatch(/tier\s+Int\s+@default\(0\)/);
    expect(fieldsOf('DafStudentLeague')).not.toContain('demotedAt');
    expect(body('DafLeagueRoom')).toMatch(
      /@@unique\(\[companyId, weekStart, tier, number\]\)/,
    );
    expect(body('DafLeagueRoom')).toMatch(/weekStart\s+DateTime\s+@db\.Date/);
    expect(body('DafLeagueRoom')).toMatch(/settledAt\s+DateTime\?/);
    expect(body('DafLeagueEntry')).toMatch(
      /@@unique\(\[weekStart, studentId\]\)/,
    );
    expect(body('DafLeagueEntry')).toMatch(
      /promoted\s+Boolean\s+@default\(false\)/,
    );
    expect(body('DafGroupWeek')).toMatch(/@@unique\(\[weekStart, groupId\]\)/);
    expect(body('DafGroupWeek')).toMatch(/average\s+Float/);
  });
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts -t liga`
Expected: FAIL (`expect(start).toBeGreaterThan(-1)` — `DafStudentLeague` modeli yo'q).

- [ ] **Step 3: Sxemaga qo'shish** — `model Student` ichida:

```prisma
  dafBadges         DafStudentBadge[]
```

qatorini quyidagiga almashtirish:

```prisma
  dafBadges         DafStudentBadge[]
  dafLeague         DafStudentLeague?
  dafLeagueEntries  DafLeagueEntry[]
```

`model Group` ichida:

```prisma
  lessonRatings          LessonRating[]
```

qatorini quyidagiga almashtirish:

```prisma
  lessonRatings          LessonRating[]
  dafWeeks               DafGroupWeek[]
```

`model DafStudentBadge { … }` blokidan (u `@@unique([studentId, key])` va `}` bilan tugaydi) keyin:

```prisma

/// Doimiy liga darajasi (ADR-0116): o'quvchiga bitta qator, faqat o'sadi
/// (`GREATEST`). Qator yo'q = Bronza (0); migratsiyada hech narsa
/// to'ldirilmaydi. Yozuvchi: `settleWeek` (`src/daf/liga/liga-hisob.ts`).
model DafStudentLeague {
  studentId Int      @id
  companyId Int
  tier      Int      @default(0)
  updatedAt DateTime @updatedAt

  student Student @relation(fields: [studentId], references: [id])
}

/// Haftalik liga xonasi (ADR-0116). `settledAt` — hafta hisoblangan payt:
/// hisob xonani `UPDATE … WHERE "settledAt" IS NULL RETURNING` bilan oladi,
/// shuning uchun ikkinchi hisob hech narsa olmaydi.
/// Yozuvchilar: `src/daf/liga/liga-xona.ts`, `src/daf/liga/liga-hisob.ts`.
model DafLeagueRoom {
  id        Int       @id @default(autoincrement())
  companyId Int
  weekStart DateTime  @db.Date
  tier      Int
  number    Int
  settledAt DateTime?

  leagueEntries DafLeagueEntry[]

  @@unique([companyId, weekStart, tier, number])
  @@index([companyId, settledAt])
}

/// Xonadagi a'zolik: hafta ichida bitta xona. `place`, `points`, `promoted`
/// hafta hisoblangach yoziladi — tarix va nishonlar shulardan o'qiydi; hafta
/// davomida ball bu yerda saqlanmaydi (`DafStudentDay` dan yig'iladi).
model DafLeagueEntry {
  id        Int      @id @default(autoincrement())
  roomId    Int
  studentId Int
  companyId Int
  weekStart DateTime @db.Date
  tier      Int
  place     Int?
  points    Int?
  promoted  Boolean  @default(false)

  room    DafLeagueRoom @relation(fields: [roomId], references: [id])
  student Student       @relation(fields: [studentId], references: [id])

  @@unique([weekStart, studentId])
  @@index([roomId])
  @@index([studentId])
}

/// Guruhlar jadvalining hafta natijasi (ADR-0116), hafta oxirida bir marta
/// yoziladi. Jonli jadval o'qishda hisoblanadi (`src/daf/liga/guruhlar-jadvali.ts`).
model DafGroupWeek {
  id        Int      @id @default(autoincrement())
  companyId Int
  weekStart DateTime @db.Date
  groupId   String
  place     Int
  average   Float
  members   Int
  points    Int

  group Group @relation(fields: [groupId], references: [id])

  @@unique([weekStart, groupId])
}
```

(`@@index([companyId, settledAt])` — seans oxiridagi «o'tgan hafta hisoblanmaganmi» savoli faqat hisoblanmagan xonalarni o'qisin. `@@index([studentId])` — `XONA_GOLIB` sharti va `@@unique([weekStart, studentId])` ning birinchi ustuni `weekStart`. `@@index([roomId])` — xona a'zolari.)

- [ ] **Step 4: Migratsiya** — `server/prisma/migrations/20261018240000_daf_league_and_group_week/migration.sql`:

```sql
-- S3: weekly league and the group table (ADR-0116). Nothing is backfilled:
-- no tier row means Bronza.
CREATE TABLE "DafStudentLeague" (
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafStudentLeague_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE "DafLeagueRoom" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "tier" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "DafLeagueRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DafLeagueEntry" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "tier" INTEGER NOT NULL,
    "place" INTEGER,
    "points" INTEGER,
    "promoted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DafLeagueEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DafGroupWeek" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "groupId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "average" DOUBLE PRECISION NOT NULL,
    "members" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "DafGroupWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DafLeagueRoom_companyId_weekStart_tier_number_key" ON "DafLeagueRoom"("companyId", "weekStart", "tier", "number");
CREATE INDEX "DafLeagueRoom_companyId_settledAt_idx" ON "DafLeagueRoom"("companyId", "settledAt");
CREATE UNIQUE INDEX "DafLeagueEntry_weekStart_studentId_key" ON "DafLeagueEntry"("weekStart", "studentId");
CREATE INDEX "DafLeagueEntry_roomId_idx" ON "DafLeagueEntry"("roomId");
CREATE INDEX "DafLeagueEntry_studentId_idx" ON "DafLeagueEntry"("studentId");
CREATE UNIQUE INDEX "DafGroupWeek_weekStart_groupId_key" ON "DafGroupWeek"("weekStart", "groupId");

ALTER TABLE "DafStudentLeague" ADD CONSTRAINT "DafStudentLeague_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafLeagueEntry" ADD CONSTRAINT "DafLeagueEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DafLeagueRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafLeagueEntry" ADD CONSTRAINT "DafLeagueEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DafGroupWeek" ADD CONSTRAINT "DafGroupWeek_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Klientni yaratish**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 6: Sinov bazasini yaratish va migratsiyani qo'llash.** S2 oxirida `daf_s1_yuklama` o'chirilgan (18.10 tekshiruvi: konteynerda yo'q). Nomi o'zgarmaydi — `scripts/load/local-db-guard.ts` faqat shuni qabul qiladi. Parolni ekranga chiqarmay URL yig'ish (Bash chaqiruvlari orasida o'zgaruvchi saqlanmaydi — `$S1_DB` ishlatiladigan har buyruqdan oldin quyidagi `export` qatori qaytariladi yoki u bilan bir qatorda `&&` orqali yuritiladi):

```bash
export S1_DB="postgresql://daf_user:$(docker exec daf-postgres printenv POSTGRES_PASSWORD)@127.0.0.1:5433/daf_s1_yuklama"
docker exec daf-postgres psql -U daf_user -lqt | cut -d '|' -f1 | grep -qw daf_s1_yuklama && echo bor || docker exec daf-postgres createdb -U daf_user daf_s1_yuklama
cd server && DATABASE_URL="$S1_DB" node node_modules/prisma/build/index.js migrate deploy
```

Yangi bazada deploy ikki marta to'xtaydi (xotira `reference_throwaway_local_db`): `20260805120000_branch_tenancy_leads_holidays_mock` oldidan `docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c "INSERT INTO \"Company\"(id, name) VALUES (1001, 'Sinov') ON CONFLICT DO NOTHING"`, `20260806120000_drop_company_defaults_and_branch_sequence` oldidan `… -c "INSERT INTO \"Branch\"(id, \"companyId\", name) VALUES (1, 1001, 'Sinov') ON CONFLICT DO NOTHING"` (jadvalda majburiy ustun yetishmasa — xato xabari aytgan ustunni qo'shish); har biridan keyin `DATABASE_URL="$S1_DB" node node_modules/prisma/build/index.js migrate resolve --rolled-back <nom>` va deploy qayta. Expected oxirida: `20261018240000_daf_league_and_group_week` qo'llandi. Keyin:

```bash
cd server && DATABASE_URL="$S1_DB" npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
```

Expected: faqat `DROP INDEX "DafStudentDay_companyId_day_cover_idx";` (ADR-0114 dagi kutilgan farq). `DafStudentLeague`, `DafLeagueRoom`, `DafLeagueEntry`, `DafGroupWeek` haqida HECH NARSA yo'q — qo'lda yozilgan SQL sxemaga aynan mos.

- [ ] **Step 7: Bazani o'quvchilar bilan to'ldirish** (Task 3–5 dagi haqiqiy Postgres tekshiruvlari uchun):

```bash
cd server && test ! -e .env && DATABASE_URL="$S1_DB" npx ts-node --transpile-only prisma/seed.ts
```

**Ogohlantirish:** `prisma/seed.ts` olgan bazasining HAMMA jadvalini o'chiradi — `DATABASE_URL` aniq `$S1_DB` bo'lsin; `test ! -e .env` worktree'da `server/.env` yo'qligini tasdiqlaydi (bo'lsa buyruq bajarilmaydi). Expected: xatosiz tugaydi; `docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -tAc 'SELECT COUNT(*) FROM "Student"'` → 12 000 atrofida.

- [ ] **Step 8: Sxema testi**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3 && npx --prefix server prettier --write server/src/daf/daf-schema.spec.ts && git add server/prisma/schema.prisma server/prisma/migrations/20261018240000_daf_league_and_group_week server/src/daf/daf-schema.spec.ts && git commit -m "feat(daf): league tier, weekly rooms and group week tables

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sof qoidalar — `liga-qoidalari.ts`

**Files:**
- Create: `server/src/daf/liga/liga-qoidalari.ts`
- Create: `server/src/daf/liga/liga-qoidalari.spec.ts`

**Interfaces:**
- Produces:
  - Konstantalar: `LIGA_NOMLARI = ['Bronza','Kumush','Oltin','Yoqut','Olmos'] as const`, `ENG_YUQORI_DARAJA = 4`, `XONA_SIGIMI = 30`, `XONA_MAQSAD = 25`, `KOTARILISH_SONI = 5`, `KOTARILISH_MIN_BALL = 50`, `KOTARILISH_MIN_AZO = 15`, `GOLIB_MIN_BALL = 50`, `GOLIB_MIN_AZO = 5`, `GURUH_MIN_AZO = 3`, `GURUH_TOP = 10`
  - `darajaNomi(tier: number): string`
  - `interface XonaAzosi { studentId: number; points: number }`; `saralaXona<T extends XonaAzosi>(azolar: readonly T[]): T[]`
  - `kotarilishZonasi(hajm: number, tier: number): { soni: number; faol: boolean }`
  - `interface XonaNatijaQatori extends XonaAzosi { place: number; promoted: boolean }`; `xonaNatijasi(azolar: readonly XonaAzosi[], tier: number): XonaNatijaQatori[]`
  - `xonalarSoni(n: number): number`; `xonaHash(studentId: number, haftaBoshi: string): number`; `tengBol(studentIds: readonly number[], haftaBoshi: string): number[][]`
  - `engKamXona(xonalar: readonly { id: number; number: number; hajm: number }[]): number | null`
  - `interface GuruhYigindisi { groupId: string; name: string; azolar: number; ball: number }`; `interface GuruhNatija extends GuruhYigindisi { baho: number; place: number }`; `guruhlarniSarala(rows: readonly GuruhYigindisi[]): GuruhNatija[]`; `bahoKorinishi(baho: number): number`

- [ ] **Step 1: Yiqiladigan testlar** — `server/src/daf/liga/liga-qoidalari.spec.ts`:

```ts
import {
  ENG_YUQORI_DARAJA,
  GURUH_MIN_AZO,
  LIGA_NOMLARI,
  XONA_SIGIMI,
  bahoKorinishi,
  darajaNomi,
  engKamXona,
  guruhlarniSarala,
  kotarilishZonasi,
  saralaXona,
  tengBol,
  xonaHash,
  xonaNatijasi,
  xonalarSoni,
} from './liga-qoidalari';

/** n a'zo: id 1..n, ball `ball(i)` (standart — kamayib boradi). */
const xona = (n: number, ball: (i: number) => number = (i) => 100 - i) =>
  Array.from({ length: n }, (_, i) => ({ studentId: i + 1, points: ball(i) }));

describe('liga darajalari', () => {
  it('besh daraja, Bronzadan Olmosgacha', () => {
    expect(LIGA_NOMLARI).toEqual(['Bronza', 'Kumush', 'Oltin', 'Yoqut', 'Olmos']);
    expect(ENG_YUQORI_DARAJA).toBe(4);
    expect(darajaNomi(0)).toBe('Bronza');
    expect(darajaNomi(4)).toBe('Olmos');
  });
});

describe('saralaXona', () => {
  it('ball kamayishi, teng ballda studentId kichigi yuqorida, nol ballilar ham', () => {
    expect(
      saralaXona([
        { studentId: 9, points: 0 },
        { studentId: 3, points: 40 },
        { studentId: 2, points: 40 },
        { studentId: 1, points: 0 },
      ]).map((a) => a.studentId),
    ).toEqual([2, 3, 1, 9]);
  });
});

describe('xonaNatijasi — hafta oxiri', () => {
  it('15 kishilik xonada birinchi 5 tasi ko`tariladi, hammaga o`rin', () => {
    const r = xonaNatijasi(xona(15), 0);
    expect(r.filter((q) => q.promoted).map((q) => q.place)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(r.map((q) => q.place)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
  });

  it('14 kishilik xonada hech kim ko`tarilmaydi, o`rinlar baribir yoziladi', () => {
    const r = xonaNatijasi(xona(14), 0);
    expect(r.some((q) => q.promoted)).toBe(false);
    expect(r[0]).toEqual({ studentId: 1, points: 100, place: 1, promoted: false });
  });

  it('kamida 50 ball: 50 lik 2-o`rin ko`tariladi, 49 lik 3-o`rin yo`q', () => {
    const r = xonaNatijasi(
      xona(15, (i) => [80, 50, 49, 30, 10][i] ?? 0),
      1,
    );
    expect(r.filter((q) => q.promoted).map((q) => q.studentId)).toEqual([1, 2]);
  });

  it('5- va 6-o`rinda teng ball: kichik id 5-o`rin va ko`tariladi, kattasi yo`q', () => {
    const azolar = xona(15, (i) => (i < 4 ? 100 : 0));
    azolar[4] = { studentId: 30, points: 70 };
    azolar[5] = { studentId: 20, points: 70 };
    const r = xonaNatijasi(azolar, 0);
    expect(r.find((q) => q.studentId === 20)).toMatchObject({
      place: 5,
      promoted: true,
    });
    expect(r.find((q) => q.studentId === 30)).toMatchObject({
      place: 6,
      promoted: false,
    });
  });

  it('Olmosda ko`tarilish yo`q', () => {
    expect(xonaNatijasi(xona(30), 4).some((q) => q.promoted)).toBe(false);
  });
});

describe('kotarilishZonasi', () => {
  it('Olmosdan pastda 5 ta; faol — xona kamida 15 kishi bo`lganda', () => {
    expect(kotarilishZonasi(14, 0)).toEqual({ soni: 5, faol: false });
    expect(kotarilishZonasi(15, 3)).toEqual({ soni: 5, faol: true });
    expect(kotarilishZonasi(30, 4)).toEqual({ soni: 0, faol: false });
  });
});

describe('taqsimot', () => {
  it.each([
    [0, 0],
    [1, 1],
    [25, 1],
    [26, 2],
    [40, 2],
    [50, 2],
    [51, 3],
    [61, 3],
  ])('%i faol → %i xona', (n, k) => {
    expect(xonalarSoni(n)).toBe(k);
  });

  it('teng bo`linadi: 40 → 20 + 20, 26 → 13 + 13, 61 → 21 + 20 + 20, 25 → bitta', () => {
    const olcham = (n: number) =>
      tengBol(
        Array.from({ length: n }, (_, i) => 10_000 + i),
        '2026-10-19',
      ).map((x) => x.length);
    expect(olcham(40)).toEqual([20, 20]);
    expect(olcham(26)).toEqual([13, 13]);
    expect(olcham(61)).toEqual([21, 20, 20]);
    expect(olcham(25)).toEqual([25]);
    expect(olcham(0)).toEqual([]);
  });

  it('har o`quvchi aynan bir marta; kirish tartibidan qat`i nazar bir xil natija', () => {
    const ids = Array.from({ length: 61 }, (_, i) => 10_000 + i);
    const a = tengBol(ids, '2026-10-19');
    expect(a.flat().sort((x, y) => x - y)).toEqual(ids);
    expect(tengBol([...ids].reverse(), '2026-10-19')).toEqual(a);
  });

  it('tartib hashdan: id ketma-ketligi emas, boshqa haftada boshqa', () => {
    const ids = Array.from({ length: 40 }, (_, i) => 10_000 + i);
    const birinchi = tengBol(ids, '2026-10-19')[0];
    expect(birinchi).not.toEqual(ids.filter((_, i) => i % 2 === 0));
    expect(tengBol(ids, '2026-10-26')[0]).not.toEqual(birinchi);
  });

  it('xonaHash — 32 bitli, takrorlanuvchi', () => {
    const h = xonaHash(10_001, '2026-10-19');
    expect(xonaHash(10_001, '2026-10-19')).toBe(h);
    expect(xonaHash(10_002, '2026-10-19')).not.toBe(h);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('engKamXona — hafta ichida qo`shilish', () => {
  it('a`zosi eng kam xona; tengda raqami kichigi', () => {
    expect(
      engKamXona([
        { id: 1, number: 1, hajm: 20 },
        { id: 3, number: 3, hajm: 18 },
        { id: 2, number: 2, hajm: 18 },
      ]),
    ).toBe(2);
  });

  it('hammasi 30 — null (yangi xona ochiladi); 29 — hali sig`adi', () => {
    expect(engKamXona([{ id: 1, number: 1, hajm: XONA_SIGIMI }])).toBeNull();
    expect(engKamXona([{ id: 1, number: 1, hajm: 29 }])).toBe(1);
    expect(engKamXona([])).toBeNull();
  });
});

describe('guruhlarniSarala', () => {
  const g = (groupId: string, azolar: number, ball: number) => ({
    groupId,
    name: groupId.toUpperCase(),
    azolar,
    ball,
  });

  it('baho = ball ÷ hamma faol a`zo (mashq qilmaganlar 0 sifatida)', () => {
    expect(guruhlarniSarala([g('a', 4, 100)])[0].baho).toBe(25);
  });

  it('2 kishilik guruh chiqmaydi, 3 kishilik chiqadi', () => {
    expect(
      guruhlarniSarala([g('a', 2, 900), g('b', GURUH_MIN_AZO, 3)]).map(
        (r) => r.groupId,
      ),
    ).toEqual(['b']);
  });

  it('baho ↓, teng bo`lsa guruh id ↑; saralash yaxlitlanmagan son bo`yicha', () => {
    const r = guruhlarniSarala([
      g('c', 3, 30),
      g('b', 3, 30),
      g('e', 25, 251),
      g('a', 3, 31),
      g('d', 4, 40),
    ]);
    // a 10.33 · e 10.04 · b, c, d 10
    expect(r.map((x) => [x.groupId, x.place])).toEqual([
      ['a', 1],
      ['e', 2],
      ['b', 3],
      ['c', 4],
      ['d', 5],
    ]);
    expect(bahoKorinishi(31 / 3)).toBe(10.3);
    expect(bahoKorinishi(251 / 25)).toBe(10);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/liga/liga-qoidalari.spec.ts`
Expected: FAIL (`Cannot find module './liga-qoidalari'`).

- [ ] **Step 3: Qoidalarni yozish** — `server/src/daf/liga/liga-qoidalari.ts`:

```ts
/**
 * Haftalik liga va guruhlar jadvali qoidalari — BITTA joyda (spec S3 §1.1,
 * §2.1, ADR-0116). Hammasi sof funksiya: baza, vaqt va tasodif yo'q, shuning
 * uchun hisob (`liga-hisob.ts`), o'qish (`liga-xona.ts`, `guruhlar-jadvali.ts`)
 * va yuklama skriptlari bir xil qoidani ishlatadi. Mijoz nomlar va chegaralarni
 * test bilan shu fayldan o'qib solishtiradi (`client/.../lernen/liga.test.ts`).
 */
export const LIGA_NOMLARI = [
  'Bronza',
  'Kumush',
  'Oltin',
  'Yoqut',
  'Olmos',
] as const;
export const ENG_YUQORI_DARAJA = LIGA_NOMLARI.length - 1;
export const XONA_SIGIMI = 30;
/** Dushanba taqsimotining maqsadi — sig'imdan past: yangi kelganlarga joy qoladi. */
export const XONA_MAQSAD = 25;
export const KOTARILISH_SONI = 5;
export const KOTARILISH_MIN_BALL = 50;
export const KOTARILISH_MIN_AZO = 15;
export const GOLIB_MIN_BALL = 50;
export const GOLIB_MIN_AZO = 5;
export const GURUH_MIN_AZO = 3;
export const GURUH_TOP = 10;

export function darajaNomi(tier: number): string {
  return LIGA_NOMLARI[Math.min(Math.max(tier, 0), ENG_YUQORI_DARAJA)];
}

export interface XonaAzosi {
  studentId: number;
  points: number;
}

/** Ball kamayishi, teng ballda `studentId` o'sishi (06.09 §6.2) — markaz jadvali bilan bir xil. */
export function saralaXona<T extends XonaAzosi>(azolar: readonly T[]): T[] {
  return [...azolar].sort(
    (a, b) => b.points - a.points || a.studentId - b.studentId,
  );
}

/**
 * Ko'tarilish zonasi: Olmosdan pastda birinchi 5 ta, faqat xona kamida 15
 * kishi bo'lganda faol — kam faolda 3 kishilik xonadan avtomatik ko'tarilish
 * bo'lmasin (CEO, 2026-10-18).
 */
export function kotarilishZonasi(
  hajm: number,
  tier: number,
): { soni: number; faol: boolean } {
  const soni = tier < ENG_YUQORI_DARAJA ? KOTARILISH_SONI : 0;
  return { soni, faol: soni > 0 && hajm >= KOTARILISH_MIN_AZO };
}

export interface XonaNatijaQatori extends XonaAzosi {
  place: number;
  promoted: boolean;
}

/** Hafta oxiri (spec S3 §1.4 2–3): hammaga o'rin, zonadagi ≥ 50 ballilar ko'tariladi. */
export function xonaNatijasi(
  azolar: readonly XonaAzosi[],
  tier: number,
): XonaNatijaQatori[] {
  const zona = kotarilishZonasi(azolar.length, tier);
  return saralaXona(azolar).map((a, i) => ({
    studentId: a.studentId,
    points: a.points,
    place: i + 1,
    promoted: zona.faol && i < zona.soni && a.points >= KOTARILISH_MIN_BALL,
  }));
}

export function xonalarSoni(n: number): number {
  return n <= 0 ? 0 : Math.ceil(n / XONA_MAQSAD);
}

/**
 * FNV-1a (32 bit) `studentId|weekStart` ustida: taqsimot tartibsiz (id
 * ketma-ketligi xonani hal qilmaydi), lekin takrorlanuvchi — qayta hisob
 * xuddi shu xonalarni beradi.
 */
export function xonaHash(studentId: number, haftaBoshi: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${studentId}|${haftaBoshi}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** `ceil(n / 25)` xonaga teng: hash tartibida navbat bilan, o'lchamlar farqi ≤ 1 (40 → 20 + 20). */
export function tengBol(
  studentIds: readonly number[],
  haftaBoshi: string,
): number[][] {
  const k = xonalarSoni(studentIds.length);
  const tartib = [...studentIds].sort(
    (a, b) => xonaHash(a, haftaBoshi) - xonaHash(b, haftaBoshi) || a - b,
  );
  const xonalar = Array.from({ length: k }, () => [] as number[]);
  tartib.forEach((id, i) => xonalar[i % k].push(id));
  return xonalar;
}

/** Hafta ichida: a'zosi eng kam (< 30) xona, tengda raqami kichigi; hammasi to'la — `null`. */
export function engKamXona(
  xonalar: readonly { id: number; number: number; hajm: number }[],
): number | null {
  let eng: { id: number; number: number; hajm: number } | null = null;
  for (const x of xonalar) {
    if (x.hajm >= XONA_SIGIMI) continue;
    if (
      !eng ||
      x.hajm < eng.hajm ||
      (x.hajm === eng.hajm && x.number < eng.number)
    )
      eng = x;
  }
  return eng?.id ?? null;
}

export interface GuruhYigindisi {
  groupId: string;
  name: string;
  /** Hozirgi faol a'zolar soni (mashq qilmaganlar ham). */
  azolar: number;
  /** Shu hafta shu guruh uchun topilgan ball. */
  ball: number;
}

export interface GuruhNatija extends GuruhYigindisi {
  baho: number;
  place: number;
}

/**
 * Guruhlar jadvali (spec S3 §2.1): kamida 3 faol a'zo, baho = ball ÷ a'zolar,
 * baho ↓, teng bo'lsa guruh id ↑ — oddiy satr taqqoslash, bazaning
 * kollatsiyasiga bog'liq emas. Saralash yaxlitlanmagan baho bo'yicha.
 */
export function guruhlarniSarala(
  rows: readonly GuruhYigindisi[],
): GuruhNatija[] {
  return rows
    .filter((r) => r.azolar >= GURUH_MIN_AZO)
    .map((r) => ({ ...r, baho: r.ball / r.azolar }))
    .sort(
      (a, b) =>
        b.baho - a.baho ||
        (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0),
    )
    .map((r, i) => ({ ...r, place: i + 1 }));
}

/** Ko'rsatish uchun: 1 o'nlik xonagacha. */
export function bahoKorinishi(baho: number): number {
  return Math.round(baho * 10) / 10;
}
```

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/liga/liga-qoidalari.spec.ts`
Expected: PASS (25 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prettier --write src/daf/liga && npx eslint --quiet src/daf/liga && git add src/daf/liga && git commit -m "feat(daf): league and group table rules as pure functions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Xona — `joinRoom`, liga holati, xonani o'qish

**Files:**
- Create: `server/src/daf/liga/liga-baza.fake-spec.ts` (jest uni test deb olmaydi: `testRegex` `.spec.ts$`; build ham olmaydi: `**/*spec.ts`)
- Create: `server/src/daf/shared/reyting-ismi.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (ikki `` `${t.firstName} ${t.lastName}` `` → `reytingIsmi(t)`)
- Create: `server/src/daf/liga/liga-xona.ts`
- Create: `server/src/daf/liga/liga-xona.spec.ts`
- Temporary: `server/scripts/_probe-liga-xona.ts` (commit qilinmaydi)

**Interfaces:**
- Consumes: `darajaNomi`, `engKamXona`, `kotarilishZonasi`, `saralaXona`, `GOLIB_MIN_BALL`, `GOLIB_MIN_AZO` (Task 2); `wochenStartTag` (`daf/uebung/punkte.ts`), `addDaysToDateStr` (`attendance/shared/date-utils.ts`); `ReytingZeile` (`fortschritt/fortschritt.service.ts`, faqat tip).
- Produces (`liga-xona.ts`):
  - `LIGA_HISOB_KALIT = 1279870785`, `LIGA_XONA_KALIT = 1279870786` (advisory qulf kalitlari)
  - `type LigaTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>`
  - `bolaklar<T>(xs: T[], n?: number): T[][]`
  - `interface LigaSharoiti { tier: number; azo: boolean; kechikkan: boolean; xonaGolib: boolean; guruhBirinchi: boolean }`
  - `ligaSharoiti(db: Pick<Prisma.TransactionClient, '$queryRaw'>, studentId: number, companyId: number, jetzt: Date): Promise<LigaSharoiti>` — SQL `/* liga-sharoiti */`
  - `xonalarOch(tx: LigaTx, companyId: number, hafta: string, tier: number, soni: number): Promise<{ id: number; number: number }[]>` — `/* liga-xona-och */`
  - `azolarniQosh(tx: LigaTx, companyId: number, hafta: string, tier: number, qatorlar: { roomId: number; studentId: number }[]): Promise<number>` — `/* liga-azo-qosh */`, `ON CONFLICT ("weekStart", "studentId") DO NOTHING`
  - `joinRoom(prisma: PrismaService, studentId: number, companyId: number, jetzt: Date): Promise<{ roomId: number; yangi: boolean }>`
  - `interface LigaDarajasi { tier: number; nomi: string }`; `interface LigaJavobi { haftaBoshi; haftaOxiri; azo; daraja: LigaDarajasi; xona: { raqam; hajmi; qatorlar: ReytingZeile[]; kotarilishZonasi: { soni; faol } } | null; otganHafta: { daraja: LigaDarajasi; orin; kotarildi; hajmi } | null }`
  - `ligaJavobi(db: Pick<Prisma.TransactionClient, '$queryRaw'>, studentId: number, jetzt: Date): Promise<LigaJavobi>` — `/* liga-holat */`, `/* liga-xona */`
- Produces (`reyting-ismi.ts`): `reytingIsmi(s: { firstName: string; lastName: string }): string`
- Produces (`liga-baza.fake-spec.ts`): `ligaBaza(boshlangich?: Partial<LigaBazaHolati>): { db: any; h: LigaBazaHolati }` va `FakeXona`, `FakeKirish`, `FakeKun`, `FakeGuruhHafta`, `LigaBazaHolati` tiplari — Task 4 va 5 ham shuni ishlatadi.

- [ ] **Step 1: Soxta baza** — `server/src/daf/liga/liga-baza.fake-spec.ts` (bu liga SQL'ining **mos yozuvi**: soxta SQL ishlata olmaydi, shuning uchun har `/* belgi */` so'rovining ma'nosi qoidalardan yozilgan; haqiqiy SQL Task 3/5 dagi probalar va Task 10 da sinov bazasida tekshiriladi):

```ts
import type { Prisma } from '@prisma/client';

/** Days and weeks are 'YYYY-MM-DD' strings, exactly as the SQL binds them. */
export interface FakeXona {
  id: number;
  companyId: number;
  weekStart: string;
  tier: number;
  number: number;
  settledAt: Date | null;
}

export interface FakeKirish {
  id: number;
  roomId: number;
  studentId: number;
  companyId: number;
  weekStart: string;
  tier: number;
  place: number | null;
  points: number | null;
  promoted: boolean;
}

export interface FakeKun {
  studentId: number;
  companyId: number;
  day: string;
  groupKey: string;
  points: number;
}

export interface FakeGuruhHafta {
  companyId: number;
  weekStart: string;
  groupId: string;
  place: number;
  average: number;
  members: number;
  points: number;
}

export interface LigaBazaHolati {
  xonalar: FakeXona[];
  kirishlar: FakeKirish[];
  /** DafStudentLeague: studentId → tier. */
  darajalar: Map<number, number>;
  kunlar: FakeKun[];
  /** ACTIVE enrollments of ACTIVE, live groups. */
  azolik: { groupId: string; studentId: number }[];
  guruhNomlari: Map<string, string>;
  guruhHaftalari: FakeGuruhHafta[];
  ismlar: Map<number, [string, string]>;
  /** What `pg_try_advisory_xact_lock` answers. */
  qulfBosh: boolean;
  /** Every query's marker, in call order. */
  chaqiruvlar: string[];
}

const kunQosh = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const dushanba = (d: string) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return kunQosh(d, -(w === 0 ? 6 : w - 1));
};

const tuples = (v: unknown[], n: number) =>
  Array.from({ length: v.length / n }, (_, i) => v.slice(i * n, i * n + n));

/**
 * A stand-in for the league tables that answers every league query by its
 * `/* marker *\/`. Bound values are read in the order the SQL binds them;
 * each case names that order.
 */
export function ligaBaza(boshlangich: Partial<LigaBazaHolati> = {}) {
  const h: LigaBazaHolati = {
    xonalar: [],
    kirishlar: [],
    darajalar: new Map(),
    kunlar: [],
    azolik: [],
    guruhNomlari: new Map(),
    guruhHaftalari: [],
    ismlar: new Map(),
    qulfBosh: true,
    chaqiruvlar: [],
    ...boshlangich,
  };
  // Testlar o'z qatorlariga kichik id beradi; soxta baza yaratganlari to'qnashmaydi.
  let keyingiId = 100_000;
  const ball = (sid: number, dan: string, gacha: string) =>
    h.kunlar
      .filter((k) => k.studentId === sid && k.day >= dan && k.day < gacha)
      .reduce((s, k) => s + k.points, 0);
  const hajm = (roomId: number) =>
    h.kirishlar.filter((k) => k.roomId === roomId).length;

  function javob(sql: Prisma.Sql): unknown[] | number {
    const m = /\/\* ([a-z-]+) \*\//.exec(sql.strings[0])?.[1] ?? '';
    h.chaqiruvlar.push(m);
    const v = sql.values as any[];
    switch (m) {
      case 'liga-qulf':
      case 'liga-qulf-umumiy':
      case 'liga-xona-qulf':
        return [{ ok: 1 }];
      case 'liga-qulf-sinash':
        return [{ ok: h.qulfBosh }];
      case 'liga-sharoiti': {
        // [studentId, hafta, studentId, companyId, hafta, studentId, GOLIB_MIN_BALL, GOLIB_MIN_AZO, studentId]
        const [sid, hafta, , companyId] = v;
        return [
          {
            tier: h.darajalar.get(sid) ?? 0,
            azo: h.kirishlar.some(
              (k) => k.weekStart === hafta && k.studentId === sid,
            ),
            kechikkan: h.xonalar.some(
              (x) =>
                x.companyId === companyId &&
                x.settledAt === null &&
                x.weekStart < hafta,
            ),
            xonaGolib: h.kirishlar.some(
              (k) =>
                k.studentId === sid &&
                k.place === 1 &&
                (k.points ?? 0) >= v[6] &&
                hajm(k.roomId) >= v[7],
            ),
            guruhBirinchi: h.kunlar.some(
              (k) =>
                k.studentId === sid &&
                k.points > 0 &&
                h.guruhHaftalari.some(
                  (g) =>
                    g.groupId === k.groupKey &&
                    g.weekStart === dushanba(k.day) &&
                    g.place === 1,
                ),
            ),
          },
        ];
      }
      case 'liga-daraja': // [studentId]
        return h.darajalar.has(v[0]) ? [{ tier: h.darajalar.get(v[0]) }] : [];
      case 'liga-kirish': // [hafta, studentId]
        return h.kirishlar
          .filter((k) => k.weekStart === v[0] && k.studentId === v[1])
          .map((k) => ({ roomId: k.roomId }));
      case 'liga-xonalar-hajmi': // [companyId, hafta, tier]
        return h.xonalar
          .filter(
            (x) => x.companyId === v[0] && x.weekStart === v[1] && x.tier === v[2],
          )
          .map((x) => ({ id: x.id, number: x.number, hajm: hajm(x.id) }));
      case 'liga-xona-och': {
        // [companyId, hafta, tier, companyId, hafta, tier, soni]
        const [companyId, weekStart, tier] = v;
        const eng = Math.max(
          0,
          ...h.xonalar
            .filter(
              (x) =>
                x.companyId === companyId &&
                x.weekStart === weekStart &&
                x.tier === tier,
            )
            .map((x) => x.number),
        );
        return Array.from({ length: v[6] }, (_, i) => {
          const x: FakeXona = {
            id: keyingiId++,
            companyId,
            weekStart,
            tier,
            number: eng + i + 1,
            settledAt: null,
          };
          h.xonalar.push(x);
          return { id: x.id, number: x.number };
        });
      }
      case 'liga-azo-qosh': {
        // tuples (roomId, studentId, companyId, weekStart, tier); ON CONFLICT (weekStart, studentId) DO NOTHING
        let n = 0;
        for (const [roomId, studentId, companyId, weekStart, tier] of tuples(v, 5) as any[]) {
          if (
            h.kirishlar.some(
              (k) => k.weekStart === weekStart && k.studentId === studentId,
            )
          )
            continue;
          h.kirishlar.push({
            id: keyingiId++,
            roomId,
            studentId,
            companyId,
            weekStart,
            tier,
            place: null,
            points: null,
            promoted: false,
          });
          n += 1;
        }
        return n;
      }
      case 'liga-holat': {
        // [studentId, studentId, hafta, otgan]
        const [sid, , hafta, otgan] = v;
        const tier = h.darajalar.get(sid) ?? 0;
        const ks = h.kirishlar.filter(
          (k) =>
            k.studentId === sid && (k.weekStart === hafta || k.weekStart === otgan),
        );
        if (ks.length === 0)
          return [
            {
              tier,
              hafta: null,
              roomId: null,
              number: null,
              xonaDarajasi: null,
              place: null,
              promoted: null,
              hajm: 0,
            },
          ];
        return ks.map((k) => ({
          tier,
          hafta: k.weekStart,
          roomId: k.roomId,
          number: h.xonalar.find((x) => x.id === k.roomId)!.number,
          xonaDarajasi: k.tier,
          place: k.place,
          promoted: k.promoted,
          hajm: hajm(k.roomId),
        }));
      }
      case 'liga-xona': {
        // [hafta, keyingi, roomId]
        const [dan, gacha, roomId] = v;
        return h.kirishlar
          .filter((k) => k.roomId === roomId)
          .map((k) => {
            const [firstName, lastName] = h.ismlar.get(k.studentId) ?? [
              'Ism',
              String(k.studentId),
            ];
            return {
              studentId: k.studentId,
              firstName,
              lastName,
              points: ball(k.studentId, dan, gacha),
            };
          });
      }
      case 'liga-eng-eski': {
        // [companyId, joriy]
        const w =
          h.xonalar
            .filter(
              (x) =>
                x.companyId === v[0] && x.settledAt === null && x.weekStart < v[1],
            )
            .map((x) => x.weekStart)
            .sort()[0] ?? null;
        return [{ w }];
      }
      case 'liga-xonalarni-ol': {
        // [companyId, hafta]
        const ol = h.xonalar.filter(
          (x) => x.companyId === v[0] && x.weekStart === v[1] && x.settledAt === null,
        );
        for (const x of ol) x.settledAt = new Date();
        return ol.map((x) => ({ id: x.id, tier: x.tier }));
      }
      case 'liga-azolar-ballari': {
        // [hafta, keyingi, roomIds]
        const [dan, gacha, ids] = v;
        return h.kirishlar
          .filter((k) => (ids as number[]).includes(k.roomId))
          .map((k) => ({
            id: k.id,
            roomId: k.roomId,
            studentId: k.studentId,
            points: ball(k.studentId, dan, gacha),
          }));
      }
      case 'liga-natija-yoz': {
        // tuples (id, place, points, promoted)
        for (const [id, place, points, promoted] of tuples(v, 4) as any[]) {
          Object.assign(h.kirishlar.find((k) => k.id === id)!, {
            place,
            points,
            promoted,
          });
        }
        return v.length / 4;
      }
      case 'liga-kotar': {
        // tuples (studentId, companyId, tier); DO UPDATE SET tier = GREATEST(old, new)
        for (const [sid, , tier] of tuples(v, 3) as any[]) {
          h.darajalar.set(sid, Math.max(h.darajalar.get(sid) ?? 0, tier));
        }
        return v.length / 3;
      }
      case 'liga-darajalar': // [studentIds]
        return (v[0] as number[])
          .filter((sid) => h.darajalar.has(sid))
          .map((sid) => ({ studentId: sid, tier: h.darajalar.get(sid) }));
      case 'liga-hafta-azolari': // [hafta, studentIds]
        return h.kirishlar
          .filter(
            (k) => k.weekStart === v[0] && (v[1] as number[]).includes(k.studentId),
          )
          .map((k) => ({ studentId: k.studentId }));
      case 'guruhlar-yigindisi': {
        // [companyId, companyId, hafta, keyingi]
        const [, , dan, gacha] = v;
        const guruhlar = [...new Set(h.azolik.map((a) => a.groupId))];
        return guruhlar.map((g) => {
          const ids = [
            ...new Set(
              h.azolik.filter((a) => a.groupId === g).map((a) => a.studentId),
            ),
          ];
          return {
            groupId: g,
            name: h.guruhNomlari.get(g) ?? g,
            azolar: ids.length,
            ball: h.kunlar
              .filter(
                (k) =>
                  ids.includes(k.studentId) &&
                  k.groupKey === g &&
                  k.day >= dan &&
                  k.day < gacha,
              )
              .reduce((s, k) => s + k.points, 0),
          };
        });
      }
      case 'guruh-haftasi-yoz': {
        // tuples (companyId, weekStart, groupId, place, average, members, points); ON CONFLICT DO NOTHING
        let n = 0;
        for (const [companyId, weekStart, groupId, place, average, members, points] of tuples(v, 7) as any[]) {
          if (
            h.guruhHaftalari.some(
              (g) => g.weekStart === weekStart && g.groupId === groupId,
            )
          )
            continue;
          h.guruhHaftalari.push({
            companyId,
            weekStart,
            groupId,
            place,
            average,
            members,
            points,
          });
          n += 1;
        }
        return n;
      }
    }
    throw new Error(`liga soxta bazasi: tanilmagan so'rov "${m}"`);
  }

  const db: any = {
    $queryRaw: jest.fn(async (sql: Prisma.Sql) => javob(sql) as unknown[]),
    $executeRaw: jest.fn(async (sql: Prisma.Sql) => javob(sql) as number),
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db, h };
}
```

- [ ] **Step 2: Ism ko'rinishi bitta joyda** — `server/src/daf/shared/reyting-ismi.ts`:

```ts
/**
 * Reyting jadvallaridagi ism — markaz, guruh va liga xonasi bir xil
 * ko'rsatadi: to'liq ism, qisqartirilmaydi (06.09 §6.1 — markaz jadvali
 * filiallarni ataylab aralashtiradi, bu CEO qarori).
 */
export function reytingIsmi(s: { firstName: string; lastName: string }): string {
  return `${s.firstName} ${s.lastName}`;
}
```

`fortschritt.service.ts` importlariga `import { reytingIsmi } from '../shared/reyting-ismi';` va ikki joyda (`zentrumReytingi` hamda `qatorlargaAylantir` ichida):

```ts
    const nomMap = new Map(
      talabalar.map((t) => [t.id, `${t.firstName} ${t.lastName}`]),
    );
```

ni:

```ts
    const nomMap = new Map(talabalar.map((t) => [t.id, reytingIsmi(t)]));
```

ga almashtirish (`replace_all`).

Run: `cd server && npx jest src/daf/fortschritt`
Expected: PASS (xatti-harakat o'zgarmadi).

- [ ] **Step 3: Yiqiladigan testlar** — `server/src/daf/liga/liga-xona.spec.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { joinRoom, ligaJavobi, ligaSharoiti } from './liga-xona';
import { ligaBaza, type LigaBazaHolati } from './liga-baza.fake-spec';

const JETZT = new Date('2026-10-21T09:00:00Z'); // chorshanba, Toshkent
const HAFTA = '2026-10-19';
const OTGAN = '2026-10-12';

const sqlOf = (mock: jest.Mock, belgi: string) =>
  mock.mock.calls
    .map((c) => c[0] as Prisma.Sql)
    .find((s) => s.strings[0].includes(`/* ${belgi} */`))!;

/** `n` a'zoli xona, a'zolar `id * 100 + i`. */
function xonaQosh(
  h: LigaBazaHolati,
  id: number,
  number: number,
  n: number,
  tier = 0,
  weekStart = HAFTA,
) {
  h.xonalar.push({ id, companyId: 1, weekStart, tier, number, settledAt: null });
  for (let i = 0; i < n; i += 1) {
    h.kirishlar.push({
      id: id * 100 + i,
      roomId: id,
      studentId: id * 100 + i,
      companyId: 1,
      weekStart,
      tier,
      place: null,
      points: null,
      promoted: false,
    });
  }
}

describe('ligaSharoiti — seans oxiridagi bitta so`rov', () => {
  it('bitta SQL: daraja, a`zolik, kechikkan hisob, ikki g`olib belgisi', async () => {
    const { db } = ligaBaza();
    await ligaSharoiti(db, 55, 1, JETZT);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlOf(db.$queryRaw, 'liga-sharoiti');
    const matn = sql.strings.join('?');
    for (const ustun of [
      'AS tier',
      'AS azo',
      'AS kechikkan',
      'AS "xonaGolib"',
      'AS "guruhBirinchi"',
    ])
      expect(matn).toContain(ustun);
    expect(sql.values.slice(0, 4)).toEqual([55, HAFTA, 55, 1]);
  });

  it('daraja qatori yo`q — Bronza (0), xonada emas', async () => {
    const { db } = ligaBaza();
    expect(await ligaSharoiti(db, 55, 1, JETZT)).toEqual({
      tier: 0,
      azo: false,
      kechikkan: false,
      xonaGolib: false,
      guruhBirinchi: false,
    });
  });

  it('xona g`olibi: 1-o`rin, kamida 50 ball, xonada kamida 5 kishi', async () => {
    const holat = (points: number, n: number) => {
      const { db, h } = ligaBaza();
      xonaQosh(h, 1, 1, n, 0, OTGAN);
      h.xonalar[0].settledAt = new Date();
      h.kirishlar.forEach((k, i) =>
        Object.assign(k, { place: i + 1, points: i === 0 ? points : 0 }),
      );
      h.kirishlar[0].studentId = 55;
      return ligaSharoiti(db, 55, 1, JETZT);
    };
    expect((await holat(50, 5)).xonaGolib).toBe(true);
    expect((await holat(49, 5)).xonaGolib).toBe(false);
    expect((await holat(50, 4)).xonaGolib).toBe(false);
  });

  it('guruh birinchi: o`sha hafta SHU guruh uchun kamida 1 ball', async () => {
    const { db, h } = ligaBaza();
    h.guruhHaftalari.push({
      companyId: 1,
      weekStart: OTGAN,
      groupId: 'g-1',
      place: 1,
      average: 9,
      members: 3,
      points: 27,
    });
    h.kunlar.push({ studentId: 55, companyId: 1, day: '2026-10-14', groupKey: 'g-2', points: 30 });
    expect((await ligaSharoiti(db, 55, 1, JETZT)).guruhBirinchi).toBe(false);
    h.kunlar.push({ studentId: 55, companyId: 1, day: '2026-10-18', groupKey: 'g-1', points: 10 });
    expect((await ligaSharoiti(db, 55, 1, JETZT)).guruhBirinchi).toBe(true);
  });

  it('kechikkan: kompaniyada o`tgan haftaning hisoblanmagan xonasi bor', async () => {
    const { db, h } = ligaBaza();
    xonaQosh(h, 1, 1, 2, 0, OTGAN);
    expect((await ligaSharoiti(db, 55, 1, JETZT)).kechikkan).toBe(true);
  });
});

describe('joinRoom — hafta ichida qo`shilish', () => {
  it('xona yo`q — 1-xona ochiladi; daraja qatori yo`q o`quvchi Bronzada', async () => {
    const { db, h } = ligaBaza();
    const r = await joinRoom(db, 55, 1, JETZT);
    expect(r.yangi).toBe(true);
    expect(h.xonalar).toEqual([
      expect.objectContaining({ id: r.roomId, weekStart: HAFTA, tier: 0, number: 1 }),
    ]);
    expect(h.kirishlar).toEqual([
      expect.objectContaining({ roomId: r.roomId, studentId: 55, weekStart: HAFTA, tier: 0 }),
    ]);
  });

  it('o`z darajasining a`zosi eng kam xonasiga', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 2);
    xonaQosh(h, 1, 1, 20, 2);
    xonaQosh(h, 2, 2, 18, 2);
    xonaQosh(h, 3, 3, 5, 0);
    expect((await joinRoom(db, 55, 1, JETZT)).roomId).toBe(2);
  });

  it('hamma xona 30 — yangi xona keyingi raqam bilan', async () => {
    const { db, h } = ligaBaza();
    xonaQosh(h, 1, 1, 30);
    xonaQosh(h, 2, 2, 30);
    const r = await joinRoom(db, 55, 1, JETZT);
    expect(h.xonalar.find((x) => x.id === r.roomId)?.number).toBe(3);
  });

  it('allaqachon a`zo — o`sha xona, yozuv yo`q', async () => {
    const { db, h } = ligaBaza();
    xonaQosh(h, 1, 1, 3);
    h.kirishlar[0].studentId = 55;
    expect(await joinRoom(db, 55, 1, JETZT)).toEqual({ roomId: 1, yangi: false });
    expect(h.chaqiruvlar).not.toContain('liga-azo-qosh');
    expect(h.chaqiruvlar).not.toContain('liga-xona-och');
  });

  it('qulflar: hisob qulfi (shared) → daraja → daraja qulfi → tekshiruv; ON CONFLICT bilan', async () => {
    const { db, h } = ligaBaza();
    await joinRoom(db, 55, 1, JETZT);
    expect(h.chaqiruvlar.slice(0, 4)).toEqual([
      'liga-qulf-umumiy',
      'liga-daraja',
      'liga-xona-qulf',
      'liga-kirish',
    ]);
    expect(sqlOf(db.$queryRaw, 'liga-qulf-umumiy').strings.join('?')).toContain(
      'pg_advisory_xact_lock_shared',
    );
    expect(sqlOf(db.$executeRaw, 'liga-azo-qosh').strings.join('?')).toMatch(
      /ON CONFLICT \("weekStart", "studentId"\) DO NOTHING/,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('ligaJavobi — GET liga', () => {
  it('xonada emas: daraja ko`rinadi, xona yo`q', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 1);
    expect(await ligaJavobi(db, 55, JETZT)).toEqual({
      haftaBoshi: HAFTA,
      haftaOxiri: '2026-10-25',
      azo: false,
      daraja: { tier: 1, nomi: 'Kumush' },
      xona: null,
      otganHafta: null,
    });
  });

  it('xona jadvali: shu hafta ballari (hamma guruh), saralangan, o`z qatori, 15 kishidan zona faol', async () => {
    const { db, h } = ligaBaza();
    h.xonalar.push({ id: 1, companyId: 1, weekStart: HAFTA, tier: 0, number: 2, settledAt: null });
    for (let i = 0; i < 15; i += 1)
      h.kirishlar.push({ id: 10 + i, roomId: 1, studentId: 50 + i, companyId: 1, weekStart: HAFTA, tier: 0, place: null, points: null, promoted: false });
    h.kunlar.push(
      { studentId: 55, companyId: 1, day: '2026-10-20', groupKey: 'g-1', points: 40 },
      { studentId: 55, companyId: 1, day: '2026-10-21', groupKey: '', points: 20 },
      { studentId: 51, companyId: 1, day: '2026-10-19', groupKey: '', points: 60 },
      { studentId: 52, companyId: 1, day: '2026-10-18', groupKey: '', points: 999 },
    );
    h.ismlar.set(55, ['Ali', 'Valiyev']);
    const j = await ligaJavobi(db, 55, JETZT);
    expect(j.azo).toBe(true);
    expect(j.xona).toMatchObject({
      raqam: 2,
      hajmi: 15,
      kotarilishZonasi: { soni: 5, faol: true },
    });
    expect(j.xona!.qatorlar.slice(0, 3)).toEqual([
      { studentId: 51, name: 'Ism 51', punkte: 60, platz: 1, selbst: false },
      { studentId: 55, name: 'Ali Valiyev', punkte: 60, platz: 2, selbst: true },
      { studentId: 50, name: 'Ism 50', punkte: 0, platz: 3, selbst: false },
    ]);
  });

  it('o`tgan hafta: hisoblangan bo`lsa o`rin, ko`tarilish, xona hajmi; hisoblanmagan bo`lsa null', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 1);
    xonaQosh(h, 7, 1, 16, 0, OTGAN);
    h.kirishlar.forEach((k, i) =>
      Object.assign(k, { place: i + 1, points: 100 - i, promoted: i < 5 }),
    );
    h.kirishlar[2].studentId = 55;
    expect((await ligaJavobi(db, 55, JETZT)).otganHafta).toEqual({
      daraja: { tier: 0, nomi: 'Bronza' },
      orin: 3,
      kotarildi: true,
      hajmi: 16,
    });
    for (const k of h.kirishlar) k.place = null;
    expect((await ligaJavobi(db, 55, JETZT)).otganHafta).toBeNull();
  });

  it('Olmos xonasi: zona yo`q; GET hech narsa yozmaydi', async () => {
    const { db, h } = ligaBaza();
    h.darajalar.set(55, 4);
    xonaQosh(h, 1, 1, 1, 4);
    h.kirishlar[0].studentId = 55;
    const j = await ligaJavobi(db, 55, JETZT);
    expect(j.xona!.kotarilishZonasi).toEqual({ soni: 0, faol: false });
    expect(h.chaqiruvlar).toEqual(['liga-holat', 'liga-xona']);
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/liga/liga-xona.spec.ts`
Expected: FAIL (`Cannot find module './liga-xona'`).

- [ ] **Step 5: Yozish** — `server/src/daf/liga/liga-xona.ts`:

```ts
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { wochenStartTag } from '../uebung/punkte';
import { reytingIsmi } from '../shared/reyting-ismi';
import type { ReytingZeile } from '../fortschritt/fortschritt.service';
import {
  GOLIB_MIN_AZO,
  GOLIB_MIN_BALL,
  darajaNomi,
  engKamXona,
  kotarilishZonasi,
  saralaXona,
} from './liga-qoidalari';

/**
 * Advisory qulf kalitlari (ADR-0116). Hisob (`settleWeek`) kompaniya kalitini
 * AJRATIB oladi, `joinRoom` uni UMUMIY (shared) oladi: hisob paytida hech kim
 * xonaga qo'shilmaydi va hisob ko'targan o'quvchi yangi darajasidan tushadi.
 * Xona kaliti bir (kompaniya, hafta, daraja) ning xonalarini navbat bilan
 * tanlatadi.
 */
export const LIGA_HISOB_KALIT = 1279870785;
export const LIGA_XONA_KALIT = 1279870786;

export type LigaTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;
type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Bitta SQL'ga 1 000 qatordan (bog'langan qiymatlar chegarasidan ancha past). */
export function bolaklar<T>(xs: T[], n = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface LigaSharoiti {
  tier: number;
  /** Shu hafta xonada. */
  azo: boolean;
  /** Kompaniyada joriy haftadan oldingi hisoblanmagan xona bor (cron o'tkazib yuborgan). */
  kechikkan: boolean;
  /** Kamida bitta xonada 1-o'rin, ≥ 50 ball, xonada ≥ 5 a'zo. */
  xonaGolib: boolean;
  /** Guruhlar jadvalida 1-o'rin olgan haftada shu guruh uchun ≥ 1 ball. */
  guruhBirinchi: boolean;
}

/**
 * Seans oxirining liga holati — BITTA so'rov (spec S3 §3, §1.5). Bog'langan
 * qiymatlar tartibi `[studentId, hafta, studentId, companyId, hafta,
 * studentId, GOLIB_MIN_BALL, GOLIB_MIN_AZO, studentId]` — soxta baza
 * (`liga-baza.fake-spec.ts`) shunga tayanadi.
 */
export async function ligaSharoiti(
  db: Db,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<LigaSharoiti> {
  const hafta = wochenStartTag(jetzt);
  const [satr] = await db.$queryRaw<LigaSharoiti[]>`/* liga-sharoiti */
    SELECT
      COALESCE((SELECT tier FROM "DafStudentLeague" WHERE "studentId" = ${studentId}), 0)::int AS tier,
      EXISTS (SELECT 1 FROM "DafLeagueEntry"
              WHERE "weekStart" = ${hafta}::date AND "studentId" = ${studentId}) AS azo,
      EXISTS (SELECT 1 FROM "DafLeagueRoom"
              WHERE "companyId" = ${companyId} AND "settledAt" IS NULL
                AND "weekStart" < ${hafta}::date) AS kechikkan,
      EXISTS (SELECT 1 FROM "DafLeagueEntry" e
              WHERE e."studentId" = ${studentId} AND e.place = 1
                AND e.points >= ${GOLIB_MIN_BALL}
                AND (SELECT COUNT(*) FROM "DafLeagueEntry" x WHERE x."roomId" = e."roomId") >= ${GOLIB_MIN_AZO}
             ) AS "xonaGolib",
      EXISTS (SELECT 1 FROM "DafStudentDay" d
              JOIN "DafGroupWeek" g ON g."groupId" = d."groupKey"
               AND g."weekStart" = d.day - (EXTRACT(ISODOW FROM d.day)::int - 1)
              WHERE d."studentId" = ${studentId} AND d.points > 0 AND g.place = 1
             ) AS "guruhBirinchi"`;
  return satr;
}

/** Yangi xonalar: raqamlar shu (kompaniya, hafta, daraja) ning eng kattasidan keyin. */
export function xonalarOch(
  tx: LigaTx,
  companyId: number,
  hafta: string,
  tier: number,
  soni: number,
): Promise<{ id: number; number: number }[]> {
  return tx.$queryRaw<{ id: number; number: number }[]>`/* liga-xona-och */
    INSERT INTO "DafLeagueRoom" ("companyId", "weekStart", "tier", "number")
    SELECT ${companyId}::int, ${hafta}::date, ${tier}::int, m.eng + g
    FROM (SELECT COALESCE(MAX(number), 0)::int AS eng FROM "DafLeagueRoom"
          WHERE "companyId" = ${companyId} AND "weekStart" = ${hafta}::date
            AND tier = ${tier}) AS m,
         generate_series(1, ${soni}::int) AS g
    RETURNING id, number`;
}

/** A'zolik qatorlari; hafta ichida bitta xona (`@@unique([weekStart, studentId])`) — takror jim o'tkaziladi. */
export async function azolarniQosh(
  tx: LigaTx,
  companyId: number,
  hafta: string,
  tier: number,
  qatorlar: { roomId: number; studentId: number }[],
): Promise<number> {
  let n = 0;
  for (const b of bolaklar(qatorlar)) {
    n += await tx.$executeRaw`/* liga-azo-qosh */
      INSERT INTO "DafLeagueEntry" ("roomId", "studentId", "companyId", "weekStart", "tier")
      VALUES ${Prisma.join(
        b.map(
          (q) =>
            Prisma.sql`(${q.roomId}::int, ${q.studentId}::int, ${companyId}::int, ${hafta}::date, ${tier}::int)`,
        ),
      )}
      ON CONFLICT ("weekStart", "studentId") DO NOTHING`;
  }
  return n;
}

/**
 * Hafta ichida qo'shilish (spec S3 §1.3, §1.5) — faqat seans oxirida. O'z
 * darajasining a'zosi eng kam xonasi; hammasi 30 bo'lsa yangi xona. Qulf
 * tartibi doim bir xil (hisob → daraja), shuning uchun hisob bilan o'zaro
 * qulflanish bo'lmaydi; a'zolik qulfdan KEYIN tekshiriladi.
 */
export async function joinRoom(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<{ roomId: number; yangi: boolean }> {
  const hafta = wochenStartTag(jetzt);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`/* liga-qulf-umumiy */
        SELECT 1 AS ok FROM pg_advisory_xact_lock_shared(${LIGA_HISOB_KALIT}::int, ${companyId}::int)`;
      const [daraja] = await tx.$queryRaw<{ tier: number }[]>`/* liga-daraja */
        SELECT tier FROM "DafStudentLeague" WHERE "studentId" = ${studentId}`;
      const tier = daraja?.tier ?? 0;
      await tx.$queryRaw`/* liga-xona-qulf */
        SELECT 1 AS ok FROM pg_advisory_xact_lock(${LIGA_XONA_KALIT}::int, hashtext(${`${companyId}:${hafta}:${tier}`}::text))`;
      const [bor] = await tx.$queryRaw<{ roomId: number }[]>`/* liga-kirish */
        SELECT "roomId" FROM "DafLeagueEntry"
        WHERE "weekStart" = ${hafta}::date AND "studentId" = ${studentId}`;
      if (bor) return { roomId: bor.roomId, yangi: false };
      const xonalar = await tx.$queryRaw<
        { id: number; number: number; hajm: number }[]
      >`/* liga-xonalar-hajmi */
        SELECT r.id, r.number, COUNT(e.id)::int AS hajm
        FROM "DafLeagueRoom" r
        LEFT JOIN "DafLeagueEntry" e ON e."roomId" = r.id
        WHERE r."companyId" = ${companyId} AND r."weekStart" = ${hafta}::date
          AND r.tier = ${tier}
        GROUP BY r.id, r.number`;
      const roomId =
        engKamXona(xonalar) ??
        (await xonalarOch(tx, companyId, hafta, tier, 1))[0].id;
      await azolarniQosh(tx, companyId, hafta, tier, [{ roomId, studentId }]);
      return { roomId, yangi: true };
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}

export interface LigaDarajasi {
  tier: number;
  nomi: string;
}

/** `GET .../liga` javobi (spec S3 §4). */
export interface LigaJavobi {
  haftaBoshi: string;
  haftaOxiri: string;
  azo: boolean;
  daraja: LigaDarajasi;
  xona: {
    raqam: number;
    hajmi: number;
    qatorlar: ReytingZeile[];
    kotarilishZonasi: { soni: number; faol: boolean };
  } | null;
  otganHafta: {
    daraja: LigaDarajasi;
    orin: number;
    kotarildi: boolean;
    hajmi: number;
  } | null;
}

interface HolatSatri {
  tier: number;
  hafta: string | null;
  roomId: number | null;
  number: number | null;
  xonaDarajasi: number | null;
  place: number | null;
  promoted: boolean | null;
  hajm: number;
}

const daraja = (tier: number): LigaDarajasi => ({ tier, nomi: darajaNomi(tier) });

/**
 * O'quvchining xonasi va darajasi — hech narsa YOZMAYDI (xonada bo'lmagan
 * o'quvchi «birinchi seansdan keyin» ko'radi). Ikki so'rov: holat (daraja,
 * joriy va o'tgan hafta a'zoligi, xona hajmi) va xona qatorlari.
 */
export async function ligaJavobi(
  db: Db,
  studentId: number,
  jetzt: Date,
): Promise<LigaJavobi> {
  const hafta = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(hafta, -7);
  const satrlar = await db.$queryRaw<HolatSatri[]>`/* liga-holat */
    SELECT COALESCE((SELECT tier FROM "DafStudentLeague" WHERE "studentId" = ${studentId}), 0)::int AS tier,
           to_char(e."weekStart", 'YYYY-MM-DD') AS hafta,
           e."roomId", r.number, e.tier AS "xonaDarajasi", e.place, e.promoted,
           (SELECT COUNT(*)::int FROM "DafLeagueEntry" x WHERE x."roomId" = e."roomId") AS hajm
    FROM (SELECT 1) AS bir
    LEFT JOIN "DafLeagueEntry" e
      ON e."studentId" = ${studentId} AND e."weekStart" IN (${hafta}::date, ${otgan}::date)
    LEFT JOIN "DafLeagueRoom" r ON r.id = e."roomId"`;
  const tier = satrlar[0]?.tier ?? 0;
  const joriy = satrlar.find((s) => s.hafta === hafta);
  const oldingi = satrlar.find((s) => s.hafta === otgan && s.place !== null);
  const qatorlar = joriy
    ? await xonaQatorlari(db, joriy.roomId!, hafta, studentId)
    : null;
  return {
    haftaBoshi: hafta,
    haftaOxiri: addDaysToDateStr(hafta, 6),
    azo: !!joriy,
    daraja: daraja(tier),
    xona:
      joriy && qatorlar
        ? {
            raqam: joriy.number!,
            hajmi: qatorlar.length,
            qatorlar,
            kotarilishZonasi: kotarilishZonasi(qatorlar.length, joriy.xonaDarajasi!),
          }
        : null,
    otganHafta: oldingi
      ? {
          daraja: daraja(oldingi.xonaDarajasi!),
          orin: oldingi.place!,
          kotarildi: oldingi.promoted === true,
          hajmi: oldingi.hajm,
        }
      : null,
  };
}

/** Xona jadvali: a'zolar shu hafta (hamma `groupKey`) topgan ball bilan; 30 kishi — arzon. */
async function xonaQatorlari(
  db: Db,
  roomId: number,
  hafta: string,
  studentId: number,
): Promise<ReytingZeile[]> {
  const keyingi = addDaysToDateStr(hafta, 7);
  const azolar = await db.$queryRaw<
    { studentId: number; firstName: string; lastName: string; points: number }[]
  >`/* liga-xona */
    SELECT e."studentId", s."firstName", s."lastName", COALESCE(SUM(d.points), 0)::int AS points
    FROM "DafLeagueEntry" e
    JOIN "Student" s ON s.id = e."studentId"
    LEFT JOIN "DafStudentDay" d ON d."studentId" = e."studentId"
      AND d.day >= ${hafta}::date AND d.day < ${keyingi}::date
    WHERE e."roomId" = ${roomId}
    GROUP BY e."studentId", s."firstName", s."lastName"`;
  return saralaXona(azolar).map((a, i) => ({
    studentId: a.studentId,
    name: reytingIsmi(a),
    punkte: a.points,
    platz: i + 1,
    selbst: a.studentId === studentId,
  }));
}
```

- [ ] **Step 6: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/liga`
Expected: PASS (`liga-xona.spec.ts` 14 test, qoidalar 25).

- [ ] **Step 7: Haqiqiy Postgres'da tekshiruv** (`$S1_DB`, Task 1 Step 6–7). Vaqtinchalik `server/scripts/_probe-liga-xona.ts`:

```ts
/** VAQTINCHA (S3 Task 3): joinRoom va liga o'qishi haqiqiy Postgres'da. Commit qilinmaydi. */
import { run } from './lib/check-cli';
import { assertLocalDb } from './load/local-db-guard';
import { joinRoom, ligaJavobi, ligaSharoiti } from '../src/daf/liga/liga-xona';
import { wochenStartTag } from '../src/daf/uebung/punkte';

assertLocalDb();

run(async (prisma) => {
  const t = await prisma.student.findMany({
    where: { deletedAt: null },
    select: { id: true, companyId: true },
    orderBy: { id: 'asc' },
    take: 61,
  });
  const jetzt = new Date();
  const bir = t[0];
  // Bitta o'quvchi 10 marta parallel — bitta a'zolik.
  const birXil = await Promise.all(
    Array.from({ length: 10 }, () => joinRoom(prisma as any, bir.id, bir.companyId, jetzt)),
  );
  // 60 boshqa o'quvchi parallel — xonalar 30 dan oshmaydi.
  const kopi = await Promise.all(
    t.slice(1).map((s) => joinRoom(prisma as any, s.id, s.companyId, jetzt)),
  );
  const hafta = wochenStartTag(jetzt);
  const xonalar = await prisma.$queryRaw<{ number: number; hajm: number }[]>`
    SELECT r.number, COUNT(e.id)::int AS hajm FROM "DafLeagueRoom" r
    JOIN "DafLeagueEntry" e ON e."roomId" = r.id
    WHERE r."weekStart" = ${hafta}::date GROUP BY r.number ORDER BY r.number`;
  const [birKirish] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "DafLeagueEntry" WHERE "studentId" = ${bir.id}`;
  const javob = await ligaJavobi(prisma as any, bir.id, jetzt);
  console.log({
    birXonalar: new Set(birXil.map((x) => x.roomId)).size,
    birYangi: birXil.filter((x) => x.yangi).length,
    kopiYangi: kopi.filter((x) => x.yangi).length,
    xonalar,
    birKirish: birKirish.n,
    holat: await ligaSharoiti(prisma as any, bir.id, bir.companyId, jetzt),
    hajmi: javob.xona?.hajmi,
    birinchiQator: javob.xona?.qatorlar[0],
  });
});
```

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/_probe-liga-xona.ts
```

Expected: `birXonalar: 1`, `birYangi: 1`, `kopiYangi: 60`, `xonalar: [{ number: 1, hajm: 30 }, { number: 2, hajm: 30 }, { number: 3, hajm: 1 }]`, `birKirish: 1`, `holat: { tier: 0, azo: true, kechikkan: false, xonaGolib: false, guruhBirinchi: false }`, `hajmi: 30`, `birinchiQator` — `punkte: 0` (bazada urinish yo'q) va eng kichik id. SQL xatosi (`syntax error`, `could not determine data type`) — kodni tuzatib, probani qayta yurgizish. Keyin tozalash:

```bash
docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c 'DELETE FROM "DafLeagueEntry"; DELETE FROM "DafLeagueRoom";'
rm server/scripts/_probe-liga-xona.ts
```

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prettier --write src/daf/liga src/daf/shared/reyting-ismi.ts src/daf/fortschritt/fortschritt.service.ts && npx eslint --quiet src/daf/liga src/daf/shared/reyting-ismi.ts src/daf/fortschritt/fortschritt.service.ts && npx jest src/daf && git status --short && git add src/daf/liga src/daf/shared/reyting-ismi.ts src/daf/fortschritt/fortschritt.service.ts && git commit -m "feat(daf): league room join and the room read

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`git status --short` da `scripts/_probe-*` yo'qligini ko'rish.)

---

### Task 4: Jonli guruhlar jadvali — `guruhlar-jadvali.ts`

**Files:**
- Modify: `server/src/daf/shared/student-scope.ts` (parametr tipi)
- Create: `server/src/daf/liga/guruhlar-jadvali.ts`
- Create: `server/src/daf/liga/guruhlar-jadvali.spec.ts`
- Temporary: `server/scripts/_probe-guruhlar.ts` (commit qilinmaydi)

**Interfaces:**
- Consumes: `guruhlarniSarala`, `bahoKorinishi`, `GURUH_MIN_AZO`, `GURUH_TOP`, `GuruhYigindisi`, `GuruhNatija` (Task 2); `ligaBaza` (Task 3); `wochenStartTag`, `addDaysToDateStr`; `currentGroupId` (`daf/shared/student-scope.ts`).
- Produces:
  - `currentGroupId(prisma: Pick<Prisma.TransactionClient, 'enrollment'>, studentId: number): Promise<string | null>` (faqat tip kengaydi; `PrismaService` chaqiruvchilari o'zgarmaydi)
  - `guruhlarYigindisi(db: Pick<Prisma.TransactionClient, '$queryRaw'>, companyId: number, haftaBoshi: string): Promise<GuruhYigindisi[]>` — SQL `/* guruhlar-yigindisi */`, qiymatlar `[companyId, companyId, haftaBoshi, keyingi]`
  - `interface GuruhQatori { groupId: string; name: string; baho: number; azolar: number; platz: number; selbst: boolean }`
  - `interface GuruhlarJavobi { haftaBoshi: string; qatorlar: GuruhQatori[]; oz: { orin: number; baho: number; azolar: number; nomi: string } | null; minAzolar: number }`
  - `guruhlarJavobi(db: Pick<Prisma.TransactionClient, '$queryRaw' | 'enrollment'>, studentId: number, companyId: number, jetzt: Date): Promise<GuruhlarJavobi>`

- [ ] **Step 1: `currentGroupId` tipini kengaytirish** — `server/src/daf/shared/student-scope.ts` dagi:

```ts
import { PrismaService } from '../../prisma/prisma.service';
```

ni:

```ts
import type { Prisma } from '@prisma/client';
```

ga, va:

```ts
export async function currentGroupId(
  prisma: PrismaService,
  studentId: number,
): Promise<string | null> {
```

ni:

```ts
export async function currentGroupId(
  prisma: Pick<Prisma.TransactionClient, 'enrollment'>,
  studentId: number,
): Promise<string | null> {
```

ga almashtirish. Run: `cd server && npm run typecheck` → 0 xato.

- [ ] **Step 2: Yiqiladigan testlar** — `server/src/daf/liga/guruhlar-jadvali.spec.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { guruhlarJavobi } from './guruhlar-jadvali';
import { ligaBaza } from './liga-baza.fake-spec';

const JETZT = new Date('2026-10-21T09:00:00Z'); // hafta 2026-10-19

/**
 * 12 guruh × 3 a'zo. g-01 eng yaxshi: a'zo boshiga (13 − g) × 3 ball, ya'ni
 * baho g-01 = 36 … g-12 = 3. O'quvchining guruhi — `ozGuruh`.
 */
function baza(ozGuruh: string | null) {
  const { db, h } = ligaBaza();
  for (let g = 1; g <= 12; g += 1) {
    const id = `g-${String(g).padStart(2, '0')}`;
    h.guruhNomlari.set(id, `Guruh ${g}`);
    for (let a = 0; a < 3; a += 1) {
      const sid = g * 10 + a;
      h.azolik.push({ groupId: id, studentId: sid });
      h.kunlar.push({ studentId: sid, companyId: 1, day: '2026-10-20', groupKey: id, points: (13 - g) * 3 });
    }
  }
  db.enrollment = {
    findFirst: jest.fn(async () => (ozGuruh ? { groupId: ozGuruh } : null)),
  };
  return { db, h };
}

describe('guruhlarJavobi — GET guruhlar', () => {
  it('TOP 10 + o`z guruhi haqiqiy o`rni bilan', async () => {
    const { db } = baza('g-12');
    const j = await guruhlarJavobi(db, 120, 1, JETZT);
    expect(j.haftaBoshi).toBe('2026-10-19');
    expect(j.minAzolar).toBe(3);
    expect(j.qatorlar).toHaveLength(11);
    expect(j.qatorlar[0]).toEqual({ groupId: 'g-01', name: 'Guruh 1', baho: 36, azolar: 3, platz: 1, selbst: false });
    expect(j.qatorlar[10]).toEqual({ groupId: 'g-12', name: 'Guruh 12', baho: 3, azolar: 3, platz: 12, selbst: true });
    expect(j.oz).toEqual({ orin: 12, baho: 3, azolar: 3, nomi: 'Guruh 12' });
  });

  it('o`z guruhi TOP 10 ichida — takrorlanmaydi', async () => {
    const j = await guruhlarJavobi(baza('g-03').db, 30, 1, JETZT);
    expect(j.qatorlar).toHaveLength(10);
    expect(j.qatorlar.filter((q) => q.selbst).map((q) => q.platz)).toEqual([3]);
  });

  it('guruhsiz yoki 3 kishidan kam guruh — oz: null, kichik guruh jadvalda yo`q', async () => {
    expect((await guruhlarJavobi(baza(null).db, 999, 1, JETZT)).oz).toBeNull();
    const { db, h } = baza('g-kichik');
    h.azolik.push({ groupId: 'g-kichik', studentId: 900 }, { groupId: 'g-kichik', studentId: 901 });
    const j = await guruhlarJavobi(db, 900, 1, JETZT);
    expect(j.oz).toBeNull();
    expect(j.qatorlar.some((q) => q.groupId === 'g-kichik')).toBe(false);
  });

  it('mashq qilmagan a`zo bahoni pasaytiradi; boshqa guruh uchun topilgan ball sanalmaydi', async () => {
    const { db, h } = baza(null);
    h.azolik.push({ groupId: 'g-01', studentId: 999 }); // 4-a'zo, 0 ball
    h.kunlar.push({ studentId: 10, companyId: 1, day: '2026-10-20', groupKey: 'g-05', points: 500 });
    const j = await guruhlarJavobi(db, 999, 1, JETZT);
    // g-01: 108 / 4 = 27 — g-02 (33) va g-03 (30) dan keyin, g-04 (27) bilan tengda id kichik.
    expect(j.qatorlar.find((q) => q.groupId === 'g-01')).toMatchObject({ baho: 27, azolar: 4, platz: 3 });
    expect(j.qatorlar.find((q) => q.groupId === 'g-05')).toMatchObject({ baho: 24 });
  });

  it('SQL: faol guruh, faol a`zolik, guruh kaliti — a`zoning o`zi; GET hech narsa yozmaydi', async () => {
    const { db, h } = baza(null);
    await guruhlarJavobi(db, 1, 1, JETZT);
    const sql = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const matn = sql.strings.join('?');
    expect(matn).toContain('/* guruhlar-yigindisi */');
    expect(matn).toMatch(/g\."statusEnum" = 'ACTIVE'/);
    expect(matn).toMatch(/g\."deletedAt" IS NULL/);
    expect(matn).toMatch(/e\.status = 'ACTIVE'/);
    expect(matn).toMatch(/d\."groupKey" = a\."groupId"/);
    expect(sql.values).toEqual([1, 1, '2026-10-19', '2026-10-26']);
    expect(h.chaqiruvlar).toEqual(['guruhlar-yigindisi']);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/liga/guruhlar-jadvali.spec.ts`
Expected: FAIL (`Cannot find module './guruhlar-jadvali'`).

- [ ] **Step 4: Yozish** — `server/src/daf/liga/guruhlar-jadvali.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { wochenStartTag } from '../uebung/punkte';
import { currentGroupId } from '../shared/student-scope';
import {
  GURUH_MIN_AZO,
  GURUH_TOP,
  bahoKorinishi,
  guruhlarniSarala,
  type GuruhNatija,
  type GuruhYigindisi,
} from './liga-qoidalari';

export interface GuruhQatori {
  groupId: string;
  name: string;
  /** A'zolarning o'rtacha haftalik bali, 1 o'nlik xona. */
  baho: number;
  azolar: number;
  platz: number;
  selbst: boolean;
}

/** `GET .../guruhlar` javobi (spec S3 §4). */
export interface GuruhlarJavobi {
  haftaBoshi: string;
  qatorlar: GuruhQatori[];
  oz: { orin: number; baho: number; azolar: number; nomi: string } | null;
  minAzolar: number;
}

/**
 * Markazning faol guruhlari: hozirgi faol a'zolar soni va ular shu hafta SHU
 * guruh uchun (`groupKey = groupId`, ball topilgan paytdagi guruh) topgan
 * ball — mavjud guruh jadvali (`gruppeHaftaligi`) bilan bir xil qoida.
 * FILIALGA CHEKLANMAYDI (06.09 §6.1). Bog'langan qiymatlar
 * `[companyId, companyId, haftaBoshi, keyingi]` — soxta baza shunga tayanadi.
 */
export function guruhlarYigindisi(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: number,
  haftaBoshi: string,
): Promise<GuruhYigindisi[]> {
  const keyingi = addDaysToDateStr(haftaBoshi, 7);
  return db.$queryRaw<GuruhYigindisi[]>`/* guruhlar-yigindisi */
    WITH azo AS (
      SELECT DISTINCT e."groupId", e."studentId"
      FROM "Enrollment" e
      JOIN "Group" g ON g.id = e."groupId"
      WHERE g."companyId" = ${companyId} AND g."statusEnum" = 'ACTIVE'
        AND g."deletedAt" IS NULL AND e.status = 'ACTIVE'
    ),
    ball AS (
      SELECT a."groupId", SUM(d.points)::int AS p
      FROM azo a
      JOIN "DafStudentDay" d
        ON d."studentId" = a."studentId" AND d."groupKey" = a."groupId"
      WHERE d."companyId" = ${companyId}
        AND d.day >= ${haftaBoshi}::date AND d.day < ${keyingi}::date
      GROUP BY a."groupId"
    )
    SELECT a."groupId", g.name, COUNT(*)::int AS azolar,
           COALESCE(MAX(b.p), 0)::int AS ball
    FROM azo a
    JOIN "Group" g ON g.id = a."groupId"
    LEFT JOIN ball b ON b."groupId" = a."groupId"
    GROUP BY a."groupId", g.name`;
}

/**
 * Jonli jadval — hech narsa YOZMAYDI. TOP 10 + o'z guruhi haqiqiy o'rni
 * bilan (markaz jadvalining TOP 50 + o'z qatori qoidasi kabi). Guruhsiz yoki
 * 3 kishidan kam guruhdagi o'quvchida `oz: null`.
 */
export async function guruhlarJavobi(
  db: Pick<Prisma.TransactionClient, '$queryRaw' | 'enrollment'>,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<GuruhlarJavobi> {
  const haftaBoshi = wochenStartTag(jetzt);
  const [rows, ozId] = await Promise.all([
    guruhlarYigindisi(db, companyId, haftaBoshi),
    currentGroupId(db, studentId),
  ]);
  const jadval = guruhlarniSarala(rows);
  const oz = ozId ? (jadval.find((g) => g.groupId === ozId) ?? null) : null;
  const qator = (g: GuruhNatija): GuruhQatori => ({
    groupId: g.groupId,
    name: g.name,
    baho: bahoKorinishi(g.baho),
    azolar: g.azolar,
    platz: g.place,
    selbst: g.groupId === ozId,
  });
  const top = jadval.slice(0, GURUH_TOP);
  return {
    haftaBoshi,
    qatorlar: (oz && oz.place > GURUH_TOP ? [...top, oz] : top).map(qator),
    oz: oz
      ? { orin: oz.place, baho: bahoKorinishi(oz.baho), azolar: oz.azolar, nomi: oz.name }
      : null,
    minAzolar: GURUH_MIN_AZO,
  };
}
```

- [ ] **Step 5: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/liga src/daf/fortschritt src/daf/daf-attempt.service.spec.ts`
Expected: PASS (`guruhlar-jadvali.spec.ts` 5 test; `currentGroupId` chaqiruvchilari o'zgarmagan).

- [ ] **Step 6: Haqiqiy Postgres'da SQL tekshiruvi** — vaqtinchalik `server/scripts/_probe-guruhlar.ts`:

```ts
/** VAQTINCHA (S3 Task 4): guruhlar jadvali SQL'i haqiqiy Postgres'da. Commit qilinmaydi. */
import { run } from './lib/check-cli';
import { assertLocalDb } from './load/local-db-guard';
import { guruhlarJavobi } from '../src/daf/liga/guruhlar-jadvali';

assertLocalDb();

run(async (prisma) => {
  const e = await prisma.enrollment.findFirstOrThrow({
    where: { status: 'ACTIVE', group: { statusEnum: 'ACTIVE', deletedAt: null } },
    select: { studentId: true, student: { select: { companyId: true } } },
  });
  const j = await guruhlarJavobi(prisma as any, e.studentId, e.student.companyId, new Date());
  const top = j.qatorlar.slice(0, 10);
  console.log({
    qatorlar: j.qatorlar.length,
    birinchi: j.qatorlar.slice(0, 3),
    oz: j.oz,
    tartib: top.every(
      (q, i) =>
        i === 0 ||
        top[i - 1].baho > q.baho ||
        (top[i - 1].baho === q.baho && top[i - 1].groupId < q.groupId),
    ),
  });
});
```

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/_probe-guruhlar.ts && rm scripts/_probe-guruhlar.ts
```

Expected: `qatorlar` 10 yoki 11, `oz` — `null` emas (seed guruhlarida ≥ 15 faol a'zo), `tartib: true`. Bazada hali urinish yo'q — hamma `baho: 0`, ya'ni tartibni faqat guruh id hal qiladi (tenglik qoidasi haqiqiy bazada ko'rindi).

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prettier --write src/daf/liga src/daf/shared/student-scope.ts && npx eslint --quiet src/daf/liga src/daf/shared/student-scope.ts && git status --short && git add src/daf/liga src/daf/shared/student-scope.ts && git commit -m "feat(daf): live weekly group table, average of current members

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hafta hisobi — `settleWeek`, cron, yagona yozuvchi qorovuli

**Files:**
- Create: `server/src/daf/liga/liga-hisob.ts`, `server/src/daf/liga/liga-hisob.spec.ts`
- Create: `server/src/daf/liga/liga.cron.ts`, `server/src/daf/liga/liga.cron.spec.ts`
- Create: `server/src/daf/liga/liga.single-source.spec.ts`
- Modify: `server/src/daf/daf.module.ts` (`providers`)
- Temporary: `server/scripts/_probe-liga-hisob.ts` (commit qilinmaydi)

**Interfaces:**
- Consumes: `xonaNatijasi`, `tengBol`, `guruhlarniSarala` (Task 2); `LIGA_HISOB_KALIT`, `LigaTx`, `bolaklar`, `xonalarOch`, `azolarniQosh` (Task 3); `guruhlarYigindisi` (Task 4); `ligaBaza` (Task 3).
- Produces:
  - `interface HisobNatijasi { haftaBoshi: string; bajarildi: boolean; xonalar: number; azolar: number; kotarildi: number; yangiXonalar: number; guruhlar: number }`
  - `settleWeek(prisma: PrismaService, companyId: number, haftaBoshi: string, opts: { kutish: boolean }): Promise<HisobNatijasi>` — `kutish: false` bo'lsa band qulfda `bajarildi: false` qaytaradi
  - `settleDue(prisma: PrismaService, companyId: number, jetzt: Date, opts: { kutish: boolean }): Promise<HisobNatijasi[]>` — eng eski hisoblanmagan haftadan boshlab, oxirida o'tgan haftaning guruhlar jadvali
  - `class LigaCron { tick(): Promise<void>; run(jetzt: Date): Promise<number> }` — `@Cron('0 5 0 * * 1', { timeZone: 'Asia/Tashkent' })`, `run` muvaffaqiyatli kompaniyalar sonini qaytaradi
  - SQL belgilari: `liga-qulf`, `liga-qulf-sinash`, `liga-xonalarni-ol`, `liga-azolar-ballari`, `liga-natija-yoz`, `liga-kotar`, `liga-darajalar`, `liga-hafta-azolari`, `guruh-haftasi-yoz`, `liga-eng-eski`

- [ ] **Step 1: Yiqiladigan testlar** — `server/src/daf/liga/liga-hisob.spec.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { settleDue, settleWeek } from './liga-hisob';
import { ligaBaza, type LigaBazaHolati } from './liga-baza.fake-spec';

const JETZT = new Date('2026-10-21T09:00:00Z'); // joriy hafta 2026-10-19
const HAFTA = '2026-10-19';
const OTGAN = '2026-10-12';

/** Xona `id`, a'zolar `id * 100 + i`, har biri `kun` da `ball(i)` ball topgan. */
function xonaBilan(
  h: LigaBazaHolati,
  o: { id: number; tier: number; n: number; ball: (i: number) => number; week?: string; kun?: string },
) {
  const week = o.week ?? OTGAN;
  h.xonalar.push({ id: o.id, companyId: 1, weekStart: week, tier: o.tier, number: o.id, settledAt: null });
  for (let i = 0; i < o.n; i += 1) {
    const sid = o.id * 100 + i;
    h.kirishlar.push({ id: o.id * 1000 + i, roomId: o.id, studentId: sid, companyId: 1, weekStart: week, tier: o.tier, place: null, points: null, promoted: false });
    const p = o.ball(i);
    if (p > 0)
      h.kunlar.push({ studentId: sid, companyId: 1, day: o.kun ?? '2026-10-14', groupKey: '', points: p });
  }
}

const sqlOf = (mock: jest.Mock, belgi: string) =>
  mock.mock.calls
    .map((c) => (c[0] as Prisma.Sql).strings.join('?'))
    .find((s) => s.includes(`/* ${belgi} */`))!;

describe('settleWeek — hafta oxiri', () => {
  it('o`rin va ball yoziladi, birinchi 5 tasi (≥ 50) ko`tariladi, xona hisoblandi', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: (i) => 100 - i * 5 });
    const n = await settleWeek(db, 1, OTGAN, { kutish: true });
    expect(h.chaqiruvlar[0]).toBe('liga-qulf');
    expect(n).toMatchObject({ haftaBoshi: OTGAN, bajarildi: true, xonalar: 1, azolar: 16, kotarildi: 5 });
    expect(h.xonalar.find((x) => x.id === 1)!.settledAt).not.toBeNull();
    const k = h.kirishlar.filter((x) => x.roomId === 1).sort((a, b) => a.place! - b.place!);
    expect(k.map((x) => x.points)).toEqual(Array.from({ length: 16 }, (_, i) => 100 - i * 5));
    expect(k.filter((x) => x.promoted).map((x) => x.studentId)).toEqual([100, 101, 102, 103, 104]);
    expect([100, 101, 102, 103, 104].map((s) => h.darajalar.get(s))).toEqual([1, 1, 1, 1, 1]);
    expect(h.darajalar.has(105)).toBe(false);
    expect(sqlOf(db.$queryRaw, 'liga-xonalarni-ol')).toMatch(/WHERE[\s\S]*"settledAt" IS NULL[\s\S]*RETURNING id, tier/);
  });

  it('ikki marta = bir marta: ikkinchisi hech narsa olmaydi va o`zgartirmaydi', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: (i) => 100 - i * 5 });
    await settleWeek(db, 1, OTGAN, { kutish: true });
    const holat = () => JSON.stringify({ k: h.kirishlar, d: [...h.darajalar], x: h.xonalar, g: h.guruhHaftalari });
    const oldin = holat();
    expect(await settleWeek(db, 1, OTGAN, { kutish: true })).toMatchObject({ xonalar: 0, azolar: 0, kotarildi: 0, yangiXonalar: 0 });
    expect(holat()).toBe(oldin);
  });

  it('daraja pastga tushmaydi (GREATEST)', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 15, ball: () => 60 });
    h.darajalar.set(100, 3);
    await settleWeek(db, 1, OTGAN, { kutish: true });
    expect(h.darajalar.get(100)).toBe(3);
    expect(h.darajalar.get(101)).toBe(1);
    expect(sqlOf(db.$executeRaw, 'liga-kotar')).toMatch(/GREATEST\("DafStudentLeague"\.tier, EXCLUDED\.tier\)/);
  });

  it('Olmosda va 14 kishilik xonada ko`tarilish yo`q, o`rinlar baribir', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 4, n: 20, ball: () => 500 });
    xonaBilan(h, { id: 2, tier: 1, n: 14, ball: () => 500 });
    expect((await settleWeek(db, 1, OTGAN, { kutish: true })).kotarildi).toBe(0);
    const otganlar = h.kirishlar.filter((k) => k.weekStart === OTGAN);
    expect(otganlar).toHaveLength(34);
    expect(otganlar.every((k) => k.place !== null && !k.promoted)).toBe(true);
  });

  it('yangi hafta: ≥ 1 ball topganlar teng xonalarga; 0 ballilar xonasiz; hafta ichida qo`shilgan joyida', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 30, ball: (i) => (i < 25 ? 10 : 0) });
    xonaBilan(h, { id: 2, tier: 0, n: 30, ball: (i) => (i < 15 ? 10 : 0) });
    // 200-o'quvchi dushanba kuni hisobdan oldin o'zi qo'shilgan:
    h.xonalar.push({ id: 9, companyId: 1, weekStart: HAFTA, tier: 0, number: 1, settledAt: null });
    h.kirishlar.push({ id: 9000, roomId: 9, studentId: 200, companyId: 1, weekStart: HAFTA, tier: 0, place: null, points: null, promoted: false });
    const n = await settleWeek(db, 1, OTGAN, { kutish: true });
    const yangi = h.xonalar.filter((x) => x.weekStart === HAFTA && x.id !== 9);
    expect(n.yangiXonalar).toBe(2);
    expect(yangi.map((x) => x.number).sort((a, b) => a - b)).toEqual([2, 3]);
    // 40 faol − 200 (allaqachon 9-xonada) = 39 → 20 + 19
    expect(yangi.map((x) => h.kirishlar.filter((k) => k.roomId === x.id).length).sort((a, b) => a - b)).toEqual([19, 20]);
    expect(h.kirishlar.filter((k) => k.weekStart === HAFTA && k.studentId === 200)).toHaveLength(1);
    expect(h.kirishlar.some((k) => k.weekStart === HAFTA && k.studentId === 125)).toBe(false);
  });

  it('ko`tarilgan o`quvchi yangi haftada yangi darajasining xonasida', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 15, ball: (i) => 100 - i });
    await settleWeek(db, 1, OTGAN, { kutish: true });
    const tierOf = (sid: number) => h.kirishlar.find((k) => k.weekStart === HAFTA && k.studentId === sid)?.tier;
    expect(tierOf(100)).toBe(1);
    expect(tierOf(105)).toBe(0);
  });

  it('kutmaydigan chaqiruv: qulf band — hech narsa yozilmaydi', async () => {
    const { db, h } = ligaBaza({ qulfBosh: false });
    xonaBilan(h, { id: 1, tier: 0, n: 16, ball: () => 60 });
    expect(await settleWeek(db, 1, OTGAN, { kutish: false })).toMatchObject({ bajarildi: false, xonalar: 0 });
    expect(h.xonalar[0].settledAt).toBeNull();
    expect(h.chaqiruvlar).toEqual(['liga-qulf-sinash']);
  });

  it('guruhlar jadvali haftasi bir marta yoziladi (xonasiz hafta ham)', async () => {
    const { db, h } = ligaBaza();
    for (const [g, ball, baza] of [['g-a', 30, 500], ['g-b', 60, 510]] as const) {
      for (let a = 0; a < 3; a += 1) {
        h.azolik.push({ groupId: g, studentId: baza + a });
        h.kunlar.push({ studentId: baza + a, companyId: 1, day: '2026-10-13', groupKey: g, points: ball });
      }
    }
    expect((await settleWeek(db, 1, OTGAN, { kutish: true })).guruhlar).toBe(2);
    expect(h.guruhHaftalari.map((g) => [g.groupId, g.weekStart, g.place, g.average, g.members, g.points])).toEqual([
      ['g-b', OTGAN, 1, 60, 3, 180],
      ['g-a', OTGAN, 2, 30, 3, 90],
    ]);
    await settleWeek(db, 1, OTGAN, { kutish: true });
    expect(h.guruhHaftalari).toHaveLength(2);
  });
});

describe('settleDue — kechikkan haftalar', () => {
  it('eng eski hisoblanmagan haftadan boshlab, keyin o`tgan hafta; joriy haftaga tegmaydi', async () => {
    const { db, h } = ligaBaza();
    xonaBilan(h, { id: 1, tier: 0, n: 3, ball: () => 10, week: '2026-10-05', kun: '2026-10-07' });
    xonaBilan(h, { id: 2, tier: 0, n: 2, ball: () => 10, week: HAFTA, kun: '2026-10-20' });
    const natija = await settleDue(db, 1, JETZT, { kutish: true });
    expect(natija.map((n) => n.haftaBoshi)).toEqual(['2026-10-05', OTGAN]);
    expect(h.xonalar.filter((x) => x.weekStart < HAFTA).every((x) => x.settledAt !== null)).toBe(true);
    expect(h.xonalar.find((x) => x.id === 2)!.settledAt).toBeNull();
  });

  it('hisoblanmagan xona yo`q — faqat o`tgan haftaning guruhlar jadvali', async () => {
    const { db } = ligaBaza();
    expect((await settleDue(db, 1, JETZT, { kutish: true })).map((n) => n.haftaBoshi)).toEqual([OTGAN]);
  });

  it('band qulf (kutmaydi) — darhol to`xtaydi', async () => {
    const { db, h } = ligaBaza({ qulfBosh: false });
    xonaBilan(h, { id: 1, tier: 0, n: 3, ball: () => 10 });
    const natija = await settleDue(db, 1, JETZT, { kutish: false });
    expect(natija).toEqual([expect.objectContaining({ haftaBoshi: OTGAN, bajarildi: false })]);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/liga/liga-hisob.spec.ts`
Expected: FAIL (`Cannot find module './liga-hisob'`).

- [ ] **Step 3: Yozish** — `server/src/daf/liga/liga-hisob.ts`:

```ts
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { wochenStartTag } from '../uebung/punkte';
import { guruhlarniSarala, tengBol, xonaNatijasi } from './liga-qoidalari';
import { guruhlarYigindisi } from './guruhlar-jadvali';
import {
  LIGA_HISOB_KALIT,
  azolarniQosh,
  bolaklar,
  xonalarOch,
  type LigaTx,
} from './liga-xona';

export interface HisobNatijasi {
  haftaBoshi: string;
  /** `false` — boshqa jarayon shu kompaniyani hisoblayapti (faqat `kutish: false` da). */
  bajarildi: boolean;
  /** Shu chaqiruv hisoblagan xonalar (ikkinchi chaqiruvda 0). */
  xonalar: number;
  azolar: number;
  kotarildi: number;
  /** Keyingi hafta uchun ochilgan xonalar. */
  yangiXonalar: number;
  /** Guruhlar jadvalidagi guruhlar (bir marta yoziladi). */
  guruhlar: number;
}

type Azo = { id: number; roomId: number; studentId: number; points: number };

/** Har xona `xonaNatijasi` dan: a'zoga o'rin, ball, ko'tarilish; ko'tarilganlar yangi darajasi bilan. */
function hisobQatorlari(xonalar: { id: number; tier: number }[], azolar: Azo[]) {
  const boyicha = new Map<number, Azo[]>();
  for (const a of azolar) {
    const l = boyicha.get(a.roomId);
    if (l) l.push(a);
    else boyicha.set(a.roomId, [a]);
  }
  const yangilash: { id: number; place: number; points: number; promoted: boolean }[] = [];
  const kotarilganlar: { studentId: number; tier: number }[] = [];
  for (const x of xonalar) {
    const list = boyicha.get(x.id) ?? [];
    const kirishId = new Map(list.map((a) => [a.studentId, a.id]));
    for (const q of xonaNatijasi(list, x.tier)) {
      yangilash.push({ id: kirishId.get(q.studentId)!, place: q.place, points: q.points, promoted: q.promoted });
      if (q.promoted) kotarilganlar.push({ studentId: q.studentId, tier: x.tier + 1 });
    }
  }
  return { yangilash, kotarilganlar };
}

/**
 * Dushanba taqsimoti (spec S3 §1.3): o'tgan hafta ≥ 1 ball topganlar HOZIRGI
 * darajasi bo'yicha `ceil(n / 25)` teng xonaga. Hafta ichida (hisobdan oldin)
 * o'zi qo'shilgan o'quvchi o'z xonasida qoladi. Daraja qulfi shart emas:
 * hisob kompaniya qulfini ajratib olgan, `joinRoom` uni shared kutadi.
 */
async function keyingiHaftaXonalari(
  tx: LigaTx,
  companyId: number,
  hafta: string,
  studentIds: number[],
): Promise<number> {
  if (studentIds.length === 0) return 0;
  const darajalar = await tx.$queryRaw<{ studentId: number; tier: number }[]>`/* liga-darajalar */
    SELECT "studentId", tier FROM "DafStudentLeague" WHERE "studentId" = ANY(${studentIds}::int[])`;
  const borlar = await tx.$queryRaw<{ studentId: number }[]>`/* liga-hafta-azolari */
    SELECT "studentId" FROM "DafLeagueEntry"
    WHERE "weekStart" = ${hafta}::date AND "studentId" = ANY(${studentIds}::int[])`;
  const tierOf = new Map(darajalar.map((d) => [d.studentId, d.tier]));
  const bor = new Set(borlar.map((b) => b.studentId));
  const boyicha = new Map<number, number[]>();
  for (const id of studentIds) {
    if (bor.has(id)) continue;
    const t = tierOf.get(id) ?? 0;
    const l = boyicha.get(t);
    if (l) l.push(id);
    else boyicha.set(t, [id]);
  }
  let yangi = 0;
  for (const [tier, ids] of boyicha) {
    const guruhlar = tengBol(ids, hafta);
    const ochildi = (await xonalarOch(tx, companyId, hafta, tier, guruhlar.length)).sort(
      (a, b) => a.number - b.number,
    );
    await azolarniQosh(
      tx,
      companyId,
      hafta,
      tier,
      guruhlar.flatMap((g, i) => g.map((studentId) => ({ roomId: ochildi[i].id, studentId }))),
    );
    yangi += ochildi.length;
  }
  return yangi;
}

/** Guruhlar jadvalining hafta natijasi — `ON CONFLICT DO NOTHING`: birinchi yozuv qoladi. */
async function guruhHaftasiniYoz(tx: LigaTx, companyId: number, haftaBoshi: string): Promise<number> {
  const jadval = guruhlarniSarala(await guruhlarYigindisi(tx, companyId, haftaBoshi));
  for (const b of bolaklar(jadval)) {
    await tx.$executeRaw`/* guruh-haftasi-yoz */
      INSERT INTO "DafGroupWeek" ("companyId", "weekStart", "groupId", "place", "average", "members", "points")
      VALUES ${Prisma.join(
        b.map(
          (g) =>
            Prisma.sql`(${companyId}::int, ${haftaBoshi}::date, ${g.groupId}::text, ${g.place}::int, ${g.baho}::float8, ${g.azolar}::int, ${g.ball}::int)`,
        ),
      )}
      ON CONFLICT ("weekStart", "groupId") DO NOTHING`;
  }
  return jadval.length;
}

/**
 * Bir kompaniyaning bir haftasi (spec S3 §1.4) — THE writer of tiers,
 * results and group weeks (`liga.single-source.spec.ts`, ADR-0116).
 *
 * Takrorlanuvchi: xonalar `UPDATE … WHERE "settledAt" IS NULL RETURNING`
 * bilan olinadi — ikkinchi chaqiruv bo'sh ro'yxat oladi va hech narsa
 * yozmaydi. Hammasi bitta tranzaksiyada; kompaniya qulfi ajratib olinadi
 * (cron kutadi, seans oxiri `pg_try_…` bilan — band bo'lsa darhol qaytadi).
 */
export async function settleWeek(
  prisma: PrismaService,
  companyId: number,
  haftaBoshi: string,
  opts: { kutish: boolean },
): Promise<HisobNatijasi> {
  const keyingi = addDaysToDateStr(haftaBoshi, 7);
  return prisma.$transaction(
    async (tx) => {
      const natija: HisobNatijasi = {
        haftaBoshi,
        bajarildi: true,
        xonalar: 0,
        azolar: 0,
        kotarildi: 0,
        yangiXonalar: 0,
        guruhlar: 0,
      };
      if (opts.kutish) {
        await tx.$queryRaw`/* liga-qulf */
          SELECT 1 AS ok FROM pg_advisory_xact_lock(${LIGA_HISOB_KALIT}::int, ${companyId}::int)`;
      } else {
        const [q] = await tx.$queryRaw<{ ok: boolean }[]>`/* liga-qulf-sinash */
          SELECT pg_try_advisory_xact_lock(${LIGA_HISOB_KALIT}::int, ${companyId}::int) AS ok`;
        if (!q?.ok) return { ...natija, bajarildi: false };
      }
      const xonalar = await tx.$queryRaw<{ id: number; tier: number }[]>`/* liga-xonalarni-ol */
        UPDATE "DafLeagueRoom" SET "settledAt" = (now() AT TIME ZONE 'UTC')
        WHERE "companyId" = ${companyId} AND "weekStart" = ${haftaBoshi}::date
          AND "settledAt" IS NULL
        RETURNING id, tier`;
      natija.xonalar = xonalar.length;
      if (xonalar.length > 0) {
        const azolar = await tx.$queryRaw<Azo[]>`/* liga-azolar-ballari */
          SELECT e.id, e."roomId", e."studentId", COALESCE(SUM(d.points), 0)::int AS points
          FROM "DafLeagueEntry" e
          LEFT JOIN "DafStudentDay" d ON d."studentId" = e."studentId"
            AND d.day >= ${haftaBoshi}::date AND d.day < ${keyingi}::date
          WHERE e."roomId" = ANY(${xonalar.map((x) => x.id)}::int[])
          GROUP BY e.id, e."roomId", e."studentId"`;
        const { yangilash, kotarilganlar } = hisobQatorlari(xonalar, azolar);
        natija.azolar = yangilash.length;
        natija.kotarildi = kotarilganlar.length;
        for (const b of bolaklar(yangilash)) {
          await tx.$executeRaw`/* liga-natija-yoz */
            UPDATE "DafLeagueEntry" AS e
            SET place = v.place, points = v.points, promoted = v.promoted
            FROM (VALUES ${Prisma.join(
              b.map(
                (q) =>
                  Prisma.sql`(${q.id}::int, ${q.place}::int, ${q.points}::int, ${q.promoted}::boolean)`,
              ),
            )}) AS v(id, place, points, promoted)
            WHERE e.id = v.id`;
        }
        for (const b of bolaklar(kotarilganlar)) {
          await tx.$executeRaw`/* liga-kotar */
            INSERT INTO "DafStudentLeague" ("studentId", "companyId", "tier", "updatedAt")
            VALUES ${Prisma.join(
              b.map(
                (k) =>
                  Prisma.sql`(${k.studentId}::int, ${companyId}::int, ${k.tier}::int, (now() AT TIME ZONE 'UTC'))`,
              ),
            )}
            ON CONFLICT ("studentId") DO UPDATE
            SET tier = GREATEST("DafStudentLeague".tier, EXCLUDED.tier),
                "updatedAt" = EXCLUDED."updatedAt"`;
        }
        natija.yangiXonalar = await keyingiHaftaXonalari(
          tx,
          companyId,
          keyingi,
          azolar.filter((a) => a.points >= 1).map((a) => a.studentId),
        );
      }
      natija.guruhlar = await guruhHaftasiniYoz(tx, companyId, haftaBoshi);
      return natija;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

/**
 * Kechikkan hamma haftalar, eng eskisidan (spec S3 §1.4: cron o'tkazib
 * yuborgan bo'lsa birinchi seans oxiri o'zi tuzatadi). Har hafta keyingi
 * haftaning xonalarini ochadi, shuning uchun ro'yxat har qadamda qaytadan
 * o'qiladi. Oxirida o'tgan haftaning guruhlar jadvali (xonasiz bo'lsa ham).
 */
export async function settleDue(
  prisma: PrismaService,
  companyId: number,
  jetzt: Date,
  opts: { kutish: boolean },
): Promise<HisobNatijasi[]> {
  const joriy = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(joriy, -7);
  const natija: HisobNatijasi[] = [];
  // ponytail: 60 hafta — cheksiz aylanishdan himoya; undan uzoq to'xtalish bo'lmaydi.
  for (let i = 0; i < 60; i += 1) {
    const [eng] = await prisma.$queryRaw<{ w: string | null }[]>`/* liga-eng-eski */
      SELECT to_char(MIN("weekStart"), 'YYYY-MM-DD') AS w FROM "DafLeagueRoom"
      WHERE "companyId" = ${companyId} AND "settledAt" IS NULL AND "weekStart" < ${joriy}::date`;
    if (!eng?.w) break;
    const n = await settleWeek(prisma, companyId, eng.w, opts);
    natija.push(n);
    if (!n.bajarildi) return natija;
  }
  if (!natija.some((n) => n.haftaBoshi === otgan)) {
    natija.push(await settleWeek(prisma, companyId, otgan, opts));
  }
  return natija;
}
```

- [ ] **Step 4: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/liga/liga-hisob.spec.ts`
Expected: PASS (11 test).

- [ ] **Step 5: Cron testi** — `server/src/daf/liga/liga.cron.spec.ts`:

```ts
jest.mock('./liga-hisob', () => ({ settleDue: jest.fn() }));

import { settleDue } from './liga-hisob';
import { LigaCron } from './liga.cron';

describe('LigaCron', () => {
  beforeEach(() => jest.resetAllMocks());

  it('dushanba 00:05 Toshkent', () => {
    expect(
      Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', LigaCron.prototype.tick),
    ).toEqual(
      expect.objectContaining({ cronTime: '0 5 0 * * 1', timeZone: 'Asia/Tashkent' }),
    );
  });

  it('har kompaniya alohida: birining xatosi boshqasini to`xtatmaydi', async () => {
    const prisma = {
      company: { findMany: jest.fn(async () => [{ id: 1 }, { id: 2 }]) },
    } as any;
    (settleDue as jest.Mock)
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([
        { haftaBoshi: '2026-10-12', bajarildi: true, xonalar: 3, azolar: 70, kotarildi: 5, yangiXonalar: 3, guruhlar: 12 },
      ]);
    const jetzt = new Date('2026-10-18T19:05:00Z');
    expect(await new LigaCron(prisma).run(jetzt)).toBe(1);
    expect(settleDue).toHaveBeenCalledWith(prisma, 1, jetzt, { kutish: true });
    expect(settleDue).toHaveBeenCalledWith(prisma, 2, jetzt, { kutish: true });
  });
});
```

Run: `cd server && npx jest src/daf/liga/liga.cron.spec.ts` → FAIL (`Cannot find module './liga.cron'`).

- [ ] **Step 6: Cron** — `server/src/daf/liga/liga.cron.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { settleDue } from './liga-hisob';

/**
 * Dushanba 00:05 Toshkent — o'tgan hafta hisobi (spec S3 §1.4, ADR-0116).
 * Har kompaniya alohida: birining xatosi logga yoziladi, qolganlari davom
 * etadi. O'tkazib yuborilgan hafta birinchi seans oxirida o'zi hisoblanadi.
 * `CRONS_ENABLED=false` da `ScheduleModule` yuklanmaydi — alohida tekshiruv
 * shart emas.
 */
@Injectable()
export class LigaCron {
  private readonly logger = new Logger(LigaCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 5 0 * * 1', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    await this.run(new Date());
  }

  async run(jetzt: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({ select: { id: true } });
    let ok = 0;
    for (const c of companies) {
      try {
        for (const n of await settleDue(this.prisma, c.id, jetzt, { kutish: true })) {
          this.logger.log(
            `Liga hisobi: kompaniya ${c.id}, hafta ${n.haftaBoshi}: ${n.xonalar} xona, ${n.azolar} a'zo, ${n.kotarildi} ko'tarildi, ${n.yangiXonalar} yangi xona, ${n.guruhlar} guruh`,
          );
        }
        ok += 1;
      } catch (err) {
        this.logger.error(
          `Liga hisobi yiqildi (kompaniya ${c.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return ok;
  }
}
```

`server/src/daf/daf.module.ts` ga `import { LigaCron } from './liga/liga.cron';` va `providers` ro'yxatining oxiriga (`FortschrittService,` dan keyin) `LigaCron,`.

Run: `cd server && npx jest src/daf/liga/liga.cron.spec.ts` → PASS (2 test).

- [ ] **Step 7: Yagona yozuvchi qorovuli** — `server/src/daf/liga/liga.single-source.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * The league tables have two doors (ADR-0116): `liga-xona.ts` (a room and a
 * membership, at a session's end) and `liga-hisob.ts` (the week's results,
 * tiers, next week's rooms and the group week). A write anywhere else could
 * lower a tier, put a student in two rooms or settle a week twice. A seed
 * that needs another write is named here, with the table it may write.
 */
const SERVER = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'scripts'];
const MODEL: Record<string, string> = {
  dafStudentLeague: 'DafStudentLeague',
  dafLeagueRoom: 'DafLeagueRoom',
  dafLeagueEntry: 'DafLeagueEntry',
  dafGroupWeek: 'DafGroupWeek',
  dafLeague: 'DafStudentLeague',
  dafLeagueEntries: 'DafLeagueEntry',
  leagueEntries: 'DafLeagueEntry',
  dafWeeks: 'DafGroupWeek',
};
const PRISMA_WRITE =
  /\.(dafStudentLeague|dafLeagueRoom|dafLeagueEntry|dafGroupWeek)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
// A nested write through a relation: `dafLeagueEntries: { create: … }`.
const NESTED_WRITE =
  /\b(dafLeague|dafLeagueEntries|leagueEntries|dafWeeks)\s*:\s*\{\s*(create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set|disconnect)\b/g;
const RAW_WRITE =
  /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:"?public"?\.)?"(DafStudentLeague|DafLeagueRoom|DafLeagueEntry|DafGroupWeek)"/gi;

const ALLOWED: Record<string, string[]> = {
  'src/daf/liga/liga-xona.ts': ['DafLeagueRoom', 'DafLeagueEntry'],
  'src/daf/liga/liga-hisob.ts': ['DafLeagueRoom', 'DafLeagueEntry', 'DafStudentLeague', 'DafGroupWeek'],
};

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

const writes = ROOTS.flatMap((root) => walk(join(SERVER, root))).flatMap((file) => {
  const path = file.slice(SERVER.length + 1).split('\\').join('/');
  const text = readFileSync(file, 'utf8');
  return [
    ...[...text.matchAll(PRISMA_WRITE)].map((m) => ({ path, table: MODEL[m[1]] })),
    ...[...text.matchAll(NESTED_WRITE)].map((m) => ({ path, table: MODEL[m[1]] })),
    ...[...text.matchAll(RAW_WRITE)].map((m) => ({ path, table: m[2] })),
  ];
});

describe('the league tables are written only in daf/liga', () => {
  it('found both writers — a scan that matches nothing proves nothing', () => {
    expect(writes.some((w) => w.path === 'src/daf/liga/liga-xona.ts')).toBe(true);
    expect(writes.some((w) => w.path === 'src/daf/liga/liga-hisob.ts')).toBe(true);
  });

  it('the patterns see Prisma, nested and raw writes', () => {
    expect([...'tx.dafLeagueEntry\n  .deleteMany({})'.matchAll(PRISMA_WRITE)]).toHaveLength(1);
    expect([...'data: { dafLeagueEntries: { create: {} } }'.matchAll(NESTED_WRITE)]).toHaveLength(1);
    expect([...'UPDATE "DafStudentLeague" SET'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'delete from public."DafGroupWeek"'.matchAll(RAW_WRITE)]).toHaveLength(1);
    expect([...'ON CONFLICT DO UPDATE SET tier = 1'.matchAll(RAW_WRITE)]).toHaveLength(0);
    expect([...'prisma.dafLeagueRoom.findMany({})'.matchAll(PRISMA_WRITE)]).toHaveLength(0);
  });

  it('no other file writes them', () => {
    expect(
      writes
        .filter((w) => !(ALLOWED[w.path] ?? []).includes(w.table))
        .map((w) => `${w.path}: ${w.table}`),
    ).toEqual([]);
  });
});
```

Run: `cd server && npx jest src/daf/liga/liga.single-source.spec.ts`
Expected: PASS (3 test). (`RAW_WRITE` `/i` bilan — jadval nomi `"…"` ichida aynan yoziladi, shuning uchun `m[2]` to'g'ri nom.)

- [ ] **Step 8: Haqiqiy Postgres'da hisob** — vaqtinchalik `server/scripts/_probe-liga-hisob.ts` (joriy haftaning xonalari hisoblanadi — prob uchun yetarli):

```ts
/** VAQTINCHA (S3 Task 5): settleWeek SQL'i haqiqiy Postgres'da. Commit qilinmaydi. */
import { run } from './lib/check-cli';
import { assertLocalDb } from './load/local-db-guard';
import { joinRoom, ligaSharoiti } from '../src/daf/liga/liga-xona';
import { settleWeek } from '../src/daf/liga/liga-hisob';
import { recordAttempt } from '../src/daf/shared/attempt-writer';
import { currentGroupId } from '../src/daf/shared/student-scope';
import { wochenStartTag } from '../src/daf/uebung/punkte';

assertLocalDb();

run(async (prisma) => {
  const jetzt = new Date();
  const hafta = wochenStartTag(jetzt);
  const t = await prisma.student.findMany({
    where: {
      deletedAt: null,
      enrollments: { some: { status: 'ACTIVE', group: { statusEnum: 'ACTIVE', deletedAt: null } } },
    },
    select: { id: true, companyId: true },
    orderBy: { id: 'asc' },
    take: 40,
  });
  // Ketma-ket: birinchi 30 tasi 1-xonada, qolgan 10 tasi 2-xonada.
  for (const s of t) await joinRoom(prisma as any, s.id, s.companyId, jetzt);
  const guruhi = new Map<number, string | null>();
  for (const s of t.slice(0, 20)) {
    const groupId = await currentGroupId(prisma as any, s.id);
    guruhi.set(s.id, groupId);
    await recordAttempt(prisma as any, {
      studentId: s.id,
      companyId: s.companyId,
      groupId,
      isCorrect: true,
      given: 'x',
      points: 60,
      sessionId: 'probe-liga',
    });
  }
  const companyId = t[0].companyId;
  const birinchi = await settleWeek(prisma as any, companyId, hafta, { kutish: true });
  const ikkinchi = await settleWeek(prisma as any, companyId, hafta, { kutish: true });
  const g1 = await prisma.dafGroupWeek.findFirstOrThrow({ where: { place: 1 } });
  const guruhGolibi = t.slice(0, 20).find((s) => guruhi.get(s.id) === g1.groupId)!;
  console.log({
    birinchi,
    ikkinchi,
    guruhHaftalari: await prisma.dafGroupWeek.count(),
    xonaGolib: (await ligaSharoiti(prisma as any, t[0].id, companyId, jetzt)).xonaGolib,
    guruhBirinchi: (await ligaSharoiti(prisma as any, guruhGolibi.id, companyId, jetzt)).guruhBirinchi,
    tier0: await prisma.dafStudentLeague.findUnique({ where: { studentId: t[0].id } }),
  });
});
```

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/_probe-liga-hisob.ts
```

Expected: `birinchi: { bajarildi: true, xonalar: 2, azolar: 40, kotarildi: 5, yangiXonalar: 2, guruhlar: N }` (N — kamida 3 faol a'zoli faol guruhlar), `ikkinchi: { bajarildi: true, xonalar: 0, azolar: 0, kotarildi: 0, yangiXonalar: 0, guruhlar: N }`, `guruhHaftalari: N` (ikkinchi chaqiruv qator qo'shmadi), `xonaGolib: true`, `guruhBirinchi: true`, `tier0.tier: 1`. SQL xatosi bo'lsa — kodni (va kerak bo'lsa soxta bazani) tuzatib, testlar + probani qayta yurgizish. Keyin tozalash:

```bash
docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -c 'DELETE FROM "DafLeagueEntry"; DELETE FROM "DafLeagueRoom"; DELETE FROM "DafStudentLeague"; DELETE FROM "DafGroupWeek"; DELETE FROM "DafStudentDay"; DELETE FROM "DafAttempt";'
rm server/scripts/_probe-liga-hisob.ts
```

(Bu tozalash — sinov bazasida qo'lda, kod emas; qorovul testlar faqat repo fayllarini tekshiradi.)

- [ ] **Step 9: Testlar va typecheck**

Run: `cd server && npx jest src/daf && npm run typecheck`
Expected: PASS, 0 xato.

- [ ] **Step 10: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prettier --write src/daf/liga src/daf/daf.module.ts && npx eslint --quiet src/daf/liga src/daf/daf.module.ts && git status --short && git add src/daf/liga src/daf/daf.module.ts && git commit -m "feat(daf): weekly league settlement, Monday cron and one-writer guard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Musobaqa nishonlari va seans oxiri

**Files:**
- Modify: `server/src/daf/nishon/nishon-katalogi.ts` (butunlay, quyida), `server/src/daf/nishon/nishon-katalogi.spec.ts`
- Modify: `server/src/daf/nishon/nishon-berish.ts` (`nishonlarniBerXavfsiz`), `server/src/daf/nishon/nishon-berish.spec.ts`
- Create: `server/src/daf/liga/liga-seans.ts`, `server/src/daf/liga/liga-seans.spec.ts`
- Modify: `server/src/daf/nishon/nishonlar.ts`, `server/src/daf/nishon/nishonlar.spec.ts`
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (`seansNatijasi` ichida `woerterP` qatori va ikkinchi bosqichdagi `nishonlarniBerXavfsiz` chaqiruvi; `nishonlar` metodi)
- Modify: `server/src/daf/fortschritt/seans-natija.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts` (`getNishonlar`), `server/src/daf/daf-portal.controller.spec.ts`
- Modify: `server/scripts/load/daf-yuklama-olchov.ts` (ikki `svc.nishonlar(s.id)`)

**Interfaces:**
- Consumes: `LIGA_NOMLARI`, `darajaNomi` (Task 2); `ligaSharoiti`, `joinRoom`, `LigaSharoiti` (Task 3); `settleDue` (Task 5).
- Produces:
  - `type NishonTuri = 'SERIE' | 'WOERTER' | 'LIGA' | 'XONA' | 'GURUH'`
  - `interface NishonSharoiti { serie: number; woerter: number; liga?: number; xonaGolib?: boolean; guruhBirinchi?: boolean }` (yangi maydonlar ixtiyoriy: S2 backfill skripti va yuklama seedi o'zgarmaydi)
  - `NISHON_KATALOGI` oxiriga `LIGA_KUMUSH` (LIGA, 1), `LIGA_OLTIN` (2), `LIGA_YOQUT` (3), `LIGA_OLMOS` (4), `XONA_GOLIB` (XONA, 1), `GURUH_BIRINCHI` (GURUH, 1)
  - `nishonlarniBerXavfsiz(prisma, studentId, companyId, serie, woerterP?, ligaP?: Promise<LigaNishonSharoiti | null>): Promise<string[]>`
  - `type LigaNishonSharoiti = Required<Pick<NishonSharoiti, 'liga' | 'xonaGolib' | 'guruhBirinchi'>>` (`liga-seans.ts`)
  - `liganiYangilaXavfsiz(prisma: PrismaService, studentId: number, companyId: number, jetzt: Date): Promise<LigaNishonSharoiti | null>` — hech qachon otmaydi
  - `nishonlarRoyxati(prisma, studentId: number, companyId: number, jetzt: Date): Promise<NishonQatori[]>`
  - `FortschrittService.nishonlar(studentId: number, companyId: number)`; `DafPortalController.getNishonlar(studentId, companyId)`

- [ ] **Step 1: Yiqiladigan katalog testlari** — `nishon-katalogi.spec.ts` ni butunlay quyidagiga almashtirish:

```ts
import { darajaNomi } from '../liga/liga-qoidalari';
import { NISHON_KATALOGI, qoldi, shartBajarilganlar } from './nishon-katalogi';

const bosh = { serie: 0, woerter: 0 };

describe('nishon katalogi', () => {
  it('S2 ning o`n kaliti va S3 ning olti kaliti, shu tartibda', () => {
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
      'LIGA_KUMUSH',
      'LIGA_OLTIN',
      'LIGA_YOQUT',
      'LIGA_OLMOS',
      'XONA_GOLIB',
      'GURUH_BIRINCHI',
    ]);
  });

  // Mijoz nomni kalitdan quradi («14 kun ketma-ket», «Kumush ligasi»).
  it('kalit nomni aytadi va takrorlanmaydi', () => {
    for (const n of NISHON_KATALOGI.filter(
      (x) => x.tur === 'SERIE' || x.tur === 'WOERTER',
    ))
      expect(n.key).toBe(`${n.tur}_${n.chegara}`);
    for (const n of NISHON_KATALOGI.filter((x) => x.tur === 'LIGA'))
      expect(n.key).toBe(`LIGA_${darajaNomi(n.chegara).toUpperCase()}`);
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

  it('liga: daraja ≥ 1 / 2 / 3 / 4; maydon yo`q bo`lsa — hech biri', () => {
    expect(shartBajarilganlar({ ...bosh, liga: 1 })).toEqual(['LIGA_KUMUSH']);
    expect(shartBajarilganlar({ ...bosh, liga: 4 })).toEqual([
      'LIGA_KUMUSH',
      'LIGA_OLTIN',
      'LIGA_YOQUT',
      'LIGA_OLMOS',
    ]);
    expect(shartBajarilganlar({ ...bosh, liga: 0 })).toEqual([]);
    expect(shartBajarilganlar(bosh)).toEqual([]);
  });

  it('xona g`olibi va guruh birinchi — holatdan', () => {
    expect(
      shartBajarilganlar({ ...bosh, xonaGolib: true, guruhBirinchi: true }),
    ).toEqual(['XONA_GOLIB', 'GURUH_BIRINCHI']);
    expect(
      shartBajarilganlar({ ...bosh, xonaGolib: false, guruhBirinchi: false }),
    ).toEqual([]);
  });

  it('qoldi — chegaragacha, hech qachon manfiy emas', () => {
    const serie14 = NISHON_KATALOGI.find((n) => n.key === 'SERIE_14')!;
    const soz150 = NISHON_KATALOGI.find((n) => n.key === 'WOERTER_150')!;
    const oltin = NISHON_KATALOGI.find((n) => n.key === 'LIGA_OLTIN')!;
    const golib = NISHON_KATALOGI.find((n) => n.key === 'XONA_GOLIB')!;
    expect(qoldi(serie14, { serie: 10, woerter: 0 })).toBe(4);
    expect(qoldi(soz150, { serie: 0, woerter: 120 })).toBe(30);
    expect(qoldi(serie14, { serie: 20, woerter: 0 })).toBe(0);
    expect(qoldi(oltin, { ...bosh, liga: 1 })).toBe(1);
    expect(qoldi(oltin, { ...bosh, liga: 4 })).toBe(0);
    expect(qoldi(golib, bosh)).toBe(1);
  });
});
```

Run: `cd server && npx jest src/daf/nishon/nishon-katalogi.spec.ts`
Expected: FAIL (kalitlar ro'yxati 10 ta, `liga` maydoni hisobga olinmaydi).

- [ ] **Step 2: Katalogni kengaytirish** — `server/src/daf/nishon/nishon-katalogi.ts` ni butunlay:

```ts
/**
 * Nishonlar katalogi — BITTA joyda (spec S2 2.1, S3 §3). Jadvalda faqat
 * olingan nishon kaliti saqlanadi, shuning uchun yangi tur migratsiyasiz
 * qo'shiladi. Nom serverda yo'q: mijoz kalitdan quradi.
 */
export type NishonTuri = 'SERIE' | 'WOERTER' | 'LIGA' | 'XONA' | 'GURUH';

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
  // S3: chegara — liga darajasi (`daf/liga/liga-qoidalari.ts`, 1 = Kumush).
  { key: 'LIGA_KUMUSH', tur: 'LIGA', chegara: 1 },
  { key: 'LIGA_OLTIN', tur: 'LIGA', chegara: 2 },
  { key: 'LIGA_YOQUT', tur: 'LIGA', chegara: 3 },
  { key: 'LIGA_OLMOS', tur: 'LIGA', chegara: 4 },
  // Kamida bitta xonada 1-o'rin, ≥ 50 ball, xonada ≥ 5 a'zo.
  { key: 'XONA_GOLIB', tur: 'XONA', chegara: 1 },
  // Guruhlar jadvalida 1-o'rin olgan haftada shu guruh uchun ≥ 1 ball.
  { key: 'GURUH_BIRINCHI', tur: 'GURUH', chegara: 1 },
];

/**
 * `serie` — joriy seriya (kun); `woerter` — kamida bir marta to'g'ri javob
 * berilgan so'zlar. S3 maydonlari ixtiyoriy: berilmasa shu nishonlar
 * sharti bajarilmagan hisoblanadi (S2 bir martalik skripti ularni bermaydi).
 */
export interface NishonSharoiti {
  serie: number;
  woerter: number;
  /** `DafStudentLeague.tier`, qator yo'q = 0. */
  liga?: number;
  xonaGolib?: boolean;
  guruhBirinchi?: boolean;
}

function joriy(tur: NishonTuri, s: NishonSharoiti): number {
  switch (tur) {
    case 'SERIE':
      return s.serie;
    case 'WOERTER':
      return s.woerter;
    case 'LIGA':
      return s.liga ?? 0;
    case 'XONA':
      return s.xonaGolib ? 1 : 0;
    case 'GURUH':
      return s.guruhBirinchi ? 1 : 0;
  }
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

Run: `cd server && npx jest src/daf/nishon/nishon-katalogi.spec.ts` → PASS (6 test).

- [ ] **Step 3: Yiqiladigan `nishonlarniBerXavfsiz` testlari** — `nishon-berish.spec.ts` dagi `describe('nishonlarniBerXavfsiz'` blokining oxiriga (yopuvchi `});` dan oldin):

```ts
  it('liga holati berilsa musobaqa nishonlari ham (S3)', async () => {
    const { prisma } = fakeBadgeTable([], 0);
    expect(
      await nishonlarniBerXavfsiz(
        prisma,
        55,
        1,
        0,
        Promise.resolve(0),
        Promise.resolve({ liga: 2, xonaGolib: true, guruhBirinchi: false }),
      ),
    ).toEqual(['LIGA_KUMUSH', 'LIGA_OLTIN', 'XONA_GOLIB']);
  });

  it('liga holati null — faqat S2 nishonlari', async () => {
    const { prisma } = fakeBadgeTable([], 50);
    expect(
      await nishonlarniBerXavfsiz(prisma, 55, 1, 3, undefined, Promise.resolve(null)),
    ).toEqual(['SERIE_3', 'WOERTER_50']);
  });
```

Run: `cd server && npx jest src/daf/nishon/nishon-berish.spec.ts` → FAIL (birinchi yangi test: `[]`, liga hisobga olinmagan).

- [ ] **Step 4: `nishonlarniBerXavfsiz` ga liga holati** — `nishon-berish.ts` dagi:

```ts
  woerterP?: Promise<number | null>,
): Promise<string[]> {
  try {
    const woerter = await (woerterP ?? woerterSoni(prisma, studentId));
    if (woerter === null) {
      logger.warn(`So'z soni sanalmadi (studentId=${studentId})`);
      return [];
    }
    return await grantBadges(prisma, studentId, companyId, { serie, woerter });
```

ni:

```ts
  woerterP?: Promise<number | null>,
  /**
   * S3: seans oxiri liga holati (`liganiYangilaXavfsiz`, hech qachon otmaydi).
   * `null` yoki berilmasa — musobaqa nishonlari bu seansda berilmaydi.
   */
  ligaP?: Promise<Pick<
    NishonSharoiti,
    'liga' | 'xonaGolib' | 'guruhBirinchi'
  > | null>,
): Promise<string[]> {
  try {
    const [woerter, liga] = await Promise.all([
      woerterP ?? woerterSoni(prisma, studentId),
      ligaP ?? Promise.resolve(null),
    ]);
    if (woerter === null) {
      logger.warn(`So'z soni sanalmadi (studentId=${studentId})`);
      return [];
    }
    return await grantBadges(prisma, studentId, companyId, {
      serie,
      woerter,
      ...(liga ?? {}),
    });
```

ga almashtirish (`import` dagi `type NishonSharoiti` allaqachon bor).

Run: `cd server && npx jest src/daf/nishon/nishon-berish.spec.ts` → PASS (13 test). (`nishonlar.spec.ts` katalog 16 ta bo'lgani uchun Step 2 dan beri yiqiladi — Step 7 da tuzatiladi.)

- [ ] **Step 5: Yiqiladigan `liga-seans` testlari** — `server/src/daf/liga/liga-seans.spec.ts`:

```ts
jest.mock('./liga-xona', () => ({ ligaSharoiti: jest.fn(), joinRoom: jest.fn() }));
jest.mock('./liga-hisob', () => ({ settleDue: jest.fn() }));

import { joinRoom, ligaSharoiti } from './liga-xona';
import { settleDue } from './liga-hisob';
import { liganiYangilaXavfsiz } from './liga-seans';

const JETZT = new Date('2026-10-21T09:00:00Z');
const prisma = {} as any;
const holat = (o: Record<string, unknown> = {}) => ({
  tier: 0,
  azo: true,
  kechikkan: false,
  xonaGolib: false,
  guruhBirinchi: false,
  ...o,
});

describe('liganiYangilaXavfsiz — seans oxiri', () => {
  beforeEach(() => jest.resetAllMocks());

  it('xonada, kechikkan yo`q — bitta so`rov, yozuv yo`q', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(holat({ tier: 2, xonaGolib: true }));
    expect(await liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).toEqual({
      liga: 2,
      xonaGolib: true,
      guruhBirinchi: false,
    });
    expect(ligaSharoiti).toHaveBeenCalledTimes(1);
    expect(joinRoom).not.toHaveBeenCalled();
    expect(settleDue).not.toHaveBeenCalled();
  });

  it('shu hafta xonada emas — qo`shiladi', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(holat({ azo: false }));
    await liganiYangilaXavfsiz(prisma, 55, 1, JETZT);
    expect(joinRoom).toHaveBeenCalledWith(prisma, 55, 1, JETZT);
  });

  it('kechikkan hafta — avval hisob (kutmaydi), so`ng holat qayta o`qiladi', async () => {
    (ligaSharoiti as jest.Mock)
      .mockResolvedValueOnce(holat({ kechikkan: true, azo: false }))
      .mockResolvedValueOnce(holat({ tier: 1, azo: true }));
    (settleDue as jest.Mock).mockResolvedValue([]);
    expect(await liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).toEqual({
      liga: 1,
      xonaGolib: false,
      guruhBirinchi: false,
    });
    expect(settleDue).toHaveBeenCalledWith(prisma, 1, JETZT, { kutish: false });
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('holat o`qilmadi — null, otilmaydi', async () => {
    (ligaSharoiti as jest.Mock).mockRejectedValue(new Error('db down'));
    await expect(liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).resolves.toBeNull();
  });

  it('qo`shilish yiqilsa ham holat qaytadi — nishonlar beriladi', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(holat({ azo: false, guruhBirinchi: true }));
    (joinRoom as jest.Mock).mockRejectedValue(new Error('lock timeout'));
    expect(await liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).toEqual({
      liga: 0,
      xonaGolib: false,
      guruhBirinchi: true,
    });
  });
});
```

Run: `cd server && npx jest src/daf/liga/liga-seans.spec.ts` → FAIL (`Cannot find module './liga-seans'`).

- [ ] **Step 6: `liga-seans.ts`**:

```ts
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NishonSharoiti } from '../nishon/nishon-katalogi';
import { settleDue } from './liga-hisob';
import { joinRoom, ligaSharoiti, type LigaSharoiti } from './liga-xona';

const logger = new Logger('LigaSeans');

/** Nishon sharti uchun liga qismi (`NishonSharoiti`). */
export type LigaNishonSharoiti = Required<
  Pick<NishonSharoiti, 'liga' | 'xonaGolib' | 'guruhBirinchi'>
>;

/**
 * Seans oxiri (spec S3 §1.5): liga holati — bitta so'rov; o'tgan hafta
 * hisoblanmagan bo'lsa hisob (kutmaydi: boshqa so'rov hisoblayotgan bo'lsa
 * `joinRoom` uning tugashini shared qulfda kutadi), so'ng holat qayta
 * o'qiladi; shu hafta xonada bo'lmasa qo'shiladi. Bu bezak: seans saqlangan,
 * shuning uchun hech qachon otmaydi — holat o'qilmasa `null` (liga
 * nishonlari bu seansda berilmaydi), qo'shilish yiqilsa o'quvchi keyingi
 * seansda qo'shiladi.
 */
export async function liganiYangilaXavfsiz(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<LigaNishonSharoiti | null> {
  let holat: LigaSharoiti;
  try {
    holat = await ligaSharoiti(prisma, studentId, companyId, jetzt);
  } catch (err) {
    logger.warn(
      `Liga holati o'qilmadi (studentId=${studentId}): ${(err as Error).message}`,
    );
    return null;
  }
  try {
    if (holat.kechikkan) {
      await settleDue(prisma, companyId, jetzt, { kutish: false });
      holat = await ligaSharoiti(prisma, studentId, companyId, jetzt);
    }
    if (!holat.azo) await joinRoom(prisma, studentId, companyId, jetzt);
  } catch (err) {
    logger.warn(
      `Liga yangilanmadi (studentId=${studentId}): ${(err as Error).message}`,
    );
  }
  return {
    liga: holat.tier,
    xonaGolib: holat.xonaGolib,
    guruhBirinchi: holat.guruhBirinchi,
  };
}
```

Run: `cd server && npx jest src/daf/liga/liga-seans.spec.ts` → PASS (5 test).

- [ ] **Step 7: `GET nishonlar` liga holati bilan** — `nishonlar.spec.ts`:
  - `prismaFor` ga parametr `liga?: number` va obyektga:

```ts
    $queryRaw: jest.fn(async () => [
      {
        tier: opts.liga ?? 0,
        azo: false,
        kechikkan: false,
        xonaGolib: false,
        guruhBirinchi: false,
      },
    ]),
```

  (`opts` tipiga `liga?: number;` qo'shiladi);
  - har `nishonlarRoyxati(prisma, 55, JETZT)` → `nishonlarRoyxati(prisma, 55, 1, JETZT)`;
  - `expect(r).toHaveLength(10);` → `expect(r).toHaveLength(16);`;
  - `describe` oxiriga:

```ts
  it('liga nishonlari: daraja yetgan — «qoldi 0» (keyingi mashqda), yetmagan — 1', async () => {
    const prisma = prismaFor({ kunlar: [], woerter: 0, olingan: [], liga: 1 });
    const r = await nishonlarRoyxati(prisma, 55, 1, JETZT);
    expect(r.find((x) => x.key === 'LIGA_KUMUSH')).toMatchObject({ tur: 'LIGA', olingan: null, qoldi: 0 });
    expect(r.find((x) => x.key === 'LIGA_OLTIN')).toMatchObject({ qoldi: 1 });
    expect(r.find((x) => x.key === 'XONA_GOLIB')).toMatchObject({ tur: 'XONA', qoldi: 1 });
    expect(prisma.$queryRaw.mock.calls[0][0].strings[0]).toContain('/* liga-sharoiti */');
  });
```

  `nishonlar.ts` da importlarga `import { ligaSharoiti } from '../liga/liga-xona';`, imzoni:

```ts
export async function nishonlarRoyxati(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<NishonQatori[]> {
  const [kunlar, woerter, olinganlar, liga] = await Promise.all([
```

  va `Promise.all` ro'yxatining oxiriga (`prisma.dafStudentBadge.findMany({…}),` dan keyin) `ligaSharoiti(prisma, studentId, companyId, jetzt),`; `const sharoit = { serie, woerter };` ni:

```ts
  const sharoit = {
    serie,
    woerter,
    liga: liga.tier,
    xonaGolib: liga.xonaGolib,
    guruhBirinchi: liga.guruhBirinchi,
  };
```

  ga almashtirish (qo'shimcha bosqich yo'q — to'rtinchi so'rov o'sha `Promise.all` da).

Run: `cd server && npx jest src/daf/nishon` → PASS.

- [ ] **Step 8: Servis ulanishlari** — `fortschritt.service.ts` importlariga:

```ts
import { liganiYangilaXavfsiz } from '../liga/liga-seans';
```

`seansNatijasi` ichida:

```ts
    const woerterP = woerterSoni(this.prisma, studentId).catch(() => null);
```

dan keyin:

```ts
    // S3: liga holati — bitta so'rov, birinchi bosqich bilan parallel; xonaga
    // qo'shilish (haftada bir marta) va kechikkan hisob ham shu zanjirda.
    // Hech qachon otmaydi: `null` bo'lsa liga nishonlari berilmaydi.
    const ligaP = liganiYangilaXavfsiz(this.prisma, studentId, companyId, jetzt);
```

va

```ts
      nishonlarniBerXavfsiz(this.prisma, studentId, companyId, serie, woerterP),
```

ni:

```ts
      nishonlarniBerXavfsiz(
        this.prisma,
        studentId,
        companyId,
        serie,
        woerterP,
        ligaP,
      ),
```

ga; `nishonlar` metodini:

```ts
  /** `GET .../nishonlar` — hamma katalog, o'quvchining o'z nishonlari bilan. Yozmaydi. */
  nishonlar(studentId: number, companyId: number): Promise<NishonQatori[]> {
    return nishonlarRoyxati(this.prisma, studentId, companyId, new Date());
  }
```

ga almashtirish.

- [ ] **Step 9: Seans oxiri testlari** — `seans-natija.spec.ts`:
  - `fake` opts tipiga:

```ts
  /** `/* liga-sharoiti *\/` javobi (S3); standart — xonada, kechikkan yo'q. */
  liga?: Partial<{ tier: number; azo: boolean; kechikkan: boolean; xonaGolib: boolean; guruhBirinchi: boolean }>;
  ligaXato?: boolean;
```

  - `$queryRaw` ni:

```ts
    $queryRaw: jest.fn((sql: Prisma.Sql) => {
      if (sql.strings[0].includes('/* liga-sharoiti */')) {
        if (opts.ligaXato) return Promise.reject(new Error('db down'));
        return Promise.resolve([
          { tier: 0, azo: true, kechikkan: false, xonaGolib: false, guruhBirinchi: false, ...opts.liga },
        ]);
      }
      if (!sql.strings[0].includes('/* nishon-berish */')) return zentrum(sql);
      if (opts.badges === 'xato') return Promise.reject(new Error('db down'));
      return Promise.resolve((opts.badges ?? []).map((key) => ({ key })));
    }),
```

  ga almashtirish;
  - `describe('yangiNishonlar (S2)'` blokining oxiriga:

```ts
    it('liga holati (S3) nishon berishga yetadi', async () => {
      const prisma = fake({
        ...asos,
        liga: { tier: 1, xonaGolib: true },
        badges: ['LIGA_KUMUSH', 'XONA_GOLIB'],
      });
      const n = await new FortschrittService(prisma).seansNatijasi('s-1', 55, 1);
      expect(n.yangiNishonlar).toEqual(['LIGA_KUMUSH', 'XONA_GOLIB']);
      const insert = prisma.$queryRaw.mock.calls
        .map((c: unknown[]) => c[0] as Prisma.Sql)
        .find((s: Prisma.Sql) => s.strings[0].includes('/* nishon-berish */'))!;
      expect(insert.values).toEqual(
        expect.arrayContaining(['WOERTER_50', 'LIGA_KUMUSH', 'XONA_GOLIB']),
      );
    });

    it('liga so`rovi yiqilsa — S2 nishonlari baribir, natija saqlanadi', async () => {
      const prisma = fake({ ...asos, ligaXato: true, badges: ['WOERTER_50'] });
      const n = await new FortschrittService(prisma).seansNatijasiXavfsiz('s-1', 55, 1);
      expect(n!.yangiNishonlar).toEqual(['WOERTER_50']);
      const insert = prisma.$queryRaw.mock.calls
        .map((c: unknown[]) => c[0] as Prisma.Sql)
        .find((s: Prisma.Sql) => s.strings[0].includes('/* nishon-berish */'))!;
      expect(insert.values).not.toContain('LIGA_KUMUSH');
    });
```

- [ ] **Step 10: Kontroller** — `daf-portal.controller.ts` dagi `getNishonlar` ni:

```ts
  @Get('nishonlar')
  getNishonlar(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.fortschritt.nishonlar(studentId, companyId);
  }
```

ga; `daf-portal.controller.spec.ts` dagi:

```ts
    await controller.getNishonlar(55);
    expect(fortschritt.nishonlar).toHaveBeenCalledWith(55);
```

ni:

```ts
    await controller.getNishonlar(55, 1);
    expect(fortschritt.nishonlar).toHaveBeenCalledWith(55, 1);
```

ga almashtirish. `server/scripts/load/daf-yuklama-olchov.ts` dagi ikki `svc.nishonlar(s.id)` → `svc.nishonlar(s.id, s.companyId)`.

- [ ] **Step 11: Testlar va typecheck**

Run: `cd server && npx jest src/daf && npm run typecheck`
Expected: PASS (e2e ham — marshrutlar soni o'zgarmadi), typecheck 0 xato.

- [ ] **Step 12: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prettier --write src/daf scripts/load/daf-yuklama-olchov.ts && npx eslint --quiet src/daf && git add src/daf scripts/load/daf-yuklama-olchov.ts && git commit -m "feat(daf): league badges at session end, join and late settlement in the safe wrapper

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `GET liga`, `GET guruhlar` va marshrut manifesti

**Files:**
- Modify: `server/src/daf/fortschritt/fortschritt.service.ts` (ikki ulanish metod, `reyting` dan oldin)
- Modify: `server/src/daf/daf-portal.controller.ts` (fayl oxiriga ikki marshrut)
- Modify: `server/src/daf/daf-portal.controller.spec.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (`'GET /student-portal/lernen/fortschritt'` bloki)
- Modify: `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `ligaJavobi`, `LigaJavobi` (Task 3); `guruhlarJavobi`, `GuruhlarJavobi` (Task 4).
- Produces:
  - `FortschrittService.liga(studentId: number): Promise<LigaJavobi>`, `FortschrittService.guruhlar(studentId: number, companyId: number): Promise<GuruhlarJavobi>`
  - `DafPortalController.getLiga(studentId)`, `DafPortalController.getGuruhlar(studentId, companyId)`
  - HTTP: `GET /api/student-portal/lernen/liga` → `LigaJavobi`; `GET /api/student-portal/lernen/guruhlar` → `GuruhlarJavobi`. DTO yo'q (parametrsiz GET; hamma narsa tokendan).

- [ ] **Step 1: Yiqiladigan kontroller testlari** — `daf-portal.controller.spec.ts`:
  - `// The 18 routes of the learning section…` → `// The 20 routes of the learning section…`, va

```ts
  it('has the 18 learning routes', () => {
    expect(routes).toHaveLength(18);
  });
```

ni:

```ts
  it('has the 20 learning routes', () => {
    expect(routes).toHaveLength(20);
  });
```

ga almashtirish;
  - fayl oxiriga:

```ts
describe('DafPortalController — liga va guruhlar (S3)', () => {
  function make() {
    const fortschritt = {
      liga: jest.fn(async () => ({ azo: false })),
      guruhlar: jest.fn(async () => ({ qatorlar: [] })),
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

  it('GET liga — tokendagi o`quvchi', async () => {
    const { controller, fortschritt } = make();
    expect(await controller.getLiga(55)).toEqual({ azo: false });
    expect(fortschritt.liga).toHaveBeenCalledWith(55);
  });

  it('GET guruhlar — tokendagi o`quvchi va kompaniya', async () => {
    const { controller, fortschritt } = make();
    await controller.getGuruhlar(55, 1);
    expect(fortschritt.guruhlar).toHaveBeenCalledWith(55, 1);
  });

  it('yo`llar va usullar', () => {
    const proto = DafPortalController.prototype as any;
    expect(Reflect.getMetadata('path', proto.getLiga)).toBe('liga');
    expect(Reflect.getMetadata('method', proto.getLiga)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('path', proto.getGuruhlar)).toBe('guruhlar');
    expect(Reflect.getMetadata('method', proto.getGuruhlar)).toBe(RequestMethod.GET);
  });
});
```

Run: `cd server && npx jest src/daf/daf-portal.controller.spec.ts`
Expected: FAIL (18 ≠ 20, `getLiga` yo'q).

- [ ] **Step 2: Servisga ikki ulanish** — `fortschritt.service.ts` importlariga:

```ts
import { ligaJavobi, type LigaJavobi } from '../liga/liga-xona';
import { guruhlarJavobi, type GuruhlarJavobi } from '../liga/guruhlar-jadvali';
```

va `async reyting(` metodidan oldin:

```ts
  /** `GET .../liga` — o'quvchining xonasi va darajasi (spec S3 §4). Yozmaydi. */
  liga(studentId: number): Promise<LigaJavobi> {
    return ligaJavobi(this.prisma, studentId, new Date());
  }

  /** `GET .../guruhlar` — markazning haftalik guruhlar jadvali (spec S3 §2). Yozmaydi. */
  guruhlar(studentId: number, companyId: number): Promise<GuruhlarJavobi> {
    return guruhlarJavobi(this.prisma, studentId, companyId, new Date());
  }
```

- [ ] **Step 3: Kontroller** — `daf-portal.controller.ts` dagi `getNishonlar` metodidan keyin (klassni yopuvchi `}` dan oldin):

```ts

  /**
   * Haftalik liga xonasi (spec S3 §4). `studentId` TOKENDAN. Hech narsa
   * YOZMAYDI: xonaga qo'shilish seans oxirida — xonada bo'lmagan o'quvchi
   * «birinchi seansdan keyin» ko'radi. Liga filialga cheklanmaydi
   * (`branch-route-policy.ts` dagi SELF sababi).
   */
  @Get('liga')
  getLiga(@CurrentUser('studentId') studentId: number) {
    return this.fortschritt.liga(studentId);
  }

  /**
   * Markazning haftalik guruhlar jadvali: TOP 10 + o'quvchining o'z guruhi.
   * Alohida marshrut — «Guruhlar» tabi ochilgandagina so'raladi. Yozmaydi.
   */
  @Get('guruhlar')
  getGuruhlar(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.fortschritt.guruhlar(studentId, companyId);
  }
```

(Kontrollerning klass darajasidagi `@StudentOnly()` va `@UseGuards(StudentCardGuard)` ikkala marshrutni ham qamraydi; `daf-portal.student-card.e2e.spec.ts` marshrutlarni metadatadan o'qiydi, shuning uchun `studentId`siz token = 404 va 0 so'rov tekshiruvi o'zgartirishsiz ikkalasiga ham yuradi.)

- [ ] **Step 4: Marshrut siyosati** — `branch-route-policy.ts` dagi:

```ts
      'row (`DafStudentSetting`, keyed on the token `studentId`) — no branch question.',
    routes: [
      'GET /student-portal/lernen/fortschritt',
      'GET /student-portal/lernen/reyting',
      'GET /student-portal/lernen/nishonlar',
      'PATCH /student-portal/lernen/maqsad',
    ],
```

ni:

```ts
      'row (`DafStudentSetting`, keyed on the token `studentId`) — no branch question. ' +
      '`GET .../liga` and `GET .../guruhlar` (S3, ADR-0116) are SELF on the same ' +
      "terms as the centre ranking: the caller's own league room (rooms are " +
      'filled centre-wide) and the centre-wide weekly group table — both ' +
      'deliberately not limited to a branch (06.09 §6.1).',
    routes: [
      'GET /student-portal/lernen/fortschritt',
      'GET /student-portal/lernen/reyting',
      'GET /student-portal/lernen/nishonlar',
      'PATCH /student-portal/lernen/maqsad',
      'GET /student-portal/lernen/liga',
      'GET /student-portal/lernen/guruhlar',
    ],
```

ga almashtirish.

- [ ] **Step 5: Kirish suratiga ikki qator** — `route-access.snapshot.json` da:

```json
  "GET /student-portal/lernen/grammar": [
    "Student"
  ],
```

dan keyin:

```json
  "GET /student-portal/lernen/guruhlar": [
    "Student"
  ],
```

va:

```json
  "GET /student-portal/lernen/levels": [
    "Student"
  ],
```

dan keyin:

```json
  "GET /student-portal/lernen/liga": [
    "Student"
  ],
```

- [ ] **Step 6: Testlar va typecheck**

Run: `cd server && npx jest src/daf src/common/permissions src/common/auth && npm run typecheck`
Expected: PASS (e2e: 20 marshrut × 3 holat — 404/404/403, so'rov 0; manifest va surat mos), typecheck 0 xato.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npx prettier --write src/daf src/common/auth/branch-route-policy.ts && npx eslint --quiet src/daf src/common/auth/branch-route-policy.ts && git add src/daf src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json && git commit -m "feat(daf): student reads the league room and the group table

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ilova — tiplar, so'rovlar, sof yordamchilar

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts` (`NishonQatori`, `ReytingZeile` dan keyin yangi tiplar)
- Modify: `client/src/components/student-portal/lernen/queries.ts`
- Create: `client/src/components/student-portal/lernen/liga.ts`, `liga.test.ts`
- Modify: `client/src/components/student-portal/lernen/nishon.ts`, `nishon.test.ts`

**Interfaces:**
- Consumes: server javoblari (Task 6–7).
- Produces:
  - `NishonQatori.tur: "SERIE" | "WOERTER" | "LIGA" | "XONA" | "GURUH"`
  - `interface LigaDarajasi { tier: number; nomi: string }`; `interface Liga { haftaBoshi; haftaOxiri; azo; daraja: LigaDarajasi; xona: { raqam; hajmi; qatorlar: ReytingZeile[]; kotarilishZonasi: { soni: number; faol: boolean } } | null; otganHafta: { daraja: LigaDarajasi; orin; kotarildi; hajmi } | null }`
  - `interface GuruhQatori { groupId: string; name: string; baho: number; azolar: number; platz: number; selbst: boolean }`; `interface Guruhlar { haftaBoshi: string; qatorlar: GuruhQatori[]; oz: { orin; baho; azolar; nomi } | null; minAzolar: number }`
  - `useLiga(): UseQueryResult<Liga>` (kalit `["lernen", "liga"]`), `useGuruhlar(): UseQueryResult<Guruhlar>` (kalit `["lernen", "guruhlar"]`)
  - `liga.ts`: `LIGA_NOMLARI`, `KOTARILISH_MIN_BALL`, `KOTARILISH_MIN_AZO`, `GOLIB_MIN_BALL`; `haftaMatni(haftaOxiri: string, bugun: string, hajmi: number | null): string`; `kotarilishMatni(z: { soni: number; faol: boolean }): string`; `otganHaftaMatni(o: NonNullable<Liga["otganHafta"]>, joriy: LigaDarajasi): string`; `zonadami(platz: number, z: { soni: number; faol: boolean }): boolean`; `bahoMatni(baho: number): string`
  - `nishonNomi` / `nishonQoldi` musobaqa nishonlarini biladi

- [ ] **Step 1: Tiplar** — `types.ts` dagi:

```ts
export interface NishonQatori {
  key: string;
  tur: "SERIE" | "WOERTER";
```

ni:

```ts
export interface NishonQatori {
  key: string;
  tur: "SERIE" | "WOERTER" | "LIGA" | "XONA" | "GURUH";
```

ga almashtirish; `ReytingZeile` interfeysidan keyin:

```ts

export interface LigaDarajasi {
  tier: number;
  nomi: string;
}

/** `GET .../liga` — haftalik liga xonasi (S3). Xonada bo'lmasa `xona: null`. */
export interface Liga {
  haftaBoshi: string;
  haftaOxiri: string;
  azo: boolean;
  daraja: LigaDarajasi;
  xona: {
    raqam: number;
    hajmi: number;
    qatorlar: ReytingZeile[];
    /** `soni` — Olmosda 0; `faol` — xona ≥ 15 kishi. */
    kotarilishZonasi: { soni: number; faol: boolean };
  } | null;
  /** Hisoblangan o'tgan hafta; `daraja` — o'sha xonaning darajasi. */
  otganHafta: { daraja: LigaDarajasi; orin: number; kotarildi: boolean; hajmi: number } | null;
}

/** Guruhlar jadvalining qatori: `baho` — a'zolarning o'rtacha haftalik bali. */
export interface GuruhQatori {
  groupId: string;
  name: string;
  baho: number;
  azolar: number;
  platz: number;
  selbst: boolean;
}

/** `GET .../guruhlar` — TOP 10 + o'z guruhi; `oz: null` — guruhsiz yoki kichik guruh. */
export interface Guruhlar {
  haftaBoshi: string;
  qatorlar: GuruhQatori[];
  oz: { orin: number; baho: number; azolar: number; nomi: string } | null;
  minAzolar: number;
}
```

- [ ] **Step 2: Yiqiladigan yordamchi testlari** — `lernen/liga.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  GOLIB_MIN_BALL,
  KOTARILISH_MIN_AZO,
  KOTARILISH_MIN_BALL,
  LIGA_NOMLARI,
  bahoMatni,
  haftaMatni,
  kotarilishMatni,
  otganHaftaMatni,
  zonadami,
} from "./liga";

// The client cannot import server code; names and limits must still be the server's.
const server = readFileSync(
  join(__dirname, "../../../../../server/src/daf/liga/liga-qoidalari.ts"),
  "utf8",
);
const son = (nom: string) =>
  Number(new RegExp(`export const ${nom} = (\\d+);`).exec(server)?.[1]);

describe("liga konstantalari serverniki bilan bir xil", () => {
  it("nomlar va chegaralar", () => {
    const nomlar = /LIGA_NOMLARI = \[([^\]]+)\]/
      .exec(server)![1]
      .match(/'([^']+)'/g)!
      .map((s) => s.slice(1, -1));
    expect([...LIGA_NOMLARI]).toEqual(nomlar);
    expect(KOTARILISH_MIN_BALL).toBe(son("KOTARILISH_MIN_BALL"));
    expect(KOTARILISH_MIN_AZO).toBe(son("KOTARILISH_MIN_AZO"));
    expect(GOLIB_MIN_BALL).toBe(son("GOLIB_MIN_BALL"));
  });
});

describe("haftaMatni", () => {
  it("dushanba — 7 kun, shanba — 2 kun, yakshanba — bugun tugaydi", () => {
    expect(haftaMatni("2026-10-25", "2026-10-19", 22)).toBe("Hafta tugashiga 7 kun · 22 kishi");
    expect(haftaMatni("2026-10-25", "2026-10-24", 22)).toBe("Hafta tugashiga 2 kun · 22 kishi");
    expect(haftaMatni("2026-10-25", "2026-10-25", null)).toBe("Hafta bugun tugaydi");
  });
});

describe("kotarilishMatni", () => {
  it("faol zona, kichik xona, Olmos", () => {
    expect(kotarilishMatni({ soni: 5, faol: true })).toBe(
      "Birinchi 5 tasi ko'tariladi (kamida 50 ball)",
    );
    expect(kotarilishMatni({ soni: 5, faol: false })).toBe(
      "Xona hali kichik — ko'tarilish ≥ 15 kishi bo'lganda",
    );
    expect(kotarilishMatni({ soni: 0, faol: false })).toBe(
      "Eng yuqori liga — bu yerdan ko'tarilish yo'q",
    );
  });
});

describe("otganHaftaMatni", () => {
  it("ko'tarilgan va ko'tarilmagan", () => {
    const kumush = { tier: 1, nomi: "Kumush" };
    expect(
      otganHaftaMatni({ daraja: { tier: 0, nomi: "Bronza" }, orin: 3, kotarildi: true, hajmi: 22 }, kumush),
    ).toBe("Siz 3-o'rin · Kumush ligasiga ko'tarildingiz");
    expect(otganHaftaMatni({ daraja: kumush, orin: 8, kotarildi: false, hajmi: 22 }, kumush)).toBe(
      "Siz 8-o'rin · 22 kishi",
    );
  });
});

describe("zonadami va bahoMatni", () => {
  it("zona faqat faol bo'lsa va birinchi `soni` ta", () => {
    expect(zonadami(5, { soni: 5, faol: true })).toBe(true);
    expect(zonadami(6, { soni: 5, faol: true })).toBe(false);
    expect(zonadami(1, { soni: 5, faol: false })).toBe(false);
  });

  it("o'nlik vergul bilan", () => {
    expect(bahoMatni(12.5)).toBe("12,5 ball");
    expect(bahoMatni(30)).toBe("30 ball");
  });
});
```

`nishon.test.ts` ning `describe("nishonNomi"` va `describe("nishonQoldi"` bloklari oxiriga:

```ts
  it("musobaqa nishonlari (S3)", () => {
    expect(nishonNomi("LIGA_KUMUSH")).toBe("Kumush ligasi");
    expect(nishonNomi("LIGA_OLMOS")).toBe("Olmos ligasi");
    expect(nishonNomi("XONA_GOLIB")).toBe("Xona g'olibi");
    expect(nishonNomi("GURUH_BIRINCHI")).toBe("Guruhlar jadvalida 1-o'rin");
    expect(nishonNomi("LIGA_TEMIR")).toBe("LIGA_TEMIR");
  });
```

(`nishonNomi` blokiga) va

```ts
  it("musobaqa nishoni: nima qilish kerakligi", () => {
    expect(nishonQoldi(q({ key: "LIGA_OLTIN", tur: "LIGA", chegara: 2, qoldi: 1 }))).toBe(
      "Oltin ligasiga ko'tarilganda",
    );
    expect(nishonQoldi(q({ key: "XONA_GOLIB", tur: "XONA", chegara: 1, qoldi: 1 }))).toBe(
      "Xonada 1-o'rin, kamida 50 ball",
    );
    expect(nishonQoldi(q({ key: "GURUH_BIRINCHI", tur: "GURUH", chegara: 1, qoldi: 1 }))).toBe(
      "Guruhingiz hafta jadvalida 1-o'rin olganda",
    );
    expect(nishonQoldi(q({ key: "LIGA_KUMUSH", tur: "LIGA", chegara: 1, qoldi: 0 }))).toBe(
      "Keyingi mashqda beriladi",
    );
  });
```

(`nishonQoldi` blokiga). `q` yordamchisidagi `tur: "SERIE" as const` ni `tur: "SERIE" as NishonQatori["tur"]` ga almashtirish va importga `import type { NishonQatori } from "./types";` qo'shish (aks holda `tur: "LIGA"` tip xatosi).

Run: `cd client && npx vitest run src/components/student-portal/lernen/liga.test.ts src/components/student-portal/lernen/nishon.test.ts`
Expected: FAIL (`./liga` topilmaydi; `nishonNomi("LIGA_KUMUSH")` → `"LIGA_KUMUSH"`).

- [ ] **Step 3: Yordamchilarni yozish** — `lernen/liga.ts`:

```ts
import type { Liga, LigaDarajasi } from "./types";

/**
 * Liga nomlari va chegaralari — serverdagi `daf/liga/liga-qoidalari.ts` bilan
 * bir xil (`liga.test.ts` ularni o'sha fayldan o'qib solishtiradi).
 */
export const LIGA_NOMLARI = ["Bronza", "Kumush", "Oltin", "Yoqut", "Olmos"] as const;
export const KOTARILISH_MIN_BALL = 50;
export const KOTARILISH_MIN_AZO = 15;
export const GOLIB_MIN_BALL = 50;

const kunRaqami = (s: string) =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86_400_000;

/** «Hafta tugashiga N kun · M kishi»; `bugun` — Toshkent sanasi (`tashkentNow().dateStr`). */
export function haftaMatni(haftaOxiri: string, bugun: string, hajmi: number | null): string {
  const kun = kunRaqami(haftaOxiri) - kunRaqami(bugun) + 1;
  const hafta = kun <= 1 ? "Hafta bugun tugaydi" : `Hafta tugashiga ${kun} kun`;
  return hajmi == null ? hafta : `${hafta} · ${hajmi} kishi`;
}

/** Xona jadvali ustidagi izoh: zona faol / xona kichik / eng yuqori liga. */
export function kotarilishMatni(z: { soni: number; faol: boolean }): string {
  if (z.soni === 0) return "Eng yuqori liga — bu yerdan ko'tarilish yo'q";
  return z.faol
    ? `Birinchi ${z.soni} tasi ko'tariladi (kamida ${KOTARILISH_MIN_BALL} ball)`
    : `Xona hali kichik — ko'tarilish ≥ ${KOTARILISH_MIN_AZO} kishi bo'lganda`;
}

/**
 * «O'tgan hafta» qatori. Daraja faqat o'sadi va ko'tarilish bir pog'ona, shuning
 * uchun ko'tarilgan o'quvchining hozirgi darajasi — yetgan ligasi.
 */
export function otganHaftaMatni(o: NonNullable<Liga["otganHafta"]>, joriy: LigaDarajasi): string {
  return o.kotarildi
    ? `Siz ${o.orin}-o'rin · ${joriy.nomi} ligasiga ko'tarildingiz`
    : `Siz ${o.orin}-o'rin · ${o.hajmi} kishi`;
}

/** Qator ko'tarilish zonasidami (yashil): zona faol va birinchi `soni` ta ichida. */
export function zonadami(platz: number, z: { soni: number; faol: boolean }): boolean {
  return z.faol && platz <= z.soni;
}

/** Guruh bahosi: o'nlik vergul bilan, «12,5 ball». */
export function bahoMatni(baho: number): string {
  return `${String(baho).replace(".", ",")} ball`;
}
```

`lernen/nishon.ts` ni butunlay:

```ts
import { GOLIB_MIN_BALL, LIGA_NOMLARI } from "./liga";
import type { NishonQatori } from "./types";

/**
 * Nishon nomi KALITDAN quriladi (serverda matn yo'q, spec S2 2.3, S3 §3):
 * `SERIE_14` → «14 kun ketma-ket», `WOERTER_150` → «150 ta so'z»,
 * `LIGA_KUMUSH` → «Kumush ligasi».
 */
export function nishonNomi(key: string): string {
  const liga = /^LIGA_([A-Z]+)$/.exec(key);
  if (liga) {
    const nom = LIGA_NOMLARI.find((n) => n.toUpperCase() === liga[1]);
    return nom ? `${nom} ligasi` : key;
  }
  if (key === "XONA_GOLIB") return "Xona g'olibi";
  if (key === "GURUH_BIRINCHI") return "Guruhlar jadvalida 1-o'rin";
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
  switch (q.tur) {
    case "SERIE":
      return `yana ${q.qoldi} kun`;
    case "WOERTER":
      return `yana ${q.qoldi} ta so'z`;
    case "LIGA":
      return `${LIGA_NOMLARI[q.chegara] ?? ""} ligasiga ko'tarilganda`;
    case "XONA":
      return `Xonada 1-o'rin, kamida ${GOLIB_MIN_BALL} ball`;
    case "GURUH":
      return "Guruhingiz hafta jadvalida 1-o'rin olganda";
  }
}
```

- [ ] **Step 4: So'rovlar** — `queries.ts` tiplar importiga `Guruhlar,` va `Liga,` qo'shish (alifbo tartibida: `Fortschritt, FrageFormat, Guruhlar, JuftNatija, LernenGrammarItem, …, LernenUnit, Liga, Maqsad, …`). `useAbschluss` dagi:

```ts
      // Seans oxirida yangi nishon berilgan bo'lishi mumkin.
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
```

ni:

```ts
      // Seans oxirida yangi nishon berilgan bo'lishi mumkin.
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
      // Liga xonasi (birinchi seansda qo'shiladi) va guruhlar jadvali.
      void qc.invalidateQueries({ queryKey: ["lernen", "liga"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "guruhlar"] });
```

ga, `useWiederholungAbschluss` dagi:

```ts
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
    },
  });
}
```

ni:

```ts
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "liga"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "guruhlar"] });
    },
  });
}
```

ga almashtirish va `useNishonlar` dan keyin:

```ts

/** «Liga» tabi — faqat shu tab ochilganda so'raladi. Yozmaydi: xonaga qo'shilish seans oxirida. */
export function useLiga() {
  return useQuery<Liga>({
    queryKey: ["lernen", "liga"],
    queryFn: () => api.get(`${BASE}/liga`).then((r) => r.data),
  });
}

/** «Guruhlar» tabi — markazning haftalik guruhlar jadvali, faqat shu tab ochilganda. */
export function useGuruhlar() {
  return useQuery<Guruhlar>({
    queryKey: ["lernen", "guruhlar"],
    queryFn: () => api.get(`${BASE}/guruhlar`).then((r) => r.data),
  });
}
```

- [ ] **Step 5: Tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/client && npx vitest run src/components/student-portal/lernen && npx tsc --noEmit -p . && npx eslint src/components/student-portal/lernen
```

Expected: vitest PASS (`nishonlarim.test.ts` ham — u faqat SERIE/WOERTER qatorlarini chizadi), tsc 0 xato, eslint 0 error.

- [ ] **Step 6: Commit** (client fayllariga prettier YO'Q)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3 && git add client/src/components/student-portal/lernen/types.ts client/src/components/student-portal/lernen/queries.ts client/src/components/student-portal/lernen/liga.ts client/src/components/student-portal/lernen/liga.test.ts client/src/components/student-portal/lernen/nishon.ts client/src/components/student-portal/lernen/nishon.test.ts && git commit -m "feat(lernen): league and group table types, queries and texts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ilova — to'rt tab, «Liga», «Guruhlar», nishon belgilari

**Files:**
- Create: `client/src/components/student-portal/lernen/reyting/reyting-jadvali.tsx` (`ReytingQatori` + `ReytingJadvali` `reyting-ekrani.tsx` dan ko'chadi)
- Create: `client/.../lernen/reyting/liga-tab.tsx`, `liga-tab.test.ts`
- Create: `client/.../lernen/reyting/guruhlar-tab.tsx`, `guruhlar-tab.test.ts`
- Modify: `client/.../lernen/reyting/reyting-ekrani.tsx` (butunlay), Create: `reyting-ekrani.test.ts`
- Modify: `client/.../lernen/reyting/nishonlarim.tsx` (butunlay), `nishonlarim.test.ts`

**Interfaces:**
- Consumes: `useLiga`, `useGuruhlar`, `useReyting`, `useFortschritt`, `Liga`, `Guruhlar`, `GuruhQatori`, `ReytingZeile`, `haftaMatni`, `kotarilishMatni`, `otganHaftaMatni`, `zonadami`, `bahoMatni`, `nishonNomi`, `nishonQoldi` (Task 8); `tashkentNow` (`@/lib/tashkent-time`); Lumio `Avatar`, `Badge`, `Button`, `Card`, `EmptyState`, `LoadingCards`, `ProgressBar`, `Screen`, `SegmentedControl`, `Skeleton`, `StackHeader`, `Section`.
- Produces: `ReytingQatori({ qator, zona? })`, `ReytingJadvali({ scope })`, `LigaTab()`, `LigaSkelet()`, `GuruhlarTab()`, `GuruhlarSkelet()`, `REYTING_TABLARI`, `ReytingEkrani()`.

S2 dan saboqlar shu vazifada: (1) skelet yuklangan ekranning o'lchamini egallaydi — qatorlarda `min-h-[54px]` / `min-h-[62px]`, kartada `min-h-[88px]`, skeletda aynan shu balandliklar (sahifa sakramaydi); (2) to'ldirishlar qorong'i rejimda ham o'qiladi — faqat shaffof tuslar (`bg-success/10`, `bg-coral-500/8`, Badge tuslari) yoki oq matnli to'q fon; `text-ink-900` hech qachon to'q rangli fon ustida emas (qorong'ida u oq bo'ladi); (3) so'rov faqat ko'ringan tab uchun ketadi — tablar shartli chiziladi, «Butun markaz» ro'yxati bosilgandagina; (4) oynacha yo'q — «Butun markaz» joyida ochiladigan tugma (`aria-expanded`), fokus tugmada qoladi.

- [ ] **Step 1: Yiqiladigan testlar** — `reyting/liga-tab.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { LigaSkelet, LigaTab } from "./liga-tab";
import type { Liga, ReytingZeile } from "../types";

const qator = (platz: number, o: Partial<ReytingZeile> = {}): ReytingZeile => ({
  studentId: 100 + platz,
  name: `Talaba ${platz}`,
  punkte: 200 - platz,
  platz,
  selbst: false,
  ...o,
});

const liga = (o: Partial<Liga> = {}): Liga => ({
  haftaBoshi: "2026-10-19",
  haftaOxiri: "2026-10-25",
  azo: true,
  daraja: { tier: 1, nomi: "Kumush" },
  xona: {
    raqam: 3,
    hajmi: 16,
    qatorlar: Array.from({ length: 16 }, (_, i) => qator(i + 1, i === 6 ? { selbst: true } : {})),
    kotarilishZonasi: { soni: 5, faol: true },
  },
  otganHafta: null,
  ...o,
});

function render(data: Liga): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "liga"], data);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(LigaTab)));
}

describe("LigaTab", () => {
  it("ko'tarilish zonasi: birinchi 5 tasi yashil, o'z qatori ajratilgan, hajm", () => {
    const html = render(liga());
    expect(html).toContain("Kumush ligasi");
    expect(html).toContain("Birinchi 5 tasi ko&#x27;tariladi");
    expect(html.match(/bg-success\/10/g)).toHaveLength(5);
    expect(html.match(/border-coral-500/g)).toHaveLength(1);
    expect(html).toContain("16 kishi");
  });

  it("kichik xona: zona yo'q, «Xona hali kichik»", () => {
    const html = render(
      liga({ xona: { raqam: 1, hajmi: 6, qatorlar: [qator(1)], kotarilishZonasi: { soni: 5, faol: false } } }),
    );
    expect(html).toContain("Xona hali kichik");
    expect(html).not.toContain("bg-success/10");
  });

  it("xonada emas: «Liga: birinchi seansdan keyin», daraja baribir ko'rinadi", () => {
    const html = render(liga({ azo: false, xona: null, daraja: { tier: 0, nomi: "Bronza" } }));
    expect(html).toContain("Liga: birinchi seansdan keyin");
    expect(html).toContain("Bronza ligasi");
  });

  it("o'tgan hafta: ko'tarildi yoki o'rin", () => {
    expect(
      render(liga({ otganHafta: { daraja: { tier: 0, nomi: "Bronza" }, orin: 3, kotarildi: true, hajmi: 22 } })),
    ).toContain("Siz 3-o&#x27;rin · Kumush ligasiga ko&#x27;tarildingiz");
    expect(
      render(liga({ otganHafta: { daraja: { tier: 1, nomi: "Kumush" }, orin: 8, kotarildi: false, hajmi: 22 } })),
    ).toContain("Siz 8-o&#x27;rin · 22 kishi");
  });

  it("«Butun markaz» — ikkinchi darajali tugma, ro'yxat bosilgandagina", () => {
    const html = render(liga());
    expect(html).toContain("Butun markaz");
    expect(html).toContain('aria-expanded="false"');
  });

  it("skelet yuklangan ekran o'lchamlarini egallaydi", () => {
    const html = renderToStaticMarkup(createElement(LigaSkelet));
    expect(html).toContain("h-[88px]");
    expect(html.match(/h-\[54px\]/g)).toHaveLength(6);
  });

  it("ekranda inglizcha so'z yo'q", () => {
    expect(render(liga())).not.toMatch(/league|room|promot|\brank/i);
  });
});
```

`reyting/guruhlar-tab.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { GuruhlarSkelet, GuruhlarTab } from "./guruhlar-tab";
import type { GuruhQatori, Guruhlar } from "../types";

const q = (platz: number, o: Partial<GuruhQatori> = {}): GuruhQatori => ({
  groupId: `g-${platz}`,
  name: `A1-${100 + platz}`,
  baho: 30 - platz + 0.5,
  azolar: 12,
  platz,
  selbst: false,
  ...o,
});

function render(data: Guruhlar): string {
  const client = new QueryClient();
  client.setQueryData(["lernen", "guruhlar"], data);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(GuruhlarTab)));
}

describe("GuruhlarTab", () => {
  it("o'z guruhi 10 dan pastda — ajratuvchidan keyin, haqiqiy o'rni bilan", () => {
    const html = render({
      haftaBoshi: "2026-10-19",
      qatorlar: [...Array.from({ length: 10 }, (_, i) => q(i + 1)), q(14, { selbst: true, baho: 16.5 })],
      oz: { orin: 14, baho: 16.5, azolar: 12, nomi: "A1-114" },
      minAzolar: 3,
    });
    expect(html).toContain("A1-114");
    expect(html).toContain("···");
    expect(html).toContain("16,5 ball");
    expect(html).toContain(">14<");
    expect(html).not.toContain("jadvalga hali kirmaydi");
  });

  it("guruhsiz yoki kichik guruh — izoh", () => {
    const html = render({ haftaBoshi: "2026-10-19", qatorlar: [q(1)], oz: null, minAzolar: 3 });
    expect(html).toContain("Guruhingiz jadvalga hali kirmaydi (kamida 3 kishi kerak)");
  });

  it("skelet qator balandligini egallaydi", () => {
    expect(renderToStaticMarkup(createElement(GuruhlarSkelet))).toContain("h-[62px]");
  });
});
```

`reyting/reyting-ekrani.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import { REYTING_TABLARI } from "./reyting-ekrani";

describe("Reyting tablari", () => {
  // 390 px da besh tab sig'maydi — to'rtta; «Markaz» Liga ichiga ko'chdi.
  it("to'rt tab, Liga birinchi", () => {
    expect(REYTING_TABLARI.map((t) => t.label)).toEqual(["Liga", "Guruhim", "Guruhlar", "Darajam"]);
  });
});
```

`reyting/nishonlarim.test.ts` dagi `describe("Nishonlarim"` oxiriga:

```ts
  it("musobaqa nishoni — o'z nomi va to'q binafsha to'ldirish (oq matn)", () => {
    const html = render([
      { key: "LIGA_KUMUSH", tur: "LIGA", chegara: 1, olingan: "2026-10-19T07:00:00.000Z", qoldi: null },
      { key: "XONA_GOLIB", tur: "XONA", chegara: 1, olingan: null, qoldi: 1 },
    ]);
    expect(html).toContain("Kumush ligasi");
    expect(html).toContain("bg-grape-500 text-white");
    expect(html).toContain("Xonada 1-o&#x27;rin, kamida 50 ball");
  });
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/reyting`
Expected: FAIL (`./liga-tab`, `./guruhlar-tab` topilmaydi; `REYTING_TABLARI` yo'q; `bg-grape-500` yo'q).

- [ ] **Step 2: Umumiy jadval** — `reyting/reyting-jadvali.tsx` (eski `reyting-ekrani.tsx` dagi `ReytingQatori` va `ReytingJadvali`, qatorga `zona` va `min-h` qo'shildi):

```tsx
"use client";

import { ArrowUp, Trophy, UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, LoadingCards } from "../../lumio";
import { useReyting } from "../queries";
import { qisqaRaqam } from "../yol/yol-tuzilishi";
import type { ReytingZeile } from "../types";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/**
 * Bitta reyting qatori — guruh, markaz va liga xonasi bir xil chizadi.
 * `zona` — liga xonasining ko'tarilish zonasi: shaffof yashil tus (yorug' va
 * qorong'ida ham o'qiladi) va strelka — rangning o'zi yolg'iz belgi emas.
 * `min-h-[54px]` — skelet (`LigaSkelet`) shu balandlikni egallaydi.
 */
export function ReytingQatori({ qator, zona = false }: { qator: ReytingZeile; zona?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-h-[54px] items-center gap-3 rounded-card border px-3 py-2.5",
        qator.selbst ? "border-coral-500" : zona ? "border-success/40" : "border-line",
        zona ? "bg-success/10" : qator.selbst ? "bg-coral-500/8" : "bg-surface",
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-ink-500">
        {qator.platz}
      </span>
      <Avatar name={qator.name} size={32} />
      {/* Ism TO'LIQ va QISQARTIRILMAYDI — dizayn 6.1: markaz jadvali
          ataylab barcha filiallarni aralashtiradi, bu leak emas, CEO
          qarori. */}
      <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
        {qator.name}
      </span>
      {zona ? (
        <ArrowUp
          size={16}
          weight="bold"
          className="shrink-0 text-success"
          role="img"
          aria-label="Ko'tarilish zonasi"
        />
      ) : null}
      <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
        {qisqaRaqam(qator.punkte)} ball
      </span>
    </div>
  );
}

/**
 * Guruhim / Butun markaz jadvali — `scope` bilan farqlanadi. Guruhda `[]`
 * deyarli har doim «guruhi yo'q» (server rosterni nol ball bilan to'ldiradi),
 * markazda esa haqiqiy «hali hech kim mashq qilmagan» — ikki xil xabar.
 */
export function ReytingJadvali({ scope }: { scope: "gruppe" | "zentrum" }) {
  const query = useReyting(scope);
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={4} />;
  if (!data) return <LoadFailed query={query} />;

  if (data.length === 0) {
    return scope === "gruppe" ? (
      <EmptyState
        icon={<UsersThree size={28} weight="bold" />}
        title="Siz hali guruhga qo'shilmagansiz"
        description="Guruhga qo'shilgach, guruhdoshlaringiz bilan haftalik ballaringizni solishtira olasiz."
      />
    ) : (
      <EmptyState
        icon={<Trophy size={28} weight="bold" />}
        title="Bu hafta hali hech kim ball to'plamagan"
        description="Birinchi bo'lib mashq qiling — jadval boshida siz turasiz."
      />
    );
  }

  return (
    <div className="space-y-2">
      {data.map((qator) => (
        <ReytingQatori key={qator.studentId} qator={qator} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: «Liga» tabi** — `reyting/liga-tab.tsx`:

```tsx
"use client";

import * as React from "react";
import { Trophy } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { tashkentNow } from "@/lib/tashkent-time";
import { Button, Card, EmptyState, Skeleton } from "../../lumio";
import { useLiga } from "../queries";
import { haftaMatni, kotarilishMatni, otganHaftaMatni, zonadami } from "../liga";
import { ReytingJadvali, ReytingQatori } from "./reyting-jadvali";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/** Daraja belgisining tusi — Badge tuslari kabi shaffof, ikki rejimda ham o'qiladi. */
const LIGA_TUSI = [
  "bg-amber-500/15 text-amber-600",
  "bg-ink-500/12 text-ink-700",
  "bg-amber-500/15 text-amber-600",
  "bg-coral-500/12 text-coral-600",
  "bg-sky-500/12 text-sky-600",
];

/** Yuklanish holati — daraja kartasi (88 px) va olti qator (54 px): ma'lumot kelganda sahifa sakramaydi. */
export function LigaSkelet() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-[88px] w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[54px] w-full" />
      ))}
    </div>
  );
}

/**
 * «Liga» tabi (spec S3 §5): daraja, hafta tugashiga qolgan kun va xona hajmi,
 * xona jadvali (o'z qatori ajratilgan, faol zonada birinchi 5 tasi yashil),
 * tepada «O'tgan hafta». Ostida «Butun markaz» — eski «Markaz» tabining
 * ro'yxati, faqat bosilganda so'raladi. Hech narsa yozmaydi.
 */
export function LigaTab() {
  const query = useLiga();
  const { data } = query;
  const [markaz, setMarkaz] = React.useState(false);

  if (loadState(query) === "loading") return <LigaSkelet />;
  if (!data) return <LoadFailed query={query} />;

  const { daraja, xona, otganHafta } = data;

  return (
    <div className="space-y-4">
      {otganHafta ? (
        <Card className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
            O&apos;tgan hafta
          </p>
          <p className="font-semibold text-ink-900">{otganHaftaMatni(otganHafta, daraja)}</p>
        </Card>
      ) : null}

      <Card className="flex min-h-[88px] items-center gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full",
            LIGA_TUSI[daraja.tier] ?? LIGA_TUSI[0],
          )}
        >
          <Trophy size={26} weight="fill" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold text-ink-900">{daraja.nomi} ligasi</p>
          <p className="text-xs font-semibold text-ink-500">
            {haftaMatni(data.haftaOxiri, tashkentNow().dateStr, xona?.hajmi ?? null)}
          </p>
        </div>
      </Card>

      {xona ? (
        <div className="space-y-2">
          <p
            className={cn(
              "px-1 text-xs font-semibold",
              xona.kotarilishZonasi.faol ? "text-success" : "text-ink-500",
            )}
          >
            {kotarilishMatni(xona.kotarilishZonasi)}
          </p>
          {xona.qatorlar.map((q) => (
            <ReytingQatori key={q.studentId} qator={q} zona={zonadami(q.platz, xona.kotarilishZonasi)} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Trophy size={28} weight="bold" />}
          title="Liga: birinchi seansdan keyin"
          description="Bu haftaning birinchi mashqini tugating — o'z ligangizdagi xonaga qo'shilasiz."
        />
      )}

      <Button
        variant="secondary"
        block
        aria-expanded={markaz}
        aria-controls="butun-markaz"
        onClick={() => setMarkaz((v) => !v)}
      >
        Butun markaz
      </Button>
      {markaz ? (
        <div id="butun-markaz">
          <ReytingJadvali scope="zentrum" />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: «Guruhlar» tabi** — `reyting/guruhlar-tab.tsx`:

```tsx
"use client";

import { UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Card, EmptyState, Skeleton } from "../../lumio";
import { useGuruhlar } from "../queries";
import { bahoMatni } from "../liga";
import type { GuruhQatori } from "../types";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/** Bitta guruh qatori; `min-h-[62px]` — skelet shu balandlikni egallaydi. */
function GuruhQatoriKorinishi({ qator }: { qator: GuruhQatori }) {
  return (
    <div
      className={cn(
        "flex min-h-[62px] items-center gap-3 rounded-card border px-3 py-2.5",
        qator.selbst ? "border-coral-500 bg-coral-500/8" : "border-line bg-surface",
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-ink-500">
        {qator.platz}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-900">{qator.name}</span>
        <span className="block text-xs font-semibold text-ink-500">{qator.azolar} kishi</span>
      </span>
      <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
        {bahoMatni(qator.baho)}
      </span>
    </div>
  );
}

export function GuruhlarSkelet() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[62px] w-full" />
      ))}
    </div>
  );
}

/**
 * «Guruhlar» tabi (spec S3 §2.2): markaz bo'yicha haftalik jadval — guruh
 * a'zolarining o'rtacha bali. TOP 10, o'z guruhi pastda bo'lsa ajratuvchidan
 * keyin haqiqiy o'rni bilan. Guruhsiz yoki 3 kishidan kam guruhda — izoh.
 */
export function GuruhlarTab() {
  const query = useGuruhlar();
  const { data } = query;

  if (loadState(query) === "loading") return <GuruhlarSkelet />;
  if (!data) return <LoadFailed query={query} />;

  const top = data.qatorlar.slice(0, 10);
  const pastda = data.qatorlar.slice(10);

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold text-ink-500">
        Guruh a&apos;zolarining shu haftadagi o&apos;rtacha bali
      </p>
      {data.oz ? null : (
        <Card className="text-sm font-semibold text-ink-700">
          Guruhingiz jadvalga hali kirmaydi (kamida {data.minAzolar} kishi kerak)
        </Card>
      )}
      {data.qatorlar.length === 0 ? (
        <EmptyState
          icon={<UsersThree size={28} weight="bold" />}
          title="Bu hafta jadvalda guruh yo'q"
          description="Kamida 3 kishilik faol guruhlar shu yerda haftalik o'rtacha ball bilan ko'rinadi."
        />
      ) : null}
      {top.map((q) => (
        <GuruhQatoriKorinishi key={q.groupId} qator={q} />
      ))}
      {pastda.length > 0 ? (
        <>
          <p className="text-center text-xs font-semibold text-ink-500" aria-hidden>
            ···
          </p>
          {pastda.map((q) => (
            <GuruhQatoriKorinishi key={q.groupId} qator={q} />
          ))}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Ekran** — `reyting/reyting-ekrani.tsx` ni butunlay (DarajamTab o'zgarmaydi, jadval `reyting-jadvali.tsx` ga ko'chdi):

```tsx
"use client";

import * as React from "react";
import {
  Badge,
  Card,
  LoadingCards,
  ProgressBar,
  Screen,
  SegmentedControl,
  StackHeader,
  type SegmentOption,
} from "../../lumio";
import { useFortschritt } from "../queries";
import { darajaFoizi, qisqaRaqam } from "../yol/yol-tuzilishi";
import { Nishonlarim } from "./nishonlarim";
import { ReytingJadvali } from "./reyting-jadvali";
import { LigaTab } from "./liga-tab";
import { GuruhlarTab } from "./guruhlar-tab";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

type ReytingTab = "liga" | "guruhim" | "guruhlar" | "darajam";

/**
 * To'rt tab (spec S3 §5): 390 px da besh tab sig'maydi, shuning uchun eski
 * «Markaz» «Liga» ichiga «Butun markaz» bo'lib ko'chdi. Har tab o'z
 * so'rovini faqat chizilganda yuboradi.
 */
export const REYTING_TABLARI: SegmentOption<ReytingTab>[] = [
  { value: "liga", label: "Liga" },
  { value: "guruhim", label: "Guruhim" },
  { value: "guruhlar", label: "Guruhlar" },
  { value: "darajam", label: "Darajam" },
];

/**
 * Darajam — jadval emas, o'quvchining o'z o'sishi: umumiy ball, hozirgi
 * daraja (nemischa ustida, o'zbekcha ostida), keyingi darajagacha necha
 * ball qolgani. Foiz `darajaFoizi` bilan — HOZIRGI band ichida qancha bosib
 * o'tilgani. Ostida «Nishonlarim» (S2) — o'z so'rovi bilan.
 */
function DarajamTab() {
  const query = useFortschritt();
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={2} />;
  if (!data) return <LoadFailed query={query} />;

  const { gesamt, stufe, naechsteStufe } = data;
  const foiz = darajaFoizi(gesamt, stufe.ab, naechsteStufe?.ab ?? null);
  const qoldi = naechsteStufe ? Math.max(0, naechsteStufe.ab - gesamt) : 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-6 text-center">
        <div>
          <p className="font-display text-4xl font-extrabold text-ink-900">
            {qisqaRaqam(gesamt)}
          </p>
          <p className="text-sm font-semibold text-ink-500">umumiy ball</p>
        </div>

        <div>
          <p className="font-display text-2xl font-extrabold text-ink-900">
            {stufe.de}
          </p>
          <p className="text-sm font-semibold text-ink-500">{stufe.uz}</p>
        </div>

        {naechsteStufe ? (
          <div className="space-y-1.5 text-left">
            <ProgressBar value={foiz} />
            <p className="text-xs font-semibold text-ink-500">
              {naechsteStufe.de} ({naechsteStufe.uz}) darajagacha{" "}
              {qisqaRaqam(qoldi)} ball qoldi
            </p>
          </div>
        ) : (
          <Badge tone="amber" size="md" className="mx-auto">
            Eng yuqori daraja
          </Badge>
        )}
      </Card>
      <Nishonlarim />
    </div>
  );
}

export function ReytingEkrani() {
  const [tab, setTab] = React.useState<ReytingTab>("liga");

  return (
    <Screen narrow>
      <StackHeader title="Reyting" backHref="/portal/lernen" />
      <SegmentedControl<ReytingTab> options={REYTING_TABLARI} value={tab} onChange={setTab} />

      {tab === "liga" ? (
        <LigaTab />
      ) : tab === "guruhim" ? (
        <ReytingJadvali scope="gruppe" />
      ) : tab === "guruhlar" ? (
        <GuruhlarTab />
      ) : (
        <DarajamTab />
      )}
    </Screen>
  );
}
```

- [ ] **Step 6: Nishon belgilari** — `reyting/nishonlarim.tsx` ni butunlay:

```tsx
"use client";

import { BookOpen, Crown, Fire, Trophy, UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LoadingCards, Section } from "../../lumio";
import { useNishonlar } from "../queries";
import { nishonNomi, nishonQoldi } from "../nishon";
import type { NishonQatori } from "../types";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

const BELGI: Record<NishonQatori["tur"], typeof Fire> = {
  SERIE: Fire,
  WOERTER: BookOpen,
  LIGA: Trophy,
  XONA: Crown,
  GURUH: UsersThree,
};

/** Olingan nishonning to'ldirishi — to'q fon, oq matn (qorong'i rejimda ham o'qiladi). */
const TOLDIRISH: Record<NishonQatori["tur"], string> = {
  SERIE: "bg-coral-500 text-white",
  WOERTER: "bg-teal-500 text-white",
  LIGA: "bg-grape-500 text-white",
  XONA: "bg-grape-500 text-white",
  GURUH: "bg-grape-500 text-white",
};

/**
 * «Darajam» tabi ichidagi nishonlar (spec S2 3.3, S3 §3). So'rov faqat shu
 * bo'lim chizilganda ketadi. Olingan nishon to'la rangda, olinmagani chiziqli
 * ramkada — nima qilish kerakligi bilan.
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
            const Icon = BELGI[n.tur];
            return (
              <li
                key={n.key}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-card px-2 py-3 text-center",
                  olingan ? TOLDIRISH[n.tur] : "border-2 border-dashed border-line text-ink-500",
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

- [ ] **Step 7: Tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/client && npx vitest run src/components/student-portal && npx tsc --noEmit -p . && npx eslint src/components/student-portal/lernen
```

Expected: vitest PASS (`nishonlarim.test.ts` ning eski ikki testi ham — `border-dashed` soni o'zgarmadi), tsc 0 xato, eslint 0 error. `rg -n "ReytingJadvali|ReytingQatori" client/src` — faqat `reyting/` ichida (boshqa import yo'q).

- [ ] **Step 8: Commit** (client fayllariga prettier YO'Q)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3 && git add client/src/components/student-portal/lernen/reyting && git commit -m "feat(lernen): league tab, group table tab and competition badges

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Yuklama sinovi va 5 000 o'quvchida hafta hisobi

**Files:**
- Create: `server/scripts/load/daf-yuklama-s3-seed.ts`
- Create: `server/scripts/load/daf-yuklama-s3-hisob.ts`
- Modify: `server/scripts/load/daf-yuklama-kohort.ts` (`kohortOl` ga `xonasiz`)
- Modify: `server/scripts/load/daf-yuklama-olchov.ts`
- Modify: `server/scripts/load/daf-yuklama-paritet.ts`
- Modify: `server/src/daf/liga/liga.single-source.spec.ts` (`ALLOWED` ga seed)
- Modify: `docs/superpowers/specs/2026-10-18-musobaqa-s3-liga-design.md` (yangi §11)

**Interfaces:**
- Consumes: `joinRoom` (Task 3), `settleDue` (Task 5), `guruhlarYigindisi` (Task 4), `guruhlarniSarala`, qoidalar konstantalari (Task 2), `FortschrittService.liga/guruhlar/seansNatijasi` (Task 6–7); S1/S2 skriptlari `daf-yuklama-seed.ts`, `daf-yuklama-s2-seed.ts`, `daf-yuklama-kohort.ts` (`KOHORT`, `KOHORT_SQL`, `kohortOl`).
- Produces: `kohortOl(prisma, nomi, n, badgeSiz = false, xonasiz = false)`.

**Nima o'lchanadi.** (1) `settleWeek` 5 000 o'quvchida: vaqt va natija to'g'riligi (spec §7 «Haqiqiy baza»: Σ `place` satrlari = a'zolar soni; ko'tarilganlar ≤ 5 × xonalar; brute force bilan har xona; ikkinchi hisob hech narsani o'zgartirmaydi; daraja tushmaydi; yangi hafta xonalari teng). (2) S1/S2 jadvali + `liga`, `guruhlar`; `seansNatijasi` endi liga so'rovi bilan, alohida qator — xonasiz o'quvchining birinchi seansi (`joinRoom` yo'li). (3) Parallel `joinRoom`. (4) Moslik: liga xonasi va guruhlar jadvali brute force bilan.

- [ ] **Step 1: Seed qorovulga ma'lum qilinadi** — `liga.single-source.spec.ts` dagi `ALLOWED` ga:

```ts
  // Local only (load-test DB): tiers spread over all five leagues. Rooms are
  // made by `joinRoom`; this raw INSERT of tier rows is the one exception.
  'scripts/load/daf-yuklama-s3-seed.ts': ['DafStudentLeague'],
```

- [ ] **Step 2: S3 seed** — `server/scripts/load/daf-yuklama-s3-seed.ts`:

```ts
/**
 * LOCAL ONLY. S3 league data for the load test (spec S3 §7), AFTER
 * `daf-yuklama-s2-seed.ts`: tiers spread over all five leagues and LAST
 * week's rooms for the first 5 000 students — all but cohort TUGAGAN, left
 * out so the measurement has students who join a room at their first
 * session. Rooms and memberships go through the module's own `joinRoom`;
 * the tier rows are the one raw write `liga.single-source.spec.ts` allows.
 *
 * Run once per fresh DB: it refuses when league rooms exist.
 */
import { Prisma } from '@prisma/client';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { KOHORT, KOHORT_SQL } from './daf-yuklama-kohort';
import { joinRoom } from '../../src/daf/liga/liga-xona';

assertLocalDb();

const ISHCHI = 20;

run(async (prisma) => {
  if ((await prisma.dafLeagueRoom.count()) > 0) {
    throw new Error('Liga ma`lumoti allaqachon bor. Bazani qayta yarating.');
  }
  // ~20% each tier, independent of the cohort index.
  const darajalar = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DafStudentLeague" ("studentId", "companyId", "tier", "updatedAt")
    SELECT c.id, c."companyId", (c.id / 10) % 5, (now() AT TIME ZONE 'UTC')
    FROM (${KOHORT_SQL}) c
    ON CONFLICT ("studentId") DO NOTHING`);

  const list = await prisma.$queryRaw<{ id: number; companyId: number }[]>(
    Prisma.sql`SELECT c.id, c."companyId" FROM (${KOHORT_SQL}) c
               WHERE c.k <> ALL(${[...KOHORT.TUGAGAN]}::int[]) ORDER BY c.id`,
  );
  // A moment of last week (Tashkent): `joinRoom` puts it in that week's rooms.
  const otganHafta = new Date(Date.now() - 7 * 86_400_000);
  let i = 0;
  await Promise.all(
    Array.from({ length: ISHCHI }, async () => {
      while (i < list.length) {
        const s = list[i++];
        await joinRoom(prisma as any, s.id, s.companyId, otganHafta);
      }
    }),
  );

  for (const t of ['DafStudentLeague', 'DafLeagueRoom', 'DafLeagueEntry']) {
    await prisma.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(`"${t}"`)}`);
  }
  const xonalar = await prisma.$queryRaw<
    { tier: number; xonalar: number; azolar: number; eng: number }[]
  >`SELECT tier, COUNT(*)::int AS xonalar, SUM(n)::int AS azolar, MAX(n)::int AS eng
    FROM (SELECT r.tier, COUNT(e.id) AS n FROM "DafLeagueRoom" r
          JOIN "DafLeagueEntry" e ON e."roomId" = r.id GROUP BY r.id, r.tier) x
    GROUP BY tier ORDER BY tier`;
  console.log({ darajalar, qoshildi: list.length, xonalar });
  if (xonalar.reduce((s, x) => s + x.azolar, 0) !== list.length || xonalar.some((x) => x.eng > 30)) {
    process.exitCode = 1;
  }
});
```

- [ ] **Step 3: Hafta hisobi tekshiruvi** — `server/scripts/load/daf-yuklama-s3-hisob.ts`:

```ts
/**
 * LOCAL ONLY. S3 `settleWeek` on the load-test DB (spec S3 §7 «Haqiqiy
 * baza»): last week's rooms (`daf-yuklama-s3-seed.ts`) are settled once,
 * timed, and checked against a brute-force read of `DafStudentDay`: every
 * member placed, places 1..n per room, points = the week's sum over all
 * group keys, promotions exactly where the rule allows, promoted ≤ 5 × rooms,
 * tiers never lower, a second run changes nothing, the new week's rooms are
 * even per tier, the group week has one row per eligible group. Exit 1 on any
 * failure or when the settlement takes 60 s or more.
 */
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { settleDue } from '../../src/daf/liga/liga-hisob';
import { guruhlarYigindisi } from '../../src/daf/liga/guruhlar-jadvali';
import {
  ENG_YUQORI_DARAJA,
  KOTARILISH_MIN_AZO,
  KOTARILISH_MIN_BALL,
  KOTARILISH_SONI,
  XONA_SIGIMI,
  guruhlarniSarala,
} from '../../src/daf/liga/liga-qoidalari';
import { addDaysToDateStr } from '../../src/attendance/shared/date-utils';
import { utcMidnightFromDateStr } from '../../src/common/date/tashkent';
import { wochenStartTag } from '../../src/daf/uebung/punkte';

assertLocalDb();

const VAQT_CHEGARASI_MS = 60_000;

run(async (prisma) => {
  const jetzt = new Date();
  const joriy = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(joriy, -7);
  const W = utcMidnightFromDateStr(otgan);
  const J = utcMidnightFromDateStr(joriy);
  const { companyId } = await prisma.dafLeagueRoom.findFirstOrThrow({ where: { weekStart: W } });
  const xatolar: string[] = [];
  const tekshir = (shart: boolean, nima: string) => {
    if (!shart) xatolar.push(nima);
  };

  const oldingiDaraja = new Map(
    (await prisma.dafStudentLeague.findMany({ select: { studentId: true, tier: true } })).map(
      (d) => [d.studentId, d.tier],
    ),
  );

  const t0 = performance.now();
  const birinchi = await settleDue(prisma as any, companyId, jetzt, { kutish: true });
  const ms = Math.round(performance.now() - t0);

  const xonalar = await prisma.dafLeagueRoom.findMany({
    where: { weekStart: W },
    select: { id: true, tier: true, settledAt: true },
  });
  const kirishlar = await prisma.dafLeagueEntry.findMany({
    where: { weekStart: W },
    select: { id: true, roomId: true, studentId: true, place: true, points: true, promoted: true },
    orderBy: { id: 'asc' },
  });
  // Brute force: the week's points per student over ALL group keys.
  const kunlar = await prisma.dafStudentDay.findMany({
    where: { day: { gte: W, lt: J } },
    select: { studentId: true, points: true },
  });
  const ball = new Map<number, number>();
  for (const k of kunlar) ball.set(k.studentId, (ball.get(k.studentId) ?? 0) + k.points);

  tekshir(xonalar.every((x) => x.settledAt !== null), 'hamma xona hisoblangan');
  tekshir(kirishlar.every((k) => k.place !== null), "Σ place satrlari = a'zolar soni");
  const kotarilganlar = kirishlar.filter((k) => k.promoted).length;
  tekshir(kotarilganlar <= KOTARILISH_SONI * xonalar.length, "ko'tarilganlar ≤ 5 × xonalar");
  const tierOf = new Map(xonalar.map((x) => [x.id, x.tier]));
  const boyicha = new Map<number, typeof kirishlar>();
  for (const k of kirishlar) boyicha.set(k.roomId, [...(boyicha.get(k.roomId) ?? []), k]);
  for (const [roomId, list] of boyicha) {
    const tier = tierOf.get(roomId)!;
    const tartib = [...list].sort(
      (a, b) => (ball.get(b.studentId) ?? 0) - (ball.get(a.studentId) ?? 0) || a.studentId - b.studentId,
    );
    tartib.forEach((k, i) => {
      const p = ball.get(k.studentId) ?? 0;
      const kerak =
        list.length >= KOTARILISH_MIN_AZO && tier < ENG_YUQORI_DARAJA && i < KOTARILISH_SONI && p >= KOTARILISH_MIN_BALL;
      if (k.place !== i + 1 || k.points !== p || k.promoted !== kerak)
        xatolar.push(`xona ${roomId}, o'quvchi ${k.studentId}: ${k.place}/${k.points}/${k.promoted} ≠ ${i + 1}/${p}/${kerak}`);
    });
  }

  const keyingiDaraja = new Map(
    (await prisma.dafStudentLeague.findMany({ select: { studentId: true, tier: true } })).map(
      (d) => [d.studentId, d.tier],
    ),
  );
  for (const k of kirishlar) {
    const oldin = oldingiDaraja.get(k.studentId) ?? 0;
    const hozir = keyingiDaraja.get(k.studentId) ?? 0;
    if (hozir < oldin) xatolar.push(`daraja tushdi: ${k.studentId}`);
    if (k.promoted && hozir !== Math.max(oldin, tierOf.get(k.roomId)! + 1))
      xatolar.push(`ko'tarilish yozilmadi: ${k.studentId}`);
    if (!k.promoted && hozir !== oldin) xatolar.push(`daraja o'zgardi: ${k.studentId}`);
  }

  // Next week = this week: exactly the members with ≥ 1 point, even per tier.
  const faollar = new Set(kirishlar.filter((k) => (k.points ?? 0) >= 1).map((k) => k.studentId));
  const yangilar = await prisma.dafLeagueEntry.findMany({
    where: { weekStart: J },
    select: { studentId: true, roomId: true, tier: true },
  });
  tekshir(yangilar.length === faollar.size && yangilar.every((y) => faollar.has(y.studentId)), "yangi hafta = ≥ 1 ball topganlar");
  tekshir(yangilar.every((y) => y.tier === (keyingiDaraja.get(y.studentId) ?? 0)), 'yangi xona — yangi daraja');
  const hajmlar = new Map<string, number>();
  for (const y of yangilar) hajmlar.set(`${y.tier}|${y.roomId}`, (hajmlar.get(`${y.tier}|${y.roomId}`) ?? 0) + 1);
  for (let tier = 0; tier <= ENG_YUQORI_DARAJA; tier += 1) {
    const h = [...hajmlar].filter(([k]) => k.startsWith(`${tier}|`)).map(([, n]) => n);
    if (h.length > 0 && (Math.max(...h) - Math.min(...h) > 1 || Math.max(...h) > XONA_SIGIMI))
      xatolar.push(`daraja ${tier}: xonalar teng emas (${h.join(', ')})`);
  }

  const guruhlar = guruhlarniSarala(await guruhlarYigindisi(prisma as any, companyId, otgan));
  tekshir((await prisma.dafGroupWeek.count({ where: { weekStart: W } })) === guruhlar.length, 'guruh haftasi = jadval');

  // Idempotent: a second run settles nothing and changes nothing.
  const surat = () =>
    Promise.all([
      prisma.dafLeagueEntry.findMany({ orderBy: { id: 'asc' } }),
      prisma.dafStudentLeague.findMany({ orderBy: { studentId: 'asc' } }),
      prisma.dafGroupWeek.count(),
      prisma.dafLeagueRoom.count(),
    ]).then((x) => JSON.stringify(x));
  const oldinSurat = await surat();
  const ikkinchi = await settleDue(prisma as any, companyId, jetzt, { kutish: true });
  tekshir(ikkinchi.every((n) => n.xonalar === 0 && n.kotarildi === 0), 'ikkinchi hisob hech narsa olmadi');
  tekshir((await surat()) === oldinSurat, "ikkinchi hisob hech narsani o'zgartirmadi");
  tekshir(ms < VAQT_CHEGARASI_MS, `hisob ${VAQT_CHEGARASI_MS} ms dan tez`);

  console.log({
    ms,
    birinchi,
    xonalar: xonalar.length,
    azolar: kirishlar.length,
    kotarilganlar,
    yangiHaftaAzolari: yangilar.length,
    guruhlar: guruhlar.length,
    xatolar: xatolar.length,
  });
  for (const x of xatolar.slice(0, 20)) console.log(x);
  if (xatolar.length > 0) process.exitCode = 1;
});
```

- [ ] **Step 4: Kohort — xonasiz o'quvchilar** — `daf-yuklama-kohort.ts` dagi `kohortOl`:

```ts
  nomi: KohortNomi,
  n: number,
  badgeSiz = false,
): Promise<KohortStudent[]> {
```

ni:

```ts
  nomi: KohortNomi,
  n: number,
  badgeSiz = false,
  /** S3: shu hafta liga xonasi yo'qlar — birinchi seansi `joinRoom` yo'lidan o'tadi. */
  xonasiz = false,
): Promise<KohortStudent[]> {
```

ga, va `badgeSiz ? … : Prisma.empty` bo'lagidan keyin (o'sha `WHERE` ichida):

```ts
      ${
        xonasiz
          ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "DafLeagueEntry" l WHERE l."studentId" = c.id
              AND l."weekStart" = (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date)`
          : Prisma.empty
      }
```

- [ ] **Step 5: O'lchovni kengaytirish** — `daf-yuklama-olchov.ts`:
  - fayl tepasidagi izohda «p50 / p95 of the S1 and S2 reads» → «p50 / p95 of the S1, S2 and S3 reads»; importlarga:

```ts
import { joinRoom } from '../../src/daf/liga/liga-xona';
```

  - `LIMIT` ga `nishonlar: 200,` dan keyin `liga: 200,` va `guruhlar: 200,`;
  - amallar ro'yxatiga `['nishonlar', …]` dan keyin:

```ts
      ['liga', (s: (typeof students)[0]) => svc.liga(s.id)],
      [
        'guruhlar',
        (s: (typeof students)[0]) => svc.guruhlar(s.id, s.companyId),
      ],
```

  - `kohortOlchov` ning `opts` tipini `{ prep?: boolean; fresh?: boolean; xonasiz?: boolean }` ga va ichidagi `kohortOl(prisma, nomi, PARALLEL, opts.fresh)` ni `kohortOl(prisma, nomi, PARALLEL, opts.fresh, opts.xonasiz)` ga almashtirish;
  - `cohortTable` ro'yxatining oxiriga (`nishonlar · …` qatoridan keyin):

```ts
    await kohortOlchov(
      'seansNatijasi · liga xonasiga birinchi qo`shilish (xonasiz TUGAGAN)',
      LIMIT.seansNatijasi,
      'TUGAGAN',
      seans,
      { prep: true, xonasiz: true },
    ),
    await kohortOlchov('liga · xonada (DUE)', LIMIT.liga, 'DUE', (s) => svc.liga(s.id)),
    await kohortOlchov('guruhlar (DUE)', LIMIT.guruhlar, 'DUE', (s) =>
      svc.guruhlar(s.id, s.companyId),
    ),
```

  - `console.table(table);` dan keyin (kohort blokidan OLDIN — kohort qatori xonasiz TUGAGAN o'quvchilarni ishlatib tugatadi, bu tekshiruvga 51 tasi kerak):

```ts
  // S3: 50 joins at once for one room-less student — one membership; then 50
  // different room-less students — no room above 30, no one twice.
  const [yolgiz] = await kohortOl(prisma, 'TUGAGAN', 1, false, true);
  const qoshildi = await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      joinRoom(prisma as any, yolgiz.id, yolgiz.companyId, new Date()),
    ),
  );
  const kopchilik = await kohortOl(prisma, 'TUGAGAN', PARALLEL, false, true);
  await Promise.all(
    kopchilik.map((s) => joinRoom(prisma as any, s.id, s.companyId, new Date())),
  );
  const [liga] = await prisma.$queryRaw<
    { bir: number; eng: number; ikki: number }[]
  >`
    WITH h AS (SELECT (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date AS w)
    SELECT
      (SELECT COUNT(*)::int FROM "DafLeagueEntry", h WHERE "studentId" = ${yolgiz.id} AND "weekStart" = h.w) AS bir,
      (SELECT COALESCE(MAX(n), 0)::int FROM (SELECT COUNT(*) AS n FROM "DafLeagueEntry", h
         WHERE "weekStart" = h.w GROUP BY "roomId") x) AS eng,
      (SELECT COUNT(*)::int FROM (SELECT "studentId" FROM "DafLeagueEntry", h
         WHERE "weekStart" = h.w GROUP BY "studentId" HAVING COUNT(*) > 1) y) AS ikki`;
  const ligaOk =
    liga.bir === 1 &&
    new Set(qoshildi.map((q) => q.roomId)).size === 1 &&
    liga.eng <= 30 &&
    liga.ikki === 0;
  console.log('league join concurrency', liga, ligaOk ? 'OK' : 'FAIL');
```

  - oxirgi shartga `|| !ligaOk` qo'shish.

- [ ] **Step 6: Moslikni kengaytirish** — `daf-yuklama-paritet.ts`:
  - fayl tepasidagi izoh oxiriga: «S3: the same students' league room (`liga()`) against a brute-force read — the room's members, each with the week's `DafStudentDay` sum over all group keys, sorted points DESC then studentId ASC — and the group table (`guruhlar()`) against a brute force from `Group` + `Enrollment` + the week's rows: current ACTIVE members of ACTIVE live groups, points with `groupKey` = the group, ≥ 3 members, average DESC then group id ASC, TOP 10 + own group.»
  - `moved` hisoblanishidan oldin (zero-tie tranzaksiyasidan keyin) quyidagi blok:

```ts
  // S3: league room and group table against brute force.
  const kunQatorlari = await prisma.dafStudentDay.findMany({
    where: { companyId, day: { gte: montag } },
    select: { studentId: true, points: true, groupKey: true },
  });
  const haftaBall = new Map<number, number>();
  const guruhBall = new Map<string, number>();
  for (const r of kunQatorlari) {
    haftaBall.set(r.studentId, (haftaBall.get(r.studentId) ?? 0) + r.points);
    const k = `${r.studentId}|${r.groupKey}`;
    guruhBall.set(k, (guruhBall.get(k) ?? 0) + r.points);
  }
  let ligaTekshirildi = 0;
  for (const s of samples.slice(0, 80)) {
    const l = await svc.liga(s.id);
    const kirish = await prisma.dafLeagueEntry.findFirst({
      where: { studentId: s.id, weekStart: montag },
    });
    check(s.id, 'liga.azo', l.azo, !!kirish);
    if (!kirish) continue;
    ligaTekshirildi += 1;
    const azolar = await prisma.dafLeagueEntry.findMany({
      where: { roomId: kirish.roomId },
      select: { studentId: true },
    });
    const want = azolar
      .map((a) => ({ id: a.studentId, p: haftaBall.get(a.studentId) ?? 0 }))
      .sort((a, b) => b.p - a.p || a.id - b.id)
      .map((a, i) => [a.id, i + 1, a.p, a.id === s.id]);
    check(
      s.id,
      'liga.qatorlar',
      l.xona?.qatorlar.map((q) => [q.studentId, q.platz, q.punkte, q.selbst]),
      want,
    );
  }
  const faolGuruhlar = await prisma.group.findMany({
    where: { companyId, statusEnum: 'ACTIVE', deletedAt: null },
    select: { id: true, enrollments: { where: { status: 'ACTIVE' }, select: { studentId: true } } },
  });
  const brute = faolGuruhlar
    .map((g) => {
      const ids = [...new Set(g.enrollments.map((e) => e.studentId))];
      const ball = ids.reduce((sum, id) => sum + (guruhBall.get(`${id}|${g.id}`) ?? 0), 0);
      return { groupId: g.id, azolar: ids.length, baho: ball / Math.max(ids.length, 1) };
    })
    .filter((g) => g.azolar >= 3)
    .sort((a, b) => b.baho - a.baho || (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0));
  for (const s of samples.slice(0, 40)) {
    const j = await svc.guruhlar(s.id, s.companyId);
    const own = groupOf.get(s.id) ?? null;
    const i = brute.findIndex((g) => g.groupId === own);
    const want = [...brute.slice(0, 10), ...(i >= 10 ? [brute[i]] : [])].map((g) => [
      g.groupId,
      brute.indexOf(g) + 1,
      Math.round(g.baho * 10) / 10,
      g.azolar,
    ]);
    check(s.id, 'guruhlar', j.qatorlar.map((q) => [q.groupId, q.platz, q.baho, q.azolar]), want);
    check(s.id, 'guruhlar.oz', j.oz?.orin ?? null, i >= 0 ? i + 1 : null);
  }
```

  - yakuniy `console.log({ … })` ga `ligaTekshirildi,` va `faolGuruhlar: brute.length,` qo'shish.

- [ ] **Step 7: Sinov bazasini to'ldirish** (`$S1_DB`, Task 1 Step 6–7; Task 3–5 probalaridan keyin liga jadvallari tozalangan). Baza o'chib ketgan bo'lsa — avval Task 1 Step 6–7 ni qaytarish. So'ng, tartib bilan:

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-seed.ts
cd server && DATABASE_URL="$S1_DB" npm run daf:a1-seed
cd server && for u in 1 2 3 4 5; do DATABASE_URL="$S1_DB" npm run daf:inhalt-seed -- --unit $u; done
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s2-seed.ts
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s3-seed.ts
```

Expected: yuklama seed `week ≈ 1 000 000`, `history ≈ 300 000`, `diff: 0`; S2 seed `diff: 0`, `boshOchiq: false`, `boshTugagan: true` (u `DafStudentBadge` bo'sh bo'lsa ishlaydi — Task 3–5 nishon bermagan); S3 seed `qoshildi: 4500`, har daraja xonalari `eng ≤ 30`, exit 0. Uzoq buyruqlarni (`daf-yuklama-seed`, `s3-seed`) `run_in_background: true` bilan yurgizish.

- [ ] **Step 8: Hafta hisobi 5 000 o'quvchida**

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-s3-hisob.ts
```

Expected: `xatolar: 0`, `ms` < 60 000 (raqamni yozib olish), `birinchi` — o'tgan hafta va (agar bo'lsa) undan oldingi hisoblanmagan hafta natijasi, `kotarilganlar ≤ 5 × xonalar`. Yiqilsa — Step 11 ga o'tilmaydi; birinchi gumon: `liga-azolar-ballari` rejasi (`EXPLAIN ANALYZE` bilan), so'ng bo'laklar hajmi.

- [ ] **Step 9: O'lchov**

```bash
uptime && cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-olchov.ts
```

Expected: har qatorda `ok: true` (jumladan `liga`, `guruhlar`, `seansNatijasi · liga xonasiga birinchi qo'shilish`); `same-row concurrency … OK`; `badge concurrency … OK`; `league join concurrency … OK`. Biror `ok: false` bo'lsa — Step 11 ga o'tilmaydi. `guruhlar` sekin bo'lsa birinchi gumon — `ball` CTE ining rejasi (`DafStudentDay_studentId_day_groupKey_key` o'rniga `companyId, day` indeksi; `EXPLAIN ANALYZE` ni o'sha SQL bilan yurgizib ko'rish). `seansNatijasi` sekin bo'lsa — `liga-sharoiti` dagi `guruhBirinchi` EXISTS ning rejasi.

- [ ] **Step 10: Moslik**

```bash
cd server && DATABASE_URL="$S1_DB" npx ts-node --transpile-only scripts/load/daf-yuklama-paritet.ts
```

Expected: `mismatches: 0`, `ligaTekshirildi` > 0, `faolGuruhlar` > 10.

- [ ] **Step 11: Natijalarni spec'ga yozish** — `2026-10-18-musobaqa-s3-liga-design.md` oxiriga (§10 jadvalidan keyin; spec §7 «hisobot spec §8 ga» deydi, lekin §8 — «Hujjat va deploy», shuning uchun yangi bo'lim):

```markdown

---

## 11. Yuklama natijalari

O'lchangan <sana>, lokal sinov bazasi `daf_s1_yuklama` (qayta yaratilgan;
S1 §10 va S2 §8 bilan bir xil ma'lumot: <N> o'quvchi, urinishlar birinchi
5 000 tasida, A1 u01–u05, S2 kohortlari). S3 ma'lumoti: 5 000 o'quvchida
daraja (har ligada ≈ 20%), o'tgan hafta <X> xona / 4 500 a'zo (TUGAGAN
kohorti xonasiz). 50 parallel o'quvchi × 10 raund, servis darajasida, kod
`<qisqa sha>`, load average <qiymat>.

**`settleWeek`, bir kompaniya, 5 000 o'quvchi:** <ms> ms; <xonalar> xona,
<azolar> a'zo, <kotarilganlar> ko'tarildi (≤ 5 × xonalar), yangi haftada
<yangi> a'zo; brute force bilan farq 0; ikkinchi hisob 0 xona, o'zgarish yo'q.

| Amal | p50 | p95 | Chegara (p95) | Holat |
| --- | --- | --- | --- | --- |
| `liga` | … | … | 200 | … |
| `guruhlar` | … | … | 200 | … |
| `seansNatijasi` (liga so'rovi bilan), tasodifiy aralash | … | … | 300 | … |
| `seansNatijasi`, liga xonasiga birinchi qo'shilish | … | … | 300 | … |
| `uebersicht` (fortschritt) | … | … | 200 | … |
| `reyting zentrum` | … | … | 200 | … |
| `reyting gruppe` | … | … | 200 | … |
| `recordAttempt` | … | … | 200 | … |
| `nishonlar` | … | … | 200 | … |

**Parallel `joinRoom`:** bitta o'quvchi 50 marta — 1 a'zolik; 50 xonasiz
o'quvchi birdan — eng katta xona <n> (≤ 30), ikki xonali o'quvchi 0.
**Moslik:** <n> o'quvchining liga xonasi va guruhlar jadvali brute force
bilan — farq 0.
```

Burchak qavsdagi va `…` joylarni o'lchov chiqargan raqamlar bilan to'ldirish (shablon matn qolmasin).

- [ ] **Step 12: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3 && npx --prefix server prettier --write server/scripts/load server/src/daf/liga/liga.single-source.spec.ts && (cd server && npx jest src/daf/liga/liga.single-source.spec.ts) && git add server/scripts/load server/src/daf/liga/liga.single-source.spec.ts docs/superpowers/specs/2026-10-18-musobaqa-s3-liga-design.md && git commit -m "test(daf): S3 load test, settleWeek on 5 000 students and league parity

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: ADR-0116, CLAUDE.md, yangilik, to'liq tekshiruv

**Files:**
- Create: `docs/adr/0116-daf-liga-faqat-kotarilish-haftalik-xona.md`
- Modify: `docs/adr/README.md`
- Modify: `server/CLAUDE.md` (`### DaF progress (`src/daf/`, ADR-0114, ADR-0115)` bo'limi)
- Modify: `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR raqamini tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3 && git fetch origin && ls docs/adr | sort | tail -3 && git ls-tree origin/main docs/adr/ --name-only | sort | tail -3
```

Expected: shu shoxda eng kattasi `0115`, `main` da `0116` yo'q (18.10 da `main` ning eng kattasi `0113`). Band bo'lsa — keyingi bo'sh raqam olinadi va hamma `ADR-0116` (`git grep -n "ADR-0116"`: `schema.prisma` izohlari, `liga-xona.ts`, `liga-hisob.ts`, `liga.cron.ts`, `liga.single-source.spec.ts`, `daf-schema.spec.ts`, `branch-route-policy.ts`, shu vazifa fayllari) almashtiriladi; fayl `git mv` bilan.

- [ ] **Step 2: ADR** — `docs/adr/0116-daf-liga-faqat-kotarilish-haftalik-xona.md`:

```markdown
# ADR-0116 — DaF haftalik liga: faqat ko'tarilish, doimiy daraja va haftalik xona, takrorlanuvchi hafta hisobi

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** `docs/superpowers/specs/2026-10-18-musobaqa-s3-liga-design.md`, ADR-0114, ADR-0115, `server/src/daf/liga/`

## Kontekst

S1 haftalik markaz va guruh jadvalini berdi, S2 shaxsiy o'sishni (kunlik maqsad, nishonlar). Bugun haftasiga 30–51 faol o'quvchi, reklamadan keyin 1 000–2 000 kutiladi: bitta markaz jadvalida yangi o'quvchi yuzlab o'rinda turadi va bellashuvni sezmaydi. CEO (2026-10-18): liga darajali va **faqat ko'tarilish** (hech kim tushmaydi); guruhlar bellashuvi — haftalik guruhlar jadvali; ko'tarilish faqat xona yetarlicha to'lgan bo'lsa, xonalar teng bo'linadi. Musobaqa tizimi jazosiz (06.09 dizayni).

## Qaror

1. **Besh daraja, doimiy:** Bronza → Kumush → Oltin → Yoqut → Olmos. `DafStudentLeague` — o'quvchiga bitta qator, faqat o'sadi (`GREATEST`), qator yo'q = Bronza; migratsiyada hech narsa to'ldirilmaydi. Tushish yo'q; mashq qilinmagan hafta darajani saqlaydi.
2. **Xona haftalik:** `DafLeagueRoom` + `DafLeagueEntry`, o'quvchi haftada bitta xonada (`@@unique([weekStart, studentId])`). Sig'im 30. Dushanba: o'tgan hafta ≥ 1 ball topganlar o'z darajasida `ceil(n / 25)` xonaga teng, `hash(studentId, weekStart)` tartibida. Hafta ichida (birinchi seans oxirida): a'zosi eng kam xona, hammasi 30 bo'lsa yangi. Liga filialga cheklanmaydi (06.09 §6.1).
3. **Ko'tarilish:** xonaning birinchi 5 tasi, kamida 50 ball, xonada kamida 15 a'zo; Olmosda yo'q. Saralash ball ↓, teng bo'lsa `studentId` ↑. Ball — `DafStudentDay` haftalik yig'indisi (hamma `groupKey`); a'zolikda hafta davomida ball saqlanmaydi, hisobda `place`/`points`/`promoted` bir marta yoziladi.
4. **Hafta hisobi (`settleWeek`) takrorlanuvchi va o'zini tuzatadi:** xona `UPDATE … WHERE "settledAt" IS NULL RETURNING` bilan olinadi (ikkinchi chaqiruv hech narsa olmaydi); har kompaniya bitta tranzaksiya va kompaniya advisory qulfi — cron kutadi, seans oxiri `pg_try_advisory_xact_lock` bilan; `joinRoom` shu qulfni shared oladi, ya'ni hisob paytida qo'shilgan o'quvchi yangi darajasidan tushadi. Cron dushanba 00:05 Toshkent; cron o'tkazib yuborgan hafta birinchi seans oxirida eng eskisidan boshlab hisoblanadi.
5. **Guruhlar jadvali:** guruhning hozirgi faol a'zolari shu hafta shu guruh uchun (`groupKey`) topgan ball ÷ a'zolar soni; faol guruh, kamida 3 a'zo; baho ↓, teng bo'lsa guruh id ↑. Jonli jadval o'qishda hisoblanadi, hafta natijasi `DafGroupWeek` ga bir marta yoziladi.
6. **Yagona yozuvchi:** to'rt jadvalni faqat `daf/liga/liga-xona.ts` va `liga-hisob.ts` yozadi; `liga.single-source.spec.ts` `src/` va `scripts/` ni tekshiradi (sinov bazasi seedi — nomi bilan, faqat `DafStudentLeague`). `GET liga`, `GET guruhlar` hech narsa yozmaydi.
7. **Nishonlar** `LIGA_KUMUSH/OLTIN/YOQUT/OLMOS`, `XONA_GOLIB`, `GURUH_BIRINCHI` — S2 katalogiga, holatdan, seans oxirida (ADR-0115 qoidasi); liga holati seans oxirining birinchi bosqichida bitta so'rov.

## Ko'rib chiqilgan muqobillar

- **Tushish (Duolingo kabi)** — jazo; CEO rad etdi.
- **Bitta markaz jadvali yoki filial ligalari** — yangi o'quvchi bellashuvni sezmaydi / filialda kam odam. Rad.
- **Xona balini a'zolikda hafta davomida yuritish** — har javobda qo'shimcha yozuv va ikkinchi manba (`DafStudentDay` bilan farqlanishi mumkin). Rad: 30 kishilik xona har o'qishda yig'iladi.
- **Har xonada ko'tarilish (hajmidan qat'i nazar)** — kam faolda 3 kishilik xonadan avtomatik ko'tarilish; liga sun'iy bo'ladi. Rad: ≥ 15.
- **Xonalarni `SELECT … FOR UPDATE` bilan qulflash** — xona hali yo'q bo'lganda qulflanadigan qator yo'q. Advisory qulf tanlandi.
- **Guruh bahosi = yig'indi** — katta guruh har doim yutadi. O'rtacha tanlandi; 1–2 kishilik guruh chiqmaydi.

## Oqibatlar

- **Deploy:** migratsiya `20261018240000_daf_league_and_group_week` → kod. Deploy haftasida oldingi xonalar yo'q — hamma birinchi seansda hafta ichidagi qoida bilan qo'shiladi (teng bo'linish kafolatlanmaydi). Ko'tarilishlar birinchi marta deploydan keyingi dushanba; o'sha kuni loglarda «Liga hisobi: kompaniya …» qatori, `DafLeagueRoom.settledAt` va `DafGroupWeek` satrlari tekshiriladi. Bootstrap skripti yo'q.
- Dushanba boshida hisob ishlayotgan soniyalarda seans tugatgan o'quvchining javobi qulfni kutadi.
- Daraja faqat o'sadi: yuqori ligalar to'lishi mumkin — daraja qo'shish yangi ADR bilan.
- Guruhdan ketgan o'quvchining shu haftadagi bali guruh bahosiga kirmaydi (mavjud guruh jadvali bilan bir xil).
- Yuklama natijalari: spec §11.
```

- [ ] **Step 3: README indeksi** — `docs/adr/README.md` dagi `| [0115](…` qatoridan keyin:

```markdown
| [0116](0116-daf-liga-faqat-kotarilish-haftalik-xona.md) | DaF haftalik liga: 5 doimiy daraja (`DafStudentLeague`, faqat o'sadi), haftalik 30 kishilik xona (`DafLeagueRoom`/`DafLeagueEntry`), ko'tarilish — birinchi 5, ≥ 50 ball, xona ≥ 15; `settleWeek` takrorlanuvchi (`UPDATE … WHERE settledAt IS NULL RETURNING`, kompaniya advisory qulfi, kechikkan hafta seans oxirida); guruhlar jadvali — a'zolar o'rtachasi, `DafGroupWeek`; yagona yozuvchi `daf/liga/` | Qabul qilindi | 2026-10-18 |
```

- [ ] **Step 4: `server/CLAUDE.md`** — sarlavha `### DaF progress (`src/daf/`, ADR-0114, ADR-0115)` ni `### DaF progress (`src/daf/`, ADR-0114, ADR-0115, ADR-0116)` ga, va `- **A badge is given once and never taken back (ADR-0115).**…` bandidan keyin:

```markdown
- **The weekly league only promotes (ADR-0116).** `DafStudentLeague` (one row per student, no row = Bronza, tier 0–4) only rises — the promotion upsert uses `GREATEST`. Rooms are weekly (`DafLeagueRoom` + `DafLeagueEntry`, one room per student per week); the rules (capacity 30, even Monday split of `ceil(n/25)` by `hash(studentId, weekStart)`, first 5 with ≥ 50 points promote only in a room of ≥ 15, none from Olmos) are pure functions in `daf/liga/liga-qoidalari.ts`. Points are never stored during the week: rooms read `DafStudentDay` (all group keys). Only `daf/liga/liga-xona.ts` (`joinRoom`) and `liga-hisob.ts` (`settleWeek`) write the four tables; `liga.single-source.spec.ts` fails on any other write. `GET liga` / `GET guruhlar` write nothing.
- **`settleWeek` is idempotent and self-healing (ADR-0116).** It claims rooms with `UPDATE … WHERE "settledAt" IS NULL RETURNING`, one transaction per company, under the company advisory lock `LIGA_HISOB_KALIT`: the Monday 00:05 cron (`LigaCron`) waits for it, a session end tries it (`pg_try_advisory_xact_lock`) and `joinRoom` holds it shared — so nobody joins a room while a week is settled. A week the cron missed is settled at the next session end (`liganiYangilaXavfsiz` → `settleDue`, oldest week first), inside the safe wrapper: a failure never nulls `natija`.
- **The group table is the average of current members (ADR-0116).** `guruhlar-jadvali.ts`: ACTIVE members of ACTIVE live groups, points with `groupKey` = the group (as the group ranking), ≥ 3 members, average DESC then group id ASC, TOP 10 + own group; not limited to a branch (06.09 §6.1). The week's result is written once to `DafGroupWeek` by `settleWeek`.
```

- [ ] **Step 5: Yangilik** — `client/src/qollanma/yangiliklar.ts` dagi `export const yangiliklar: Yangilik[] = [` qatoridan keyin (ro'yxat boshiga):

```ts
  {
    sana: "2026-10-18",
    sarlavha: "O'quvchi ilovasida haftalik liga va guruhlar jadvali",
    matn: "«Reyting» endi to'rt tab: Liga, Guruhim, Guruhlar, Darajam. Har o'quvchi o'z ligasida (Bronza, Kumush, Oltin, Yoqut, Olmos) 30 kishigacha xonada bellashadi; xonaga haftaning birinchi mashqidan keyin qo'shiladi. Dushanba kuni xonaning birinchi 5 tasi (kamida 50 ball, xonada kamida 15 kishi bo'lsa) keyingi ligaga ko'tariladi; liga hech qachon pasaymaydi. «Guruhlar» tabida markazning haftalik guruhlar jadvali — guruh a'zolarining o'rtacha bali (kamida 3 kishilik faol guruhlar). Eski «Markaz» ro'yxati Liga ichidagi «Butun markaz» tugmasida. Liga va g'oliblik uchun nishonlar ham bor.",
    rollar: [1, 2, 3, 4],
  },
```

- [ ] **Step 6: To'liq tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/server && npm run typecheck && npm run build && npm test
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3/client && npx tsc --noEmit -p . && npx vitest run && npx eslint src --quiet && npx next build
```

Expected: hammasi yashil. `build` va `test` parallel emas (xotira `build∥test`). Yiqilsa — sababini tuzatib, faqat yiqilgan buyruqni qayta yurgizish.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s3 && git add docs/adr/0116-daf-liga-faqat-kotarilish-haftalik-xona.md docs/adr/README.md server/CLAUDE.md client/src/qollanma/yangiliklar.ts && git commit -m "docs(adr): ADR-0116 weekly league only promotes, permanent tier and weekly room

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Brauzer tekshiruvi (spec §7 «Brauzer») va tozalash

**Files:** kod o'zgarmaydi (topilgan xato — o'z TDD tuzatish kommiti bilan).

- [ ] **Step 1: Backend va ilovani ko'tarish** — xotira `reference_throwaway_local_db` retsepti bo'yicha, `$S1_DB` bilan (Task 10 dan keyingi holat): alohida Redis, `CRONS_ENABLED=false` (hafta hisobini cron emas, seans oxiri qilsin), bo'sh `TELEGRAM_BOT_TOKEN=` va `TELEGRAM_ADMIN_BOT_TOKEN=`, band bo'lmagan `PORT`, client `127.0.0.1:<port>` da. O'quvchi bilan kirish: seed paroli `123456` (`prisma/seed.ts`), telefon bazadan.

- [ ] **Step 2: Haftani qo'lda oldinga surish** (faqat sinov bazasida, qo'lda — kod emas; qorovul testlar faqat repo fayllarini tekshiradi). Bitta 15+ kishilik Bronza xonasini «o'tgan hafta»ga ko'chirib, unda bir o'quvchini birinchi qilamiz; uning keyingi seansi kechikkan haftani o'zi hisoblaydi (spec §1.4 o'z-o'zini tuzatish):

```bash
export Q="docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -tA"
export MON=$($Q -c "SELECT (date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '5 hours'))::date")
export ROOM=$($Q -c "SELECT r.id FROM \"DafLeagueRoom\" r JOIN \"DafLeagueEntry\" e ON e.\"roomId\" = r.id WHERE r.\"weekStart\" = '$MON' AND r.tier = 0 GROUP BY r.id HAVING COUNT(*) >= 15 ORDER BY r.id LIMIT 1")
export SID=$($Q -c "SELECT \"studentId\" FROM \"DafLeagueEntry\" WHERE \"roomId\" = $ROOM ORDER BY \"studentId\" LIMIT 1")
$Q -c "SELECT id, phone FROM \"Student\" WHERE id = $SID"
docker exec daf-postgres psql -U daf_user -d daf_s1_yuklama -v ON_ERROR_STOP=1 <<SQL
BEGIN;
CREATE TEMP TABLE azo AS SELECT "studentId" FROM "DafLeagueEntry" WHERE "roomId" = $ROOM;
DELETE FROM "DafStudentDay" WHERE "studentId" IN (SELECT "studentId" FROM azo) AND day >= '$MON'::date - 7 AND day < '$MON'::date;
UPDATE "DafStudentDay" SET day = day - 7 WHERE "studentId" IN (SELECT "studentId" FROM azo) AND day >= '$MON'::date;
DELETE FROM "DafLeagueEntry" WHERE "weekStart" = '$MON'::date - 7 AND "studentId" IN (SELECT "studentId" FROM azo);
UPDATE "DafLeagueRoom" SET "weekStart" = "weekStart" - 7, number = number + 1000, "settledAt" = NULL WHERE id = $ROOM;
UPDATE "DafLeagueEntry" SET "weekStart" = "weekStart" - 7 WHERE "roomId" = $ROOM;
UPDATE "DafStudentDay" SET points = points + 5000 WHERE id = (SELECT id FROM "DafStudentDay" WHERE "studentId" = $SID AND day >= '$MON'::date - 7 ORDER BY day LIMIT 1);
DELETE FROM "DafStudentBadge" WHERE "studentId" = $SID AND (key LIKE 'LIGA_%' OR key = 'XONA_GOLIB');
COMMIT;
SQL
```

Expected: xatosiz. Endi `$SID` ning shu haftada xonasi yo'q, o'tgan haftada hisoblanmagan, 15+ kishilik Bronza xonasida eng ko'p ball bilan turadi.

- [ ] **Step 3: Ro'yxat** (built-in brauzer, 390×844 va desktop; yorug' va qorong'i):
  1. `$SID` bilan kirish → «Reyting»: to'rt tab «Liga · Guruhim · Guruhlar · Darajam», Liga tanlangan; «Bronza ligasi», «Liga: birinchi seansdan keyin» — skrinshot (390, yorug'/qorong'i). Yuklanishda sahifa sakramaydi (skelet).
  2. Bitta dars seansi → natija ekrani: «Yangi nishon: Kumush ligasi» va «Yangi nishon: Xona g'olibi» — skrinshot. Yo'l tepasidagi to'rt belgi o'zgarmagan («o'rin» — markaz o'rni).
  3. «Reyting → Liga»: «O'tgan hafta: Siz 1-o'rin · Kumush ligasiga ko'tarildingiz», «Kumush ligasi», kichik xona («Xona hali kichik — ko'tarilish ≥ 15 kishi bo'lganda» — xonaga faqat shu xonadan ko'tarilgan 5 kishi tushgan), o'z qatori ajratilgan — skrinshot (390 va desktop, yorug'/qorong'i).
  4. Ko'tarilish zonasi: o'tgan haftasi hisoblangan, ≥ 15 kishilik xonadagi boshqa o'quvchi bilan kirish (`$Q -c "SELECT e.\"studentId\" FROM \"DafLeagueEntry\" e WHERE e.\"weekStart\" = '$MON' GROUP BY e.\"roomId\", e.\"studentId\" HAVING (SELECT COUNT(*) FROM \"DafLeagueEntry\" x WHERE x.\"roomId\" = e.\"roomId\") >= 15 LIMIT 1"`) — birinchi 5 qator yashil tusda strelka bilan, qorong'ida ham o'qiladi — skrinshot.
  5. «Butun markaz»: bosilganda ro'yxat ochiladi (tarmoq oynasida `reyting?scope=zentrum` faqat shundan keyin), fokus tugmada qoladi.
  6. «Guruhlar»: TOP 10, o'z guruhi 10 dan pastda bo'lsa «···» dan keyin haqiqiy o'rni bilan — skrinshot. Guruhsiz o'quvchi bilan (`$Q -c "SELECT s.id FROM \"Student\" s WHERE s.\"deletedAt\" IS NULL AND NOT EXISTS (SELECT 1 FROM \"Enrollment\" e WHERE e.\"studentId\" = s.id AND e.status = 'ACTIVE') LIMIT 1"`) — «Guruhingiz jadvalga hali kirmaydi (kamida 3 kishi kerak)».
  7. «Darajam» → «Nishonlarim»: «Kumush ligasi», «Xona g'olibi» to'la binafsha (oq matn, qorong'ida o'qiladi), qolganlari chiziqli ramkada («Oltin ligasiga ko'tarilganda» va h.k.).
  8. Tarmoq oynasi: `liga` va `guruhlar` so'rovlari faqat o'z tabi ochilganda; `GET` lardan keyin `DafLeagueEntry` soni o'zgarmagan (`$Q -c 'SELECT COUNT(*) FROM "DafLeagueEntry"'` oldin/keyin).
  9. Ekranda inglizcha so'z yo'qligini ko'z bilan tekshirish (to'rt tab, natija, nishonlar).

- [ ] **Step 4: Natijani CEO'ga yuborish** — skrinshotlarni bir qatorli izoh bilan. Topilgan xato → alohida tuzatish (yiqiladigan test → tuzatish → test), shu bosqichda.

- [ ] **Step 5: Tozalash** — `docker exec daf-postgres dropdb -U daf_user daf_s1_yuklama`, Redis konteynerini o'chirish (`docker rm -f <nom>`), backend/client jarayonlarini to'xtatish.

- [ ] **Step 6: Commit** — faqat shu vazifada tuzatish bo'lsa: tuzatilgan fayllar `git add <fayllar>` va `git commit -m "fix(lernen): <nima tuzatildi>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"` (server fayllariga avval prettier). Tuzatish bo'lmasa — `git status --short` bo'sh.

---

## Spec qamrovi (o'z-o'zini tekshirish)

| Spec bo'limi | Vazifa |
| --- | --- |
| §1.1 darajalar, sig'im 30, birinchi 5 / ≥ 50 / ≥ 15, tushish yo'q, Olmos, saralash, hafta, ball manbai | 2 (qoidalar), 3 (`ligaJavobi` ball yig'ishi), 5 (`GREATEST`) |
| §1.1 filialga cheklanmaydi | 3 (xona tanlash kompaniya bo'yicha), 7 (SELF sababi) |
| §1.2 `DafStudentLeague`, `DafLeagueRoom`, `DafLeagueEntry`, unique'lar; ball a'zolikda saqlanmaydi | 1, 3, 5 |
| §1.3 dushanba: `ceil(n/25)` teng, hash tartibi, faqat ≥ 1 ball | 2 (`tengBol`), 5 (`keyingiHaftaXonalari`) |
| §1.3 hafta ichida: eng kam a'zoli xona, 30 da yangi, qator yo'q = Bronza, 40 → 20 + 20 | 2, 3 (`joinRoom`), 10 (parallel) |
| §1.4 `settleWeek` 1–6, takrorlanuvchi, kompaniya tranzaksiyasi, cron 00:05, seans oxirida chaqirish, `CRONS_ENABLED` | 5, 6 (`liga-seans`) |
| §1.5 seans oxirida `joinRoom` → nishon, xavfsiz o'ram, `GET` yozmaydi | 6, 3, 4 (testlar) |
| §2.1 baho = ball ÷ hozirgi faol a'zolar, ACTIVE guruh, ≥ 3, saralash, 1 o'nlik | 2, 4 |
| §2.2 TOP 10 + o'z guruhi, guruhsiz/kichik — izoh | 4, 9 |
| §2.3 `DafGroupWeek`, hafta oxirida bir marta | 1, 5 |
| §3 nishonlar (LIGA_*, XONA_GOLIB, GURUH_BIRINCHI), holatdan, takror yo'q, bitta yengil so'rov birinchi `Promise.all` da | 6 (katalog, `ligaSharoiti`, `nishonlarniBerXavfsiz`), 3 |
| §4 `GET liga`, `GET guruhlar`, `@StudentOnly` + `StudentCardGuard`, manifest SELF, snapshot, `ReytingZeile`, bir xil ism ko'rinishi, `kotarilishZonasi.faol` | 3 (`reytingIsmi`), 4, 7 |
| §4 yangi mantiq `daf/liga/`, yagona yozuvchi qorovuli | 3, 4, 5 |
| §5 to'rt tab, Liga holatlari, «O'tgan hafta», «Butun markaz», Guruhlar, Darajam o'zgarmaydi, belgilar va `natija` o'zgarmaydi, matnlar | 8, 9 |
| §6 qator yo'q = Bronza, birinchi hafta, bootstrap yo'q | 1, 3, 11 (ADR oqibatlari) |
| §7 birlik testlari (chegara 14/15, 5/6-o'rin tenglik, Olmos, 40/25/26/61, hash, nol ballilar, 2 kishilik guruh, nishon chegaralari) | 2, 6 |
| §7 server testlari (takrorlanuvchi, kompaniya xatosi, tushmaydi, parallel `joinRoom`, `GET` yozmaydi, e2e, manifest, snapshot) | 3, 5, 7, 10 (haqiqiy Postgres) |
| §7 haqiqiy baza: `settleWeek` 5 000 da, vaqt, Σ place, ≤ 5 × xonalar | 10 (`daf-yuklama-s3-hisob.ts`) |
| §7 yuklama p95 (`liga`, `guruhlar` < 200, `seansNatijasi` < 300) | 10 |
| §7 mijoz testlari | 8, 9 |
| §7 brauzer (390/desktop, yorug'/qorong'i, haftani surish, ko'tarilish, nishon) | 12 |
| §8 ADR-0116, `server/CLAUDE.md`, yangilik, deploy tartibi | 11 |
| §9 qilinmaydiganlar | rejada yo'q (tushish, juft bellashuv, filial ligalari, Telegram, liga o'rni `natija` da, o'qituvchi ko'rinishi) |
| §10 xavflar | 2, 5, 3, 6, 10, 9 (mos ravishda) |

**Placeholder tekshiruvi:** «TBD/TODO» yo'q. Task 10 Step 11 dagi `<sana>`, `<ms>`, `…` — o'lchov chiqaradigan raqamlar uchun shablon (S1 §10, S2 §8 bilan bir xil), qadamning o'zi ularni to'ldirishni talab qiladi. Task 12 Step 6 dagi `<nima tuzatildi>` — faqat tuzatish bo'lsa yoziladigan kommit matni.

**Nom va tip mosligi:** `LigaSharoiti { tier, azo, kechikkan, xonaGolib, guruhBirinchi }` — Task 3 (SQL ustunlari), soxta baza, Task 6 (`liga-seans`, `nishonlar.ts`, `seans-natija.spec.ts`) da bir xil; `LigaNishonSharoiti = { liga, xonaGolib, guruhBirinchi }` Task 6 ↔ `nishonlarniBerXavfsiz(…, ligaP)`; `joinRoom(prisma, studentId, companyId, jetzt)` Task 3 ↔ 6 ↔ 10; `settleWeek(prisma, companyId, haftaBoshi, { kutish })` va `settleDue(prisma, companyId, jetzt, { kutish })` Task 5 ↔ 6 ↔ 10; `guruhlarYigindisi(db, companyId, haftaBoshi)` Task 4 ↔ 5 ↔ 10; `ligaJavobi(db, studentId, jetzt)` ↔ `FortschrittService.liga(studentId)` ↔ `getLiga(studentId)`; `guruhlarJavobi(db, studentId, companyId, jetzt)` ↔ `guruhlar(studentId, companyId)` ↔ `getGuruhlar(studentId, companyId)`; `nishonlarRoyxati(prisma, studentId, companyId, jetzt)` ↔ `nishonlar(studentId, companyId)` ↔ `getNishonlar(studentId, companyId)` ↔ olchov `svc.nishonlar(s.id, s.companyId)`; server `LigaJavobi`/`GuruhlarJavobi`/`GuruhQatori` ↔ client `Liga`/`Guruhlar`/`GuruhQatori` — bir xil maydonlar; kesh kalitlari `["lernen","liga"]`, `["lernen","guruhlar"]` Task 8 ↔ 9 testlari; SQL belgilari (`liga-sharoiti`, `liga-xona-och`, `liga-azo-qosh`, `liga-xonalarni-ol`, `liga-kotar`, `guruhlar-yigindisi`, `guruh-haftasi-yoz` va boshqalar) kod ↔ `liga-baza.fake-spec.ts` ↔ testlar; relatsiya nomlari `dafLeague`, `dafLeagueEntries`, `leagueEntries`, `dafWeeks` Task 1 ↔ qorovul (Task 5).

