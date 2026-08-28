# DaF A1 — Kontent poydevori (Reja A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A1 darajasi 20 ta teng bo'limga qayta bo'linadi va har bo'lim o'z
lug'ati, yasalgan gaplari, ovozi va rasmlari bilan bazada turadi.

**Architecture:** Bo'lim chegaralari `server/content/daf/a1-units.json` da
qo'lda yoziladi va seed uni o'qiydi; fayl da'vo qilmagan boblar eski
bob-bo'lim yo'lida qoladi (A2/B1 ishlashda davom etadi). Gaplar manbadan
ko'chirilmaydi — bo'limning o'z lug'atidan yasaladi va validator har
mazmunli so'zni tekshiradi. Rasm va ovoz fal.ai dan olinadi, mavjud
`R2Uploader.uploadMissing()` ular URL'ini R2 ga ko'chiradi.

**Tech Stack:** NestJS · Prisma 7 (`PrismaPg` adapter) · PostgreSQL ·
ts-node skriptlar · fal.ai (`fal-ai/flux/schnell`,
`fal-ai/chatterbox/text-to-speech/multilingual`) · Jest

**Spec:** [2026-08-28-daf-a1-mashq-tizimi-design.md](../specs/2026-08-28-daf-a1-mashq-tizimi-design.md)

## Global Constraints

- `DafLevel` faqat uchta qiymat: `A1`, `A2`, `B1`. `DafLessonKind` enum'i o'chadi.
- Bo'lim **30–50 so'z** (maqsad 40), ichida **aynan 5 bosqich** (`tier` 1–5).
- A1 ning 47 lug'at mavzusining **hammasi** aynan bitta bo'limga tegishli bo'lishi shart; tegmagani qolsa seed **yiqiladi**.
- Yasalgan gapdagi har bir mazmunli so'z shu bo'limda yoki **oldingi** bo'limlarda o'rganilgan bo'lishi shart. Shartni buzgan gap rad etiladi va qayta so'raladi; **uch urinishdan keyin tashlanadi**.
- Rasm so'rovining uslub qismi **aynan** shu: `Soft rounded 3D illustration, claymation style: <sahna>. Friendly pastel colors, gentle soft shadows, plain light neutral background, subject fills most of the frame, centered. No text, no letters, no words, no writing anywhere.`
- Rasmda **yozuv bo'lmasligi shart**. Bayroqlar sun'iy intellektdan olinmaydi.
- Rasm faqat `picturable = true` so'zlarga chiziladi. Har bo'limdan keyin **odam ko'rigi** — skript keyingi bo'limga o'zi o'tmaydi.
- Kontent JSON'lari **git'da**, baytlar **R2 da**. Media baytlari git'ga hech qachon kirmaydi.
- `FAL_KEY` faqat muhit o'zgaruvchisi. Kalit repo'ga **hech qachon** yozilmaydi.
- Kod izohlari o'zbekcha (Lotin). `CLAUDE.md` ingliz tili qoidasi faqat o'sha faylga tegishli.
- Har task oxirida: `npx jest <fayl>` yashil, `npm run typecheck` toza, `npx prettier --write` tegilgan fayllarga.
- Prisma migratsiyasi: `migrate dev` bu repo'da ishlamaydi. `migrate diff` → `db execute` → `migrate resolve` ishlatiladi (dev), prod'ga `migrate deploy`.

## Prerequisite (odam bajaradi)

`server/.env` ga `FAL_KEY=<fal.ai kaliti>` qo'shiladi. Kalit
[fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) dan olinadi.
`.env` allaqachon `.gitignore` da.

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
| --- | --- |
| `prisma/schema.prisma` | Model o'zgarishi (Task 1) |
| `prisma/migrations/<ts>_daf_a1_structure/migration.sql` | Enum ko'chirish + yangi jadvallar (Task 1) |
| `server/content/daf/a1-units.json` | 20 bo'limning qo'lda yozilgan chegarasi (Task 2) |
| `src/daf/units/a1-units.types.ts` | Fayl shakli (Task 2) |
| `src/daf/units/a1-units.validate.ts` | Fayl qoidalarini tekshirish (Task 2) |
| `src/daf/seed/daf-seed.service.ts` | Bo'lim/dars qurishni fayldan o'qishga o'tkazish (Task 3) |
| `src/daf/sentence/sentence-validate.ts` | Gapdagi notanish so'zni topish (Task 4) |
| `src/daf/sentence/sentence-generate.ts` | So'rov qurish, javobni o'qish, qayta urinish (Task 5) |
| `scripts/daf-gen-sentences.ts` | Gap yasash skripti (Task 5) |
| `server/content/daf/sentences.json` | Yasalgan gaplar (Task 5 natijasi) |
| `src/daf/seed/daf-sentence-seed.ts` | Gaplarni bazaga yozish (Task 6) |
| `src/daf/media/picturable.ts` | Aniq/abstrakt ajratish qoidalari (Task 7) |
| `scripts/daf-mark-picturable.ts` | Belgilash skripti (Task 7) |
| `server/content/daf/picturable.json` | Belgilash natijasi (Task 7) |
| `src/daf/media/fal-client.ts` | fal.ai ga yagona kirish nuqtasi (Task 8) |
| `src/daf/media/image-prompt.ts` | Rasm so'rovini qurish (Task 8) |
| `src/daf/media/media-keys.ts` | R2 kalitlarini yasash — rasm va ovoz (Task 8, 9) |
| `scripts/daf-gen-images.ts` | Bo'lim rasmlari (Task 8) |
| `scripts/daf-gen-tts.ts` | Gap ovozlari (Task 9) |

---

## Task 1: Ma'lumot modeli

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_daf_a1_structure/migration.sql`
- Test: `src/daf/daf-schema.spec.ts`

**Interfaces:**
- Consumes: hech narsa
- Produces: `DafLevel` = `'A1' | 'A2' | 'B1'`; `DafLesson.tier: number`;
  `DafLexeme.picturable: boolean`; `DafSentence`, `DafLexemeState`,
  `DafLessonProgress` modellari; `DafSentenceOrigin` = `'GENERATED' | 'SOURCE'`

- [ ] **Step 1: Mavjud sxema testini o'qing**

Run: `sed -n '1,40p' src/daf/daf-schema.spec.ts`

Bu fayl sxemani matn sifatida o'qib tekshiradi. Yangi tekshiruvlarni shu
uslubda yozing.

- [ ] **Step 2: Yiqiladigan testni yozing**

`src/daf/daf-schema.spec.ts` oxiriga qo'shing:

```ts
describe('A1 strukturasi', () => {
  // Daraja o'quvchining bosqichi bo'lishi kerak, manbaning yorlig'i emas.
  // Goethe imtihonlari ham A1/A2/B1.
  it('DafLevel uchta qiymatga tushgan', () => {
    expect(schema).toMatch(/enum DafLevel \{\s*A1\s+A2\s+B1\s*\}/);
    expect(schema).not.toMatch(/A1_1/);
    expect(schema).not.toMatch(/A2_2/);
  });

  // Endi dars TURI emas, DARAJASI muhim: har bosqichda ham lug'at,
  // ham grammatika, ham eshitish bo'ladi.
  it('DafLesson kind o`rniga tier ishlatadi', () => {
    expect(schema).toMatch(/model DafLesson[\s\S]*?tier\s+Int/);
    expect(schema).not.toMatch(/enum DafLessonKind/);
    expect(schema).toMatch(/@@unique\(\[unitId, tier\]\)/);
  });

  it('DafSentence bo`limga bog`langan va kelib chiqishini saqlaydi', () => {
    expect(schema).toMatch(/model DafSentence[\s\S]*?origin\s+DafSentenceOrigin/);
    expect(schema).toMatch(/enum DafSentenceOrigin \{\s*GENERATED\s+SOURCE\s*\}/);
  });

  // «Qaysi so'z qaytishi kerak» savoliga butun urinishlar tarixidan
  // javob berish qimmat, shuning uchun holat saqlanadi.
  it('DafLexemeState o`quvchi va so`z bo`yicha yagona', () => {
    expect(schema).toMatch(/model DafLexemeState[\s\S]*?@@unique\(\[studentId, lexemeId\]\)/);
    expect(schema).toMatch(/model DafLexemeState[\s\S]*?@@index\(\[studentId, dueAt\]\)/);
  });

  it('DafLessonProgress o`quvchi va dars bo`yicha yagona', () => {
    expect(schema).toMatch(/model DafLessonProgress[\s\S]*?@@unique\(\[studentId, lessonId\]\)/);
  });

  // Rasmli savol turlari faqat aniq so'zlarga beriladi — `weil` ni
  // chizib bo'lmaydi.
  it('DafLexeme picturable bayrog`ini olgan', () => {
    expect(schema).toMatch(/model DafLexeme[\s\S]*?picturable\s+Boolean\s+@default\(false\)/);
  });
});
```

- [ ] **Step 3: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/daf-schema.spec.ts`
Expected: FAIL — `enum DafLevel` hamon `A1_1` ni o'z ichiga oladi.

- [ ] **Step 4: Sxemani o'zgartiring**

`prisma/schema.prisma` da:

```prisma
enum DafLevel {
  A1
  A2
  B1
}

enum DafSentenceOrigin {
  GENERATED
  SOURCE
}
```

`enum DafLessonKind { ... }` blokini **butunlay o'chiring**.

`model DafLesson` ichida `kind DafLessonKind` qatorini o'chirib, o'rniga:

```prisma
  /// Bo'lim ichidagi qiyinlik bosqichi, 1–5.
  ///
  /// Avval bu yerda `kind` (VOCAB/GRAMMAR) turardi. U dars TURINI
  /// bildirardi va grammatikani mashqdan uzib qo'yardi — o'quvchi
  /// qoidani o'qir, keyin ishlatmasdi. Endi har bosqichda ham lug'at,
  /// ham grammatika, ham eshitish bor; farq faqat qiyinlikda.
  tier Int
```

`@@unique([unitId, order])` ni `@@unique([unitId, tier])` ga almashtiring.
`progress DafLessonProgress[]` bog'lanishini qo'shing.

`model DafLexeme` ga qo'shing:

```prisma
  /// Rasm chizib bo'ladimi. `false` — abstrakt so'z (weil, Verantwortung).
  /// Rasmli savol turlari faqat `true` bo'lganlarga beriladi.
  picturable Boolean @default(false)

  states DafLexemeState[]
```

`model DafUnit` ga `sentences DafSentence[]` qo'shing.

Uchta yangi modelni qo'shing:

```prisma
/// Mashq uchun gap.
///
/// Manbadan olinmaydi: A1 dagi 252 qisqa gapning atigi 68 tasi (27 %)
/// o'quvchi bilgan so'zlardan tuzilgan edi. Qolganida notanish so'z bor,
/// ya'ni gap mashq emas, to'siq bo'lardi. Shuning uchun gap bo'limning
/// O'Z lug'atidan yasaladi va validator har so'zni tekshiradi.
model DafSentence {
  id        Int               @id @default(autoincrement())
  unitId    Int
  order     Int
  de        String
  uz        String
  /// R2 kaliti — TTS bilan yasalgan ovoz.
  audioKey  String?
  wordCount Int
  origin    DafSentenceOrigin
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  unit DafUnit @relation(fields: [unitId], references: [id])

  @@unique([unitId, order])
  @@index([unitId])
}

/// Bitta o'quvchining bitta so'z ustidagi holati — Leitner qutisi.
model DafLexemeState {
  id           Int      @id @default(autoincrement())
  studentId    Int
  lexemeId     Int
  /// 0–5. 0 = yangi yoki xato qilingan, 5 = mustahkam.
  strength     Int      @default(0)
  dueAt        DateTime
  lastSeenAt   DateTime
  correctCount Int      @default(0)
  wrongCount   Int      @default(0)
  companyId    Int

  student Student   @relation(fields: [studentId], references: [id])
  lexeme  DafLexeme @relation(fields: [lexemeId], references: [id])

  @@unique([studentId, lexemeId])
  @@index([studentId, dueAt])
  @@index([companyId])
}

/// Yo'l ekrani uchun: qaysi dars tugallangan.
model DafLessonProgress {
  id          Int       @id @default(autoincrement())
  studentId   Int
  lessonId    Int
  completedAt DateTime?
  /// 12 dan nechtasi birinchi urinishda to'g'ri bo'lgan.
  bestScore   Int       @default(0)
  runs        Int       @default(0)
  companyId   Int

  student Student   @relation(fields: [studentId], references: [id])
  lesson  DafLesson @relation(fields: [lessonId], references: [id])

  @@unique([studentId, lessonId])
  @@index([studentId])
  @@index([companyId])
}
```

`model Student` ga teskari bog'lanishlarni qo'shing:

```prisma
  dafLexemeStates   DafLexemeState[]
  dafLessonProgress DafLessonProgress[]
```

- [ ] **Step 5: Test o'tishini tasdiqlang**

Run: `npx jest src/daf/daf-schema.spec.ts`
Expected: PASS

- [ ] **Step 6: Migratsiyani yozing**

`migrate dev` bu repo'da ishlamaydi. Migratsiya SQL'ini `migrate diff`
bilan chiqaring:

```bash
cd server
mkdir -p prisma/migrations/20260828120000_daf_a1_structure
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script > prisma/migrations/20260828120000_daf_a1_structure/migration.sql
```

Chiqqan SQL'da enum qismini **qo'lda almashtiring**. Prisma enum
o'zgarishini «o'chir va qayta yarat» qilib chiqaradi, bu esa
`DafUnit.level` ustunidagi ma'lumotni yo'qotadi. O'rniga:

```sql
-- Enum O'RNIGA QO'YILADI, o'chirilmaydi: eski qiymatlar yangisiga
-- ko'chiriladi, shuning uchun mavjud bo'limlar yo'qolmaydi.
CREATE TYPE "DafLevel_new" AS ENUM ('A1', 'A2', 'B1');

ALTER TABLE "DafUnit" ALTER COLUMN "level" TYPE "DafLevel_new"
  USING (CASE
    WHEN "level"::text IN ('A1_1','A1_2') THEN 'A1'
    WHEN "level"::text IN ('A2_1','A2_2') THEN 'A2'
    ELSE 'B1' END)::"DafLevel_new";

DROP TYPE "DafLevel";
ALTER TYPE "DafLevel_new" RENAME TO "DafLevel";

-- `@@unique([level, order])` endi buziladi: ikki bo'lim bir xil
-- `A1 #1` bo'lib qoladi. Tartib vaqtincha `id` ga tenglashtiriladi,
-- yakuniy tartibni seed yozadi.
UPDATE "DafUnit" SET "order" = "id";
```

`DafLesson` uchun:

```sql
-- `kind` -> `tier`. Eski qiymat yo'qoladi, chunki VOCAB/GRAMMAR
-- ajratimi butunlay bekor qilindi; darslar seed tomonidan qayta
-- quriladi.
ALTER TABLE "DafLesson" DROP COLUMN "kind";
ALTER TABLE "DafLesson" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "DafLesson_unitId_order_key";
ALTER TABLE "DafLesson" ALTER COLUMN "tier" DROP DEFAULT;
DROP TYPE IF EXISTS "DafLessonKind";
```

`@@unique([unitId, tier])` indeksi hamda uchta yangi jadval Prisma
chiqargan SQL'dan o'z holicha olinadi.

- [ ] **Step 7: Dev bazaga qo'llang**

```bash
cd server
npx prisma db execute --file prisma/migrations/20260828120000_daf_a1_structure/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260828120000_daf_a1_structure
npx prisma generate
```

- [ ] **Step 8: Tekshiring**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

Run: `npm run typecheck`
Expected: `daf-seed.service.ts` da `kind` va `DafLessonKind` bo'yicha
xatolar — bu kutilgan, Task 3 da tuzatiladi. Shu xatolar ro'yxatini
Task 3 uchun saqlab qo'ying.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/daf/daf-schema.spec.ts
git commit -m "Daraja uchtaga tushdi, dars turi o'rnini bosqich egalladi

A1_1/A1_2 bo'linishi manbaning yorlig'i edi, o'quvchining emas.
DafLessonKind o'chdi: grammatikani alohida dars qilish uni mashqdan
uzib qo'yardi.

Enum o'rniga qo'yildi, o'chirilmadi — mavjud bo'limlar saqlandi."
```

---

## Task 2: `a1-units.json` va uning qoidalari

**Files:**
- Create: `server/content/daf/a1-units.json`
- Create: `src/daf/units/a1-units.types.ts`
- Create: `src/daf/units/a1-units.validate.ts`
- Test: `src/daf/units/a1-units.validate.spec.ts`

**Interfaces:**
- Consumes: Task 1 dagi `DafLevel`
- Produces:
  - `interface A1UnitSpec { order: number; titleUz: string; titleDe: string; sections: string[]; grammar: string[] }`
  - `interface A1UnitsFile { level: 'A1'; units: A1UnitSpec[] }`
  - `function validateA1Units(file: A1UnitsFile, sectionSizes: Map<string, number>, allSections: string[]): string[]` — muammolar ro'yxati, bo'sh massiv = toza

- [ ] **Step 1: Turlarni yozing**

`src/daf/units/a1-units.types.ts`:

```ts
/**
 * A1 bo'limlarining chegarasi — QO'LDA yoziladi.
 *
 * Avtomatik bo'lish mavzuni o'rtasidan kesadi va avtomatik sarlavha
 * o'qib bo'lmaydigan narsa beradi. Manbadagi 47 mavzuning hajmi 4 dan
 * 60 so'zgacha, ya'ni tenglashtirish odam qaroriga muhtoj.
 */
export interface A1UnitSpec {
  order: number;
  titleUz: string;
  titleDe: string;
  /** Manbadagi lug'at bo'limlarining `sourceId` lari. */
  sections: string[];
  /** Shu bo'limga biriktiriladigan grammatika sahifalari. */
  grammar: string[];
}

export interface A1UnitsFile {
  level: 'A1';
  units: A1UnitSpec[];
}
```

- [ ] **Step 2: Yiqiladigan testni yozing**

`src/daf/units/a1-units.validate.spec.ts`:

```ts
import { validateA1Units } from './a1-units.validate';
import type { A1UnitsFile } from './a1-units.types';

const sizes = new Map([['s1', 20], ['s2', 20], ['s3', 18], ['s4', 22]]);
const all = ['s1', 's2', 's3', 's4'];

function file(units: A1UnitsFile['units']): A1UnitsFile {
  return { level: 'A1', units };
}

const good = file([
  { order: 1, titleUz: 'Bir', titleDe: 'Eins', sections: ['s1', 's2'], grammar: [] },
  { order: 2, titleUz: 'Ikki', titleDe: 'Zwei', sections: ['s3', 's4'], grammar: [] },
]);

describe('validateA1Units', () => {
  it('to`g`ri faylga e`tiroz bildirmaydi', () => {
    expect(validateA1Units(good, sizes, all)).toEqual([]);
  });

  // Tegmagan mavzu — jimgina yo'qolgan kontent. Faza 1b da aynan shu
  // turdagi jimlik 256 mashqni yo'qotgan edi.
  it('bo`limga tegmagan mavzuni topadi', () => {
    const f = file([good.units[0]]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Hech bir bo'limga tegmagan mavzu: s3, s4",
    );
  });

  it('ikki bo`limda takrorlangan mavzuni topadi', () => {
    const f = file([
      { ...good.units[0], sections: ['s1', 's2'] },
      { ...good.units[1], sections: ['s2', 's3', 's4'] },
    ]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Bir necha bo'limda takrorlangan mavzu: s2",
    );
  });

  it('noma`lum mavzu identifikatorini topadi', () => {
    const f = file([
      { ...good.units[0], sections: ['s1', 's2'] },
      { ...good.units[1], sections: ['s3', 's4', 'yoq'] },
    ]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Manbada yo'q mavzu: yoq (2-bo'lim)",
    );
  });

  // Juda kichik bo'lim darsni bo'shatadi, juda katta bo'lim o'quvchini
  // cho'ktiradi. Ikkalasi ham 12 savollik darsni buzadi.
  it('juda kichik bo`limni topadi', () => {
    const small = new Map(sizes).set('s3', 2).set('s4', 3);
    expect(validateA1Units(good, small, all)).toContain(
      "2-bo'lim: 5 so'z — 30 dan kam",
    );
  });

  it('juda katta bo`limni topadi', () => {
    const big = new Map(sizes).set('s3', 40).set('s4', 40);
    expect(validateA1Units(good, big, all)).toContain(
      "2-bo'lim: 80 so'z — 50 dan ko'p",
    );
  });

  it('tartib raqamlari uzluksiz 1 dan boshlanishini talab qiladi', () => {
    const f = file([good.units[0], { ...good.units[1], order: 5 }]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Tartib raqamlari uzluksiz emas: 1, 5",
    );
  });
});
```

- [ ] **Step 3: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/units/a1-units.validate.spec.ts`
Expected: FAIL — `Cannot find module './a1-units.validate'`

