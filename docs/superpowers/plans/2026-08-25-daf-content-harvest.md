# DaF Faza 1 — kontent yig'ish quvuri

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deutsch im Blick va ZUM Deutsch Lernen kontentini versiyalangan JSON dataset'ga aylantirish, darajasini deterministik yorliqlash va media fayllarni Cloudflare R2'ga chiqarish.

**Architecture:** Har manba uchun ikkiga ajratilgan adapter — `client` (tarmoq, diskka keshlaydi) va `parser` (sof funksiya, tarmoqsiz testlanadi). Parserlar `DafDataset` shakliga yozadi; daraja yorliqlagich bob tartibi va grammatika bog'lanishidan hisoblaydi. Media alohida manifest orqali R2'ga yuklanadi. **Bu fazada baza ham, AI ham ishtirok etmaydi** — natija fayllar.

**Tech Stack:** TypeScript, ts-node, Jest (ts-jest), `@aws-sdk/client-s3` (R2 S3-mos), `undici`/global `fetch` (Node 20+). Yangi paket qo'shilmaydi.

## Global Constraints

- **Izohlar va test tavsiflari — o'zbekcha (lotin).** Repo uslubi shunday; nemischa atamalar asl holida qoladi (`Wortschatz`, `Redemittel`).
- **Jest `rootDir` = `server/src`**, `testRegex` = `.*\.spec\.ts$`. Test faqat `server/src/` ostida yashaydi.
- **Yangi npm paketi qo'shilmaydi.** HTML `RegExp` bilan o'qiladi — manba 2009-yildan beri qotgan va markup mashina yaratgan, bir xil.
- **Skriptlar Nest kontekstini ko'tarmaydi** (`refresh-videothek.ts` naqshi): `AppModule` bilan Telegram bot ham ishga tushadi va lokal dev server bilan to'qnashadi.
- **Har media aktiv o'z litsenziyasi, muallifi va manba URL'ini olib yuradi.** Litsenziyasi noma'lum aktiv manifestga tushmaydi (spec Q9).
- **Dataset git'ga commit qilinadi** (`server/content/daf/`), media esa **hech qachon** — u R2'ga ketadi.
- **Tarmoq javoblar diskka keshlanadi** (`server/.cache/daf/`), `.gitignore` ga qo'shiladi. Qayta ishga tushirish manbani qaytadan urmasin.
- CEFR qiymatlari: `A1.1 | A1.2 | A2.1 | A2.2 | B1` (spec 3.1).

---

### Task 1: Dataset sxemasi va invariant tekshiruvi

Barcha parserlar shu shaklga yozadi. U birinchi bo'lib yoziladi, chunki keyingi hamma task shundan tip oladi.

**Files:**
- Create: `server/src/daf-content/dataset.types.ts`
- Create: `server/src/daf-content/dataset.validate.ts`
- Test: `server/src/daf-content/dataset.validate.spec.ts`

**Interfaces:**
- Consumes: hech narsa
- Produces: `CefrLevel`, `AssetRef`, `Lexeme`, `LexemeSection`, `Transcript`, `ChapterInfo`, `DafDataset`, `validateDataset(d: DafDataset): string[]`

- [ ] **Step 1: Sxema faylini yozing**

`server/src/daf-content/dataset.types.ts`:

```ts
/**
 * Manbadan mustaqil dataset shakli. Parserlar SHU yerga yozadi — DiB'ning
 * «Kapitel» yoki ZUM'ning «Handlungsfeld» atamalari bu fayldan nariga
 * o'tmaydi. Yangi manba qo'shilganda bu tiplar o'zgarmasligi kerak; agar
 * o'zgartirish kerak bo'lsa, demak adapter o'z atamasini olib kiryapti.
 */
export type CefrLevel = 'A1.1' | 'A1.2' | 'A2.1' | 'A2.2' | 'B1';

export type SourceId = 'DIB' | 'ZUM';

/** R2'ga ketadigan bitta fayl. Litsenziyasiz aktiv manifestga tushmaydi. */
export interface AssetRef {
  /** Manbadagi to'liq URL. */
  sourceUrl: string;
  /** R2'dagi kalit, masalan `dib/audio/voc_01_01_begr.mp3`. */
  key: string;
  kind: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'PDF';
  license: string;
  attribution: string;
}

export interface Lexeme {
  /** Nemischa so'z yoki ibora, asl holida. */
  de: string;
  /** Inglizcha tarjima (manbadan). O'zbekcha keyinroq qo'shiladi. */
  en: string;
  sectionId: string;
}

/** Lug'atning bitta mavzuli bo'limi — DiB'da har biriga bitta mp3 to'g'ri keladi. */
export interface LexemeSection {
  id: string;
  chapter: number;
  titleDe: string;
  titleEn: string;
  audio: AssetRef | null;
  entries: Lexeme[];
}

export interface Transcript {
  /** DiB fayl nomi, masalan `01_02_int_ag_who`. */
  id: string;
  chapter: number;
  titleDe: string;
  /** Nemischa qatorlar, ketma-ketligi saqlangan. Vaqt belgisi YO'Q. */
  linesDe: string[];
  /** Inglizcha qatorlar. `linesDe` bilan bir xil uzunlikda bo'lishi SHART emas. */
  linesEn: string[];
  video: AssetRef | null;
}

export interface ChapterInfo {
  chapter: number;
  /** Grimm Grammar sahifa kodlari, masalan `vi_05`. */
  grammarFocus: string[];
  grammarRecommended: string[];
}

export interface DafDataset {
  source: SourceId;
  /** Yig'ilgan sana, ISO. Skript beradi — parser emas. */
  harvestedAt: string;
  license: string;
  attribution: string;
  chapters: ChapterInfo[];
  sections: LexemeSection[];
  transcripts: Transcript[];
}
```

- [ ] **Step 2: Buzuq datasetni topadigan testni yozing**

`server/src/daf-content/dataset.validate.spec.ts`:

```ts
import { validateDataset } from './dataset.validate';
import type { DafDataset } from './dataset.types';

function base(): DafDataset {
  return {
    source: 'DIB',
    harvestedAt: '2026-08-25T00:00:00.000Z',
    license: 'CC BY 4.0',
    attribution: 'Deutsch im Blick, COERLL, UT Austin',
    chapters: [{ chapter: 1, grammarFocus: ['vi_05'], grammarRecommended: [] }],
    sections: [
      {
        id: 'dib-1-1',
        chapter: 1,
        titleDe: 'Begrüßungen',
        titleEn: 'Greetings',
        audio: null,
        entries: [{ de: 'Hallo!', en: 'Hello!', sectionId: 'dib-1-1' }],
      },
    ],
    transcripts: [],
  };
}

describe('validateDataset', () => {
  it('to\'g\'ri dataset uchun bo\'sh ro\'yxat qaytaradi', () => {
    expect(validateDataset(base())).toEqual([]);
  });

  it('bo\'sh lug\'at yozuvini xato deb belgilaydi', () => {
    const d = base();
    d.sections[0].entries.push({ de: '  ', en: 'x', sectionId: 'dib-1-1' });
    expect(validateDataset(d)).toContain('dib-1-1: bo\'sh `de` qiymati bor');
  });

  it('bo\'limi yo\'q yozuvni topadi', () => {
    const d = base();
    d.sections[0].entries[0].sectionId = 'yoq-bolim';
    expect(validateDataset(d)).toContain(
      "dib-1-1: `yoq-bolim` bo'limi mavjud emas",
    );
  });

  it('litsenziyasiz aktivni o\'tkazmaydi', () => {
    const d = base();
    d.sections[0].audio = {
      sourceUrl: 'https://x/a.mp3',
      key: 'dib/audio/a.mp3',
      kind: 'AUDIO',
      license: '',
      attribution: 'x',
    };
    expect(validateDataset(d)).toContain(
      'dib/audio/a.mp3: litsenziya ko\'rsatilmagan',
    );
  });

  it('takrorlangan bo\'lim id\'sini topadi', () => {
    const d = base();
    d.sections.push({ ...d.sections[0], entries: [] });
    expect(validateDataset(d)).toContain("dib-1-1: bo'lim id'si takrorlangan");
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/dataset.validate.spec.ts`
Expected: FAIL — `Cannot find module './dataset.validate'`

- [ ] **Step 4: Validatorni yozing**

`server/src/daf-content/dataset.validate.ts`:

```ts
import type { AssetRef, DafDataset } from './dataset.types';

/**
 * Dataset commit qilinishidan oldingi qorovul. Xatolar ro'yxatini qaytaradi —
 * bo'sh ro'yxat «toza» degani. Exception tashlamaydi: skript hamma muammoni
 * bir yo'la ko'rsatishi kerak, birinchisida to'xtab qolmasligi.
 */
export function validateDataset(d: DafDataset): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  const checkAsset = (a: AssetRef | null) => {
    if (!a) return;
    if (!a.license.trim()) errors.push(`${a.key}: litsenziya ko'rsatilmagan`);
    if (!a.attribution.trim()) errors.push(`${a.key}: muallif ko'rsatilmagan`);
  };

  for (const s of d.sections) {
    if (seen.has(s.id)) errors.push(`${s.id}: bo'lim id'si takrorlangan`);
    seen.add(s.id);
    checkAsset(s.audio);

    for (const e of s.entries) {
      if (!e.de.trim()) errors.push(`${s.id}: bo'sh \`de\` qiymati bor`);
      if (!e.en.trim()) errors.push(`${s.id}: bo'sh \`en\` qiymati bor`);
      if (!seen.has(e.sectionId) && e.sectionId !== s.id) {
        errors.push(`${s.id}: \`${e.sectionId}\` bo'limi mavjud emas`);
      }
    }
  }

  for (const t of d.transcripts) {
    if (t.linesDe.length === 0) errors.push(`${t.id}: nemischa matn bo'sh`);
    checkAsset(t.video);
  }

  return errors;
}
```

- [ ] **Step 5: Testni qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/dataset.validate.spec.ts`
Expected: PASS — 5 ta test

