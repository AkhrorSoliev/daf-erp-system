# Jang 1-bosqich (ruh raqib + Dafi bot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi portalida 6 savollik qisqa jang: raqib — boshqa o'quvchining avvalgi jang javoblari («ruh») yoki ochiq «Dafi bot».

**Architecture:** Yangi server moduli `server/src/daf/jang/` — sof funksiyalar (qoidalar, savol/ruh tanlash, bot, javob tekshirish) alohida fayllarda, `JangService` ularni Prisma bilan bog'laydi, `JangController` `student-portal/lernen/jang/*` ostida. Savollar `content/daf/jang/*.json` fayllaridan seed bilan `DafBattleQuestion` ga tushadi; fayldagi `tasdiqlangan` belgisi `APPROVED` holatini boshqaradi. Mijoz: `client/src/components/student-portal/lernen/jang/` (kirish kartasi, jang ekrani, sof reducer).

**Tech Stack:** NestJS + Prisma (Postgres) + Jest (server); Next.js + TanStack Query + Vitest (client).

**Spec:** `docs/superpowers/specs/2026-10-27-jang-asinxron-ruh-design.md` — har vazifadan oldin tegishli bo'limni o'qing.

## Global Constraints

- 6 savol, har savolga 10 soniya (`SAVOL_MS = 10_000`), tarmoq uchun +2 soniya kechirim (`KECHIKISH_MS = 2_000`).
- Ko'p to'g'ri javob yutadi; teng bo'lsa umumiy vaqti kam yutadi; yana teng — durang.
- Jang **liga ballini bermaydi** (`DafStudentDay`, `DafAttempt`, liga jadvallariga tegilmaydi).
- Kuniga 5 jang (Toshkent kuni, `server/src/common/date/tashkent.ts`).
- 60 soniya javobsiz `OPEN` jang → `ABANDONED`: mag'lubiyat emas, ruh bo'lmaydi.
- Har 3-jang (3, 6, 9… — `DONE` + `ABANDONED` sanaladi) yangi to'plam + Dafi bot.
- Ruh shartlari: o'zi emas; shu kompaniya (`companyId`), istalgan filial; o'chirilmagan o'quvchi; barcha savollari o'quvchi o'tgan unitlardan va oxirgi 3 kunda ko'rilmagan; ega kuchi ±0.15 ichida; 7 kun ichida shu ega bilan uchrashilmagan.
- Kuch = oxirgi 10 `DONE` jangdagi to'g'ri javob ulushi; 3 tadan kam jang → `0.6`.
- Dafi bot: to'g'ri ehtimoli `clamp(kuch, 0.6, 0.75)`, javob vaqti 3000–9000 ms.
- Yozish tekshiruvi mavjud `istRichtig` (`server/src/daf/uebung/antwort.ts`) — `ä/ae`, `ß/ss` allaqachon kechiriladi. Yangi normalizer YOZILMAYDI.
- Eshitish: faqat ≤ 3000 ms audio; umumiy bo'lim faylini oraliqsiz o'ynatish TAQIQ.
- Raqib ismi: `firstName` + familiya bosh harfi («Sevinch T.»). Bot: «Dafi bot».
- Raqib kartasida: rasm, ism, g'alaba soni. Daraja kartada YO'Q — u ochiq profilda (`/portal/lernen/reyting/:id`) ko'rinadi; `uebersicht` ni har jang boshida chaqirish qimmat (spec §2.6 dan ongli chekinish, foydalanuvchiga aytilgan).
- `DAF_JANG` env: `on` — hammaga; vergul bilan studentId ro'yxati — faqat ularga (CEO sinovi); bo'sh/`off`/boshqa — o'chiq.
- Ekranda inglizcha so'z yo'q; faqat lotin o'zbek. Har yangi `t("…")` matni `client/src/i18n/dictionaries/{en,de,ru}.ts` ga qo'shiladi (`i18n-coverage.test.ts` tekshiradi).
- `client/` da `prettier` ISHLATILMAYDI. Server: har tegilgan `.ts` ga `npx prettier --write`.
- Kod izohlari loyiha uslubida (o'zbekcha, «nega» ni tushuntiradi). Commit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Barcha buyruqlar worktree ildizidan: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/jang-asinxron-ruh`.

## Fayl tuzilmasi

**Server — yangi:**
- `server/src/daf/jang/jang-qoidalari.ts` — konstantalar, natija, kuch, seriya, ism, flag, o'tgan unitlar.
- `server/src/daf/jang/savol-tanlash.ts` — 6 savol tanlash + `aralashtir`.
- `server/src/daf/jang/ruh-tanlash.ts` — mos ruh jangini tanlash.
- `server/src/daf/jang/dafi-bot.ts` — bot javoblari.
- `server/src/daf/jang/jang-javob.ts` — javob to'g'rimi.
- `server/src/daf/jang/jang.types.ts` — API javob turlari.
- `server/src/daf/jang/jang.service.ts` — `holat`, `boshla`, `javob`, `yakun`.
- `server/src/daf/jang/jang.controller.ts`, `server/src/daf/dto/jang.dto.ts`.
- `server/src/daf/jang/jang-savollari.validate.ts` — kontent fayli tekshiruvi.
- `server/scripts/daf-jang-audio-uzunligi.ts`, `server/scripts/daf-jang-seed.ts`.
- `server/content/daf/jang/eshitish-uzunligi.json`, `server/content/daf/jang/a1-u0{1..6}.json`.
- `docs/adr/NNNN-jang-asinxron-ruh.md`.

**Server — o'zgaradi:** `prisma/schema.prisma`, yangi migratsiya, `src/daf/daf.module.ts`, `src/common/auth/branch-route-policy.ts`, `src/daf/nishon/nishon-katalogi.ts`, `src/daf/nishon/nishonlar.ts`, `src/daf/eslatma/eslatma-matn.ts`, `package.json` (2 skript).

**Client — yangi:** `client/src/components/student-portal/lernen/jang/{jang-holati.ts,jang-holati.test.ts,jang-karta.tsx,jang-ekrani.tsx,savol-korinishi.tsx}`, `client/src/app/(student-portal)/portal/lernen/jang/page.tsx`.

**Client — o'zgaradi:** `lernen/types.ts`, `lernen/queries.ts`, `lernen/nishon.ts`, `lernen/lernen-levels-page.tsx`, `i18n/dictionaries/{en,de,ru}.ts`.

---

### Task 0: Worktree tayyorlash + audio uzunligini o'lchash

**Files:**
- Create: `server/scripts/daf-jang-audio-uzunligi.ts`
- Create: `server/content/daf/jang/eshitish-uzunligi.json`

**Interfaces:**
- Produces: `eshitish-uzunligi.json` — `{ [lexemeSourceId: string]: number /* ms */ }`, faqat ≤ 3000 ms bo'lgan so'zlar. Task 9 validatori shu faylni o'qiydi.

- [ ] **Step 1: Bog'liqliklar**

```bash
cd server && npm install && ln -sf /Users/a1111/Desktop/daf-erp-system/server/.env .env && npx prisma generate
cd ../client && npm install
command -v ffprobe || echo "ffprobe YO'Q — brew install ffmpeg"
```
Expected: `prisma generate` muvaffaqiyatli; `ffprobe` yo'li chiqadi.

- [ ] **Step 2: O'lchash skriptini yozing**

`server/scripts/daf-jang-audio-uzunligi.ts`:

```ts
/**
 * Jang eshitish savollari uchun so'z ovozlarining uzunligi (spec §4).
 *
 * Nega DB'dan: `audioStartMs`/`audioEndMs` to'ldirilgan so'z umumiy bo'lim
 * faylining bir bo'lagi — uzunligi oraliqdan olinadi, faylni o'lchash
 * BUTUN bo'limni o'lchaydi. Oraliqsiz so'z — o'z fayli, `ffprobe` o'lchaydi.
 *
 * Ishga tushirish: `railway run npx ts-node --transpile-only scripts/daf-jang-audio-uzunligi.ts`
 * (prod R2 manzili kerak). Natija repoga commit qilinadi.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { run } from './lib/check-cli';

const CHEGARA_MS = 3000;

function faylUzunligi(url: string): number | null {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url],
      { encoding: 'utf8', timeout: 15_000 },
    );
    const s = Number(out.trim());
    return Number.isFinite(s) ? Math.round(s * 1000) : null;
  } catch {
    return null;
  }
}

void run(async (prisma) => {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base) throw new Error('R2_PUBLIC_URL yo\'q');
  const sozlar = await prisma.dafLexeme.findMany({
    where: { audioKey: { not: null }, unit: { level: 'A1', retiredAt: null } },
    select: { sourceId: true, audioKey: true, audioStartMs: true, audioEndMs: true },
    orderBy: { sourceId: 'asc' },
  });
  const natija: Record<string, number> = {};
  let uzun = 0;
  for (const s of sozlar) {
    const ms =
      s.audioStartMs != null && s.audioEndMs != null
        ? s.audioEndMs - s.audioStartMs
        : faylUzunligi(`${base}/${s.audioKey}`);
    if (ms != null && ms > 0 && ms <= CHEGARA_MS) natija[s.sourceId] = ms;
    else uzun += 1;
  }
  const dir = join(__dirname, '..', 'content', 'daf', 'jang');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'eshitish-uzunligi.json'), JSON.stringify(natija, null, 2) + '\n');
  console.log(`Jami ${sozlar.length}; ≤${CHEGARA_MS} ms: ${Object.keys(natija).length}; tashlandi: ${uzun}`);
});
```

- [ ] **Step 3: Ishga tushiring (prod faqat O'QILADI)**

```bash
cd server && railway run npx ts-node --transpile-only scripts/daf-jang-audio-uzunligi.ts
```
Expected: `Jami N; ≤3000 ms: M; tashlandi: K` va `content/daf/jang/eshitish-uzunligi.json` yaratildi. `M` ni hisobotga yozing. `M < 30` bo'lsa — to'xtang va xabar bering (eshitish savollari uchun so'z yetmaydi).

- [ ] **Step 4: Commit**

```bash
cd server && npx prettier --write scripts/daf-jang-audio-uzunligi.ts
git add scripts/daf-jang-audio-uzunligi.ts content/daf/jang/eshitish-uzunligi.json
git commit -m "chore(daf-jang): measure word audio lengths for listening questions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Prisma sxema + migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Student`, `model DafUnit`, fayl oxiriga yangi modellar)
- Create: `server/prisma/migrations/20261027150000_daf_jang/migration.sql`

**Interfaces:**
- Produces: Prisma modellari `dafBattleQuestion`, `dafBattle`, `dafBattleAnswer`; enumlar `DafBattleQuestionKind {CHOOSE TYPE LISTEN}`, `DafBattleQuestionStatus {DRAFT APPROVED}`, `DafBattleOpponent {GHOST BOT}`, `DafBattleStatus {OPEN DONE ABANDONED}`, `DafBattleResult {WIN LOSS DRAW}`; compound unique `battleId_position`.

- [ ] **Step 1: Sxemaga qo'shing**

`model Student` ichiga (boshqa `daf*` relatsiyalari yoniga): `dafBattles DafBattle[]`
`model DafUnit` ichiga (`phrasen` dan keyin): `battleQuestions DafBattleQuestion[]`

Fayl oxiriga:

```prisma
/// Jang (spec 2026-10-27): savol turi. Hammasi ≤10 soniyada javob beriladigan.
enum DafBattleQuestionKind {
  CHOOSE
  TYPE
  LISTEN
}

/// Faqat `APPROVED` jangga tushadi; holatni `content/daf/jang/*.json` dagi `tasdiqlangan` boshqaradi.
enum DafBattleQuestionStatus {
  DRAFT
  APPROVED
}

enum DafBattleOpponent {
  GHOST
  BOT
}

enum DafBattleStatus {
  OPEN
  DONE
  ABANDONED
}

enum DafBattleResult {
  WIN
  LOSS
  DRAW
}

/// Jang savoli — mashq bazasidan ALOHIDA, unitga bog'liq (spec §4).
model DafBattleQuestion {
  id           Int                     @id @default(autoincrement())
  sourceId     String                  @unique
  unitId       Int
  kind         DafBattleQuestionKind
  prompt       String
  options      String[]                @default([])
  answer       String
  akzeptiert   String[]                @default([])
  /// LISTEN uchun: `DafLexeme` dan seed paytida nusxalanadi (oraliq bilan).
  audioKey     String?
  audioStartMs Int?
  audioEndMs   Int?
  status       DafBattleQuestionStatus @default(DRAFT)
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt

  unit    DafUnit           @relation(fields: [unitId], references: [id])
  answers DafBattleAnswer[]

  @@index([unitId, status])
}

/// Bitta o'ynalgan jang. `DONE` jang javoblari keyingi o'quvchilar uchun «ruh» (spec §5–6).
model DafBattle {
  id              Int                @id @default(autoincrement())
  studentId       Int
  companyId       Int
  opponent        DafBattleOpponent
  /// Ruh jangi bo'lsa — manba jang; savollar o'sha jangdan aynan nusxalanadi.
  ghostBattleId   Int?
  questionIds     Int[]
  /// Bot jangi: `[{ togri, ms }]` — boshida hisoblanadi, jang davomida o'zgarmaydi.
  botAnswers      Json?
  status          DafBattleStatus    @default(OPEN)
  result          DafBattleResult?
  correctCount    Int                @default(0)
  totalMs         Int                @default(0)
  opponentCorrect Int                @default(0)
  opponentMs      Int                @default(0)
  /// Keyingi savol vaqti shu paytdan o'lchanadi; boshida kirish ekrani uchun kelajakka suriladi.
  lastActivityAt  DateTime           @default(now())
  createdAt       DateTime           @default(now())
  finishedAt      DateTime?

  student     Student           @relation(fields: [studentId], references: [id])
  ghostBattle DafBattle?        @relation("DafBattleGhost", fields: [ghostBattleId], references: [id])
  ghostOf     DafBattle[]       @relation("DafBattleGhost")
  answers     DafBattleAnswer[]

  @@index([studentId, createdAt])
  @@index([companyId, status, finishedAt])
  @@index([studentId, status, finishedAt])
}

model DafBattleAnswer {
  id         Int      @id @default(autoincrement())
  battleId   Int
  questionId Int
  position   Int
  given      String
  correct    Boolean
  ms         Int
  createdAt  DateTime @default(now())

  battle   DafBattle         @relation(fields: [battleId], references: [id])
  question DafBattleQuestion @relation(fields: [questionId], references: [id])

  @@unique([battleId, position])
  @@index([questionId])
}
```

- [ ] **Step 2: Migratsiyani yarating (dev DB'da)**

```bash
cd server && mkdir -p prisma/migrations/20261027150000_daf_jang
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script > prisma/migrations/20261027150000_daf_jang/migration.sql
cat prisma/migrations/20261027150000_daf_jang/migration.sql
```
Expected: faqat 5 ta `CREATE TYPE`, 3 ta `CREATE TABLE`, indekslar va FK lar. Boshqa jadvalga tegadigan `ALTER`/`DROP` bo'lsa — to'xtang (dev DB main'dan orqada), migratsiyani qo'lda faqat jang qismiga qisqartiring.

- [ ] **Step 3: Dev DB'ga qo'llang**

```bash
cd server && npx prisma db execute --file prisma/migrations/20261027150000_daf_jang/migration.sql
npx prisma migrate resolve --applied 20261027150000_daf_jang
npx prisma generate && npm run build
```
Expected: build PASS.

- [ ] **Step 4: Commit**

```bash
cd server && git add prisma/schema.prisma prisma/migrations/20261027150000_daf_jang
git commit -m "feat(daf-jang): battle question, battle and answer tables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Jang qoidalari (sof funksiyalar)

**Files:**
- Create: `server/src/daf/jang/jang-qoidalari.ts`
- Test: `server/src/daf/jang/jang-qoidalari.spec.ts`

**Interfaces:**
- Produces (hammasi `jang-qoidalari.ts` dan eksport):
  - konstantalar `SAVOL_SONI=6`, `SAVOL_MS=10_000`, `KECHIKISH_MS=2_000`, `KIRISH_MS=3_000`, `KUNLIK_CHEGARA=5`, `TASHLANGAN_MS=60_000`, `YANGI_TOPLAM_HAR=3`, `KUCH_STANDART=0.6`, `KUCH_ORALIQ=0.15`, `KUCH_MIN_JANG=3`, `KUCH_OYNA=10`, `UCHRASHMASLIK_KUN=7`, `KORILGAN_KUN=3`, `TARIX_KUN=30`, `RUH_NOMZOD_LIMIT=300`, `DAFI_BOT_ISMI='Dafi bot'`
  - `type Natija = 'WIN' | 'LOSS' | 'DRAW'`
  - `jangNatijasi(men: {togri:number; ms:number}, raqib: {togri:number; ms:number}): Natija`
  - `yangiToplamNavbati(oldingiJanglar: number): boolean`
  - `kuch(togriSonlari: number[] /* eng yangisi birinchi */): number`
  - `seriya(natijalar: Natija[] /* eng yangisi birinchi */): number`
  - `raqibIsmi(s: {firstName:string; lastName:string}): string`
  - `jangYoqilganmi(qiymat: string | undefined, studentId: number): boolean`
  - `otilganUnitlar(darslar: {unitId:number; tugagan:boolean}[]): number[]`
  - `kunOldin(hozir: Date, kun: number): Date`

- [ ] **Step 1: Failing test**

`server/src/daf/jang/jang-qoidalari.spec.ts`:

```ts
import {
  jangNatijasi,
  jangYoqilganmi,
  kuch,
  otilganUnitlar,
  raqibIsmi,
  seriya,
  yangiToplamNavbati,
} from './jang-qoidalari';

describe('jangNatijasi', () => {
  it("ko'p to'g'ri javob yutadi, vaqtdan qat'i nazar", () => {
    expect(jangNatijasi({ togri: 4, ms: 50_000 }, { togri: 3, ms: 10_000 })).toBe('WIN');
    expect(jangNatijasi({ togri: 2, ms: 1_000 }, { togri: 3, ms: 50_000 })).toBe('LOSS');
  });
  it('teng bo\'lsa tezroq yutadi', () => {
    expect(jangNatijasi({ togri: 3, ms: 20_000 }, { togri: 3, ms: 21_000 })).toBe('WIN');
    expect(jangNatijasi({ togri: 3, ms: 22_000 }, { togri: 3, ms: 21_000 })).toBe('LOSS');
  });
  it('hammasi teng — durang', () => {
    expect(jangNatijasi({ togri: 3, ms: 20_000 }, { togri: 3, ms: 20_000 })).toBe('DRAW');
  });
});

describe('yangiToplamNavbati', () => {
  it('har 3-jang yangi to\'plam', () => {
    expect([0, 1, 2, 3, 4, 5].map(yangiToplamNavbati)).toEqual([false, false, true, false, false, true]);
  });
});

describe('kuch', () => {
  it('3 tadan kam jang — 0.6', () => {
    expect(kuch([])).toBe(0.6);
    expect(kuch([6, 6])).toBe(0.6);
  });
  it('oxirgi 10 jang ulushi', () => {
    expect(kuch([3, 3, 3])).toBe(0.5);
    // 11-jang hisobga kirmaydi.
    expect(kuch([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0])).toBe(1);
  });
});

describe('seriya', () => {
  it('boshidagi ketma-ket g\'alabalar', () => {
    expect(seriya(['WIN', 'WIN', 'LOSS', 'WIN'])).toBe(2);
    expect(seriya(['DRAW', 'WIN'])).toBe(0);
    expect(seriya([])).toBe(0);
  });
});

describe('raqibIsmi', () => {
  it('ism + familiya bosh harfi', () => {
    expect(raqibIsmi({ firstName: 'Sevinch', lastName: 'tanieva' })).toBe('Sevinch T.');
  });
  it("familiya bo'sh — faqat ism", () => {
    expect(raqibIsmi({ firstName: 'Sevinch', lastName: '  ' })).toBe('Sevinch');
  });
});

describe('jangYoqilganmi', () => {
  it('on — hammaga', () => expect(jangYoqilganmi('on', 7)).toBe(true));
  it("bo'sh/off/noma'lum — o'chiq", () => {
    expect(jangYoqilganmi(undefined, 7)).toBe(false);
    expect(jangYoqilganmi('off', 7)).toBe(false);
    expect(jangYoqilganmi('yes', 7)).toBe(false);
  });
  it("ro'yxat — faqat ulardagi o'quvchiga", () => {
    expect(jangYoqilganmi('7, 12', 12)).toBe(true);
    expect(jangYoqilganmi('7,12', 8)).toBe(false);
  });
});

describe('otilganUnitlar', () => {
  it('barcha darsi tugagan unit', () => {
    expect(
      otilganUnitlar([
        { unitId: 1, tugagan: true },
        { unitId: 1, tugagan: true },
        { unitId: 2, tugagan: true },
        { unitId: 2, tugagan: false },
      ]),
    ).toEqual([1]);
  });
});
```

- [ ] **Step 2: Fail ekanini ko'ring**

Run: `cd server && npx jest src/daf/jang/jang-qoidalari.spec.ts`
Expected: FAIL — `Cannot find module './jang-qoidalari'`.

- [ ] **Step 3: Kod**

`server/src/daf/jang/jang-qoidalari.ts`:

```ts
/**
 * Jang qoidalari — BITTA joyda (spec 2026-10-27 §2, §6). Raqamlar CEO
 * qarorlari: o'zgartirish spec bilan birga bo'ladi.
 */

export const SAVOL_SONI = 6;
export const SAVOL_MS = 10_000;
/** Tarmoq kechikishi: telefon javobi serverga 10 s dan keyin yetib kelishi mumkin. */
export const KECHIKISH_MS = 2_000;
/** Raqib kartasi ko'rinadigan vaqt — birinchi savol vaqti shundan keyin boshlanadi. */
export const KIRISH_MS = 3_000;
export const KUNLIK_CHEGARA = 5;
export const TASHLANGAN_MS = 60_000;
export const YANGI_TOPLAM_HAR = 3;
export const KUCH_STANDART = 0.6;
export const KUCH_ORALIQ = 0.15;
export const KUCH_MIN_JANG = 3;
export const KUCH_OYNA = 10;
export const UCHRASHMASLIK_KUN = 7;
export const KORILGAN_KUN = 3;
/** Ruh nomzodlari va «oxirgi ko'rilgan» tarixi shu oynadan olinadi. */
export const TARIX_KUN = 30;
// ponytail: 300 ta eng yangi ruh nomzodi; markaz o'ssa SQL filtrga o'tkaziladi.
export const RUH_NOMZOD_LIMIT = 300;
export const DAFI_BOT_ISMI = 'Dafi bot';

export type Natija = 'WIN' | 'LOSS' | 'DRAW';

interface Hisob {
  togri: number;
  ms: number;
}

export function jangNatijasi(men: Hisob, raqib: Hisob): Natija {
  if (men.togri !== raqib.togri) return men.togri > raqib.togri ? 'WIN' : 'LOSS';
  if (men.ms !== raqib.ms) return men.ms < raqib.ms ? 'WIN' : 'LOSS';
  return 'DRAW';
}

/**
 * Nega har 3-jang: yangi savollar faqat bot janglarida tanlanadi, ruh
 * janglari eski to'plamni takrorlaydi — bu qoidasiz ruh ko'paygan sari bir
 * xil to'plamlar aylanib qoladi (spec §6).
 */
export function yangiToplamNavbati(oldingiJanglar: number): boolean {
  return (oldingiJanglar + 1) % YANGI_TOPLAM_HAR === 0;
}

/** `togriSonlari` — `DONE` janglar, eng yangisi birinchi. */
export function kuch(togriSonlari: number[]): number {
  if (togriSonlari.length < KUCH_MIN_JANG) return KUCH_STANDART;
  const oyna = togriSonlari.slice(0, KUCH_OYNA);
  return oyna.reduce((s, x) => s + x, 0) / (oyna.length * SAVOL_SONI);
}

/** Boshidagi ketma-ket g'alabalar; durang ham seriyani uzadi. */
export function seriya(natijalar: Natija[]): number {
  let n = 0;
  for (const x of natijalar) {
    if (x !== 'WIN') break;
    n += 1;
  }
  return n;
}

export function raqibIsmi(s: { firstName: string; lastName: string }): string {
  const bosh = s.lastName.trim().charAt(0).toUpperCase();
  return bosh ? `${s.firstName} ${bosh}.` : s.firstName;
}

/**
 * `DAF_JANG`: `on` — hammaga; `7,12` — faqat shu o'quvchilarga (CEO yoqishdan
 * oldin o'zi sinaydi); qolgan hamma narsa — o'chiq (xavfsiz tomon).
 */
export function jangYoqilganmi(qiymat: string | undefined, studentId: number): boolean {
  const v = (qiymat ?? '').trim();
  if (v === 'on') return true;
  if (!/^\d+(\s*,\s*\d+)*$/.test(v)) return false;
  return v.split(',').map((s) => Number(s.trim())).includes(studentId);
}

/** Unit o'tilgan = uning HAMMA darsi tugagan (spec §4). */
export function otilganUnitlar(darslar: { unitId: number; tugagan: boolean }[]): number[] {
  const holat = new Map<number, boolean>();
  for (const d of darslar) holat.set(d.unitId, (holat.get(d.unitId) ?? true) && d.tugagan);
  return [...holat].filter(([, ok]) => ok).map(([id]) => id);
}

export function kunOldin(hozir: Date, kun: number): Date {
  return new Date(hozir.getTime() - kun * 86_400_000);
}
```

- [ ] **Step 4: Pass**

Run: `cd server && npx jest src/daf/jang/jang-qoidalari.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/jang/jang-qoidalari.ts src/daf/jang/jang-qoidalari.spec.ts
git add src/daf/jang/jang-qoidalari.ts src/daf/jang/jang-qoidalari.spec.ts
git commit -m "feat(daf-jang): battle rules as pure functions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Savol tanlash

**Files:**
- Create: `server/src/daf/jang/savol-tanlash.ts`
- Test: `server/src/daf/jang/savol-tanlash.spec.ts`

**Interfaces:**
- Consumes: `SAVOL_SONI` (Task 2).
- Produces:
  - `type JangSavolTuri = 'CHOOSE' | 'TYPE' | 'LISTEN'`
  - `interface SavolNomzodi { id: number; kind: JangSavolTuri; oxirgiKorilgan: Date | null }`
  - `savollarniTanla(nomzodlar: SavolNomzodi[], korilgan: Set<number>, rng?: () => number): number[]` — ≤ 6 id
  - `aralashtir<T>(xs: readonly T[], rng?: () => number): T[]`

- [ ] **Step 1: Failing test**

```ts
import { aralashtir, savollarniTanla, type SavolNomzodi } from './savol-tanlash';

const n = (id: number, kind: SavolNomzodi['kind'], kun: number | null = null): SavolNomzodi => ({
  id,
  kind,
  oxirgiKorilgan: kun === null ? null : new Date(Date.UTC(2026, 9, kun)),
});

describe('savollarniTanla', () => {
  it("turlar aralash: 3 tanlash, 2 yozish, 1 eshitish (yetarli bo'lsa)", () => {
    const xs = [
      ...[1, 2, 3, 4, 5].map((i) => n(i, 'CHOOSE')),
      ...[6, 7, 8].map((i) => n(i, 'TYPE')),
      ...[9, 10].map((i) => n(i, 'LISTEN')),
    ];
    const ids = savollarniTanla(xs, new Set());
    const tur = (k: string) => ids.filter((id) => xs.find((x) => x.id === id)!.kind === k).length;
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect([tur('CHOOSE'), tur('TYPE'), tur('LISTEN')]).toEqual([3, 2, 1]);
  });

  it("eshitish yo'q — bo'sh joy boshqa tur bilan to'ldiriladi", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7].map((i) => n(i, i < 5 ? 'CHOOSE' : 'TYPE'));
    expect(savollarniTanla(xs, new Set())).toHaveLength(6);
  });

  it("yaqinda ko'rilgan chiqmaydi, yetmasa eng eskisi qaytadi", () => {
    const xs = [
      n(1, 'CHOOSE'),
      n(2, 'CHOOSE'),
      n(3, 'TYPE'),
      n(4, 'TYPE'),
      n(5, 'CHOOSE', 26),
      n(6, 'CHOOSE', 20),
      n(7, 'CHOOSE', 25),
    ];
    const ids = savollarniTanla(xs, new Set([5, 6, 7]));
    expect(ids).toHaveLength(6);
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3, 4, 6, 7]));
    expect(ids).not.toContain(5);
  });

  it('6 tadan kam nomzod — borini qaytaradi', () => {
    expect(savollarniTanla([n(1, 'CHOOSE'), n(2, 'TYPE')], new Set())).toHaveLength(2);
  });
});

describe('aralashtir', () => {
  it("asl massivni o'zgartirmaydi, elementlarni yo'qotmaydi", () => {
    const xs = [1, 2, 3, 4];
    const ys = aralashtir(xs, () => 0);
    expect(xs).toEqual([1, 2, 3, 4]);
    expect([...ys].sort()).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: Fail**

Run: `cd server && npx jest src/daf/jang/savol-tanlash.spec.ts` — Expected: FAIL (modul yo'q).

- [ ] **Step 3: Kod**

```ts
import { SAVOL_SONI } from './jang-qoidalari';

export type JangSavolTuri = 'CHOOSE' | 'TYPE' | 'LISTEN';

export interface SavolNomzodi {
  id: number;
  kind: JangSavolTuri;
  oxirgiKorilgan: Date | null;
}

/** 6 savoldan: ~50 % tanlash, ~35 % yozish, ~15 % eshitish (spec §4). */
const TUR_REJASI: ReadonlyArray<[JangSavolTuri, number]> = [
  ['CHOOSE', 3],
  ['TYPE', 2],
  ['LISTEN', 1],
];

export function aralashtir<T>(xs: readonly T[], rng: () => number = Math.random): T[] {
  const ys = [...xs];
  for (let i = ys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [ys[i], ys[j]] = [ys[j], ys[i]];
  }
  return ys;
}

/**
 * Avval yaqinda ko'rilmaganlardan tur rejasi bo'yicha, keyin istalgan turdan.
 * Baribir yetmasa — eng UZOQ vaqt oldin ko'rilganlar qaytadi: faqat u01 ni
 * o'tgan o'quvchida ~35 savol bor, kuniga 30 tasini ko'radi (spec §4).
 */
export function savollarniTanla(
  nomzodlar: SavolNomzodi[],
  korilgan: Set<number>,
  rng: () => number = Math.random,
): number[] {
  const yangi = aralashtir(nomzodlar.filter((n) => !korilgan.has(n.id)), rng);
  const tanlangan: number[] = [];
  for (const [tur, soni] of TUR_REJASI) {
    for (const n of yangi.filter((x) => x.kind === tur).slice(0, soni)) tanlangan.push(n.id);
  }
  for (const n of yangi) {
    if (tanlangan.length >= SAVOL_SONI) break;
    if (!tanlangan.includes(n.id)) tanlangan.push(n.id);
  }
  const eski = nomzodlar
    .filter((n) => korilgan.has(n.id))
    .sort((a, b) => (a.oxirgiKorilgan?.getTime() ?? 0) - (b.oxirgiKorilgan?.getTime() ?? 0));
  for (const n of eski) {
    if (tanlangan.length >= SAVOL_SONI) break;
    tanlangan.push(n.id);
  }
  return aralashtir(tanlangan.slice(0, SAVOL_SONI), rng);
}
```

- [ ] **Step 4: Pass** — `cd server && npx jest src/daf/jang/savol-tanlash.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/jang/savol-tanlash.ts src/daf/jang/savol-tanlash.spec.ts
git add src/daf/jang/savol-tanlash.ts src/daf/jang/savol-tanlash.spec.ts
git commit -m "feat(daf-jang): pick six battle questions with type mix and freshness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ruh tanlash, Dafi bot, javob tekshirish

**Files:**
- Create: `server/src/daf/jang/ruh-tanlash.ts`, `server/src/daf/jang/dafi-bot.ts`, `server/src/daf/jang/jang-javob.ts`
- Test: `server/src/daf/jang/ruh-tanlash.spec.ts`, `server/src/daf/jang/dafi-bot.spec.ts`, `server/src/daf/jang/jang-javob.spec.ts`

**Interfaces:**
- Consumes: `KUCH_ORALIQ`, `SAVOL_SONI` (Task 2); `istRichtig` (`../uebung/antwort`).
- Produces:
  - `interface RuhNomzodi { battleId: number; studentId: number; questionIds: number[]; egaKuchi: number }`
  - `interface RuhSharti { menId: number; menKuchi: number; ruxsatSavollar: Set<number>; korilgan: Set<number>; uchrashganlar: Set<number> }`
  - `ruhniTanla(nomzodlar: RuhNomzodi[], shart: RuhSharti, rng?: () => number): RuhNomzodi | null`
  - `interface BotJavobi { togri: boolean; ms: number }`
  - `botJavoblari(soni: number, kuch: number, rng?: () => number): BotJavobi[]`
  - `javobTogrimi(savol: { kind: 'CHOOSE'|'TYPE'|'LISTEN'; answer: string; akzeptiert: string[] }, berilgan: string): boolean`

- [ ] **Step 1: Failing testlar**

`ruh-tanlash.spec.ts`:

```ts
import { ruhniTanla, type RuhNomzodi, type RuhSharti } from './ruh-tanlash';

const savollar = [1, 2, 3, 4, 5, 6];
const nom = (o: Partial<RuhNomzodi> = {}): RuhNomzodi => ({
  battleId: 100,
  studentId: 20,
  questionIds: savollar,
  egaKuchi: 0.6,
  ...o,
});
const shart = (o: Partial<RuhSharti> = {}): RuhSharti => ({
  menId: 10,
  menKuchi: 0.6,
  ruxsatSavollar: new Set([...savollar, 7, 8]),
  korilgan: new Set(),
  uchrashganlar: new Set(),
  ...o,
});

describe('ruhniTanla', () => {
  it('mos nomzodni oladi', () => {
    expect(ruhniTanla([nom()], shart())?.battleId).toBe(100);
  });
  it("o'zi bo'lmaydi", () => {
    expect(ruhniTanla([nom({ studentId: 10 })], shart())).toBeNull();
  });
  it("o'tilmagan unit savoli bo'lsa — yo'q", () => {
    expect(ruhniTanla([nom({ questionIds: [1, 2, 3, 4, 5, 99] })], shart())).toBeNull();
  });
  it("yaqinda ko'rilgan savol bo'lsa — yo'q", () => {
    expect(ruhniTanla([nom()], shart({ korilgan: new Set([3]) }))).toBeNull();
  });
  it('kuch ±0.15 dan tashqari — yo\'q, chegarada — ha', () => {
    expect(ruhniTanla([nom({ egaKuchi: 0.8 })], shart())).toBeNull();
    expect(ruhniTanla([nom({ egaKuchi: 0.75 })], shart())).not.toBeNull();
  });
  it("7 kunda uchrashgan ega — yo'q", () => {
    expect(ruhniTanla([nom()], shart({ uchrashganlar: new Set([20]) }))).toBeNull();
  });
  it("6 savoli to'liq bo'lmagan jang — yo'q", () => {
    expect(ruhniTanla([nom({ questionIds: [1, 2, 3] })], shart())).toBeNull();
  });
});
```

`dafi-bot.spec.ts`:

```ts
import { botJavoblari } from './dafi-bot';

describe('botJavoblari', () => {
  it('6 javob, vaqt 3000–9000 ms', () => {
    const xs = botJavoblari(6, 0.6);
    expect(xs).toHaveLength(6);
    for (const x of xs) {
      expect(x.ms).toBeGreaterThanOrEqual(3000);
      expect(x.ms).toBeLessThanOrEqual(9000);
    }
  });
  it("ehtimol 0.6–0.75 oralig'iga qisiladi", () => {
    // rng 0.7: kuch 0.9 → 0.75 → to'g'ri; kuch 0.1 → 0.6 → xato.
    expect(botJavoblari(1, 0.9, () => 0.7)[0].togri).toBe(true);
    expect(botJavoblari(1, 0.1, () => 0.7)[0].togri).toBe(false);
  });
});
```

`jang-javob.spec.ts`:

```ts
import { javobTogrimi } from './jang-javob';

describe('javobTogrimi', () => {
  it('tanlash — aynan variant matni', () => {
    const s = { kind: 'CHOOSE' as const, answer: 'Tschüss', akzeptiert: [] };
    expect(javobTogrimi(s, 'Tschüss')).toBe(true);
    expect(javobTogrimi(s, 'tschüss')).toBe(false);
  });
  it('yozish — ä/ae, katta-kichik harf kechiriladi', () => {
    const s = { kind: 'TYPE' as const, answer: 'Tschüss', akzeptiert: [] };
    expect(javobTogrimi(s, 'tschuess')).toBe(true);
    expect(javobTogrimi(s, 'Tschüs')).toBe(false);
    expect(javobTogrimi(s, '')).toBe(false);
  });
  it('yozish — akzeptiert', () => {
    expect(javobTogrimi({ kind: 'TYPE', answer: 'heiße', akzeptiert: ['heisse'] }, 'heisse')).toBe(true);
  });
});
```

- [ ] **Step 2: Fail** — `cd server && npx jest src/daf/jang` → 3 ta yangi spec FAIL (modul yo'q).

- [ ] **Step 3: Kod**

`ruh-tanlash.ts`:

```ts
import { KUCH_ORALIQ, SAVOL_SONI } from './jang-qoidalari';
import { aralashtir } from './savol-tanlash';

export interface RuhNomzodi {
  battleId: number;
  studentId: number;
  questionIds: number[];
  egaKuchi: number;
}

export interface RuhSharti {
  menId: number;
  menKuchi: number;
  /** O'quvchi o'tgan unitlardagi `APPROVED` savollar. */
  ruxsatSavollar: Set<number>;
  /** Oxirgi 3 kunda ko'rilgan savollar. */
  korilgan: Set<number>;
  /** 7 kun ichida ruhi bilan o'ynalgan egalar. */
  uchrashganlar: Set<number>;
}

/**
 * Ruh — BITTA tugagan jang: o'quvchi uning 6 savolini aynan o'sha tartibda
 * oladi, chunki ruh javoblari shu savollarga berilgan (spec §6).
 */
export function ruhniTanla(
  nomzodlar: RuhNomzodi[],
  shart: RuhSharti,
  rng: () => number = Math.random,
): RuhNomzodi | null {
  const mos = nomzodlar.filter(
    (n) =>
      n.studentId !== shart.menId &&
      !shart.uchrashganlar.has(n.studentId) &&
      n.questionIds.length === SAVOL_SONI &&
      n.questionIds.every((q) => shart.ruxsatSavollar.has(q) && !shart.korilgan.has(q)) &&
      // 1e-9: 0.75 − 0.6 suzuvchi nuqtada 0.15000000000000002 chiqadi.
      Math.abs(n.egaKuchi - shart.menKuchi) <= KUCH_ORALIQ + 1e-9,
  );
  return aralashtir(mos, rng)[0] ?? null;
}
```

`dafi-bot.ts`:

```ts
export interface BotJavobi {
  togri: boolean;
  ms: number;
}

const MIN_EHTIMOL = 0.6;
const MAX_EHTIMOL = 0.75;
const MIN_MS = 3000;
const MAX_MS = 9000;

/**
 * Dafi bot jang boshida BIR MARTA hisoblanadi va saqlanadi: jang davomida
 * qayta so'ralsa natija o'zgarmasligi kerak (spec §6).
 */
export function botJavoblari(
  soni: number,
  kuch: number,
  rng: () => number = Math.random,
): BotJavobi[] {
  const p = Math.min(MAX_EHTIMOL, Math.max(MIN_EHTIMOL, kuch));
  return Array.from({ length: soni }, () => ({
    togri: rng() < p,
    ms: MIN_MS + Math.floor(rng() * (MAX_MS - MIN_MS + 1)),
  }));
}
```

`jang-javob.ts`:

```ts
import { istRichtig } from '../uebung/antwort';

/**
 * Tanlash/eshitish — mijoz variant MATNINI yuboradi, aynan solishtiriladi.
 * Yozish — mashq tizimidagi kechirimli solishtirish (`ä`/`ae`, `ß`/`ss`).
 */
export function javobTogrimi(
  savol: { kind: 'CHOOSE' | 'TYPE' | 'LISTEN'; answer: string; akzeptiert: string[] },
  berilgan: string,
): boolean {
  if (savol.kind === 'TYPE') return istRichtig(berilgan, savol.answer, savol.akzeptiert);
  return berilgan === savol.answer;
}
```

- [ ] **Step 4: Pass** — `cd server && npx jest src/daf/jang` → PASS.

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/jang/*.ts
git add src/daf/jang
git commit -m "feat(daf-jang): ghost matching, Dafi bot answers and answer check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Jang nishonlari (`JANG_10/50/100`)

**Files:**
- Modify: `server/src/daf/nishon/nishon-katalogi.ts`, `server/src/daf/nishon/nishonlar.ts`, `server/src/daf/eslatma/eslatma-matn.ts`
- Modify: `client/src/components/student-portal/lernen/nishon.ts`, `client/src/i18n/dictionaries/{en,de,ru}.ts`
- Test: mavjud `nishon-katalogi.spec.ts`, `eslatma-matn.spec.ts`, `client/.../lernen/nishon.test.ts` ga qo'shiladi

**Interfaces:**
- Produces: `NishonTuri` ga `'JANG'`; `NishonSharoiti.jangGolib?: number`; kalitlar `JANG_10`, `JANG_50`, `JANG_100` (chegara = g'alaba soni). Task 7 `grantBadges(prisma, studentId, companyId, { serie: 0, woerter: 0, jangGolib })` chaqiradi.

- [ ] **Step 1: Failing testlar qo'shing**

`server/src/daf/nishon/nishon-katalogi.spec.ts` oxiriga:

```ts
describe('jang nishonlari', () => {
  it("g'alaba soni bo'yicha", () => {
    expect(shartBajarilganlar({ serie: 0, woerter: 0, jangGolib: 50 })).toEqual(['JANG_10', 'JANG_50']);
    expect(shartBajarilganlar({ serie: 0, woerter: 0 })).toEqual([]);
  });
});
```
(`shartBajarilganlar` importi faylda bo'lmasa qo'shing.)

`server/src/daf/eslatma/eslatma-matn.spec.ts` dagi server/mijoz nomlari solishtiriladigan misollar ro'yxatiga `['JANG_10', "10 ta jang g'alabasi"]` ni qo'shing (faylni oching va mavjud misollar shaklini takrorlang).

`client/src/components/student-portal/lernen/nishon.test.ts` ga:

```ts
it("jang nishoni nomi", () => {
  expect(nishonNomi("JANG_50")).toBe("50 ta jang g'alabasi");
});
```

- [ ] **Step 2: Fail**

```bash
cd server && npx jest src/daf/nishon src/daf/eslatma/eslatma-matn.spec.ts
cd ../client && npx vitest run src/components/student-portal/lernen/nishon.test.ts
```
Expected: yangi testlar FAIL.

- [ ] **Step 3: Kod**

`nishon-katalogi.ts`:
- `export type NishonTuri = 'SERIE' | 'WOERTER' | 'LIGA' | 'XONA' | 'GURUH' | 'JANG';`
- katalog oxiriga:
```ts
  // Jang (spec 2026-10-27): chegara — g'alabalar soni. Liga balli bermaydi, shuning uchun nishon jangning o'z mukofoti.
  { key: 'JANG_10', tur: 'JANG', chegara: 10 },
  { key: 'JANG_50', tur: 'JANG', chegara: 50 },
  { key: 'JANG_100', tur: 'JANG', chegara: 100 },
```
- `NishonSharoiti` ga: `/** Jang g'alabalari soni (`DafBattle.result = WIN`). */ jangGolib?: number;`
- `joriy()` switch'ga: `case 'JANG': return s.jangGolib ?? 0;`

`nishonlar.ts` (`nishonlarRoyxati`): `Promise.all` ga beshinchi element `prisma.dafBattle.count({ where: { studentId, result: 'WIN' } })` qo'shing (o'zgaruvchi `jangGolib`), `sharoit` ga `jangGolib` maydonini qo'shing.

`eslatma-matn.ts` `nishonNomi`: `GURUH_BIRINCHI` qatoridan keyin:
```ts
  const jang = /^JANG_(\d+)$/.exec(key);
  if (jang) return `${Number(jang[1])} ta jang g'alabasi`;
```

`client/.../lernen/nishon.ts` `nishonNomi`: `GURUH_BIRINCHI` qatoridan keyin:
```ts
  const jang = /^JANG_(\d+)$/.exec(key);
  if (jang) return t("{n} ta jang g'alabasi", { n: Number(jang[1]) });
```
`nishonQoldi` switch'ga (`GURUH` dan keyin):
```ts
    case "JANG":
      return t("yana {n} ta g'alaba", { n: q.qoldi });
```
`client/.../lernen/types.ts` dagi `NishonQatori.tur` turi union bo'lsa — `"JANG"` qo'shing.

`client/src/i18n/dictionaries/en.ts`, `de.ts`, `ru.ts` ga (alifbo tartibi bo'yicha mos joyga):
```ts
  "{n} ta jang g'alabasi": "{n} battle wins",          // en
  "yana {n} ta g'alaba": "{n} more wins",              // en
  "{n} ta jang g'alabasi": "{n} Duellsiege",            // de
  "yana {n} ta g'alaba": "noch {n} Siege",             // de
  "{n} ta jang g'alabasi": "{n} побед в дуэлях",         // ru
  "yana {n} ta g'alaba": "ещё {n} побед",              // ru
```

- [ ] **Step 4: Pass**

```bash
cd server && npx jest src/daf/nishon src/daf/eslatma
cd ../client && npx vitest run src/components/student-portal/lernen/nishon.test.ts src/i18n/i18n-coverage.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/nishon/*.ts src/daf/eslatma/eslatma-matn.ts src/daf/eslatma/eslatma-matn.spec.ts
cd .. && git add server/src/daf/nishon server/src/daf/eslatma client/src/components/student-portal/lernen/nishon.ts client/src/components/student-portal/lernen/nishon.test.ts client/src/components/student-portal/lernen/types.ts client/src/i18n/dictionaries
git commit -m "feat(daf-jang): battle win badges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `JangService` — `holat` va `boshla`

**Files:**
- Create: `server/src/daf/jang/jang.types.ts`, `server/src/daf/jang/jang.service.ts`
- Test: `server/src/daf/jang/jang.service.spec.ts`

**Interfaces:**
- Consumes: Task 2–4 funksiyalari; `PrismaService` (`../../prisma/prisma.service`); `ConfigService` (`@nestjs/config`); `tashkentDateStr`, `tashkentDayRangeUtc` (`../../common/date/tashkent`).
- Produces (`jang.types.ts`):
```ts
export interface JangHolati { yoqilgan: boolean; ochiq: boolean; bugunQoldi: number; golibSoni: number; seriya: number }
export interface JangRaqibi { tur: 'GHOST' | 'BOT'; studentId: number | null; ism: string; rasm: string | null; golibSoni: number | null }
export interface JangSavoli { pozitsiya: number; kind: 'CHOOSE' | 'TYPE' | 'LISTEN'; prompt: string; options: string[]; audio: { url: string; startMs: number | null; endMs: number | null } | null }
export interface JangBoshlandi { jangId: number; kirishMs: number; raqib: JangRaqibi; savollar: JangSavoli[] }
export interface JavobNatijasi { togri: boolean; togriJavob: string; raqib: { togri: boolean; ms: number } }
export interface YakunNatijasi { natija: 'WIN' | 'LOSS' | 'DRAW'; men: { togri: number; ms: number }; raqib: { togri: number; ms: number }; yangiNishonlar: string[] }
```
- `JangService.holat(studentId: number, hozir?: Date): Promise<JangHolati>`
- `JangService.boshla(studentId: number, companyId: number, hozir?: Date, rng?: () => number): Promise<JangBoshlandi>`

- [ ] **Step 1: Failing test**

`server/src/daf/jang/jang.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JangService } from './jang.service';

const HOZIR = new Date('2026-10-27T06:00:00Z'); // 11:00 Toshkent

function yasa(o: {
  flag?: string;
  darslar?: { unitId: number; progress: unknown[] }[];
  bugun?: number;
  savollar?: { id: number; kind: string }[];
  oldingi?: number;
  ruhNomzodlari?: { id: number; studentId: number; questionIds: number[] }[];
  egaTarixi?: { studentId: number; correctCount: number }[];
} = {}) {
  const savolQatori = (id: number) => ({
    id,
    kind: 'CHOOSE',
    prompt: `S${id}`,
    options: ['a', 'b', 'c'],
    audioKey: null,
    audioStartMs: null,
    audioEndMs: null,
  });
  const prisma = {
    dafLesson: {
      findMany: jest.fn().mockResolvedValue(
        o.darslar ?? [{ unitId: 1, progress: [{ id: 1 }] }],
      ),
    },
    dafBattleQuestion: {
      findMany: jest.fn(async (q: { where: { id?: { in: number[] } } }) =>
        q.where.id ? q.where.id.in.map(savolQatori) : (o.savollar ?? []),
      ),
    },
    dafBattle: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn(async (q: { where: { createdAt?: unknown; status?: unknown; result?: unknown } }) => {
        if (q.where.createdAt) return o.bugun ?? 0;
        if (q.where.status) return o.oldingi ?? 0;
        return 0;
      }),
      findMany: jest.fn(async (q: { where: { companyId?: number; studentId?: unknown }; select: Record<string, unknown> }) => {
        if (q.where.companyId !== undefined) return o.ruhNomzodlari ?? [];
        if (typeof q.where.studentId === 'object') return o.egaTarixi ?? [];
        return [];
      }),
      create: jest.fn().mockResolvedValue({ id: 55 }),
    },
    student: {
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Sevinch', lastName: 'Tanieva', photo: null }),
    },
  };
  const config = {
    get: (k: string) => (k === 'DAF_JANG' ? (o.flag ?? 'on') : 'https://cdn.test'),
  };
  return { prisma, servis: new JangService(prisma as never, config as never) };
}

const olti = [1, 2, 3, 4, 5, 6].map((id) => ({ id, kind: 'CHOOSE' }));

describe('JangService.holat', () => {
  it("o'chiq — hammasi nol", async () => {
    const { servis } = yasa({ flag: 'off' });
    expect(await servis.holat(10, HOZIR)).toEqual({ yoqilgan: false, ochiq: false, bugunQoldi: 0, golibSoni: 0, seriya: 0 });
  });
  it('yoqilgan — bugun qolgan jang', async () => {
    const { servis } = yasa({ bugun: 2 });
    expect(await servis.holat(10, HOZIR)).toMatchObject({ yoqilgan: true, ochiq: true, bugunQoldi: 3 });
  });
});

describe('JangService.boshla', () => {
  it("o'chiq — 404", async () => {
    const { servis } = yasa({ flag: 'off' });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('kunlik chegara — 400', async () => {
    const { servis } = yasa({ bugun: 5, savollar: olti });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toBeInstanceOf(BadRequestException);
  });
  it("o'tilgan unit yo'q — 400", async () => {
    const { servis } = yasa({ darslar: [{ unitId: 1, progress: [] }], savollar: olti });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toBeInstanceOf(BadRequestException);
  });
  it("ruh yo'q — bot, javobsiz savollar, eski OPEN tashlanadi", async () => {
    const { servis, prisma } = yasa({ savollar: olti });
    const r = await servis.boshla(10, 1, HOZIR, () => 0.5);
    expect(prisma.dafBattle.updateMany).toHaveBeenCalledWith({
      where: { studentId: 10, status: 'OPEN' },
      data: { status: 'ABANDONED' },
    });
    expect(r.raqib).toEqual({ tur: 'BOT', studentId: null, ism: 'Dafi bot', rasm: null, golibSoni: null });
    expect(r.savollar).toHaveLength(6);
    expect(r.savollar[0]).not.toHaveProperty('answer');
    const data = prisma.dafBattle.create.mock.calls[0][0].data;
    expect(data.opponent).toBe('BOT');
    expect(data.botAnswers).toHaveLength(6);
    expect(data.lastActivityAt).toEqual(new Date(HOZIR.getTime() + 3000));
  });
  it('mos ruh — uning savollari va ismi', async () => {
    const { servis, prisma } = yasa({
      savollar: olti,
      ruhNomzodlari: [{ id: 900, studentId: 20, questionIds: [6, 5, 4, 3, 2, 1] }],
    });
    const r = await servis.boshla(10, 1, HOZIR, () => 0.5);
    expect(r.raqib).toMatchObject({ tur: 'GHOST', studentId: 20, ism: 'Sevinch T.' });
    expect(r.savollar.map((s) => s.prompt)).toEqual(['S6', 'S5', 'S4', 'S3', 'S2', 'S1']);
    expect(prisma.dafBattle.create.mock.calls[0][0].data.ghostBattleId).toBe(900);
  });
  it('har 3-jang — ruh bo\'lsa ham bot', async () => {
    const { servis } = yasa({
      savollar: olti,
      oldingi: 2,
      ruhNomzodlari: [{ id: 900, studentId: 20, questionIds: [1, 2, 3, 4, 5, 6] }],
    });
    expect((await servis.boshla(10, 1, HOZIR)).raqib.tur).toBe('BOT');
  });
  it("savol yetmasa — 409", async () => {
    const { servis } = yasa({ savollar: olti.slice(0, 4) });
    await expect(servis.boshla(10, 1, HOZIR)).rejects.toThrow('yetarli emas');
  });
});
```

- [ ] **Step 2: Fail** — `cd server && npx jest src/daf/jang/jang.service.spec.ts` → FAIL (modul yo'q).

- [ ] **Step 3: Kod**

`jang.types.ts` — yuqoridagi «Produces» blokidagi 6 interfeys aynan.

`jang.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tashkentDateStr, tashkentDayRangeUtc } from '../../common/date/tashkent';
import {
  DAFI_BOT_ISMI,
  KIRISH_MS,
  KORILGAN_KUN,
  KUCH_OYNA,
  KUNLIK_CHEGARA,
  RUH_NOMZOD_LIMIT,
  SAVOL_SONI,
  TARIX_KUN,
  UCHRASHMASLIK_KUN,
  jangYoqilganmi,
  kuch,
  kunOldin,
  otilganUnitlar,
  raqibIsmi,
  seriya,
  yangiToplamNavbati,
  type Natija,
} from './jang-qoidalari';
import { aralashtir, savollarniTanla } from './savol-tanlash';
import { ruhniTanla, type RuhNomzodi, type RuhSharti } from './ruh-tanlash';
import { botJavoblari } from './dafi-bot';
import type { JangBoshlandi, JangHolati, JangRaqibi } from './jang.types';

/**
 * Jang (spec 2026-10-27). Liga balliga TEGMAYDI: `DafAttempt`/`DafStudentDay`
 * yozilmaydi, jang o'z jadvallarida yashaydi.
 */
@Injectable()
export class JangService {
  private readonly logger = new Logger(JangService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private yoqilgan(studentId: number): boolean {
    return jangYoqilganmi(this.config.get<string>('DAF_JANG'), studentId);
  }

  async holat(studentId: number, hozir = new Date()): Promise<JangHolati> {
    if (!this.yoqilgan(studentId)) {
      return { yoqilgan: false, ochiq: false, bugunQoldi: 0, golibSoni: 0, seriya: 0 };
    }
    const [unitlar, bugun, golibSoni, oxirgilar] = await Promise.all([
      this.otilganUnitIdlar(studentId),
      this.bugungiJanglar(studentId, hozir),
      this.prisma.dafBattle.count({ where: { studentId, result: 'WIN' } }),
      // ponytail: seriya 100 jang bilan cheklanadi; undan uzun seriya kam uchraydi.
      this.prisma.dafBattle.findMany({
        where: { studentId, status: 'DONE' },
        orderBy: { finishedAt: 'desc' },
        take: 100,
        select: { result: true },
      }),
    ]);
    return {
      yoqilgan: true,
      ochiq: unitlar.length > 0,
      bugunQoldi: Math.max(0, KUNLIK_CHEGARA - bugun),
      golibSoni,
      seriya: seriya(oxirgilar.map((o) => o.result as Natija)),
    };
  }

  async boshla(
    studentId: number,
    companyId: number,
    hozir = new Date(),
    rng: () => number = Math.random,
  ): Promise<JangBoshlandi> {
    if (!this.yoqilgan(studentId)) throw new NotFoundException();
    // Yangi jang boshlansa eskisi davom ettirilmaydi — u mag'lubiyat emas, ruh ham bo'lmaydi.
    await this.prisma.dafBattle.updateMany({
      where: { studentId, status: 'OPEN' },
      data: { status: 'ABANDONED' },
    });
    if ((await this.bugungiJanglar(studentId, hozir)) >= KUNLIK_CHEGARA) {
      throw new BadRequestException('Bugungi janglar tugadi');
    }
    const unitIds = await this.otilganUnitIdlar(studentId);
    if (unitIds.length === 0) throw new BadRequestException('Avval birinchi unitni tugating');

    const [savollar, menJanglari, oldingiSoni, menTogrilar] = await Promise.all([
      this.prisma.dafBattleQuestion.findMany({
        where: { unitId: { in: unitIds }, status: 'APPROVED' },
        select: { id: true, kind: true },
      }),
      this.prisma.dafBattle.findMany({
        where: { studentId, createdAt: { gte: kunOldin(hozir, TARIX_KUN) } },
        select: { questionIds: true, createdAt: true, ghostBattle: { select: { studentId: true } } },
      }),
      this.prisma.dafBattle.count({ where: { studentId, status: { in: ['DONE', 'ABANDONED'] } } }),
      this.prisma.dafBattle.findMany({
        where: { studentId, status: 'DONE' },
        orderBy: { finishedAt: 'desc' },
        take: KUCH_OYNA,
        select: { correctCount: true },
      }),
    ]);

    const oxirgiKorilgan = new Map<number, Date>();
    for (const j of menJanglari) {
      for (const q of j.questionIds) {
        const e = oxirgiKorilgan.get(q);
        if (!e || e < j.createdAt) oxirgiKorilgan.set(q, j.createdAt);
      }
    }
    const korilganChegara = kunOldin(hozir, KORILGAN_KUN);
    const korilgan = new Set(
      [...oxirgiKorilgan].filter(([, d]) => d >= korilganChegara).map(([id]) => id),
    );
    const uchrashmaChegara = kunOldin(hozir, UCHRASHMASLIK_KUN);
    const uchrashganlar = new Set(
      menJanglari
        .filter((j) => j.ghostBattle && j.createdAt >= uchrashmaChegara)
        .map((j) => j.ghostBattle!.studentId),
    );
    const menKuchi = kuch(menTogrilar.map((t) => t.correctCount));

    const ruh = yangiToplamNavbati(oldingiSoni)
      ? null
      : await this.ruhQidir(
          companyId,
          hozir,
          {
            menId: studentId,
            menKuchi,
            ruxsatSavollar: new Set(savollar.map((s) => s.id)),
            korilgan,
            uchrashganlar,
          },
          rng,
        );
    const questionIds = ruh
      ? ruh.questionIds
      : savollarniTanla(
          savollar.map((s) => ({ id: s.id, kind: s.kind, oxirgiKorilgan: oxirgiKorilgan.get(s.id) ?? null })),
          korilgan,
          rng,
        );
    if (questionIds.length < SAVOL_SONI) {
      throw new ConflictException('Jang savollari hali yetarli emas');
    }
    const bot = ruh ? null : botJavoblari(SAVOL_SONI, menKuchi, rng);

    const jang = await this.prisma.dafBattle.create({
      data: {
        studentId,
        companyId,
        opponent: ruh ? 'GHOST' : 'BOT',
        ghostBattleId: ruh?.battleId ?? null,
        questionIds,
        ...(bot ? { botAnswers: bot as unknown as Prisma.InputJsonValue } : {}),
        lastActivityAt: new Date(hozir.getTime() + KIRISH_MS),
      },
      select: { id: true },
    });

    const [raqib, qatorlar] = await Promise.all([
      this.raqibKartasi(ruh),
      this.prisma.dafBattleQuestion.findMany({
        where: { id: { in: questionIds } },
        select: { id: true, kind: true, prompt: true, options: true, audioKey: true, audioStartMs: true, audioEndMs: true },
      }),
    ]);
    const byId = new Map(qatorlar.map((q) => [q.id, q]));
    return {
      jangId: jang.id,
      kirishMs: KIRISH_MS,
      raqib,
      savollar: questionIds.map((id, pozitsiya) => {
        const q = byId.get(id)!;
        const url = this.mediaUrl(q.audioKey);
        return {
          pozitsiya,
          kind: q.kind,
          prompt: q.prompt,
          options: q.kind === 'TYPE' ? [] : aralashtir(q.options, rng),
          audio: url ? { url, startMs: q.audioStartMs, endMs: q.audioEndMs } : null,
        };
      }),
    };
  }

  private async ruhQidir(
    companyId: number,
    hozir: Date,
    shart: RuhSharti,
    rng: () => number,
  ): Promise<RuhNomzodi | null> {
    const nomzodlar = await this.prisma.dafBattle.findMany({
      where: {
        companyId,
        status: 'DONE',
        studentId: { not: shart.menId },
        finishedAt: { gte: kunOldin(hozir, TARIX_KUN) },
        student: { deletedAt: null },
      },
      orderBy: { finishedAt: 'desc' },
      take: RUH_NOMZOD_LIMIT,
      select: { id: true, studentId: true, questionIds: true },
    });
    if (nomzodlar.length === 0) return null;
    const egalar = [...new Set(nomzodlar.map((n) => n.studentId))];
    // ponytail: umumiy `take` — bitta faol ega boshqalarning tarixini siqib chiqarishi mumkin; kerak bo'lsa ega boshiga SQL window.
    const tarix = await this.prisma.dafBattle.findMany({
      where: { studentId: { in: egalar }, status: 'DONE' },
      orderBy: { finishedAt: 'desc' },
      take: egalar.length * KUCH_OYNA * 3,
      select: { studentId: true, correctCount: true },
    });
    const togrilar = new Map<number, number[]>();
    for (const t of tarix) {
      const xs = togrilar.get(t.studentId) ?? [];
      if (xs.length < KUCH_OYNA) xs.push(t.correctCount);
      togrilar.set(t.studentId, xs);
    }
    return ruhniTanla(
      nomzodlar.map((n) => ({
        battleId: n.id,
        studentId: n.studentId,
        questionIds: n.questionIds,
        egaKuchi: kuch(togrilar.get(n.studentId) ?? []),
      })),
      shart,
      rng,
    );
  }

  private async raqibKartasi(ruh: RuhNomzodi | null): Promise<JangRaqibi> {
    if (!ruh) return { tur: 'BOT', studentId: null, ism: DAFI_BOT_ISMI, rasm: null, golibSoni: null };
    const [s, golibSoni] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: ruh.studentId },
        select: { firstName: true, lastName: true, photo: true },
      }),
      this.prisma.dafBattle.count({ where: { studentId: ruh.studentId, result: 'WIN' } }),
    ]);
    return {
      tur: 'GHOST',
      studentId: ruh.studentId,
      ism: s ? raqibIsmi(s) : '—',
      rasm: s?.photo ?? null,
      golibSoni,
    };
  }

  private async otilganUnitIdlar(studentId: number): Promise<number[]> {
    const darslar = await this.prisma.dafLesson.findMany({
      where: { unit: { retiredAt: null } },
      select: {
        unitId: true,
        progress: { where: { studentId, completedAt: { not: null } }, select: { id: true } },
      },
    });
    return otilganUnitlar(darslar.map((d) => ({ unitId: d.unitId, tugagan: d.progress.length > 0 })));
  }

  private bugungiJanglar(studentId: number, hozir: Date): Promise<number> {
    return this.prisma.dafBattle.count({
      where: { studentId, createdAt: tashkentDayRangeUtc(tashkentDateStr(hozir)) },
    });
  }

  /** R2 kaliti → ommaviy manzil (`DafPortalReadService.mediaUrl` bilan bir xil). */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }
}
```

- [ ] **Step 4: Pass** — `cd server && npx jest src/daf/jang/jang.service.spec.ts` → PASS. Keyin `npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/jang/jang.service.ts src/daf/jang/jang.service.spec.ts src/daf/jang/jang.types.ts
git add src/daf/jang
git commit -m "feat(daf-jang): battle status and start with ghost or bot opponent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `JangService` — `javob` va `yakun`

