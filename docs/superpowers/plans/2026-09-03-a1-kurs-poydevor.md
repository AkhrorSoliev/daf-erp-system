# A1 kursi — poydevor: xarita va struktura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A1 ning 12 uniti va 64 bo'limi bitta tekshiriladigan faylda yoziladi va bazaga bo'sh struktura sifatida tushadi — kontent yasashdan oldin butun xarita ko'rinib turadi.

**Architecture:** Xarita `server/content/daf/a1/kurs.json` da yashaydi (git'da matn). Uni tip va validator qo'riqlaydi; `npm run daf:a1-check` buzilgan faylda yiqiladi. Seed shu fayldan 12 `DafUnit`, 64 `DafSection` va 192 `DafLesson` qatorini quradi. Eski 20 ta DiB bo'limi nafaqaga chiqadi — o'chirilmaydi, chunki uning lug'ati va audiosi zaxira sifatida kerak.

**Tech Stack:** NestJS, Prisma 7 (PostgreSQL/Neon), jest + ts-jest, ts-node skriptlar.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-03-a1-kurs-design.md`. Ziddiyat chiqsa dizayn ustun.
- Bu reja **faqat strukturani** quradi. So'z, gap, dialog, rasm, ovoz va savol quruvchi **bu rejada yo'q**.
- Barcha yozuvlar — lotin alifbosidagi o'zbekcha. Kirill yoki arab harflari ishlatilmaydi.
- `prisma migrate dev` bu repo'da **ishlamaydi**. Migratsiya `migrate diff` → `db execute` → `migrate resolve` bilan qo'llanadi.
- Ish `feat/daf-a1-kontent` shoxida, `.worktrees/daf-a1-kontent` worktree'sida boradi. `git reset --hard` ishlatilmaydi: repo'da commit qilinmagan WIP bor.
- A1 unit soni **12**, bo'lim soni **64**, unitga **≤ 50** asosiy so'z, bo'limga **8–12**.
- Har commit oldidan `npm test` va `npm run typecheck` o'tishi shart.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/daf/kurs/kurs.types.ts` | Xarita faylining tiplari (`KursFile`, `KursUnitSpec`, `KursSectionSpec`) |
| `server/src/daf/kurs/kurs.validate.ts` | Xarita qoidalari — muammolar ro'yxatini qaytaradi |
| `server/src/daf/kurs/kurs.validate.spec.ts` | Validator testlari |
| `server/src/daf/kurs/kurs.file.spec.ts` | Haqiqiy `kurs.json` validatordan o'tishini qo'riqlaydi |
| `server/src/daf/kurs/kurs-lessons.ts` | Bo'limlardan seans ro'yxatini quradi (sof funksiya, bazasiz) |
| `server/src/daf/kurs/kurs-lessons.spec.ts` | Seans quruvchi testlari |
| `server/src/daf/kurs/kurs-seed.service.ts` | Xaritani bazaga yozadi, eskisini nafaqaga chiqaradi |
| `server/src/daf/kurs/kurs-seed.service.spec.ts` | Seed testlari (Prisma soxta obyekt bilan) |
| `server/content/daf/a1/kurs.json` | **Xaritaning o'zi** — 12 unit, 64 bo'lim |
| `server/scripts/daf-a1-check.ts` | `npm run daf:a1-check` — faylni tekshiradi |
| `server/scripts/daf-a1-seed.ts` | `npm run daf:a1-seed` — xaritani bazaga tushiradi |
| `server/prisma/schema.prisma` | `DafSection`, `DafUnit.code/retiredAt`, `DafLesson.kind/sectionId` |
| `docs/adr/0014-a1-kursi-on-ikki-unitga-bolinadi.md` | Qaror yozuvi |

---

## Task 1: Xarita tipi va validatori

**Files:**
- Create: `server/src/daf/kurs/kurs.types.ts`
- Create: `server/src/daf/kurs/kurs.validate.ts`
- Test: `server/src/daf/kurs/kurs.validate.spec.ts`

**Interfaces:**
- Consumes: hech narsa (birinchi task).
- Produces:
  - `interface KursSectionSpec { order: number; code: string; titleDe: string; titleUz: string; grammar: string; grammarUz: string; wordBudget: number }`
  - `interface KursUnitSpec { order: number; code: string; titleDe: string; titleUz: string; theme: string; sections: KursSectionSpec[] }`
  - `interface KursFile { level: 'A1'; units: KursUnitSpec[] }`
  - `validateKurs(file: KursFile): string[]` — muammolar ro'yxati; bo'sh massiv = fayl toza
  - `UNIT_COUNT = 12`, `SECTION_COUNT = 64`, `SECTIONS_MIN = 5`, `SECTIONS_MAX = 6`, `WORDS_MIN = 8`, `WORDS_MAX = 12`, `UNIT_WORDS_MAX = 50`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/kurs/kurs.validate.spec.ts`:

```ts
import { validateKurs } from './kurs.validate';
import type { KursFile, KursUnitSpec } from './kurs.types';

/** 6 bo'limli unitda byudjet 8, 5 bo'limlida 10 — ikkalasi ham 50 ga sig'adi. */
function unit(order: number, sectionCount = 5): KursUnitSpec {
  const code = `u${String(order).padStart(2, '0')}`;
  const budget = sectionCount === 6 ? 8 : 10;
  return {
    order,
    code,
    titleDe: `Kapitel ${order}`,
    titleUz: `${order}-unit`,
    theme: 'sinov mavzusi',
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      order: i + 1,
      code: `${code}-s${i + 1}`,
      titleDe: `Abschnitt ${i + 1}`,
      titleUz: `${i + 1}-qism`,
      grammar: 'Personalpronomen',
      grammarUz: 'Kishilik olmoshi',
      wordBudget: budget,
    })),
  };
}

/** 8 ta unit 5 bo'limli, 4 tasi 6 bo'limli → 40 + 24 = 64. */
function fullKurs(): KursFile {
  const six = new Set([4, 7, 9, 12]);
  return {
    level: 'A1',
    units: Array.from({ length: 12 }, (_, i) =>
      unit(i + 1, six.has(i + 1) ? 6 : 5),
    ),
  };
}

function has(problems: string[], needle: string): boolean {
  return problems.some((p) => p.includes(needle));
}