- [ ] **Step 6: Commit**

```bash
git add server/src/daf-content/dataset.types.ts \
        server/src/daf-content/dataset.validate.ts \
        server/src/daf-content/dataset.validate.spec.ts
git commit -m "Dataset shakli manbadan ajratildi

Parserlar shu tiplarga yozadi. Agar yangi manba qo'shilganda bu fayl
o'zgarishi kerak bo'lsa, demak adapter o'z atamasini olib kiryapti —
bu qoidani buzish belgisi."
```

---

### Task 2: DiB HTTP klienti va disk keshi

Tarmoq faqat shu faylda. Qolgan hamma narsa sof funksiya bo'ladi va tarmoqsiz testlanadi.

**Files:**
- Create: `server/src/daf-content/dib/dib-client.ts`
- Test: `server/src/daf-content/dib/dib-client.spec.ts`
- Modify: `server/.gitignore` (yoki repo ildizidagi `.gitignore`)

**Interfaces:**
- Consumes: hech narsa
- Produces: `DIB_BASE`, `DIB_MEDIA_BASE`, `class DibClient { constructor(cacheDir: string, fetchFn?: typeof fetch); fetchText(path: string): Promise<string> }`

- [ ] **Step 1: Testni yozing**

`server/src/daf-content/dib/dib-client.spec.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DibClient } from './dib-client';

describe('DibClient.fetchText', () => {
  it('birinchi so\'rovda tarmoqqa boradi va diskka yozadi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dib-'));
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>salom</html>',
    });

    const client = new DibClient(dir, fetchFn as never);
    const html = await client.fetchText('voc.php?k=1');

    expect(html).toBe('<html>salom</html>');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(dir, 'voc.php_k=1.html'), 'utf8')).toBe(
      '<html>salom</html>',
    );
  });

  it('kesh bor bo\'lsa tarmoqqa umuman bormaydi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dib-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'voc.php_k=1.html'), 'keshdagi', 'utf8');
    const fetchFn = jest.fn();

    const client = new DibClient(dir, fetchFn as never);
    expect(await client.fetchText('voc.php?k=1')).toBe('keshdagi');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('HTTP xatosida tushunarli xabar bilan yiqiladi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dib-'));
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    const client = new DibClient(dir, fetchFn as never);
    await expect(client.fetchText('yoq.php')).rejects.toThrow(
      'DiB javob bermadi (404): yoq.php',
    );
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/dib/dib-client.spec.ts`
Expected: FAIL — `Cannot find module './dib-client'`

- [ ] **Step 3: Klientni yozing**

`server/src/daf-content/dib/dib-client.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DIB_BASE = 'https://coerll.utexas.edu/dib/';
export const DIB_MEDIA_BASE = 'https://media.la.utexas.edu/dib/';

/**
 * DiB sahifalarini olib, diskka keshlaydi.
 *
 * Kesh ixtiyoriy tezlashtirish emas, ATAYIN: yig'ish quvuri ishlab chiqilayotib
 * o'nlab marta qayta ishga tushadi, va har safar universitet serverini 300+
 * so'rov bilan urish — na xushmuomalalik, na ishonchli. Kesh o'chirilsa
 * (`rm -rf .cache/daf`) manba qaytadan o'qiladi.
 */
export class DibClient {
  constructor(
    private readonly cacheDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async fetchText(path: string): Promise<string> {
    const file = join(this.cacheDir, path.replace(/[/?&]/g, '_'));
    if (existsSync(file)) return readFileSync(file, 'utf8');

    const res = await this.fetchFn(DIB_BASE + path, {
      headers: { 'user-agent': 'daf-erp-content-harvest' },
    });
    if (!res.ok) {
      throw new Error(`DiB javob bermadi (${res.status}): ${path}`);
    }
    const text = await res.text();

    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(file, text, 'utf8');
    return text;
  }
}
```

- [ ] **Step 4: Testni qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/dib/dib-client.spec.ts`
Expected: PASS — 3 ta test

- [ ] **Step 5: Keshni git'dan chiqaring**

`server/.gitignore` fayliga qo'shing (fayl yo'q bo'lsa yarating):

```
.cache/
```

- [ ] **Step 6: Commit**

```bash
git add server/src/daf-content/dib/dib-client.ts \
        server/src/daf-content/dib/dib-client.spec.ts \
        server/.gitignore
git commit -m "DiB klienti javoblarni diskka keshlaydi

Quvur ishlab chiqilayotib o'nlab marta qayta ishga tushadi. Har safar
universitet serveriga 300+ so'rov yuborish na xushmuomalalik, na
ishonchli — kesh shuning uchun."
```

---

### Task 3: DiB lug'at parseri

Manbadagi eng katta va eng toza ma'lumot: 10 bobda 94 bo'lim, ~1 948 juft.

**Files:**
- Create: `server/src/daf-content/dib/html-entities.ts`
- Create: `server/src/daf-content/dib/dib-vocab.parser.ts`
- Test: `server/src/daf-content/dib/dib-vocab.parser.spec.ts`

**Interfaces:**
- Consumes: `LexemeSection`, `AssetRef` (Task 1)
- Produces: `decodeEntities(s: string): string`, `parseVocabPage(html: string, chapter: number): LexemeSection[]`

**Manba markupi (tekshirilgan):** har bo'lim `voc_XX_YY_*.mp3` havolasi bilan boshlanadi, undan keyin ikkita `<span class="hi_12_0057d1">` — nemischa va inglizcha sarlavha — keyin `<td>DE</td><td>EN</td>` juftlari. Sahifaning boshida navigatsiya ro'yxatida ham `hi_12_0057d1` bor, lekin u birinchi mp3 dan OLDIN keladi va shuning uchun kesib tashlanadi.

- [ ] **Step 1: Testni yozing**

`server/src/daf-content/dib/dib-vocab.parser.spec.ts`:

```ts
import { parseVocabPage } from './dib-vocab.parser';
import { decodeEntities } from './html-entities';

const HTML = `
<html><body>
<ul><li><span class="hi_12_0057d1">Sections</span></li></ul>
<a href="https://media.la.utexas.edu:443/dib/audio/voc_01_01_begr.mp3">audio</a>
<span class="hi_12_0057d1">Begr&uuml;&szlig;ungen  </span>
<span class="sm_sepbull">&#149;</span>
<span class="hi_12_0057d1">Greetings </span>
<table>
<tr onmouseover="this.className='vtr_over'"><td>Hallo!</td><td>Hello!</td></tr>
<tr onmouseover="this.className='vtr_over'"><td>Tsch&uuml;ss!</td><td>Bye!</td></tr>
</table>
<a href="https://media.la.utexas.edu:443/dib/audio/voc_01_02_werbistdu.mp3">audio</a>
<span class="hi_12_0057d1">Zahlen</span>
<span class="hi_12_0057d1">Numbers</span>
<table>
<tr onmouseover="this.className='vtr_over'"><td>eins</td><td>one</td></tr>
</table>
</body></html>`;

describe('decodeEntities', () => {
  it('nemis harflarini tiklaydi', () => {
    expect(decodeEntities('Tsch&uuml;ss! Gru&szlig;')).toBe('Tschüss! Gruß');
  });

  it('tipografik belgilarni oddiy shaklga keltiradi', () => {
    expect(decodeEntities('Mach&rsquo;s gut')).toBe('Mach’s gut');
    expect(decodeEntities('&ldquo;good day&rdquo;')).toBe('“good day”');
  });

  it('&nbsp; ni oddiy bo\'shliqqa aylantiradi', () => {
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });

  it('Windows-1252 raqamli havolani to\'g\'ri belgiga aylantiradi', () => {
    // 149 Unicode'da boshqaruv belgisi; DiB uni «•» ma'nosida ishlatadi
    expect(decodeEntities('Kap 01 &#149; Adan')).toBe('Kap 01 • Adan');
    expect(decodeEntities('&#150;')).toBe('–');
  });
});

