# Mashq yozuvini boyitish — amalga oshirish rejasi (1-bosqich)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Har bir mashq urinishi qaysi seans, savol, urinish raqami, dars, material va formatga tegishli ekanini yozish; seans natijasi tarixini (`DafSession`) serverda urinishlardan hisoblab saqlash; ko'nikmani o'qish paytida beradigan format→ko'nikma reyestrini kiritish.

**Architecture:** Klient seans uchun uuid yaratadi va har javobga `sessionId`/`questionIndex`/`attemptNo`/`lessonId` qo'shib yuboradi (hammasi ixtiyoriy — deploy oynasida eski klient buzilmaydi). Server urinishni yangi maydonlar bilan yozadi, seans qatorini birinchi urinishda yaratadi, yakunda `questionCount`/`firstTryCorrect` ni **urinishlardan o'zi** hisoblaydi. Ko'nikma bazada saqlanmaydi — `format-skill.ts` reyestri.

**Tech Stack:** NestJS + Prisma (PostgreSQL), jest; Next.js + react-query, vitest. Spec: `docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md` (3, 5, 9, 10-bo'limlar).

## Global Constraints

- UI matni va kod izohlari **lotin o'zbekcha**; kirill harflari yo'q.
- `prisma migrate dev` bu repoda ISHLAMAYDI — migratsiya: sxema → `migrate diff` → tozalangan SQL → `db execute` → `migrate resolve --applied` (`project_prisma_migration_workflow`).
- Yangi route `server/src/common/auth/branch-route-policy.ts` da toifalanishi SHART, aks holda build yiqiladi.
- DTO'da `studentId` HECH QACHON bo'lmaydi — tokendan. Yangi DTO maydonlari **ixtiyoriy** (`whitelist + forbidNonWhitelisted` ostida eski klient rad etilmasin).
- Mavjud xatti-harakat o'zgarmaydi: `points`, Leitner (`aktualisiereZustand`), `DafLessonProgress` (`bestScore`, `runs`) avvalgidek.
- Har taskdan keyin: server `npm test` (jest) va `npm run typecheck`; klient `npm test` (vitest), `npm run typecheck`, `npx eslint src`.
- Commit xabari lotin o'zbekcha, oxirida `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ish `.worktrees/oquvchi-ilova-faolligi` da (shox `feat/oquvchi-ilova-faolligi`); asosiy katalogga tegilmaydi.

---

## Fayl tuzilmasi

| Fayl | Mas'uliyati |
| --- | --- |
| `server/prisma/schema.prisma` | `DafAttempt` ga 9 maydon, yangi `DafSession`, 2 enum |
| `server/prisma/migrations/20260913120000_daf_session_and_attempt_context/migration.sql` | Faqat shu o'zgarish |
| `server/src/daf/uebung/format-skill.ts` (+ `.spec.ts`) | Format → ko'nikma reyestri (jonli + nafaqadagi), `skillFuer` |
| `server/src/daf/uebung/seans-natija.ts` (+ `.spec.ts`) | Sof funksiya: urinish satrlari → `{ questionCount, firstTryCorrect }` |
| `server/src/daf/dto/uebung.dto.ts` (+ `.spec.ts`) | `CheckAntwortDto`, `JuftDto`, `AbschlussDto` ga ixtiyoriy seans maydonlari; yangi `WiederholungAbschlussDto` |
| `server/src/daf/uebung/uebung.service.ts` (+ `.spec.ts`) | `sicherSeans`, `pruefen`/`juft` yangi maydonlarni yozadi, `abschluss` seansni yakunlaydi, yangi `wiederholungAbschluss` |
| `server/src/daf/daf-portal.controller.ts` (+ `.spec.ts`) | `POST wiederholung/abschluss` |
| `server/src/common/auth/branch-route-policy.ts` | Yangi route SELF blokida |
| `client/src/components/student-portal/lernen/types.ts` | `SeansYakun` |
| `client/src/components/student-portal/lernen/queries.ts` | Mutatsiyalar yangi maydonlarni yuboradi; `useWiederholungAbschluss` |
| `client/src/components/student-portal/lernen/seans-navbat.ts` (+ `.test.ts`) | `seansId`, `urinishRaqami`, `ersatzKeldi` asl indeksni saqlaydi |
| `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx` | Maydonlarni yuboradi; takrorlash yakuni |
| `docs/adr/0019-mashq-natijasi-umumiy-shartnoma.md`, `docs/adr/README.md` | ADR |

---

### Task 1: Sxema va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model DafAttempt` bloki, ~3204-qator; `enum DafLessonKind` dan keyin)
- Create: `server/prisma/migrations/20260913120000_daf_session_and_attempt_context/migration.sql`

**Interfaces:**
- Produces: `prisma.dafAttempt.create` yangi ustunlar `sessionId, questionIndex, attemptNo, lessonId, itemType, itemId, format, score, gradingStatus`; `prisma.dafSession` modeli (`id, studentId, companyId, branchId, groupId, kind, lessonId, startedAt, finishedAt, questionCount, firstTryCorrect`).

- [ ] **Step 1: Sxemaga enum va maydonlarni qo'shish**

`enum DafLessonKind { ... }` dan keyin:

```prisma
/// Mashq natijasining umumiy shartnomasi (dizayn 5.2): har qanday format
/// shu uchta holatdan birini yozadi. Statistika faqat shuni o'qiydi.
enum DafGradingStatus {
  GRADED
  PENDING
  UNGRADED
}

enum DafSessionKind {
  LESSON
  REVIEW
}
```

`model DafAttempt` ichida `points` dan keyin, `companyId` dan oldin:

```prisma
  /// Seans konteksti (dizayn 5.3). Hammasi ixtiyoriy: eski klient va eski
  /// DiB yo'llari (`drill/check`, `attempts`) bularni yozmaydi — ular savolga
  /// asoslangan ko'rsatkichlardan chetda qoladi, mashq kunida sanaladi.
  sessionId     String?
  /// Asl savolning `PublicFrage.index`i. O'rinbosar savol ham SHU indeks
  /// bilan keladi — u yangi savol emas, o'sha savolning 2-urinishi.
  questionIndex Int?
  /// 1 — asl savol, 2 — xatodan keyingi o'rinbosar.
  attemptNo     Int?
  /// Takrorlash seansida bo'sh.
  lessonId      Int?
  itemType      String?
  itemId        Int?
  /// Matn, enum emas: yangi format migratsiya talab qilmaydi. Ko'nikma bu
  /// yerda YO'Q — o'qishda `format-skill.ts` reyestridan olinadi.
  format        String?
  /// 0..1. Hozirgi formatlarda 0 yoki 1.
  score         Float?
  gradingStatus DafGradingStatus @default(GRADED)
```

`DafAttempt` indekslariga qo'shish:

```prisma
  @@index([sessionId])
  @@index([studentId, sessionId])
```

`model DafAttempt` dan keyin yangi model:

```prisma
/// Bitta mashq seansi. Klient uuid yaratadi; server birinchi urinishda
/// yaratadi, yakunda natijani URINISHLARDAN o'zi hisoblaydi — klient aytgan
/// `richtig`ga ishonmaydi (dizayn 5.3, 5.5).
model DafSession {
  id              String         @id
  studentId       Int
  companyId       Int
  /// Yozish paytida MUHRLANADI — `DafAttempt` dagi kabi.
  branchId        Int?
  groupId         String?
  kind            DafSessionKind
  lessonId        Int?
  startedAt       DateTime
  /// Tugatilmagan (tashlab ketilgan) seans — null.
  finishedAt      DateTime?
  questionCount   Int?
  firstTryCorrect Int?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([studentId, startedAt])
  @@index([groupId, startedAt])
  @@index([companyId, startedAt])
}
```

- [ ] **Step 2: Diff olish va tozalash**

Run (server katalogida):
```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/daf-session-diff.sql
```
`/tmp/daf-session-diff.sql` ni oching. Faqat `DafAttempt`, `DafSession`, `DafGradingStatus`, `DafSessionKind` ga tegishli qatorlarni qoldiring (dev bazadagi drift — `Branch.workingDays`, `Transaction_reversedAt_idx`, `TelegramGroup` FK va h.k. — OLIB TASHLANADI). Kutilgan natija:

```sql
-- CreateEnum
CREATE TYPE "DafGradingStatus" AS ENUM ('GRADED', 'PENDING', 'UNGRADED');

-- CreateEnum
CREATE TYPE "DafSessionKind" AS ENUM ('LESSON', 'REVIEW');

-- AlterTable
ALTER TABLE "DafAttempt" ADD COLUMN     "attemptNo" INTEGER,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "gradingStatus" "DafGradingStatus" NOT NULL DEFAULT 'GRADED',
ADD COLUMN     "itemId" INTEGER,
ADD COLUMN     "itemType" TEXT,
ADD COLUMN     "lessonId" INTEGER,
ADD COLUMN     "questionIndex" INTEGER,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "DafSession" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "groupId" TEXT,
    "kind" "DafSessionKind" NOT NULL,
    "lessonId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "questionCount" INTEGER,
    "firstTryCorrect" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DafSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DafSession_studentId_startedAt_idx" ON "DafSession"("studentId", "startedAt");
CREATE INDEX "DafSession_groupId_startedAt_idx" ON "DafSession"("groupId", "startedAt");
CREATE INDEX "DafSession_companyId_startedAt_idx" ON "DafSession"("companyId", "startedAt");
CREATE INDEX "DafAttempt_sessionId_idx" ON "DafAttempt"("sessionId");
CREATE INDEX "DafAttempt_studentId_sessionId_idx" ON "DafAttempt"("studentId", "sessionId");
```

Tozalangan SQL ni `server/prisma/migrations/20260913120000_daf_session_and_attempt_context/migration.sql` ga yozing.

- [ ] **Step 3: Dev bazaga qo'llash va qayd etish**

```bash
npx prisma db execute --file prisma/migrations/20260913120000_daf_session_and_attempt_context/migration.sql
npx prisma migrate resolve --applied 20260913120000_daf_session_and_attempt_context
npx prisma generate
```
Expected: uchalasi xatosiz. Tekshirish: `npx prisma migrate status` → "Database schema is up to date".

- [ ] **Step 4: Mavjud testlar hali o'tishini tekshirish**

Run: `npm test -- daf` (server). Expected: hammasi PASS (`daf-schema.spec.ts` ham).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260913120000_daf_session_and_attempt_context
git commit -m "DafAttempt seans konteksti va DafSession jadvali

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Format → ko'nikma reyestri

**Files:**
- Create: `server/src/daf/uebung/format-skill.ts`
- Test: `server/src/daf/uebung/format-skill.spec.ts`

**Interfaces:**
- Produces: `type DafSkill = 'WORTSCHATZ' | 'GRAMMATIK' | 'HOEREN' | 'LESEN' | 'SCHREIBEN' | 'SPRECHEN'`; `FORMAT_SKILL: Record<FrageFormat, DafSkill>`; `NAFAQADAGI_FORMAT_SKILL: Record<string, DafSkill>`; `skillFuer(format: string | null | undefined): DafSkill | null`. 3-bosqich (statistika) shuni ishlatadi.

- [ ] **Step 1: Yiqiladigan test**

```ts
// server/src/daf/uebung/format-skill.spec.ts
import { FRAGE_FORMATLAR } from '../dto/uebung.dto';
import {
  FORMAT_SKILL,
  NAFAQADAGI_FORMAT_SKILL,
  skillFuer,
} from './format-skill';

describe('format-skill reyestri', () => {
  it('har bir jonli format ko`nikmaga ega', () => {
    for (const format of FRAGE_FORMATLAR) {
      expect(skillFuer(format)).not.toBeNull();
    }
  });

  it("CEO tasdiqlagan xarita (13.09.2026): amalda nima qilyapti", () => {
    expect(FORMAT_SKILL.ARTIKEL).toBe('WORTSCHATZ');
    expect(FORMAT_SKILL.REAKTION).toBe('WORTSCHATZ');
    expect(FORMAT_SKILL.ZUORDNEN).toBe('WORTSCHATZ');
    expect(FORMAT_SKILL.LUECKE).toBe('GRAMMATIK');
    expect(FORMAT_SKILL.SATZ_BAUEN).toBe('GRAMMATIK');
    expect(FORMAT_SKILL.SATZ_UEBERSETZEN).toBe('LESEN');
    expect(FORMAT_SKILL.DIALOG_LUECKE).toBe('LESEN');
    expect(FORMAT_SKILL.AUDIO_WORT).toBe('HOEREN');
    expect(FORMAT_SKILL.WORT_TIPPEN).toBe('SCHREIBEN');
  });

  it('nafaqadagi format ham ko`nikma beradi, noma`lum format null', () => {
    for (const [format, skill] of Object.entries(NAFAQADAGI_FORMAT_SKILL)) {
      expect(skillFuer(format)).toBe(skill);
    }
    expect(skillFuer('BUNDAY_FORMAT_YOQ')).toBeNull();
    expect(skillFuer(null)).toBeNull();
    expect(skillFuer(undefined)).toBeNull();
  });

  it('jonli va nafaqadagi ro`yxatlar kesishmaydi', () => {
    for (const format of Object.keys(NAFAQADAGI_FORMAT_SKILL)) {
      expect(FORMAT_SKILL).not.toHaveProperty(format);
    }
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- format-skill`
Expected: FAIL — `Cannot find module './format-skill'`.

- [ ] **Step 3: Reyestr**

```ts
// server/src/daf/uebung/format-skill.ts
import type { FrageFormat } from './frage.types';

/**
 * Goethe ko'nikmasi. TypeScript tipi, baza enum'i EMAS: ko'nikma bazada
 * saqlanmaydi, o'qish paytida `format`dan hisoblanadi. Sabab: xarita
 * o'zgarsa (o'qituvchilar «artikl baribir grammatika» desa) bitta qator
 * o'zgaradi va ESKI natijalar ham yangi xarita bo'yicha ko'rinadi.
 */
export type DafSkill =
  | 'WORTSCHATZ'
  | 'GRAMMATIK'
  | 'HOEREN'
  | 'LESEN'
  | 'SCHREIBEN'
  | 'SPRECHEN';

/**
 * Jonli formatlar. `Record<FrageFormat, …>` — union'ga format qo'shilib,
 * bu yerga yozilmasa `npm run typecheck` yiqiladi (`uebung.dto.ts` dagi
 * `ALLE_FRAGE_FORMATLAR` bilan bir xil usul).
 *
 * Qoida (CEO, 13.09.2026): ko'nikma o'quvchi mashqda AMALDA nima
 * qilayotganiga qarab, mashq kelajakda nimaga tayyorlashiga qarab emas.
 * So'z/tayyor iborani taniydi — Wortschatz; gap tuzilishi — Grammatik;
 * gap yoki suhbatni o'qib tushunadi — Lesen; eshitadi — Hören; o'zi
 * yozadi — Schreiben; o'zi gapiradi — Sprechen (hozir format yo'q).
 */
export const FORMAT_SKILL: Record<FrageFormat, DafSkill> = {
  WORT_UZ: 'WORTSCHATZ',
  UZ_WORT: 'WORTSCHATZ',
  PAAR: 'WORTSCHATZ',
  // Artikl so'z bilan birga yodlanadi; xato — «so'zni to'liq bilmaydi».
  ARTIKEL: 'WORTSCHATZ',
  // Tayyor iborani tanlash. Sprechen EMAS: o'quvchi gapirmaydi —
  // «Gapirish 90%» o'qituvchini chalg'itardi.
  REAKTION: 'WORTSCHATZ',
  ZUORDNEN: 'WORTSCHATZ',
  LUECKE: 'GRAMMATIK',
  SATZ_BAUEN: 'GRAMMATIK',
  // Gap yoki suhbatni butunligicha tushunish.
  SATZ_UEBERSETZEN: 'LESEN',
  DIALOG_LUECKE: 'LESEN',
  AUDIO_WORT: 'HOEREN',
  WORT_TIPPEN: 'SCHREIBEN',
};

/**
 * Nafaqadagi formatlar. `DafAttempt.format` matn bo'lgani uchun o'chirilgan
 * format tarixda qoladi — bu yerda uning ko'nikmasi ham qoladi, aks holda
 * eski urinishlar «noma'lum»ga tushardi. Format `FrageFormat` dan
 * olib tashlanganda uni SHU YERGA ko'chiring, o'chirmang.
 */
export const NAFAQADAGI_FORMAT_SKILL: Record<string, DafSkill> = {};

export function skillFuer(
  format: string | null | undefined,
): DafSkill | null {
  if (!format) return null;
  if (format in FORMAT_SKILL) return FORMAT_SKILL[format as FrageFormat];
  return NAFAQADAGI_FORMAT_SKILL[format] ?? null;
}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test -- format-skill` → PASS. Run: `npm run typecheck` → xatosiz.

- [ ] **Step 5: Commit**

```bash
git add src/daf/uebung/format-skill.ts src/daf/uebung/format-skill.spec.ts
git commit -m "Format -> ko'nikma reyestri: o'qishda hisoblanadi, nafaqadagi formatlar saqlanadi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Seans natijasini urinishlardan hisoblash (sof funksiya)

**Files:**
- Create: `server/src/daf/uebung/seans-natija.ts`
- Test: `server/src/daf/uebung/seans-natija.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface UrinishSatri {
    questionIndex: number | null;
    attemptNo: number | null;
    format: string | null;
    score: number | null;
    gradingStatus: 'GRADED' | 'PENDING' | 'UNGRADED';
  }
  export interface SeansYigindi { questionCount: number; firstTryCorrect: number }
  export function seansYigindisi(satrlar: UrinishSatri[]): SeansYigindi
  export const JUFT_SONI: Record<'PAAR' | 'ZUORDNEN', number> // { PAAR: 4, ZUORDNEN: 6 }
  ```
  Task 6 (`abschluss`) shuni chaqiradi.

- [ ] **Step 1: Yiqiladigan test**

```ts
// server/src/daf/uebung/seans-natija.spec.ts
import { seansYigindisi, type UrinishSatri } from './seans-natija';

function s(
  questionIndex: number,
  attemptNo: number,
  score: number,
  format = 'WORT_UZ',
): UrinishSatri {
  return { questionIndex, attemptNo, format, score, gradingStatus: 'GRADED' };
}

describe('seansYigindisi', () => {
  it("oddiy savol: birinchi urinish sanaladi, o'rinbosar (attemptNo 2) foizni o'zgartirmaydi", () => {
    const r = seansYigindisi([
      s(0, 1, 1),
      s(1, 1, 0),
      s(1, 2, 1), // xatodan keyin boshqa formatda to'g'ri — baribir 0
      s(2, 1, 1),
    ]);
    expect(r).toEqual({ questionCount: 3, firstTryCorrect: 2 });
  });

  it('juftlash: hamma juft birinchi bosishda to`g`ri — 1', () => {
    const r = seansYigindisi([
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 1 });
  });

  it('juftlash: bitta xato bosish — 0, savol baribir sanaladi', () => {
    const r = seansYigindisi([
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 0, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
      s(0, 1, 1, 'PAAR'),
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 0 });
  });

  it('juftlash: hal bo`lmagan savol (juftlar yetmagan, xato yo`q) hisobga kirmaydi', () => {
    const r = seansYigindisi([s(0, 1, 1, 'ZUORDNEN'), s(0, 1, 1, 'ZUORDNEN')]);
    expect(r).toEqual({ questionCount: 0, firstTryCorrect: 0 });
  });

  it('PENDING va UNGRADED savollar foizga kirmaydi', () => {
    const r = seansYigindisi([
      s(0, 1, 1),
      { ...s(1, 1, 0), gradingStatus: 'PENDING' },
      { ...s(2, 1, 1), gradingStatus: 'UNGRADED' },
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 1 });
  });

  it('sessionId`siz (eski) satrlar — questionIndex null — chetda qoladi', () => {
    const r = seansYigindisi([
      { questionIndex: null, attemptNo: null, format: null, score: null, gradingStatus: 'GRADED' },
      s(0, 1, 1),
    ]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 1 });
  });

  it('qisman ball (kelajakdagi format) 0.5 — savol to`g`ri emas, lekin sanaladi', () => {
    const r = seansYigindisi([s(0, 1, 0.5, 'KELAJAK')]);
    expect(r).toEqual({ questionCount: 1, firstTryCorrect: 0 });
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- seans-natija` → FAIL (modul yo'q).

- [ ] **Step 3: Funksiya**

```ts
// server/src/daf/uebung/seans-natija.ts
/**
 * Seans natijasini URINISHLARDAN hisoblaydi (dizayn 5.5) — klient aytgan
 * `richtig`ga ishonilmaydi.
 *
 * Qoidalar:
 * - Savol = `questionIndex`. O'rinbosar savol (`attemptNo` 2) shu indeks
 *   bilan keladi va birinchi urinish natijasini O'ZGARTIRMAYDI.
 * - Oddiy savol: `attemptNo = 1` satrining `score`i 1 bo'lsa to'g'ri.
 * - Juftlash (`PAAR` 4 juft, `ZUORDNEN` 6 juft): har bosish alohida satr.
 *   Birortasi 0 bo'lsa — 0. Hammasi 1 va soni juftlar soniga yetgan bo'lsa
 *   — 1. Aks holda savol hal bo'lmagan (seans tashlab ketilgan) — sanalmaydi.
 * - Faqat `GRADED` satrlar; `PENDING`/`UNGRADED` savollar foizga kirmaydi.
 * - `questionIndex` null (eski klient, eski DiB yo'li) — chetda.
 */
export interface UrinishSatri {
  questionIndex: number | null;
  attemptNo: number | null;
  format: string | null;
  score: number | null;
  gradingStatus: 'GRADED' | 'PENDING' | 'UNGRADED';
}

export interface SeansYigindi {
  questionCount: number;
  firstTryCorrect: number;
}

/** Klientdagi `juftSoni()` bilan BIR XIL: PAAR 4, ZUORDNEN 6. */
export const JUFT_SONI: Record<'PAAR' | 'ZUORDNEN', number> = {
  PAAR: 4,
  ZUORDNEN: 6,
};

function juftFormatmi(format: string | null): format is 'PAAR' | 'ZUORDNEN' {
  return format === 'PAAR' || format === 'ZUORDNEN';
}

export function seansYigindisi(satrlar: UrinishSatri[]): SeansYigindi {
  const savollar = new Map<number, UrinishSatri[]>();
  for (const satr of satrlar) {
    if (satr.questionIndex == null || satr.attemptNo !== 1) continue;
    if (satr.gradingStatus !== 'GRADED') continue;
    const royxat = savollar.get(satr.questionIndex) ?? [];
    royxat.push(satr);
    savollar.set(satr.questionIndex, royxat);
  }

  let questionCount = 0;
  let firstTryCorrect = 0;
  for (const urinishlar of savollar.values()) {
    const format = urinishlar[0].format;
    if (juftFormatmi(format)) {
      const xatoBor = urinishlar.some((u) => (u.score ?? 0) < 1);
      const togriSoni = urinishlar.filter((u) => u.score === 1).length;
      if (xatoBor) {
        questionCount += 1;
      } else if (togriSoni >= JUFT_SONI[format]) {
        questionCount += 1;
        firstTryCorrect += 1;
      }
      // Xato yo'q, lekin juftlar yetmagan — hal bo'lmagan, sanalmaydi.
      continue;
    }
    questionCount += 1;
    if (urinishlar[0].score === 1) firstTryCorrect += 1;
  }
  return { questionCount, firstTryCorrect };
}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test -- seans-natija` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/daf/uebung/seans-natija.ts src/daf/uebung/seans-natija.spec.ts
git commit -m "Seans natijasi urinishlardan: birinchi urinish, juftlash qoidasi, PENDING chetda

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: DTO'larga seans maydonlari

**Files:**
- Modify: `server/src/daf/dto/uebung.dto.ts` (`CheckAntwortDto`, `JuftDto`, `AbschlussDto`; yangi `WiederholungAbschlussDto`)
- Test: `server/src/daf/dto/uebung.dto.spec.ts`

**Interfaces:**
- Produces: `CheckAntwortDto` va `JuftDto` da ixtiyoriy `sessionId?: string` (uuid v4), `questionIndex?: number` (0..100), `attemptNo?: 1 | 2`, `lessonId?: number`; `AbschlussDto.sessionId?: string`; `WiederholungAbschlussDto { sessionId: string }` (majburiy).

- [ ] **Step 1: Yiqiladigan test** (`uebung.dto.spec.ts` ga qo'shing)

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AbschlussDto,
  CheckAntwortDto,
  JuftDto,
  WiederholungAbschlussDto,
} from './uebung.dto';

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';

describe('seans maydonlari', () => {
  it('CheckAntwortDto: seans maydonlarisiz ham o`tadi (eski klient)', async () => {
    const dto = plainToInstance(CheckAntwortDto, {
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CheckAntwortDto: to`liq seans maydonlari o`tadi', async () => {
    const dto = plainToInstance(CheckAntwortDto, {
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
      sessionId: UUID, questionIndex: 3, attemptNo: 2, lessonId: 100,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CheckAntwortDto: uuid bo`lmagan sessionId, attemptNo 3, manfiy questionIndex rad etiladi', async () => {
    const dto = plainToInstance(CheckAntwortDto, {
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
      sessionId: 'seans-1', questionIndex: -1, attemptNo: 3,
    });
    const xatolar = await validate(dto);
    expect(xatolar.map((x) => x.property).sort()).toEqual(
      ['attemptNo', 'questionIndex', 'sessionId'],
    );
  });

  it('JuftDto ham seans maydonlarini qabul qiladi', async () => {
    const dto = plainToInstance(JuftDto, {
      itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'Haus', ong: 'uy',
      sessionId: UUID, questionIndex: 0, attemptNo: 1, lessonId: 100,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('AbschlussDto.sessionId ixtiyoriy, WiederholungAbschlussDto.sessionId majburiy', async () => {
    expect(await validate(plainToInstance(AbschlussDto, { richtig: 9, gesamt: 12 }))).toHaveLength(0);
    expect(await validate(plainToInstance(AbschlussDto, { richtig: 9, gesamt: 12, sessionId: UUID }))).toHaveLength(0);
    expect(await validate(plainToInstance(WiederholungAbschlussDto, {}))).toHaveLength(1);
    expect(await validate(plainToInstance(WiederholungAbschlussDto, { sessionId: UUID }))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- uebung.dto` → FAIL (`WiederholungAbschlussDto` yo'q; `sessionId` maydonlari `forbidNonWhitelisted` bilan emas, `validate` da whitelist yo'q — lekin `attemptNo 3` xatosi chiqmaydi).

- [ ] **Step 3: DTO'lar**

`uebung.dto.ts` importiga `IsUUID` qo'shing. `CheckAntwortDto` va `JuftDto` ning ikkalasiga `durationMs` dan keyin AYNAN shu blokni qo'shing (ikkala DTO da takrorlanadi — dekoratorli sinflarda meros o'rniga aniq maydonlar):

```ts
  /**
   * Seans konteksti (dizayn 5.3). Hammasi IXTIYORIY: deploy oynasida eski
   * klient bularsiz yuboradi va `forbidNonWhitelisted` ostida rad
   * etilmasligi kerak. Bularsiz kelgan urinish savolga asoslangan
   * ko'rsatkichlardan chetda qoladi, xolos.
   */
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  /** Asl savolning `PublicFrage.index`i — o'rinbosar ham SHU indeks bilan. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  questionIndex?: number;

  /** 1 — asl savol, 2 — xatodan keyingi o'rinbosar. */
  @IsOptional()
  @IsIn([1, 2])
  attemptNo?: 1 | 2;

  /** Takrorlash seansida yuborilmaydi. */
  @IsOptional()
  @IsInt()
  @Min(1)
  lessonId?: number;
```

`AbschlussDto` ga:

```ts
  /** Seans yakunini `DafSession` ga yozish uchun; eski klient yubormaydi. */
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;
```

Fayl oxiriga:

```ts
/**
 * Takrorlash seansi yakuni. Dars yo'q — faqat seans. `sessionId` MAJBURIY:
 * bu endpoint faqat yangi klientdan chaqiriladi, unda yozadigan boshqa
 * hech narsa yo'q.
 */
export class WiederholungAbschlussDto {
  @IsUUID('4')
  sessionId!: string;
}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test -- uebung.dto` → PASS. `npm run typecheck` → xatosiz.

- [ ] **Step 5: Commit**

```bash
git add src/daf/dto/uebung.dto.ts src/daf/dto/uebung.dto.spec.ts
git commit -m "Mashq DTO'lariga ixtiyoriy seans maydonlari; takrorlash yakuni DTO'si

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `pruefen` va `juft` seans kontekstini yozadi

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts` (`PruefenInput`, `JuftInput`, `pruefen` ~894-1035, `juft` ~1056-1186; yangi `private async sicherSeans`)
- Test: `server/src/daf/uebung/uebung.service.spec.ts` (`fakePrisma` ga `dafSession`)

**Interfaces:**
- Consumes: Task 1 `prisma.dafSession`, Task 4 DTO maydonlari.
- Produces: `PruefenInput`/`JuftInput` da `sessionId?, questionIndex?, attemptNo?, lessonId?`; `dafAttempt.create` `data` da `sessionId, questionIndex, attemptNo, lessonId, itemType, itemId, format, score, gradingStatus: 'GRADED'`; `dafSession` qatori birinchi urinishda `{ id, studentId, companyId, branchId, groupId, kind, lessonId, startedAt }` bilan yaratiladi; boshqa o'quvchining `sessionId`si → `ForbiddenException`.

- [ ] **Step 1: `fakePrisma` ga `dafSession` qo'shish va `dafAttempt.findMany`** (`uebung.service.spec.ts`)

`dafAttempt: { create: jest.fn(async () => ({ id: 1 })) },` qatorini shu bilan almashtiring:

```ts
    dafAttempt: {
      create: jest.fn(async () => ({ id: 1 })),
      findMany: jest.fn(async () => []),
    },
    dafSession: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => args.data),
      update: jest.fn(async (args: any) => args.data),
    },
```

`fakeMitWort(null)` dagi so'z: `id 5, de 'das Haus', uz 'uy'` — `dafLexeme.findMany` `where`ga qaramay shu so'zni qaytaradi. Pastdagi testlar shunga tayanadi.

- [ ] **Step 2: Yiqiladigan testlar** (`describe('pruefen — ball', …)` dan keyin yangi blok)

```ts
describe('pruefen/juft — seans konteksti', () => {
  const ctx = { studentId: 55, companyId: 1 };
  const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';

  it('pruefen seans maydonlarini va score/gradingStatus ni yozadi', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      {
        itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy',
        sessionId: UUID, questionIndex: 3, attemptNo: 1, lessonId: 100,
      },
      ctx,
    );
    const data = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      sessionId: UUID, questionIndex: 3, attemptNo: 1, lessonId: 100,
      itemType: 'WORT', itemId: 5, format: 'WORT_UZ',
      score: 1, gradingStatus: 'GRADED',
    });
  });

  it('xato javobda score 0', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'noto`g`ri', sessionId: UUID, questionIndex: 0, attemptNo: 1, lessonId: 100 },
      ctx,
    );
    const data = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0].data;
    expect(data.score).toBe(0);
  });

  it('birinchi urinishda DafSession yaratiladi (LESSON, muhrlangan branch/group)', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy', sessionId: UUID, questionIndex: 0, attemptNo: 1, lessonId: 100 },
      ctx,
    );
    const data = (prisma.dafSession.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ id: UUID, studentId: 55, companyId: 1, kind: 'LESSON', lessonId: 100 });
    expect(data.startedAt).toBeInstanceOf(Date);
  });

  it('lessonId siz seans REVIEW', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy', sessionId: UUID, questionIndex: 0, attemptNo: 1 },
      ctx,
    );
    const data = (prisma.dafSession.create as jest.Mock).mock.calls[0][0].data;
    expect(data.kind).toBe('REVIEW');
    expect(data.lessonId).toBeNull();
  });

  it('seans allaqachon bor — qayta yaratilmaydi', async () => {
    const prisma = fakeMitWort(null);
    prisma.dafSession.findUnique = jest.fn(async () => ({ id: UUID, studentId: 55 }));
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy', sessionId: UUID, questionIndex: 1, attemptNo: 1, lessonId: 100 },
      ctx,
    );
    expect(prisma.dafSession.create).not.toHaveBeenCalled();
  });

  it("boshqa o'quvchining sessionId si — 403, urinish yozilmaydi", async () => {
    const prisma = fakeMitWort(null);
    prisma.dafSession.findUnique = jest.fn(async () => ({ id: UUID, studentId: 99 }));
    await expect(
      new UebungService(prisma as any).pruefen(
        { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy', sessionId: UUID, questionIndex: 0, attemptNo: 1, lessonId: 100 },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dafAttempt.create).not.toHaveBeenCalled();
  });

  it('sessionId siz (eski klient) — seans yaratilmaydi, maydonlar null', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' },
      ctx,
    );
    expect(prisma.dafSession.findUnique).not.toHaveBeenCalled();
    const data = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0].data;
    expect(data.sessionId).toBeNull();
    expect(data.questionIndex).toBeNull();
    // format/itemType/itemId baribir yoziladi — ular so'rovning o'zida bor.
    expect(data.format).toBe('WORT_UZ');
    expect(data.score).toBe(1);
  });

  it('juft: PAAR da itemId bosilgan juftning O`Z so`zi, seans maydonlari yoziladi', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).juft(
      // `itemId: 1` — to'rtlikning birinchisi; bosilgan juft esa 5-so'z.
      { itemType: 'WORT', itemId: 1, format: 'PAAR', chap: 'das Haus', ong: 'uy', sessionId: UUID, questionIndex: 2, attemptNo: 1, lessonId: 100 },
      ctx,
    );
    const data = (prisma.dafAttempt.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ sessionId: UUID, questionIndex: 2, attemptNo: 1, lessonId: 100, format: 'PAAR', itemType: 'WORT', gradingStatus: 'GRADED' });
    expect(data.itemId).toBe(5); // bosilgan so'z, `input.itemId` (1) emas
    expect(data.score).toBe(1);
  });
});
```

`ForbiddenException` importini spec boshiga qo'shing: `import { ForbiddenException } from '@nestjs/common';`.

- [ ] **Step 3: Yiqilishini tekshirish**

Run: `npm test -- uebung.service` → yangi blok FAIL (`sessionId` yozilmaydi, `dafSession.create` chaqirilmaydi).

- [ ] **Step 4: Servis**

`PruefenInput` va `JuftInput` ga (ikkalasiga) qo'shing:

```ts
  sessionId?: string;
  questionIndex?: number;
  attemptNo?: 1 | 2;
  lessonId?: number;
```

`@nestjs/common` importiga `ForbiddenException` qo'shing (yo'q bo'lsa). Sinf ichiga (`punkteEingabeFuer` yonida) yangi metod:

```ts
  /**
   * Seans qatori birinchi urinishda yaratiladi (dizayn 5.3). `sessionId`
   * boshqa o'quvchiga tegishli bo'lsa — 403: aks holda o'quvchi birovning
   * seansiga urinish yozib, uning natijasini buzishi mumkin bo'lardi.
   * `sessionId` yo'q (eski klient) — hech narsa qilinmaydi.
   */
  private async sicherSeans(
    input: { sessionId?: string; lessonId?: number },
    ctx: PruefenContext,
    branchId: number | null,
    groupId: string | null,
  ): Promise<void> {
    if (!input.sessionId) return;
    const mavjud = (await this.prisma.dafSession.findUnique({
      where: { id: input.sessionId },
      select: { id: true, studentId: true },
    } as any)) as { id: string; studentId: number } | null;
    if (mavjud) {
      if (mavjud.studentId !== ctx.studentId) {
        throw new ForbiddenException("Bu seans boshqa o'quvchiga tegishli");
      }
      return;
    }
    await this.prisma.dafSession.create({
      data: {
        id: input.sessionId,
        studentId: ctx.studentId,
        companyId: ctx.companyId,
        branchId,
        groupId,
        kind: input.lessonId ? 'LESSON' : 'REVIEW',
        lessonId: input.lessonId ?? null,
        startedAt: new Date(),
      },
    } as any);
  }

  /** `dafAttempt.create` uchun seans maydonlari — `pruefen` va `juft` bir xil yozadi. */
  private seansMaydonlari(
    input: { sessionId?: string; questionIndex?: number; attemptNo?: 1 | 2; lessonId?: number },
    itemType: string,
    itemId: number,
    format: string,
    isCorrect: boolean,
  ) {
    return {
      sessionId: input.sessionId ?? null,
      questionIndex: input.questionIndex ?? null,
      attemptNo: input.attemptNo ?? null,
      lessonId: input.lessonId ?? null,
      itemType,
      itemId,
      format,
      score: isCorrect ? 1 : 0,
      gradingStatus: 'GRADED' as const,
    };
  }
```

`pruefen` ichida `const groupId = await currentGroupId(...)` dan keyin, `dafAttempt.create` dan OLDIN:

```ts
    await this.sicherSeans(input, ctx, branchId, groupId);
```

va `create` `data` sida `points,` dan keyin:

```ts
        ...this.seansMaydonlari(input, itemType, itemId, format, isCorrect),
```

`juft` ichida ZUORDNEN tarmog'ida ibora id sini oling: `Array<{ funktionUz: string; de: string }>` → `Array<{ id: number; funktionUz: string; de: string }>` va `let iboraId: number | null = null;` e'lon qilib, `ibora` topilgach `iboraId = ibora?.id ?? null;`. `groupId` dan keyin `await this.sicherSeans(input, ctx, branchId, groupId);`, `create` `data` sida `points,` dan keyin:

```ts
        // Har juft qatoriga shu juftning O'Z materiali (dizayn 5.5):
        // `PAAR` — bosilgan so'z, `ZUORDNEN` — bosilgan ibora. `input.itemId`
        // to'rtlik/oltilikning BIRINCHISI, bosilgan juft esa boshqasi.
        ...this.seansMaydonlari(
          input,
          itemType,
          format === 'PAAR' ? (lexemeId ?? itemId) : (iboraId ?? itemId),
          format,
          isCorrect,
        ),
```

`juft` dagi mavjud `lexemeId: format === 'PAAR' ? lexemeId : null` qatori O'ZGARMAYDI (Leitner uchun).

- [ ] **Step 5: O'tishini tekshirish**

Run: `npm test -- uebung.service` → hammasi PASS (eski testlar ham — `fakePrisma` da `dafSession` bo'lgani uchun). `npm run typecheck` → xatosiz. `npm test -- daf-portal.controller` → PASS (controller spec o'z `fakeUebungPrisma` iga ega — unda `dafSession` yo'q, lekin u `sessionId` yubormaydi, shuning uchun `sicherSeans` chaqirilmaydi; yiqilsa `dafSession` mock'ini o'sha yerga ham qo'shing).

- [ ] **Step 6: Commit**

```bash
git add src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts src/daf/daf-portal.controller.spec.ts
git commit -m "pruefen/juft seans kontekstini yozadi; DafSession birinchi urinishda yaratiladi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Seans yakuni serverda, takrorlash yakuni endpointi

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts` (`abschluss` ~400-445; yangi `wiederholungAbschluss`, `private async seansniYakunla`)
- Modify: `server/src/daf/daf-portal.controller.ts` (`postAbschluss` yonida yangi route)
- Modify: `server/src/common/auth/branch-route-policy.ts` (SELF bloki, `POST /student-portal/lernen/lessons/:id/abschluss` yonida)
- Test: `server/src/daf/uebung/uebung.service.spec.ts`, `server/src/daf/daf-portal.controller.spec.ts`

**Interfaces:**
- Consumes: Task 3 `seansYigindisi`, Task 4 `WiederholungAbschlussDto`.
- Produces: `abschluss(lessonId, { richtig, gesamt, durationMs?, sessionId? }, ctx)` — `sessionId` bo'lsa `DafSession` yakunlanadi; `wiederholungAbschluss({ sessionId }, ctx): Promise<{ questionCount: number; firstTryCorrect: number }>`; `POST /student-portal/lernen/wiederholung/abschluss`.

- [ ] **Step 1: Yiqiladigan testlar** (`describe('UebungService.abschluss', …)` dan keyin)

```ts
describe('seans yakuni', () => {
  const ctx = { studentId: 55, companyId: 1 };
  const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
  const satr = (questionIndex: number, attemptNo: number, score: number, format = 'WORT_UZ') =>
    ({ questionIndex, attemptNo, format, score, gradingStatus: 'GRADED' });

  function prismaMitSeans(studentId = 55, finishedAt: Date | null = null) {
    const prisma = fakePrisma();
    prisma.dafSession.findUnique = jest.fn(async () => ({
      id: UUID, studentId, finishedAt, questionCount: finishedAt ? 12 : null, firstTryCorrect: finishedAt ? 9 : null,
    }));
    prisma.dafAttempt.findMany = jest.fn(async () => [satr(0, 1, 1), satr(1, 1, 0), satr(1, 2, 1), satr(2, 1, 1)]) as any;
    return prisma;
  }

  it('abschluss sessionId bilan: DafSession urinishlardan yakunlanadi, DafLessonProgress avvalgidek', async () => {
    const prisma = prismaMitSeans();
    await new UebungService(prisma as any).abschluss(100, { richtig: 10, gesamt: 12, sessionId: UUID }, ctx);
    const upd = (prisma.dafSession.update as jest.Mock).mock.calls[0][0];
    expect(upd.where).toEqual({ id: UUID });
    expect(upd.data).toMatchObject({ questionCount: 3, firstTryCorrect: 2 });
    expect(upd.data.finishedAt).toBeInstanceOf(Date);
    // Klient aytgan 10 seansga EMAS, faqat dars progressiga ketadi.
    const lp = (prisma.dafLessonProgress.upsert as jest.Mock).mock.calls[0][0];
    expect(lp.create.bestScore).toBe(10);
  });

  it('abschluss sessionId siz (eski klient): seansga tegilmaydi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).abschluss(100, { richtig: 10, gesamt: 12 }, ctx);
    expect(prisma.dafSession.findUnique).not.toHaveBeenCalled();
    expect(prisma.dafSession.update).not.toHaveBeenCalled();
  });

  it('wiederholungAbschluss natijani qaytaradi va DafLessonProgress ga tegmaydi', async () => {
    const prisma = prismaMitSeans();
    const r = await new UebungService(prisma as any).wiederholungAbschluss({ sessionId: UUID }, ctx);
    expect(r).toEqual({ questionCount: 3, firstTryCorrect: 2 });
    expect(prisma.dafLessonProgress.upsert).not.toHaveBeenCalled();
  });

  it('allaqachon yakunlangan seans qayta yozilmaydi — saqlangan natija qaytadi (idempotent)', async () => {
    const prisma = prismaMitSeans(55, new Date());
    const r = await new UebungService(prisma as any).wiederholungAbschluss({ sessionId: UUID }, ctx);
    expect(r).toEqual({ questionCount: 12, firstTryCorrect: 9 });
    expect(prisma.dafSession.update).not.toHaveBeenCalled();
  });

  it("boshqa o'quvchining seansi — 403; yo'q seans — 404", async () => {
    await expect(
      new UebungService(prismaMitSeans(99) as any).wiederholungAbschluss({ sessionId: UUID }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).wiederholungAbschluss({ sessionId: UUID }, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

`NotFoundException` ni import qiling. Controller spec ga (`describe('DafPortalController — ruxsat', …)` ichiga):

```ts
  it('wiederholung/abschluss route mavjud va Student roliga qaraydi', () => {
    const proto = DafPortalController.prototype as any;
    expect(typeof proto.postWiederholungAbschluss).toBe('function');
    expect(Reflect.getMetadata('path', proto.postWiederholungAbschluss)).toBe('wiederholung/abschluss');
  });
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npm test -- uebung.service daf-portal.controller` → yangi testlar FAIL.

- [ ] **Step 3: Servis**

Import: `import { seansYigindisi } from './seans-natija';` va `NotFoundException` (`@nestjs/common`, bor bo'lsa qoladi). `abschluss` imzosini kengaytiring: `input: { richtig: number; gesamt: number; durationMs?: number; sessionId?: string }` va funksiya boshida (validatsiyadan keyin, `oldingi` dan oldin):

```ts
    // Seans natijasi URINISHLARDAN — klient aytgan `richtig` faqat
    // `DafLessonProgress.bestScore` ga ketadi (yo'l ekrani, avvalgidek).
    if (input.sessionId) {
      await this.seansniYakunla(input.sessionId, ctx);
    }
```

Yangi ochiq metod va yordamchi (`abschluss` dan keyin):

```ts
  /**
   * Takrorlash seansi yakuni. Dars yo'q, `DafLessonProgress` ga tegilmaydi
   * — faqat `DafSession`. Hozirgacha takrorlash hech narsa yubormasdi va
   * tarixda qolmasdi (dizayn 5.1).
   */
  async wiederholungAbschluss(
    input: { sessionId: string },
    ctx: PruefenContext,
  ): Promise<{ questionCount: number; firstTryCorrect: number }> {
    return this.seansniYakunla(input.sessionId, ctx);
  }

  /**
   * `DafSession.finishedAt/questionCount/firstTryCorrect` ni urinishlardan
   * yozadi. IDEMPOTENT: yakunlangan seans qayta hisoblanmaydi — ikki marta
   * bosilgan «Tugatish» yoki qayta yuborilgan so'rov natijani o'zgartirmaydi.
   */
  private async seansniYakunla(
    sessionId: string,
    ctx: PruefenContext,
  ): Promise<{ questionCount: number; firstTryCorrect: number }> {
    const seans = (await this.prisma.dafSession.findUnique({
      where: { id: sessionId },
      select: { id: true, studentId: true, finishedAt: true, questionCount: true, firstTryCorrect: true },
    } as any)) as {
      id: string; studentId: number; finishedAt: Date | null;
      questionCount: number | null; firstTryCorrect: number | null;
    } | null;
    if (!seans) throw new NotFoundException('Seans topilmadi');
    if (seans.studentId !== ctx.studentId) {
      throw new ForbiddenException("Bu seans boshqa o'quvchiga tegishli");
    }
    if (seans.finishedAt) {
      return {
        questionCount: seans.questionCount ?? 0,
        firstTryCorrect: seans.firstTryCorrect ?? 0,
      };
    }
    const satrlar = (await this.prisma.dafAttempt.findMany({
      where: { sessionId },
      select: { questionIndex: true, attemptNo: true, format: true, score: true, gradingStatus: true },
    } as any)) as Parameters<typeof seansYigindisi>[0];
    const natija = seansYigindisi(satrlar);
    await this.prisma.dafSession.update({
      where: { id: sessionId },
      data: { finishedAt: new Date(), ...natija },
    } as any);
    return natija;
  }
```

Controller (`postAbschluss` dan keyin; `WiederholungAbschlussDto` ni importga qo'shing):

```ts
  /**
   * Takrorlash seansi yakuni. `lessons/` OSTIDA EMAS — `getWiederholung`
   * bilan bir xil sabab. `studentId` TOKENDAN.
   */
  @Post('wiederholung/abschluss')
  postWiederholungAbschluss(
    @Body() dto: WiederholungAbschlussDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.uebung.wiederholungAbschluss(dto, { studentId, companyId });
  }
```

`branch-route-policy.ts` SELF blokida `'POST /student-portal/lernen/lessons/:id/abschluss',` dan keyin:

```ts
      // Takrorlash seansi yakuni — `DafSession` shu o'quvchining nomiga,
      // `sessionId` egaligi servisda tekshiriladi (403).
      'POST /student-portal/lernen/wiederholung/abschluss',
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test` (to'liq) → PASS, jumladan `branch-route-policy.spec.ts` (manifest to'liqligi). `npm run typecheck`, `npm run build` → xatosiz.

- [ ] **Step 5: Commit**

```bash
git add src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts src/daf/daf-portal.controller.ts src/daf/daf-portal.controller.spec.ts src/common/auth/branch-route-policy.ts
git commit -m "Seans yakuni urinishlardan hisoblanadi; takrorlash yakuni endpointi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Klient — seans holati `seansId` va urinish raqamini biladi

**Files:**
- Modify: `client/src/components/student-portal/lernen/seans-navbat.ts`
- Modify: `client/src/components/student-portal/lernen/types.ts` (fayl oxiri)
- Modify: `client/src/components/student-portal/lernen/queries.ts` (`usePruefen`, `useJuftTekshir`, `useAbschluss`; yangi `useWiederholungAbschluss`)
- Test: `client/src/components/student-portal/lernen/seans-navbat.test.ts`

**Interfaces:**
- Produces: `SeansHolati.seansId: string`; `boshla(fragen, seansId = crypto.randomUUID())`; `urinishRaqami(h, frage): 1 | 2`; `ersatzKeldi(h, frage, aslIndex)` — o'rinbosar asl savolning `index`i bilan navbatga kiradi; mutatsiya tanalarida `sessionId?, questionIndex?, attemptNo?, lessonId?`; `useAbschluss` tanasida `sessionId?`; `useWiederholungAbschluss(): useMutation<SeansYakun, unknown, { sessionId: string }>`; `types.ts` da `SeansYakun { questionCount: number; firstTryCorrect: number }`.

- [ ] **Step 1: Yiqiladigan testlar** (`seans-navbat.test.ts` ga)

```ts
import { urinishRaqami } from "./seans-navbat";

describe("seans konteksti", () => {
  it("boshla seansId beradi — uuid v4", () => {
    const h = boshla([f(1)]);
    expect(h.seansId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("berilgan seansId saqlanadi, javoblar uni o'zgartirmaydi", () => {
    const h = boshla([f(1), f(2)], "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f");
    const { holat } = javobBerildi(h, OK);
    expect(holat.seansId).toBe("3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f");
  });

  it("urinishRaqami: asl savol 1, qaytgan savol 2", () => {
    const h = boshla([f(1), f(2)]);
    expect(urinishRaqami(h, f(1))).toBe(1);
    const { holat } = javobBerildi(h, XATO); // f(1) qaytadi
    const h2 = ersatzKeldi(holat, f(1, "UZ_WORT"), 0);
    const qaytgan = h2.navbat[h2.navbat.length - 1];
    expect(urinishRaqami(h2, qaytgan)).toBe(2);
  });

  it("ersatzKeldi o'rinbosarga ASL savolning indeksini beradi", () => {
    const h = boshla([f(7), f(8)]);
    const { holat } = javobBerildi(h, XATO);
    // server o'rinbosarni doim index 0 bilan qaytaradi (`toPublic(nomzod, 0)`)
    const ersatz = { ...f(7, "UZ_WORT"), index: 0 };
    const h2 = ersatzKeldi(holat, ersatz, 7);
    expect(h2.navbat[h2.navbat.length - 1].index).toBe(7);
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run (client): `npm test -- seans-navbat` → FAIL (`seansId` yo'q, `urinishRaqami` yo'q, `ersatzKeldi` 2 argument).

- [ ] **Step 3: `seans-navbat.ts`**

`SeansHolati` ga birinchi maydon:

```ts
  /**
   * Seansning uuid'i — server `DafSession` qatorini shu id bilan yaratadi.
   * Klient yaratadi: seans serverda saqlanmaydi (D6), server esa birinchi
   * urinishda qatorni ochadi. Holat bilan birga yashaydi — qayta chizilishda
   * o'zgarmaydi.
   */
  seansId: string;
```

`boshla`:

```ts
export function boshla(
  fragen: PublicFrage[],
  seansId: string = crypto.randomUUID(),
): SeansHolati {
  return {
    seansId,
    jami: fragen.length,
    navbat: [...fragen],
    tugatilgan: 0,
    togri: 0,
    xatolar: [],
    qaytganlar: [],
  };
}
```

Yangi funksiya (`joriy` dan keyin):

```ts
/**
 * Serverga yuboriladigan `attemptNo`: qaytish huquqini ishlatgan material
 * — o'rinbosar savol — 2, aks holda 1. `qaytganlar` allaqachon aynan shu
 * ma'lumotni saqlaydi; alohida bayroq kerak emas.
 */
export function urinishRaqami(h: SeansHolati, frage: PublicFrage): 1 | 2 {
  return h.qaytganlar.includes(kalit(frage)) ? 2 : 1;
}
```

`ersatzKeldi`:

```ts
/**
 * Serverdan almashtiruvchi savol keldi (yoki kelmadi).
 *
 * `null` — bu material uchun boshqa format qurib bo'lmadi. Savol
 * tugatilgan hisoblanadi: so'z ertaga Leitner jadvali orqali qaytadi.
 *
 * `aslIndex` — asl savolning `index`i. Server o'rinbosarni doim `index: 0`
 * bilan qaytaradi (`toPublic(nomzod, 0)`); statistikada esa o'rinbosar
 * YANGI savol emas, o'sha savolning 2-urinishi (dizayn 3-bo'lim), shuning
 * uchun `questionIndex` asl savolniki bo'lishi shart.
 */
export function ersatzKeldi(
  h: SeansHolati,
  frage: PublicFrage | null,
  aslIndex: number,
): SeansHolati {
  if (!frage) {
    return { ...h, tugatilgan: h.tugatilgan + 1 };
  }
  return { ...h, navbat: [...h.navbat, { ...frage, index: aslIndex }] };
}
```

`types.ts` oxiriga:

```ts
/** `POST wiederholung/abschluss` va (kelajakda) seans statistikasi javobi. */
export interface SeansYakun {
  questionCount: number;
  firstTryCorrect: number;
}
```

`queries.ts`: `usePruefen` tanasi tipiga `sessionId?: string; questionIndex?: number; attemptNo?: 1 | 2; lessonId?: number;` qo'shing; `useJuftTekshir` tanasiga ham xuddi shu to'rttasi; `useAbschluss` tanasiga `sessionId?: string`. `useAbschluss` dan keyin:

```ts
/**
 * Takrorlash seansi yakuni — `DafSession` ni yopadi. `abschluss` dan farqi:
 * dars yo'q, ilgarilash keshi (`levels`/`unit`) o'zgarmaydi; `fortschritt`
 * ni `seans-ekrani` o'zi yangilaydi.
 */
export function useWiederholungAbschluss() {
  return useMutation<SeansYakun, unknown, { sessionId: string }>({
    mutationFn: (body) =>
      api.post(`${BASE}/wiederholung/abschluss`, body).then((r) => r.data),
  });
}
```

`SeansYakun` ni `types` importiga qo'shing.

- [ ] **Step 4: O'tishini tekshirish**

Run: `npm test -- seans-navbat` → PASS. `npm run typecheck` → `seans-ekrani.tsx` da `ersatzKeldi` 2 argument bilan chaqirilgani uchun XATO chiqadi — bu kutilgan, Task 8 tuzatadi. (Bu taskni Task 8 bilan bitta commitga qo'shish mumkin; alohida commit qilinsa typecheck vaqtincha yiqiladi — shuning uchun **Task 7 va 8 bitta commit**.)

---

### Task 8: Klient — seans ekrani maydonlarni yuboradi, takrorlash yakuni

**Files:**
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx` (`tekshir` ~216-232, `onJuft` ~256-277, `keyingi` ~360-400, yakun effekti ~411-475, importlar)

**Interfaces:**
- Consumes: Task 7 `urinishRaqami`, `ersatzKeldi(h, frage, aslIndex)`, `useWiederholungAbschluss`, `holat.seansId`.

- [ ] **Step 1: Import va hook**

Importga `urinishRaqami` (`../seans-navbat` dan) va `useWiederholungAbschluss` (`../queries` dan). `const abschluss = useAbschluss();` yonida: `const wiederholungAbschluss = useWiederholungAbschluss();`.

- [ ] **Step 2: `tekshir` — `pruefen.mutate` tanasi**

`durationMs: Date.now() - savolBoshi,` dan keyin:

```ts
        // Seans konteksti (dizayn 5.3): server urinishni seans, savol va
        // urinish raqami bilan yozadi. `holat` bu yerda `frage` bor ekan,
        // bo'sh emas (frage `joriy(holat)` dan keladi).
        sessionId: holat?.seansId,
        questionIndex: frage.index,
        attemptNo: holat ? urinishRaqami(holat, frage) : 1,
        lessonId: darsMi ? darsLessonId : undefined,
```

- [ ] **Step 3: `onJuft` — `juftTekshir.mutate` tanasi**

`durationMs: Date.now() - savolBoshi,` dan keyin AYNAN o'sha to'rt qator (`sessionId`, `questionIndex`, `attemptNo`, `lessonId`).

- [ ] **Step 4: `keyingi` — `ersatzKeldi` chaqiruvlari**

Ikkala joyda (`ersatzKeldi(yangi, ersatz)` va `ersatzKeldi(yangi, null)`) uchinchi argument: `frage.index`. Ya'ni `keyingiHolat = ersatzKeldi(yangi, ersatz, frage.index);` va `keyingiHolat = ersatzKeldi(yangi, null, frage.index);`.

- [ ] **Step 5: Yakun effekti — takrorlash ham yuboradi**

`if (!darsMi) return;` qatorini shu blok bilan almashtiring:

```ts
    if (!darsMi) {
      // Takrorlash endi ham tarixda qoladi (dizayn 5.1): dars yo'q, lekin
      // seans bor. Xato jim yutilmaydi — dars yakunidagi bilan bir xil sabab.
      wiederholungAbschluss.mutate(
        { sessionId: holat.seansId },
        {
          onError: (err) =>
            toast.error(getErrorMessage(err, "Natija saqlanmadi. Internetni tekshiring")),
        },
      );
      return;
    }
```

`abschluss.mutate` tanasiga `durationMs: tugashDavomiyligi.current,` dan keyin `sessionId: holat.seansId,`. Effekt bog'liqliklari izohiga `wiederholungAbschluss` ni qo'shing (u ham react-query'ning barqaror `.mutate`i — `abschluss` bilan bir xil sabab).

- [ ] **Step 6: Tekshirish**

Run (client): `npm run typecheck` → xatosiz; `npx eslint src` → 0 error; `npm test` → PASS; `npm run build` → muvaffaqiyatli.

- [ ] **Step 7: Qo'lda sinov (lokal)**

Backend (worktree'dan, boshqa sessiyaning `:4000` ini bosmasdan): `cd server && PORT=4300 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN="" TELEGRAM_ADMIN_BOT_TOKEN="" npm run start:dev`. Klient `client/.env.local` da `NEXT_PUBLIC_API_URL=http://localhost:4300/api` bilan `npm run dev -- --port 3000` (CORS faqat `:3000`). `student.localhost:3000` ga seed o'quvchi `906549532` / `123456` bilan kiring, `/portal/lernen` da bitta darsni oxirigacha ishlang (kamida bitta xato qiling), keyin Takrorlash seansini tugating. Bazada tekshiring:

```bash
cd server && node -e '
require("dotenv").config({quiet:true}); const {Client}=require("pg");
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
console.table((await c.query(`select id, kind, "lessonId", "questionCount", "firstTryCorrect", "finishedAt" is not null as done from "DafSession" order by "startedAt" desc limit 3`)).rows);
console.table((await c.query(`select "questionIndex" q, "attemptNo" n, format, score, "itemType", "itemId" from "DafAttempt" where "sessionId" is not null order by "createdAt" desc limit 15`)).rows);
await c.end();})()'
```
Expected: dars seansi `LESSON`, `done = true`, `questionCount = 12`; xato qilingan savolda `n = 1, score 0` va `n = 2` qatori bir xil `q` bilan; takrorlash seansi `REVIEW`, `lessonId` null, `done = true`.

- [ ] **Step 8: Commit (Task 7 + 8 birga)**

```bash
git add src/components/student-portal/lernen
git commit -m "Portal seansga uuid beradi, javoblarga seans/savol/urinish konteksti; takrorlash yakuni

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: ADR va hujjat holati

**Files:**
- Create: `docs/adr/0019-mashq-natijasi-umumiy-shartnoma.md`
- Modify: `docs/adr/README.md` (jadvalga qator)
- Modify: `docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md` (`**Holati:**` qatori)

- [ ] **Step 1: ADR**

```markdown
# 0019. Mashq natijasi umumiy shartnomaga yoziladi, ko'nikma o'qishda hisoblanadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-13
**Bog'liq:** [0011](0011-oquv-ozagi-standartga-boglanadi.md) (Goethe o'qi),
[dizayn hujjati](../superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md) (5-bo'lim)

## Kontekst

O'qituvchi va admin o'quvchining mashq statistikasini ko'rishi kerak: to'g'ri javob
foizi, ko'nikma bo'yicha ajratish, seanslar tarixi, guruh qiynalayotgan so'zlar.
Hozirgi `DafAttempt` yozuvi bunga yetmasdi: urinish qaysi seans, savol va formatga
tegishli ekanini saqlamasdi; juftlash har bosishni alohida qator yozardi; xato
javob boshqa formatda qayta so'ralardi — qatorlarni sanash noto'g'ri foiz berardi;
takrorlash seansi hech qayerda qolmasdi.

Mashq formatlari ko'payib boradi (12 → 14 → …). Statistika formatga bog'lansa,
har yangi format uni buzadi.

## Qaror

1. **Har urinish umumiy shartnoma bilan yoziladi:** `sessionId`, `questionIndex`,
   `attemptNo` (1 — asl, 2 — o'rinbosar), `lessonId`, `itemType`, `itemId`,
   `format` (matn, enum emas), `score` (0..1), `gradingStatus`
   (`GRADED | PENDING | UNGRADED`). Statistika faqat shu maydonlarni o'qiydi va
   format nima ekanini bilmaydi.
2. **Seans natijasi serverda urinishlardan hisoblanadi** (`DafSession`), klient
   aytgan `richtig` ga ishonilmaydi. «To'g'ri javob %» — birinchi urinish bo'yicha,
   o'quvchi natija ekranidagi ta'rif bilan bir xil.
3. **Ko'nikma bazada saqlanmaydi** — o'qish paytida `format → ko'nikma` reyestridan
   (`format-skill.ts`). Xarita o'zgarsa eski natijalar ham yangi xarita bo'yicha
   ko'rinadi. Nafaqadagi formatlar reyestrda qoladi.
4. Ko'nikma qoidasi: o'quvchi mashqda **amalda nima qilyapti** (tayyor iborani
   tanlash — Wortschatz, Sprechen emas).

## Oqibatlar

- Yangi maydonlar ixtiyoriy: eski klient va eski DiB yo'llari buzilmaydi, ularning
  urinishlari savolga asoslangan ko'rsatkichlardan chetda qoladi.
- Kelajakda ko'nikma mashqning o'zida belgilansa (ADR-0011 yo'li), u reyestrdan
  ustun bo'ladi — statistika kodi o'zgarmaydi.
- Bitta format bitta ko'nikma degan faraz mukammal emas; foizlar tendensiya,
  tashxis emas.
```

`docs/adr/README.md` jadvaliga (0018 qatoridan keyin):

```markdown
| [0019](0019-mashq-natijasi-umumiy-shartnoma.md) | Mashq natijasi umumiy shartnomaga yoziladi, ko'nikma o'qishda hisoblanadi | Qabul qilindi | 2026-09-13 |
```

Spec `**Holati:**` qatorini: `dizayn CEO tomonidan tasdiqlangan (13.09.2026); 1-bosqich (mashq yozuvini boyitish) kodda, deploy qilinmagan; 2–4 bosqichlar amalga oshirilmagan`.

- [ ] **Step 2: Yakuniy tekshiruv**

Server: `npm test && npm run typecheck && npm run build`. Klient: `npm test && npm run typecheck && npx eslint src && npm run build`. Hammasi xatosiz bo'lsagina keyingi qadam.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0019-mashq-natijasi-umumiy-shartnoma.md docs/adr/README.md docs/superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md
git commit -m "ADR-0019: mashq natijasi umumiy shartnoma, ko'nikma o'qishda

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Deploy eslatmasi (reja tashqarisida, CEO ruxsati bilan)

1. PR → `main` (asosiy katalogga `checkout` qilinmaydi: `git branch -f main <shox>`).
2. Prod migratsiya **backenddan oldin**: `railway run -- npx prisma migrate deploy` (shadow DB kerak emas).
3. Backend: `railway up` (Railway GitHub'ga ulanmagan). Klient: Vercel avtomatik.
4. Deploydan keyin prod da bitta seans ishlab, Task 8 Step 7 dagi so'rov bilan `DafSession` qatorlarini tekshirish.