**Files:**
- Modify: `server/src/daf/jang/jang.service.ts`
- Test: `server/src/daf/jang/jang.service.javob.spec.ts`

**Interfaces:**
- Consumes: `javobTogrimi` (Task 4), `BotJavobi` (Task 4), `grantBadges` (`../nishon/nishon-berish`, Task 5 bilan `jangGolib`), `jangNatijasi` (Task 2).
- Produces:
  - `JangService.javob(studentId: number, jangId: number, dto: { pozitsiya: number; javob: string }, hozir?: Date): Promise<JavobNatijasi>`
  - `JangService.yakun(studentId: number, companyId: number, jangId: number, hozir?: Date): Promise<YakunNatijasi>`

- [ ] **Step 1: Failing test**

`server/src/daf/jang/jang.service.javob.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JangService } from './jang.service';

jest.mock('../nishon/nishon-berish', () => ({
  grantBadges: jest.fn().mockResolvedValue(['JANG_10']),
}));

const T0 = new Date('2026-10-27T06:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const BOT = Array.from({ length: 6 }, (_, i) => ({ togri: i < 3, ms: 5000 }));

function yasa(jang: Record<string, unknown> | null, o: { javoblar?: { correct: boolean; ms: number }[] } = {}) {
  const prisma = {
    dafBattle: {
      findFirst: jest.fn().mockResolvedValue(jang),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(10),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ correctCount: 4, totalMs: 30_000 }),
    },
    dafBattleQuestion: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ kind: 'TYPE', answer: 'Tschüss', akzeptiert: [] }),
    },
    dafBattleAnswer: {
      create: jest.fn().mockReturnValue('create-op'),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(o.javoblar ?? []),
      findUnique: jest.fn().mockResolvedValue({ correct: true, ms: 4000 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const config = { get: () => 'on' };
  return { prisma, servis: new JangService(prisma as never, config as never) };
}

const ochiqJang = (o: Record<string, unknown> = {}) => ({
  id: 55,
  status: 'OPEN',
  questionIds: [1, 2, 3, 4, 5, 6],
  lastActivityAt: T0,
  opponent: 'BOT',
  ghostBattleId: null,
  botAnswers: BOT,
  _count: { answers: 0 },
  ...o,
});

describe('JangService.javob', () => {
  it("boshqaning jangi — 404", async () => {
    const { servis } = yasa(null);
    await expect(servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000))).rejects.toBeInstanceOf(NotFoundException);
  });
  it("vaqtida to'g'ri javob, vaqt server o'lchagan", async () => {
    const { servis, prisma } = yasa(ochiqJang());
    const r = await servis.javob(10, 55, { pozitsiya: 0, javob: 'tschuess' }, at(4200));
    expect(r).toEqual({ togri: true, togriJavob: 'Tschüss', raqib: { togri: true, ms: 5000 } });
    expect(prisma.dafBattleAnswer.create).toHaveBeenCalledWith({
      data: { battleId: 55, questionId: 1, position: 0, given: 'tschuess', correct: true, ms: 4200 },
    });
  });
  it("12 soniyadan kech — to'g'ri bo'lsa ham xato, ms 10000", async () => {
    const { servis, prisma } = yasa(ochiqJang());
    const r = await servis.javob(10, 55, { pozitsiya: 0, javob: 'Tschüss' }, at(12_500));
    expect(r.togri).toBe(false);
    expect(prisma.dafBattleAnswer.create.mock.calls[0][0].data.ms).toBe(10_000);
  });
  it("60 soniyadan keyin — tashlab ketilgan, 409", async () => {
    const { servis, prisma } = yasa(ochiqJang());
    await expect(servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(61_000))).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.dafBattle.update).toHaveBeenCalledWith({ where: { id: 55 }, data: { status: 'ABANDONED' } });
  });
  it("tartibsiz pozitsiya — 400", async () => {
    const { servis } = yasa(ochiqJang({ _count: { answers: 2 } }));
    await expect(servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000))).rejects.toThrow("tartibi");
  });
  it("ikki marta yuborilgan javob — 409", async () => {
    const { servis, prisma } = yasa(ochiqJang());
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000))).rejects.toBeInstanceOf(ConflictException);
  });
  it('ruh jangi — ruhning shu pozitsiyadagi javobi', async () => {
    const { servis, prisma } = yasa(ochiqJang({ opponent: 'GHOST', ghostBattleId: 900, botAnswers: null }));
    const r = await servis.javob(10, 55, { pozitsiya: 0, javob: 'x' }, at(1000));
    expect(prisma.dafBattleAnswer.findUnique).toHaveBeenCalledWith({
      where: { battleId_position: { battleId: 900, position: 0 } },
      select: { correct: true, ms: true },
    });
    expect(r.raqib).toEqual({ togri: true, ms: 4000 });
  });
});

describe('JangService.yakun', () => {
  const javoblar = [
    ...Array.from({ length: 4 }, () => ({ correct: true, ms: 3000 })),
    ...Array.from({ length: 2 }, () => ({ correct: false, ms: 10_000 })),
  ];
  it("bot bilan: 4 > 3 — g'alaba, nishon beriladi", async () => {
    const { servis, prisma } = yasa(ochiqJang({ _count: { answers: 6 } }), { javoblar });
    const r = await servis.yakun(10, 1, 55, at(40_000));
    expect(r).toEqual({ natija: 'WIN', men: { togri: 4, ms: 32_000 }, raqib: { togri: 3, ms: 30_000 }, yangiNishonlar: ['JANG_10'] });
    expect(prisma.dafBattleAnswer.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(prisma.dafBattle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, status: 'OPEN' } }),
    );
  });
  it('ruh bilan: teng to\'g\'ri, ruh tezroq — mag\'lubiyat', async () => {
    const { servis } = yasa(ochiqJang({ opponent: 'GHOST', ghostBattleId: 900, botAnswers: null, _count: { answers: 6 } }), {
      javoblar: javoblar.map((j) => ({ ...j, ms: j.correct ? 6000 : 10_000 })),
    });
    const r = await servis.yakun(10, 1, 55, at(60_000));
    expect(r.natija).toBe('LOSS');
    expect(r.yangiNishonlar).toEqual([]);
  });
  it('allaqachon tugagan — saqlangan natija, qayta yozilmaydi', async () => {
    const { servis, prisma } = yasa(
      ochiqJang({ status: 'DONE', result: 'DRAW', correctCount: 3, totalMs: 20_000, opponentCorrect: 3, opponentMs: 20_000 }),
    );
    const r = await servis.yakun(10, 1, 55, at(1000));
    expect(r.natija).toBe('DRAW');
    expect(prisma.dafBattle.updateMany).not.toHaveBeenCalled();
  });
  it("yarim qolib 60 s o'tgan — tashlab ketilgan, 409", async () => {
    const { servis } = yasa(ochiqJang({ _count: { answers: 2 } }));
    await expect(servis.yakun(10, 1, 55, at(70_000))).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Fail** — `cd server && npx jest src/daf/jang/jang.service.javob.spec.ts` → FAIL (`servis.javob is not a function`).

- [ ] **Step 3: Kod** — `jang.service.ts` ga qo'shing.

Importlarga:
```ts
import { KECHIKISH_MS, SAVOL_MS, TASHLANGAN_MS, jangNatijasi } from './jang-qoidalari'; // mavjud import ro'yxatiga qo'shing
import { javobTogrimi } from './jang-javob';
import type { BotJavobi } from './dafi-bot';
import { grantBadges } from '../nishon/nishon-berish';
import type { JavobNatijasi, YakunNatijasi } from './jang.types';
```

Klass ichiga:

```ts
  async javob(
    studentId: number,
    jangId: number,
    dto: { pozitsiya: number; javob: string },
    hozir = new Date(),
  ): Promise<JavobNatijasi> {
    const jang = await this.prisma.dafBattle.findFirst({
      where: { id: jangId, studentId },
      select: {
        id: true,
        status: true,
        questionIds: true,
        lastActivityAt: true,
        opponent: true,
        ghostBattleId: true,
        botAnswers: true,
        _count: { select: { answers: true } },
      },
    });
    if (!jang) throw new NotFoundException();
    if (jang.status !== 'OPEN') throw new ConflictException('Jang tugagan');
    const otdi = hozir.getTime() - jang.lastActivityAt.getTime();
    if (otdi > TASHLANGAN_MS) {
      await this.prisma.dafBattle.update({ where: { id: jang.id }, data: { status: 'ABANDONED' } });
      throw new ConflictException('Jang tashlab ketilgan');
    }
    const questionId = jang.questionIds[dto.pozitsiya];
    if (dto.pozitsiya !== jang._count.answers || questionId === undefined) {
      throw new BadRequestException("Savol tartibi noto'g'ri");
    }
    const savol = await this.prisma.dafBattleQuestion.findUniqueOrThrow({
      where: { id: questionId },
      select: { kind: true, answer: true, akzeptiert: true },
    });
    // Vaqtni server o'lchaydi: mijoz vaqtiga ishonilsa, javobni qidirib topib keyin «tez» yuborish mumkin bo'lardi.
    const togri = otdi <= SAVOL_MS + KECHIKISH_MS && javobTogrimi(savol, dto.javob);
    const ms = Math.min(Math.max(otdi, 0), SAVOL_MS);
    try {
      await this.prisma.$transaction([
        this.prisma.dafBattleAnswer.create({
          data: { battleId: jang.id, questionId, position: dto.pozitsiya, given: dto.javob, correct: togri, ms },
        }),
        this.prisma.dafBattle.update({
          where: { id: jang.id },
          data: { lastActivityAt: hozir, correctCount: { increment: togri ? 1 : 0 }, totalMs: { increment: ms } },
        }),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Javob allaqachon yozilgan');
      }
      throw e;
    }
    return { togri, togriJavob: savol.answer, raqib: await this.raqibJavobi(jang, dto.pozitsiya) };
  }

  async yakun(
    studentId: number,
    companyId: number,
    jangId: number,
    hozir = new Date(),
  ): Promise<YakunNatijasi> {
    const jang = await this.prisma.dafBattle.findFirst({
      where: { id: jangId, studentId },
      select: {
        id: true,
        status: true,
        questionIds: true,
        lastActivityAt: true,
        opponent: true,
        ghostBattleId: true,
        botAnswers: true,
        result: true,
        correctCount: true,
        totalMs: true,
        opponentCorrect: true,
        opponentMs: true,
        _count: { select: { answers: true } },
      },
    });
    if (!jang) throw new NotFoundException();
    if (jang.status === 'DONE') {
      return {
        natija: jang.result!,
        men: { togri: jang.correctCount, ms: jang.totalMs },
        raqib: { togri: jang.opponentCorrect, ms: jang.opponentMs },
        yangiNishonlar: [],
      };
    }
    if (
      jang.status === 'ABANDONED' ||
      (jang._count.answers < jang.questionIds.length &&
        hozir.getTime() - jang.lastActivityAt.getTime() > TASHLANGAN_MS)
    ) {
      await this.prisma.dafBattle.update({ where: { id: jang.id }, data: { status: 'ABANDONED' } });
      throw new ConflictException('Jang tashlab ketilgan');
    }
    // Javob berilmagan savollar — vaqti tugagan deb yoziladi, shunda har tugagan jang to'liq ruh bo'ladi.
    await this.prisma.dafBattleAnswer.createMany({
      data: jang.questionIds.map((questionId, position) => ({
        battleId: jang.id,
        questionId,
        position,
        given: '',
        correct: false,
        ms: SAVOL_MS,
      })),
      skipDuplicates: true,
    });
    const javoblar = await this.prisma.dafBattleAnswer.findMany({
      where: { battleId: jang.id },
      select: { correct: true, ms: true },
    });
    const men = {
      togri: javoblar.filter((j) => j.correct).length,
      ms: javoblar.reduce((s, j) => s + j.ms, 0),
    };
    const raqib = await this.raqibJami(jang);
    const natija = jangNatijasi(men, raqib);
    const yozildi = await this.prisma.dafBattle.updateMany({
      where: { id: jang.id, status: 'OPEN' },
      data: {
        status: 'DONE',
        result: natija,
        finishedAt: hozir,
        correctCount: men.togri,
        totalMs: men.ms,
        opponentCorrect: raqib.togri,
        opponentMs: raqib.ms,
      },
    });
    // Parallel `yakun` allaqachon yozgan — uning natijasi qaytariladi, nishon ikki marta berilmaydi.
    if (yozildi.count === 0) return this.yakun(studentId, companyId, jangId, hozir);
    return {
      natija,
      men,
      raqib,
      yangiNishonlar: natija === 'WIN' ? await this.nishonBer(studentId, companyId) : [],
    };
  }

  private async raqibJavobi(
    jang: { opponent: string; ghostBattleId: number | null; botAnswers: Prisma.JsonValue },
    pozitsiya: number,
  ): Promise<{ togri: boolean; ms: number }> {
    if (jang.opponent === 'BOT') {
      const b = (jang.botAnswers as unknown as BotJavobi[])[pozitsiya];
      return { togri: b.togri, ms: b.ms };
    }
    const a = await this.prisma.dafBattleAnswer.findUnique({
      where: { battleId_position: { battleId: jang.ghostBattleId!, position: pozitsiya } },
      select: { correct: true, ms: true },
    });
    return a ? { togri: a.correct, ms: a.ms } : { togri: false, ms: SAVOL_MS };
  }

  private async raqibJami(jang: {
    opponent: string;
    ghostBattleId: number | null;
    botAnswers: Prisma.JsonValue;
  }): Promise<{ togri: number; ms: number }> {
    if (jang.opponent === 'BOT') {
      const b = jang.botAnswers as unknown as BotJavobi[];
      return { togri: b.filter((x) => x.togri).length, ms: b.reduce((s, x) => s + x.ms, 0) };
    }
    const r = await this.prisma.dafBattle.findUniqueOrThrow({
      where: { id: jang.ghostBattleId! },
      select: { correctCount: true, totalMs: true },
    });
    return { togri: r.correctCount, ms: r.totalMs };
  }

  /** Nishon — bezak: xato natijani yiqitmaydi, keyingi g'alabada shart bo'yicha qaytadan beriladi. */
  private async nishonBer(studentId: number, companyId: number): Promise<string[]> {
    try {
      const jangGolib = await this.prisma.dafBattle.count({ where: { studentId, result: 'WIN' } });
      return await grantBadges(this.prisma, studentId, companyId, { serie: 0, woerter: 0, jangGolib });
    } catch (e) {
      this.logger.error(`Jang nishoni berilmadi (student ${studentId}): ${String(e)}`);
      return [];
    }
  }
```

- [ ] **Step 4: Pass**

```bash
cd server && npx jest src/daf/jang src/daf/nishon && npm run build
```
Expected: PASS (shu jumladan `nishon-berish.single-source.spec.ts` — `DafStudentBadge` ga faqat `grantBadges` yozadi).

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/jang/jang.service.ts src/daf/jang/jang.service.javob.spec.ts
git add src/daf/jang
git commit -m "feat(daf-jang): server-timed answers and battle result" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Controller, DTO, modul, ruxsat manifesti

**Files:**
- Create: `server/src/daf/jang/jang.controller.ts`, `server/src/daf/dto/jang.dto.ts`
- Modify: `server/src/daf/daf.module.ts`, `server/src/common/auth/branch-route-policy.ts`
- Test: `server/src/daf/dto/jang.dto.spec.ts`; mavjud manifest testi

**Interfaces:**
- Consumes: `JangService` (Task 6–7).
- Produces: HTTP — `GET /student-portal/lernen/jang/holat`, `POST /student-portal/lernen/jang/boshla`, `POST /student-portal/lernen/jang/:id/javob` (tana `{ pozitsiya: number; javob: string }`), `POST /student-portal/lernen/jang/:id/yakun`.

- [ ] **Step 1: Failing DTO testi**

`server/src/daf/dto/jang.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { JangJavobDto } from './jang.dto';

const xato = (o: object) => validateSync(plainToInstance(JangJavobDto, o)).length > 0;

describe('JangJavobDto', () => {
  it('to\'g\'ri tana', () => expect(xato({ pozitsiya: 0, javob: 'Hallo' })).toBe(false));
  it("bo'sh javob ruxsat (vaqt tugadi)", () => expect(xato({ pozitsiya: 5, javob: '' })).toBe(false));
  it('pozitsiya 0–5', () => {
    expect(xato({ pozitsiya: 6, javob: 'x' })).toBe(true);
    expect(xato({ pozitsiya: -1, javob: 'x' })).toBe(true);
  });
  it('uzun javob rad', () => expect(xato({ pozitsiya: 0, javob: 'x'.repeat(201) })).toBe(true));
});
```

- [ ] **Step 2: Fail** — `cd server && npx jest src/daf/dto/jang.dto.spec.ts` → FAIL.

- [ ] **Step 3: Kod**

`server/src/daf/dto/jang.dto.ts`:

```ts
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { SAVOL_SONI } from '../jang/jang-qoidalari';

/** `POST .../jang/:id/javob` — bo'sh `javob` = vaqt tugadi. */
export class JangJavobDto {
  @IsInt()
  @Min(0)
  @Max(SAVOL_SONI - 1)
  pozitsiya!: number;

  @IsString()
  @MaxLength(200)
  javob!: string;
}
```

`server/src/daf/jang/jang.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { StudentCardGuard } from '../../common/guards';
import { StudentOnly } from '../../common/permissions/access.decorators';
import { JangJavobDto } from '../dto/jang.dto';
import { JangService } from './jang.service';

/**
 * Jang (spec 2026-10-27). `DafPortalController` bilan bir xil himoya:
 * `studentId` faqat tokendan, boshqaning jangi 404.
 */
@Controller('student-portal/lernen/jang')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class JangController {
  constructor(private readonly jang: JangService) {}

  @Get('holat')
  holat(@CurrentUser('studentId') studentId: number) {
    return this.jang.holat(studentId);
  }

  @Post('boshla')
  boshla(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.jang.boshla(studentId, companyId);
  }

  @Post(':id/javob')
  javob(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: JangJavobDto,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.jang.javob(studentId, id, dto);
  }

  @Post(':id/yakun')
  yakun(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.jang.yakun(studentId, companyId, id);
  }
}
```

`daf.module.ts`: `controllers` ga `JangController`, `providers` ga `JangService` (importlar bilan). `ConfigModule` global ekanini tekshiring: `grep -n "isGlobal" src/app.module.ts` — global bo'lmasa `imports: [ConfigModule]` qo'shing.

`branch-route-policy.ts`: `'GET /student-portal/lernen/profil/:id'` turgan `SELF` yozuvidan keyin yangi yozuv:

```ts
  {
    policy: 'SELF',
    reason:
      "Battle (spec 2026-10-27): keyed on `@CurrentUser('studentId')`; the DTO has no " +
      '`studentId`, and a battle id owned by another student is 404. The ghost opponent ' +
      'is drawn centre-wide on purpose — same CEO decision as the centre ranking ' +
      '(06.09 §6.1) — and only a first name, last-name initial, photo and win count ' +
      'are returned. The battle row stamps `companyId` from the token at creation.',
    routes: [
      'GET /student-portal/lernen/jang/holat',
      'POST /student-portal/lernen/jang/boshla',
      'POST /student-portal/lernen/jang/:id/javob',
      'POST /student-portal/lernen/jang/:id/yakun',
    ],
  },
```

- [ ] **Step 4: Pass**

```bash
cd server && npx jest src/daf/dto/jang.dto.spec.ts src/common/auth && npm run build
```
Expected: PASS — manifest testi yangi 4 marshrutni topadi (agar `src/common/auth` da bo'lmasa: `grep -rln "branch-route-policy" src --include='*.spec.ts'` bilan topib ishga tushiring).

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/daf/jang/jang.controller.ts src/daf/dto/jang.dto.ts src/daf/dto/jang.dto.spec.ts src/daf/daf.module.ts src/common/auth/branch-route-policy.ts
git add src/daf src/common/auth/branch-route-policy.ts
git commit -m "feat(daf-jang): battle endpoints under student portal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Jang savollari kontenti — format, tekshiruv, seed, u01–u06

**Files:**
- Create: `server/src/daf/jang/jang-savollari.validate.ts`, `server/src/daf/jang/jang-savollari.validate.spec.ts`, `server/src/daf/jang/jang-savollari.file.spec.ts`
- Create: `server/scripts/daf-jang-seed.ts`; `server/package.json` ga `"daf:jang-seed": "ts-node scripts/daf-jang-seed.ts"`
- Create: `server/content/daf/jang/a1-u01.json` … `a1-u06.json`

**Interfaces:**
- Consumes: `eshitish-uzunligi.json` (Task 0), `DafBattleQuestion` (Task 1).
- Produces: fayl formati

```ts
export interface JangSavolFayli {
  level: 'A1';
  order: number;            // DafUnit (level, order)
  tasdiqlangan: boolean;    // true → hammasi APPROVED; CEO ko'rigidan keyin qo'lda o'zgartiriladi
  savollar: Array<{
    id: string;             // `jang-a1-u01-001` — sourceId, o'zgarmaydi
    kind: 'CHOOSE' | 'TYPE' | 'LISTEN';
    prompt: string;         // o'zbekcha (lotin) yoki nemischa bo'sh joyli gap
    options?: string[];     // CHOOSE/LISTEN: 3–4 ta, `answer` ichida
    answer: string;
    akzeptiert?: string[];  // TYPE uchun qo'shimcha to'g'ri yozuvlar
    lexeme?: string;        // LISTEN: DafLexeme.sourceId, eshitish-uzunligi.json da bo'lishi shart
  }>;
}
export function jangFayliXatolari(f: JangSavolFayli, eshitish: Record<string, number>): string[]
```

- [ ] **Step 1: Failing validator testi**

`jang-savollari.validate.spec.ts`:

```ts
import { jangFayliXatolari, type JangSavolFayli } from './jang-savollari.validate';

const choose = (i: number) => ({
  id: `jang-a1-u01-${String(i).padStart(3, '0')}`,
  kind: 'CHOOSE' as const,
  prompt: '«Xayr» nemischa?',
  options: ['Tschüss', 'Hallo', 'Danke'],
  answer: 'Tschüss',
});
const fayl = (savollar: JangSavolFayli['savollar']): JangSavolFayli => ({
  level: 'A1',
  order: 1,
  tasdiqlangan: false,
  savollar,
});
const yaxshi = () =>
  fayl([
    ...Array.from({ length: 16 }, (_, i) => choose(i + 1)),
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `jang-a1-u01-${String(i + 17).padStart(3, '0')}`,
      kind: 'TYPE' as const,
      prompt: 'Guten ___! (ertalab)',
      answer: 'Morgen',
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `jang-a1-u01-${String(i + 29).padStart(3, '0')}`,
      kind: 'LISTEN' as const,
      prompt: 'Qaysi so\'zni eshitdingiz?',
      options: ['Hallo', 'Tschüss', 'Danke'],
      answer: 'Hallo',
      lexeme: 'u01-s1-hallo',
    })),
  ]);