- [ ] **Step 4: Validatorni yozing**

`src/daf/units/a1-units.validate.ts`:

```ts
import type { A1UnitsFile } from './a1-units.types';

export const MIN_WORDS = 30;
export const MAX_WORDS = 50;

/**
 * Bo'lim faylini tekshiradi va muammolar ro'yxatini qaytaradi.
 *
 * Muammo topilsa YIQILMAYDI, ro'yxat qaytaradi — chaqiruvchi hammasini
 * bir yo'la ko'rsatishi uchun. Bittalab yiqilish faylni tuzatishni
 * o'nlab yugurishga aylantirardi.
 */
export function validateA1Units(
  file: A1UnitsFile,
  sectionSizes: Map<string, number>,
  allSections: string[],
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();

  for (const u of file.units) {
    for (const s of u.sections) {
      if (!sectionSizes.has(s)) {
        problems.push(`Manbada yo'q mavzu: ${s} (${u.order}-bo'lim)`);
        continue;
      }
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }

    const words = u.sections.reduce((n, s) => n + (sectionSizes.get(s) ?? 0), 0);
    if (words < MIN_WORDS) {
      problems.push(`${u.order}-bo'lim: ${words} so'z — ${MIN_WORDS} dan kam`);
    }
    if (words > MAX_WORDS) {
      problems.push(`${u.order}-bo'lim: ${words} so'z — ${MAX_WORDS} dan ko'p`);
    }
  }

  const dup = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
  if (dup.length > 0) {
    problems.push(`Bir necha bo'limda takrorlangan mavzu: ${dup.join(', ')}`);
  }

  const untouched = allSections.filter((s) => !seen.has(s));
  if (untouched.length > 0) {
    problems.push(`Hech bir bo'limga tegmagan mavzu: ${untouched.join(', ')}`);
  }

  const orders = file.units.map((u) => u.order);
  const expected = orders.map((_, i) => i + 1);
  if (orders.join(',') !== expected.join(',')) {
    problems.push(`Tartib raqamlari uzluksiz emas: ${orders.join(', ')}`);
  }

  return problems;
}
```

- [ ] **Step 5: Test o'tishini tasdiqlang**

Run: `npx jest src/daf/units/a1-units.validate.spec.ts`
Expected: PASS (7 test)

- [ ] **Step 6: Manbadagi mavzularni ro'yxatlang**

A1 = 1–4-boblar. Mavzular va hajmini chiqaring:

```bash
cd server
node -e "
const d=require('./content/daf/dib.json');
for (const s of d.sections.filter(x=>x.chapter<=4))
  console.log(s.id, (s.entries||[]).length, s.titleDe);
"
```

Chiqqan 47 qatorni Step 7 da ishlatasiz.

- [ ] **Step 7: `a1-units.json` ni yozing**

`server/content/daf/a1-units.json` — 20 bo'lim. Step 6 dagi mavzularni
**manba tartibini saqlagan holda** ketma-ket to'plang: joriy bo'limga
mavzu qo'shib boring, so'z soni 35 ga yetganda bo'limni yoping va
keyingisini boshlang. Sarlavhani mavzularning nemischa nomiga qarab
o'zingiz yozing (masalan `Begrüßungen` + `Persönliche Informationen`
→ `titleUz: "Tanishuv"`, `titleDe: "Sich vorstellen"`).

Grammatika sahifalarini shu bobning `d.grammar` ro'yxatidan mavzuga
ma'nan mos bo'limga biriktiring; bir sahifa faqat bitta bo'limga.

Boshlanish shakli:

```json
{
  "level": "A1",
  "units": [
    {
      "order": 1,
      "titleUz": "Tanishuv",
      "titleDe": "Sich vorstellen",
      "sections": ["voc_01_01_begr", "voc_01_02_werbistdu"],
      "grammar": ["gr_01_pronouns"]
    }
  ]
}
```

- [ ] **Step 8: Faylni validator bilan tekshiring**

```bash
cd server
npx ts-node -e "
require('dotenv/config');
const {validateA1Units}=require('./src/daf/units/a1-units.validate');
const d=require('./content/daf/dib.json');
const f=require('./content/daf/a1-units.json');
const sizes=new Map(d.sections.filter(x=>x.chapter<=4).map(s=>[s.id,(s.entries||[]).length]));
const all=[...sizes.keys()];
const p=validateA1Units(f,sizes,all);
console.log(p.length? p.join('\n') : 'TOZA');
"
```

Expected: `TOZA`. Muammo chiqsa faylni tuzatib qayta yuguring.

- [ ] **Step 9: Commit**

```bash
git add server/content/daf/a1-units.json src/daf/units/
git commit -m "A1 ning 20 bo'limi qo'lda chizildi va qoidalar bilan qo'riqlandi

Manbadagi 47 mavzuning hajmi 4 dan 60 so'zgacha — avtomatik bo'lish
mavzuni o'rtasidan kesardi. Validator tegmagan mavzuni, takrorni va
hajm chegarasini tekshiradi."
```

---

## Task 3: Seed bo'limlarni fayldan quradi

**Files:**
- Modify: `src/daf/seed/daf-seed.service.ts`
- Modify: `src/daf/seed/daf-seed.service.spec.ts`
- Modify: `scripts/daf-seed.ts`

**Interfaces:**
- Consumes: Task 2 ning `A1UnitsFile`, `validateA1Units`
- Produces: `DafSeedService.seed(dataset, translations?, a1Units?)` —
  `a1Units` berilsa A1 bo'limlari fayldan, berilmasa eski bob yo'lidan
  quriladi

- [ ] **Step 1: Yiqiladigan testni yozing**

`src/daf/seed/daf-seed.service.spec.ts` ga qo'shing:

```ts
describe('A1 bo`limlari fayldan quriladi', () => {
  // Fayl da'vo qilmagan bob eski yo'lda qoladi — aks holda A2/B1
  // seed'i shu o'zgarish bilan buzilardi.
  it('fayl da`vo qilmagan bob eski bob-bo`lim yo`lida qoladi', async () => {
    const report = await service.seed(dataset, undefined, a1UnitsFile);

    const a2 = await prisma.dafUnit.findMany({ where: { level: 'A2' } });
    expect(a2.length).toBeGreaterThan(0);
    expect(report.units).toBe(a1UnitsFile.units.length + a2.length);
  });

  it('bir bo`limga bir necha mavzuning so`zlarini yig`adi', async () => {
    await service.seed(dataset, undefined, a1UnitsFile);

    const unit = await prisma.dafUnit.findFirst({
      where: { level: 'A1', order: 1 },
      include: { lexemes: true },
    });
    expect(unit?.titleUz).toBe(a1UnitsFile.units[0].titleUz);
    expect(unit?.lexemes.length).toBeGreaterThanOrEqual(30);
  });

  // Har bo'limda aynan 5 bosqich — dars endi turi bilan emas,
  // darajasi bilan ajraladi.
  it('har A1 bo`limida aynan 5 bosqich yaratadi', async () => {
    await service.seed(dataset, undefined, a1UnitsFile);

    const units = await prisma.dafUnit.findMany({
      where: { level: 'A1' },
      include: { lessons: true },
    });
    for (const u of units) {
      expect(u.lessons.map((l) => l.tier).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  // Tegmagan mavzu — jimgina yo'qolgan kontent. Seed buni kechirmaydi.
  it('tegmagan mavzu qolsa yiqiladi', async () => {
    const broken = {
      ...a1UnitsFile,
      units: [a1UnitsFile.units[0]],
    };
    await expect(service.seed(dataset, undefined, broken)).rejects.toThrow(
      /tegmagan mavzu/i,
    );
  });
});
```

Fayl boshida `a1UnitsFile` ni haqiqiy fayldan yuklang:

```ts
import a1UnitsFile from '../../../content/daf/a1-units.json';
```

`tsconfig.json` da `resolveJsonModule` yoqilganini tekshiring; yoqilmagan
bo'lsa `JSON.parse(readFileSync(...))` ishlating.

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/seed/daf-seed.service.spec.ts`
Expected: FAIL — `seed` uchinchi argumentni qabul qilmaydi.

- [ ] **Step 3: `toDafLevel` ni yangilang**

`daf-seed.service.ts` da:

```ts
export function toDafLevel(level: CefrLevel): DafLevel {
  // A1.1/A1.2 bo'linishi manbaning yorlig'i edi. O'quvchi va Goethe
  // imtihoni uchun daraja bitta: A1.
  if (level === 'A1.1' || level === 'A1.2') return DafLevel.A1;
  if (level === 'A2.1' || level === 'A2.2') return DafLevel.A2;
  return DafLevel.B1;
}
```

- [ ] **Step 4: `seedUnits` ni ikki yo'lli qiling**

`seedUnits` ni shunday o'zgartiring: `a1Units` berilgan bo'lsa uning
bo'limlarini yaratadi va **qaysi mavzular fayl tomonidan da'vo
qilinganini** qaytaradi; da'vo qilinmagan boblar avvalgidek bob-bo'lim
bo'lib qoladi.

```ts
private async seedUnits(
  dataset: DafDataset,
  a1Units?: A1UnitsFile,
): Promise<{ unitIdBySection: Map<string, number>; unitCount: number }> {
  const unitIdBySection = new Map<string, number>();
  let unitCount = 0;

  const claimed = new Set<string>(
    a1Units?.units.flatMap((u) => u.sections) ?? [],
  );

  if (a1Units) {
    const sizes = new Map(
      dataset.sections
        .filter((s) => claimed.has(s.id))
        .map((s) => [s.id, s.entries.length] as const),
    );
    // Faylning o'z qoidalari — hajm, takror, tartib.
    const problems = validateA1Units(a1Units, sizes, [...claimed]);
    if (problems.length > 0) {
      throw new Error(`a1-units.json noto'g'ri:\n${problems.join('\n')}`);
    }

    // A1 ga tegishli, lekin fayl da'vo qilmagan mavzu — jimgina
    // yo'qolgan kontent. Bu yerda yiqilamiz.
    const a1Sections = dataset.sections.filter(
      (s) => toDafLevel(s.level) === DafLevel.A1,
    );
    const missed = a1Sections.filter((s) => !claimed.has(s.id));
    if (missed.length > 0) {
      throw new Error(
        `Hech bir bo'limga tegmagan mavzu: ${missed.map((s) => s.id).join(', ')}`,
      );
    }

    for (const u of a1Units.units) {
      const row = await this.prisma.dafUnit.upsert({
        where: { level_order: { level: DafLevel.A1, order: u.order } },
        create: {
          level: DafLevel.A1,
          order: u.order,
          titleUz: u.titleUz,
          titleDe: u.titleDe,
        },
        update: { titleUz: u.titleUz, titleDe: u.titleDe },
      });
      for (const s of u.sections) unitIdBySection.set(s, row.id);
      unitCount++;
    }
  }

  // Fayl da'vo qilmagan boblar — eski yo'l (A2, B1).
  for (const section of dataset.sections) {
    if (claimed.has(section.id)) continue;
    // …shu yerdan pastda MAVJUD bob-bo'lim mantiqi o'zgarishsiz
    // qoladi: bob raqamiga qarab `dafUnit.upsert` va natijani
    // `unitIdBySection.set(section.id, row.id)` …
  }

  return { unitIdBySection, unitCount };
}
```

Mavjud bob-bo'lim mantiqini o'zgartirmang. Uni shu tsikl ichiga
ko'chiring va yuqoridagi `continue` ni qo'shing — fayl da'vo qilgan
mavzu ikkinchi marta bo'lim yaratmasligi kerak.

Eski kod `DAF_UNIT_TITLES` dan sarlavha oladi va u A2/B1 uchun hamon
kerak, shuning uchun `src/daf/seed/daf-unit-titles.ts` **o'chirilmaydi**.
A1 ga tegishli qatorlar (1–4-boblar) esa endi ishlatilmaydi — ularni
faylda qoldiring va ustiga izoh yozing: `a1-units.json` A1 ni egallagan.

- [ ] **Step 5: `seedLessons` ni bosqichga o'tkazing**

Har bo'lim uchun aynan 5 dars yarating. `sourceId` barqaror bo'lishi
shart, aks holda har seed yangi dars yaratadi:

```ts
/** Dars identifikatori — bo'lim va bosqichdan, manbadan emas. */
export function lessonSourceId(level: DafLevel, order: number, tier: number) {
  return `lesson_${level}_${order}_t${tier}`;
}

