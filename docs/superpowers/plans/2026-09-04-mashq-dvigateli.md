# Mashq dvigateli — savol quruvchi va javob tekshiruvchi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi darsni ochganda tizim unga 12 ta savol quradi, javobini serverda tekshiradi va xato qilingan so'zni qaytarish jadvaliga qo'yadi.

**Architecture:** Savollar bazada saqlanmaydi — har so'rovda unitning materialidan quriladi. Format quruvchilari sof funksiya: material kiradi, savol va to'g'ri javob chiqadi. Javob tekshirish savolni QAYTA QURMAYDI — mijoz qaysi material bo'yicha javob berganini aytadi, server o'sha materialni bazadan o'qib solishtiradi. Qaytarish Leitner qutisi bilan `DafLexemeState` da yuritiladi.

**Tech Stack:** NestJS, Prisma 7 (PostgreSQL/Neon), jest + ts-jest, class-validator.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-03-a1-kurs-design.md`. Ziddiyat chiqsa dizayn ustun.
- **To'g'ri javob mijozga YUBORILMAYDI.** Tekshiruv faqat serverda.
- **`studentId` faqat tokendan olinadi** (`@CurrentUser('studentId')`), DTO'da bo'lmaydi.
- Bu reja **8 ta ovozsiz format** quradi. Rasm va ovoz talab qiladiganlari, hamda materiali yupqa bo'lganlari — bu rejada yo'q (pastda ro'yxati bor).
- Ekran **bu rejada yo'q**. Natija HTTP orqali sinaladi.
- O'zbekchani erkin yozdirish yo'q. Yozish faqat nemischa, va unda `ß/ss`, `ä/ae`, katta-kichik harf, tinish belgisi kechiriladi.
- Bir seansda: bitta format 3 martadan ko'p emas; ketma-ket ikki savol bir formatda emas; kamida 5 xil format; bir so'z bir marta (qaytarish bundan mustasno va u boshqa formatda keladi).
- Barcha yozuvlar lotin alifbosidagi o'zbekcha. Kirill yoki arab harflari ishlatilmaydi.
- Ish `feat/daf-a1-kontent` shoxida, `.worktrees/daf-a1-kontent` worktree'sida. `git reset --hard` ishlatilmaydi.
- **Har test yugurishidan oldin `cd server && npx prisma generate`** — `node_modules` asosiy repo bilan umumiy va mijoz tez-tez eskiradi.
- Har commit oldidan `npm test` va `npm run typecheck` o'tishi shart.

---

## Bu rejada QURILADIGAN formatlar

| Kod | O'quvchi ko'radi | Kutiladi | Material |
| --- | --- | --- | --- |
| `WORT_UZ` | nemischa so'z | 4 o'zbekchadan biri | so'z |
| `UZ_WORT` | o'zbekcha ma'no | 4 nemischadan biri | so'z |
| `PAAR` | 4 juft aralash | juftlash | so'z |
| `ARTIKEL` | ___ Name | der / die / das | artiklli ot |
| `LUECKE` | Ich ___ Anna. | to'ldirish (yozish) | gap |
| `SATZ_BAUEN` | o'zbekcha gap + so'z banki | gap tuzish | gap |
| `SATZ_UEBERSETZEN` | nemischa gap | 4 o'zbekchadan biri | gap |
| `REAKTION` | vaziyat | 4 iboradan biri | Redemittel |

**Qurilmaydi va sababi:** `BILD_WORT` (rasm hali yo'q), `AUDIO_WORT` / `WORT_TIPPEN` / `HOEREN_WAHL` / `HOEREN_TABELLE` (ovoz hali yo'q), `DIALOG_LUECKE` va `ZUORDNEN` (bo'limga 1–2 dialog va 3–4 ibora — chalg'ituvchi yetmaydi), `WAHL` (grammatika qoidasi izoh va misol sifatida yozilgan, ikki tanlovli variant sifatida emas — buning uchun material shakli o'zgarishi kerak).

O'lchangan: 1-unitning har bo'limi shu 8 formatdan kamida 8 tasini ko'taradi, `u01-s4` va `u01-s5` dan tashqari — ularda artiklli ot yo'q, ya'ni `ARTIKEL` qurilmaydi va 7 ta format qoladi. Bu dizayndagi «kamida 8» chegarasidan past; 6.2-bandidagi bo'shliqni to'ldirish qoidasi shuni qoplaydi.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/daf/uebung/antwort.ts` | Javobni solishtirish: normallashtirish va qabul qilish |
| `server/src/daf/uebung/antwort.spec.ts` | Solishtirish testlari |
| `server/src/daf/uebung/frage.types.ts` | `Frage`, `PublicFrage`, `FrageFormat`, `Material` tiplari |
| `server/src/daf/uebung/wort-fragen.ts` | `WORT_UZ`, `UZ_WORT`, `PAAR`, `ARTIKEL` quruvchilari |
| `server/src/daf/uebung/wort-fragen.spec.ts` | Testlari |
| `server/src/daf/uebung/satz-fragen.ts` | `LUECKE`, `SATZ_BAUEN`, `SATZ_UEBERSETZEN`, `REAKTION` quruvchilari |
| `server/src/daf/uebung/satz-fragen.spec.ts` | Testlari |
| `server/src/daf/uebung/seans.ts` | Seans tarkibi: aralashtirish qoidalari va qaytarish o'rinlari |
| `server/src/daf/uebung/seans.spec.ts` | Testlari |
| `server/src/daf/uebung/leitner.ts` | Qaytarish jadvali |
| `server/src/daf/uebung/leitner.spec.ts` | Testlari |
| `server/src/daf/uebung/uebung.service.ts` | Bazadan material o'qiydi, seans quradi, javobni tekshiradi va yozadi |
| `server/src/daf/uebung/uebung.service.spec.ts` | Servis testlari |
| `server/src/daf/dto/uebung.dto.ts` | `CheckAntwortDto` |
| `server/src/daf/daf-portal.controller.ts` | Ikki yangi yo'l |
| `server/src/common/auth/branch-route-policy.ts` | Yangi yo'llarni toifalash |

---

## Task 1: Javobni solishtirish

**Files:**
- Create: `server/src/daf/uebung/antwort.ts`
- Test: `server/src/daf/uebung/antwort.spec.ts`

**Interfaces:**
- Consumes: hech narsa.
- Produces:
  - `normalisieren(s: string): string`
  - `istRichtig(gegeben: string, richtig: string, akzeptiert?: string[]): boolean`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/antwort.spec.ts`:

```ts
import { istRichtig, normalisieren } from './antwort';

describe('normalisieren', () => {
  it('katta-kichik harfni tenglashtiradi', () => {
    expect(normalisieren('Hallo')).toBe(normalisieren('hallo'));
  });

  it('ß va ss ni tenglashtiradi', () => {
    expect(normalisieren('heißen')).toBe(normalisieren('heissen'));
  });

  it('umlautning yozma shaklini tenglashtiradi', () => {
    expect(normalisieren('tschüss')).toBe(normalisieren('tschuess'));
    expect(normalisieren('Käse')).toBe(normalisieren('Kaese'));
  });

  it('tinish belgisi va ortiqcha bo`shliqni tashlaydi', () => {
    expect(normalisieren('  Ich bin Anna. ')).toBe(normalisieren('ich bin anna'));
  });

  it('so`z orasidagi ikki bo`shliqni bittaga keltiradi', () => {
    expect(normalisieren('Ich  bin')).toBe(normalisieren('Ich bin'));
  });
});