const ESH = { 'u01-s1-hallo': 900 };

describe('jangFayliXatolari', () => {
  it("yaxshi fayl — xato yo'q", () => expect(jangFayliXatolari(yaxshi(), ESH)).toEqual([]));
  it('30 tadan kam savol', () => {
    const f = yaxshi();
    f.savollar = f.savollar.slice(0, 20);
    expect(jangFayliXatolari(f, ESH).join()).toContain('30–40');
  });
  it('takror id', () => {
    const f = yaxshi();
    f.savollar[1].id = f.savollar[0].id;
    expect(jangFayliXatolari(f, ESH).join()).toContain('takror');
  });
  it("javob variantlar ichida yo'q", () => {
    const f = yaxshi();
    f.savollar[0].options = ['Hallo', 'Danke', 'Bitte'];
    expect(jangFayliXatolari(f, ESH).join()).toContain('variant');
  });
  it("eshitish so'zi uzun yoki yo'q", () => {
    expect(jangFayliXatolari(yaxshi(), {}).join()).toContain('3000');
  });
  it('id shakli unit bilan mos', () => {
    const f = yaxshi();
    f.savollar[0].id = 'jang-a1-u02-001';
    expect(jangFayliXatolari(f, ESH).join()).toContain('id');
  });
});
```

- [ ] **Step 2: Fail** — `cd server && npx jest src/daf/jang/jang-savollari.validate.spec.ts` → FAIL.

- [ ] **Step 3: Validator**

`jang-savollari.validate.ts`:

```ts
/**
 * `content/daf/jang/*.json` tekshiruvi (spec §4). Seed ham, fayl testi ham
 * shuni chaqiradi — xato fayl bazaga tushmaydi.
 */