describe('parseVocabPage', () => {
  it('har bo\'limni sarlavhasi va audiosi bilan ajratadi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s).toHaveLength(2);
    expect(s[0].titleDe).toBe('Begrüßungen');
    expect(s[0].titleEn).toBe('Greetings');
    expect(s[0].chapter).toBe(1);
    expect(s[0].audio?.key).toBe('dib/audio/voc_01_01_begr.mp3');
    expect(s[0].audio?.license).toBe('CC BY 4.0');
    expect(s[1].titleDe).toBe('Zahlen');
  });

  it('yozuvlarni to\'g\'ri bo\'limga biriktiradi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s[0].entries).toEqual([
      { de: 'Hallo!', en: 'Hello!', sectionId: s[0].id },
      { de: 'Tschüss!', en: 'Bye!', sectionId: s[0].id },
    ]);
    expect(s[1].entries).toHaveLength(1);
    expect(s[1].entries[0].de).toBe('eins');
  });

  it('navigatsiyadagi «Sections» sarlavhasini bo\'lim deb hisoblamaydi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s.map((x) => x.titleDe)).not.toContain('Sections');
  });

  it('bo\'lim id\'si bob va tartib raqamidan tuziladi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s[0].id).toBe('dib-voc-01-01');
    expect(s[1].id).toBe('dib-voc-01-02');
  });

  it('lug\'ati yo\'q sahifada bo\'sh ro\'yxat qaytaradi', () => {
    expect(parseVocabPage('<html></html>', 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/dib/dib-vocab.parser.spec.ts`
Expected: FAIL — `Cannot find module './dib-vocab.parser'`

- [ ] **Step 3: Entity dekoderini yozing**

`server/src/daf-content/dib/html-entities.ts`:

```ts
const NAMED: Record<string, string> = {
  auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  bull: '•', hellip: '…',
};

/**
 * DiB `&#149;` kabi raqamli havolalarni ishlatadi. Bu Windows-1252 kodi,
 * Unicode emas: `String.fromCharCode(149)` ko'rinmaydigan BOSHQARUV belgisini
 * beradi, kerakli «•» ni emas. 128–159 oralig'i shuning uchun alohida
 * xaritalanadi — bu oraliq Unicode'da boshqaruv belgilariga ajratilgan va
 * hech bir veb-sahifa u yerga haqiqatan murojaat qilmaydi.
 */
const CP1252: Record<number, string> = {
  133: '…', 145: '‘', 146: '’', 147: '“', 148: '”',
  149: '•', 150: '–', 151: '—',
};

/**
 * DiB HTML 4.01 da yozilgan va nemis harflarini entity bilan beradi. To'liq
 * HTML dekoderi kerak emas — manbada uchraydigan belgilar to'plami cheklangan
 * va u o'zgarmaydi, chunki sayt 2009-yildan beri qotgan.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return CP1252[code] ?? String.fromCharCode(code);
    })
    .replace(/&([A-Za-z]+);/g, (m, name: string) => NAMED[name] ?? m);
}
```

- [ ] **Step 4: Parserni yozing**

`server/src/daf-content/dib/dib-vocab.parser.ts`:

```ts
import type { AssetRef, Lexeme, LexemeSection } from '../dataset.types';
import { decodeEntities } from './html-entities';

const DIB_LICENSE = 'CC BY 4.0';
const DIB_ATTRIBUTION =
  'Deutsch im Blick, COERLL, The University of Texas at Austin — CC BY 4.0';

const AUDIO_RE = /voc_(\d{2})_(\d{2})_[A-Za-z0-9_-]+\.mp3/g;
const TITLE_RE = /class="hi_12_0057d1">([^<]*)</g;
const ROW_RE = /<tr[^>]*vtr_over[^>]*>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g;

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Bitta bobning lug'at sahifasini bo'limlarga ajratadi.
 *
 * Sahifa tuzilishi (tekshirilgan): har bo'lim `voc_XX_YY_*.mp3` havolasi bilan
 * BOSHLANADI, undan keyin ikkita sarlavha spani (nemischa, inglizcha), keyin
 * `<td>` juftlari. Sahifaning yuqorisidagi navigatsiya ro'yxatida ham
 * sarlavha spani bor — u birinchi mp3 dan oldin turgani uchun kesiladi.
 */
export function parseVocabPage(
  html: string,
  chapter: number,
): LexemeSection[] {
  const marks = [...html.matchAll(AUDIO_RE)];
  if (marks.length === 0) return [];

  const sections: LexemeSection[] = [];

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index ?? 0;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? html.length) : html.length;
    const chunk = html.slice(start, end);
    const file = marks[i][0];

    const titles = [...chunk.matchAll(TITLE_RE)].map((m) => clean(m[1]));
    const id = `dib-voc-${String(chapter).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;

    const audio: AssetRef = {
      sourceUrl: `https://media.la.utexas.edu/dib/audio/${file}`,
      key: `dib/audio/${file}`,
      kind: 'AUDIO',
      license: DIB_LICENSE,
      attribution: DIB_ATTRIBUTION,
    };

    const entries: Lexeme[] = [...chunk.matchAll(ROW_RE)]
      .map((m) => ({ de: clean(m[1]), en: clean(m[2]), sectionId: id }))
      .filter((e) => e.de !== '' && e.en !== '');

    sections.push({
      id,
      chapter,
      titleDe: titles[0] ?? '',
      titleEn: titles[1] ?? '',
      audio,
      entries,
    });
  }

  return sections;
}
```

- [ ] **Step 5: Testni qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/dib/dib-vocab.parser.spec.ts`
Expected: PASS — 9 ta test

- [ ] **Step 6: Commit**

```bash
git add server/src/daf-content/dib/html-entities.ts \
        server/src/daf-content/dib/dib-vocab.parser.ts \
        server/src/daf-content/dib/dib-vocab.parser.spec.ts
git commit -m "DiB lug'ati bo'limlarga ajratildi

Bo'lim chegarasi sarlavha emas, AUDIO havolasi — sahifaning yuqorisidagi
navigatsiyada ham xuddi shu sarlavha klassi ishlatilgan va uni sarlavha
bo'yicha bo'lish 'Sections' degan soxta bo'lim tug'dirardi."
```

---

### Task 4: DiB transkript parseri

268 videoning nemischa va inglizcha matni. Bu manbaning eng qimmatli qismi — bu matnlar bo'lmasa, Hörübung mashqlarini yasab bo'lmaydi (ADR-0010 aynan shu sababdan transkript panelini qurmagan edi).

**Files:**
- Create: `server/src/daf-content/dib/dib-transcript.parser.ts`
- Test: `server/src/daf-content/dib/dib-transcript.parser.spec.ts`

**Interfaces:**
- Consumes: `Transcript`, `AssetRef` (Task 1), `decodeEntities` (Task 3)
- Produces: `parseTranscriptPage(html: string, fileId: string, chapter: number): Transcript | null`, `parseVideoList(rssXml: string): { fileId: string; title: string }[]`

> **TUZATISH (bajarilganidan keyin yozildi).** Quyidagi kod namunasidagi
> selektorlar NOTO'G'RI edi — ular sahifaning matn ko'rinishidan yozilgan,
> HTML tuzilishidan emas. Haqiqiy markup:
> qatorlar `<p>` emas, **`<li class="vidt_i">`** (intervyuchi) va
> **`<li class="vidt_s">`** (so'zlovchi) ichida; sarlavha `class="ti"` emas,
> **`class="vidt_th"`** va ichida `<span>` bor. Butun sahifada bitta `<p>`
> bor va u pleyerga tegishli. Bundan tashqari RSS sarlavhalari ikki marta
> kodlangan UTF-8 bilan keladi va tuzatilishi kerak.
> Haqiqiy holat commit `d1155e6` da; haqiqiy sahifa repo'da fixture bo'lib
> yotadi: `server/src/daf-content/dib/__fixtures__/vidt-01_02.html`.

- [ ] **Step 1: Testni yozing**

`server/src/daf-content/dib/dib-transcript.parser.spec.ts`:

```ts
import { parseTranscriptPage, parseVideoList } from './dib-transcript.parser';

const PAGE = `
<html><body>
<div id="vidt_g">
  <div class="ti">Kap 01 &#149; Adan &#149; Wer bin ich?</div>
  <p>Wie hei&szlig;t du?</p>
  <p>Ich hei&szlig;e Adan.</p>
  <p>Woher kommst du?</p>
</div>
<div id="vidt_e">
  <div class="ti">Ch 01 &#149; Adan &#149; Who am I?</div>
  <p>What is your name?</p>
  <p>My name is Adan.</p>
  <p>Where are you from?</p>
</div>
<div id="vidt_v"></div>
</body></html>`;

const RSS = `<rss><channel>
<item><title>Kapitel 01 - Ankunft in W&#252;rzburg</title>
<enclosure url="http://coerll.utexas.edu/dib/mp4s/01_01_intro_arrival.mp4"/></item>
<item><title>Kapitel 01 - Interviews, Adan: Wer bin ich?</title>
<enclosure url="http://coerll.utexas.edu/dib/mp4s/01_02_int_ag_who.mp4"/></item>
</channel></rss>`;

describe('parseTranscriptPage', () => {
  it('nemischa va inglizcha qatorlarni alohida oladi', () => {
    const t = parseTranscriptPage(PAGE, '01_02_int_ag_who', 1)!;
    expect(t.linesDe).toEqual([
      'Wie heißt du?',
      'Ich heiße Adan.',
      'Woher kommst du?',
    ]);
    expect(t.linesEn[1]).toBe('My name is Adan.');
  });

  it('sarlavhani ajratib oladi va matn qatoriga qo\'shmaydi', () => {
    const t = parseTranscriptPage(PAGE, '01_02_int_ag_who', 1)!;
    expect(t.titleDe).toBe('Kap 01 • Adan • Wer bin ich?');
    expect(t.linesDe).not.toContain('Kap 01 • Adan • Wer bin ich?');
  });

  it('video aktivini litsenziya bilan biriktiradi', () => {
    const t = parseTranscriptPage(PAGE, '01_02_int_ag_who', 1)!;
    expect(t.video?.key).toBe('dib/video/01_02_int_ag_who.mp4');
    expect(t.video?.kind).toBe('VIDEO');
    expect(t.video?.license).toBe('CC BY 4.0');
  });

  it('nemischa matni yo\'q sahifada null qaytaradi', () => {
    expect(parseTranscriptPage('<html></html>', 'x', 1)).toBeNull();
  });

  it('inglizchasi yo\'q bo\'lsa ham nemischasini beradi', () => {
    const only = '<div id="vidt_g"><p>Guten Tag.</p></div>';
    const t = parseTranscriptPage(only, 'y', 2)!;
    expect(t.linesDe).toEqual(['Guten Tag.']);
    expect(t.linesEn).toEqual([]);
  });
});

describe('parseVideoList', () => {
  it('RSS dan fayl id va sarlavhani oladi', () => {
    expect(parseVideoList(RSS)).toEqual([
      { fileId: '01_01_intro_arrival', title: 'Kapitel 01 - Ankunft in Würzburg' },
      { fileId: '01_02_int_ag_who', title: 'Kapitel 01 - Interviews, Adan: Wer bin ich?' },
    ]);
  });

  it('bo\'sh RSS uchun bo\'sh ro\'yxat', () => {
    expect(parseVideoList('<rss></rss>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/dib/dib-transcript.parser.spec.ts`
Expected: FAIL — `Cannot find module './dib-transcript.parser'`

- [ ] **Step 3: Parserni yozing**

`server/src/daf-content/dib/dib-transcript.parser.ts`:

```ts
import type { AssetRef, Transcript } from '../dataset.types';
import { decodeEntities } from './html-entities';

const DIB_LICENSE = 'CC BY 4.0';
const DIB_ATTRIBUTION =
  'Deutsch im Blick, COERLL, The University of Texas at Austin — CC BY 4.0';

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** `<div id="...">` ichini oxirigacha emas, mos keluvchi yopilishgacha oladi. */
function panel(html: string, id: string): string | null {
  const open = html.indexOf(`<div id="${id}"`);
  if (open === -1) return null;
  let i = html.indexOf('>', open) + 1;
  let depth = 1;
  const start = i;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      i = nextClose + 6;
    }
  }
  return html.slice(start, Math.max(start, i - 6));
}

function lines(block: string | null): { title: string; rows: string[] } {
  if (!block) return { title: '', rows: [] };
  const titleMatch = block.match(/class="ti"[^>]*>([\s\S]*?)<\/div>/);
  const title = titleMatch ? clean(titleMatch[1]) : '';
  const body = titleMatch ? block.replace(titleMatch[0], '') : block;
  const rows = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => clean(m[1]))
    .filter((s) => s !== '');
  return { title, rows };
}

/**
 * Video transkript sahifasi. `vidt_g` — nemischa, `vidt_e` — inglizcha.
 *
 * Ikkala ro'yxat bir xil uzunlikda BO'LMASLIGI mumkin va bu xato emas:
 * tarjimon ba'zan ikki nemischa gapni bitta inglizcha gapga qo'shgan.
 * Shuning uchun qatorlar juftlanmaydi, alohida saqlanadi.
 */
export function parseTranscriptPage(
  html: string,
  fileId: string,
  chapter: number,
): Transcript | null {
  const de = lines(panel(html, 'vidt_g'));
  if (de.rows.length === 0) return null;
  const en = lines(panel(html, 'vidt_e'));

  const video: AssetRef = {
    sourceUrl: `https://media.la.utexas.edu/dib/video/${fileId}.mp4`,
    key: `dib/video/${fileId}.mp4`,
    kind: 'VIDEO',
    license: DIB_LICENSE,
    attribution: DIB_ATTRIBUTION,
  };

  return {
    id: fileId,
    chapter,
    titleDe: de.title,
    linesDe: de.rows,
    linesEn: en.rows,
    video,
  };
}