const TIER_TITLES: { de: string; uz: string }[] = [
  { de: 'Kennenlernen', uz: 'Tanish' },
  { de: 'Bedeutung', uz: "Ma'no" },
  { de: 'Sätze', uz: 'Gap' },
  { de: 'Schreiben', uz: 'Yozish' },
  { de: 'Test', uz: 'Sinov' },
];
```

Bo'lim uchun 1–5 bosqichni `upsert` qiling (`where: { sourceId }`).

- [ ] **Step 6: `seedLexemes` ni mavzu→bo'lim xaritasiga bog'lang**

Lug'at yozuvining bo'limi endi bobdan emas, `unitIdBySection` dan
olinadi. Dars biriktirish esa bosqichga bog'lanmaydi — barcha so'zlar
**bo'limga** tegishli, dars ularni ish vaqtida oladi. `DafLexeme.lessonId`
ni `null` qoldiring.

- [ ] **Step 7: Grammatikani bo'limga biriktiring**

Bu qadam Faza 2 dagi **459 yetim mashqni ochadi**: ularning grammatika
sahifasiga hech bir bob ishora qilmasdi, endi `a1-units.json` uni
qo'lda biriktiradi.

Avval testni qo'shing:

```ts
// Faza 2 da mashqlarning 39 % iga bo'lim yo'lidan yetib bo'lmasdi.
// Fayl grammatikani qo'lda biriktirgani uchun yetim sahifa ham
// kerakli bo'limga ulanadi.
it('fayl ko`rsatgan grammatikani bo`limga ulaydi', async () => {
  await service.seed(dataset, undefined, a1UnitsFile);

  const first = a1UnitsFile.units[0];
  const unit = await prisma.dafUnit.findFirst({
    where: { level: 'A1', order: 1 },
    include: { grammar: true },
  });
  expect(unit?.grammar.map((g) => g.sourceId).sort()).toEqual(
    [...first.grammar].sort(),
  );
});

// Mashq grammatika orqali bo'limga yetib borishi kerak, aks holda
// u yana yetim qoladi.
it('grammatikaning mashqlari ham o`sha bo`limga tushadi', async () => {
  await service.seed(dataset, undefined, a1UnitsFile);

  const orphan = await prisma.dafExercise.count({
    where: { unitId: null, grammar: { unit: { level: 'A1' } } },
  });
  expect(orphan).toBe(0);
});
```

`seedGrammar` ni shunday o'zgartiring: `a1Units` berilgan bo'lsa,
grammatika sahifasining bo'limi **fayldan** olinadi (`grammar` ro'yxati
qaysi bo'limda tursa o'sha), fayl ko'rsatmagan sahifa esa avvalgidek
o'z bobining bo'limiga tushadi.

```ts
const unitIdByGrammar = new Map<string, number>();
for (const u of a1Units?.units ?? []) {
  const unitId = /* shu bo'limning id'si */;
  for (const g of u.grammar) unitIdByGrammar.set(g, unitId);
}
```

`seedExercises` da mashqning `unitId` si grammatika sahifasining
bo'limidan olinadi — mashq grammatikaga bog'langan bo'lsa, u
grammatika qayerda bo'lsa o'sha yerda.

- [ ] **Step 8: `seed()` imzosini kengaytiring**

```ts
async seed(
  dataset: DafDataset,
  translations?: TranslationFile,
  a1Units?: A1UnitsFile,
): Promise<SeedReport>
```

- [ ] **Step 9: Skriptni yangilang**

`scripts/daf-seed.ts` da `a1-units.json` ni o'qing va uchinchi argument
sifatida bering.

- [ ] **Step 10: Testlar o'tishini tasdiqlang**

Run: `npx jest src/daf/seed/`
Expected: PASS

Run: `npm run typecheck`
Expected: xatosiz (Task 1 dagi ro'yxat yopilgan)

- [ ] **Step 11: Dev bazada yuguring**

```bash
cd server && npm run daf:seed
```

Expected: `Bo'lim: 26` (A1 dan 20 + A2/B1 dan 6), `Dars: 100+`

Tekshiring:

```bash
npx ts-node -e "
require('dotenv/config');
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
p.dafUnit.findMany({where:{level:'A1'},orderBy:{order:'asc'},include:{_count:{select:{lexemes:true,lessons:true}}}})
 .then(u=>{u.forEach(x=>console.log(x.order,x.titleUz,x._count.lexemes,'so\'z',x._count.lessons,'dars'));return p.\$disconnect()});
"
```

Expected: 20 qator, har birida 30–50 so'z va 5 dars.

- [ ] **Step 12: Commit**

```bash
git add src/daf/seed/ scripts/daf-seed.ts
git commit -m "A1 bo'limlari fayldan quriladi, qolgan darajalar eski yo'lda

Seed endi ikki yo'lli: a1-units.json da'vo qilgan mavzular uning
bo'limlariga, qolgani avvalgidek bob-bo'lim bo'lib qoladi. Da'vo
qilinmagan A1 mavzusi qolsa seed yiqiladi."
```

---

## Task 4: Gap validatori

**Files:**
- Create: `src/daf/sentence/sentence-validate.ts`
- Test: `src/daf/sentence/sentence-validate.spec.ts`

**Interfaces:**
- Consumes: hech narsa (sof mantiq)
- Produces:
  - `function wordFormsOf(de: string): string[]`
  - `function cumulativeVocab(units: { sections: string[] }[], entriesBySection: Map<string, string[]>, upToIndex: number): Set<string>`
  - `function unknownWords(sentence: string, allowed: Set<string>): string[]`
  - `const FUNCTION_WORDS: Set<string>`

- [ ] **Step 1: Yiqiladigan testni yozing**

`src/daf/sentence/sentence-validate.spec.ts`:

```ts
import {
  wordFormsOf,
  cumulativeVocab,
  unknownWords,
  FUNCTION_WORDS,
} from './sentence-validate';

describe('wordFormsOf', () => {
  // Lug'at yozuvi ko'pincha ibora yoki bir necha shakl bo'ladi:
  // «Bis dann! / Bis später!», «das Land (die Länder)».
  it('ibora ichidagi barcha so`zlarni ajratadi', () => {
    expect(wordFormsOf('Bis dann! / Bis später!')).toEqual(
      expect.arrayContaining(['bis', 'dann', 'später']),
    );
  });

  it('qavs ichidagi ko`plik shaklini ham oladi', () => {
    expect(wordFormsOf('das Land (die Länder)')).toEqual(
      expect.arrayContaining(['das', 'land', 'die', 'länder']),
    );
  });

  it('bir harfli bo`laklarni tashlaydi', () => {
    expect(wordFormsOf('A, B, C')).toEqual([]);
  });
});

describe('cumulativeVocab', () => {
  const entries = new Map([
    ['s1', ['Hallo!']],
    ['s2', ['gehen']],
    ['s3', ['der Apfel']],
  ]);
  const units = [{ sections: ['s1'] }, { sections: ['s2'] }, { sections: ['s3'] }];

  // Gap faqat o'quvchi ALLAQACHON ko'rgan so'zlardan tuzilishi kerak —
  // kelajakdagi bo'limning so'zi hozir notanish.
  it('shu bo`lim va undan oldingilarni qamraydi', () => {
    const v = cumulativeVocab(units, entries, 1);
    expect(v.has('hallo')).toBe(true);
    expect(v.has('gehen')).toBe(true);
    expect(v.has('apfel')).toBe(false);
  });
});