export interface JangSavolFayli {
  level: 'A1';
  order: number;
  tasdiqlangan: boolean;
  savollar: Array<{
    id: string;
    kind: 'CHOOSE' | 'TYPE' | 'LISTEN';
    prompt: string;
    options?: string[];
    answer: string;
    akzeptiert?: string[];
    lexeme?: string;
  }>;
}

const MIN = 30;
const MAX = 40;

export function jangFayliXatolari(f: JangSavolFayli, eshitish: Record<string, number>): string[] {
  const x: string[] = [];
  const n = f.savollar.length;
  if (n < MIN || n > MAX) x.push(`savollar soni ${n}, kerak ${MIN}–${MAX}`);
  const prefiks = `jang-${f.level.toLowerCase()}-u${String(f.order).padStart(2, '0')}-`;
  const idlar = new Set<string>();
  let choose = 0;
  let listen = 0;
  for (const s of f.savollar) {
    if (!s.id.startsWith(prefiks) || !/-\d{3}$/.test(s.id)) x.push(`${s.id}: id ${prefiks}NNN shaklida emas`);
    if (idlar.has(s.id)) x.push(`${s.id}: takror id`);
    idlar.add(s.id);
    if (!s.prompt.trim() || !s.answer.trim()) x.push(`${s.id}: bo'sh savol yoki javob`);
    if (s.kind === 'TYPE') {
      if (s.options?.length) x.push(`${s.id}: yozish savolida variant bo'lmaydi`);
      if (/\s/.test(s.answer.trim())) x.push(`${s.id}: yozish javobi bitta so'z bo'lsin`);
    } else {
      const o = s.options ?? [];
      if (o.length < 3 || o.length > 4 || new Set(o).size !== o.length) x.push(`${s.id}: 3–4 ta har xil variant kerak`);
      if (!o.includes(s.answer)) x.push(`${s.id}: javob variantlar ichida yo'q`);
      if (s.kind === 'CHOOSE') choose += 1;
    }
    if (s.kind === 'LISTEN') {
      listen += 1;
      if (!s.lexeme || !(s.lexeme in eshitish)) x.push(`${s.id}: eshitish so'zi ≤3000 ms ro'yxatida yo'q`);
    }
  }
  if (n && choose / n < 0.4) x.push(`tanlash ulushi ${Math.round((choose / n) * 100)}%, kamida 40%`);
  if (n && listen / n > 0.2) x.push(`eshitish ulushi ${Math.round((listen / n) * 100)}%, ko'pi 20%`);
  return x;
}
```

- [ ] **Step 4: Validator testi PASS** — `cd server && npx jest src/daf/jang/jang-savollari.validate.spec.ts`.

- [ ] **Step 5: Kontentni yozing (u01–u06)**

Har unit uchun `server/content/daf/jang/a1-u0N.json`, `tasdiqlangan: false`, 35 savol: ~18 CHOOSE, ~12 TYPE, ~5 LISTEN.

Manba — FAQAT shu unitning materiali:
```bash
cd server && node -e "const u=require('./content/daf/a1-units.json').units; console.log(JSON.stringify(u.slice(0,6),null,1))"
ls content/daf/a1
```
So'z, ibora va grammatika shu unit bo'limlari (`sections`) va `grammar` dan olinadi; eshitish uchun `lexeme` faqat `content/daf/jang/eshitish-uzunligi.json` dagi va shu unit prefiksli (`u0N-`) kalitlardan.

Qoidalar: savol matni o'zbekcha lotin, qisqa (≤ 60 belgi), 10 soniyada o'qiladi; TYPE javobi bitta nemischa so'z, gapdagi bo'sh joy `___`; CHOOSE chalg'ituvchilari shu unit so'zlari; xuddi bir savol ikki marta yo'q. Mashqlardagi to'g'ri javobni jazolamaslik qoidasi: TYPE da bir nechta to'g'ri yozuv bo'lsa `akzeptiert` ga qo'shing.

- [ ] **Step 6: Fayl testi**

`jang-savollari.file.spec.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { jangFayliXatolari, type JangSavolFayli } from './jang-savollari.validate';