/** Bobning video ro'yxati `rss.php?k=N&a=mp4` dan olinadi. */
export function parseVideoList(
  rssXml: string,
): { fileId: string; title: string }[] {
  const items = [...rssXml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const out: { fileId: string; title: string }[] = [];
  for (const it of items) {
    const url = it[1].match(/url="[^"]*\/mp4s\/([A-Za-z0-9_-]+)\.mp4"/);
    const title = it[1].match(/<title>([\s\S]*?)<\/title>/);
    if (url) {
      out.push({ fileId: url[1], title: title ? clean(title[1]) : '' });
    }
  }
  return out;
}
```

- [ ] **Step 4: Testni qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/dib/dib-transcript.parser.spec.ts`
Expected: PASS — 7 ta test

- [ ] **Step 5: Commit**

```bash
git add server/src/daf-content/dib/dib-transcript.parser.ts \
        server/src/daf-content/dib/dib-transcript.parser.spec.ts
git commit -m "268 video transkripti DE va EN bo'lib olinadi

Qatorlar juftlanmaydi: tarjimon ba'zan ikki nemischa gapni bitta
inglizchaga qo'shgan, ya'ni ro'yxatlar uzunligi teng emas va bu xato
emas. Juftlashga urinish ma'lumotni buzardi."
```

---

### Task 5: Bob→grammatika bog'lanishi va daraja yorliqlagich

Spec Q7: daraja deterministik aniqlanadi. Bu task shu qarorni kodga aylantiradi.

**Files:**
- Create: `server/src/daf-content/dib/dib-chapter.parser.ts`
- Create: `server/src/daf-content/grammar-levels.ts`
- Create: `server/src/daf-content/level-labeler.ts`
- Test: `server/src/daf-content/dib/dib-chapter.parser.spec.ts`
- Test: `server/src/daf-content/level-labeler.spec.ts`

**Interfaces:**
- Consumes: `ChapterInfo`, `CefrLevel` (Task 1)
- Produces: `parseChapterPage(html: string, chapter: number): ChapterInfo`, `GRAMMAR_LEVEL: Record<string, CefrLevel>`, `labelChapter(info: ChapterInfo): { level: CefrLevel; needsReview: boolean; reason: string }`

- [ ] **Step 1: Bob parseri testini yozing**

`server/src/daf-content/dib/dib-chapter.parser.spec.ts`:

```ts
import { parseChapterPage } from './dib-chapter.parser';

// Haqiqiy DiB markupi: Focus va Recommended bo'limlari CSS klassi bilan emas,
// SARLAVHA RASMI bilan ajratilgan — `ti_grammar_f.gif` va `ti_grammar_r.gif`.
const TOC = `
<html><body>
<div class="bot_000">
<img src="images/ti_grammar_f.gif" width=207 height=17 border=0 alt="Focus" title="Focus">
</div>
<div class="bot_150 toc_ind_23"><table class="unbor_toc_num">
<tr><td><a href="http://coerll.utexas.edu/gg/gr/no_02.html" target="offsite">Nouns gender</a></td></tr>
<tr><td><a href="http://coerll.utexas.edu/gg/gr/vi_05.html" target="offsite">haben</a></td></tr>
</table></div>
<div class="bot_000">
<img src="images/ti_grammar_r.gif" width=207 height=17 border=0 alt="Recommended" title="Recommended">
</div>
<div class="bot_150 toc_ind_23"><table class="unbor_toc_num">
<tr><td><a href="http://coerll.utexas.edu/gg/gr/cas_02.html" target="offsite">nominative case</a></td></tr>
</table></div>
</body></html>`;

describe('parseChapterPage', () => {
  it('Focus va Recommended grammatikani ajratadi', () => {
    const c = parseChapterPage(TOC, 1);
    expect(c.chapter).toBe(1);
    expect(c.grammarFocus).toEqual(['no_02', 'vi_05']);
    expect(c.grammarRecommended).toEqual(['cas_02']);
  });

  it('bir xil kod ikki marta chiqsa, bir marta qaytaradi', () => {
    const dup = TOC.replace(
      '</table></div>\n<div class="bot_000">\n<img src="images/ti_grammar_r.gif"',
      '<tr><td><a href="http://coerll.utexas.edu/gg/gr/vi_05.html">haben</a></td></tr>'
        + '</table></div>\n<div class="bot_000">\n<img src="images/ti_grammar_r.gif"',
    );
    expect(parseChapterPage(dup, 1).grammarFocus).toEqual(['no_02', 'vi_05']);
  });

  it('grammatika havolasi yo\'q sahifada bo\'sh ro\'yxat', () => {
    const c = parseChapterPage('<html></html>', 7);
    expect(c).toEqual({ chapter: 7, grammarFocus: [], grammarRecommended: [] });
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/dib/dib-chapter.parser.spec.ts`
Expected: FAIL — `Cannot find module './dib-chapter.parser'`

- [ ] **Step 3: Bob parserini yozing**

`server/src/daf-content/dib/dib-chapter.parser.ts`:

```ts
import type { ChapterInfo } from '../dataset.types';

const LINK_RE = /\/gg\/gr\/([a-z]+_\d+)\.html/g;

/**
 * Focus va Recommended bo'limlari sahifada CSS klassi bilan emas, SARLAVHA
 * RASMI bilan ajratilgan. Rasm fayl nomi (`ti_grammar_f.gif`) belgi sifatida
 * `alt="Focus"` dan ishonchliroq: alt matni tarjima qilinishi mumkin, fayl
 * nomi esa yo'q.
 */
const FOCUS_MARK = 'ti_grammar_f.gif';
const REC_MARK = 'ti_grammar_r.gif';

function codes(block: string): string[] {
  return [...new Set([...block.matchAll(LINK_RE)].map((m) => m[1]))];
}

/**
 * Bobning mundarija sahifasidan grammatika bog'lanishini oladi.
 *
 * Bu daraja yorliqlashning ikkinchi signali (spec Q7): DiB muallifi har bob
 * uchun qaysi grammatika MAJBURIY (Focus), qaysi biri tavsiya etilishini
 * (Recommended) o'zi belgilagan. Ya'ni bu bizning taxminimiz emas, manbaning
 * o'z qarori.
 */
export function parseChapterPage(html: string, chapter: number): ChapterInfo {
  const focusStart = html.indexOf(FOCUS_MARK);
  const recStart = html.indexOf(REC_MARK);

  if (focusStart === -1 && recStart === -1) {
    return { chapter, grammarFocus: [], grammarRecommended: [] };
  }

  const focusBlock =
    focusStart === -1
      ? ''
      : html.slice(focusStart, recStart === -1 ? html.length : recStart);
  const recBlock = recStart === -1 ? '' : html.slice(recStart);

  return {
    chapter,
    grammarFocus: codes(focusBlock),
    grammarRecommended: codes(recBlock),
  };
}
```

- [ ] **Step 4: Bob parseri testini qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/dib/dib-chapter.parser.spec.ts`
Expected: PASS — 3 ta test

- [ ] **Step 5: Daraja yorliqlagich testini yozing**

`server/src/daf-content/level-labeler.spec.ts`:

```ts
import { labelChapter } from './level-labeler';

describe('labelChapter', () => {
  it('1-bobni A1.1 deb belgilaydi', () => {
    const r = labelChapter({ chapter: 1, grammarFocus: ['vi_05'], grammarRecommended: [] });
    expect(r.level).toBe('A1.1');
    expect(r.needsReview).toBe(false);
  });

  it('9-bobni A2.2 deb belgilaydi', () => {
    const r = labelChapter({ chapter: 9, grammarFocus: [], grammarRecommended: [] });
    expect(r.level).toBe('A2.2');
  });

  it('grammatika bobdan yuqori bo\'lsa, darajani ko\'taradi', () => {
    // vsub_01 = Konjunktiv II -> B1, bob esa A1.1
    const r = labelChapter({ chapter: 1, grammarFocus: ['vsub_01'], grammarRecommended: [] });
    expect(r.level).toBe('B1');
    expect(r.reason).toContain('vsub_01');
  });

  it('ikki pog\'onadan ortiq farqni ko\'rikka belgilaydi', () => {
    const r = labelChapter({ chapter: 1, grammarFocus: ['vsub_01'], grammarRecommended: [] });
    expect(r.needsReview).toBe(true);
  });

  it('Recommended grammatika darajani ko\'tarmaydi', () => {
    const r = labelChapter({
      chapter: 1,
      grammarFocus: [],
      grammarRecommended: ['vsub_01'],
    });
    expect(r.level).toBe('A1.1');
  });

  it('noma\'lum grammatika kodi darajaga ta\'sir qilmaydi', () => {
    const r = labelChapter({ chapter: 2, grammarFocus: ['zzz_99'], grammarRecommended: [] });
    expect(r.level).toBe('A1.1');
    expect(r.needsReview).toBe(false);
  });
});
```

- [ ] **Step 6: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/level-labeler.spec.ts`
Expected: FAIL — `Cannot find module './level-labeler'`

- [ ] **Step 7: Grammatika→daraja xaritasini yozing**

`server/src/daf-content/grammar-levels.ts`:

```ts
import type { CefrLevel } from './dataset.types';

/**
 * Grimm Grammar sahifa kodi → GER darajasi.
 *
 * Bu xarita QO'LDA yoziladi va daraja yorliqlashning ikkinchi signali bo'ladi.
 * Bu yerda LLM ishlatilmaydi (spec Q7): qayta hisoblansa bir xil natija
 * chiqishi va har bir qatorni tushuntirib bera olish shart.
 *
 * Ro'yxatda yo'q kod darajaga ta'sir qilmaydi — bilmaslikni taxmin bilan
 * to'ldirish yorliqni yomonlashtiradi.
 */
export const GRAMMAR_LEVEL: Record<string, CefrLevel> = {
  // A1.1 — eng boshlang'ich
  no_01: 'A1.1', no_02: 'A1.1', no_03: 'A1.1',
  det_01: 'A1.1', cas_02: 'A1.1',
  pro_01: 'A1.1', pro_02: 'A1.1',
  v_01: 'A1.1', v_02: 'A1.1', vi_05: 'A1.1', vi_11: 'A1.1',
  con_05: 'A1.1',

  // A1.2 — akkusativ, modal, ajraluvchi fe'l
  cas_03: 'A1.2', det_02: 'A1.2', det_03: 'A1.2',
  pro_03: 'A1.2', vm_01: 'A1.2', vm_02: 'A1.2',
  vsp_01: 'A1.2', vsp_02: 'A1.2',

  // A2.1 — perfekt, dativ
  vcp_01: 'A2.1', vcp_02: 'A2.1', vcp_03: 'A2.1', vcp_04: 'A2.1',
  cas_04: 'A2.1', pro_04: 'A2.1', con_01: 'A2.1',

  // A2.2 — preteritum, ergash gap, sifat qo'shimchasi
  vf_01: 'A2.2', con_03: 'A2.2', con_04: 'A2.2', con_06: 'A2.2',
  adj_01: 'A2.2', adj_02: 'A2.2', adj_03: 'A2.2', adj_05: 'A2.2',

  // B1 — konyunktiv, passiv, relativ, genitiv
  vsub_01: 'B1', vsub_02: 'B1', vsub_03: 'B1', vsub_04: 'B1',
  vpass_01: 'B1', vpass_02: 'B1', vpass_03: 'B1',
  pro_05: 'B1', cas_05: 'B1',
};

/** Bob raqamidan asosiy daraja (spec Q7, birinchi signal). */
export const CHAPTER_LEVEL: Record<number, CefrLevel> = {
  1: 'A1.1', 2: 'A1.1', 3: 'A1.2', 4: 'A1.2', 5: 'A1.2',
  6: 'A2.1', 7: 'A2.1', 8: 'A2.1', 9: 'A2.2', 10: 'A2.2',
};

export const LEVEL_ORDER: CefrLevel[] = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1'];
```

- [ ] **Step 8: Yorliqlagichni yozing**

`server/src/daf-content/level-labeler.ts`:

```ts
import type { CefrLevel, ChapterInfo } from './dataset.types';
import { CHAPTER_LEVEL, GRAMMAR_LEVEL, LEVEL_ORDER } from './grammar-levels';

export interface LevelLabel {
  level: CefrLevel;
  /** Ikki signal bir-biriga qattiq zid kelganda o'qituvchi ko'rigi kerak. */
  needsReview: boolean;
  /** Qaror qanday chiqqani — hisobotda ko'rsatiladi. */
  reason: string;
}

/**
 * Bobning darajasi ikki signaldan hisoblanadi (spec Q7):
 *   1. bob tartibi — muallifning progressiyasi;
 *   2. Focus grammatikasining eng yuqori darajasi.
 * Natija — ikkisining kattarog'i.
 *
 * Recommended grammatika ATAYIN hisobga olinmaydi: u «xohlasangiz qarang»
 * degani va bobning majburiy talabini oshirmaydi.
 */
export function labelChapter(info: ChapterInfo): LevelLabel {
  const base = CHAPTER_LEVEL[info.chapter] ?? 'A1.1';
  const baseIdx = LEVEL_ORDER.indexOf(base);

  let topIdx = baseIdx;
  let topCode = '';
  for (const code of info.grammarFocus) {
    const lvl = GRAMMAR_LEVEL[code];
    if (!lvl) continue;
    const idx = LEVEL_ORDER.indexOf(lvl);
    if (idx > topIdx) {
      topIdx = idx;
      topCode = code;
    }
  }

  const level = LEVEL_ORDER[topIdx];
  const gap = topIdx - baseIdx;

  return {
    level,
    needsReview: gap > 1,
    reason: topCode
      ? `bob ${info.chapter} → ${base}, lekin \`${topCode}\` → ${level}`
      : `bob ${info.chapter} → ${base}`,
  };
}
```

- [ ] **Step 9: Yorliqlagich testini qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/level-labeler.spec.ts`
Expected: PASS — 6 ta test