describe('unknownWords', () => {
  const allowed = new Set(['heiße', 'anna']);

  it('tanish so`zlardan tuzilgan gapga e`tiroz bildirmaydi', () => {
    expect(unknownWords('Ich heiße Anna.', allowed)).toEqual([]);
  });

  // Manbadagi gaplarning 73 % i aynan shu sababdan yaroqsiz edi.
  it('notanish so`zni topadi', () => {
    expect(unknownWords('Ich heiße Anna aus Kalifornien.', allowed)).toEqual([
      'kalifornien',
    ]);
  });

  // Artikl, olmosh, bog'lovchi har bo'limda uchraydi va ularni
  // lug'atga qo'shib chiqish shart emas.
  it('yordamchi so`zlarni kechiradi', () => {
    expect(FUNCTION_WORDS.has('ich')).toBe(true);
    expect(unknownWords('Ich bin und der die das', allowed)).toEqual([]);
  });

  it('katta-kichik harf farqini hisobga olmaydi', () => {
    expect(unknownWords('HEISSE anna', new Set(['heisse', 'anna']))).toEqual([]);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/sentence/sentence-validate.spec.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 3: Validatorni yozing**

`src/daf/sentence/sentence-validate.ts`:

```ts
/**
 * Yasalgan gapni o'quvchining so'z boyligiga solishtiradi.
 *
 * Bu qoida bo'lmasa gap mashq emas, to'siq bo'ladi: manbadagi A1
 * gaplarining atigi 27 % i o'quvchi bilgan so'zlardan tuzilgan edi.
 * Faza 1b dagi javob kaliti qo'riqchisi bilan bir ruhda — tekshirilmagan
 * kontent jimgina buzadi.
 */

const WORD = /[a-zA-ZäöüÄÖÜß]+/g;

/** Lug'at yozuvidagi barcha so'z shakllari, kichik harfda. */
export function wordFormsOf(de: string): string[] {
  return (de.match(WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1);
}

/**
 * Artikl, olmosh, bog'lovchi, ko'makchi fe'l.
 *
 * Bular har bo'limda uchraydi va lug'at yozuvi sifatida alohida
 * o'rgatilmaydi, shuning uchun ularni notanish deb hisoblash validatorni
 * ishlatib bo'lmas holga keltirardi.
 */
export const FUNCTION_WORDS = new Set([
  'ich','du','er','sie','es','wir','ihr','man',
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer',
  'mein','dein','sein','ihre','unser','euer',
  'bin','bist','ist','sind','seid','war','waren',
  'habe','hast','hat','haben','habt',
  'und','oder','aber','denn','weil','dass','nicht','kein','keine',
  'in','an','auf','zu','von','mit','für','aus','bei','nach','über','um',
  'ja','nein','sehr','auch','noch','nur','schon','hier','da','dort',
  'wie','wo','was','wer','wann','warum','woher','wohin',
]);

/**
 * Shu bo'lim va undan OLDINGI bo'limlarning barcha so'z shakllari.
 *
 * Kelajakdagi bo'limning so'zi qo'shilmaydi — o'quvchi uni hali
 * ko'rmagan.
 */
export function cumulativeVocab(
  units: { sections: string[] }[],
  entriesBySection: Map<string, string[]>,
  upToIndex: number,
): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= upToIndex && i < units.length; i++) {
    for (const s of units[i].sections) {
      for (const de of entriesBySection.get(s) ?? []) {
        for (const form of wordFormsOf(de)) out.add(form);
      }
    }
  }
  return out;
}

/** Gapdagi ruxsat etilmagan so'zlar. Bo'sh massiv = gap yaroqli. */
export function unknownWords(sentence: string, allowed: Set<string>): string[] {
  return (sentence.match(WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1)
    .filter((w) => !allowed.has(w) && !FUNCTION_WORDS.has(w));
}
```

`cumulativeVocab` shu modulda turadi — u `unknownWords` bilan bir
savolga xizmat qiladi («bu so'z tanishmi?») va alohida faylga ajratish
ikkisini bir-biridan uzib qo'yardi.

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `npx jest src/daf/sentence/sentence-validate.spec.ts`
Expected: PASS (9 test)

- [ ] **Step 5: Haqiqiy kontentda o'lchang**

```bash
cd server
npx ts-node -e "
const {unknownWords,cumulativeVocab}=require('./src/daf/sentence/sentence-validate');
const d=require('./content/daf/dib.json');
const f=require('./content/daf/a1-units.json');
const entries=new Map(d.sections.map(s=>[s.id,(s.entries||[]).map(e=>e.de)]));
const v=cumulativeVocab(f.units,entries,f.units.length-1);
let ok=0,all=0;
for(const t of d.transcripts.filter(t=>t.chapter<=4))
  for(const l of t.linesDe){
    const n=(l.match(/[a-zA-ZäöüÄÖÜß]+/g)||[]).filter(w=>w.length>1).length;
    if(n<3||n>7) continue;
    all++; if(unknownWords(l,v).length===0) ok++;
  }
console.log(\`manbadagi qisqa gap: \${all}, toza: \${ok} (\${Math.round(ok/all*100)}%)\`);
"
```

Expected: ~27 % atrofida. Bu raqam spec'dagi o'lchov bilan mos kelishi
kerak — kelmasa lug'at yig'ilishida xato bor.

- [ ] **Step 6: Commit**

```bash
git add src/daf/sentence/
git commit -m "Gap validatori: notanish so'zli gap mashq emas, to'siq

A1 dagi manbadagi qisqa gaplarning atigi 27 % i o'quvchi bilgan
so'zlardan tuzilgan. Shuning uchun gaplar yasaladi va har mazmunli
so'z shu bo'limgacha to'plangan lug'atga solishtiriladi."
```

---

## Task 5: Gap generatori

**Files:**
- Create: `src/daf/sentence/sentence-generate.ts`
- Create: `scripts/daf-gen-sentences.ts`
- Test: `src/daf/sentence/sentence-generate.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 4 ning `unknownWords`, `cumulativeVocab`;
  `TranslateModel` (`src/daf/translate/translate-model.ts`) —
  `{ complete(prompt: string): Promise<string>; readonly name: string }`
- Produces:
  - `interface GeneratedSentence { de: string; uz: string }`
  - `function buildSentencePrompt(words: string[], examples: string[], count: number): string`
  - `function parseSentences(raw: string): GeneratedSentence[]`
  - `async function generateForUnit(model, opts): Promise<{ kept: GeneratedSentence[]; rejected: { de: string; unknown: string[] }[] }>`

- [ ] **Step 1: Yiqiladigan testni yozing**

`src/daf/sentence/sentence-generate.spec.ts`:

```ts
import {
  buildSentencePrompt,
  parseSentences,
  generateForUnit,
} from './sentence-generate';
import type { TranslateModel } from '../translate/translate-model';

function model(...replies: string[]): TranslateModel {
  const q = [...replies];
  return { name: 'test', complete: async () => q.shift() ?? '' };
}

describe('buildSentencePrompt', () => {
  it('ruxsat etilgan so`zlarni va namunani so`rovga qo`yadi', () => {
    const p = buildSentencePrompt(['heißen', 'kommen'], ['Wie heißt du?'], 5);
    expect(p).toContain('heißen');
    expect(p).toContain('Wie heißt du?');
    expect(p).toContain('5');
  });
});

describe('parseSentences', () => {
  it('har qatordan nemischa va o`zbekchani ajratadi', () => {
    expect(parseSentences('Ich heiße Anna. | Mening ismim Anna.\n')).toEqual([
      { de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
    ]);
  });

  it('ajratgichsiz qatorni tashlaydi', () => {
    expect(parseSentences('buzuq qator\nA. | B.')).toEqual([
      { de: 'A.', uz: 'B.' },
    ]);
  });

  it('bo`sh javobdan bo`sh ro`yxat qaytaradi', () => {
    expect(parseSentences('')).toEqual([]);
  });
});

describe('generateForUnit', () => {
  const allowed = new Set(['heiße', 'anna', 'komme']);

  it('toza gaplarni saqlaydi', async () => {
    const r = await generateForUnit(
      model('Ich heiße Anna. | Mening ismim Anna.'),
      { allowed, words: ['heißen'], examples: [], count: 1 },
    );
    expect(r.kept).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });

  // Tekshirilmagan generatsiya jimgina buzadi — shuning uchun
  // notanish so'zli gap qabul qilinmaydi.
  it('notanish so`zli gapni rad etadi va qayta so`raydi', async () => {
    const r = await generateForUnit(
      model(
        'Ich komme aus Kalifornien. | Men Kaliforniyadanman.',
        'Ich heiße Anna. | Mening ismim Anna.',
      ),
      { allowed, words: ['heißen'], examples: [], count: 1 },
    );
    expect(r.kept).toEqual([{ de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' }]);
    expect(r.rejected[0].unknown).toEqual(['kalifornien']);
  });

  // Cheksiz urinish skriptni qotirib qo'yardi.
  it('uch urinishdan keyin gapni tashlaydi', async () => {
    const bad = 'Ich komme aus Kalifornien. | Men Kaliforniyadanman.';
    const r = await generateForUnit(model(bad, bad, bad, bad), {
      allowed,
      words: ['heißen'],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/sentence/sentence-generate.spec.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 3: Generatorni yozing**

`src/daf/sentence/sentence-generate.ts`:

```ts
import type { TranslateModel } from '../translate/translate-model';
import { unknownWords } from './sentence-validate';

export interface GeneratedSentence {
  de: string;
  uz: string;
}

export const MAX_TRIES = 3;

export function buildSentencePrompt(
  words: string[],
  examples: string[],
  count: number,
): string {
  return [
    `Du bist Deutschlehrer. Schreibe ${count} kurze A1-Sätze (3–7 Wörter).`,
    '',
    'Regeln:',
    '- Benutze NUR diese Wörter und die häufigsten Funktionswörter:',
    words.join(', '),
    '- Jeder Satz muss natürlich und grammatisch korrekt sein.',
    '- Keine Eigennamen außer den unten gezeigten.',
    '',
    examples.length > 0 ? 'Beispiele für den Stil:' : '',
    ...examples.slice(0, 8),
    '',
    'Format — eine Zeile pro Satz, Deutsch und Usbekisch mit "|" getrennt:',
    'Ich heiße Anna. | Mening ismim Anna.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function parseSentences(raw: string): GeneratedSentence[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const [de, uz] = l.split('|');
      return { de: de.trim(), uz: uz.trim() };
    })
    .filter((s) => s.de.length > 0 && s.uz.length > 0);
}

export interface GenerateOpts {
  allowed: Set<string>;
  words: string[];
  examples: string[];
  count: number;
}

/**
 * Bo'lim uchun gaplar. Rad etilgan gap qayta so'raladi, lekin ko'pi
 * bilan `MAX_TRIES` marta — cheksiz urinish skriptni qotirib qo'yardi.
 */
export async function generateForUnit(
  model: TranslateModel,
  opts: GenerateOpts,
): Promise<{
  kept: GeneratedSentence[];
  rejected: { de: string; unknown: string[] }[];
}> {
  const kept: GeneratedSentence[] = [];
  const rejected: { de: string; unknown: string[] }[] = [];

  for (let tries = 0; tries < MAX_TRIES && kept.length < opts.count; tries++) {
    const need = opts.count - kept.length;
    const raw = await model.complete(
      buildSentencePrompt(opts.words, opts.examples, need),
    );

    for (const s of parseSentences(raw)) {
      if (kept.length >= opts.count) break;
      const bad = unknownWords(s.de, opts.allowed);
      if (bad.length > 0) {
        rejected.push({ de: s.de, unknown: bad });
        continue;
      }
      kept.push(s);
    }
  }

  return { kept, rejected };
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `npx jest src/daf/sentence/sentence-generate.spec.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Skriptni yozing**

`scripts/daf-gen-sentences.ts` — `scripts/daf-translate.ts` ni namuna
qilib oling (model qurish, `OPENAI_API_KEY` o'qish, natijani JSON ga
yozish). Skript:

1. `content/daf/dib.json` va `content/daf/a1-units.json` ni o'qiydi;
2. har bo'lim uchun `cumulativeVocab(units, entries, i)` bilan ruxsat
   etilgan to'plamni quradi;
3. namuna sifatida manbadagi **toza** gaplarni beradi (Task 4 Step 5
   dagi o'lchov mantiqi bilan tanlanadi, bo'limiga eng ko'pi 8 ta);
4. `generateForUnit(model, { count: 30, ... })` ni chaqiradi;
5. natijani `content/daf/sentences.json` ga yozadi:

```jsonc
{
  "generatedAt": "2026-08-28T00:00:00.000Z",
  "model": "gpt-4o-mini",
  "units": [
    { "order": 1, "sentences": [{ "de": "…", "uz": "…" }] }
  ]
}
```

6. oxirida hisobot bosadi: bo'limiga saqlangan va rad etilgan gaplar
   soni, hamda eng ko'p uchragan notanish so'zlar.

Idempotentlik: mavjud `sentences.json` bo'lsa, faqat **gapi yetishmagan**
bo'limlar uchun model chaqiriladi. `--force` bayrog'i hammasini qayta
yasaydi.

- [ ] **Step 6: `package.json` ga buyruq qo'shing**

```json
"daf:gen-sentences": "ts-node scripts/daf-gen-sentences.ts",
```

- [ ] **Step 7: Bitta bo'limda sinab ko'ring**

```bash
cd server && npx ts-node scripts/daf-gen-sentences.ts --unit 1
```

Chiqqan 30 gapni **o'qib chiqing**. Grammatik xato yoki g'alati gap
bo'lsa so'rovni tuzatib qayta yuguring. Bu qadam avtomatlashtirilmaydi.

- [ ] **Step 8: Hammasini yasang**

```bash
cd server && npm run daf:gen-sentences
```

Expected: 20 bo'lim, har birida ~30 gap; rad etish darajasi 40 % dan
past. Yuqori bo'lsa so'rovdagi so'z ro'yxati juda tor demak — hisobot
qaysi so'zlar rad etilganini ko'rsatadi.

- [ ] **Step 9: Commit**

```bash
git add src/daf/sentence/sentence-generate.ts scripts/daf-gen-sentences.ts \
        server/content/daf/sentences.json package.json
git commit -m "Gaplar bo'limning o'z lug'atidan yasaladi

Har gap validatordan o'tadi; o'tmagani qayta so'raladi va uch
urinishdan keyin tashlanadi. Natija git'da — model chaqiruvi bir
marta bo'ladi."
```

---

## Task 6: Gaplarni bazaga yozish

**Files:**
- Create: `src/daf/seed/daf-sentence-seed.ts`
- Test: `src/daf/seed/daf-sentence-seed.spec.ts`
- Modify: `src/daf/seed/daf-seed.service.ts`

**Interfaces:**
- Consumes: Task 5 ning `sentences.json` shakli; Task 1 ning `DafSentence`
- Produces: `async function seedSentences(prisma, file): Promise<number>`

- [ ] **Step 1: Yiqiladigan testni yozing**

`src/daf/seed/daf-sentence-seed.spec.ts`:

```ts
import { seedSentences, countWords } from './daf-sentence-seed';

describe('countWords', () => {
  it('gapdagi so`zlarni sanaydi', () => {
    expect(countWords('Ich heiße Anna.')).toBe(3);
  });
  it('tinish belgisini so`z deb sanamaydi', () => {
    expect(countWords('Hallo! Wie geht es dir?')).toBe(5);
  });
});

describe('seedSentences', () => {
  it('bo`limga gaplarni yozadi va sonini qaytaradi', async () => {
    const n = await seedSentences(prisma, {
      generatedAt: 'x', model: 'm',
      units: [{ order: 1, sentences: [{ de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' }] }],
    });
    expect(n).toBe(1);

    const row = await prisma.dafSentence.findFirst();
    expect(row).toMatchObject({ de: 'Ich heiße Anna.', wordCount: 3, origin: 'GENERATED' });
  });

  // Qayta yugurish yangi qator yaratmasligi kerak, aks holda har
  // seed bazani ikkilantirardi.
  it('ikki marta yugursa qator ikkilanmaydi', async () => {
    const file = {
      generatedAt: 'x', model: 'm',
      units: [{ order: 1, sentences: [{ de: 'A.', uz: 'B.' }] }],
    };
    await seedSentences(prisma, file);
    await seedSentences(prisma, file);
    expect(await prisma.dafSentence.count()).toBe(1);
  });

  // Ovoz kaliti mashina o'lchovi, tarjima esa tahrir — biri
  // ikkinchisini bosib ketmasligi kerak.
  it('mavjud audioKey ni o`chirmaydi', async () => {
    const file = {
      generatedAt: 'x', model: 'm',
      units: [{ order: 1, sentences: [{ de: 'A.', uz: 'B.' }] }],
    };
    await seedSentences(prisma, file);
    await prisma.dafSentence.updateMany({ data: { audioKey: 'k.mp3' } });
    await seedSentences(prisma, file);
    expect((await prisma.dafSentence.findFirst())?.audioKey).toBe('k.mp3');
  });

  it('bo`lim topilmasa yiqiladi', async () => {
    await expect(
      seedSentences(prisma, {
        generatedAt: 'x', model: 'm',
        units: [{ order: 99, sentences: [{ de: 'A.', uz: 'B.' }] }],
      }),
    ).rejects.toThrow(/99/);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/seed/daf-sentence-seed.spec.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 3: Yozing**

`src/daf/seed/daf-sentence-seed.ts`:

```ts
import type { PrismaService } from '../../prisma/prisma.service';

export interface SentenceFile {
  generatedAt: string;
  model: string;
  units: { order: number; sentences: { de: string; uz: string }[] }[];
}

export function countWords(s: string): number {
  return (s.match(/[a-zA-ZäöüÄÖÜß]+/g) ?? []).length;
}

/**
 * Gaplarni bazaga yozadi.
 *
 * `audioKey` ATAYLAB yangilanmaydi: u TTS o'lchovining natijasi, gap
 * matnining tahriri emas. Ikkalasini bir upsert'da yangilash keyingi
 * seed'da butun ovozni o'chirib yuborardi.
 */
export async function seedSentences(
  prisma: PrismaService,
  file: SentenceFile,
): Promise<number> {
  let n = 0;

  for (const u of file.units) {
    const unit = await prisma.dafUnit.findFirst({
      where: { level: 'A1', order: u.order },
    });
    if (!unit) throw new Error(`Bo'lim topilmadi: A1 #${u.order}`);

    for (const [i, s] of u.sentences.entries()) {
      await prisma.dafSentence.upsert({
        where: { unitId_order: { unitId: unit.id, order: i + 1 } },
        create: {
          unitId: unit.id,
          order: i + 1,
          de: s.de,
          uz: s.uz,
          wordCount: countWords(s.de),
          origin: 'GENERATED',
        },
        update: { de: s.de, uz: s.uz, wordCount: countWords(s.de) },
      });
      n++;
    }
  }

  return n;
}
```

- [ ] **Step 4: Seed'ga ulang**

`daf-seed.service.ts` ning `seed()` iga to'rtinchi ixtiyoriy argument
`sentences?: SentenceFile` qo'shing va bo'limlar yaratilgandan **keyin**
`seedSentences` ni chaqiring. `SeedReport` ga `sentences: number`
maydonini qo'shing.

`scripts/daf-seed.ts` da `sentences.json` mavjud bo'lsa o'qib bering.

- [ ] **Step 5: Testlar o'tishini tasdiqlang**

Run: `npx jest src/daf/seed/`
Expected: PASS

- [ ] **Step 6: Dev bazada yuguring**

```bash
cd server && npm run daf:seed
```

Expected: hisobotda `Gap: 600` atrofida

- [ ] **Step 7: Commit**

```bash
git add src/daf/seed/ scripts/daf-seed.ts
git commit -m "Gaplar bazaga tushdi, audioKey tegilmay qoladi

Ovoz kaliti TTS o'lchovining natijasi, gap matnining tahriri emas —
bitta upsert'da yangilansa keyingi seed butun ovozni o'chirardi."
```

---

## Task 7: `picturable` belgilash

**Files:**
- Create: `src/daf/media/picturable.ts`
- Create: `scripts/daf-mark-picturable.ts`
- Test: `src/daf/media/picturable.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `TranslateModel`
- Produces:
  - `function buildPicturablePrompt(items: { de: string; en: string }[]): string`
  - `function parsePicturable(raw: string, expected: number): boolean[]`
  - `const COUNTRIES: Set<string>` — A1 lug'atidagi 12 mamlakat nomi
  - `function isCountry(de: string): boolean` — artiklni tashlab solishtiradi

- [ ] **Step 1: Yiqiladigan testni yozing**

`src/daf/media/picturable.spec.ts`:

```ts
import {
  buildPicturablePrompt,
  parsePicturable,
  isCountry,
  COUNTRIES,
} from './picturable';

describe('isCountry', () => {
  // Flux bayroqlarni xato chizadi. Mamlakatlar uchun tayyor bayroq
  // aktivlari ishlatiladi, generatsiya emas.
  it('mamlakat nomini taniydi', () => {
    expect(isCountry('Deutschland')).toBe(true);
    expect(isCountry('die Schweiz')).toBe(true);
    expect(isCountry('gehen')).toBe(false);
  });

  it('A1 dagi 12 mamlakatni qamraydi', () => {
    for (const c of ['Belgien','Italien','Deutschland','Kanada','Luxemburg',
                     'Polen','Österreich','Mexiko','Frankreich','Spanien'])
      expect(COUNTRIES.has(c)).toBe(true);
  });
});

describe('parsePicturable', () => {
  it('ha/yo`q javobini o`qiydi', () => {
    expect(parsePicturable('1. ha\n2. yo`q\n3. ha', 3)).toEqual([true, false, true]);
  });

  // Javob soni so'ralganidan farq qilsa, qaysi so'zga qaysi javob
  // tegishli ekani noma'lum bo'lib qoladi.
  it('javob soni mos kelmasa yiqiladi', () => {
    expect(() => parsePicturable('1. ha', 3)).toThrow(/3/);
  });
});

describe('buildPicturablePrompt', () => {
  it('nemischa va inglizchani birga beradi', () => {
    const p = buildPicturablePrompt([{ de: 'der Apfel', en: 'the apple' }]);
    expect(p).toContain('der Apfel');
    expect(p).toContain('the apple');
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/media/picturable.spec.ts`
Expected: FAIL — modul yo'q

- [ ] **Step 3: Yozing**

`src/daf/media/picturable.ts`. `COUNTRIES` to'plamiga A1 lug'atidagi
mamlakat nomlarini yozing (`Belgien`, `Italien`, `Deutschland`,
`die Niederlande`, `Kanada`, `Luxemburg`, `Polen`, `Österreich`,
`Mexiko`, `die Schweiz`, `Frankreich`, `Spanien`). `isCountry` artiklni
tashlab solishtiradi.

`buildPicturablePrompt` modeldan har so'z uchun «rasm bilan aniq
ko'rsatib bo'ladimi» degan savolga `ha`/`yo'q` so'raydi, nemischa va
inglizcha ma'noni birga beradi (nemischa yolg'iz ko'p ma'noli).

`parsePicturable` javob sonini **qat'iy** tekshiradi — mos kelmasa
yiqiladi.

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `npx jest src/daf/media/picturable.spec.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Skriptni yozing**

`scripts/daf-mark-picturable.ts`:

1. A1 lug'atini bazadan oladi;
2. mamlakatlarni `false` qiladi — bu «rasm kerak emas» degani EMAS,
   «sun'iy intellekt chizmasin» degani. Task 8 Step 10 ularga tayyor
   bayroq beradi va o'shanda `true` ga qaytaradi. Shu tartib muhim:
   `daf-gen-images` faqat `picturable = true` larni oladi, ya'ni
   bayroqsiz mamlakat generatorga tushib qolmaydi;
3. qolganini 40 talik guruhda modeldan so'raydi;
4. natijani `content/daf/picturable.json` ga yozadi:
   `{ "sourceId": true|false }`;
5. bazaga `DafLexeme.picturable` ni yozadi.

Mavjud `picturable.json` bo'lsa u **manba** bo'ladi — model qayta
so'ralmaydi. Ya'ni qaror bir marta qabul qilinadi va ko'rib chiqiladi.

- [ ] **Step 6: `package.json` ga qo'shing**

```json
"daf:mark-picturable": "ts-node scripts/daf-mark-picturable.ts",
```

- [ ] **Step 7: Yuguring va natijani ko'ring**

```bash
cd server && npm run daf:mark-picturable
node -e "
const p=require('./content/daf/picturable.json');
const v=Object.values(p);
console.log('aniq:',v.filter(Boolean).length,'/ jami:',v.length);
"
```

Expected: A1 ning ~793 so'zidan 300–500 tasi `true`. Juda past yoki
juda yuqori bo'lsa so'rovni tuzating.

`picturable.json` dagi `true` deb belgilangan **20 ta tasodifiy so'zni
o'qib chiqing** — abstrakt so'z o'tib ketgan bo'lsa qo'lda `false`
qiling.

- [ ] **Step 8: Commit**

```bash
git add src/daf/media/picturable.ts scripts/daf-mark-picturable.ts \
        server/content/daf/picturable.json package.json
git commit -m "Qaysi so'zni chizib bo'ladi — bir marta hal qilinadi

Natija git'da: qaror qayta o'ylanmaydi, ko'rib chiqiladi. Mamlakatlar
chetlatildi — Flux bayroqlarni xato chizadi, ular uchun tayyor aktiv."
```

---

## Task 8: Rasm generatori

**Files:**
- Create: `src/daf/media/fal-client.ts`
- Create: `src/daf/media/image-prompt.ts`
- Create: `scripts/daf-gen-images.ts`
- Test: `src/daf/media/fal-client.spec.ts`, `src/daf/media/image-prompt.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 7 ning `picturable.json`; `R2Uploader` (`uploadMissing(assets: AssetRef[])`); `AssetRef` = `{ sourceUrl, key, kind, license, attribution, title? }`
- Produces:
  - `class FalClient { constructor(apiKey: string, fetchFn?: typeof fetch); image(prompt: string, seed: number): Promise<string>; speech(text: string): Promise<string> }`
  - `function imagePrompt(scene: string): string`
  - `function sceneFor(de: string, en: string): string`
  - `function imageKeyFor(sourceId: string): string` (`media-keys.ts` da)

- [ ] **Step 1: Yiqiladigan testni yozing**

`src/daf/media/image-prompt.spec.ts`:

```ts
import { imagePrompt } from './image-prompt';
import { imageKeyFor } from './media-keys';

describe('imagePrompt', () => {
  const p = imagePrompt('a person walking on a path');

  // Uslub namunada tasdiqlangan va o'zgarmaydi — aks holda bo'limlar
  // bir-biridan farq qilib ketadi.
  it('tasdiqlangan uslub qolipini saqlaydi', () => {
    expect(p).toContain('Soft rounded 3D illustration, claymation style');
    expect(p).toContain('subject fills most of the frame');
  });

  // Rasmdagi yozuv javobni oshkor qiladi va Flux harflarni buzadi.
  it('yozuvni uch marta taqiqlaydi', () => {
    expect(p).toContain('No text, no letters, no words, no writing anywhere');
  });

  it('sahnani qolip ichiga qo`yadi', () => {
    expect(p).toContain('a person walking on a path');
  });
});

describe('imageKeyFor', () => {
  it('R2 kalitini barqaror yasaydi', () => {
    expect(imageKeyFor('voc_01_01_begr_3')).toBe('daf/img/voc_01_01_begr_3.jpg');
  });
});
```

`src/daf/media/fal-client.spec.ts`:

```ts
import { FalClient } from './fal-client';

function fetchStub(body: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('FalClient.image', () => {
  it('birinchi rasmning manzilini qaytaradi', async () => {
    const c = new FalClient('k', fetchStub({ images: [{ url: 'https://x/a.jpg' }] }));
    expect(await c.image('p', 1)).toBe('https://x/a.jpg');
  });

  // Jimgina `undefined` qaytarish keyinroq R2 ga bo'sh kalit yozardi.
  it('rasm qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({ images: [] }));
    await expect(c.image('p', 1)).rejects.toThrow(/rasm/i);
  });

  it('xato javobda holat kodini xabarga qo`yadi', async () => {
    const c = new FalClient('k', fetchStub({ error: 'nope' }, false));
    await expect(c.image('p', 1)).rejects.toThrow(/500/);
  });
});

describe('FalClient.speech', () => {
  it('ovoz manzilini qaytaradi', async () => {
    const c = new FalClient('k', fetchStub({ audio: { url: 'https://x/a.mp3' } }));
    expect(await c.speech('Hallo')).toBe('https://x/a.mp3');
  });

  it('ovoz qaytmasa yiqiladi', async () => {
    const c = new FalClient('k', fetchStub({}));
    await expect(c.speech('Hallo')).rejects.toThrow(/ovoz/i);
  });
});
```

- [ ] **Step 2: Testlar yiqilishini tasdiqlang**

Run: `npx jest src/daf/media/`
Expected: FAIL — modullar yo'q

- [ ] **Step 3: `image-prompt.ts` ni yozing**

```ts
/**
 * Rasm so'rovi.
 *
 * Uslub qismi NAMUNADA TASDIQLANGAN va o'zgarmaydi: har bo'lim boshqa
 * so'rov bilan chizilsa bo'limlar bir-biridan farq qilib ketadi va
 * ekran chalkash ko'rinadi.
 *
 * Yozuv uch marta taqiqlanadi, chunki rasmdagi harf ikki tomondan
 * zarar: javobni oshkor qiladi, va Flux harflarni buzib chizadi.
 */
const STYLE =
  'Soft rounded 3D illustration, claymation style: {SCENE}. ' +
  'Friendly pastel colors, gentle soft shadows, plain light neutral ' +
  'background, subject fills most of the frame, centered. ' +
  'No text, no letters, no words, no writing anywhere.';

export function imagePrompt(scene: string): string {
  return STYLE.replace('{SCENE}', scene);
}

```

`src/daf/media/media-keys.ts` — R2 kalitlari faqat shu yerda yasaladi:

```ts
export function imageKeyFor(sourceId: string): string {
  return `daf/img/${sourceId}.jpg`;
}
```

`sceneFor(de, en)` — modeldan sahna tavsifini so'raydigan yordamchi;
uni `scripts/daf-gen-images.ts` ichida `TranslateModel` orqali chaqiring
(inglizcha ma'no sahna yozish uchun aniqroq asos beradi).

- [ ] **Step 4: `fal-client.ts` ni yozing**

```ts
const IMAGE_MODEL = 'fal-ai/flux/schnell';
const TTS_MODEL = 'fal-ai/chatterbox/text-to-speech/multilingual';

/**
 * fal.ai ga yagona kirish nuqtasi.
 *
 * Interfeys ataylab tor — ikkita metod, ikkalasi ham manzil qaytaradi.
 * Baytlarni bu klass ko'chirmaydi: buni `R2Uploader.uploadMissing()`
 * allaqachon qiladi, u `sourceUrl` dan o'qiydi.
 */
export class FalClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async run(model: string, input: unknown): Promise<any> {
    const res = await this.fetchFn(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        authorization: `Key ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`fal.ai javob bermadi (${res.status}): ${await res.text()}`);
    }
    return res.json();
  }

  async image(prompt: string, seed: number): Promise<string> {
    const out = await this.run(IMAGE_MODEL, {
      prompt,
      image_size: 'square_hd',
      num_images: 1,
      output_format: 'jpeg',
      seed,
    });
    const url = out?.images?.[0]?.url;
    if (typeof url !== 'string') throw new Error('fal.ai rasm qaytarmadi');
    return url;
  }

  async speech(text: string): Promise<string> {
    const out = await this.run(TTS_MODEL, { text, language: 'de' });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai ovoz qaytarmadi');
    return url;
  }
}
```

- [ ] **Step 5: Testlar o'tishini tasdiqlang**

Run: `npx jest src/daf/media/`
Expected: PASS (9 test)

- [ ] **Step 6: Skriptni yozing**

`scripts/daf-gen-images.ts`. **`--unit N` majburiy** — bayroqsiz
yugurtirilsa skript yiqiladi va sababini aytadi:

```
Bo'lim raqami shart: --unit 1

Rasmlar bo'lim-bo'lim chiqariladi va har bo'limdan keyin odam ko'radi.
Sinovda `unterschreiben` rasmi uslubdan siljib chiqqan edi; 450 rasmni
bir yo'la chiqarib, keyin «uslub yoqmadi» deyish bekor ketgan ish.
```

Oqim:

1. bo'limning `picturable = true` va `imageKey = null` so'zlarini oladi;
2. har biri uchun `sceneFor(de, en)` bilan sahna yozdiradi;
3. `FalClient.image(imagePrompt(scene), seed)` — `seed` = so'z
   `sourceId` ining barqaror xesh'i, ya'ni qayta yugurish bir xil rasm
   beradi;
4. `AssetRef` yig'adi (`kind: 'IMAGE'`, `license: 'Generated'`,
   `attribution: 'DaF Sprachzentrum — fal.ai FLUX.1 [schnell]'`);
5. `R2Uploader.uploadMissing()` bilan R2 ga ko'chiradi;
6. bazaga `imageKey` yozadi;
7. oxirida **ko'rik ro'yxatini** bosadi — har rasmning ommaviy manzili
   va so'zi, odam brauzerda ochib ko'rishi uchun.

`--dry-run` bayrog'i model chaqirmasdan nechta rasm chiqishini aytadi.

- [ ] **Step 7: `package.json` ga qo'shing**

```json
"daf:gen-images": "ts-node scripts/daf-gen-images.ts",
```

- [ ] **Step 8: Birinchi bo'limni chiqaring va KO'RING**

```bash
cd server && npm run daf:gen-images -- --unit 1
```

Chiqqan manzillarni brauzerda oching va **har birini ko'ring**.
Tekshiring: yozuv yo'qmi, ma'no aniqmi, uslub qolganlariga o'xshaydimi.
Yaroqsizini bazadan `imageKey = null` qilib qayta chiqaring.

Bu qadam **avtomatlashtirilmaydi va o'tkazib yuborilmaydi**.

- [ ] **Step 9: Qolgan bo'limlarni ketma-ket chiqaring**

Har bo'limdan keyin Step 8 dagi ko'rikni takrorlang.

- [ ] **Step 10: Bayroqlarni qo'shing**

Mamlakatlar Task 7 da `picturable = false` qilingan, ya'ni ularga rasm
umuman biriktirilmagan. Lekin A1 ning 1-bobida **12 mamlakat** bor va
ularsiz `PICTURE_WORD` shu bo'limda deyarli ishlamaydi.

Bayroq sun'iy intellektdan olinmaydi — Flux bayroq chizmalarini xato
qiladi (rang tartibi, yulduz soni). O'rniga tayyor SVG aktivlari:

```bash
cd server && mkdir -p content/daf/flags
# flag-icons — CC0, davlat bayroqlarining SVG to'plami
npx --yes flag-icons --help >/dev/null 2>&1 || true
```

Amaliy yo'l: `flag-icons` paketining `flags/4x3/*.svg` fayllaridan
kerakli 12 tasini `content/daf/flags/` ga ko'chiring. Mos kelish:

| So'z | Fayl |
| --- | --- |
| Belgien | `be.svg` |
| Italien | `it.svg` |
| Deutschland | `de.svg` |
| die Niederlande | `nl.svg` |
| Kanada | `ca.svg` |
| Luxemburg | `lu.svg` |
| Polen | `pl.svg` |
| Österreich | `at.svg` |
| Mexiko | `mx.svg` |
| die Schweiz | `ch.svg` |
| Frankreich | `fr.svg` |
| Spanien | `es.svg` |

Bayroqlar **git'da** yashaydi, R2 da emas: SVG fayl ~2 KB, ya'ni bu
media bayti emas, kod hajmidagi aktiv. `imageKey` ga
`daf/flags/de.svg` yoziladi va klient uni statik papkadan oladi.

Bazaga yozing:

```bash
cd server && npx ts-node -e "
require('dotenv/config');
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const MAP={Belgien:'be',Italien:'it',Deutschland:'de','die Niederlande (Holland)':'nl',
  Kanada:'ca',Luxemburg:'lu',Polen:'pl','Österreich':'at',Mexiko:'mx',
  'die Schweiz':'ch',Frankreich:'fr',Spanien:'es'};
(async()=>{
  for(const [de,code] of Object.entries(MAP)){
    const n=await p.dafLexeme.updateMany({where:{de},data:{imageKey:\`daf/flags/\${code}.svg\`,picturable:true}});
    console.log(de, n.count?'✓':'TOPILMADI');
  }
  await p.\$disconnect();
})();
"
```

`TOPILMADI` chiqsa bazadagi aniq yozuvni tekshiring — manbadagi nom
qavs yoki artikl bilan kelishi mumkin.

- [ ] **Step 11: Commit**

```bash
git add src/daf/media/ scripts/daf-gen-images.ts package.json server/content/daf/flags/
git commit -m "Rasmlar bo'lim-bo'lim chiqariladi, har biridan keyin odam ko'radi

Uslub qolipi namunada tasdiqlangan va kodda qotirilgan. --unit majburiy:
450 rasmni bir yo'la chiqarib keyin uslubni rad etish bekor ketgan ish."
```

---

## Task 9: Gap ovozi (TTS)

**Files:**
- Create: `scripts/daf-gen-tts.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 8 ning `FalClient.speech(text)`; `R2Uploader`; Task 6 ning `DafSentence`
- Produces: `function sentenceAudioKey(unitOrder: number, order: number): string`

- [ ] **Step 1: Kalit yasovchi uchun test yozing**

`src/daf/media/media-keys.spec.ts` ga qo'shing — kalit yasovchilar bir
joyda turadi:

```ts
import { sentenceAudioKey } from './media-keys';

describe('sentenceAudioKey', () => {
  it('bo`lim va tartibdan barqaror kalit yasaydi', () => {
    expect(sentenceAudioKey(1, 7)).toBe('daf/tts/a1_u01_s07.mp3');
  });

  // Ikki xonali raqam saralanganda buzilmasligi uchun to'ldiriladi.
  it('raqamlarni nol bilan to`ldiradi', () => {
    expect(sentenceAudioKey(12, 30)).toBe('daf/tts/a1_u12_s30.mp3');
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `npx jest src/daf/media/media-keys.spec.ts`
Expected: FAIL — `sentenceAudioKey` eksport qilinmagan

- [ ] **Step 3: Yozing**

`src/daf/media/media-keys.ts` ga qo'shing:

```ts
/** Gap ovozining R2 kaliti. Bo'lim va tartibdan — barqaror. */
export function sentenceAudioKey(unitOrder: number, order: number): string {
  const u = String(unitOrder).padStart(2, '0');
  const s = String(order).padStart(2, '0');
  return `daf/tts/a1_u${u}_s${s}.mp3`;
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `npx jest src/daf/media/media-keys.spec.ts`
Expected: PASS

- [ ] **Step 5: Skriptni yozing**

`scripts/daf-gen-tts.ts`:

1. `audioKey = null` bo'lgan `DafSentence` larni oladi (idempotent);
2. har biri uchun `FalClient.speech(de)`;
3. `AssetRef` (`kind: 'AUDIO'`, `key: sentenceAudioKey(...)`,
   `license: 'Generated'`,
   `attribution: 'DaF Sprachzentrum — fal.ai Chatterbox'`);
4. `R2Uploader.uploadMissing()`;
5. bazaga `audioKey` yozadi;
6. har bo'limdan **3 ta namunaning manzilini** bosadi — odam tinglashi
   uchun.

`--unit N` ixtiyoriy: berilsa faqat shu bo'lim.

- [ ] **Step 6: `package.json` ga qo'shing**

```json
"daf:gen-tts": "ts-node scripts/daf-gen-tts.ts",
```

- [ ] **Step 7: Bitta bo'limda sinang va TINGLANG**

```bash
cd server && npm run daf:gen-tts -- --unit 1
```

Chiqqan 3 namunani tinglang. Talaffuz noto'g'ri bo'lsa (masalan
umlaut yutilsa) o'sha gapni `sentences.json` dan olib tashlang va
qaytadan yasang.

- [ ] **Step 8: Hammasini chiqaring**

```bash
cd server && npm run daf:gen-tts
```

Expected: ~600 fayl, narx ≈ $0,60.

- [ ] **Step 9: Yakuniy tekshiruv**

```bash
cd server
npx jest src/daf/
npm run typecheck
npx eslint src/daf scripts
```

Expected: uchalasi ham toza.

Kontent to'liqligini o'lchang:

```bash
npx ts-node -e "
require('dotenv/config');
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
Promise.all([
  p.dafUnit.count({where:{level:'A1'}}),
  p.dafLesson.count(),
  p.dafSentence.count(),
  p.dafSentence.count({where:{audioKey:{not:null}}}),
  p.dafLexeme.count({where:{picturable:true}}),
  p.dafLexeme.count({where:{imageKey:{not:null}}}),
]).then(([u,l,s,sa,pi,im])=>{
  console.log(\`A1 bo'lim \${u} | dars \${l} | gap \${s} (ovozli \${sa}) | chiziladigan so'z \${pi} (rasmli \${im})\`);
  return p.\$disconnect();
});
"
```

Expected: `A1 bo'lim 20 | dars 100+ | gap 600 (ovozli 600) | chiziladigan so'z 300-500 (rasmli hammasi)`

- [ ] **Step 10: Commit**

```bash
git add scripts/daf-gen-tts.ts src/daf/media/media-keys.ts package.json
git commit -m "Gap ovozi TTS bilan yasaladi

A1 uchun toza va sekin talaffuz intervyu tezligidan afzal. Haqiqiy
video 5-bosqich sinovi uchun qoladi."
```

---

## Reja tugagach

Bu reja **kontent poydevorini** beradi: A1 ning 20 bo'limi, 100 darsi,
~600 yasalgan gapi (ovozi bilan) va rasmlari bazada turadi. Hali hech
kim ularni ko'rmaydi — ekran va dvigatel keyingi rejalarda.

**Reja B (dvigatel):** dars quruvchi, 12 mashq turi, javob tekshirish,
Leitner qaytarishi.
**Reja C (tajriba):** yo'l/bo'lim/dars ekranlari, seriya va kunlik
maqsad, guruh reytingi, ustoz paneli.

ADR (`docs/adr/0012-mashq-kontenti-yasaladi.md`) shu rejaning PR'i
ichida yoziladi — ma'lumot modeli o'zgardi va tashqi xizmat tanlandi.