const DIR = join(__dirname, '..', '..', '..', 'content', 'daf', 'jang');
const eshitish = JSON.parse(readFileSync(join(DIR, 'eshitish-uzunligi.json'), 'utf8')) as Record<string, number>;
const fayllar = readdirSync(DIR).filter((f) => /^a1-u\d{2}\.json$/.test(f));

describe('content/daf/jang', () => {
  it('kamida u01–u06 bor', () => expect(fayllar.length).toBeGreaterThanOrEqual(6));
  it.each(fayllar)('%s xatosiz', (f) => {
    const fayl = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as JangSavolFayli;
    expect(jangFayliXatolari(fayl, eshitish)).toEqual([]);
  });
  it("id lar fayllar orasida ham takrorlanmaydi", () => {
    const ids = fayllar.flatMap((f) => (JSON.parse(readFileSync(join(DIR, f), 'utf8')) as JangSavolFayli).savollar.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

Run: `cd server && npx jest src/daf/jang/jang-savollari` → PASS.

- [ ] **Step 7: Seed skripti**

`server/scripts/daf-jang-seed.ts`:

```ts
/**
 * `content/daf/jang/*.json` → `DafBattleQuestion` (spec §4).
 *
 * Holat fayldan: `tasdiqlangan: true` → APPROVED, aks holda DRAFT. Fayldan
 * olib tashlangan savol o'chirilmaydi (eski jang javoblari unga bog'liq),
 * DRAFT qilinadi — jangga boshqa tushmaydi.
 *
 * `npm run daf:jang-seed` (dev) yoki `railway run npx ts-node --transpile-only scripts/daf-jang-seed.ts` (prod).
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { run } from './lib/check-cli';
import { jangFayliXatolari, type JangSavolFayli } from '../src/daf/jang/jang-savollari.validate';

const DIR = join(__dirname, '..', 'content', 'daf', 'jang');

void run(async (prisma) => {
  const eshitish = JSON.parse(readFileSync(join(DIR, 'eshitish-uzunligi.json'), 'utf8')) as Record<string, number>;
  const fayllar = readdirSync(DIR).filter((f) => /^a1-u\d{2}\.json$/.test(f)).sort();
  for (const nom of fayllar) {
    const f = JSON.parse(readFileSync(join(DIR, nom), 'utf8')) as JangSavolFayli;
    const xatolar = jangFayliXatolari(f, eshitish);
    if (xatolar.length) throw new Error(`${nom}:\n${xatolar.join('\n')}`);
    const unit = await prisma.dafUnit.findUniqueOrThrow({
      where: { level_order: { level: f.level, order: f.order } },
      select: { id: true },
    });
    const lexemeIds = f.savollar.flatMap((s) => (s.lexeme ? [s.lexeme] : []));
    const lexemes = new Map(
      (
        await prisma.dafLexeme.findMany({
          where: { sourceId: { in: lexemeIds } },
          select: { sourceId: true, audioKey: true, audioStartMs: true, audioEndMs: true },
        })
      ).map((l) => [l.sourceId, l]),
    );
    const status = f.tasdiqlangan ? 'APPROVED' : 'DRAFT';
    await prisma.$transaction(async (tx) => {
      for (const s of f.savollar) {
        const l = s.lexeme ? lexemes.get(s.lexeme) : undefined;
        if (s.kind === 'LISTEN' && !l?.audioKey) throw new Error(`${s.id}: ${s.lexeme} ovozi bazada yo'q`);
        const data = {
          unitId: unit.id,
          kind: s.kind,
          prompt: s.prompt,
          options: s.options ?? [],
          answer: s.answer,
          akzeptiert: s.akzeptiert ?? [],
          audioKey: l?.audioKey ?? null,
          audioStartMs: l?.audioStartMs ?? null,
          audioEndMs: l?.audioEndMs ?? null,
          status,
        } as const;
        await tx.dafBattleQuestion.upsert({ where: { sourceId: s.id }, create: { sourceId: s.id, ...data }, update: data });
      }
      await tx.dafBattleQuestion.updateMany({
        where: { unitId: unit.id, sourceId: { notIn: f.savollar.map((s) => s.id) } },
        data: { status: 'DRAFT' },
      });
    });
    console.log(`${nom}: ${f.savollar.length} savol, ${status}`);
  }
});
```

Run (dev): `cd server && npm run daf:jang-seed` → har fayl uchun `a1-u0N.json: 35 savol, DRAFT`.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/daf/jang/jang-savollari.*.ts src/daf/jang/jang-savollari.validate.ts scripts/daf-jang-seed.ts
git add src/daf/jang content/daf/jang scripts/daf-jang-seed.ts package.json
git commit -m "feat(daf-jang): battle question files for A1 u01-u06 with validator and seed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**CEO ko'rigi** (bu vazifadan keyin, kod kutmaydi): savollar CEO'ga o'qiladigan jadval ko'rinishida ko'rsatiladi; tasdiqlangan unit faylida `tasdiqlangan: true` qilinib alohida commit qilinadi.

---

### Task 10: Mijoz — turlar, so'rovlar, jang reduceri

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts`, `client/src/components/student-portal/lernen/queries.ts`
- Create: `client/src/components/student-portal/lernen/jang/jang-holati.ts`
- Test: `client/src/components/student-portal/lernen/jang/jang-holati.test.ts`

**Interfaces:**
- Consumes: server API (Task 8), `jang.types.ts` shakllari (Task 6).
- Produces:
  - `types.ts`: `JangHolati`, `JangRaqibi`, `JangSavoli`, `JangBoshlandi`, `JangJavobNatijasi`, `JangYakuni` (server `jang.types.ts` bilan maydonma-maydon bir xil; `JavobNatijasi` → `JangJavobNatijasi`, `YakunNatijasi` → `JangYakuni`).
  - `queries.ts`: `useJangHolati()`, `useJangBoshla()`, `useJangJavob()`, `useJangYakun()`.
  - `jang-holati.ts`: `type JangBosqichi`, `type JangHarakati`, `jangReducer(h: JangBosqichi | null, a: JangHarakati): JangBosqichi | null`, `JAVOB_KORISH_MS = 1500`, `SAVOL_MS = 10_000`.

- [ ] **Step 1: Failing test**

`jang-holati.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { jangReducer, type JangBosqichi } from "./jang-holati";
import type { JangBoshlandi } from "../types";

const jang: JangBoshlandi = {
  jangId: 1,
  kirishMs: 3000,
  raqib: { tur: "BOT", studentId: null, ism: "Dafi bot", rasm: null, golibSoni: null },
  savollar: [0, 1].map((pozitsiya) => ({ pozitsiya, kind: "CHOOSE" as const, prompt: "?", options: ["a", "b", "c"], audio: null })),
};
const natija = (togri: boolean, raqib: boolean) => ({ togri, togriJavob: "a", raqib: { togri: raqib, ms: 4000 } });

describe("jangReducer", () => {
  it("to'liq yo'l: kirish → savol → javob → savol → javob → tugadi", () => {
    let h: JangBosqichi | null = jangReducer(null, { tur: "boshlandi", jang });
    expect(h?.tur).toBe("kirish");
    h = jangReducer(h, { tur: "kirish-tugadi" });
    expect(h).toMatchObject({ tur: "savol", pozitsiya: 0, hisob: { men: 0, raqib: 0 } });
    h = jangReducer(h, { tur: "javob-keldi", natija: natija(true, false), berilgan: "a" });
    expect(h).toMatchObject({ tur: "javob", hisob: { men: 1, raqib: 0 } });
    h = jangReducer(h, { tur: "keyingi" });
    expect(h).toMatchObject({ tur: "savol", pozitsiya: 1 });
    h = jangReducer(h, { tur: "javob-keldi", natija: natija(false, true), berilgan: "" });
    h = jangReducer(h, { tur: "keyingi" });
    expect(h).toMatchObject({ tur: "tugadi", hisob: { men: 1, raqib: 1 } });
  });
  it("noto'g'ri bosqichdagi harakat e'tiborsiz", () => {
    const h = jangReducer(null, { tur: "boshlandi", jang });
    expect(jangReducer(h, { tur: "keyingi" })).toBe(h);
  });
});
```

- [ ] **Step 2: Fail** — `cd client && npx vitest run src/components/student-portal/lernen/jang/jang-holati.test.ts` → FAIL.

- [ ] **Step 3: Kod**

`types.ts` oxiriga:

```ts
/** Jang (spec 2026-10-27) — server `daf/jang/jang.types.ts` bilan bir xil shakl. */
export type JangSavolTuri = "CHOOSE" | "TYPE" | "LISTEN";
export interface JangHolati { yoqilgan: boolean; ochiq: boolean; bugunQoldi: number; golibSoni: number; seriya: number }
export interface JangRaqibi { tur: "GHOST" | "BOT"; studentId: number | null; ism: string; rasm: string | null; golibSoni: number | null }
export interface JangSavoli { pozitsiya: number; kind: JangSavolTuri; prompt: string; options: string[]; audio: { url: string; startMs: number | null; endMs: number | null } | null }
export interface JangBoshlandi { jangId: number; kirishMs: number; raqib: JangRaqibi; savollar: JangSavoli[] }
export interface JangJavobNatijasi { togri: boolean; togriJavob: string; raqib: { togri: boolean; ms: number } }
export interface JangYakuni { natija: "WIN" | "LOSS" | "DRAW"; men: { togri: number; ms: number }; raqib: { togri: number; ms: number }; yangiNishonlar: string[] }
```

`queries.ts` — importga 4 turni qo'shing, fayl oxiriga:

```ts
const JANG_HOLATI = ["lernen", "jang", "holat"] as const;

export function useJangHolati() {
  return useQuery<JangHolati>({
    queryKey: JANG_HOLATI,
    queryFn: () => api.get(`${BASE}/jang/holat`).then((r) => r.data),
  });
}

export function useJangBoshla() {
  return useMutation({
    mutationFn: () => api.post<JangBoshlandi>(`${BASE}/jang/boshla`).then((r) => r.data),
  });
}

export function useJangJavob() {
  return useMutation({
    mutationFn: (v: { jangId: number; pozitsiya: number; javob: string }) =>
      api
        .post<JangJavobNatijasi>(`${BASE}/jang/${v.jangId}/javob`, { pozitsiya: v.pozitsiya, javob: v.javob })
        .then((r) => r.data),
  });
}

export function useJangYakun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jangId: number) => api.post<JangYakuni>(`${BASE}/jang/${jangId}/yakun`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: JANG_HOLATI });
      void qc.invalidateQueries({ queryKey: ["lernen", "nishonlar"] });
    },
  });
}
```

`jang/jang-holati.ts`:

```ts
import type { JangBoshlandi, JangJavobNatijasi } from "../types";