- [ ] **Step 10: Commit**

```bash
git add server/src/daf-content/dib/dib-chapter.parser.ts \
        server/src/daf-content/dib/dib-chapter.parser.spec.ts \
        server/src/daf-content/grammar-levels.ts \
        server/src/daf-content/level-labeler.ts \
        server/src/daf-content/level-labeler.spec.ts
git commit -m "Daraja bob tartibi va grammatikadan hisoblanadi

LLM taxmini emas: qayta hisoblansa bir xil natija chiqadi va har bir
qarorni tushuntirib berish mumkin. Ikki signal ikki pog'onadan ortiq
farq qilsa, yozuv o'qituvchi ko'rigiga belgilanadi.

Recommended grammatika darajani ko'tarmaydi — u 'xohlasangiz qarang'
degani, bobning majburiy talabi emas."
```

---

### Task 6: ZUM adapteri

MediaWiki API daraja va mavzu toifasini tekin beradi; mashq ma'lumoti esa sahifa ichidagi H5P JSON'da yotadi.

**Files:**
- Create: `server/src/daf-content/zum/zum-client.ts`
- Create: `server/src/daf-content/zum/zum.parser.ts`
- Test: `server/src/daf-content/zum/zum.parser.spec.ts`

**Interfaces:**
- Consumes: `CefrLevel` (Task 1)
- Produces: `ZumPage`, `ZumExercise`, `parseCategoryMembers(json: string): string[]`, `parseWikitext(wikitext: string, title: string): ZumPage`, `parseH5pPage(html: string): ZumExercise | null`, `class ZumClient`

- [ ] **Step 1: Testni yozing**

`server/src/daf-content/zum/zum.parser.spec.ts`:

```ts
import { parseCategoryMembers, parseWikitext, parseH5pPage } from './zum.parser';

const CATEGORY = JSON.stringify({
  query: {
    categorymembers: [
      { ns: 0, title: 'Adjektive - Antonyme - 1 (Interaktive Übungen)' },
      { ns: 14, title: 'Kategorie:Adjektive' },
      { ns: 6, title: 'Datei:CC-by.png' },
    ],
  },
});

const WIKITEXT = `
===== Adjektive - Antonyme| Flash-Karten =====
{{h5p-zum|id=39679|height=850}}
===== Adjektive - Gegensatzpaare | Bild-Paare =====
{{h5p-zum|id=30963|height=700}}
<noinclude>
[[Kategorie:A1]]
[[Kategorie:Adjektive]]
[[Kategorie:Interaktive Übungen]]
</noinclude>`;

const H5P_PAGE = `<html><script type="application/json"
 data-drupal-selector="drupal-settings-json">{"h5p":{"H5PIntegration":{"contents":{
 "cid-39679":{"library":"H5P.Flashcards 1.7","jsonContent":"{\\"cards\\":[{\\"text\\":\\"dick\\"}]}",
 "metadata":{"license":"CC BY 4.0","title":"Antonyme","authors":[{"name":"C Pannen"}]}}}}}}</script></html>`;

describe('parseCategoryMembers', () => {
  it('faqat maqolalarni oladi, toifa va faylni tashlab ketadi', () => {
    expect(parseCategoryMembers(CATEGORY)).toEqual([
      'Adjektive - Antonyme - 1 (Interaktive Übungen)',
    ]);
  });

  it('bo\'sh javobda bo\'sh ro\'yxat', () => {
    expect(parseCategoryMembers('{"query":{"categorymembers":[]}}')).toEqual([]);
  });
});

describe('parseWikitext', () => {
  it('H5P id\'larini va darajani oladi', () => {
    const p = parseWikitext(WIKITEXT, 'Adjektive - Antonyme - 1');
    expect(p.h5pIds).toEqual([39679, 30963]);
    expect(p.level).toBe('A1.1');
  });

  it('mavzu toifalarini oladi, daraja va xizmat toifalarisiz', () => {
    const p = parseWikitext(WIKITEXT, 'Adjektive - Antonyme - 1');
    expect(p.topics).toEqual(['Adjektive']);
  });

  it('darajasi ko\'rsatilmagan sahifa uchun null', () => {
    const p = parseWikitext('{{h5p-zum|id=1}}', 'X');
    expect(p.level).toBeNull();
  });

  it('A2 toifasini A2.1 ga o\'giradi', () => {
    expect(parseWikitext('[[Kategorie:A2]]', 'X').level).toBe('A2.1');
  });
});

describe('parseH5pPage', () => {
  it('mashq turini, mazmunini va litsenziyasini oladi', () => {
    const e = parseH5pPage(H5P_PAGE)!;
    expect(e.h5pId).toBe(39679);
    expect(e.library).toBe('H5P.Flashcards 1.7');
    expect(e.content).toEqual({ cards: [{ text: 'dick' }] });
    expect(e.license).toBe('CC BY 4.0');
    expect(e.attribution).toContain('C Pannen');
  });

  it('H5P ma\'lumoti yo\'q sahifada null', () => {
    expect(parseH5pPage('<html></html>')).toBeNull();
  });

  it('litsenziyasi yo\'q mashqni o\'tkazmaydi', () => {
    const noLic = H5P_PAGE.replace('"license":"CC BY 4.0",', '');
    expect(parseH5pPage(noLic)).toBeNull();
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/zum/zum.parser.spec.ts`
Expected: FAIL — `Cannot find module './zum.parser'`

- [ ] **Step 3: Parserni yozing**

`server/src/daf-content/zum/zum.parser.ts`:

```ts
import type { CefrLevel } from '../dataset.types';

export interface ZumPage {
  title: string;
  h5pIds: number[];
  level: CefrLevel | null;
  topics: string[];
}

export interface ZumExercise {
  h5pId: number;
  /** H5P kutubxona nomi, masalan `H5P.Flashcards 1.7` — mashq turi shu. */
  library: string;
  content: unknown;
  license: string;
  attribution: string;
}

/** ZUM toifasi → bizning daraja. ZUM A1/A2 ni maydalamaydi, biz pastki chekka olamiz. */
const LEVEL_MAP: Record<string, CefrLevel> = {
  A1: 'A1.1',
  A2: 'A2.1',
  B1: 'B1',
};

/** Daraja va xizmat toifalari mavzu emas — ular ro'yxatdan chiqariladi. */
const NOT_A_TOPIC = new Set([
  'A1', 'A2', 'B1', 'B2', 'C1', 'C2',
  'Interaktive Übungen', 'H5P', 'Videos', 'Hilfe',
]);

/** `ns: 0` — maqola. Toifa (14) va fayl (6) kerak emas. */
export function parseCategoryMembers(json: string): string[] {
  const d = JSON.parse(json) as {
    query?: { categorymembers?: { ns: number; title: string }[] };
  };
  return (d.query?.categorymembers ?? [])
    .filter((m) => m.ns === 0)
    .map((m) => m.title);
}

export function parseWikitext(wikitext: string, title: string): ZumPage {
  const h5pIds = [...wikitext.matchAll(/\{\{h5p-zum\|id=(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  const cats = [...wikitext.matchAll(/\[\[Kategorie:([^\]|]+)/g)].map((m) =>
    m[1].trim(),
  );

  const levelCat = cats.find((c) => c in LEVEL_MAP);

  return {
    title,
    h5pIds,
    level: levelCat ? LEVEL_MAP[levelCat] : null,
    topics: cats.filter((c) => !NOT_A_TOPIC.has(c)),
  };
}

/**
 * H5P mashqining mazmuni `apps.zum.de` sahifasining Drupal sozlamalari ichida
 * to'liq JSON bo'lib yotadi (~55 KB).
 *
 * `.h5p` eksporti ham ishlaydi, lekin u ~10 MB — ichida asosan H5P
 * kutubxonalari. 759 mashq uchun bu ~7 GB bekorga; sahifadan o'qish ~50
 * barobar yengil.
 *
 * Litsenziyasi ko'rsatilmagan mashq QAYTARILMAYDI (spec Q9).
 */
export function parseH5pPage(html: string): ZumExercise | null {
  const m = html.match(
    /data-drupal-selector="drupal-settings-json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;

  let settings: any;
  try {
    settings = JSON.parse(m[1]);
  } catch {
    return null;
  }

  const contents = settings?.h5p?.H5PIntegration?.contents;
  if (!contents) return null;

  const [cid, raw] = Object.entries(contents)[0] ?? [];
  if (!cid || !raw) return null;

  const c = raw as {
    library?: string;
    jsonContent?: string;
    metadata?: { license?: string; authors?: { name?: string }[] };
  };

  const license = c.metadata?.license ?? '';
  if (!license.trim()) return null;

  let content: unknown = null;
  try {
    content = JSON.parse(c.jsonContent ?? 'null');
  } catch {
    return null;
  }

  const authors = (c.metadata?.authors ?? [])
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ');

  return {
    h5pId: Number(String(cid).replace('cid-', '')),
    library: c.library ?? '',
    content,
    license,
    attribution: `ZUM Deutsch Lernen${authors ? ` — ${authors}` : ''} — ${license}`,
  };
}
```

- [ ] **Step 4: Testni qayta ishga tushiring**

Run: `cd server && npx jest src/daf-content/zum/zum.parser.spec.ts`
Expected: PASS — 9 ta test

- [ ] **Step 5: ZUM klientini yozing**