describe('validateKurs', () => {
  it('to`g`ri xaritada muammo topmaydi', () => {
    expect(validateKurs(fullKurs())).toEqual([]);
  });

  it('unit soni 12 emasligini aytadi', () => {
    const f = fullKurs();
    f.units.pop();
    expect(has(validateKurs(f), '12 ta unit')).toBe(true);
  });

  it('bo`lim soni 5 dan kam bo`lsa aytadi', () => {
    const f = fullKurs();
    f.units[0].sections.pop();
    expect(has(validateKurs(f), '5–6 bo`lim')).toBe(true);
  });

  it('bo`limning so`z byudjeti chegaradan chiqsa aytadi', () => {
    const f = fullKurs();
    f.units[0].sections[0].wordBudget = 13;
    expect(has(validateKurs(f), '8–12 so`z')).toBe(true);
  });

  it('unitning jami byudjeti 50 dan oshsa aytadi', () => {
    const f = fullKurs();
    f.units[0].sections.forEach((s) => (s.wordBudget = 12));
    expect(has(validateKurs(f), '50 so`zdan ko`p')).toBe(true);
  });

  it('takrorlangan bo`lim kalitini aytadi', () => {
    const f = fullKurs();
    f.units[1].sections[0].code = f.units[0].sections[0].code;
    expect(has(validateKurs(f), 'takrorlangan')).toBe(true);
  });

  it('unit tartibi uzluksiz emasligini aytadi', () => {
    const f = fullKurs();
    f.units[3].order = 9;
    expect(has(validateKurs(f), 'uzluksiz emas')).toBe(true);
  });

  it('bo`sh sarlavhani aytadi', () => {
    const f = fullKurs();
    f.units[2].sections[1].titleUz = '   ';
    expect(has(validateKurs(f), 'sarlavhasi bo`sh')).toBe(true);
  });

  it('grammatika yozilmaganini aytadi', () => {
    const f = fullKurs();
    f.units[2].sections[1].grammar = '';
    expect(has(validateKurs(f), 'grammatikasi bo`sh')).toBe(true);
  });

  it('bo`lim kaliti unit kalitiga mos emasligini aytadi', () => {
    const f = fullKurs();
    f.units[0].sections[0].code = 'u07-s1';
    expect(has(validateKurs(f), 'kaliti unitga mos emas')).toBe(true);
  });

  it('jami bo`lim soni 64 emasligini aytadi', () => {
    const f = fullKurs();
    f.units[0].sections.pop();
    expect(has(validateKurs(f), '64 ta bo`lim')).toBe(true);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs.validate.spec.ts`
Expected: FAIL — `Cannot find module './kurs.validate'`

- [ ] **Step 3: Tiplarni yozing**

`server/src/daf/kurs/kurs.types.ts`:

```ts
/**
 * A1 kursining xaritasi — QO'LDA yoziladi va odam tasdiqlaydi.
 *
 * Bu fayl kontentdan OLDIN keladi: unda so'zning o'zi emas, faqat qaysi
 * bo'limga nechta so'z tushishi va u qaysi grammatikani ko'tarishi
 * yoziladi. Kontent yasashdan oldin butun kurs ko'rinib turishi kerak,
 * aks holda 64 bo'lim bir-biriga bog'lanmagan holda to'ldiriladi.
 */
export interface KursSectionSpec {
  /** Unit ichidagi tartib, 1 dan boshlanadi. */
  order: number;
  /** Barqaror kalit: `u01-s3`. Seed shu bo'yicha yangilaydi. */
  code: string;
  titleDe: string;
  titleUz: string;
  /** Bo'limning grammatika mavzusi, nemischa nomi bilan. */
  grammar: string;
  grammarUz: string;
  /** Shu bo'limga rejalashtirilgan ASOSIY so'zlar soni. */
  wordBudget: number;
}

export interface KursUnitSpec {
  order: number;
  /** Barqaror kalit: `u01`. */
  code: string;
  titleDe: string;
  titleUz: string;
  /** Unitning mavzusi — bir qatorlik tavsif. */
  theme: string;
  sections: KursSectionSpec[];
}

export interface KursFile {
  level: 'A1';
  units: KursUnitSpec[];
}
```

- [ ] **Step 4: Validatorni yozing**

`server/src/daf/kurs/kurs.validate.ts`:

```ts
import type { KursFile } from './kurs.types';

export const UNIT_COUNT = 12;
export const SECTION_COUNT = 64;
export const SECTIONS_MIN = 5;
export const SECTIONS_MAX = 6;
export const WORDS_MIN = 8;
export const WORDS_MAX = 12;
export const UNIT_WORDS_MAX = 50;

/**
 * Xaritani tekshiradi va muammolar ro'yxatini qaytaradi.
 *
 * Birinchi muammoda YIQILMAYDI — hammasini bir yo'la ko'rsatadi.
 * Bittalab yiqilish 64 bo'limli faylni tuzatishni o'nlab yugurishga
 * aylantirardi.
 */
export function validateKurs(file: KursFile): string[] {
  const problems: string[] = [];

  if (file.level !== 'A1') {
    problems.push(`Daraja A1 bo'lishi kerak, fayl: ${String(file.level)}`);
  }

  if (file.units.length !== UNIT_COUNT) {
    problems.push(
      `${UNIT_COUNT} ta unit bo'lishi kerak, faylda: ${file.units.length}`,
    );
  }

  const orders = file.units.map((u) => u.order);
  const expected = file.units.map((_, i) => i + 1);
  if (orders.join(',') !== expected.join(',')) {
    problems.push(`Unit tartibi uzluksiz emas: ${orders.join(', ')}`);
  }

  const unitCodes = new Set<string>();
  const sectionCodes = new Set<string>();
  let sectionTotal = 0;

  for (const u of file.units) {
    if (unitCodes.has(u.code)) {
      problems.push(`Takrorlangan unit kaliti: ${u.code}`);
    }
    unitCodes.add(u.code);

    const wantCode = `u${String(u.order).padStart(2, '0')}`;
    if (u.code !== wantCode) {
      problems.push(`${u.order}-unit kaliti ${wantCode} bo'lishi kerak: ${u.code}`);
    }
    if (u.titleDe.trim() === '' || u.titleUz.trim() === '') {
      problems.push(`${u.code}: unit sarlavhasi bo'sh`);
    }
    if (u.theme.trim() === '') {
      problems.push(`${u.code}: unit mavzusi bo'sh`);
    }

    const n = u.sections.length;
    sectionTotal += n;
    if (n < SECTIONS_MIN || n > SECTIONS_MAX) {
      problems.push(
        `${u.code}: ${n} ta bo'lim — ${SECTIONS_MIN}–${SECTIONS_MAX} bo'lim bo'lishi kerak`,
      );
    }

    const sOrders = u.sections.map((s) => s.order);
    const sExpected = u.sections.map((_, i) => i + 1);
    if (sOrders.join(',') !== sExpected.join(',')) {
      problems.push(`${u.code}: bo'lim tartibi uzluksiz emas: ${sOrders.join(', ')}`);
    }

    let words = 0;
    for (const s of u.sections) {
      if (sectionCodes.has(s.code)) {
        problems.push(`Takrorlangan bo'lim kaliti: ${s.code}`);
      }
      sectionCodes.add(s.code);

      if (!s.code.startsWith(`${u.code}-s`)) {
        problems.push(`${s.code}: kaliti unitga mos emas (${u.code} kutilgan)`);
      }
      if (s.titleDe.trim() === '' || s.titleUz.trim() === '') {
        problems.push(`${s.code}: sarlavhasi bo'sh`);
      }
      if (s.grammar.trim() === '' || s.grammarUz.trim() === '') {
        problems.push(`${s.code}: grammatikasi bo'sh`);
      }
      if (s.wordBudget < WORDS_MIN || s.wordBudget > WORDS_MAX) {
        problems.push(
          `${s.code}: ${s.wordBudget} so'z — ${WORDS_MIN}–${WORDS_MAX} so'z bo'lishi kerak`,
        );
      }
      words += s.wordBudget;
    }

    if (words > UNIT_WORDS_MAX) {
      problems.push(`${u.code}: jami ${words} so'z — ${UNIT_WORDS_MAX} so'zdan ko'p`);
    }
  }

  if (sectionTotal !== SECTION_COUNT) {
    problems.push(
      `Jami ${SECTION_COUNT} ta bo'lim bo'lishi kerak, faylda: ${sectionTotal}`,
    );
  }

  return problems;
}
```

- [ ] **Step 5: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs.validate.spec.ts`
Expected: PASS — 11 ta test.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/kurs/
git commit -m "A1 xaritasining tipi va validatori"
```

---

## Task 2: `kurs.json` — 12 unit, 64 bo'lim

**Files:**
- Create: `server/content/daf/a1/kurs.json`
- Create: `server/src/daf/kurs/kurs.file.spec.ts`
- Create: `server/scripts/daf-a1-check.ts`
- Modify: `server/package.json` (scripts)

**Interfaces:**
- Consumes: `validateKurs`, `KursFile` (Task 1).
- Produces: `server/content/daf/a1/kurs.json` — keyingi hamma task shu fayldan o'qiydi; `npm run daf:a1-check`.

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/kurs/kurs.file.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateKurs, SECTION_COUNT, UNIT_COUNT } from './kurs.validate';
import type { KursFile } from './kurs.types';

/**
 * Haqiqiy xarita faylini qo'riqlaydi. Validator o'zi to'g'ri ishlashi
 * yetarli emas — fayl unga MOS ekani ham har yugurishda tekshiriladi,
 * aks holda qo'lda tahrir jimgina buzib ketadi.
 */
describe('kurs.json', () => {
  const file = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'content', 'daf', 'a1', 'kurs.json'),
      'utf8',
    ),
  ) as KursFile;

  it('validatordan o`tadi', () => {
    expect(validateKurs(file)).toEqual([]);
  });

  it('12 unit va 64 bo`limdan iborat', () => {
    expect(file.units).toHaveLength(UNIT_COUNT);
    const sections = file.units.reduce((n, u) => n + u.sections.length, 0);
    expect(sections).toBe(SECTION_COUNT);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs.file.spec.ts`
Expected: FAIL — `ENOENT ... content/daf/a1/kurs.json`

- [ ] **Step 3: Xaritani yozing**

`server/content/daf/a1/kurs.json` ni quyidagi jadval bo'yicha to'ldiring.
Bo'limi 5 ta bo'lgan unitda har bo'lim `wordBudget: 10`, 6 ta bo'lganida
`wordBudget: 8` (5×10 = 50 va 6×8 = 48 — ikkalasi ham chegaraga sig'adi).

Faylning boshi aynan shunday bo'ladi:

```json
{
  "level": "A1",
  "units": [
    {
      "order": 1,
      "code": "u01",
      "titleDe": "Hallo!",
      "titleUz": "Salom!",
      "theme": "salomlashish, tanishuv, alifbo, 0–20",
      "sections": [
        {
          "order": 1,
          "code": "u01-s1",
          "titleDe": "Hallo und tschüs",
          "titleUz": "Salom va xayr",
          "grammar": "Personalpronomen ich/du, sein",
          "grammarUz": "ich/du olmoshlari va sein fe'li",
          "wordBudget": 10
        }
      ]
    }
  ]
}
```

To'liq xarita — 64 qator:

| Unit | Bo'lim | titleDe | titleUz | grammar | grammarUz |
| --- | --- | --- | --- | --- | --- |
| u01 Hallo! | 1 | Hallo und tschüs | Salom va xayr | Personalpronomen ich/du, sein | ich/du olmoshlari va sein fe'li |
| | 2 | Guten Tag, Frau Karimova | Rasmiy salomlashish | Sie-Form, W-Frage | Sie shakli va so'roq gap |
| | 3 | Woher kommst du? | Qayerdansan? | Verben kommen/wohnen, aus/in | kommen/wohnen tuslanishi, aus/in |
| | 4 | Zahlen 0–20 | 0–20 sonlari | Zahlen, Telefonnummer | sonlar va telefon raqami |
| | 5 | Das Alphabet | Alifbo | buchstabieren, Wie schreibt man das? | harflab aytish |
| u02 Menschen um mich | 1 | Meine Familie | Mening oilam | Possessivartikel mein/dein | mening/sening |
| | 2 | Das ist mein Bruder | Bu mening akam | Verb haben, Zahlen 20–100 | haben fe'li, 20–100 sonlari |
| | 3 | Berufe | Kasblar | Beruf ohne Artikel, -in | kasb artiklsiz, ayol shakli |
| | 4 | Wie ist er? | U qanday odam? | sein + Adjektiv | sein va sifat |
| | 5 | Freunde und Kollegen | Do'stlar va hamkasblar | Personalpronomen er/sie/wir | er/sie/wir olmoshlari |
| u03 In der Stadt | 1 | Orte in der Stadt | Shahardagi joylar | bestimmter Artikel der/die/das | aniq artikl |
| | 2 | Wo ist die Post? | Pochta qayerda? | Präposition in/an/neben, Wo? | joy ko'makchilari |
| | 3 | Wie komme ich zum Bahnhof? | Vokzalga qanday boraman? | zum/zur, Imperativ Sie-Form | zum/zur va buyruq shakli |
| | 4 | Verkehrsmittel | Transport | mit + Dativ | mit bilan qaratqich |
| | 5 | Mein Weg zur Arbeit | Ishga boradigan yo'lim | Verbposition, Zeitangabe | fe'lning o'rni va vaqt |
| u04 Essen und Trinken | 1 | Lebensmittel | Oziq-ovqat | unbestimmter Artikel ein/eine | noaniq artikl |
| | 2 | Im Supermarkt | Supermarketda | Plural, Preise | ko'plik va narx |
| | 3 | Was isst du gern? | Nimani yoqtirasan? | essen/trinken, gern | o'zgaruvchi fe'llar va gern |
| | 4 | Frühstück, Mittag, Abend | Nonushta, tushlik, kechki ovqat | Zeitangaben am/um | am/um bilan vaqt |
| | 5 | Im Restaurant | Restoranda | möchten, Ich hätte gern | buyurtma iboralari |
| | 6 | Rezept und Mengen | Retsept va miqdor | Akkusativ einen/eine/ein | tushum kelishigi |
| u05 Mein Tag | 1 | Wie spät ist es? | Soat necha? | Uhrzeit | soatni aytish |
| | 2 | Wochentage | Hafta kunlari | Präposition am | am ko'makchisi |
| | 3 | Mein Tagesablauf | Kun tartibim | trennbare Verben | ajraladigan fe'llar |
| | 4 | Termine | Uchrashuvlar | von … bis, um | vaqt oralig'i |
| | 5 | Zu Hause | Uyda | Modalverb müssen | müssen modal fe'li |
| u06 Freizeit | 1 | Hobbys | Sevimli mashg'ulot | Verb + gern, oft/nie | gern va takrorlanish |
| | 2 | Sport und Musik | Sport va musiqa | Modalverb können | können modal fe'li |
| | 3 | Wollen wir ins Kino? | Kinoga boramizmi? | wollen, ins/in die | wollen va yo'nalish |
| | 4 | Das Wetter | Ob-havo | es ist / es gibt | es ist va es gibt |
| | 5 | Verabredung | Uchrashuvni kelishish | Wortstellung: Zeit vor Ort | vaqt joydan oldin |
| u07 Arbeit und Alltag | 1 | Berufe und Arbeitsplatz | Kasb va ish joyi | arbeiten als, Wo? | als bilan kasb |
| | 2 | Mein Arbeitstag | Ish kunim | trennbare Verben: anfangen | anfangen/aufhören |
| | 3 | Am Telefon | Telefonda | Redemittel am Telefon | telefon iboralari |
| | 4 | E-Mail und Termin | Xat va uchrashuv | Datum, am + Datum | sana va am |
| | 5 | Im Büro | Ofisda | Possessivartikel unser/euer | bizning/sizning |
| | 6 | Probleme bei der Arbeit | Ishdagi muammolar | müssen/dürfen | müssen va dürfen |
| u08 Gesundheit | 1 | Körperteile | Tana a'zolari | Plural der Körperteile | tana a'zolari ko'pligi |
| | 2 | Ich bin krank | Men kasalman | Schmerzen haben, tut weh | og'riqni aytish |
| | 3 | Beim Arzt | Shifokorda | Imperativ Sie-Form | shifokor buyrug'i |
| | 4 | Medikamente und Apotheke | Dori va dorixona | Modalverb sollen | sollen modal fe'li |
| | 5 | Gesund leben | Sog'lom yashash | Negation kein/nicht | kein va nicht |
| u09 Meine Wohnung | 1 | Räume | Xonalar | es gibt + Akkusativ | es gibt tuzilmasi |
| | 2 | Möbel | Mebel | Wechselpräposition + Dativ | in/auf/unter joy ma'nosida |
| | 3 | Meine Wohnung ist … | Uyim qanday | Adjektive groß/klein/hell | tavsiflovchi sifatlar |
| | 4 | Wohnung suchen | Uy izlash | Zahlen: Miete, Quadratmeter | ijara va maydon |
| | 5 | Umzug | Ko'chish | Dativ mit dem/der | mit bilan jo'nalish |
| | 6 | Nachbarn und Hausordnung | Qo'shnilar va qoidalar | dürfen / nicht dürfen | ruxsat va taqiq |
| u10 Lernen und Beruf | 1 | Sprachen lernen | Til o'rganish | wollen/können takrori | modal fe'llar takrori |
| | 2 | Im Kurs | Kursda | Imperativ du-Form | du buyruq shakli |
| | 3 | Mein Lebenslauf | Tarjimai hol | Perfekt mit haben | haben bilan o'tgan zamon |
| | 4 | Bewerbung | Ariza | förmliche Redemittel | rasmiy iboralar |
| | 5 | Pläne für die Zukunft | Kelajak rejalari | möchte … werden | kelajak niyati |
| u11 Kleidung und Einkauf | 1 | Kleidung | Kiyim | Plural, Adjektiv + Farbe | ko'plik va rang |
| | 2 | Farben und Größen | Rang va o'lcham | Welcher/Welche/Welches | qaysi? so'rog'i |
| | 3 | Im Geschäft | Do'konda | Fragen im Geschäft | do'kondagi savollar |
| | 4 | Das gefällt mir | Bu menga yoqadi | gefallen + Dativ, mir/dir | mir/dir olmoshlari |
| | 5 | Umtausch | Almashtirish | Perfekt: ich habe gekauft | o'tgan zamon takrori |
| u12 Reisen und Urlaub | 1 | Reiseziele | Sayohat manzillari | nach/in + Land | mamlakatga yo'nalish |
| | 2 | Am Bahnhof und Flughafen | Vokzal va aeroportda | von … nach, Uhrzeit | yo'nalish va vaqt |
| | 3 | Im Hotel | Mehmonxonada | Redemittel: reservieren | joy band qilish |
| | 4 | Urlaub machen | Ta'tilda | Perfekt: regelmäßig/unregelmäßig | o'tgan zamon shakllari |
| | 5 | Postkarte schreiben | Xat yozish | Wortstellung in der Vergangenheit | o'tgan zamonda so'z tartibi |
| | 6 | Auf Wiedersehen! | Xayr! | Wiederholung: alle Redemittel | barcha iboralar takrori |

- [ ] **Step 4: Tekshiruv skriptini yozing**

`server/scripts/daf-a1-check.ts`:

```ts
/**
 * A1 xaritasini tekshiradi.
 *
 *   npm run daf:a1-check
 *
 * Muammo topilsa 1 kod bilan chiqadi — CI va qo'lda yugurishda bir xil
 * ishlaydi. Ro'yxat to'liq chiqadi, birinchi muammoda to'xtamaydi.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateKurs } from '../src/daf/kurs/kurs.validate';
import type { KursFile } from '../src/daf/kurs/kurs.types';

const PATH = join(__dirname, '..', 'content', 'daf', 'a1', 'kurs.json');

function main(): void {
  const file = JSON.parse(readFileSync(PATH, 'utf8')) as KursFile;
  const problems = validateKurs(file);

  if (problems.length > 0) {
    console.error(`${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const sections = file.units.reduce((n, u) => n + u.sections.length, 0);
  const words = file.units.reduce(
    (n, u) => n + u.sections.reduce((m, s) => m + s.wordBudget, 0),
    0,
  );
  console.log(
    `Xarita toza: ${file.units.length} unit, ${sections} bo'lim, ${words} asosiy so'z.`,
  );
}

main();
```

- [ ] **Step 5: `package.json` ga buyruq qo'shing**

`server/package.json` dagi `scripts` ichiga, `daf:seed` qatoridan keyin:

```json
"daf:a1-check": "ts-node scripts/daf-a1-check.ts",
```

- [ ] **Step 6: Tekshiring**

Run: `cd server && npm run daf:a1-check`
Expected: `Xarita toza: 12 unit, 64 bo'lim, 592 asosiy so'z.`

(8 unit × 50 + 4 unit × 48 = 592.)

Run: `cd server && npx jest src/daf/kurs/`
Expected: PASS — 13 ta test.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/content/daf/a1/kurs.json server/scripts/daf-a1-check.ts \
        server/src/daf/kurs/kurs.file.spec.ts server/package.json
git commit -m "A1 xaritasi: 12 unit, 64 bo'lim"
```

- [ ] **Step 8: DARVOZA — CEO tasdiqlaydi**

Bu yerda **to'xtang**. Xaritani CEO ko'radi va tasdiqlaydi. Tasdiqlanmaguncha
Task 3 boshlanmaydi: bo'lim chegarasi keyin o'zgarsa, bazadagi struktura ham,
kontent ham qayta quriladi.

Ko'rsatiladigan narsa: `npm run daf:a1-check` chiqishi va yuqoridagi 64 qatorli jadval.

---

## Task 3: Ma'lumot modeli — `DafSection` va seans turi

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260903120000_daf_a1_kurs/migration.sql`
- Test: `server/src/daf/daf-schema.spec.ts` (mavjud faylga qo'shiladi)

**Interfaces:**
- Consumes: hech narsa.
- Produces: `DafSection` modeli, `DafLessonKind` enumi (`SECTION_A`, `SECTION_B`, `BRIDGE`, `UNIT_TEST`), `DafUnit.code`, `DafUnit.retiredAt`, `DafLesson.kind`, `DafLesson.sectionId`.

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/daf-schema.spec.ts` oxiriga qo'shing:

```ts
describe('A1 kurs strukturasi', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  it('DafSection modeli bor', () => {
    expect(schema).toMatch(/model DafSection \{/);
  });

  it('bo`lim kaliti yagona', () => {
    const model = schema.split('model DafSection {')[1].split('}')[0];
    expect(model).toMatch(/code\s+String\s+@unique/);
  });

  it('seans turi enum sifatida belgilangan', () => {
    expect(schema).toMatch(
      /enum DafLessonKind \{[^}]*SECTION_A[^}]*SECTION_B[^}]*BRIDGE[^}]*UNIT_TEST/s,
    );
  });

  it('unit nafaqaga chiqarilishi mumkin', () => {
    const model = schema.split('model DafUnit {')[1].split('\n}')[0];
    expect(model).toMatch(/retiredAt\s+DateTime\?/);
    expect(model).toMatch(/code\s+String\?\s+@unique/);
  });

  it('tier majburiy emas — eski darslar uchun qoladi', () => {
    const model = schema.split('model DafLesson {')[1].split('\n}')[0];
    expect(model).toMatch(/tier\s+Int\?/);
    expect(model).toMatch(/kind\s+DafLessonKind\?/);
    expect(model).toMatch(/sectionId\s+Int\?/);
  });
});
```

Fayl boshida `readFileSync` va `join` importlari bo'lmasa qo'shing:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: FAIL — `model DafSection` topilmaydi.

- [ ] **Step 3: Sxemani o'zgartiring**

`server/prisma/schema.prisma` da `DafUnit` modeliga ikki maydon qo'shing:

```prisma
  /// Barqaror kalit: `u01`. Seed shu bo'yicha yangilaydi — `order` emas,
  /// chunki eski bo'limlar nafaqaga chiqqanda tartib raqamlari bo'shaydi.
  code          String?  @unique
  /// Nafaqaga chiqqan bo'lim: o'quvchiga ko'rinmaydi, lekin lug'ati va
  /// audiosi zaxira sifatida bazada qoladi. O'chirish ma'lumotni yo'qotardi.
  retiredAt     DateTime?
```

va `sections DafSection[]` munosabatini qo'shing.

`DafLesson` modelida `tier` ni ixtiyoriy qiling va uch maydon qo'shing:

```prisma
  /// Eski DiB darslarining qiyinlik bosqichi. Yangi kursda ishlatilmaydi.
  tier      Int?
  /// Seans turi. `null` — eski DiB darsi.
  kind      DafLessonKind?
  sectionId Int?
  section   DafSection? @relation(fields: [sectionId], references: [id])
```

`@@unique([unitId, tier])` qatorini **o'chiring** — yangi kursda bir unitda
15–18 seans bor va ular `tier` bilan ajralmaydi.

Yangi enum va model:

```prisma
/// Seans turi.
///
/// `SECTION_A` tanib olishga, `SECTION_B` ishlab chiqarishga qaratilgan.
/// `BRIDGE` — bo'limdan bo'limga o'tish: yarmi endi tugagan bo'limdan,
/// yarmi oldingilaridan. So'z shu joyda birinchi marta o'z konteksti
/// tashqarisida tekshiriladi.
enum DafLessonKind {
  SECTION_A
  SECTION_B
  BRIDGE
  UNIT_TEST
}

/// Unit ichidagi MAVZULI bo'lim.
///
/// Qiyinlik bo'lim ichida ko'tariladi, bo'limlar orasida emas: aks holda
/// bitta darsda «Tisch» ham «Krankenhaus» ham chiqib, mavzu yo'qolardi.
model DafSection {
  id          Int      @id @default(autoincrement())
  unitId      Int
  order       Int
  /// Barqaror kalit: `u01-s3`.
  code        String   @unique
  titleDe     String
  titleUz     String
  grammar     String
  grammarUz   String
  /// Xaritada rejalashtirilgan asosiy so'zlar soni — kontent to'ldirilganda
  /// haqiqiy son shunga solishtiriladi.
  wordBudget  Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  unit    DafUnit     @relation(fields: [unitId], references: [id])
  lessons DafLesson[]

  @@unique([unitId, order])
  @@index([unitId])
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Migratsiyani yozing**

`migrate dev` bu repo'da ishlamaydi. SQL'ni `migrate diff` bilan chiqaring:

```bash
cd server
mkdir -p prisma/migrations/20260903120000_daf_a1_kurs
git show HEAD:server/prisma/schema.prisma > /tmp/old-kurs.prisma
npx prisma migrate diff \
  --from-schema /tmp/old-kurs.prisma \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/20260903120000_daf_a1_kurs/migration.sql
```

Chiqqan SQL faylining **oxiriga** quyidagini qo'lda qo'shing. Bu eski A1
bo'limlarini nafaqaga chiqaradi va `@@unique([level, order])` ni bo'shatadi —
aks holda yangi `A1 #1` eskisi bilan to'qnashadi:

```sql
-- Eski DiB bo'limlari nafaqaga chiqadi. O'chirilmaydi: ularning lug'ati,
-- tarjimasi va audiosi yangi kurs uchun zaxira. Tartib raqami manfiyga
-- o'tkaziladi, chunki yangi 12 unit 1..12 ni egallaydi.
UPDATE "DafUnit"
   SET "retiredAt" = NOW(),
       "order" = -"id"
 WHERE "level" = 'A1' AND "retiredAt" IS NULL;
```

- [ ] **Step 6: Dev bazaga qo'llang**

```bash
cd server
npx prisma db execute \
  --file prisma/migrations/20260903120000_daf_a1_kurs/migration.sql \
  --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260903120000_daf_a1_kurs
npx prisma generate
```

- [ ] **Step 7: Tekshiring**

Run: `cd server && npx prisma migrate status`
Expected: `Database schema is up to date!`

Run: `cd server && npm run typecheck`
Expected: `daf-seed.service.ts` va `daf-portal-read.service.ts` da `tier`
bo'yicha xatolar chiqishi mumkin (`tier` endi `null` bo'lishi mumkin).
Ular shu qadamda tuzatiladi: o'qish joyida `tier ?? 0` yoki
`kind`ga qarab shart qo'ying. Test yiqilmasligi kerak.

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/prisma/ server/src/daf/
git commit -m "Bo'lim jadvali va seans turi; eski A1 bo'limlari nafaqaga chiqdi"
```

---

## Task 4: Seans ro'yxatini quruvchi

**Files:**
- Create: `server/src/daf/kurs/kurs-lessons.ts`
- Test: `server/src/daf/kurs/kurs-lessons.spec.ts`

**Interfaces:**
- Consumes: `KursUnitSpec` (Task 1).
- Produces:
  - `type LessonKind = 'SECTION_A' | 'SECTION_B' | 'BRIDGE' | 'UNIT_TEST'`
  - `interface PlannedLesson { order: number; sourceId: string; kind: LessonKind; sectionCode: string | null; titleUz: string; titleDe: string }`
  - `planLessons(unit: KursUnitSpec): PlannedLesson[]`
  - `lessonSourceId(unitCode: string, kind: LessonKind, sectionOrder?: number): string`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/kurs/kurs-lessons.spec.ts`:

```ts
import { planLessons, lessonSourceId } from './kurs-lessons';
import type { KursUnitSpec } from './kurs.types';

function unit(sectionCount: number): KursUnitSpec {
  return {
    order: 1,
    code: 'u01',
    titleDe: 'Hallo!',
    titleUz: 'Salom!',
    theme: 'sinov',
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      order: i + 1,
      code: `u01-s${i + 1}`,
      titleDe: `Abschnitt ${i + 1}`,
      titleUz: `${i + 1}-qism`,
      grammar: 'Personalpronomen',
      grammarUz: 'olmosh',
      wordBudget: 10,
    })),
  };
}

describe('planLessons', () => {
  it('5 bo`limli unitda 15 seans quradi', () => {
    // 5 bo'lim × 2 dars + 4 o'tish + 1 yakun
    expect(planLessons(unit(5))).toHaveLength(15);
  });

  it('6 bo`limli unitda 18 seans quradi', () => {
    expect(planLessons(unit(6))).toHaveLength(18);
  });

  it('tartib 1 dan uzluksiz boradi', () => {
    const orders = planLessons(unit(5)).map((l) => l.order);
    expect(orders).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('har bo`limdan keyin A, B va o`tish keladi', () => {
    const kinds = planLessons(unit(3)).map((l) => l.kind);
    expect(kinds).toEqual([
      'SECTION_A', 'SECTION_B', 'BRIDGE',
      'SECTION_A', 'SECTION_B', 'BRIDGE',
      'SECTION_A', 'SECTION_B',
      'UNIT_TEST',
    ]);
  });

  it('oxirgi bo`limdan keyin o`tish sinovi yo`q', () => {
    const lessons = planLessons(unit(5));
    expect(lessons.filter((l) => l.kind === 'BRIDGE')).toHaveLength(4);
  });

  it('o`tish sinovi o`zi tugatgan bo`limga bog`lanadi', () => {
    const bridge = planLessons(unit(3)).find((l) => l.kind === 'BRIDGE');
    expect(bridge?.sectionCode).toBe('u01-s1');
  });

  it('unit yakuni hech bir bo`limga bog`lanmaydi', () => {
    const test = planLessons(unit(3)).find((l) => l.kind === 'UNIT_TEST');
    expect(test?.sectionCode).toBeNull();
  });

  it('kalitlar takrorlanmaydi', () => {
    const ids = planLessons(unit(6)).map((l) => l.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kalit o`qiladigan shaklda quriladi', () => {
    expect(lessonSourceId('u01', 'SECTION_A', 3)).toBe('u01-s03-a');
    expect(lessonSourceId('u01', 'BRIDGE', 3)).toBe('u01-s03-bridge');
    expect(lessonSourceId('u01', 'UNIT_TEST')).toBe('u01-test');
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs-lessons.spec.ts`
Expected: FAIL — `Cannot find module './kurs-lessons'`

- [ ] **Step 3: Quruvchini yozing**

`server/src/daf/kurs/kurs-lessons.ts`:

```ts
import type { KursUnitSpec } from './kurs.types';

export type LessonKind = 'SECTION_A' | 'SECTION_B' | 'BRIDGE' | 'UNIT_TEST';

export interface PlannedLesson {
  order: number;
  sourceId: string;
  kind: LessonKind;
  /** O'tish sinovi O'ZI TUGATGAN bo'limga bog'lanadi; unit yakuni — `null`. */
  sectionCode: string | null;
  titleDe: string;
  titleUz: string;
}

/**
 * Seansning barqaror kaliti. Seed shu bo'yicha yangilaydi, takrorlamaydi —
 * `order` bo'yicha bog'lash bo'lim qo'shilganda hamma seansni siljitardi.
 */
export function lessonSourceId(
  unitCode: string,
  kind: LessonKind,
  sectionOrder?: number,
): string {
  if (kind === 'UNIT_TEST') return `${unitCode}-test`;
  const s = String(sectionOrder).padStart(2, '0');
  if (kind === 'BRIDGE') return `${unitCode}-s${s}-bridge`;
  return `${unitCode}-s${s}-${kind === 'SECTION_A' ? 'a' : 'b'}`;
}

/**
 * Unitning seans ro'yxatini quradi: har bo'limga ikki dars, bo'limlar
 * orasiga o'tish sinovi, oxirida unit yakuni.
 *
 * O'tish sinovi OXIRGI bo'limdan keyin qo'yilmaydi — undan keyin darhol
 * unit yakuni keladi va ikkalasi bir xil ishni qilardi.
 */
export function planLessons(unit: KursUnitSpec): PlannedLesson[] {
  const lessons: PlannedLesson[] = [];
  const push = (
    kind: LessonKind,
    sectionCode: string | null,
    titleDe: string,
    titleUz: string,
    sectionOrder?: number,
  ): void => {
    lessons.push({
      order: lessons.length + 1,
      sourceId: lessonSourceId(unit.code, kind, sectionOrder),
      kind,
      sectionCode,
      titleDe,
      titleUz,
    });
  };

  unit.sections.forEach((s, i) => {
    push('SECTION_A', s.code, s.titleDe, `${s.titleUz} — tanishuv`, s.order);
    push('SECTION_B', s.code, s.titleDe, `${s.titleUz} — ishlatish`, s.order);
    if (i < unit.sections.length - 1) {
      push('BRIDGE', s.code, `${s.titleDe} — Wiederholung`, `${s.titleUz} — o'tish sinovi`, s.order);
    }
  });

  push('UNIT_TEST', null, 'Kurz und klar', `${unit.titleUz} — yakuniy sinov`);

  return lessons;
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs-lessons.spec.ts`
Expected: PASS — 9 ta test.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/kurs/kurs-lessons.ts server/src/daf/kurs/kurs-lessons.spec.ts
git commit -m "Seans ro'yxati: bo'limga ikki dars, orasiga o'tish sinovi"
```

---

## Task 5: Xaritani bazaga tushirish

**Files:**
- Create: `server/src/daf/kurs/kurs-seed.service.ts`
- Test: `server/src/daf/kurs/kurs-seed.service.spec.ts`
- Create: `server/scripts/daf-a1-seed.ts`
- Modify: `server/package.json` (scripts)
- Modify: `server/src/daf/daf.module.ts`

**Interfaces:**
- Consumes: `KursFile` (Task 1), `planLessons` (Task 4), `DafSection`/`DafLessonKind` (Task 3).
- Produces: `KursSeedService.seed(file: KursFile): Promise<KursSeedReport>`, `interface KursSeedReport { units: number; sections: number; lessons: number; retired: number }`.

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/kurs/kurs-seed.service.spec.ts`:

```ts
import { KursSeedService } from './kurs-seed.service';
import type { KursFile } from './kurs.types';

function kurs(): KursFile {
  return {
    level: 'A1',
    units: [
      {
        order: 1,
        code: 'u01',
        titleDe: 'Hallo!',
        titleUz: 'Salom!',
        theme: 'tanishuv',
        sections: [
          { order: 1, code: 'u01-s1', titleDe: 'A', titleUz: 'A', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
          { order: 2, code: 'u01-s2', titleDe: 'B', titleUz: 'B', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
        ],
      },
    ],
  };
}

/** Prisma o'rniga eng kichik soxta obyekt — baza kerak emas. */
function fakePrisma() {
  const unitRows = new Map<string, { id: number }>();
  const sectionRows = new Map<string, { id: number }>();
  const lessonRows = new Map<string, { id: number }>();
  const retired: string[] = [];
  let seq = 0;

  return {
    retired,
    unitRows,
    sectionRows,
    lessonRows,
    dafUnit: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.code as string;
        if (!unitRows.has(key)) unitRows.set(key, { id: ++seq });
        return unitRows.get(key);
      }),
      findMany: jest.fn(async () => [{ id: 99, code: 'dib-01' }]),
      update: jest.fn(async ({ where }: any) => {
        retired.push(String(where.id));
        return { id: where.id };
      }),
    },
    dafSection: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.code as string;
        if (!sectionRows.has(key)) sectionRows.set(key, { id: ++seq });
        return sectionRows.get(key);
      }),
    },
    dafLesson: {
      upsert: jest.fn(async ({ where }: any) => {
        const key = where.sourceId as string;
        if (!lessonRows.has(key)) lessonRows.set(key, { id: ++seq });
        return lessonRows.get(key);
      }),
    },
  };
}