/** Server `SAVOL_MS` bilan bir xil — taymer faqat ko'rsatish uchun, vaqtni server o'lchaydi. */
export const SAVOL_MS = 10_000;
export const JAVOB_KORISH_MS = 1500;

interface Hisob {
  men: number;
  raqib: number;
}

export type JangBosqichi =
  | { tur: "kirish"; jang: JangBoshlandi }
  | { tur: "savol"; jang: JangBoshlandi; pozitsiya: number; hisob: Hisob }
  | { tur: "javob"; jang: JangBoshlandi; pozitsiya: number; hisob: Hisob; natija: JangJavobNatijasi; berilgan: string }
  | { tur: "tugadi"; jang: JangBoshlandi; hisob: Hisob };

export type JangHarakati =
  | { tur: "boshlandi"; jang: JangBoshlandi }
  | { tur: "kirish-tugadi" }
  | { tur: "javob-keldi"; natija: JangJavobNatijasi; berilgan: string }
  | { tur: "keyingi" };

/** Bosqichga mos kelmagan harakat (masalan, kech kelgan taymer) holatni o'zgartirmaydi. */
export function jangReducer(h: JangBosqichi | null, a: JangHarakati): JangBosqichi | null {
  if (a.tur === "boshlandi") return { tur: "kirish", jang: a.jang };
  if (!h) return h;
  if (a.tur === "kirish-tugadi" && h.tur === "kirish") {
    return { tur: "savol", jang: h.jang, pozitsiya: 0, hisob: { men: 0, raqib: 0 } };
  }
  if (a.tur === "javob-keldi" && h.tur === "savol") {
    return {
      ...h,
      tur: "javob",
      natija: a.natija,
      berilgan: a.berilgan,
      hisob: {
        men: h.hisob.men + (a.natija.togri ? 1 : 0),
        raqib: h.hisob.raqib + (a.natija.raqib.togri ? 1 : 0),
      },
    };
  }
  if (a.tur === "keyingi" && h.tur === "javob") {
    const p = h.pozitsiya + 1;
    return p < h.jang.savollar.length
      ? { tur: "savol", jang: h.jang, pozitsiya: p, hisob: h.hisob }
      : { tur: "tugadi", jang: h.jang, hisob: h.hisob };
  }
  return h;
}
```

- [ ] **Step 4: Pass**

```bash
cd client && npx vitest run src/components/student-portal/lernen/jang/jang-holati.test.ts && npx tsc --noEmit -p .
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/student-portal/lernen/types.ts client/src/components/student-portal/lernen/queries.ts client/src/components/student-portal/lernen/jang
git commit -m "feat(daf-jang): client types, queries and battle state reducer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Mijoz — kirish kartasi, jang ekrani, sahifa