`server/src/daf-content/zum/zum-client.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export const ZUM_API = 'https://deutsch-lernen.zum.de/api.php';
export const ZUM_APPS = 'https://apps.zum.de/apps/';

/**
 * ZUM ikkita xostda yashaydi: wiki (`deutsch-lernen.zum.de`) va H5P
 * ilovalari (`apps.zum.de`). Klient ikkalasini ham keshlaydi — sabab
 * `DibClient` dagi bilan bir xil.
 */
export class ZumClient {
  constructor(
    private readonly cacheDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async get(url: string, tag: string): Promise<string> {
    const name = `${tag}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
    const file = join(this.cacheDir, name);
    if (existsSync(file)) return readFileSync(file, 'utf8');

    const res = await this.fetchFn(url, {
      headers: { 'user-agent': 'daf-erp-content-harvest' },
    });
    if (!res.ok) throw new Error(`ZUM javob bermadi (${res.status}): ${url}`);
    const text = await res.text();

    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(file, text, 'utf8');
    return text;
  }

  categoryMembers(category: string): Promise<string> {
    const u = new URL(ZUM_API);
    u.searchParams.set('action', 'query');
    u.searchParams.set('list', 'categorymembers');
    u.searchParams.set('cmtitle', `Kategorie:${category}`);
    u.searchParams.set('cmlimit', '500');
    u.searchParams.set('format', 'json');
    return this.get(u.toString(), 'cat');
  }

  wikitext(title: string): Promise<string> {
    const u = new URL(ZUM_API);
    u.searchParams.set('action', 'parse');
    u.searchParams.set('page', title);
    u.searchParams.set('prop', 'wikitext');
    u.searchParams.set('format', 'json');
    return this.get(u.toString(), 'wt');
  }

  h5pPage(id: number): Promise<string> {
    return this.get(`${ZUM_APPS}${id}`, 'h5p');
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/daf-content/zum/
git commit -m "ZUM mashqlari sahifadan o'qiladi, .h5p eksportidan emas

Eksport fayli ~10 MB va ichida asosan H5P kutubxonalari; 759 mashq
uchun bu ~7 GB bekorga. Sahifa ichidagi JSON esa ~55 KB va aynan
o'sha mazmunni beradi.

Litsenziyasi ko'rsatilmagan mashq o'tkazilmaydi: ZUM sahifalari
CC BY 4.0, lekin ichidagi aktivlar CC0/BY/BY-SA aralash."
```

---

### Task 7: Media manifesti va R2 yuklovchi

**Files:**
- Create: `server/src/daf-content/media/media-manifest.ts`
- Create: `server/src/daf-content/media/r2-uploader.ts`
- Test: `server/src/daf-content/media/media-manifest.spec.ts`
- Test: `server/src/daf-content/media/r2-uploader.spec.ts`

**Interfaces:**
- Consumes: `AssetRef`, `DafDataset` (Task 1)
- Produces: `collectAssets(d: DafDataset): AssetRef[]`, `asciiMetadata(value: string): string`, `class R2Uploader { constructor(deps); uploadMissing(assets: AssetRef[]): Promise<{ uploaded: number; skipped: number; failed: { key: string; reason: string }[] }> }`

- [ ] **Step 1: Manifest testini yozing**

`server/src/daf-content/media/media-manifest.spec.ts`:

```ts
import { collectAssets } from './media-manifest';
import type { AssetRef, DafDataset } from '../dataset.types';

function asset(key: string): AssetRef {
  return {
    sourceUrl: `https://x/${key}`,
    key,
    kind: 'AUDIO',
    license: 'CC BY 4.0',
    attribution: 'COERLL',
  };
}

function dataset(): DafDataset {
  return {
    source: 'DIB',
    harvestedAt: '2026-08-25T00:00:00.000Z',
    license: 'CC BY 4.0',
    attribution: 'COERLL',
    chapters: [],
    sections: [
      { id: 's1', chapter: 1, titleDe: 'a', titleEn: 'a', audio: asset('a.mp3'), entries: [] },
      { id: 's2', chapter: 1, titleDe: 'b', titleEn: 'b', audio: asset('a.mp3'), entries: [] },
      { id: 's3', chapter: 2, titleDe: 'c', titleEn: 'c', audio: null, entries: [] },
    ],
    transcripts: [
      { id: 't1', chapter: 1, titleDe: 'v', linesDe: ['x'], linesEn: [], video: asset('v.mp4') },
    ],
  };
}

describe('collectAssets', () => {
  it('lug\'at va video aktivlarini bir ro\'yxatga yig\'adi', () => {
    expect(collectAssets(dataset()).map((a) => a.key).sort()).toEqual([
      'a.mp3',
      'v.mp4',
    ]);
  });

  it('bir xil kalitni ikki marta qaytarmaydi', () => {
    expect(collectAssets(dataset()).filter((a) => a.key === 'a.mp3')).toHaveLength(1);
  });

  it('aktivi yo\'q bo\'limni o\'tkazib yuboradi', () => {
    expect(collectAssets(dataset()).map((a) => a.key)).not.toContain(null);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/media/media-manifest.spec.ts`
Expected: FAIL — `Cannot find module './media-manifest'`

- [ ] **Step 3: Manifestni yozing**

`server/src/daf-content/media/media-manifest.ts`:

```ts
import type { AssetRef, DafDataset } from '../dataset.types';

/**
 * Dataset ichidagi barcha media havolalarini bitta ro'yxatga yig'adi.
 *
 * Kalit bo'yicha yagonalashtiradi: bir mp3 bir necha bo'limda uchrashi mumkin,
 * lekin R2'ga bir marta chiqadi.
 */
export function collectAssets(d: DafDataset): AssetRef[] {
  const byKey = new Map<string, AssetRef>();

  for (const s of d.sections) {
    if (s.audio) byKey.set(s.audio.key, s.audio);
  }
  for (const t of d.transcripts) {
    if (t.video) byKey.set(t.video.key, t.video);
  }

  return [...byKey.values()];
}
```

- [ ] **Step 4: Yuklovchi testini yozing**

`server/src/daf-content/media/r2-uploader.spec.ts`:

```ts
import { R2Uploader } from './r2-uploader';
import type { AssetRef } from '../dataset.types';

const A: AssetRef = {
  sourceUrl: 'https://x/a.mp3',
  key: 'dib/audio/a.mp3',
  kind: 'AUDIO',
  license: 'CC BY 4.0',
  attribution: 'COERLL',
};

function make(over: { head?: jest.Mock; put?: jest.Mock; fetchFn?: jest.Mock } = {}) {
  const send = jest.fn();
  const s3 = { send } as never;
  const fetchFn =
    over.fetchFn ??
    jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
  return { s3, send, fetchFn, up: new R2Uploader(s3, 'bucket', fetchFn as never) };
}

describe('R2Uploader.uploadMissing', () => {
  it('R2\'da yo\'q faylni yuklaydi', async () => {
    const { up, send, fetchFn } = make();
    send
      .mockRejectedValueOnce({ name: 'NotFound' }) // HeadObject
      .mockResolvedValueOnce({}); // PutObject

    const r = await up.uploadMissing([A]);

    expect(r).toEqual({ uploaded: 1, skipped: 0, failed: [] });
    expect(fetchFn).toHaveBeenCalledWith('https://x/a.mp3');
  });

  it('R2\'da bor faylni qayta yuklamaydi', async () => {
    const { up, send, fetchFn } = make();
    send.mockResolvedValueOnce({ ContentLength: 8 }); // HeadObject topdi

    const r = await up.uploadMissing([A]);

    expect(r).toEqual({ uploaded: 0, skipped: 1, failed: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('manba javob bermasa, boshqa fayllarni to\'xtatmaydi', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const { up, send } = make({ fetchFn });
    send.mockRejectedValue({ name: 'NotFound' });

    const r = await up.uploadMissing([A]);

    expect(r.uploaded).toBe(0);
    expect(r.failed).toEqual(['dib/audio/a.mp3']);
  });

  it('litsenziyani R2 metama\'lumotiga yozadi', async () => {
    const { up, send } = make();
    send.mockRejectedValueOnce({ name: 'NotFound' }).mockResolvedValueOnce({});

    await up.uploadMissing([A]);

    const put = send.mock.calls[1][0];
    expect(put.input.Metadata).toEqual({
      license: 'CC BY 4.0',
      attribution: 'COERLL',
      source: 'https://x/a.mp3',
    });
  });
});
```

- [ ] **Step 5: Testni ishga tushirib, yiqilishiga ishonch hosil qiling**

Run: `cd server && npx jest src/daf-content/media/r2-uploader.spec.ts`
Expected: FAIL — `Cannot find module './r2-uploader'`

- [ ] **Step 6: Yuklovchini yozing**

`server/src/daf-content/media/r2-uploader.ts`:

```ts
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { AssetRef } from '../dataset.types';

const CONTENT_TYPE: Record<AssetRef['kind'], string> = {
  AUDIO: 'audio/mpeg',
  VIDEO: 'video/mp4',
  IMAGE: 'image/jpeg',
  PDF: 'application/pdf',
};

/**
 * Aktivlarni R2'ga chiqaradi. R2 S3-mos, shuning uchun mavjud
 * `@aws-sdk/client-s3` ishlatiladi — yangi paket kerak emas.
 *
 * Idempotent: `HeadObject` bilan tekshiradi va bor faylni qayta yuklamaydi.
 * Buning sababi amaliy — 268 video ≈ 1.27 GB, va quvur uzilib qolsa qaytadan
 * boshidan yuklash soatlab vaqt olardi.
 *
 * Litsenziya va muallif R2 metama'lumotiga yoziladi (spec Q9): aktiv qayerga
 * ko'chirilsa ham, kimning ishi ekani u bilan birga ketadi.
 */
export class R2Uploader {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async uploadMissing(
    assets: AssetRef[],
  ): Promise<{ uploaded: number; skipped: number; failed: string[] }> {
    let uploaded = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const a of assets) {
      if (await this.exists(a.key)) {
        skipped++;
        continue;
      }

      try {
        const res = await this.fetchFn(a.sourceUrl);
        if (!res.ok) {
          failed.push(a.key);
          continue;
        }
        const body = Buffer.from(await res.arrayBuffer());

        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: a.key,
            Body: body,
            ContentType: CONTENT_TYPE[a.kind],
            Metadata: {
              license: a.license,
              attribution: a.attribution,
              source: a.sourceUrl,
            },
          }),
        );
        uploaded++;
      } catch {
        failed.push(a.key);
      }
    }

    return { uploaded, skipped, failed };
  }
}
```

- [ ] **Step 7: Ikkala testni ishga tushiring**

Run: `cd server && npx jest src/daf-content/media/`
Expected: PASS — 7 ta test

- [ ] **Step 8: Commit**

```bash
git add server/src/daf-content/media/
git commit -m "Media R2'ga idempotent chiqadi, litsenziyasi bilan birga

268 video ~1.27 GB. Quvur uzilsa qaytadan boshidan yuklash soatlab
vaqt olardi, shuning uchun HeadObject bilan tekshiriladi.

Litsenziya va muallif R2 metama'lumotiga yoziladi: aktiv qayerga
ko'chirilsa ham, kimning ishi ekani u bilan birga ketadi."
```

---

### Task 8: CLI orkestratsiya va tekshiruv hisoboti

Hamma qismni birlashtiradi va natijani ko'rsatadi. Bu task tugagach, Faza 1 tugaydi.

**Files:**
- Create: `server/scripts/daf-harvest.ts`
- Create: `server/scripts/daf-upload-media.ts`
- Modify: `server/package.json` (`scripts` bo'limi)
- Create: `server/content/daf/.gitkeep`

**Interfaces:**
- Consumes: barcha oldingi tasklar
- Produces: `server/content/daf/dib.json`, `server/content/daf/zum.json`, `server/content/daf/media-manifest.json`

- [ ] **Step 1: Yig'ish skriptini yozing**

`server/scripts/daf-harvest.ts`:

```ts
/**
 * DiB va ZUM kontentini yig'ib, `server/content/daf/` ga yozadi.
 *
 *   npm run daf:harvest
 *
 * Nest kontekstini KO'TARMAYDI (`refresh-videothek.ts` bilan bir sabab):
 * `AppModule` bilan Telegram bot ham ishga tushardi va lokal dev server
 * bilan `getUpdates` ustida to'qnashardi.
 *
 * Tarmoq javoblari `server/.cache/daf/` ga keshlanadi. Manbani qaytadan
 * o'qish kerak bo'lsa, o'sha katalogni o'chiring.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DibClient } from '../src/daf-content/dib/dib-client';
import { parseVocabPage } from '../src/daf-content/dib/dib-vocab.parser';
import {
  parseTranscriptPage,
  parseVideoList,
} from '../src/daf-content/dib/dib-transcript.parser';
import { parseChapterPage } from '../src/daf-content/dib/dib-chapter.parser';
import { labelChapter } from '../src/daf-content/level-labeler';
import { collectAssets } from '../src/daf-content/media/media-manifest';
import { validateDataset } from '../src/daf-content/dataset.validate';
import type { DafDataset } from '../src/daf-content/dataset.types';

const OUT = join(__dirname, '..', 'content', 'daf');
const CACHE = join(__dirname, '..', '.cache', 'daf');
const CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const LICENSE = 'CC BY 4.0';
const ATTRIBUTION =
  'Deutsch im Blick, COERLL, The University of Texas at Austin — CC BY 4.0';

async function harvestDib(): Promise<DafDataset> {
  const client = new DibClient(CACHE);
  const d: DafDataset = {
    source: 'DIB',
    harvestedAt: new Date().toISOString(),
    license: LICENSE,
    attribution: ATTRIBUTION,
    chapters: [],
    sections: [],
    transcripts: [],
  };

  for (const k of CHAPTERS) {
    d.chapters.push(parseChapterPage(await client.fetchText(`toc.php?k=${k}`), k));
    d.sections.push(...parseVocabPage(await client.fetchText(`voc.php?k=${k}`), k));

    const videos = parseVideoList(await client.fetchText(`rss.php?k=${k}&a=mp4`));
    for (const v of videos) {
      const page = await client.fetchText(`vidt.php?f=${v.fileId}`);
      const t = parseTranscriptPage(page, v.fileId, k);
      if (t) d.transcripts.push(t);
    }
    process.stdout.write(`  bob ${k}: tayyor\n`);
  }

  return d;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log('DiB yig\'ilmoqda...');
  const dib = await harvestDib();

  const errors = validateDataset(dib);
  if (errors.length > 0) {
    console.error(`\nDataset ${errors.length} ta muammo bilan chiqdi:`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(join(OUT, 'dib.json'), JSON.stringify(dib, null, 2), 'utf8');
  writeFileSync(
    join(OUT, 'media-manifest.json'),
    JSON.stringify(collectAssets(dib), null, 2),
    'utf8',
  );

  console.log('\n=== Hisobot ===');
  console.log(`Bo'limlar:    ${dib.sections.length}`);
  console.log(
    `Lug'at:       ${dib.sections.reduce((n, s) => n + s.entries.length, 0)}`,
  );
  console.log(`Transkript:   ${dib.transcripts.length}`);
  console.log(`Media aktiv:  ${collectAssets(dib).length}`);

  console.log('\nDaraja bo\'yicha boblar:');
  for (const c of dib.chapters) {
    const l = labelChapter(c);
    const mark = l.needsReview ? '  ⚠ ko\'rik kerak' : '';
    console.log(`  bob ${String(c.chapter).padStart(2)}  ${l.level}  ${l.reason}${mark}`);
  }

  if (dib.transcripts.length < 200) {
    console.error(
      `\nDIQQAT: ${dib.transcripts.length} ta transkript — kutilgani ~268. Manba o'zgardimi?`,
    );
    process.exitCode = 1;
  }
}

void main();
```

- [ ] **Step 2: Media yuklash skriptini yozing**

`server/scripts/daf-upload-media.ts`:

```ts
/**
 * Manifestdagi media fayllarni Cloudflare R2'ga chiqaradi.
 *
 *   npm run daf:upload-media
 *
 * Avval `npm run daf:harvest` ishga tushirilgan bo'lishi kerak — manifest
 * o'shanda yoziladi.
 *
 * Idempotent: R2'da bor fayl qayta yuklanmaydi, ya'ni skriptni xotirjam
 * qayta ishga tushirsa bo'ladi.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import type { AssetRef } from '../src/daf-content/dataset.types';

const MANIFEST = join(__dirname, '..', 'content', 'daf', 'media-manifest.json');

const REQUIRED = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
];

async function main() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`R2 sozlanmagan. Yetishmayotgan: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const assets = JSON.parse(readFileSync(MANIFEST, 'utf8')) as AssetRef[];
  console.log(`Manifestda ${assets.length} ta aktiv.`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const uploader = new R2Uploader(s3, process.env.R2_BUCKET!);
  const r = await uploader.uploadMissing(assets);

  console.log(`\nYuklandi: ${r.uploaded}   O'tkazildi: ${r.skipped}`);
  if (r.failed.length > 0) {
    console.error(`Yiqildi: ${r.failed.length}`);
    for (const f of r.failed.slice(0, 20)) {
      console.error(`  - ${f.key}: ${f.reason}`);
    }
    process.exitCode = 1;
  }
}

void main();
```

- [ ] **Step 3: npm skriptlarini qo'shing**

`server/package.json` ning `scripts` bo'limiga, `videothek:refresh` yonidagi qatorlar orasiga:

```json
    "daf:harvest": "ts-node scripts/daf-harvest.ts",
    "daf:upload-media": "ts-node scripts/daf-upload-media.ts",
```

- [ ] **Step 4: Chiqish katalogini yarating**

```bash
mkdir -p server/content/daf && touch server/content/daf/.gitkeep
```

- [ ] **Step 5: Butun test to'plamini ishga tushiring**

Run: `cd server && npx jest src/daf-content/`
Expected: PASS — 9 ta spec fayli, 49 ta test

- [ ] **Step 6: Tipni tekshiring**

Run: `cd server && npm run typecheck`
Expected: xatosiz

- [ ] **Step 7: Yig'ishni haqiqiy manbada ishga tushiring**

Run: `cd server && npm run daf:harvest`

Expected:
```
Bo'limlar:    94
Lug'at:       ~1850
Transkript:   ~268
Media aktiv:  ~360
```

> **Lug'at soni haqida.** Boshida ~1948 deb hisoblangan edi, lekin u XOM
> qatorlar soni: manbaning o'zida har jadval oxirida bo'sh to'ldiruvchi
> qatorlar bor. Task 3 ni haqiqiy sahifada o'lchaganda 1-bobda 238 xom qator
> 226 ta haqiqiy yozuv bergan. Shuning uchun kutilgan yakuniy son ~1850.

Agar transkript soni 200 dan kam chiqsa, skript `exitCode = 1` bilan tugaydi — manba o'zgargan, parserni tekshirish kerak.

- [ ] **Step 8: Commit**

```bash
git add server/scripts/daf-harvest.ts \
        server/scripts/daf-upload-media.ts \
        server/package.json \
        server/content/daf/
git commit -m "Yig'ish quvuri bitta buyruqqa yig'ildi

Skript o'zini tekshiradi: dataset validatordan o'tmasa yoki transkript
soni kutilganidan keskin kam chiqsa, nolga teng bo'lmagan kod bilan
tugaydi. Manba jimgina o'zgarib, biz yarim dataset bilan davom etib
ketishimizning oldini oladi.

R2 sozlanmagan bo'lsa yuklash skripti nimani qo'yish kerakligini
aytib to'xtaydi — yarim yuklangan holat qolmaydi."
```

---

## Bajarilgandan keyin

Faza 1 tugadi. Natija:

- `server/content/daf/dib.json` — git'da, ko'rib chiqiladigan dataset
- `server/content/daf/media-manifest.json` — litsenziyasi bilan aktivlar ro'yxati
- R2'da ~1.36 GB media, har biri litsenziya metama'lumoti bilan

### Spec'dan ataylab chetlashish — tarjima

Spec'ning 6-bo'limi Faza 1 ga **o'zbekcha tarjimani** ham kiritgan
(«tarjima, tasdiqlanmagan holatda»). Bu rejada u **yo'q**, va sababi ikkita:

1. Tarjima `ANTHROPIC_API_KEY` ni talab qiladi, u esa hali Railway'ga
   qo'yilmagan. Rejaning har bir taski **bugun ishga tushirilishi** kerak.
2. Tarjimaning `REVIEW` holati — bu baza tushunchasi (spec 3.2 `status`).
   JSON'da yasab, keyin bazaga ko'chirish — o'sha ishni ikki marta qilish.

Shuning uchun tarjima **Faza 2 ga**, `Daf*` modellari bilan birga ko'chdi.
Bu qaror spec'ni o'zgartiradi — Faza 2 ni yozishdan oldin spec'ning 6-bo'limi
shunga moslanishi kerak.

**Faza 1 ga ATAYIN kirmagan** (spec bo'yicha keyingi fazalarda):

- Prisma `Daf*` modellari va seed — Faza 2
- O'zbekcha tarjima — Faza 2 ga ko'chdi (yuqoridagi izohga qarang)
- ZUM'ning to'liq yig'ilishi — bu rejada adapter va parser yozildi, lekin 759 mashqni yig'ish CLI'si Faza 2 da, chunki mashq modeli hali yo'q
- Grammatika sahifalari va talaffuz audiosi — Faza 2
- Mashq dvigateli, AI baholash — Faza 3–5
