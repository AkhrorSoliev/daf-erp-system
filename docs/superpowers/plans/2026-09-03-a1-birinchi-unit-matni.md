# A1 — 1-unitning matni

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A1 ning 1-uniti («Hallo!») to'liq matn bilan to'ldiriladi — 50 asosiy so'z, ~60 gap, 6 dialog, 5 grammatika qoidasi va Redemittel — va bazaga tushadi.

**Architecture:** So'z ro'yxatining o'zagi Goethe A1 Wortliste'sidan olinadi va `goethe-a1.json` ga yoziladi. Undan so'zlar bo'limlarga **bosqichma-bosqich** taqsimlanadi (`wortliste.json`) — 12 unitning hammasi emas, hozircha faqat 1-unit; validator so'z ikki joyda ishlatilmasligini qo'riqlaydi. Matnning o'zi `content/daf/a1/u01/` dagi beshta faylda yashaydi, hammasi validatordan o'tadi, so'ng bitta seed bilan bazaga tushadi.

**Tech Stack:** NestJS, Prisma 7 (PostgreSQL/Neon), jest + ts-jest, ts-node skriptlar, `pypdf` (bir martalik ajratish), OpenAI `gpt-4o-mini` (faqat gap generatsiyasi).

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-03-a1-kurs-design.md`. Ziddiyat chiqsa dizayn ustun.
- Bu reja **faqat 1-unit** matnini beradi. 2–12 unitlar, savol quruvchi, ekran, rasm va ovoz **bu rejada yo'q**.
- Xarita `server/content/daf/a1/kurs.json` **o'zgarmaydi** — u CEO tasdiqlagan.
- 1-unitning byudjeti: 5 bo'lim × 10 so'z = **50 asosiy so'z**, bo'limdan chiqib ketmaydi.
- Har so'z, gap va dialog satrida `de` (ekranda ko'rinadigani) bo'ladi; harf yoki raqam bo'lsa `tts` (aytiladigani) **majburiy**.
- O'zbekchani erkin yozdirish yo'q — bu qoida mashq turlariga tegishli, lekin material shunga mos yoziladi: har `de` ning bitta aniq `uz` tarjimasi bo'ladi.
- **Netzwerk yoki Goethe ning MATNI ko'chirilmaydi.** Goethe ro'yxatidan faqat *qaysi so'z A1 ga kiradi* degan fakt olinadi; misol gaplar, dialoglar va izohlar biznikidir.
- Barcha yozuvlar lotin alifbosidagi o'zbekcha. Kirill yoki arab harflari ishlatilmaydi.
- Ish `feat/daf-a1-kontent` shoxida, `.worktrees/daf-a1-kontent` worktree'sida. `git reset --hard` ishlatilmaydi.
- `server/node_modules` asosiy repo bilan umumiy: typecheck yolg'on xato bersa `npx prisma generate`.
- Har commit oldidan `npm test` va `npm run typecheck` o'tishi shart.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/daf/inhalt/goethe-parse.ts` | Goethe PDF matnidan bosh so'zlarni ajratadi (sof funksiya) |
| `server/src/daf/inhalt/goethe-parse.spec.ts` | Ajratish testlari |
| `server/scripts/daf-goethe-extract.ts` | `npm run daf:goethe-extract` — PDF matnini o'qib `goethe-a1.json` yozadi |
| `server/content/daf/a1/goethe-a1.json` | Goethe A1 bosh so'zlari (fakt ro'yxati) |
| `server/src/daf/inhalt/wortliste.types.ts` | `WortlisteFile`, `WortEintrag` |
| `server/src/daf/inhalt/wortliste.validate.ts` | So'z taqsimotining qoidalari |
| `server/src/daf/inhalt/wortliste.validate.spec.ts` | Qoida testlari |
| `server/content/daf/a1/wortliste.json` | So'z → bo'lim biriktirilishi (bosqichma-bosqich to'ladi) |
| `server/src/daf/inhalt/unit-inhalt.types.ts` | `WoerterFile`, `SaetzeFile`, `DialogeFile`, `GrammatikFile`, `RedemittelFile` |
| `server/src/daf/inhalt/unit-inhalt.validate.ts` | Unit matnining qoidalari |
| `server/src/daf/inhalt/unit-inhalt.validate.spec.ts` | Qoida testlari |
| `server/src/daf/inhalt/unit-inhalt.file.spec.ts` | Haqiqiy `u01/*` fayllarini qo'riqlaydi |
| `server/scripts/daf-inhalt-check.ts` | `npm run daf:inhalt-check -- --unit 1` |
| `server/content/daf/a1/u01/woerter.json` | 50 asosiy so'z + passivlar |
| `server/content/daf/a1/u01/grammatik.json` | 5 qoida + misollar |
| `server/content/daf/a1/u01/redemittel.json` | Vaziyat → ibora |
| `server/content/daf/a1/u01/dialoge.json` | 6 dialog, satrma-satr |
| `server/content/daf/a1/u01/saetze.json` | ~60 gap (yasalgan) |
| `server/scripts/daf-gen-u01-saetze.ts` | `npm run daf:gen-saetze -- --unit 1` |
| `server/prisma/schema.prisma` | `DafLexeme.sectionId/tts/artikel/plural`, `DafSentence.sectionId/tts`, `DafDialog`, `DafDialogLine`, `DafPhrase` |
| `server/src/daf/inhalt/inhalt-seed.service.ts` | Unit matnini bazaga yozadi |
| `server/scripts/daf-inhalt-seed.ts` | `npm run daf:inhalt-seed -- --unit 1` |

---

## Task 1: Goethe ro'yxatini ajratish

**Files:**
- Create: `server/src/daf/inhalt/goethe-parse.ts`
- Test: `server/src/daf/inhalt/goethe-parse.spec.ts`
- Create: `server/scripts/daf-goethe-extract.ts`
- Create: `server/content/daf/a1/goethe-a1.json`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: hech narsa.
- Produces:
  - `interface GoetheWort { artikel: string | null; wort: string }`
  - `interface GoetheFile { source: string; words: GoetheWort[] }`
  - `parseGoetheLines(lines: string[]): GoetheWort[]`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/inhalt/goethe-parse.spec.ts`:

```ts
import { parseGoetheLines } from './goethe-parse';

describe('parseGoetheLines', () => {
  it('artiklsiz bosh so`zni oladi', () => {
    expect(parseGoetheLines(['aber Ich bin oft im Buero.'])).toEqual([
      { artikel: null, wort: 'aber' },
    ]);
  });

  it('artiklni ajratadi', () => {
    expect(parseGoetheLines(['die Adresse,-en Koennen Sie mir helfen?'])).toEqual([
      { artikel: 'die', wort: 'Adresse' },
    ]);
  });

  it('ko`plik qo`shimchasini tashlaydi', () => {
    const r = parseGoetheLines(['der Absender,- Da ist ein Brief.']);
    expect(r[0].wort).toBe('Absender');
  });

  it('misol gapning davomini so`z deb olmaydi', () => {
    // Ikkinchi satr — birinchi so'zning ikkinchi misoli. Katta harf bilan
    // boshlanadi, lekin bosh so'z emas: undan oldin bo'shliq turadi.
    expect(parseGoetheLines(['abholen Wann kannst du kommen?', '  Wir muessen ihn abholen.'])).toEqual([
      { artikel: null, wort: 'abholen' },
    ]);
  });

  it('sahifa sarlavhasini tashlaydi', () => {
    expect(parseGoetheLines(['VS_02_280312 Seite 9', 'A'])).toEqual([]);
  });

  it('takrorni bir marta qaytaradi', () => {
    const r = parseGoetheLines(['aber Beispiel eins.', 'aber Beispiel zwei.']);
    expect(r).toHaveLength(1);
  });

  it('bitta harfli satrni (alifbo bo`limi) tashlaydi', () => {
    expect(parseGoetheLines(['B'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/goethe-parse.spec.ts`
Expected: FAIL — `Cannot find module './goethe-parse'`

- [ ] **Step 3: Ajratuvchini yozing**

`server/src/daf/inhalt/goethe-parse.ts`:

```ts
/**
 * Goethe A1 Wortliste'sining matnidan BOSH SO'ZLARNI ajratadi.
 *
 * Faqat ro'yxat olinadi — qaysi so'z A1 ga kiradi degan FAKT. Nashrning
 * misol gaplari ko'chirilmaydi: ular Goethe-Institut ning matni, bizniki
 * emas. O'z misollarimizni o'zimiz yozamiz.
 *
 * Manba: https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf
 */
export interface GoetheWort {
  artikel: string | null;
  wort: string;
}

export interface GoetheFile {
  source: string;
  words: GoetheWort[];
}

const ARTIKEL = new Set(['der', 'die', 'das']);

/**
 * Bosh so'z satr BOSHIDA turadi. Ichkariga surilgan satr — oldingi
 * so'zning ikkinchi misoli yoki hosila yozuvi; uni bosh so'z deb olsak
 * ro'yxatga misol gapning birinchi so'zi tushib qolardi.
 */
export function parseGoetheLines(lines: string[]): GoetheWort[] {
  const out: GoetheWort[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    if (raw.startsWith(' ') || raw.startsWith('\t')) continue;

    const line = raw.replace(/­/g, '').replace(/\t/g, ' ').trim();
    if (line === '' || line.startsWith('VS_02')) continue;
    // Alifbo ajratgichi: bitta harf.
    if (/^[A-ZÄÖÜ]$/.test(line)) continue;

    const m = /^(der|die|das)?\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.-]*)/.exec(line);
    if (!m) continue;

    const artikel = m[1] && ARTIKEL.has(m[1]) ? m[1] : null;
    const wort = m[2];
    if (wort.length < 2) continue;

    const key = `${artikel ?? ''} ${wort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ artikel, wort });
  }

  return out;
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/goethe-parse.spec.ts`
Expected: PASS — 7 ta test.

- [ ] **Step 5: Ajratish skriptini yozing**

`server/scripts/daf-goethe-extract.ts`:

```ts
/**
 * Goethe A1 Wortliste'sini `goethe-a1.json` ga ajratadi.
 *
 *   npm run daf:goethe-extract -- --txt /yo'l/wortliste.txt
 *
 * PDF'ni o'qish bu skriptning ishi EMAS: PDF matni bir marta, qo'lda
 * chiqariladi (`python3 -c "from pypdf import PdfReader; ..."`) va shu
 * yerga matn fayli sifatida beriladi. Sabab — PDF kutubxonasi server
 * bog'liqliklariga kirmaydi, va ajratish bir martalik ish.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { parseGoetheLines, type GoetheFile } from '../src/daf/inhalt/goethe-parse';

const OUT = join(__dirname, '..', 'content', 'daf', 'a1', 'goethe-a1.json');
const SOURCE = 'https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf';

function main(): void {
  const i = process.argv.indexOf('--txt');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --txt <matn fayli>');
    process.exit(1);
  }

  const lines = readFileSync(process.argv[i + 1], 'utf8').split('\n');
  const words = parseGoetheLines(lines);

  const file: GoetheFile = { source: SOURCE, words };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`, 'utf8');

  console.log(`${words.length} ta bosh so'z yozildi.`);
}

main();
```

- [ ] **Step 6: `package.json` ga buyruq qo'shing**

`server/package.json` dagi `scripts` ichiga, `daf:a1-seed` qatoridan keyin:

```json
"daf:goethe-extract": "ts-node scripts/daf-goethe-extract.ts",
```

- [ ] **Step 7: PDF matnini chiqaring va ajrating**

```bash
cd server
curl -sL -o /tmp/goethe-a1.pdf https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf
python3 -c "
from pypdf import PdfReader
r = PdfReader('/tmp/goethe-a1.pdf')
open('/tmp/goethe-a1.txt','w').write('\n'.join((p.extract_text() or '') for p in r.pages[8:]))
"
npm run daf:goethe-extract -- --txt /tmp/goethe-a1.txt
```

Expected: `5XX ta bosh so'z yozildi.` (500 dan ko'p, 700 dan kam.)

Natijani ko'zdan kechiring: `head -40 content/daf/a1/goethe-a1.json`. Ro'yxatda
misol gapdan tushib qolgan so'z (masalan `Wir`, `Das`, `Ich`) ko'rinsa,
`parseGoetheLines` ga qo'shimcha test yozing va tuzating — qo'lda tahrir
qilmang, aks holda keyingi ajratishda qaytadan paydo bo'ladi.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/inhalt/ server/scripts/daf-goethe-extract.ts \
        server/content/daf/a1/goethe-a1.json server/package.json
git commit -m "Goethe A1 ro'yxati ajratildi — o'zak endi imtihon standartida"
```

---

## Task 2: So'z taqsimotining qoidalari

**Files:**
- Create: `server/src/daf/inhalt/wortliste.types.ts`
- Create: `server/src/daf/inhalt/wortliste.validate.ts`
- Test: `server/src/daf/inhalt/wortliste.validate.spec.ts`

**Interfaces:**
- Consumes: `GoetheWort` (Task 1), `KursFile` (`server/src/daf/kurs/kurs.types.ts`).
- Produces:
  - `interface WortEintrag { wort: string; artikel: string | null; section: string; core: boolean; grund?: string }`
  - `interface WortlisteFile { level: 'A1'; eintraege: WortEintrag[] }`
  - `validateWortliste(file: WortlisteFile, kurs: KursFile, goethe: GoetheWort[]): string[]`
  - `WORDS_MIN = 8`, `WORDS_MAX = 12`, `UNIT_WORDS_MAX = 50`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/inhalt/wortliste.validate.spec.ts`:

```ts
import { validateWortliste } from './wortliste.validate';
import type { WortlisteFile, WortEintrag } from './wortliste.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheWort } from './goethe-parse';

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

const GOETHE: GoetheWort[] = [
  { artikel: null, wort: 'hallo' },
  { artikel: null, wort: 'tschuess' },
  { artikel: 'der', wort: 'Name' },
];

function eintrag(wort: string, section = 'u01-s1'): WortEintrag {
  return { wort, artikel: null, section, core: true };
}

/** 8 ta so'z — eng kichik ruxsat etilgan bo'lim. */
function fullSection(code: string, prefix: string): WortEintrag[] {
  return Array.from({ length: 8 }, (_, i) => eintrag(`${prefix}${i}`, code));
}

function goetheFor(entries: WortEintrag[]): GoetheWort[] {
  return entries.map((e) => ({ artikel: null, wort: e.wort }));
}

describe('validateWortliste', () => {
  it('to`g`ri taqsimotda muammo topmaydi', () => {
    const eintraege = [...fullSection('u01-s1', 'a'), ...fullSection('u01-s2', 'b')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), goetheFor(eintraege))).toEqual([]);
  });

  it('bo`sh taqsimotni qabul qiladi — fayl bosqichma-bosqich to`ladi', () => {
    expect(validateWortliste({ level: 'A1', eintraege: [] }, kurs(), GOETHE)).toEqual([]);
  });

  it('bir so`z ikki bo`limda turolmasligini aytadi', () => {
    const eintraege = [
      ...fullSection('u01-s1', 'a'),
      ...fullSection('u01-s2', 'b'),
      eintrag('a0', 'u01-s2'),
    ];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('ikki joyda'))).toBe(true);
  });

  it('mavjud bo`lmagan bo`lim kalitini aytadi', () => {
    const eintraege = [...fullSection('u01-s1', 'a'), eintrag('x1', 'u09-s3')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('xaritada yo`q'))).toBe(true);
  });

  it('boshlangan bo`limda 8 dan kam so`z bo`lsa aytadi', () => {
    const eintraege = [eintrag('a0'), eintrag('a1')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('8–12'))).toBe(true);
  });

  it('bo`limda 12 dan ko`p so`z bo`lsa aytadi', () => {
    const eintraege = Array.from({ length: 13 }, (_, i) => eintrag(`a${i}`));
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('8–12'))).toBe(true);
  });

  it('unitning 50 so`z chegarasini aytadi', () => {
    const k = kurs();
    k.units[0].sections.push(
      { order: 3, code: 'u01-s3', titleDe: 'C', titleUz: 'C', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
      { order: 4, code: 'u01-s4', titleDe: 'D', titleUz: 'D', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
      { order: 5, code: 'u01-s5', titleDe: 'E', titleUz: 'E', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
    );
    const eintraege = ['u01-s1', 'u01-s2', 'u01-s3', 'u01-s4', 'u01-s5'].flatMap((c, n) =>
      Array.from({ length: 11 }, (_, i) => eintrag(`w${n}_${i}`, c)),
    );
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, k, goetheFor(eintraege));
    expect(p.some((x) => x.includes('50 so`zdan ko`p'))).toBe(true);
  });

  it('Goethe ro`yxatida yo`q so`zni sababsiz qabul qilmaydi', () => {
    const eintraege = fullSection('u01-s1', 'a');
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), GOETHE);
    expect(p.some((x) => x.includes("ro`yxatida yo`q"))).toBe(true);
  });

  it('sabab yozilgan so`zni qabul qiladi', () => {
    const eintraege = fullSection('u01-s1', 'a').map((e) => ({
      ...e,
      grund: 'kundalik nutqda kerak, imtihon ro`yxatidan tashqarida',
    }));
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), GOETHE)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/wortliste.validate.spec.ts`
Expected: FAIL — `Cannot find module './wortliste.validate'`

- [ ] **Step 3: Tiplarni yozing**

`server/src/daf/inhalt/wortliste.types.ts`:

```ts
/**
 * Qaysi so'z qaysi bo'limga tegishli — FAQAT biriktirish.
 *
 * So'zning tarjimasi, talaffuzi va rasmi bu yerda emas: ular unitning
 * o'z faylida (`u01/woerter.json`). Sabab — biriktirish butun kurs
 * bo'yicha yagona bo'lishi kerak (bir so'z ikki bo'limda o'rgatilmaydi),
 * tarjima esa unitning ichki ishi.
 *
 * Fayl BOSQICHMA-BOSQICH to'ladi: unit yozilganda uning so'zlari
 * qo'shiladi. To'liq bo'lishi shart emas, ziddiyatsiz bo'lishi shart.
 */