**Files:**
- Create: `client/src/components/student-portal/lernen/jang/jang-karta.tsx`, `jang-ekrani.tsx`, `savol-korinishi.tsx`
- Create: `client/src/app/(student-portal)/portal/lernen/jang/page.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-levels-page.tsx` (`<RadioCard />` dan keyin `<JangKarta />`)
- Modify: `client/src/i18n/dictionaries/{en,de,ru}.ts`

**Interfaces:**
- Consumes: Task 10 hook'lari va reducer; Lumio (`Screen`, `StackHeader`, `Card`, `Avatar`, `Button`, `Input`, `LoadingCards` — `../../lumio`); `useClipPlayer` (`../use-clip-player`); `nishonNomi` (`../nishon`); `useT` (`@/i18n/use-t`).
- Produces: `/portal/lernen/jang` sahifasi; `JangKarta` komponenti.

- [ ] **Step 1: `savol-korinishi.tsx`**

```tsx
"use client";

import * as React from "react";
import { SpeakerHigh } from "@phosphor-icons/react";
import { Button, Input } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useClipPlayer } from "../use-clip-player";
import type { JangSavoli } from "../types";

/**
 * Bitta jang savoli. `bloklangan` — javob yuborilgan, natija kutilmoqda.
 * Ota komponent `key={pozitsiya}` beradi: har savol yangi holat bilan ochiladi
 * (effect ichida `setState` bilan tozalash shart emas).
 */
export function SavolKorinishi({
  savol,
  bloklangan,
  onJavob,
}: {
  savol: JangSavoli;
  bloklangan: boolean;
  onJavob: (javob: string) => void;
}) {
  const t = useT();
  const [matn, setMatn] = React.useState("");
  const play = useClipPlayer(savol.audio);

  React.useEffect(() => {
    if (savol.kind === "LISTEN") play();
    // Faqat savol ochilganda bir marta o'ynaydi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <p className="font-display text-xl font-extrabold text-ink-900">{savol.prompt}</p>
      {savol.kind === "LISTEN" ? (
        <Button variant="secondary" onClick={play} aria-label={t("Qayta eshitish")}>
          <SpeakerHigh size={22} weight="bold" />
        </Button>
      ) : null}
      {savol.kind === "TYPE" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (matn.trim()) onJavob(matn.trim());
          }}
        >
          <Input
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={matn}
            onChange={(e) => setMatn(e.target.value)}
            disabled={bloklangan}
            aria-label={t("Javob")}
          />
          <Button type="submit" block disabled={bloklangan || !matn.trim()}>
            {t("Tekshirish")}
          </Button>
        </form>
      ) : (
        <div className="grid gap-3">
          {savol.options.map((o) => (
            <Button key={o} variant="secondary" block disabled={bloklangan} onClick={() => onJavob(o)}>
              {o}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

(`Input` va `Button` prop nomlarini `lumio/input.tsx`, `lumio/button.tsx` dan tasdiqlang; farq bo'lsa shu fayllardagi nomni ishlating.)

- [ ] **Step 2: `jang-ekrani.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Button, Card, Screen, StackHeader } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useJangBoshla, useJangJavob, useJangYakun } from "../queries";
import { nishonNomi } from "../nishon";
import { JAVOB_KORISH_MS, SAVOL_MS, jangReducer } from "./jang-holati";
import { SavolKorinishi } from "./savol-korinishi";
import type { JangRaqibi } from "../types";