describe('istRichtig', () => {
  it('aynan mos javobni qabul qiladi', () => {
    expect(istRichtig('hallo', 'hallo')).toBe(true);
  });

  it('imlo farqini kechiradi', () => {
    expect(istRichtig('Tschuess!', 'tschüss')).toBe(true);
  });

  it('boshqa so`zni rad etadi', () => {
    expect(istRichtig('danke', 'hallo')).toBe(false);
  });

  it('qabul qilinadigan variantlardan birini ham to`g`ri deb biladi', () => {
    // Bir necha to'g'ri javob bo'lishi mumkin: «Men O'zbekistondanman»
    // va «O'zbekistondanman» ikkalasi ham to'g'ri.
    expect(istRichtig('ich bin Anna', 'Ich heiße Anna', ['Ich bin Anna'])).toBe(true);
  });

  it('bo`sh javobni rad etadi', () => {
    expect(istRichtig('', 'hallo')).toBe(false);
    expect(istRichtig('   ', 'hallo')).toBe(false);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/antwort.spec.ts`
Expected: FAIL — `Cannot find module './antwort'`

- [ ] **Step 3: Yozing**

`server/src/daf/uebung/antwort.ts`:

```ts
/**
 * Javobni solishtirish.
 *
 * NEGA KECHIRIMLI. Boshlovchi `tschüss` ni `tschuess` deb yozadi, chunki
 * klaviaturasida umlaut yo'q; `heißen` ni `heissen` deb yozadi, chunki
 * ß ni qayerdan olishni bilmaydi. Bularning ikkalasi ham NEMISCHADA
 * to'g'ri yozuv hisoblanadi. Ularni «xato» deb belgilash o'quvchini
 * imlo klaviaturasi bilan jazolash bo'lardi, tilni bilishi bilan emas.
 *
 * NEGA O'ZBEKCHA YOZDIRILMAYDI. Bu funksiya faqat NEMISCHA javob uchun.
 * O'zbekcha tarjimaning o'nlab to'g'ri shakli bor va to'g'ri javobni
 * «xato» deb belgilash o'quvchini eng tez qochiradigan narsa.
 */

const UMLAUT: Array<[RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

export function normalisieren(s: string): string {
  let out = s.toLowerCase().trim();
  for (const [from, to] of UMLAUT) out = out.replace(from, to);
  out = out.replace(/[.,!?;:]/g, '');
  out = out.replace(/\s+/g, ' ');
  return out.trim();
}

/**
 * `akzeptiert` — materialda yozilgan QO'SHIMCHA to'g'ri javoblar.
 * Bo'sh javob har doim xato: «hech narsa yozmaslik» to'g'ri bo'la olmaydi.
 */
export function istRichtig(
  gegeben: string,
  richtig: string,
  akzeptiert: string[] = [],
): boolean {
  const g = normalisieren(gegeben);
  if (g === '') return false;
  return [richtig, ...akzeptiert].some((r) => normalisieren(r) === g);
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/antwort.spec.ts`
Expected: PASS — 11 ta test.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/uebung/
git commit -m "Javob solishtiruvchi: imlo farqi kechiriladi, bo'sh javob emas"
```

---

## Task 2: So'z formatlari

**Files:**
- Create: `server/src/daf/uebung/frage.types.ts`
- Create: `server/src/daf/uebung/wort-fragen.ts`
- Test: `server/src/daf/uebung/wort-fragen.spec.ts`

**Interfaces:**
- Consumes: hech narsa.
- Produces:
  - `type FrageFormat = 'WORT_UZ' | 'UZ_WORT' | 'PAAR' | 'ARTIKEL' | 'LUECKE' | 'SATZ_BAUEN' | 'SATZ_UEBERSETZEN' | 'REAKTION'`
  - `interface MaterialWort { id: number; de: string; uz: string; artikel: string | null; anzeige: string | null; sectionCode: string }`
  - `interface Frage { format: FrageFormat; itemType: 'WORT' | 'SATZ' | 'PHRASE'; itemId: number; prompt: string; hilfe: string | null; options: string[]; richtig: string; akzeptiert: string[] }`
  - `interface PublicFrage { index: number; format: FrageFormat; itemType: Frage['itemType']; itemId: number; prompt: string; hilfe: string | null; options: string[] }`
  - `wortUz(ziel: MaterialWort, andere: MaterialWort[], rnd: () => number): Frage | null`
  - `uzWort(ziel: MaterialWort, andere: MaterialWort[], rnd: () => number): Frage | null`
  - `paar(woerter: MaterialWort[], rnd: () => number): Frage | null`
  - `artikel(ziel: MaterialWort): Frage | null`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/wort-fragen.spec.ts`:

```ts
import { artikel, paar, uzWort, wortUz } from './wort-fragen';
import type { MaterialWort } from './frage.types';

function w(id: number, de: string, uz: string, art: string | null = null): MaterialWort {
  return { id, de, uz, artikel: art, anzeige: null, sectionCode: 'u01-s1' };
}

/** Aralashtirishni bashorat qilib bo'ladigan qilish uchun. */
const rnd = (): number => 0;

const ZIEL = w(1, 'hallo', 'salom');
const ANDERE = [w(2, 'danke', 'rahmat'), w(3, 'ich', 'men'), w(4, 'du', 'sen')];

describe('wortUz', () => {
  it('nemischani so`raydi va to`rt o`zbekcha variant beradi', () => {
    const f = wortUz(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('WORT_UZ');
    expect(f.prompt).toBe('hallo');
    expect(f.options).toHaveLength(4);
    expect(f.options).toContain('salom');
    expect(f.richtig).toBe('salom');
  });

  it('chalg`ituvchi yetmasa savol qurmaydi', () => {
    expect(wortUz(ZIEL, ANDERE.slice(0, 1), rnd)).toBeNull();
  });

  it('to`g`ri javobni chalg`ituvchi sifatida takrorlamaydi', () => {
    const f = wortUz(ZIEL, [...ANDERE, w(9, 'hallo', 'salom')], rnd)!;
    expect(f.options.filter((o) => o === 'salom')).toHaveLength(1);
  });

  it('otni artikli bilan ko`rsatadi', () => {
    const f = wortUz(w(5, 'Name', 'ism', 'der'), ANDERE, rnd)!;
    expect(f.prompt).toBe('der Name');
  });
});

describe('uzWort', () => {
  it('o`zbekchani so`raydi va to`rt nemischa variant beradi', () => {
    const f = uzWort(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('UZ_WORT');
    expect(f.prompt).toBe('salom');
    expect(f.options).toContain('hallo');
    expect(f.richtig).toBe('hallo');
  });
});

describe('paar', () => {
  it('to`rt juftni beradi va javob juftlash bo`ladi', () => {
    const f = paar([ZIEL, ...ANDERE], rnd)!;
    expect(f.format).toBe('PAAR');
    expect(f.options).toHaveLength(8);
    // To'g'ri javob — juftliklar ro'yxati, tartibi qat'iy.
    expect(f.richtig).toBe('hallo=salom|danke=rahmat|ich=men|du=sen');
  });

  it('to`rttadan kam so`z bo`lsa savol qurmaydi', () => {
    expect(paar([ZIEL, ANDERE[0]], rnd)).toBeNull();
  });
});

describe('artikel', () => {
  it('artiklni so`raydi', () => {
    const f = artikel(w(5, 'Name', 'ism', 'der'))!;
    expect(f.format).toBe('ARTIKEL');
    expect(f.prompt).toBe('___ Name');
    expect(f.options).toEqual(['der', 'die', 'das']);
    expect(f.richtig).toBe('der');
  });

  it('artiklsiz so`zga savol qurmaydi', () => {
    expect(artikel(ZIEL)).toBeNull();
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/wort-fragen.spec.ts`
Expected: FAIL — `Cannot find module './wort-fragen'`

- [ ] **Step 3: Tiplarni yozing**

`server/src/daf/uebung/frage.types.ts`:

```ts
export type FrageFormat =
  | 'WORT_UZ'
  | 'UZ_WORT'
  | 'PAAR'
  | 'ARTIKEL'
  | 'LUECKE'
  | 'SATZ_BAUEN'
  | 'SATZ_UEBERSETZEN'
  | 'REAKTION';

export interface MaterialWort {
  id: number;
  de: string;
  uz: string;
  artikel: string | null;
  /** Raqam yoki belgi — so'zning yonida ko'rsatiladi, so'ralmaydi. */
  anzeige: string | null;
  sectionCode: string;
}

export interface MaterialSatz {
  id: number;
  de: string;
  uz: string;
  sectionCode: string;
}

export interface MaterialPhrase {
  id: number;
  funktionUz: string;
  de: string;
  uz: string;
  sectionCode: string;
}

/**
 * Serverdagi to'liq savol — TO'G'RI JAVOB BILAN.
 *
 * `itemType` va `itemId` — savolning o'zligi. Javob kelganda server
 * savolni QAYTA QURMAYDI (dizayn D7): u shu ikki maydon bo'yicha
 * materialni bazadan o'qiydi va to'g'ri javobni qaytadan hisoblaydi.
 * Sabab: qaytariladigan so'zlar har o'quvchida boshqacha, ya'ni savolni
 * qayta qurish uchun kerak bo'ladigan urug' beqaror.
 */
export interface Frage {
  format: FrageFormat;
  itemType: 'WORT' | 'SATZ' | 'PHRASE';
  itemId: number;
  prompt: string;
  /** Qo'shimcha ko'rsatma yoki ko'rgazma (raqam, o'zbekcha tarjima). */
  hilfe: string | null;
  options: string[];
  richtig: string;
  akzeptiert: string[];
}

/** Mijozga ketadigan savol — to'g'ri javobsiz. */
export interface PublicFrage {
  index: number;
  format: FrageFormat;
  itemType: Frage['itemType'];
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
}

export function toPublic(f: Frage, index: number): PublicFrage {
  return {
    index,
    format: f.format,
    itemType: f.itemType,
    itemId: f.itemId,
    prompt: f.prompt,
    hilfe: f.hilfe,
    options: f.options,
  };
}
```

- [ ] **Step 4: So'z quruvchilarini yozing**

`server/src/daf/uebung/wort-fragen.ts`:

```ts
import type { Frage, MaterialWort } from './frage.types';

/**
 * So'zdan quriladigan savollar.
 *
 * Har quruvchi material yetmasa `null` qaytaradi — istisno tashlamaydi.
 * Sabab: yetmaslik XATO emas, u bo'limning tabiiy holati (sonlar
 * bo'limida artiklli ot yo'q). Seans quruvchisi `null` ni ko'rib
 * keyingi formatga o'tadi.
 */

/** Ot artikli bilan ko'rsatiladi: o'quvchi jinsni so'z bilan birga o'rganadi. */
function anzeigen(w: MaterialWort): string {
  return w.artikel ? `${w.artikel} ${w.de}` : w.de;
}

/**
 * Chalg'ituvchilar SHU bo'limning materialidan olinadi.
 *
 * Butun lug'atdan olinsa savol bilimni emas, taxminni tekshiradi:
 * «Guten Morgen» yonida «der Kühlschrank» tursa to'g'ri javob mavzusiga
 * qarab ko'rinib qoladi.
 */
function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function ablenker(
  ziel: MaterialWort,
  andere: MaterialWort[],
  feld: (w: MaterialWort) => string,
  rnd: () => number,
): string[] | null {
  const richtig = feld(ziel);
  const kandidaten = andere
    .filter((w) => w.id !== ziel.id && feld(w) !== richtig)
    .map(feld);
  const einmalig = [...new Set(kandidaten)];
  if (einmalig.length < 3) return null;
  return mischen(einmalig, rnd).slice(0, 3);
}

export function wortUz(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): Frage | null {
  const falsch = ablenker(ziel, andere, (w) => w.uz, rnd);
  if (!falsch) return null;
  return {
    format: 'WORT_UZ',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: anzeigen(ziel),
    hilfe: ziel.anzeige,
    options: mischen([ziel.uz, ...falsch], rnd),
    richtig: ziel.uz,
    akzeptiert: [],
  };
}

export function uzWort(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): Frage | null {
  const falsch = ablenker(ziel, andere, (w) => anzeigen(w), rnd);
  if (!falsch) return null;
  return {
    format: 'UZ_WORT',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: ziel.uz,
    hilfe: null,
    options: mischen([anzeigen(ziel), ...falsch], rnd),
    richtig: anzeigen(ziel),
    akzeptiert: [ziel.de],
  };
}

/**
 * To'rt juftni juftlash.
 *
 * To'g'ri javob bitta satr sifatida saqlanadi (`de=uz|de=uz|…`), chunki
 * javob solishtirish butun tuzilma bo'yicha emas, matn bo'yicha ishlaydi
 * va mijoz ham shu shaklda qaytaradi.
 */
export function paar(woerter: MaterialWort[], rnd: () => number): Frage | null {
  if (woerter.length < 4) return null;
  const vier = mischen(woerter, rnd).slice(0, 4);
  const links = vier.map((w) => w.de);
  const rechts = mischen(vier.map((w) => w.uz), rnd);
  return {
    format: 'PAAR',
    itemType: 'WORT',
    itemId: vier[0].id,
    prompt: 'Juftlang',
    hilfe: null,
    options: [...links, ...rechts],
    richtig: vier.map((w) => `${w.de}=${w.uz}`).join('|'),
    akzeptiert: [],
  };
}

export function artikel(ziel: MaterialWort): Frage | null {
  if (!ziel.artikel) return null;
  return {
    format: 'ARTIKEL',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: `___ ${ziel.de}`,
    hilfe: ziel.uz,
    options: ['der', 'die', 'das'],
    richtig: ziel.artikel,
    akzeptiert: [],
  };
}
```

- [ ] **Step 5: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/wort-fragen.spec.ts`
Expected: PASS — 9 ta test.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/uebung/
git commit -m "So'z formatlari: tanish, ma'no, juftlash va artikl"
```

---

## Task 3: Gap va ibora formatlari

**Files:**
- Create: `server/src/daf/uebung/satz-fragen.ts`
- Test: `server/src/daf/uebung/satz-fragen.spec.ts`

**Interfaces:**
- Consumes: `Frage`, `MaterialSatz`, `MaterialPhrase`, `MaterialWort` (Task 2).
- Produces:
  - `luecke(satz: MaterialSatz, kernwoerter: MaterialWort[], rnd: () => number): Frage | null`
  - `satzBauen(satz: MaterialSatz, rnd: () => number): Frage | null`
  - `satzUebersetzen(ziel: MaterialSatz, andere: MaterialSatz[], rnd: () => number): Frage | null`
  - `reaktion(ziel: MaterialPhrase, andere: MaterialPhrase[], rnd: () => number): Frage | null`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/satz-fragen.spec.ts`:

```ts
import { luecke, reaktion, satzBauen, satzUebersetzen } from './satz-fragen';
import type { MaterialPhrase, MaterialSatz, MaterialWort } from './frage.types';

function s(id: number, de: string, uz: string): MaterialSatz {
  return { id, de, uz, sectionCode: 'u01-s1' };
}
function w(id: number, de: string, uz: string): MaterialWort {
  return { id, de, uz, artikel: null, anzeige: null, sectionCode: 'u01-s1' };
}
function p(id: number, funktionUz: string, de: string, uz: string): MaterialPhrase {
  return { id, funktionUz, de, uz, sectionCode: 'u01-s1' };
}

const rnd = (): number => 0;

describe('luecke', () => {
  const SATZ = s(1, 'Ich bin Anna.', 'Men Annaman.');

  it('bo`limning so`zini gapdan olib tashlaydi', () => {
    const f = luecke(SATZ, [w(2, 'bin', 'bo`lmoq')], rnd)!;
    expect(f.format).toBe('LUECKE');
    expect(f.prompt).toBe('Ich ___ Anna.');
    expect(f.richtig).toBe('bin');
    expect(f.hilfe).toBe('Men Annaman.');
  });

  it('gapda bo`limning so`zi bo`lmasa savol qurmaydi', () => {
    expect(luecke(SATZ, [w(2, 'danke', 'rahmat')], rnd)).toBeNull();
  });

  it('variant bermaydi — javob yoziladi', () => {
    const f = luecke(SATZ, [w(2, 'bin', 'bo`lmoq')], rnd)!;
    expect(f.options).toEqual([]);
  });
});

describe('satzBauen', () => {
  it('o`zbekchani so`raydi va so`z bankini beradi', () => {
    const f = satzBauen(s(1, 'Ich bin Anna.', 'Men Annaman.'), rnd)!;
    expect(f.format).toBe('SATZ_BAUEN');
    expect(f.prompt).toBe('Men Annaman.');
    expect(f.options.sort()).toEqual(['Anna', 'Ich', 'bin'].sort());
    expect(f.richtig).toBe('Ich bin Anna.');
  });

  it('ikki so`zli gapga savol qurmaydi', () => {
    // Ikki so'zdan gap tuzish tanlov emas: tartib bittagina.
    expect(satzBauen(s(1, 'Guten Tag.', 'Xayrli kun.'), rnd)).toBeNull();
  });
});

describe('satzUebersetzen', () => {
  const ZIEL = s(1, 'Ich bin Anna.', 'Men Annaman.');
  const ANDERE = [
    s(2, 'Du bist Timur.', 'Sen Timursan.'),
    s(3, 'Ich bin hier.', 'Men bu yerdaman.'),
    s(4, 'Wie geht es dir?', 'Ahvoling qanday?'),
  ];

  it('nemischani so`raydi va to`rt o`zbekcha variant beradi', () => {
    const f = satzUebersetzen(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('SATZ_UEBERSETZEN');
    expect(f.prompt).toBe('Ich bin Anna.');
    expect(f.options).toHaveLength(4);
    expect(f.richtig).toBe('Men Annaman.');
  });

  it('chalg`ituvchi yetmasa savol qurmaydi', () => {
    expect(satzUebersetzen(ZIEL, ANDERE.slice(0, 1), rnd)).toBeNull();
  });
});

describe('reaktion', () => {
  const ZIEL = p(1, 'salomlashish', 'Guten Morgen!', 'Xayrli tong!');
  const ANDERE = [
    p(2, 'xayrlashish', 'Auf Wiedersehen!', 'Xayrli qoling!'),
    p(3, 'minnatdorchilik', 'Danke!', 'Rahmat!'),
    p(4, 'tanishtirish', 'Ich bin Anna.', 'Men Annaman.'),
  ];

  it('vaziyatni so`raydi va to`rt ibora beradi', () => {
    const f = reaktion(ZIEL, ANDERE, rnd)!;
    expect(f.format).toBe('REAKTION');
    expect(f.prompt).toBe('salomlashish');
    expect(f.options).toContain('Guten Morgen!');
    expect(f.richtig).toBe('Guten Morgen!');
  });

  it('bir xil vazifadagi iborani chalg`ituvchi qilmaydi', () => {
    // Ikki salomlashish iborasi orasida «to'g'ri» javob yo'q.
    const f = reaktion(ZIEL, [p(9, 'salomlashish', 'Hallo!', 'Salom!'), ...ANDERE], rnd)!;
    expect(f.options).not.toContain('Hallo!');
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/satz-fragen.spec.ts`
Expected: FAIL — `Cannot find module './satz-fragen'`

- [ ] **Step 3: Yozing**

`server/src/daf/uebung/satz-fragen.ts`:

```ts
import type {
  Frage,
  MaterialPhrase,
  MaterialSatz,
  MaterialWort,
} from './frage.types';

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Tinish belgisisiz so'zlar — gapni bo'laklashda ishlatiladi. */
function woerterVon(de: string): string[] {
  return de.replace(/[.,!?]/g, '').trim().split(/\s+/);
}

/**
 * Gapdan bo'limning bitta so'zini olib tashlaydi.
 *
 * Variant BERILMAYDI — javob yoziladi. Sabab: to'rt variantdan tanlash
 * grammatik shaklni emas, ko'rish xotirasini tekshiradi; `bin` va `bist`
 * orasidagi farqni bilish uchun uni YOZISH kerak.
 */
export function luecke(
  satz: MaterialSatz,
  kernwoerter: MaterialWort[],
  rnd: () => number,
): Frage | null {
  const woerter = woerterVon(satz.de);
  const treffer = kernwoerter.filter((k) =>
    woerter.some((w) => w.toLowerCase() === k.de.toLowerCase()),
  );
  if (treffer.length === 0) return null;

  const ziel = mischen(treffer, rnd)[0];
  const prompt = satz.de.replace(
    new RegExp(`\\b${ziel.de}\\b`, 'i'),
    '___',
  );
  if (prompt === satz.de) return null;

  return {
    format: 'LUECKE',
    itemType: 'SATZ',
    itemId: satz.id,
    prompt,
    hilfe: satz.uz,
    options: [],
    richtig: ziel.de,
    akzeptiert: [],
  };
}

/** Uch so'zdan kam gapda tartib tanlovi yo'q — savol ma'nosiz. */
export function satzBauen(satz: MaterialSatz, rnd: () => number): Frage | null {
  const woerter = woerterVon(satz.de);
  if (woerter.length < 3) return null;
  return {
    format: 'SATZ_BAUEN',
    itemType: 'SATZ',
    itemId: satz.id,
    prompt: satz.uz,
    hilfe: null,
    options: mischen(woerter, rnd),
    richtig: satz.de,
    akzeptiert: [],
  };
}

export function satzUebersetzen(
  ziel: MaterialSatz,
  andere: MaterialSatz[],
  rnd: () => number,
): Frage | null {
  const falsch = [
    ...new Set(
      andere.filter((s) => s.id !== ziel.id && s.uz !== ziel.uz).map((s) => s.uz),
    ),
  ];
  if (falsch.length < 3) return null;
  return {
    format: 'SATZ_UEBERSETZEN',
    itemType: 'SATZ',
    itemId: ziel.id,
    prompt: ziel.de,
    hilfe: null,
    options: mischen([ziel.uz, ...mischen(falsch, rnd).slice(0, 3)], rnd),
    richtig: ziel.uz,
    akzeptiert: [],
  };
}

/**
 * Vaziyat → mos ibora.
 *
 * Bir xil VAZIFADAGI ibora chalg'ituvchi bo'la olmaydi: ikki
 * salomlashish iborasining ikkalasi ham to'g'ri, ya'ni savolning bitta
 * javobi qolmaydi.
 */
export function reaktion(
  ziel: MaterialPhrase,
  andere: MaterialPhrase[],
  rnd: () => number,
): Frage | null {
  const falsch = [
    ...new Set(
      andere
        .filter((p) => p.id !== ziel.id && p.funktionUz !== ziel.funktionUz)
        .map((p) => p.de),
    ),
  ];
  if (falsch.length < 3) return null;
  return {
    format: 'REAKTION',
    itemType: 'PHRASE',
    itemId: ziel.id,
    prompt: ziel.funktionUz,
    hilfe: null,
    options: mischen([ziel.de, ...mischen(falsch, rnd).slice(0, 3)], rnd),
    richtig: ziel.de,
    akzeptiert: [],
  };
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/satz-fragen.spec.ts`
Expected: PASS — 9 ta test.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/uebung/
git commit -m "Gap va ibora formatlari: bo'sh joy, gap tuzish, tarjima, vaziyat"
```

---

## Task 4: Seans tarkibi

**Files:**
- Create: `server/src/daf/uebung/seans.ts`
- Test: `server/src/daf/uebung/seans.spec.ts`

**Interfaces:**
- Consumes: `Frage`, `FrageFormat` (Task 2).
- Produces:
  - `interface SeansPlan { fragen: Frage[]; verwendeteFormate: FrageFormat[] }`
  - `baueSeans(kandidaten: Frage[], anzahl: number, rnd: () => number, pflicht?: Frage[]): SeansPlan`
  - `FORMAT_MAX_PRO_SEANS = 3`, `MIN_FORMATE = 5`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/seans.spec.ts`:

```ts
import { baueSeans, FORMAT_MAX_PRO_SEANS } from './seans';
import type { Frage, FrageFormat } from './frage.types';

function f(format: FrageFormat, itemId: number): Frage {
  return {
    format,
    itemType: 'WORT',
    itemId,
    prompt: `p${itemId}`,
    hilfe: null,
    options: [],
    richtig: 'x',
    akzeptiert: [],
  };
}

/** Har formatdan yetarlicha nomzod. */
function kandidaten(): Frage[] {
  const formate: FrageFormat[] = [
    'WORT_UZ', 'UZ_WORT', 'PAAR', 'ARTIKEL',
    'LUECKE', 'SATZ_BAUEN', 'SATZ_UEBERSETZEN', 'REAKTION',
  ];
  return formate.flatMap((fmt, i) =>
    Array.from({ length: 5 }, (_, j) => f(fmt, i * 10 + j)),
  );
}

const rnd = (): number => 0.5;

describe('baueSeans', () => {
  it('so`ralgan sondagi savolni beradi', () => {
    expect(baueSeans(kandidaten(), 12, rnd).fragen).toHaveLength(12);
  });

  it('bitta formatni uch martadan ko`p ishlatmaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    const sanoq = new Map<string, number>();
    for (const q of fragen) sanoq.set(q.format, (sanoq.get(q.format) ?? 0) + 1);
    for (const n of sanoq.values()) expect(n).toBeLessThanOrEqual(FORMAT_MAX_PRO_SEANS);
  });

  it('ketma-ket ikki savolni bir formatda qo`ymaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    for (let i = 1; i < fragen.length; i += 1) {
      expect(fragen[i].format).not.toBe(fragen[i - 1].format);
    }
  });

  it('kamida besh xil format ishlatadi', () => {
    const { verwendeteFormate } = baueSeans(kandidaten(), 12, rnd);
    expect(verwendeteFormate.length).toBeGreaterThanOrEqual(5);
  });

  it('bir materialni bir seansda ikki marta so`ramaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    const kalitlar = fragen.map((q) => `${q.itemType}:${q.itemId}`);
    expect(new Set(kalitlar).size).toBe(kalitlar.length);
  });

  it('nomzod yetmasa borini beradi, takrorlamaydi', () => {
    const kam = [f('WORT_UZ', 1), f('UZ_WORT', 2), f('PAAR', 3)];
    const { fragen } = baueSeans(kam, 12, rnd);
    expect(fragen).toHaveLength(3);
    expect(new Set(fragen.map((q) => q.itemId)).size).toBe(3);
  });

  it('bitta formatdan iborat nomzodda uchtadan ko`p bermaydi', () => {
    const bir = Array.from({ length: 10 }, (_, i) => f('WORT_UZ', i));
    expect(baueSeans(bir, 12, rnd).fragen).toHaveLength(1);
  });

  it('qaytarish savollarini seansga albatta qo`shadi', () => {
    // Muddati kelgan so'zlar oddiy nomzodlardan OLDIN joylashadi:
    // ular seansning sababi, qolgani to'ldiruvchi.
    const wiederholung = [f('UZ_WORT', 900), f('WORT_UZ', 901)];
    const { fragen } = baueSeans(kandidaten(), 12, rnd, wiederholung);
    const ids = fragen.map((q) => q.itemId);
    expect(ids).toContain(900);
    expect(ids).toContain(901);
  });

  it('qaytarish savollari ham qoidalarga bo`ysunadi', () => {
    const wiederholung = [f('WORT_UZ', 900), f('WORT_UZ', 901)];
    const { fragen } = baueSeans(kandidaten(), 12, rnd, wiederholung);
    for (let i = 1; i < fragen.length; i += 1) {
      expect(fragen[i].format).not.toBe(fragen[i - 1].format);
    }
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/seans.spec.ts`
Expected: FAIL — `Cannot find module './seans'`

- [ ] **Step 3: Yozing**

`server/src/daf/uebung/seans.ts`:

```ts
import type { Frage, FrageFormat } from './frage.types';

export const FORMAT_MAX_PRO_SEANS = 3;
export const MIN_FORMATE = 5;

export interface SeansPlan {
  fragen: Frage[];
  verwendeteFormate: FrageFormat[];
}

/**
 * Seans tarkibi.
 *
 * NEGA QOIDA KERAK. Tasodifiy tanlov bir seansda o'n ikki marta
 * `WORT_UZ` berishi mumkin — mexanik jihatdan to'g'ri, lekin o'quvchi
 * uchun bu bitta mashqni o'n ikki marta bajarish. Zerikish aynan
 * shundan tug'iladi, materialning kamligidan emas.
 *
 * Beshta qoida: format seansda uch martadan ko'p emas; ketma-ket ikki
 * savol bir formatda emas; kamida besh xil format; bir material bir
 * marta; nomzod yetmasa TAKRORLAMAYDI — kamroq savol beradi.
 *
 * Oxirgisi ataylab: o'n ikkitaga yetkazish uchun savolni takrorlash
 * o'quvchiga «material tugadi» deb aytishning eng yomon usuli.
 */
export function baueSeans(
  kandidaten: Frage[],
  anzahl: number,
  rnd: () => number,
  pflicht: Frage[] = [],
): SeansPlan {
  const uebrig = [...kandidaten];
  // Tasodifiy tartib: har seans boshqacha boshlansin.
  for (let i = uebrig.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [uebrig[i], uebrig[j]] = [uebrig[j], uebrig[i]];
  }

  // Muddati kelgan so'zlar birinchi navbatda: ular seansning sababi.
  // Ular ham beshta qoidaga bo'ysunadi — «majburiy» degani «qoidasiz»
  // degani emas, aks holda ketma-ket ikki bir xil format chiqib qolardi.
  uebrig.unshift(...pflicht);

  const fragen: Frage[] = [];
  const proFormat = new Map<FrageFormat, number>();
  const benutzteItems = new Set<string>();

  while (fragen.length < anzahl) {
    const letzte = fragen[fragen.length - 1]?.format;
    const index = uebrig.findIndex((q) => {
      if (q.format === letzte) return false;
      if ((proFormat.get(q.format) ?? 0) >= FORMAT_MAX_PRO_SEANS) return false;
      return !benutzteItems.has(`${q.itemType}:${q.itemId}`);
    });
    if (index === -1) break;

    const [gewaehlt] = uebrig.splice(index, 1);
    fragen.push(gewaehlt);
    proFormat.set(gewaehlt.format, (proFormat.get(gewaehlt.format) ?? 0) + 1);
    benutzteItems.add(`${gewaehlt.itemType}:${gewaehlt.itemId}`);
  }

  return { fragen, verwendeteFormate: [...proFormat.keys()] };
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/seans.spec.ts`
Expected: PASS — 9 ta test.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/uebung/
git commit -m "Seans tarkibi: format takrorlanmaydi, material bir marta"
```

---

## Task 5: Qaytarish jadvali

**Files:**
- Create: `server/src/daf/uebung/leitner.ts`
- Test: `server/src/daf/uebung/leitner.spec.ts`

**Interfaces:**
- Consumes: hech narsa.
- Produces:
  - `interface LeitnerZustand { strength: number; dueAt: Date }`
  - `naechsterZustand(strength: number, richtig: boolean, jetzt: Date): LeitnerZustand`
  - `INTERVALLE = [0, 1, 3, 7, 16, 35]`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/leitner.spec.ts`:

```ts
import { INTERVALLE, naechsterZustand } from './leitner';

const JETZT = new Date('2026-09-04T10:00:00.000Z');
const TAG = 24 * 60 * 60 * 1000;

describe('naechsterZustand', () => {
  it('to`g`ri javob quti darajasini bittaga ko`taradi', () => {
    expect(naechsterZustand(0, true, JETZT).strength).toBe(1);
    expect(naechsterZustand(3, true, JETZT).strength).toBe(4);
  });

  it('eng yuqori qutidan oshmaydi', () => {
    const max = INTERVALLE.length - 1;
    expect(naechsterZustand(max, true, JETZT).strength).toBe(max);
  });

  it('to`g`ri javobda muddat yangi darajaga qarab qo`yiladi', () => {
    const z = naechsterZustand(1, true, JETZT);
    expect(z.dueAt.getTime()).toBe(JETZT.getTime() + INTERVALLE[2] * TAG);
  });

  it('xato javob darajani NOLGA tushiradi', () => {
    expect(naechsterZustand(5, false, JETZT).strength).toBe(0);
  });

  it('xato javobdan keyin so`z ertaga qaytadi', () => {
    const z = naechsterZustand(5, false, JETZT);
    expect(z.dueAt.getTime()).toBe(JETZT.getTime() + TAG);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/leitner.spec.ts`
Expected: FAIL — `Cannot find module './leitner'`

- [ ] **Step 3: Yozing**

`server/src/daf/uebung/leitner.ts`:

```ts
/**
 * Qaytarish jadvali — Leitner qutisi.
 *
 * NEGA XATO JAVOB NOLGA TUSHIRADI. Yumshoq tushirish (`strength - 1`)
 * sinovda so'zni juda tez qaytardi va o'quvchi uni «bilaman» deb
 * o'ylab qolardi. Noldan boshlash ochiqroq: bilmagan so'z qaytadan
 * o'rganiladi.
 *
 * Kun hisobi UTC da yuritiladi. Toshkent vaqtiga o'tkazish keyingi
 * rejaning ishi — hozir muddat faqat «necha kundan keyin» degan
 * ma'noda ishlatiladi.
 */
export const INTERVALLE = [0, 1, 3, 7, 16, 35];

const TAG_MS = 24 * 60 * 60 * 1000;

export interface LeitnerZustand {
  strength: number;
  dueAt: Date;
}

export function naechsterZustand(
  strength: number,
  richtig: boolean,
  jetzt: Date,
): LeitnerZustand {
  if (!richtig) {
    return { strength: 0, dueAt: new Date(jetzt.getTime() + TAG_MS) };
  }
  const neu = Math.min(INTERVALLE.length - 1, strength + 1);
  return { strength: neu, dueAt: new Date(jetzt.getTime() + INTERVALLE[neu] * TAG_MS) };
}
```

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/leitner.spec.ts`
Expected: PASS — 5 ta test.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/uebung/
git commit -m "Leitner qutisi: xato javob darajani nolga tushiradi"
```

---

## Task 6: Servis — material, seans, tekshiruv

**Files:**
- Create: `server/src/daf/uebung/uebung.service.ts`
- Test: `server/src/daf/uebung/uebung.service.spec.ts`
- Modify: `server/src/daf/daf.module.ts`
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260905120000_daf_lexeme_state_format/migration.sql`

**Interfaces:**
- Consumes: hamma oldingi task.
- Produces:
  - `UebungService.seans(lessonId: number, studentId: number): Promise<PublicFrage[]>`
  - `UebungService.pruefen(input: { itemType: 'WORT' | 'SATZ' | 'PHRASE'; itemId: number; format: FrageFormat; given: string; durationMs?: number }, ctx: { studentId: number; companyId: number }): Promise<{ isCorrect: boolean; richtig: string }>`

- [ ] **Step 0: `lastFormat` ustunini qo'shing**

Dizayn qaytarish savoli BOSHQA formatda kelishini talab qiladi, lekin
`DafLexemeState` da so'z oxirgi marta qaysi formatda so'ralgani
yozilmaydi — na u yerda, na `DafAttempt` da. Ustun qo'shiladi:

```prisma
  /// So'z oxirgi marta qaysi formatda so'ralgan.
  ///
  /// Qaytarish savoli SHUNDAN boshqa formatda quriladi: bir so'zni har
  /// safar bir xil tarzda so'rash uni tanish qiladi, bilinadigan emas —
  /// o'quvchi savolning shaklini yodlab qo'yadi, so'zni emas.
  lastFormat String?
```

Migratsiyani `migrate diff` bilan chiqaring va qo'llang — bu repo'da
`migrate dev` ishlamaydi:

```bash
cd server
mkdir -p prisma/migrations/20260905120000_daf_lexeme_state_format
git show HEAD:server/prisma/schema.prisma > /tmp/old-state.prisma
npx prisma migrate diff --from-schema /tmp/old-state.prisma   --to-schema prisma/schema.prisma --script   > prisma/migrations/20260905120000_daf_lexeme_state_format/migration.sql
```

Chiqqan SQL bitta `ALTER TABLE ... ADD COLUMN` bo'lishi kerak. Boshqa
narsa ko'rinsa **to'xtang** — bu migratsiya productionda ishlaydi.

```bash
npx prisma db execute --file prisma/migrations/20260905120000_daf_lexeme_state_format/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260905120000_daf_lexeme_state_format
npx prisma generate
```

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/uebung.service.spec.ts`:

```ts
import { UebungService } from './uebung.service';

/**
 * Bazaning eng kichik soxta nusxasi. Prisma o'rniga: bizni servisning
 * mantig'i qiziqtiradi, Prisma emas.
 */
function fakePrisma() {
  const lexeme = [
    { id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, sectionId: 7 },
    { id: 2, de: 'danke', uz: 'rahmat', artikel: null, anzeige: null, core: true, sectionId: 7 },
    { id: 3, de: 'ich', uz: 'men', artikel: null, anzeige: null, core: true, sectionId: 7 },
    { id: 4, de: 'du', uz: 'sen', artikel: null, anzeige: null, core: true, sectionId: 7 },
    { id: 5, de: 'Name', uz: 'ism', artikel: 'der', anzeige: null, core: true, sectionId: 7 },
    { id: 6, de: 'Guten Abend', uz: 'xayrli kech', artikel: null, anzeige: null, core: false, sectionId: 7 },
  ];
  const sentence = [
    { id: 11, de: 'Ich bin Anna.', uz: 'Men Annaman.', sectionId: 7 },
    { id: 12, de: 'Du bist Timur.', uz: 'Sen Timursan.', sectionId: 7 },
    { id: 13, de: 'Ich bin hier.', uz: 'Men bu yerdaman.', sectionId: 7 },
    { id: 14, de: 'Wie geht es dir?', uz: 'Ahvoling qanday?', sectionId: 7 },
  ];
  const phrase = [
    { id: 21, funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!', sectionId: 7 },
    { id: 22, funktionUz: 'xayrlashish', de: 'Tschüss!', uz: 'Xayr!', sectionId: 7 },
    { id: 23, funktionUz: 'minnatdorchilik', de: 'Danke!', uz: 'Rahmat!', sectionId: 7 },
    { id: 24, funktionUz: 'tanishtirish', de: 'Ich bin Anna.', uz: 'Men Annaman.', sectionId: 7 },
  ];

  return {
    attempts: [] as unknown[],
    states: new Map<number, { strength: number; dueAt: Date }>(),
    dafLesson: {
      findUnique: jest.fn(async () => ({
        id: 100,
        unitId: 1,
        sectionId: 7,
        kind: 'SECTION_A',
        section: { id: 7, code: 'u01-s1', order: 1, unitId: 1 },
      })),
    },
    dafSection: { findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', order: 1 }]) },
    dafLexeme: {
      findMany: jest.fn(async () => lexeme),
      findUnique: jest.fn(async ({ where }: any) => lexeme.find((l) => l.id === where.id) ?? null),
    },
    dafSentence: {
      findMany: jest.fn(async () => sentence),
      findUnique: jest.fn(async ({ where }: any) => sentence.find((s) => s.id === where.id) ?? null),
    },
    dafPhrase: {
      findMany: jest.fn(async () => phrase),
      findUnique: jest.fn(async ({ where }: any) => phrase.find((p) => p.id === where.id) ?? null),
    },
    dafLexemeState: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 1 })),
    },
    dafAttempt: { create: jest.fn(async () => ({ id: 1 })) },
  };
}

describe('UebungService.seans', () => {
  it('savol beradi va to`g`ri javobni YUBORMAYDI', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);

    expect(fragen.length).toBeGreaterThan(0);
    for (const f of fragen) {
      expect(Object.keys(f)).not.toContain('richtig');
      expect(Object.keys(f)).not.toContain('akzeptiert');
    }
  });

  it('passiv so`zni so`ramaydi', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);
    const soralgan = fragen.filter((f) => f.itemType === 'WORT').map((f) => f.itemId);
    // 6 — `core: false`, ya'ni faqat matnda uchraydi.
    expect(soralgan).not.toContain(6);
  });

  it('savollar tartib raqamiga ega', async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(100, 55);
    expect(fragen.map((f) => f.index)).toEqual(fragen.map((_, i) => i));
  });

  it('dars topilmasa xato tashlaydi', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => null);
    await expect(new UebungService(prisma as any).seans(999, 55)).rejects.toThrow();
  });
});

describe('UebungService.pruefen', () => {
  const ctx = { studentId: 55, companyId: 1 };

  it('to`g`ri javobni qabul qiladi va to`g`ri javobni qaytaradi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(r.richtig).toBe('salom');
  });

  it('imlo farqini kechiradi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'PHRASE', itemId: 22, format: 'REAKTION', given: 'Tschuess!' },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
  });

  it('xato javobni rad etadi', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'rahmat' },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('urinishni yozadi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(prisma.dafAttempt.create).toHaveBeenCalled();
    const arg = prisma.dafAttempt.create.mock.calls[0][0] as any;
    expect(arg.data.studentId).toBe(55);
    expect(arg.data.lexemeId).toBe(1);
    expect(arg.data.isCorrect).toBe(true);
  });

  it('so`z holatini yangilaydi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      ctx,
    );
    expect(prisma.dafLexemeState.upsert).toHaveBeenCalled();
  });

  it('gap javobida so`z holati yangilanmaydi', async () => {
    // Holat SO'ZGA bog'langan; gap javobi qaysi so'zni bilishini aytmaydi.
    const prisma = fakePrisma();
    await new UebungService(prisma as any).pruefen(
      { itemType: 'SATZ', itemId: 11, format: 'SATZ_UEBERSETZEN', given: 'Men Annaman.' },
      ctx,
    );
    expect(prisma.dafLexemeState.upsert).not.toHaveBeenCalled();
  });

  it('mavjud bo`lmagan materialga xato tashlaydi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).pruefen(
        { itemType: 'WORT', itemId: 999, format: 'WORT_UZ', given: 'salom' },
        ctx,
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/uebung.service.spec.ts`
Expected: FAIL — `Cannot find module './uebung.service'`

- [ ] **Step 3: Servisni yozing**

`server/src/daf/uebung/uebung.service.ts` da quyidagilar bo'ladi. Kodni
o'zingiz yozasiz, lekin quyidagi qoidalarga aynan amal qiling:

**`seans(lessonId, studentId)`:**
1. Darsni `section` bilan o'qiydi. Topilmasa `NotFoundException`.
2. Darsning bo'limi va undan OLDINGI bo'limlarning materialini o'qiydi
   (`section.order` bo'yicha) — chalg'ituvchilar shu to'plamdan olinadi.
   So'zlardan faqat `core: true` bo'lganlari so'raladi; `core: false`
   so'zlar chalg'ituvchi sifatida ham ISHLATILMAYDI, chunki o'quvchi
   ularni o'rganmagan.
3. Har material uchun barcha mos formatlarni sinab ko'radi va `null`
   bo'lmaganlarini nomzodlar ro'yxatiga qo'shadi (Task 2 va 3 quruvchilari).
4. **Qaytarish o'rinlari.** `dafLexemeState` dan shu o'quvchining
   `dueAt <= now` bo'lgan so'zlarini o'qiydi (eng eskisidan boshlab),
   ulardan seansning oltidan biri qadar oladi — 12 savollik darsda 2 ta —
   va ular uchun savol quradi. Muhim: qaytarish savoli so'z oxirgi marta
   qaysi formatda so'ralgan bo'lsa, **boshqa formatda** qurilishi kerak;
   oxirgi format `DafAttempt` dan emas, `dafLexemeState` ning
   `lastFormat` ustunidan o'qiladi. Muddati kelgan so'z bo'lmasa
   (birinchi dars) qaytarish soni 0 ga tushadi va o'rniga yangi savol
   qo'yiladi — bu xato emas, tabiiy holat.
5. `baueSeans(kandidaten, 12, Math.random, wiederholung)` bilan tarkib quradi.
6. `toPublic` bilan mijozga ketadigan shaklga o'giradi.

**`pruefen(input, ctx)`:**
1. `itemType` bo'yicha materialni bazadan o'qiydi. Topilmasa `NotFoundException`.
2. To'g'ri javobni SHU materialdan qaytadan hisoblaydi. Bu qismning kodi
   aniq yozilsin — mana shu funksiya:

```ts
/**
 * To'g'ri javob MATERIALDAN qaytadan hisoblanadi, savoldan emas.
 *
 * `LUECKE` va `PAAR` bu yerda tekshirilmaydi: ularning javobi materialdan
 * YAGONA tarzda kelib chiqmaydi. `LUECKE` da qaysi so'z olib tashlangani
 * savol qurilganda tasodifiy tanlangan, `PAAR` da esa to'rt juftning
 * qaysilari tushgani ham shunday. Ularni tekshirish uchun savolning
 * o'zligi kengayishi kerak (qaysi so'z, qaysi to'rtlik) — bu keyingi
 * rejaning ishi. Hozir ular seansda beriladi, lekin javobi qabul
 * qilinmaydi, va buni xato aniq aytadi.
 */
function richtigeAntwort(
  format: FrageFormat,
  material: { de: string; uz: string; artikel?: string | null },
): { richtig: string; akzeptiert: string[] } {
  switch (format) {
    case 'WORT_UZ':
    case 'SATZ_UEBERSETZEN':
      return { richtig: material.uz, akzeptiert: [] };
    case 'UZ_WORT':
      return {
        richtig: material.artikel ? `${material.artikel} ${material.de}` : material.de,
        akzeptiert: [material.de],
      };
    case 'ARTIKEL':
      if (!material.artikel) {
        throw new BadRequestException("Bu so'zda artikl yo'q");
      }
      return { richtig: material.artikel, akzeptiert: [] };
    case 'SATZ_BAUEN':
    case 'REAKTION':
      return { richtig: material.de, akzeptiert: [] };
    default:
      throw new BadRequestException(
        `${format} javobi hozircha tekshirilmaydi — savol o'zligi kengayishi kerak`,
      );
  }
}
```

3. `istRichtig` bilan solishtiradi.
4. `dafAttempt.create` bilan urinishni yozadi: `studentId` va `companyId`
   `ctx` dan, `lexemeId` faqat `itemType === 'WORT'` bo'lganda.
5. `itemType === 'WORT'` bo'lsa `dafLexemeState` ni `naechsterZustand`
   bilan yangilaydi (`upsert`, kalit `studentId` + `lexemeId`) va
   `lastFormat` ga shu javobning formatini yozadi — qaytarish savoli
   keyingi safar boshqa format tanlashi uchun.
6. `{ isCorrect, richtig }` qaytaradi.

Fayl boshiga sinf izohi yoziladi va unda **nega savol qayta qurilmasligi**
tushuntiriladi (dizayn D7): qaytariladigan so'zlar har o'quvchida
boshqacha, ya'ni savolni qayta qurish uchun kerak bo'ladigan urug'
beqaror. Shu bilan birga izohda **buning narxi** ham ochiq yoziladi:
o'quvchi o'ziga ko'rsatilmagan material bo'yicha ham javob yubora oladi.
Bu faqat o'zining mashq statistikasiga ta'sir qiladi, boshqasiga emas.

- [ ] **Step 4: Test o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/uebung.service.spec.ts`
Expected: PASS — 12 ta test.

- [ ] **Step 5: Modulga ulang**

`server/src/daf/daf.module.ts` dagi `providers` ga `UebungService` qo'shing
va faylning boshiga import yozing.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/
git commit -m "Mashq servisi: seans quradi, javobni serverda tekshiradi"
```

---

## Task 7: HTTP yo'llari

**Files:**
- Create: `server/src/daf/dto/uebung.dto.ts`
- Modify: `server/src/daf/daf-portal.controller.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `UebungService` (Task 6).
- Produces: `GET /student-portal/lernen/lessons/:id/uebung`, `POST /student-portal/lernen/uebung/check`.

- [ ] **Step 1: DTO yozing**

`server/src/daf/dto/uebung.dto.ts`:

```ts
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { FrageFormat } from '../uebung/frage.types';

/**
 * Mashq javobi.
 *
 * `studentId` maydoni ATAYLAB YO'Q — u faqat tokendan olinadi.
 * To'g'ri javob ham kirmaydi: tekshiruv serverda.
 *
 * Mijoz QAYSI material bo'yicha javob berganini aytadi (`itemType`,
 * `itemId`), savolning dars ichidagi o'rnini emas. Sabab dizaynda (D7):
 * seans har o'quvchida boshqacha quriladi, ya'ni «o'rin» bo'yicha
 * savolni qayta qurib bo'lmaydi.
 */
export class CheckAntwortDto {
  @IsIn(['WORT', 'SATZ', 'PHRASE'])
  itemType!: 'WORT' | 'SATZ' | 'PHRASE';

  @IsInt()
  itemId!: number;

  @IsIn(['WORT_UZ', 'UZ_WORT', 'PAAR', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN', 'SATZ_UEBERSETZEN', 'REAKTION'])
  format!: FrageFormat;

  @IsString()
  @MaxLength(500)
  given!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}
```

- [ ] **Step 2: Kontrollerga qo'shing**

`server/src/daf/daf-portal.controller.ts` ga `UebungService` ni inject
qiling va ikki yo'l qo'shing:

```ts
  /** Darsning 12 savoli. To'g'ri javoblar ichida YO'Q. */
  @Get('lessons/:id/uebung')
  getUebung(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.uebung.seans(id, studentId);
  }

  /**
   * Mashq javobi. `studentId` TOKENDAN olinadi, tanadan emas — aks holda
   * o'quvchi boshqasining nomidan javob yozib, uning natijasini buzishi
   * mumkin bo'lardi.
   */
  @Post('uebung/check')
  checkUebung(
    @Body() dto: CheckAntwortDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.uebung.pruefen(dto, { studentId, companyId });
  }
```

- [ ] **Step 3: Route siyosatiga kiriting**

`server/src/common/auth/branch-route-policy.ts` da mavjud
`COMPANY_WIDE` yozuviga (DaF kontenti haqidagisi) `GET
/student-portal/lernen/lessons/:id/uebung` ni qo'shing, alifbo tartibini
saqlab. `POST /student-portal/lernen/uebung/check` ni esa `SELF`
yozuviga qo'shing — u `@CurrentUser('studentId')` ga tayanadi, xuddi
`POST /student-portal/lernen/attempts` kabi.

- [ ] **Step 4: Tasdiqlang**

Run: `cd server && npx jest branch-route-policy`
Expected: PASS — hamma route toifalangan.

Run: `cd server && npm test`
Expected: PASS.

Run: `cd server && npm run typecheck`
Expected: xatosiz.

- [ ] **Step 5: Haqiqiy so'rov bilan sinang**

Dev serverni ko'taring va o'quvchi tokeni bilan bitta darsni so'rang:

```bash
cd server && npm run start:dev
# boshqa terminalda, o'quvchi tokeni bilan:
# curl -s -H "Authorization: Bearer <token>" \
#   http://localhost:4000/student-portal/lernen/lessons/<id>/uebung | head -40
```

Kutilgan: 12 tagacha savol, har birida `format`, `prompt`, `options`;
`richtig` yoki `akzeptiert` maydonlari **hech qayerda ko'rinmasin**.
Ko'rinsa — bu jiddiy nuqson, to'xtang va xabar bering.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-a1-kontent
git add server/src/daf/ server/src/common/auth/branch-route-policy.ts
git commit -m "Mashq yo'llari: seans va javob tekshiruvi"
```

---

## Reja tugagach

Dvigatel ishlaydi: dars so'ralganda 12 tagacha savol quriladi, javob
serverda tekshiriladi, xato qilingan so'z qaytarish jadvaliga tushadi.
Ekran hali yo'q — sinov HTTP orqali.

**Keyingi rejalar:**
1. **Ekran** — `/portal/lernen` qayta quriladi: 12 unitlik yo'l, bo'limlar, seans ekrani. Telefon, katta planshet va mobilda ishlashi shart.
2. **Media** — 1-unitning rasmi va ovozi; shundan keyin `BILD_WORT` va to'rtta eshitish formati yonadi.
3. **Qolgan formatlar** — `DIALOG_LUECKE`, `ZUORDNEN`, `WAHL`: material shakli kengaytirilgach.