export interface WortEintrag {
  wort: string;
  artikel: string | null;
  /** `kurs.json` dagi bo'lim kaliti, masalan `u01-s3`. */
  section: string;
  /** `true` — mashqda so'raladi; `false` — faqat matnda uchraydi. */
  core: boolean;
  /**
   * Goethe ro'yxatidan tashqaridagi so'z uchun SABAB.
   *
   * Sababsiz qo'shish taqiqlangan: ro'yxatdan chetga chiqish qaror,
   * va qaror yozilmasa keyin uni tekshirib bo'lmaydi.
   */
  grund?: string;
}

export interface WortlisteFile {
  level: 'A1';
  eintraege: WortEintrag[];
}
```

- [ ] **Step 4: Validatorni yozing**

`server/src/daf/inhalt/wortliste.validate.ts`:

```ts
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheWort } from './goethe-parse';
import type { WortlisteFile } from './wortliste.types';

export const WORDS_MIN = 8;
export const WORDS_MAX = 12;
export const UNIT_WORDS_MAX = 50;

/**
 * So'z taqsimotini tekshiradi.
 *
 * BOSHLANGAN bo'limgagina hajm qoidasi qo'llanadi: fayl bosqichma-bosqich
 * to'ladi, va hali yozilmagan bo'limni «bo'sh» deb aybdor qilish butun
 * faylni 12 unit tugagunga qadar qizil holatda ushlab turardi.
 */