function RaqibKartasi({ raqib }: { raqib: JangRaqibi }) {
  const t = useT();
  const ism = raqib.tur === "BOT" ? t("Dafi bot") : raqib.ism;
  return (
    <Card className="flex items-center gap-3">
      <Avatar src={raqib.rasm} name={ism} size={48} />
      <div>
        <p className="font-display font-extrabold text-ink-900">{ism}</p>
        {raqib.golibSoni !== null ? (
          <p className="text-sm text-ink-500">{t("{n} ta g'alaba", { n: raqib.golibSoni })}</p>
        ) : null}
      </div>
    </Card>
  );
}

export function JangEkrani() {
  const t = useT();
  const [h, dispatch] = React.useReducer(jangReducer, null);
  const boshla = useJangBoshla();
  const javob = useJangJavob();
  const yakun = useJangYakun();

  // Kirish ekrani → birinchi savol.
  React.useEffect(() => {
    if (h?.tur !== "kirish") return;
    const id = setTimeout(() => dispatch({ tur: "kirish-tugadi" }), h.jang.kirishMs);
    return () => clearTimeout(id);
  }, [h]);

  const yubor = React.useCallback(
    (berilgan: string) => {
      if (h?.tur !== "savol" || javob.isPending) return;
      javob.mutate(
        { jangId: h.jang.jangId, pozitsiya: h.pozitsiya, javob: berilgan },
        { onSuccess: (natija) => dispatch({ tur: "javob-keldi", natija, berilgan }) },
      );
    },
    [h, javob],
  );

  // `yubor` har render yangilanadi (mutation obyekti o'zgaradi); taymer esa faqat
  // yangi savolda qayta boshlanishi kerak — shuning uchun ref orqali.
  const yuborRef = React.useRef(yubor);
  React.useEffect(() => {
    yuborRef.current = yubor;
  });

  // 10 soniya taymer: vaqt tugasa bo'sh javob yuboriladi (server baribir o'zi o'lchaydi).
  React.useEffect(() => {
    if (h?.tur !== "savol") return;
    const id = setTimeout(() => yuborRef.current(""), SAVOL_MS);
    return () => clearTimeout(id);
  }, [h]);

  React.useEffect(() => {
    if (h?.tur !== "javob") return;
    const id = setTimeout(() => dispatch({ tur: "keyingi" }), JAVOB_KORISH_MS);
    return () => clearTimeout(id);
  }, [h]);

  React.useEffect(() => {
    if (h?.tur === "tugadi" && yakun.isIdle) yakun.mutate(h.jang.jangId);
  }, [h, yakun]);

  const boshlash = () => {
    yakun.reset();
    boshla.mutate(undefined, { onSuccess: (jang) => dispatch({ tur: "boshlandi", jang }) });
  };

  return (
    <Screen narrow>
      <StackHeader title={t("Jang")} backHref="/portal/lernen" />
      {!h ? (
        <Card className="space-y-3 text-center">
          <p className="text-ink-700">{t("6 savol, har biriga 10 soniya")}</p>
          <Button block onClick={boshlash} disabled={boshla.isPending}>
            {t("Jangni boshlash")}
          </Button>
          {boshla.isError ? <p className="text-sm text-danger">{t("Jangni boshlab bo'lmadi")}</p> : null}
        </Card>
      ) : h.tur === "kirish" ? (
        <div className="space-y-3 text-center">
          <p className="text-ink-500">{t("Raqibingiz")}</p>
          <RaqibKartasi raqib={h.jang.raqib} />
        </div>
      ) : h.tur === "savol" || h.tur === "javob" ? (
        <div className="space-y-4">
          <p className="text-center font-display font-extrabold text-ink-700">
            {t("{n}-savol", { n: h.pozitsiya + 1 })} · {h.hisob.men} : {h.hisob.raqib}
          </p>
          <SavolKorinishi
            key={h.pozitsiya}
            savol={h.jang.savollar[h.pozitsiya]}
            bloklangan={h.tur === "javob" || javob.isPending}
            onJavob={yubor}
          />
          {h.tur === "javob" ? (
            <Card className="text-center">
              <p className="font-display font-extrabold">{h.natija.togri ? t("To'g'ri") : t("Xato")}</p>
              {!h.natija.togri ? <p className="text-ink-700">{h.natija.togriJavob}</p> : null}
              <p className="text-sm text-ink-500">
                {h.natija.raqib.togri ? t("Raqib to'g'ri topdi") : t("Raqib xato qildi")}
              </p>
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 text-center">
          {yakun.data ? (
            <>
              <p className="font-display text-2xl font-extrabold text-ink-900">
                {yakun.data.natija === "WIN" ? t("G'alaba!") : yakun.data.natija === "LOSS" ? t("Mag'lubiyat") : t("Durang")}
              </p>
              <p className="text-ink-700">
                {yakun.data.men.togri} : {yakun.data.raqib.togri}
              </p>
              {yakun.data.yangiNishonlar.map((k) => (
                <p key={k} className="font-semibold">{t("Yangi nishon: {name}", { name: nishonNomi(k, t) })}</p>
              ))}
              {h.jang.raqib.tur === "GHOST" && h.jang.raqib.studentId ? (
                <Link href={`/portal/lernen/reyting/${h.jang.raqib.studentId}`}>
                  <RaqibKartasi raqib={h.jang.raqib} />
                </Link>
              ) : (
                <RaqibKartasi raqib={h.jang.raqib} />
              )}
              <Button block onClick={boshlash} disabled={boshla.isPending}>
                {t("Yana jang")}
              </Button>
              {boshla.isError ? <p className="text-sm text-danger">{t("Bugungi janglar tugadi")}</p> : null}
            </>
          ) : (
            <p className="text-ink-500">{t("Natija hisoblanmoqda…")}</p>
          )}
        </div>
      )}
    </Screen>
  );
}
```

- [ ] **Step 3: `jang-karta.tsx` va sahifa**

```tsx
"use client";

import Link from "next/link";
import { Sword } from "@phosphor-icons/react";
import { Card } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useJangHolati } from "../queries";

/** Ta'lim sahifasidagi jang kirishi. `DAF_JANG` o'chiq bo'lsa umuman ko'rinmaydi. */
export function JangKarta() {
  const t = useT();
  const { data } = useJangHolati();
  if (!data?.yoqilgan) return null;
  if (!data.ochiq) {
    return (
      <Card className="flex items-center gap-3 opacity-70">
        <Sword size={28} weight="bold" />
        <p className="text-ink-700">{t("Jang: avval birinchi unitni tugating")}</p>
      </Card>
    );
  }
  const ichi = (
    <Card className="flex items-center gap-3">
      <Sword size={28} weight="bold" />
      <div className="flex-1">
        <p className="font-display font-extrabold text-ink-900">{t("Jang")}</p>
        <p className="text-sm text-ink-500">
          {t("{n} ta g'alaba", { n: data.golibSoni })} · {t("Seriya: {n}", { n: data.seriya })}
        </p>
      </div>
      <p className="text-sm font-semibold text-ink-700">
        {data.bugunQoldi > 0 ? t("Bugun {n} ta qoldi", { n: data.bugunQoldi }) : t("Bugungi janglar tugadi")}
      </p>
    </Card>
  );
  return data.bugunQoldi > 0 ? <Link href="/portal/lernen/jang">{ichi}</Link> : ichi;
}
```

`client/src/app/(student-portal)/portal/lernen/jang/page.tsx`:

```tsx
import { JangEkrani } from "@/components/student-portal/lernen/jang/jang-ekrani";

export default function Page() {
  return <JangEkrani />;
}
```

`lernen-levels-page.tsx`: `import { JangKarta } from "./jang/jang-karta";` va `<RadioCard />` dan keyingi qatorga `<JangKarta />`.

(`Sword` ikonkasi `@phosphor-icons/react` da borligini `grep -rn "Sword" node_modules/@phosphor-icons/react/dist/index.d.ts | head -1` bilan tekshiring; yo'q bo'lsa `Lightning` ishlating.)

- [ ] **Step 4: i18n**

Yangi matnlarni `en.ts`, `de.ts`, `ru.ts` ga qo'shing: «Jang», «Dafi bot», «Raqibingiz», «Jangni boshlash», «Jangni boshlab bo'lmadi», «6 savol, har biriga 10 soniya», «{n}-savol», «Qayta eshitish», «Javob», «Tekshirish» (bor bo'lsa qo'shmang), «To'g'ri», «Xato», «Raqib to'g'ri topdi», «Raqib xato qildi», «G'alaba!», «Mag'lubiyat», «Durang», «Yana jang», «Natija hisoblanmoqda…», «Bugungi janglar tugadi», «Bugun {n} ta qoldi», «{n} ta g'alaba», «Seriya: {n}», «Jang: avval birinchi unitni tugating». Har birini avval `grep -n '"<matn>"' client/src/i18n/dictionaries/en.ts` bilan tekshiring — borini takrorlamang.

- [ ] **Step 5: Tekshiruv**

```bash
cd client && npx tsc --noEmit -p . && npx vitest run src/i18n src/components/student-portal/lernen && npm run lint 2>&1 | tail -20
```
Expected: hammasi PASS, lint'da yangi fayllar bo'yicha xato yo'q.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(daf-jang): battle entry card and battle screen in student portal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Yuklama, brauzerda tekshirish, ADR

**Files:**
- Create: `server/scripts/_probe-jang-yuklama.ts` (vaqtinchalik, commit QILINMAYDI)
- Create: `docs/adr/NNNN-jang-asinxron-ruh.md`; Modify: `docs/adr/README.md`

- [ ] **Step 1: Yuklama (lokal throwaway DB)**

Musobaqa S1 dagi lokal `daf_s1_yuklama` bazasidan foydalaning (docker `daf-postgres`, 12 000 o'quvchi). Skript: 500 ta tasodifiy o'quvchi uchun `JangService.boshla` ni parallel (50 tadan) chaqiradi, har chaqiruv vaqtini yozadi va p50/p95 ni chiqaradi; oldin har o'quvchiga u01 darslarini tugagan qilib, 300 ta tugagan jang (ruh) yaratadi. Maqsad: **p95 < 200 ms**. Oshsa — `ruhQidir` dagi ikki so'rovni `EXPLAIN ANALYZE` qiling va indekslarni moslang, natijani hisobotga yozing. Skriptni o'chiring.

- [ ] **Step 2: Brauzerda telefon o'lchamida**

Dev serverni ishga tushiring (`.claude/launch.json` dagi konfiguratsiya, `preview_start`), `DAF_JANG=<test o'quvchi id>` bilan. Telefon o'lchamida (375×812): Ta'lim sahifasida karta ko'rinadi → jangni boshlang → 6 savolning hammasiga javob bering (bittasida 10 s kuting, bittasini yozing `ae` bilan) → natija ekrani. Konsolda xato yo'qligini tekshiring. Kirish, savol, javob natijasi va yakun ekranlaridan skrinshot oling va foydalanuvchiga yuboring.

- [ ] **Step 3: ADR**

```bash
grep -oE "^\| *[0-9]{4}" docs/adr/README.md | tail -1
```
Keyingi raqam bilan `docs/adr/NNNN-jang-asinxron-ruh.md` (mavjud ADR lar shaklida, o'zbekcha): kontekst (onlayn juft kam, 516 faol), qaror (ruh + ochiq bot, liga balli yo'q, kunlik 5, har 3-jang yangi to'plam, alohida savol bazasi, server vaqti), oqibatlar (boshida ko'p bot, savol bazasi kichik, `DAF_JANG` bilan bosqichli yoqish), rad etilganlar (jonli duel hozircha, liga balli, Claude raqib). `README.md` jadvaliga qator qo'shing.

- [ ] **Step 4: To'liq tekshiruv**

```bash
cd server && npx jest src/daf src/common/auth && npm run build
cd ../client && npx tsc --noEmit -p . && npx vitest run src/components/student-portal/lernen src/i18n
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/adr
git commit -m "docs(adr): battle with async ghost opponent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Deploy (alohida, CEO roziligidan keyin):** migratsiya → kod (`DAF_JANG` o'rnatilmagan = o'chiq) → `railway run ... scripts/daf-jang-seed.ts` → CEO savollarni tasdiqlaydi (`tasdiqlangan: true`, qayta seed) → `DAF_JANG=<CEO test o'quvchi id>` → CEO o'ynaydi → `DAF_JANG=on`. ADR raqamini merge oldidan qayta tekshiring.