describe('KursSeedService', () => {
  it('unit, bo`lim va seanslarni yozadi', async () => {
    const prisma = fakePrisma();
    const report = await new KursSeedService(prisma as any).seed(kurs());

    // 2 bo'lim × 2 dars + 1 o'tish + 1 yakun = 6
    expect(report).toEqual({ units: 1, sections: 2, lessons: 6, retired: 1 });
  });

  it('xaritada yo`q eski A1 bo`limini nafaqaga chiqaradi', async () => {
    const prisma = fakePrisma();
    await new KursSeedService(prisma as any).seed(kurs());

    expect(prisma.dafUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({ retiredAt: expect.any(Date) }),
      }),
    );
  });

  it('qayta yuritilganda takrorlamaydi', async () => {
    const prisma = fakePrisma();
    const service = new KursSeedService(prisma as any);
    await service.seed(kurs());
    await service.seed(kurs());

    expect(prisma.unitRows.size).toBe(1);
    expect(prisma.sectionRows.size).toBe(2);
    expect(prisma.lessonRows.size).toBe(6);
  });

  it('bo`limni unitga bog`laydi', async () => {
    const prisma = fakePrisma();
    await new KursSeedService(prisma as any).seed(kurs());

    const call = prisma.dafSection.upsert.mock.calls[0][0] as any;
    expect(call.create.unitId).toBe(1);
    expect(call.create.code).toBe('u01-s1');
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs-seed.service.spec.ts`
Expected: FAIL — `Cannot find module './kurs-seed.service'`

- [ ] **Step 3: Servisni yozing**

`server/src/daf/kurs/kurs-seed.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { planLessons } from './kurs-lessons';
import type { KursFile } from './kurs.types';

export interface KursSeedReport {
  units: number;
  sections: number;
  lessons: number;
  retired: number;
}

/**
 * Xaritani bazaga yozadi. Idempotent: qayta yuritish yangilaydi,
 * takrorlamaydi — barqaror kalitlar (`code`, `sourceId`) bo'yicha ishlaydi.
 */
@Injectable()
export class KursSeedService {
  private readonly logger = new Logger(KursSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(file: KursFile): Promise<KursSeedReport> {
    let sections = 0;
    let lessons = 0;
    const liveCodes = new Set<string>();

    for (const u of file.units) {
      liveCodes.add(u.code);

      const unit = await this.prisma.dafUnit.upsert({
        where: { code: u.code },
        create: {
          code: u.code,
          level: 'A1',
          order: u.order,
          titleDe: u.titleDe,
          titleUz: u.titleUz,
        },
        update: {
          order: u.order,
          titleDe: u.titleDe,
          titleUz: u.titleUz,
          retiredAt: null,
        },
      });

      const sectionIdByCode = new Map<string, number>();

      for (const s of u.sections) {
        const row = await this.prisma.dafSection.upsert({
          where: { code: s.code },
          create: {
            code: s.code,
            unitId: unit.id,
            order: s.order,
            titleDe: s.titleDe,
            titleUz: s.titleUz,
            grammar: s.grammar,
            grammarUz: s.grammarUz,
            wordBudget: s.wordBudget,
          },
          update: {
            unitId: unit.id,
            order: s.order,
            titleDe: s.titleDe,
            titleUz: s.titleUz,
            grammar: s.grammar,
            grammarUz: s.grammarUz,
            wordBudget: s.wordBudget,
          },
        });
        sectionIdByCode.set(s.code, row.id);
        sections += 1;
      }

      for (const l of planLessons(u)) {
        const sectionId =
          l.sectionCode === null ? null : (sectionIdByCode.get(l.sectionCode) ?? null);

        await this.prisma.dafLesson.upsert({
          where: { sourceId: l.sourceId },
          create: {
            sourceId: l.sourceId,
            unitId: unit.id,
            sectionId,
            order: l.order,
            kind: l.kind,
            titleDe: l.titleDe,
            titleUz: l.titleUz,
          },
          update: {
            unitId: unit.id,
            sectionId,
            order: l.order,
            kind: l.kind,
            titleDe: l.titleDe,
            titleUz: l.titleUz,
          },
        });
        lessons += 1;
      }
    }

    const retired = await this.retireOld(liveCodes);

    this.logger.log(
      `A1 xaritasi: ${file.units.length} unit, ${sections} bo'lim, ${lessons} seans, ${retired} nafaqa`,
    );

    return { units: file.units.length, sections, lessons, retired };
  }

  /**
   * Xaritada yo'q A1 bo'limlarini nafaqaga chiqaradi.
   *
   * O'chirmaydi: eski DiB bo'limlarining lug'ati, tarjimasi va audiosi
   * yangi kurs uchun zaxira. Tartib raqami manfiyga o'tkaziladi, chunki
   * `@@unique([level, order])` ni yangi 12 unit egallaydi.
   */
  private async retireOld(liveCodes: Set<string>): Promise<number> {
    const old = await this.prisma.dafUnit.findMany({
      where: { level: 'A1', retiredAt: null },
      select: { id: true, code: true },
    });

    let n = 0;
    for (const u of old) {
      if (u.code !== null && liveCodes.has(u.code)) continue;
      await this.prisma.dafUnit.update({
        where: { id: u.id },
        data: { retiredAt: new Date(), order: -u.id },
      });
      n += 1;
    }
    return n;
  }
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/kurs/kurs-seed.service.spec.ts`
Expected: PASS — 4 ta test.

- [ ] **Step 5: Skriptni yozing**

`server/scripts/daf-a1-seed.ts`:

```ts
/**
 * A1 xaritasini bazaga tushiradi.
 *
 *   npm run daf:a1-seed
 *
 * Idempotent. Tushirishdan OLDIN xaritani tekshiradi — buzilgan fayl
 * bazaga yetib bormaydi.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { KursSeedService } from '../src/daf/kurs/kurs-seed.service';
import { validateKurs } from '../src/daf/kurs/kurs.validate';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { KursFile } from '../src/daf/kurs/kurs.types';

const PATH = join(__dirname, '..', 'content', 'daf', 'a1', 'kurs.json');

async function main(): Promise<void> {
  const file = JSON.parse(readFileSync(PATH, 'utf8')) as KursFile;

  const problems = validateKurs(file);
  if (problems.length > 0) {
    console.error(`Xarita buzuq — ${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const service = new KursSeedService(prisma as unknown as PrismaService);
    const report = await service.seed(file);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Modul va buyruqni ulang**

`server/package.json` scripts ichiga:

```json
"daf:a1-seed": "ts-node scripts/daf-a1-seed.ts",
```

`server/src/daf/daf.module.ts` dagi `providers` ro'yxatiga `KursSeedService`
qo'shing va faylning boshiga import yozing:

```ts
import { KursSeedService } from './kurs/kurs-seed.service';
```

- [ ] **Step 7: Dev bazada yuguring**

Run: `cd server && npm run daf:a1-seed`
Expected:

```json
{
  "units": 12,
  "sections": 64,
  "lessons": 192,
  "retired": 20
}
```

- [ ] **Step 8: Bazani tekshiring**

`server/scripts/_tmp-kurs-check.ts` yarating, yuriting, so'ng **o'chiring**:

```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

void (async () => {
  const q = (sql: string) => prisma.$queryRawUnsafe(sql);
  console.log('faol A1 unitlar', await q(
    `select count(*)::int from "DafUnit" where level='A1' and "retiredAt" is null`));
  console.log('nafaqadagi A1', await q(
    `select count(*)::int from "DafUnit" where level='A1' and "retiredAt" is not null`));
  console.log('bo`limlar', await q(`select count(*)::int from "DafSection"`));
  console.log('seans turlari', await q(
    `select kind, count(*)::int from "DafLesson" where kind is not null group by 1 order by 1`));
  await prisma.$disconnect();
})();
```

Run: `cd server && npx ts-node scripts/_tmp-kurs-check.ts && rm scripts/_tmp-kurs-check.ts`

Expected: faol A1 = 12, nafaqada = 20, bo'limlar = 64, seanslar
`SECTION_A` 64, `SECTION_B` 64, `BRIDGE` 52, `UNIT_TEST` 12.

(64 bo'lim − 12 unit = 52 o'tish sinovi.)

- [ ] **Step 9: Ikkinchi marta yuriting**

Run: `cd server && npm run daf:a1-seed`
Expected: xuddi o'sha raqamlar, `retired: 0`. Takrorlanish yo'q.

- [ ] **Step 10: ADR yozing**

`docs/adr/0014-a1-kursi-on-ikki-unitga-bolinadi.md`:

```markdown
# ADR-0014: A1 kursi o'n ikki unitga bo'linadi

**Holat:** Qabul qilingan · **Sana:** 2026-09-03

## Kontekst

Faza 2 A1 ni manbaning lug'at bo'limlaridan hosil qilingan 20 bo'limga
ajratgan edi. Bo'lim chegarasi manbaning shakliga bog'langani uchun hajmi
teng emas edi va mavzu bilan mos tushmasdi.

## Qaror

A1 **12 unitga** bo'linadi, har unit **5–6 mavzuli bo'limga**. Xarita
`server/content/daf/a1/kurs.json` da qo'lda yoziladi, validator qo'riqlaydi,
seed shundan quradi. Unitga ko'pi bilan 50 asosiy so'z.

Qiyinlik bo'lim ICHIDA ko'tariladi: har bo'limga «tanishuv» va «ishlatish»
darsi, bo'limlar orasiga o'tish sinovi, unit oxirida yakuniy sinov.

## Sabab

Manbaning bo'linishi o'quvchining ehtiyoji emas, manbaning yorlig'i edi:
bitta bo'limga 26 dars va 226 so'z tushib qolgan edi. Faqat qiyilik bo'yicha
bo'lish esa mavzuni yo'qotadi — bitta darsda «Tisch» ham «Krankenhaus» ham
chiqadi. Mavzu ichida qiyilik ko'tarilishi ikkalasini beradi.

## Oqibat

Eski 20 bo'lim **nafaqaga chiqadi, o'chirilmaydi**: ularning 1 843 so'zi,
tarjimasi va videosi yangi kurs uchun zaxira bo'lib qoladi. `DafLesson.tier`
ixtiyoriyga aylandi va `@@unique([unitId, tier])` olib tashlandi.
```

- [ ] **Step 11: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/kurs/ server/scripts/daf-a1-seed.ts \
        server/package.json server/src/daf/daf.module.ts docs/adr/
git commit -m "A1 xaritasi bazaga tushdi: 12 unit, 64 bo'lim, 192 seans"
```

---

## Reja tugagach

Bazada A1 ning **bo'sh strukturasi** turadi: 12 unit, 64 bo'lim, 192 seans.
Kontent yo'q — so'z, gap, dialog va grammatika keyingi rejada. Ekran ham
hali eski Faza 2 ekrani.

**Keyingi rejalar:**
1. **1-unit matni** — 50 so'z, ~60 gap, 6 dialog, grammatika, Redemittel; `de`/`tts` maydonlari bilan.
2. **Dvigatel** — savol quruvchi (12 ovozsiz format), javob tekshirish, Leitner.
3. **Ekran** — `/portal/lernen` qayta quriladi, 1-unit o'ynaladigan bo'ladi.
4. **Media** — 1-unitning rasmi va ovozi (CEO ruxsati bilan, ≈ $0.72).