export function validateWortliste(
  file: WortlisteFile,
  kurs: KursFile,
  goethe: GoetheWort[],
): string[] {
  const problems: string[] = [];

  const known = new Set<string>();
  for (const s of kurs.units.flatMap((u) => u.sections)) known.add(s.code);

  const unitOfSection = new Map<string, string>();
  for (const u of kurs.units) {
    for (const s of u.sections) unitOfSection.set(s.code, u.code);
  }

  const goetheSet = new Set(goethe.map((g) => g.wort.toLowerCase()));

  const bySection = new Map<string, number>();
  const byUnit = new Map<string, number>();
  const seen = new Map<string, string>();

  for (const e of file.eintraege) {
    if (!known.has(e.section)) {
      problems.push(`${e.wort}: xaritada yo'q bo'lim — ${e.section}`);
      continue;
    }

    const prev = seen.get(e.wort.toLowerCase());
    if (prev !== undefined) {
      problems.push(`${e.wort}: ikki joyda — ${prev} va ${e.section}`);
    } else {
      seen.set(e.wort.toLowerCase(), e.section);
    }

    if (!goetheSet.has(e.wort.toLowerCase()) && (e.grund ?? '').trim() === '') {
      problems.push(`${e.wort}: Goethe ro'yxatida yo'q va sababi yozilmagan`);
    }

    bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
    const unit = unitOfSection.get(e.section);
    if (unit !== undefined) byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1);
  }

  for (const [code, n] of bySection) {
    if (n < WORDS_MIN || n > WORDS_MAX) {
      problems.push(`${code}: ${n} so'z — ${WORDS_MIN}–${WORDS_MAX} bo'lishi kerak`);
    }
  }

  for (const [code, n] of byUnit) {
    if (n > UNIT_WORDS_MAX) {
      problems.push(`${code}: jami ${n} so'z — ${UNIT_WORDS_MAX} so'zdan ko'p`);
    }
  }

  return problems;
}
```

- [ ] **Step 5: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/wortliste.validate.spec.ts`
Expected: PASS — 9 ta test.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/inhalt/
git commit -m "So'z taqsimotining qoidalari: bir so'z bitta bo'limda"
```

---

## Task 3: 1-unitning 50 so'zi

**Files:**
- Create: `server/content/daf/a1/wortliste.json`
- Create: `server/content/daf/a1/u01/woerter.json`
- Create: `server/src/daf/inhalt/unit-inhalt.types.ts`
- Create: `server/scripts/daf-inhalt-check.ts`
- Test: `server/src/daf/inhalt/unit-inhalt.file.spec.ts`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `validateWortliste` (Task 2), `WortlisteFile`, `KursFile`, `GoetheFile`.
- Produces:
  - `interface Wort { sourceId: string; section: string; de: string; tts?: string; uz: string; artikel?: string; plural?: string; core: boolean; order: number }`
  - `interface WoerterFile { unit: string; woerter: Wort[] }`
  - `npm run daf:inhalt-check -- --unit 1`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/inhalt/unit-inhalt.file.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste } from './wortliste.validate';
import type { WortlisteFile } from './wortliste.types';
import type { WoerterFile } from './unit-inhalt.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile } from './goethe-parse';

const A1 = join(__dirname, '..', '..', '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

describe('1-unitning so`zlari', () => {
  const kurs = read<KursFile>('kurs.json');
  const goethe = read<GoetheFile>('goethe-a1.json');
  const wortliste = read<WortlisteFile>('wortliste.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');

  it('taqsimot validatordan o`tadi', () => {
    expect(validateWortliste(wortliste, kurs, goethe.words)).toEqual([]);
  });

  it('1-unitda 50 ta asosiy so`z bor', () => {
    expect(woerter.woerter.filter((w) => w.core)).toHaveLength(50);
  });

  it('har asosiy so`z taqsimotda ham bor', () => {
    const inListe = new Set(
      wortliste.eintraege.map((e) => e.wort.toLowerCase()),
    );
    const yetishmayapti = woerter.woerter
      .filter((w) => w.core)
      .map((w) => w.de)
      .filter((de) => !inListe.has(de.toLowerCase()));
    expect(yetishmayapti).toEqual([]);
  });

  it('har so`zning o`zbekchasi bor', () => {
    expect(woerter.woerter.filter((w) => w.uz.trim() === '')).toEqual([]);
  });

  it('raqam yoki yakka harf bo`lsa tts yozilgan', () => {
    // TTS yakka harf va raqamni inglizcha o'qiydi — o'lchangan.
    const shubhali = woerter.woerter.filter(
      (w) => /\d/.test(w.de) || /^[A-ZÄÖÜ]$/.test(w.de.trim()),
    );
    expect(shubhali.filter((w) => !w.tts || w.tts.trim() === '')).toEqual([]);
  });

  it('so`z kaliti takrorlanmaydi', () => {
    const ids = woerter.woerter.map((w) => w.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('har bo`limda tartib 1 dan boradi', () => {
    for (const s of kurs.units[0].sections) {
      const orders = woerter.woerter
        .filter((w) => w.section === s.code)
        .map((w) => w.order)
        .sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, i) => i + 1));
    }
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/unit-inhalt.file.spec.ts`
Expected: FAIL — `ENOENT ... content/daf/a1/wortliste.json`

- [ ] **Step 3: Tiplarni yozing**

`server/src/daf/inhalt/unit-inhalt.types.ts`:

```ts
/**
 * Unitning matni — bitta unitning hamma yozma materiali.
 *
 * Har fayl bitta narsani saqlaydi va alohida tekshiriladi. Bitta katta
 * `u01.json` o'rniga beshta fayl: ular alohida yaratiladi, alohida
 * ko'rikdan o'tadi, va biri qayta yasalganda qolganlari tegilmaydi.
 */

/** Ekranda ko'rinadigan va aytiladigan matn ajratilgan qator. */
export interface Sprechbar {
  de: string;
  /**
   * ElevenLabs'ga yuboriladigan matn.
   *
   * Yakka harf va raqamni TTS INGLIZCHA o'qiydi (`0176` → «Zero…»),
   * shuning uchun ular uchun aytilishi qo'lda yoziladi:
   * `null eins sieben sechs`.
   */
  tts?: string;
  uz: string;
}

export interface Wort extends Sprechbar {
  /** Barqaror kalit: `u01-s1-hallo`. Seed shu bo'yicha yangilaydi. */
  sourceId: string;
  section: string;
  artikel?: string;
  plural?: string;
  /** `true` — mashqda so'raladi; `false` — faqat matnda uchraydi. */
  core: boolean;
  order: number;
}

export interface WoerterFile {
  unit: string;
  woerter: Wort[];
}
```

- [ ] **Step 4: So'zlarni tanlang va yozing**

1-unit «Hallo!» ning beshta bo'limi va ularning grammatikasi (`kurs.json` dan):

| Bo'lim | Mavzu | Grammatika |
| --- | --- | --- |
| `u01-s1` | Salom va xayr | ich/du olmoshlari va `sein` fe'li |
| `u01-s2` | Rasmiy salomlashish | `Sie` shakli va so'roq gap |
| `u01-s3` | Qayerdansan? | `kommen`/`wohnen` tuslanishi, `aus`/`in` |
| `u01-s4` | 0–20 sonlari | sonlar va telefon raqami |
| `u01-s5` | Alifbo | harflab aytish |

Tanlash qoidalari:

1. So'z **Goethe ro'yxatida** bo'lsin (`goethe-a1.json`). Bo'lmasa — `wortliste.json` da `grund` yozing.
2. Har bo'limga **aynan 10 ta** asosiy so'z (`core: true`). Bo'limga tegishli, lekin so'ralmaydigan so'zlarni `core: false` bilan qo'shsangiz bo'ladi.
3. **Tarjimani qaytadan yozmang.** DiB da 1 843 so'z tarjimasi bilan turibdi — mos kelganini o'sha yerdan oling. Qidirish uchun:

```bash
cd server && node -e '
const d = require("./content/daf/dib.json");
const q = process.argv[1].toLowerCase();
for (const s of d.sections) {
  for (const e of (s.lexemes || s.entries || [])) {
    if ((e.de || "").toLowerCase().includes(q)) {
      console.log(s.sourceId, "|", e.de, "|", e.uz || "(tarjimasiz)");
    }
  }
}
' hallo
```

DiB da 1-unit mavzusiga to'g'ridan-to'g'ri mos bo'limlar: `dib-voc-01-01`
(Begrüßungen, 13 so'z), `dib-voc-01-04` (Herkunft, 7), `dib-voc-01-05`
(Länder, 15), `dib-voc-01-07` (Zahlen, 42).

4. Tarjimasi topilmagan so'zni o'zingiz yozing — qisqa, bitta ma'no.
5. Ot bo'lsa `artikel` va `plural` majburiy.
6. Raqam yoki yakka harf bo'lsa `tts` majburiy.

`wortliste.json` shunday boshlanadi:

```json
{
  "level": "A1",
  "eintraege": [
    { "wort": "hallo", "artikel": null, "section": "u01-s1", "core": true },
    { "wort": "tschuess", "artikel": null, "section": "u01-s1", "core": true }
  ]
}
```

`u01/woerter.json` shunday boshlanadi (1-bo'limning namunasi — qolgan
to'rt bo'lim ham aynan shu shaklda yoziladi):

```json
{
  "unit": "u01",
  "woerter": [
    {
      "sourceId": "u01-s1-hallo",
      "section": "u01-s1",
      "de": "hallo",
      "uz": "salom",
      "core": true,
      "order": 1
    },
    {
      "sourceId": "u01-s1-guten-morgen",
      "section": "u01-s1",
      "de": "Guten Morgen",
      "uz": "xayrli tong",
      "core": true,
      "order": 2
    }
  ]
}
```

Sonlar uchun `tts` shunday yoziladi:

```json
{
  "sourceId": "u01-s4-null",
  "section": "u01-s4",
  "de": "0",
  "tts": "null",
  "uz": "nol",
  "core": true,
  "order": 1
}
```

Harflar uchun nemischa nomi yoziladi — `A` → `Ah`, `B` → `Beh`, `W` → `Weh`,
`Y` → `Ypsilon`, `Z` → `Zett`.

- [ ] **Step 5: Tekshiruv skriptini yozing**

`server/scripts/daf-inhalt-check.ts`:

```ts
/**
 * Unit matnini tekshiradi.
 *
 *   npm run daf:inhalt-check -- --unit 1
 *
 * Muammo topilsa 1 kod bilan chiqadi va ro'yxatni to'liq ko'rsatadi.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { validateWortliste } from '../src/daf/inhalt/wortliste.validate';
import type { WortlisteFile } from '../src/daf/inhalt/wortliste.types';
import type { WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';
import type { KursFile } from '../src/daf/kurs/kurs.types';
import type { GoetheFile } from '../src/daf/inhalt/goethe-parse';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const read = <T>(...p: string[]): T =>
  JSON.parse(readFileSync(join(A1, ...p), 'utf8')) as T;

function main(): void {
  const i = process.argv.indexOf('--unit');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --unit <raqam>');
    process.exit(1);
  }
  const code = `u${String(Number(process.argv[i + 1])).padStart(2, '0')}`;

  const problems = validateWortliste(
    read<WortlisteFile>('wortliste.json'),
    read<KursFile>('kurs.json'),
    read<GoetheFile>('goethe-a1.json').words,
  );

  const woerterPath = join(A1, code, 'woerter.json');
  if (!existsSync(woerterPath)) {
    problems.push(`${code}: woerter.json yo'q`);
  } else {
    const w = read<WoerterFile>(code, 'woerter.json');
    const core = w.woerter.filter((x) => x.core).length;
    if (core !== 50) problems.push(`${code}: ${core} ta asosiy so'z — 50 kerak`);
  }

  if (problems.length > 0) {
    console.error(`${problems.length} ta muammo:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log(`${code}: matn toza.`);
}

main();
```

`server/package.json` scripts ichiga:

```json
"daf:inhalt-check": "ts-node scripts/daf-inhalt-check.ts",
```

- [ ] **Step 6: Tekshiring**

Run: `cd server && npm run daf:inhalt-check -- --unit 1`
Expected: `u01: matn toza.`

Run: `cd server && npx jest src/daf/inhalt/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/content/daf/a1/wortliste.json server/content/daf/a1/u01/woerter.json \
        server/src/daf/inhalt/ server/scripts/daf-inhalt-check.ts server/package.json
git commit -m "1-unitning 50 so'zi tanlandi va tarjima qilindi"
```

- [ ] **Step 8: DARVOZA — CEO 50 so'zni ko'radi**

Bu yerda **to'xtang**. So'zlar tasdiqlanmaguncha gap, dialog va mashq
yasalmaydi: ular shu so'zlar ustiga quriladi va so'z o'zgarsa hammasi
qayta yasaladi.

Ko'rsatiladigan narsa: har bo'lim bo'yicha 10 so'z, tarjimasi bilan.

---

## Task 4: Grammatika va Redemittel

**Files:**
- Create: `server/content/daf/a1/u01/grammatik.json`
- Create: `server/content/daf/a1/u01/redemittel.json`
- Modify: `server/src/daf/inhalt/unit-inhalt.types.ts`
- Modify: `server/src/daf/inhalt/unit-inhalt.file.spec.ts`
- Modify: `server/scripts/daf-inhalt-check.ts`

**Interfaces:**
- Consumes: `Sprechbar`, `WoerterFile` (Task 3).
- Produces:
  - `interface Regel { section: string; titelDe: string; titelUz: string; erklaerungUz: string; beispiele: Sprechbar[] }`
  - `interface GrammatikFile { unit: string; regeln: Regel[] }`
  - `interface Phrase extends Sprechbar { section: string; funktion: string; funktionUz: string }`
  - `interface RedemittelFile { unit: string; phrasen: Phrase[] }`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/inhalt/unit-inhalt.file.spec.ts` ga qo'shing:

```ts
describe('1-unitning grammatikasi va iboralari', () => {
  const kurs = read<KursFile>('kurs.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');
  const grammatik = read<GrammatikFile>('u01', 'grammatik.json');
  const redemittel = read<RedemittelFile>('u01', 'redemittel.json');

  const sections = kurs.units[0].sections.map((s) => s.code);
  const bekannt = new Set(
    woerter.woerter.flatMap((w) => w.de.toLowerCase().split(/\s+/)),
  );

  it('har bo`limning qoidasi bor', () => {
    expect(grammatik.regeln.map((r) => r.section).sort()).toEqual([...sections].sort());
  });

  it('har qoidada kamida 4 misol bor', () => {
    const kam = grammatik.regeln.filter((r) => r.beispiele.length < 4);
    expect(kam.map((r) => r.section)).toEqual([]);
  });

  it('qoida izohi o`zbekcha va bo`sh emas', () => {
    expect(grammatik.regeln.filter((r) => r.erklaerungUz.trim().length < 20)).toEqual([]);
  });

  it('har bo`limda kamida 3 ta ibora bor', () => {
    for (const code of sections) {
      const n = redemittel.phrasen.filter((p) => p.section === code).length;
      expect(`${code}: ${n}`).toBe(`${code}: ${Math.max(n, 3)}`);
    }
  });

  it('ibora va misollarning har so`zi tanish', () => {
    // Yordamchi so'zlar ro'yxati: ular hamma bo'limda ishlatiladi va
    // lug'atga kirmaydi.
    const hilfs = new Set([
      'ich','du','sie','er','es','wir','ihr','bin','bist','ist','sind','seid',
      'und','oder','nicht','ja','nein','wie','wo','was','wer','woher','das',
      'der','die','ein','eine','mein','dein','sehr','auch','bitte','danke',
      'in','aus','aus.','?','!',
    ]);
    const unbekannt = new Set<string>();
    const check = (s: string): void => {
      for (const w of s.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/)) {
        if (w === '') continue;
        if (bekannt.has(w) || hilfs.has(w)) continue;
        unbekannt.add(w);
      }
    };
    grammatik.regeln.forEach((r) => r.beispiele.forEach((b) => check(b.de)));
    redemittel.phrasen.forEach((p) => check(p.de));
    expect([...unbekannt]).toEqual([]);
  });
});
```

Faylning boshiga importlarni qo'shing:

```ts
import type { GrammatikFile, RedemittelFile } from './unit-inhalt.types';
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/unit-inhalt.file.spec.ts`
Expected: FAIL — `ENOENT ... u01/grammatik.json`

- [ ] **Step 3: Tiplarni qo'shing**

`server/src/daf/inhalt/unit-inhalt.types.ts` oxiriga:

```ts
/** Bo'limning grammatika qoidasi — izoh o'zbekcha, misollar nemischa. */
export interface Regel {
  section: string;
  titelDe: string;
  titelUz: string;
  /**
   * Qoidaning o'zbekcha izohi.
   *
   * Nemischa atama (`Personalpronomen`) sarlavhada qoladi, izoh esa
   * o'zbekcha bo'ladi: boshlovchi qoidani ona tilida tushunadi, atamani
   * esa keyin taniydi.
   */
  erklaerungUz: string;
  beispiele: Sprechbar[];
}

export interface GrammatikFile {
  unit: string;
  regeln: Regel[];
}

/** Vaziyat → tayyor ibora. */
export interface Phrase extends Sprechbar {
  section: string;
  /** Nemischa funksiya nomi: `sich vorstellen`. */
  funktion: string;
  funktionUz: string;
}

export interface RedemittelFile {
  unit: string;
  phrasen: Phrase[];
}
```

- [ ] **Step 4: Grammatikani yozing**

`server/content/daf/a1/u01/grammatik.json` — beshta qoida, har biri
`kurs.json` dagi bo'limning grammatikasiga mos:

```json
{
  "unit": "u01",
  "regeln": [
    {
      "section": "u01-s1",
      "titelDe": "Personalpronomen ich/du, sein",
      "titelUz": "ich/du olmoshlari va sein fe'li",
      "erklaerungUz": "Nemischa gapda kim haqida gapirilayotgani olmosh bilan ko'rsatiladi. O'zim haqimda gapirsam ich, suhbatdoshimga murojaat qilsam du. sein fe'li ular bilan o'zgaradi: ich bin, du bist.",
      "beispiele": [
        { "de": "Ich bin Anna.", "uz": "Men Annaman." },
        { "de": "Du bist Timur.", "uz": "Sen Timursan." },
        { "de": "Ich bin hier.", "uz": "Men shu yerdaman." },
        { "de": "Bist du Nodira?", "uz": "Sen Nodirami?" }
      ]
    }
  ]
}
```

Qolgan to'rt qoida ham shu shaklda. Misollardagi har so'z `woerter.json`
da yoki testdagi yordamchi so'zlar ro'yxatida bo'lishi shart — aks holda
test yiqiladi.

- [ ] **Step 5: Redemittel yozing**

`server/content/daf/a1/u01/redemittel.json` — har bo'limga kamida 3 ibora:

```json
{
  "unit": "u01",
  "phrasen": [
    {
      "section": "u01-s1",
      "funktion": "begruessen",
      "funktionUz": "salomlashish",
      "de": "Hallo! Wie geht es dir?",
      "uz": "Salom! Ahvoling qanday?"
    },
    {
      "section": "u01-s1",
      "funktion": "sich verabschieden",
      "funktionUz": "xayrlashish",
      "de": "Tschuess! Bis morgen.",
      "uz": "Xayr! Ertagacha."
    }
  ]
}
```

- [ ] **Step 6: Tekshiruvni kengaytiring**

`server/scripts/daf-inhalt-check.ts` da `woerter.json` tekshiruvidan keyin:

```ts
  const grammatikPath = join(A1, code, 'grammatik.json');
  if (!existsSync(grammatikPath)) {
    problems.push(`${code}: grammatik.json yo'q`);
  } else {
    const g = read<GrammatikFile>(code, 'grammatik.json');
    const sections = read<KursFile>('kurs.json').units.find((u) => u.code === code);
    const want = sections?.sections.length ?? 0;
    if (g.regeln.length !== want) {
      problems.push(`${code}: ${g.regeln.length} qoida — ${want} kerak`);
    }
  }
```

Import qo'shing: `import type { GrammatikFile } from '../src/daf/inhalt/unit-inhalt.types';`

- [ ] **Step 7: Tasdiqlang va commit qiling**

Run: `cd server && npm run daf:inhalt-check -- --unit 1 && npx jest src/daf/inhalt/`
Expected: `u01: matn toza.` va testlar PASS.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/content/daf/a1/u01/ server/src/daf/inhalt/ server/scripts/daf-inhalt-check.ts
git commit -m "1-unitning grammatikasi va iboralari yozildi"
```

---

## Task 5: Dialoglar

**Files:**
- Create: `server/content/daf/a1/u01/dialoge.json`
- Modify: `server/src/daf/inhalt/unit-inhalt.types.ts`
- Modify: `server/src/daf/inhalt/unit-inhalt.file.spec.ts`

**Interfaces:**
- Consumes: `Sprechbar`, `WoerterFile`, `RedemittelFile`.
- Produces:
  - `interface DialogZeile extends Sprechbar { sprecher: string }`
  - `interface Dialog { id: string; section: string; titelDe: string; titelUz: string; zeilen: DialogZeile[] }`
  - `interface DialogeFile { unit: string; dialoge: Dialog[] }`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/inhalt/unit-inhalt.file.spec.ts` ga qo'shing:

```ts
describe('1-unitning dialoglari', () => {
  const kurs = read<KursFile>('kurs.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');
  const dialoge = read<DialogeFile>('u01', 'dialoge.json');

  const sections = new Set(kurs.units[0].sections.map((s) => s.code));

  it('kamida 6 ta dialog bor', () => {
    expect(dialoge.dialoge.length).toBeGreaterThanOrEqual(6);
  });

  it('har dialog mavjud bo`limga tegishli', () => {
    const notat = dialoge.dialoge.filter((d) => !sections.has(d.section));
    expect(notat.map((d) => d.id)).toEqual([]);
  });

  it('har dialogda 4 dan 8 gacha satr bor', () => {
    // To'rttadan kam bo'lsa suhbat emas, sakkiztadan ko'p bo'lsa A1
    // uchun uzun: o'quvchi boshini yo'qotadi.
    const notri = dialoge.dialoge.filter(
      (d) => d.zeilen.length < 4 || d.zeilen.length > 8,
    );
    expect(notri.map((d) => `${d.id}:${d.zeilen.length}`)).toEqual([]);
  });

  it('har dialogda kamida ikki gapiruvchi bor', () => {
    const yakka = dialoge.dialoge.filter(
      (d) => new Set(d.zeilen.map((z) => z.sprecher)).size < 2,
    );
    expect(yakka.map((d) => d.id)).toEqual([]);
  });

  it('dialog kaliti takrorlanmaydi', () => {
    const ids = dialoge.dialoge.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('har satrning o`zbekchasi bor', () => {
    const bosh = dialoge.dialoge.flatMap((d) =>
      d.zeilen.filter((z) => z.uz.trim() === '').map(() => d.id),
    );
    expect(bosh).toEqual([]);
  });

  it('raqamli satrda tts yozilgan', () => {
    // TTS raqamni inglizcha o'qiydi: `0176` → «Zero…». Aytilishi qo'lda
    // yoziladi, aks holda telefon raqami eshitilmaydi.
    const shubhali = dialoge.dialoge.flatMap((d) =>
      d.zeilen
        .filter((z) => /\d/.test(z.de) && (z.tts ?? '').trim() === '')
        .map((z) => `${d.id}: ${z.de}`),
    );
    expect(shubhali).toEqual([]);
  });

  it('dialoglarda notanish so`z yo`q', () => {
    const bekannt = new Set(
      woerter.woerter.flatMap((w) => w.de.toLowerCase().split(/\s+/)),
    );
    const hilfs = new Set([
      'ich','du','sie','er','es','wir','ihr','bin','bist','ist','sind','seid',
      'und','oder','nicht','ja','nein','wie','wo','was','wer','woher','das',
      'der','die','ein','eine','mein','dein','sehr','auch','bitte','danke',
      'in','aus','heisse','heisst','komme','kommst','wohne','wohnst','geht',
      'gut','dir','ihnen','mir','ist.','hier',
    ]);
    const unbekannt = new Set<string>();
    for (const d of dialoge.dialoge) {
      for (const z of d.zeilen) {
        for (const w of z.de.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/)) {
          if (w === '' || bekannt.has(w) || hilfs.has(w)) continue;
          unbekannt.add(w);
        }
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});
```

Import qo'shing: `import type { DialogeFile } from './unit-inhalt.types';`

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/unit-inhalt.file.spec.ts`
Expected: FAIL — `ENOENT ... u01/dialoge.json`

- [ ] **Step 3: Tiplarni qo'shing**

`server/src/daf/inhalt/unit-inhalt.types.ts` oxiriga:

```ts
/**
 * Dialog satri.
 *
 * Gapiruvchi ISM bilan yoziladi, «A»/«B» bilan emas: ovoz yasashda har
 * ismga bitta obraz biriktiriladi va shu obraz butun kursda o'zgarmaydi.
 */
export interface DialogZeile extends Sprechbar {
  sprecher: string;
}

export interface Dialog {
  /** Barqaror kalit: `u01-d1`. */
  id: string;
  section: string;
  titelDe: string;
  titelUz: string;
  zeilen: DialogZeile[];
}

export interface DialogeFile {
  unit: string;
  dialoge: Dialog[];
}
```

- [ ] **Step 4: Dialoglarni yozing**

`server/content/daf/a1/u01/dialoge.json` — har bo'limga kamida bitta,
jami 6 tadan kam bo'lmasin. Ismlar `~/Desktop/daf-kontent/studio/personas.json`
dagi obrazlardan olinadi (`Anna`, `Jonas`, `Sabine`, `Peter`, `Mia`, `Luca`,
`Doniyor`) — o'ylab topilgan yangi ism qo'shilmaydi, chunki ovoz o'sha
ro'yxatga bog'lanadi.

```json
{
  "unit": "u01",
  "dialoge": [
    {
      "id": "u01-d1",
      "section": "u01-s1",
      "titelDe": "Hallo!",
      "titelUz": "Salom!",
      "zeilen": [
        { "sprecher": "Anna", "de": "Hallo! Ich bin Anna.", "uz": "Salom! Men Annaman." },
        { "sprecher": "Jonas", "de": "Hallo Anna! Ich bin Jonas.", "uz": "Salom Anna! Men Jonasman." },
        { "sprecher": "Anna", "de": "Wie geht es dir?", "uz": "Ahvoling qanday?" },
        { "sprecher": "Jonas", "de": "Danke, gut. Und dir?", "uz": "Rahmat, yaxshi. Sen-chi?" }
      ]
    }
  ]
}
```

Telefon raqami yoki harf uchraydigan satrda `tts` majburiy:

```json
{
  "sprecher": "Sabine",
  "de": "Meine Nummer ist 0176 23 45 89.",
  "tts": "Meine Nummer ist null eins sieben sechs, dreiundzwanzig, fuenfundvierzig, neunundachtzig.",
  "uz": "Mening raqamim 0176 23 45 89."
}
```

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd server && npx jest src/daf/inhalt/ && npm run daf:inhalt-check -- --unit 1`
Expected: testlar PASS, `u01: matn toza.`

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/content/daf/a1/u01/dialoge.json server/src/daf/inhalt/
git commit -m "1-unitning dialoglari yozildi"
```

---

## Task 6: Gaplar

**Files:**
- Create: `server/scripts/daf-gen-u01-saetze.ts`
- Create: `server/content/daf/a1/u01/saetze.json`
- Modify: `server/src/daf/inhalt/unit-inhalt.types.ts`
- Modify: `server/src/daf/inhalt/unit-inhalt.file.spec.ts`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `buildSentencePrompt`, `parseSentences`, `materialWords`, `GenerateOpts` (`server/src/daf/sentence/sentence-generate.ts`); `OpenAiTranslateModel` (`server/src/daf/translate/translate-model.ts`); `WoerterFile`.
- Produces:
  - `interface Satz extends Sprechbar { section: string; wordCount: number; origin: 'GENERATED' }`
  - `interface SaetzeFile { unit: string; saetze: Satz[] }`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/inhalt/unit-inhalt.file.spec.ts` ga qo'shing:

```ts
describe('1-unitning gaplari', () => {
  const kurs = read<KursFile>('kurs.json');
  const woerter = read<WoerterFile>('u01', 'woerter.json');
  const saetze = read<SaetzeFile>('u01', 'saetze.json');

  const sections = new Set(kurs.units[0].sections.map((s) => s.code));

  it('kamida 50 gap bor', () => {
    expect(saetze.saetze.length).toBeGreaterThanOrEqual(50);
  });

  it('har bo`limda kamida 6 gap bor', () => {
    for (const code of sections) {
      const n = saetze.saetze.filter((s) => s.section === code).length;
      expect(n).toBeGreaterThanOrEqual(6);
    }
  });

  it('gaplar uch-yetti so`z oralig`ida', () => {
    const notri = saetze.saetze.filter((s) => s.wordCount < 3 || s.wordCount > 7);
    expect(notri.map((s) => s.de)).toEqual([]);
  });

  it('wordCount haqiqiy so`z soniga teng', () => {
    const notri = saetze.saetze.filter(
      (s) => s.wordCount !== s.de.replace(/[.,!?]/g, '').trim().split(/\s+/).length,
    );
    expect(notri.map((s) => s.de)).toEqual([]);
  });

  it('gap takrorlanmaydi', () => {
    const keys = saetze.saetze.map((s) => s.de.toLowerCase().replace(/[.,!?]/g, '').trim());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('har gapning o`zbekchasi bor', () => {
    expect(saetze.saetze.filter((s) => s.uz.trim() === '')).toEqual([]);
  });

  it('gaplarda notanish so`z yo`q', () => {
    const bekannt = new Set(
      woerter.woerter.flatMap((w) => w.de.toLowerCase().split(/\s+/)),
    );
    const hilfs = new Set([
      'ich','du','sie','er','es','wir','ihr','bin','bist','ist','sind','seid',
      'und','oder','nicht','ja','nein','wie','wo','was','wer','woher','das',
      'der','die','ein','eine','mein','dein','sehr','auch','bitte','danke',
      'in','aus','heisse','heisst','komme','kommst','wohne','wohnst','geht',
      'gut','dir','ihnen','mir','hier',
    ]);
    const unbekannt = new Set<string>();
    for (const s of saetze.saetze) {
      for (const w of s.de.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/)) {
        if (w === '' || bekannt.has(w) || hilfs.has(w)) continue;
        unbekannt.add(w);
      }
    }
    expect([...unbekannt]).toEqual([]);
  });
});
```

Import qo'shing: `import type { SaetzeFile } from './unit-inhalt.types';`

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/unit-inhalt.file.spec.ts`
Expected: FAIL — `ENOENT ... u01/saetze.json`

- [ ] **Step 3: Tipni qo'shing**

`server/src/daf/inhalt/unit-inhalt.types.ts` oxiriga:

```ts
/**
 * Yasalgan gap.
 *
 * Manbadan olinmaydi: A1 dagi tayyor gaplarning atigi 27 % i tanish
 * so'zlardan tuzilgan edi, ya'ni qolgani o'quvchiga notanish so'z
 * ko'rsatardi.
 */
export interface Satz extends Sprechbar {
  section: string;
  wordCount: number;
  origin: 'GENERATED';
}

export interface SaetzeFile {
  unit: string;
  saetze: Satz[];
}
```

- [ ] **Step 4: Generator skriptini yozing**

`server/scripts/daf-gen-u01-saetze.ts`:

```ts
/**
 * Bo'limning so'zlaridan gap yasaydi.
 *
 *   npm run daf:gen-saetze -- --unit 1
 *
 * PULLIK: har bo'lim uchun bitta model chaqiruvi. Mavjud gaplar QAYTA
 * yasalmaydi — fayl bor bo'lsa, yetishmagan bo'lim uchungina chaqiriladi.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { OpenAiTranslateModel } from '../src/daf/translate/translate-model';
import {
  buildSentencePrompt,
  parseSentences,
  materialWords,
} from '../src/daf/sentence/sentence-generate';
import type { KursFile } from '../src/daf/kurs/kurs.types';
import type {
  SaetzeFile,
  Satz,
  WoerterFile,
} from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const PRO_ABSCHNITT = 12;

function wordCount(de: string): number {
  return de.replace(/[.,!?]/g, '').trim().split(/\s+/).length;
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--unit');
  const code = `u${String(Number(process.argv[i + 1])).padStart(2, '0')}`;

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY yo'q");

  const kurs = JSON.parse(readFileSync(join(A1, 'kurs.json'), 'utf8')) as KursFile;
  const woerter = JSON.parse(
    readFileSync(join(A1, code, 'woerter.json'), 'utf8'),
  ) as WoerterFile;

  const out = join(A1, code, 'saetze.json');
  const file: SaetzeFile = existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as SaetzeFile)
    : { unit: code, saetze: [] };

  const model = new OpenAiTranslateModel(key);
  const unit = kurs.units.find((u) => u.code === code);
  if (!unit) throw new Error(`Xaritada yo'q unit: ${code}`);

  const oldingi: string[] = [];

  for (const s of unit.sections) {
    const bor = file.saetze.filter((x) => x.section === s.code).length;
    const words = woerter.woerter
      .filter((w) => w.section === s.code && w.core)
      .map((w) => w.de);

    if (bor >= PRO_ABSCHNITT) {
      oldingi.push(...words);
      console.log(`${s.code}: ${bor} gap bor — o'tkazildi`);
      continue;
    }

    // `buildSentencePrompt(words, examples, count, knownWords)` —
    // argumentlar POZITSION, obyekt emas.
    const prompt = buildSentencePrompt(
      materialWords(words),
      [],
      PRO_ABSCHNITT - bor,
      materialWords(oldingi),
    );

    const raw = await model.complete(prompt);
    const yangi = parseSentences(raw);

    for (const g of yangi) {
      const takror = file.saetze.some(
        (x) => x.de.toLowerCase().trim() === g.de.toLowerCase().trim(),
      );
      if (takror) continue;
      const satz: Satz = {
        section: s.code,
        de: g.de,
        uz: g.uz,
        wordCount: wordCount(g.de),
        origin: 'GENERATED',
      };
      if (satz.wordCount < 3 || satz.wordCount > 7) continue;
      file.saetze.push(satz);
    }

    console.log(`${s.code}: ${yangi.length} gap qaytdi`);
    oldingi.push(...words);
  }

  writeFileSync(out, `${JSON.stringify(file, null, 1)}\n`, 'utf8');
  console.log(`Jami: ${file.saetze.length} gap.`);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
```

`server/package.json` scripts ichiga:

```json
"daf:gen-saetze": "ts-node scripts/daf-gen-u01-saetze.ts",
```

- [ ] **Step 5: NARX — ruxsat so'rang**

Chaqirishdan **oldin** to'xtang va CEO dan ruxsat oling. Hisob:
5 bo'lim × 1 chaqiruv, har so'rov ≈ 900 belgi, javob ≈ 700 belgi.
`gpt-4o-mini` bilan bu **1 sentdan kam**. Shunday bo'lsa ham qoida
o'zgarmaydi: pul ketadigan chaqiruvdan oldin ruxsat so'raladi va summa
aytiladi.

- [ ] **Step 6: Yasang va ko'zdan kechiring**

Run: `cd server && npm run daf:gen-saetze -- --unit 1`
Expected: har bo'lim uchun bitta qator, oxirida `Jami: 5X gap.`

Chiqqan gaplarni **o'qib chiqing**. Nemischasi noto'g'ri yoki o'zbekchasi
g'aliz bo'lsa, `saetze.json` dan o'sha qatorni o'chirib skriptni qayta
yurgizing — u faqat yetishmaganini so'raydi.

- [ ] **Step 7: Tasdiqlang va commit qiling**

Run: `cd server && npx jest src/daf/inhalt/`
Expected: PASS.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/content/daf/a1/u01/saetze.json server/scripts/daf-gen-u01-saetze.ts \
        server/src/daf/inhalt/ server/package.json
git commit -m "1-unitning gaplari yasaldi"
```

---

## Task 7: Matnni bazaga tushirish

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260904120000_daf_unit_inhalt/migration.sql`
- Create: `server/src/daf/inhalt/inhalt-seed.service.ts`
- Test: `server/src/daf/inhalt/inhalt-seed.service.spec.ts`
- Create: `server/scripts/daf-inhalt-seed.ts`
- Modify: `server/src/daf/daf.module.ts`, `server/package.json`
- Modify: `server/src/daf/daf-schema.spec.ts`

**Interfaces:**
- Consumes: `WoerterFile`, `SaetzeFile`, `DialogeFile`, `GrammatikFile`, `RedemittelFile` (Tasks 3–6); `DafSection` (kurs sxemasi).
- Produces: `InhaltSeedService.seed(unit: string, files: InhaltFiles): Promise<InhaltSeedReport>`, `interface InhaltSeedReport { woerter: number; saetze: number; dialoge: number; zeilen: number; regeln: number; phrasen: number }`.

- [ ] **Step 1: Sxema testini yozing**

`server/src/daf/daf-schema.spec.ts` oxiriga:

```ts
describe('Unit matni jadvallari', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  it('so`z bo`limga bog`lanadi va aytilishini saqlaydi', () => {
    const m = schema.split('model DafLexeme {')[1].split('\n}')[0];
    expect(m).toMatch(/sectionId\s+Int\?/);
    expect(m).toMatch(/tts\s+String\?/);
    expect(m).toMatch(/artikel\s+String\?/);
    expect(m).toMatch(/plural\s+String\?/);
  });

  it('gap bo`limga bog`lanadi', () => {
    const m = schema.split('model DafSentence {')[1].split('\n}')[0];
    expect(m).toMatch(/sectionId\s+Int\?/);
    expect(m).toMatch(/tts\s+String\?/);
  });

  it('dialog va uning satrlari bor', () => {
    expect(schema).toMatch(/model DafDialog \{/);
    expect(schema).toMatch(/model DafDialogLine \{/);
    const d = schema.split('model DafDialog {')[1].split('\n}')[0];
    expect(d).toMatch(/code\s+String\s+@unique/);
  });

  it('ibora jadvali bor', () => {
    expect(schema).toMatch(/model DafPhrase \{/);
    const p = schema.split('model DafPhrase {')[1].split('\n}')[0];
    expect(p).toMatch(/code\s+String\s+@unique/);
  });

  it('grammatika qoidasi bo`limga bog`lanadi va misollari bor', () => {
    const g = schema.split('model DafGrammar {')[1].split('\n}')[0];
    expect(g).toMatch(/sectionId\s+Int\?/);
    expect(g).toMatch(/erklaerungUz\s+String\?/);
    expect(schema).toMatch(/model DafGrammarBeispiel \{/);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: FAIL — `model DafDialog` topilmaydi.

- [ ] **Step 3: Sxemani o'zgartiring**

`DafLexeme` ga qo'shing:

```prisma
  /// Qaysi mavzuli bo'limga tegishli. Eski DiB so'zlarida `null`.
  sectionId Int?
  /// Ovoz yasovchiga yuboriladigan matn. Yakka harf va raqamni TTS
  /// inglizcha o'qiydi, shuning uchun ular uchun qo'lda yoziladi.
  tts       String?
  artikel   String?
  plural    String?
  section   DafSection? @relation(fields: [sectionId], references: [id])
```

`DafSentence` ga qo'shing:

```prisma
  sectionId Int?
  tts       String?
  section   DafSection? @relation(fields: [sectionId], references: [id])
```

`DafGrammar` ga qo'shing:

```prisma
  sectionId    Int?
  /// Qoidaning o'zbekcha izohi — boshlovchi qoidani ona tilida tushunadi.
  erklaerungUz String?
  section      DafSection?          @relation(fields: [sectionId], references: [id])
  beispiele    DafGrammarBeispiel[]
```

Yangi modellar:

```prisma
/// Grammatika qoidasining misoli.
model DafGrammarBeispiel {
  id        Int      @id @default(autoincrement())
  grammarId Int
  order     Int
  de        String
  tts       String?
  uz        String
  createdAt DateTime @default(now())

  grammar DafGrammar @relation(fields: [grammarId], references: [id])

  @@unique([grammarId, order])
  @@index([grammarId])
}

/// Bo'limning dialogi — eshitish va o'qish materiali.
model DafDialog {
  id        Int      @id @default(autoincrement())
  /// Barqaror kalit: `u01-d1`.
  code      String   @unique
  unitId    Int
  sectionId Int
  titelDe   String
  titelUz   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  unit    DafUnit         @relation(fields: [unitId], references: [id])
  section DafSection      @relation(fields: [sectionId], references: [id])
  zeilen  DafDialogLine[]

  @@index([sectionId])
}

/// Dialogning bitta satri.
///
/// Gapiruvchi ISM bilan saqlanadi: ovoz yasashda har ismga bitta obraz
/// biriktiriladi va u butun kursda o'zgarmaydi.
model DafDialogLine {
  id       Int     @id @default(autoincrement())
  dialogId Int
  order    Int
  sprecher String
  de       String
  tts      String?
  uz       String
  audioKey String?

  dialog DafDialog @relation(fields: [dialogId], references: [id])

  @@unique([dialogId, order])
  @@index([dialogId])
}

/// Vaziyat → tayyor ibora (Redemittel).
model DafPhrase {
  id          Int      @id @default(autoincrement())
  /// Barqaror kalit: `u01-s1-begruessen-1`.
  code        String   @unique
  unitId      Int
  sectionId   Int
  funktion    String
  funktionUz  String
  de          String
  tts         String?
  uz          String
  audioKey    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  unit    DafUnit    @relation(fields: [unitId], references: [id])
  section DafSection @relation(fields: [sectionId], references: [id])

  @@index([sectionId])
}
```

`DafUnit` ga `dialoge DafDialog[]` va `phrasen DafPhrase[]`, `DafSection` ga
`lexemes DafLexeme[]`, `sentences DafSentence[]`, `grammar DafGrammar[]`,
`dialoge DafDialog[]`, `phrasen DafPhrase[]` munosabatlarini qo'shing.

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/daf-schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Migratsiyani yozing va qo'llang**

`migrate dev` bu repo'da ishlamaydi:

```bash
cd server
mkdir -p prisma/migrations/20260904120000_daf_unit_inhalt
git show HEAD:server/prisma/schema.prisma > /tmp/old-inhalt.prisma
npx prisma migrate diff \
  --from-schema /tmp/old-inhalt.prisma \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/20260904120000_daf_unit_inhalt/migration.sql
```

Chiqqan SQL'ni **o'qib chiqing**: unda faqat `CREATE TABLE`, `ALTER TABLE …
ADD COLUMN`, `CREATE INDEX` va `ADD CONSTRAINT` bo'lishi kerak. Biror
`DROP` yoki `DELETE` ko'rinsa **to'xtang** va sababini aniqlang — bu
migratsiya productionda ishlaydigan bazaga tushadi.

```bash
npx prisma db execute --file prisma/migrations/20260904120000_daf_unit_inhalt/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260904120000_daf_unit_inhalt
npx prisma generate
```

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 6: Seed testini yozing**

`server/src/daf/inhalt/inhalt-seed.service.spec.ts`:

```ts
import { InhaltSeedService } from './inhalt-seed.service';
import type { InhaltFiles } from './inhalt-seed.service';

function files(): InhaltFiles {
  return {
    woerter: {
      unit: 'u01',
      woerter: [
        { sourceId: 'u01-s1-hallo', section: 'u01-s1', de: 'hallo', uz: 'salom', core: true, order: 1 },
      ],
    },
    saetze: {
      unit: 'u01',
      saetze: [
        { section: 'u01-s1', de: 'Ich bin Anna.', uz: 'Men Annaman.', wordCount: 3, origin: 'GENERATED' },
      ],
    },
    dialoge: {
      unit: 'u01',
      dialoge: [
        {
          id: 'u01-d1',
          section: 'u01-s1',
          titelDe: 'Hallo!',
          titelUz: 'Salom!',
          zeilen: [
            { sprecher: 'Anna', de: 'Hallo!', uz: 'Salom!' },
            { sprecher: 'Jonas', de: 'Hallo Anna!', uz: 'Salom Anna!' },
          ],
        },
      ],
    },
    grammatik: {
      unit: 'u01',
      regeln: [
        {
          section: 'u01-s1',
          titelDe: 'sein',
          titelUz: 'sein fe`li',
          erklaerungUz: 'sein fe`li shaxsga qarab o`zgaradi: ich bin, du bist.',
          beispiele: [{ de: 'Ich bin Anna.', uz: 'Men Annaman.' }],
        },
      ],
    },
    redemittel: {
      unit: 'u01',
      phrasen: [
        { section: 'u01-s1', funktion: 'begruessen', funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!' },
      ],
    },
  };
}

function fakePrisma() {
  const rows = { lexeme: new Map(), sentence: new Map(), dialog: new Map(), line: new Map(), grammar: new Map(), beispiel: new Map(), phrase: new Map() };
  let seq = 0;
  const upsert = (store: Map<string, { id: number }>, keyOf: (a: any) => string) =>
    jest.fn(async (args: any) => {
      const k = keyOf(args);
      if (!store.has(k)) store.set(k, { id: ++seq });
      return store.get(k);
    });

  return {
    rows,
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', unitId: 1 }]),
    },
    dafUnit: { findFirst: jest.fn(async () => ({ id: 1, code: 'u01' })) },
    dafLexeme: { upsert: upsert(rows.lexeme, (a) => a.where.sourceId) },
    dafSentence: { upsert: upsert(rows.sentence, (a) => `${a.where.unitId_order?.unitId}:${a.where.unitId_order?.order}`) },
    dafDialog: { upsert: upsert(rows.dialog, (a) => a.where.code) },
    dafDialogLine: { upsert: upsert(rows.line, (a) => `${a.where.dialogId_order.dialogId}:${a.where.dialogId_order.order}`) },
    dafGrammar: { upsert: upsert(rows.grammar, (a) => a.where.sourceId) },
    dafGrammarBeispiel: { upsert: upsert(rows.beispiel, (a) => `${a.where.grammarId_order.grammarId}:${a.where.grammarId_order.order}`) },
    dafPhrase: { upsert: upsert(rows.phrase, (a) => a.where.code) },
  };
}

describe('InhaltSeedService', () => {
  it('hamma turdagi materialni yozadi', async () => {
    const prisma = fakePrisma();
    const r = await new InhaltSeedService(prisma as any).seed('u01', files());
    expect(r).toEqual({ woerter: 1, saetze: 1, dialoge: 1, zeilen: 2, regeln: 1, phrasen: 1 });
  });

  it('so`zni bo`limga bog`laydi', async () => {
    const prisma = fakePrisma();
    await new InhaltSeedService(prisma as any).seed('u01', files());
    const call = prisma.dafLexeme.upsert.mock.calls[0][0] as any;
    expect(call.create.sectionId).toBe(7);
  });

  it('xaritada yo`q bo`lim kaliti bo`lsa rad etadi', async () => {
    const prisma = fakePrisma();
    const f = files();
    f.woerter.woerter[0].section = 'u01-s9';
    await expect(new InhaltSeedService(prisma as any).seed('u01', f)).rejects.toThrow('u01-s9');
  });

  it('qayta yuritilganda takrorlamaydi', async () => {
    const prisma = fakePrisma();
    const service = new InhaltSeedService(prisma as any);
    await service.seed('u01', files());
    await service.seed('u01', files());
    expect(prisma.rows.lexeme.size).toBe(1);
    expect(prisma.rows.line.size).toBe(2);
  });
});
```

- [ ] **Step 7: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/inhalt-seed.service.spec.ts`
Expected: FAIL — `Cannot find module './inhalt-seed.service'`

- [ ] **Step 8: Seed servisini yozing**

`server/src/daf/inhalt/inhalt-seed.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DialogeFile,
  GrammatikFile,
  RedemittelFile,
  SaetzeFile,
  WoerterFile,
} from './unit-inhalt.types';

export interface InhaltFiles {
  woerter: WoerterFile;
  saetze: SaetzeFile;
  dialoge: DialogeFile;
  grammatik: GrammatikFile;
  redemittel: RedemittelFile;
}

export interface InhaltSeedReport {
  woerter: number;
  saetze: number;
  dialoge: number;
  zeilen: number;
  regeln: number;
  phrasen: number;
}

/**
 * Unitning matnini bazaga yozadi. Idempotent: barqaror kalitlar bo'yicha
 * yangilaydi, takrorlamaydi.
 *
 * Bo'lim kalitlari YOZISHDAN OLDIN tekshiriladi. Yarim yozilgan holat
 * eng yomon natija: matnning bir qismi bazada, qolgani yo'q, va qaysi
 * qismi yetib borgani faqat qo'lda aniqlanadi.
 */
@Injectable()
export class InhaltSeedService {
  private readonly logger = new Logger(InhaltSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(unitCode: string, files: InhaltFiles): Promise<InhaltSeedReport> {
    const unit = await this.prisma.dafUnit.findFirst({
      where: { code: unitCode },
      select: { id: true },
    });
    if (!unit) throw new Error(`Bazada yo'q unit: ${unitCode}`);

    const rows = await this.prisma.dafSection.findMany({
      where: { unitId: unit.id },
      select: { id: true, code: true },
    });
    const sectionId = new Map(rows.map((r) => [r.code, r.id]));

    this.assertSectionsKnown(files, sectionId);

    let woerter = 0;
    for (const w of files.woerter.woerter) {
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(w.section) ?? null,
        de: w.de,
        en: '',
        uz: w.uz,
        tts: w.tts ?? null,
        artikel: w.artikel ?? null,
        plural: w.plural ?? null,
        order: w.order,
      };
      await this.prisma.dafLexeme.upsert({
        where: { sourceId: w.sourceId },
        create: { sourceId: w.sourceId, ...data },
        update: data,
      });
      woerter += 1;
    }

    let saetze = 0;
    for (const [i, s] of files.saetze.saetze.entries()) {
      const order = i + 1;
      const data = {
        sectionId: sectionId.get(s.section) ?? null,
        de: s.de,
        uz: s.uz,
        tts: s.tts ?? null,
        wordCount: s.wordCount,
        origin: s.origin,
      };
      await this.prisma.dafSentence.upsert({
        where: { unitId_order: { unitId: unit.id, order } },
        create: { unitId: unit.id, order, ...data },
        update: data,
      });
      saetze += 1;
    }

    let dialoge = 0;
    let zeilen = 0;
    for (const d of files.dialoge.dialoge) {
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(d.section) as number,
        titelDe: d.titelDe,
        titelUz: d.titelUz,
      };
      const row = await this.prisma.dafDialog.upsert({
        where: { code: d.id },
        create: { code: d.id, ...data },
        update: data,
      });
      dialoge += 1;

      for (const [i, z] of d.zeilen.entries()) {
        const order = i + 1;
        const zData = {
          sprecher: z.sprecher,
          de: z.de,
          tts: z.tts ?? null,
          uz: z.uz,
        };
        await this.prisma.dafDialogLine.upsert({
          where: { dialogId_order: { dialogId: row.id, order } },
          create: { dialogId: row.id, order, ...zData },
          update: zData,
        });
        zeilen += 1;
      }
    }

    let regeln = 0;
    for (const r of files.grammatik.regeln) {
      const sourceId = `${unitCode}-${r.section}-regel`;
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(r.section) ?? null,
        titleDe: r.titelDe,
        titleUz: r.titelUz,
        erklaerungUz: r.erklaerungUz,
      };
      const row = await this.prisma.dafGrammar.upsert({
        where: { sourceId },
        create: { sourceId, ...data },
        update: data,
      });
      regeln += 1;

      for (const [i, b] of r.beispiele.entries()) {
        const order = i + 1;
        const bData = { de: b.de, tts: b.tts ?? null, uz: b.uz };
        await this.prisma.dafGrammarBeispiel.upsert({
          where: { grammarId_order: { grammarId: row.id, order } },
          create: { grammarId: row.id, order, ...bData },
          update: bData,
        });
      }
    }

    let phrasen = 0;
    for (const [i, p] of files.redemittel.phrasen.entries()) {
      const code = `${p.section}-${p.funktion}-${i + 1}`;
      const data = {
        unitId: unit.id,
        sectionId: sectionId.get(p.section) as number,
        funktion: p.funktion,
        funktionUz: p.funktionUz,
        de: p.de,
        tts: p.tts ?? null,
        uz: p.uz,
      };
      await this.prisma.dafPhrase.upsert({
        where: { code },
        create: { code, ...data },
        update: data,
      });
      phrasen += 1;
    }

    const report = { woerter, saetze, dialoge, zeilen, regeln, phrasen };
    this.logger.log(`${unitCode} matni: ${JSON.stringify(report)}`);
    return report;
  }

  /** Noma'lum bo'lim kaliti bo'lsa, BIRORTA yozuvdan oldin to'xtaydi. */
  private assertSectionsKnown(
    files: InhaltFiles,
    sectionId: Map<string, number>,
  ): void {
    const used = new Set<string>([
      ...files.woerter.woerter.map((w) => w.section),
      ...files.saetze.saetze.map((s) => s.section),
      ...files.dialoge.dialoge.map((d) => d.section),
      ...files.grammatik.regeln.map((r) => r.section),
      ...files.redemittel.phrasen.map((p) => p.section),
    ]);

    const noma = [...used].filter((c) => !sectionId.has(c));
    if (noma.length > 0) {
      throw new Error(
        `Bazada yo'q bo'lim kaliti: ${noma.join(', ')} — xarita seed qilinganmi?`,
      );
    }
  }
}
```

Tekshirilgan: `DafSentence` da `@@unique([unitId, order])`, `DafGrammar` da
`sourceId @unique`, `DafGrammar.titleDe`/`titleUz` allaqachon bor — yangi
cheklov qo'shish shart emas.

- [ ] **Step 9: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/inhalt/inhalt-seed.service.spec.ts`
Expected: PASS — 4 ta test.

- [ ] **Step 10: Skript va modul**

`server/scripts/daf-inhalt-seed.ts` — `--unit` argumentini oladi, beshta
faylni o'qiydi, `daf-a1-seed.ts` dagi kabi `PrismaPg` adapteri bilan
`PrismaClient` quradi, `InhaltSeedService.seed` ni chaqiradi va hisobotni
JSON bo'lib chiqaradi. `package.json` ga:

```json
"daf:inhalt-seed": "ts-node scripts/daf-inhalt-seed.ts",
```

`server/src/daf/daf.module.ts` dagi `providers` ga `InhaltSeedService`.

- [ ] **Step 11: Dev bazada yuguring**

Run: `cd server && npm run daf:inhalt-seed -- --unit 1`
Expected:

```json
{ "woerter": 50, "saetze": 5X, "dialoge": 6, "zeilen": 3X, "regeln": 5, "phrasen": 1X }
```

Ikkinchi marta yuriting — raqamlar o'zgarmasin.

- [ ] **Step 12: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/prisma/ server/src/daf/ server/scripts/daf-inhalt-seed.ts server/package.json
git commit -m "1-unitning matni bazaga tushdi"
```

---

## Reja tugagach

1-unit **to'liq matn** bilan bazada turadi: 50 so'z, ~60 gap, 6 dialog,
5 qoida va iboralar. Hali hech kim ko'rmaydi — savol quruvchi va ekran
keyingi rejalarda, rasm va ovoz esa undan keyin.

**Keyingi rejalar:**
1. **Dvigatel** — dars quruvchi, 12 ovozsiz format, javob tekshirish, Leitner.
2. **Ekran** — `/portal/lernen` 12 unitlik yo'lga qayta quriladi, seans o'ynaladigan bo'ladi.
3. **Media** — 1-unitning rasmi va ovozi (CEO ruxsati bilan, ≈ $0.72).
