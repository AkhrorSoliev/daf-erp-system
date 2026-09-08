# 1-unit ovozi va rasmi — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A1 1-unitining 53 so'ziga ovoz yasash va ikkita eshitish mashqini
(`AUDIO_WORT`, `WORT_TIPPEN`) ishga tushirish; yo'l-yo'lakay rasm quvuridagi
«harf chizilmaydi» teshigini yopish va sifat namunasi uchun rasm yasash.

**Architecture:** Audio fayllar R2 da yashaydi, ularga **tasodifiy** kalit
bilan murojaat qilinadi (kalit so'zdan hisoblanmaydi — aks holda javob
manzilda oshkor bo'lardi). Kalit `content/daf/a1/audio.json` manifestida
saqlanadi va u yerdan `DafLexeme.audioKey` ga seed qilinadi. Savol quruvchi
`audioKey` bo'lgan so'zdangina audio savol quradi, ya'ni audio yo'q bo'lsa
formatlar o'z-o'zidan o'chiq turadi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), Next.js App Router, fal.ai
(`FalClient`), Cloudflare R2 (`R2Uploader`), jest (server), vitest (client).

## Global Constraints

- Barcha sharh va foydalanuvchiga ko'rinadigan matn **lotin alifbosidagi
  o'zbekcha**. Kirill va arab harfi qat'iy taqiqlanadi — commit qilishdan
  oldin o'zgargan fayllarni grep qiling.
- Sharh **NEGA** ekanini tushuntiradi, nima qilinayotganini emas.
- Mijozda testlar **faqat sof mantiq** — vitest, komponent render qilinmaydi.
  `@testing-library` qo'shilmaydi.
- Server testlari jest. `npm test` **tip tekshirmaydi** — har vazifada
  `npm run typecheck` alohida yuritiladi.
- `server/node_modules` asosiy repo bilan umumiy (simvolik havola), ya'ni
  Prisma mijozi ikkala shox uchun bitta. **Birinchi server testidan oldin
  `cd server && npx prisma generate`.**
- **Sxema o'zgarmaydi.** `DafLexeme.audioKey` allaqachon mavjud. Agar
  migratsiya kerak deb hisoblasangiz — TO'XTANG va NEEDS_CONTEXT xabar qiling.
- **Yangi API route qo'shilmaydi** — audio R2 dan to'g'ridan-to'g'ri
  uzatiladi. `branch-route-policy.ts` manifestiga tegilmaydi.
- **Pullik chaqiruv qiladigan vazifalarda (6, 7, 9) skript yoziladi va
  TESTLANADI, lekin CHAQIRILMAYDI.** Haqiqiy chaqiruvni CEO ruxsati bilan
  koordinator qiladi. Ruxsat **faqat 1-unitga** berilgan.

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
| --- | --- |
| `server/src/daf/media/audio-keys.ts` | **Yangi.** Tasodifiy audio kaliti, manifest tipi va o'qish |
| `server/src/daf/media/picturable.ts` | Mavjud. `isNeverPicturable` ga harf qoidasi qo'shiladi |
| `server/src/daf/media/fal-client.ts` | Mavjud. ElevenLabs metodi qo'shiladi |
| `server/src/daf/uebung/frage.types.ts` | Mavjud. `FrageFormat` +2, `MaterialWort.audioKey`, `Frage.audioUrl` |
| `server/src/daf/uebung/wort-fragen.ts` | Mavjud. `audioWort`, `wortTippen` quruvchilari |
| `server/src/daf/uebung/kind-formate.ts` | Mavjud. Seans turi moyilligi |
| `server/src/daf/inhalt/inhalt-seed.service.ts` | Mavjud. Manifestdan `audioKey` |
| `server/scripts/daf-gen-audio.ts` | **Yangi.** 53 so'z audiosi |
| `server/scripts/daf-voice-samples.ts` | **Yangi.** 3 variant × 5 so'z namunasi |
| `client/.../lernen/uebung/koersatma.ts` | Mavjud. Ko'rsatma matni va render rejimi |
| `client/.../lernen/uebung/ovoz-tugmasi.tsx` | **Yangi.** Karnay tugmasi + avtomatik qo'yish |

---

## Task 1: Audio kaliti va manifest

**Files:**
- Create: `server/src/daf/media/audio-keys.ts`
- Test: `server/src/daf/media/audio-keys.spec.ts`

**Interfaces:**
- Produces: `neuerAudioSchluessel(): string`, `type AudioManifest = Record<string, string>`, `audioSchluesselFuer(manifest: AudioManifest, sourceId: string): string | null`

- [ ] **Step 1: Failing testni yozing**

`server/src/daf/media/audio-keys.spec.ts`:

```ts
import { createHash } from 'crypto';
import {
  neuerAudioSchluessel,
  audioSchluesselFuer,
  type AudioManifest,
} from './audio-keys';

describe('neuerAudioSchluessel', () => {
  it('R2 manzilida xavfsiz shaklda va .mp3 bilan tugaydi', () => {
    const k = neuerAudioSchluessel();
    expect(k).toMatch(/^daf\/audio\/[a-f0-9]{32}\.mp3$/);
  });

  it('har chaqiruvda BOSHQA kalit qaytaradi', () => {
    const kalitlar = new Set(Array.from({ length: 200 }, neuerAudioSchluessel));
    expect(kalitlar.size).toBe(200);
  });

  /**
   * BU TESTNING BUTUN MAZMUNI — TRIPWIRE.
   *
   * `AUDIO_WORT`da ekranda 4 ta variant turadi va o'quvchi ovozni
   * eshitib birini tanlaydi. Kalit so'zdan HISOBLANSA (to'g'ridan-to'g'ri
   * ham, xesh orqali ham), o'quvchi har variantni o'sha usul bilan
   * hisoblab, audio manzili bilan solishtirib to'g'ri javobni topardi —
   * eshitmasdan.
   *
   * Shuning uchun kalit so'z bilan HECH QANDAY hisoblanadigan
   * bog'liqlikka ega bo'lmasligi kerak. Test buni eng ehtimolli uch
   * ko'rinishda tekshiradi.
   */
  it('kalit so`zdan ham, sourceId dan ham, ularning xeshidan ham hosil qilinmaydi', () => {
    const de = 'hallo';
    const sourceId = 'u01-s1-hallo';
    const k = neuerAudioSchluessel();

    expect(k).not.toContain(de);
    expect(k).not.toContain(sourceId);
    for (const manba of [de, sourceId]) {
      const md5 = createHash('md5').update(manba).digest('hex');
      const sha = createHash('sha256').update(manba).digest('hex');
      expect(k).not.toContain(md5);
      expect(k).not.toContain(sha.slice(0, 32));
    }
  });
});

describe('audioSchluesselFuer', () => {
  const manifest: AudioManifest = { 'u01-s1-hallo': 'daf/audio/abc.mp3' };

  it('manifestdagi kalitni qaytaradi', () => {
    expect(audioSchluesselFuer(manifest, 'u01-s1-hallo')).toBe('daf/audio/abc.mp3');
  });

  it('manifestda yo`q so`zga null qaytaradi', () => {
    // Audio hali yasalmagan so'z — bu XATO EMAS, oddiy holat: audio
    // bosqichma-bosqich yasaladi va audiosi yo'q so'zga audio savol
    // qurilmaydi.
    expect(audioSchluesselFuer(manifest, 'u01-s4-eins')).toBeNull();
  });
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx prisma generate && npx jest src/daf/media/audio-keys.spec.ts
```
Kutilgan: `Cannot find module './audio-keys'`

- [ ] **Step 3: Amalga oshiring**

`server/src/daf/media/audio-keys.ts`:

```ts
import { randomBytes } from 'crypto';

/**
 * Audio fayl kaliti — R2 dagi manzilning bir qismi.
 *
 * NEGA TASODIFIY, `media-keys.ts` dagi rasm kaliti kabi `sourceId` dan
 * EMAS. Rasm kaliti `u01-s1-hallo` → `daf/img/u01-s1-hallo.jpg` bo'lib
 * yasaladi va bu XAVFSIZ, chunki `BILD_WORT` da so'z SAVOL, rasm esa
 * javob — manzilda so'z turishi hech narsani ochmaydi.
 *
 * Audio buning TESKARISI: `AUDIO_WORT` va `WORT_TIPPEN` da so'z
 * javobning O'ZI. O'sha sxema to'g'ri javobni manzilda yozib berardi.
 *
 * Xesh ham yordam bermaydi: `AUDIO_WORT` da 4 ta variant ekranda
 * ko'rinib turadi, ya'ni har birini xeshlab manzil bilan solishtirish
 * yetarli. Shuning uchun kalit so'z bilan hech qanday hisoblanadigan
 * bog'liqlikka ega emas — u sof tasodif.
 *
 * Kalit MANIFESTDA saqlanadi (`content/daf/a1/audio.json`), chunki
 * hisoblab topib bo'lmaydi. Saqlanmasa, skriptni qayta yuritish har
 * safar yangi fayl yasab, eskisini R2 da yetim qoldirardi.
 */
export function neuerAudioSchluessel(): string {
  return `daf/audio/${randomBytes(16).toString('hex')}.mp3`;
}

/** `sourceId` → R2 kaliti. Kontentda saqlanadi, git'ga chiqadi. */
export type AudioManifest = Record<string, string>;

/**
 * Manifestdan bitta so'zning kalitini oladi.
 *
 * `null` — audio hali yasalmagan. Bu XATO EMAS: audio bosqichma-bosqich
 * yasaladi (avval 1-unit, keyin qolgani), va audiosi yo'q so'zga audio
 * savol qurilmaydi.
 */
export function audioSchluesselFuer(
  manifest: AudioManifest,
  sourceId: string,
): string | null {
  return manifest[sourceId] ?? null;
}
```

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/media/audio-keys.spec.ts
```
Kutilgan: PASS (5 test)

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src/daf/media/audio-keys.ts server/src/daf/media/audio-keys.spec.ts
git commit -m "Audio kaliti tasodifiy — so'zdan hisoblanmaydi"
```

---

## Task 2: Manifestdan `DafLexeme.audioKey` ga seed

**Files:**
- Modify: `server/src/daf/inhalt/inhalt-seed.service.ts` (lexeme `data` obyekti, ~124-148-qatorlar)
- Test: `server/src/daf/inhalt/inhalt-seed.service.spec.ts`

**Interfaces:**
- Consumes: `AudioManifest`, `audioSchluesselFuer` (Task 1)

- [ ] **Step 1: Failing testni yozing**

`inhalt-seed.service.spec.ts` ichiga qo'shing (mavjud `describe` ichiga):

```ts
it('manifestdagi audio kalitini lexemega yozadi', async () => {
  const { prisma, calls } = fakeSeedPrisma();
  await seedWith(prisma, {
    woerter: [{ sourceId: 'u01-s1-hallo', section: 'u01-s1', de: 'hallo', uz: 'salom', core: true, order: 1 }],
    audio: { 'u01-s1-hallo': 'daf/audio/abc.mp3' },
  });
  const yozilgan = calls.find((c) => c[0].where.sourceId === 'u01-s1-hallo')[0];
  expect(yozilgan.create.audioKey).toBe('daf/audio/abc.mp3');
  expect(yozilgan.update.audioKey).toBe('daf/audio/abc.mp3');
});

it('manifestda yo`q so`zning audioKey ini null qiladi', async () => {
  // ATAYLAB `null`, «tegmaslik» EMAS. Manifest — manba: undan kalit
  // olib tashlangan bo'lsa (masalan fayl buzuq chiqib qayta yasalgan),
  // bazada eski kalit qolib ketmasligi kerak — aks holda R2 da yo'q
  // faylga ishora qiladigan so'zdan audio savol qurilardi va o'quvchi
  // yangramaydigan tugmani ko'rardi.
  const { prisma, calls } = fakeSeedPrisma();
  await seedWith(prisma, {
    woerter: [{ sourceId: 'u01-s4-eins', section: 'u01-s4', de: 'eins', uz: 'bir', core: true, order: 1 }],
    audio: {},
  });
  const yozilgan = calls.find((c) => c[0].where.sourceId === 'u01-s4-eins')[0];
  expect(yozilgan.update.audioKey).toBeNull();
});
```

`fakeSeedPrisma` va `seedWith` — faylda mavjud yordamchilar; `audio`
maydonini qabul qilish uchun `seedWith` ni kengaytiring (manifest fayli
o'qilishini taqlid qiling, `audio.json` bo'lmasa `{}`).

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx jest src/daf/inhalt/inhalt-seed.service.spec.ts
```
Kutilgan: FAIL — `audioKey` `undefined`

- [ ] **Step 3: Amalga oshiring**

`inhalt-seed.service.ts` da manifestni o'qing (mavjud `files` o'qish
naqshiga ergashing; fayl `content/daf/a1/audio.json`, bo'lmasa `{}`) va
`data` obyektiga qo'shing:

```ts
        core: w.core,
        // Manifest MANBA: undan kalit olib tashlangan bo'lsa bazadagi
        // eskisi ham o'chadi (`null`). «Tegmaslik» tanlansa, R2 da
        // endi yo'q faylga ishora qiladigan so'z qolib, o'quvchi
        // yangramaydigan tugmani ko'rardi.
        audioKey: audioSchluesselFuer(audioManifest, w.sourceId),
```

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/inhalt/inhalt-seed.service.spec.ts
```
Kutilgan: PASS

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src/daf/inhalt/
git commit -m "Seed audio kalitini manifestdan oladi"
```

---

## Task 3: Dvigatel — `AUDIO_WORT` va `WORT_TIPPEN`

**Files:**
- Modify: `server/src/daf/uebung/frage.types.ts`
- Modify: `server/src/daf/uebung/wort-fragen.ts`
- Modify: `server/src/daf/uebung/kind-formate.ts`
- Test: `server/src/daf/uebung/wort-fragen.spec.ts`

**Interfaces:**
- Produces: `audioWort(ziel, andere, rnd): Frage | null`, `wortTippen(ziel, rnd): Frage | null`; `MaterialWort.audioKey: string | null`; `Frage.audioUrl: string | null`; `PublicFrage.audioUrl: string | null`

- [ ] **Step 1: Failing testni yozing**

`wort-fragen.spec.ts` ga qo'shing:

```ts
const mitAudio = (id: number, de: string, uz: string): MaterialWort => ({
  id, de, uz, artikel: null, anzeige: null, sectionCode: 'u01-s1',
  audioKey: `daf/audio/${id}.mp3`,
});
const ohneAudio = (id: number, de: string, uz: string): MaterialWort => ({
  ...mitAudio(id, de, uz), audioKey: null,
});

describe('audioWort', () => {
  it('promptda so`z YO`Q — javob faqat ovozda', () => {
    // `prompt` mijozga ketadi. Unda so'z tursa, savol eshitishni emas,
    // o'qishni tekshirardi.
    const ziel = mitAudio(1, 'hallo', 'salom');
    const f = audioWort(ziel, [mitAudio(2,'danke','rahmat'), mitAudio(3,'wer','kim'), mitAudio(4,'was','nima')], () => 0.5);
    expect(f).not.toBeNull();
    expect(f!.prompt).toBe('');
    expect(f!.audioUrl).toBe('daf/audio/1.mp3');
    expect(f!.options).toHaveLength(4);
    expect(f!.options).toContain('hallo');
    expect(f!.richtig).toBe('hallo');
  });

  it('audiosi yo`q so`zga savol qurilmaydi', () => {
    const ziel = ohneAudio(1, 'hallo', 'salom');
    expect(audioWort(ziel, [mitAudio(2,'danke','rahmat'), mitAudio(3,'wer','kim'), mitAudio(4,'was','nima')], () => 0.5)).toBeNull();
  });

  it('chalg`ituvchi yetmasa null', () => {
    expect(audioWort(mitAudio(1,'hallo','salom'), [mitAudio(2,'danke','rahmat')], () => 0.5)).toBeNull();
  });
});

describe('wortTippen', () => {
  it('promptda so`z YO`Q va variant berilmaydi', () => {
    const f = wortTippen(mitAudio(1, 'tschüss', 'xayr'), () => 0.5);
    expect(f).not.toBeNull();
    expect(f!.prompt).toBe('');
    expect(f!.options).toEqual([]);
    expect(f!.audioUrl).toBe('daf/audio/1.mp3');
    expect(f!.richtig).toBe('tschüss');
  });

  it('audiosi yo`q so`zga savol qurilmaydi', () => {
    expect(wortTippen(ohneAudio(1, 'tschüss', 'xayr'), () => 0.5)).toBeNull();
  });
});
```

`toPublic` testiga qo'shing:

```ts
it('audioUrl mijozga uzatiladi', () => {
  const f: Frage = { format: 'AUDIO_WORT', itemType: 'WORT', itemId: 1, prompt: '', hilfe: null, options: ['a','b','c','d'], richtig: 'a', akzeptiert: [], audioUrl: 'daf/audio/x.mp3', belegteItems: ['WORT:1'] };
  expect(toPublic(f, 0).audioUrl).toBe('daf/audio/x.mp3');
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx jest src/daf/uebung/wort-fragen.spec.ts
```
Kutilgan: FAIL — `audioWort is not a function`

- [ ] **Step 3: Amalga oshiring**

`frage.types.ts`:

```ts
export type FrageFormat =
  | 'WORT_UZ'
  | 'UZ_WORT'
  | 'PAAR'
  | 'ARTIKEL'
  | 'LUECKE'
  | 'SATZ_BAUEN'
  | 'SATZ_UEBERSETZEN'
  | 'REAKTION'
  | 'ZUORDNEN'
  | 'DIALOG_LUECKE'
  | 'AUDIO_WORT'
  | 'WORT_TIPPEN';
```

`MaterialWort` ga:

```ts
  /** R2 kaliti; `null` — audio hali yasalmagan, audio savol qurilmaydi. */
  audioKey: string | null;
```

`Frage` va `PublicFrage` ga:

```ts
  /**
   * Audio formatlarda savolning O'ZI shu manzilda; qolganida `null`.
   *
   * `prompt` audio formatlarda ATAYLAB bo'sh: unda so'z tursa, savol
   * eshitishni emas, o'qishni tekshirardi.
   */
  audioUrl: string | null;
```

`toPublic` ga `audioUrl: f.audioUrl` qo'shing. Boshqa quruvchilarda
`audioUrl: null` yozing (TypeScript ularni majburlaydi).

`wort-fragen.ts` ga:

```ts
export function audioWort(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): Frage | null {
  // Audiosi yo'q so'zga bu savol qurilmaydi. Shu qorovul tufayli
  // formatni «yoqish» bayrog'i kerak emas: audio yasalmagan bo'lsa
  // format o'z-o'zidan ishlamaydi.
  if (!ziel.audioKey) return null;
  const falsch = ablenker(ziel, andere, (w) => w.de, rnd);
  if (!falsch) return null;
  return {
    format: 'AUDIO_WORT',
    itemType: 'WORT',
    itemId: ziel.id,
    // BO'SH: so'z javobning o'zi, uni ko'rsatish savolni yo'q qilardi.
    prompt: '',
    hilfe: null,
    options: mischen([ziel.de, ...falsch], rnd),
    richtig: ziel.de,
    akzeptiert: [],
    audioUrl: ziel.audioKey,
    belegteItems: [materialSchluessel('WORT', ziel.id)],
  };
}

export function wortTippen(
  ziel: MaterialWort,
  _rnd: () => number,
): Frage | null {
  if (!ziel.audioKey) return null;
  return {
    format: 'WORT_TIPPEN',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: '',
    hilfe: null,
    // Variant YO'Q: o'quvchi eshitib yozadi. Javobni `istRichtig`
    // tekshiradi va u umlautsiz yozuvni ham qabul qiladi.
    options: [],
    richtig: ziel.de,
    akzeptiert: [],
    audioUrl: ziel.audioKey,
    belegteItems: [materialSchluessel('WORT', ziel.id)],
  };
}
```

`kind-formate.ts` `XARITA` ni yangilang:

```ts
  SECTION_A: ['WORT_UZ', 'PAAR', 'ZUORDNEN', 'AUDIO_WORT'],
  SECTION_B: ['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN', 'WORT_TIPPEN'],
```

Savol quruvchi ro'yxatiga (`seans.ts` nomzod yig'ish joyi) ikkalasini
qo'shing va `MaterialWort` o'qiladigan joyda `audioKey` ni tanlang.

- [ ] **Step 4: Testlarni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/uebung/
```
Kutilgan: PASS

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src/daf/uebung/
git commit -m "Ikki eshitish formati: AUDIO_WORT va WORT_TIPPEN"
```

---

## Task 4: Mijoz — ovoz tugmasi va avtomatik qo'yish

**Files:**
- Create: `client/src/components/student-portal/lernen/uebung/ovoz-tugmasi.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/koersatma.ts`
- Modify: `client/src/components/student-portal/lernen/types.ts` (`FrageFormat`, `PublicFrage.audioUrl`)
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`
- Test: `client/src/components/student-portal/lernen/uebung/koersatma.test.ts`

**Interfaces:**
- Consumes: `PublicFrage.audioUrl` (Task 3)
- Produces: `<OvozTugmasi url={string} />`

- [ ] **Step 1: Failing testni yozing**

`koersatma.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { harakat, koersatma } from "./koersatma";

describe("audio formatlar", () => {
  it("AUDIO_WORT variant tanlash bilan ko'rsatiladi", () => {
    expect(harakat("AUDIO_WORT")).toBe("TANLASH");
  });

  it("WORT_TIPPEN yozish bilan ko'rsatiladi", () => {
    // Eshitib YOZISH — variant berilmaydi, aks holda mashq
    // eshitishni emas, tanishni tekshirardi.
    expect(harakat("WORT_TIPPEN")).toBe("YOZISH");
  });

  it("ikkalasining ko'rsatmasi bor va bo'sh emas", () => {
    // `MATN` — `Record<FrageFormat, string>`, ya'ni yangi format
    // qo'shilganda TypeScript yozuvni majburlaydi. Bu test bo'sh
    // satr bilan «to'ldirib qo'yish» yo'lini yopadi.
    expect(koersatma("AUDIO_WORT").length).toBeGreaterThan(0);
    expect(koersatma("WORT_TIPPEN").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd client && npx vitest run src/components/student-portal/lernen/uebung/koersatma.test.ts
```
Kutilgan: FAIL — `WORT_TIPPEN` uchun `"TANLASH"` qaytadi

- [ ] **Step 3: Amalga oshiring**

`types.ts` da `FrageFormat` ga ikkala formatni va `PublicFrage` ga
`audioUrl: string | null` qo'shing.

`koersatma.ts`:

```ts
  AUDIO_WORT: "Eshiting va to'g'ri so'zni tanlang",
  WORT_TIPPEN: "Eshiting va so'zni yozing",
```

```ts
export function harakat(format: FrageFormat): "TANLASH" | "YOZISH" | "YIGISH" {
  if (format === "LUECKE" || format === "WORT_TIPPEN") return "YOZISH";
  if (format === "SATZ_BAUEN" || format === "PAAR" || format === "ZUORDNEN") return "YIGISH";
  return "TANLASH";
}
```

`ovoz-tugmasi.tsx`:

```tsx
"use client";

import * as React from "react";
import { SpeakerHigh, ArrowClockwise } from "@phosphor-icons/react";

/**
 * Savolning ovozi — karnay tugmasi.
 *
 * TO'LIQ PLEYER EMAS (seyk bar, vaqt, pauza yo'q): so'z audiosi bir
 * soniyalik, ularning hammasi shovqin bo'lardi.
 *
 * AVTOMATIK QO'YISH ISHLAYDI: brauzer sahifa bilan muloqot bo'lmaguncha
 * ovozga ruxsat bermaydi, lekin o'quvchi seansni tugma bosib ochadi —
 * birinchi savol chiqqanda muloqot allaqachon bo'lgan. Shunga qaramay
 * `catch` bor: ruxsat berilmasa tugma qoladi va o'quvchi o'zi bosadi.
 *
 * CHEKSIZ QAYTA ESHITISH — A1 darajasida takror eshitish o'rganishning
 * bir qismi; chegaralash jazoga aylanardi.
 */
export function OvozTugmasi({ url }: { url: string }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [xato, setXato] = React.useState(false);

  const qoy = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setXato(false);
    a.currentTime = 0;
    void a.play().catch(() => setXato(true));
  }, []);

  // Savol almashganda (`url` o'zgaradi) o'zi yangraydi.
  React.useEffect(() => { qoy(); }, [url, qoy]);

  return (
    <div className="flex flex-col items-center gap-2">
      <audio ref={audioRef} src={url} preload="auto" onError={() => setXato(true)} />
      <button
        type="button"
        onClick={qoy}
        aria-label={xato ? "Ovozni qayta yuklash" : "Ovozni eshitish"}
        className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 motion-reduce:transition-none"
      >
        {xato ? <ArrowClockwise size={36} weight="bold" /> : <SpeakerHigh size={36} weight="fill" />}
      </button>
      {xato ? (
        // Savol O'TKAZILMAYDI va ball yo'qotilmaydi — tarmoq muammosi
        // o'quvchining bilimi emas.
        <p className="text-sm text-muted-foreground">Ovoz yuklanmadi — qayta urinib ko&apos;ring</p>
      ) : null}
    </div>
  );
}
```

`seans-ekrani.tsx` da savol matni ustida, `frage.audioUrl` bo'lsa
`<OvozTugmasi url={frage.audioUrl} />` ni ko'rsating.

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

```
cd client && npx vitest run src/components/student-portal/lernen/uebung/koersatma.test.ts
```
Kutilgan: PASS

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd client && npm test && npx tsc --noEmit && npm run lint && npm run build
git add client/src
git commit -m "Mijozda ovoz tugmasi va avtomatik qo'yish"
```

---

## Task 5: `FalClient` da ElevenLabs metodi

**Files:**
- Modify: `server/src/daf/media/fal-client.ts`
- Test: `server/src/daf/media/fal-client.spec.ts`

**Interfaces:**
- Produces: `FalClient.speechMitStimme(text: string, stimme: string): Promise<string>`

- [ ] **Step 1: Failing testni yozing**

```ts
it('ElevenLabs modelini ovoz nomi bilan chaqiradi', async () => {
  const fetchFn = jest.fn(async () => ({
    ok: true, json: async () => ({ audio: { url: 'https://x/y.mp3' } }),
  })) as any;
  const c = new FalClient('kalit', fetchFn);
  const url = await c.speechMitStimme('hallo', 'Rachel');
  expect(url).toBe('https://x/y.mp3');
  const [manzil, opts] = fetchFn.mock.calls[0];
  expect(manzil).toContain('elevenlabs');
  const body = JSON.parse(opts.body);
  expect(body.text).toBe('hallo');
  expect(body.voice).toBe('Rachel');
});

it('mavjud speech() Chatterbox`da qoladi', async () => {
  // Namunada uchinchi variant sifatida kerak — o'zgartirilmaydi.
  const fetchFn = jest.fn(async () => ({
    ok: true, json: async () => ({ audio: { url: 'https://x/c.mp3' } }),
  })) as any;
  await new FalClient('kalit', fetchFn).speech('hallo');
  expect(fetchFn.mock.calls[0][0]).toContain('chatterbox');
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx jest src/daf/media/fal-client.spec.ts
```
Kutilgan: FAIL — `speechMitStimme is not a function`

- [ ] **Step 3: Amalga oshiring**

```ts
const TTS_ELEVEN_MODEL = 'fal-ai/elevenlabs/tts/turbo-v2.5';
```

```ts
  /**
   * ElevenLabs ovozi bilan nutq.
   *
   * NEGA MAVJUD `speech()` YETMAYDI: u Chatterbox'ga qattiq bog'langan
   * va ovoz tanlash parametri yo'q. `personas.json` esa ElevenLabs
   * ovozlarini yozib qo'ygan (Rachel, Matilda, ...). Ikkalasi ham
   * namunada solishtiruv tomoni sifatida kerak, shuning uchun
   * `speech()` O'ZGARTIRILMAYDI — yangisi yoniga qo'shiladi.
   */
  async speechMitStimme(text: string, stimme: string): Promise<string> {
    const out = await this.run(TTS_ELEVEN_MODEL, { text, voice: stimme });
    const url = out?.audio?.url;
    if (typeof url !== 'string') throw new Error('fal.ai ovoz qaytarmadi');
    return url;
  }
```

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/media/fal-client.spec.ts
```
Kutilgan: PASS

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src/daf/media/
git commit -m "FalClient: ElevenLabs ovozi bilan nutq metodi"
```

---

## Task 6: Ovoz namunasi skripti — CEO ESHITADI

**Files:**
- Create: `server/scripts/daf-voice-samples.ts`
- Modify: `server/package.json` (`daf:voice-samples`)

**Interfaces:**
- Consumes: `FalClient.speech`, `FalClient.speechMitStimme` (Task 5)

**SKRIPT YOZILADI VA TESTLANADI, LEKIN CHAQIRILMAYDI.** Haqiqiy
chaqiruvni koordinator CEO ruxsati bilan qiladi.

- [ ] **Step 1: Skriptni yozing**

Besh so'z ataylab tanlangan — ularning har biri talaffuzning boshqa
tomonini sinaydi:

```ts
const PROBEWOERTER = [
  'hallo',        // oddiy, boshlang'ich nuqta
  'tschüss',      // umlaut
  'heißen',       // ß
  'Zett',         // harf nomi (`Z` ning `tts` qiymati)
  'Auf Wiedersehen', // ko'p bo'g'inli, uzun
];

const VARIANTEN = [
  { id: 'chatterbox', label: 'Chatterbox (mavjud)' },
  { id: 'eleven-rachel', label: 'ElevenLabs — Rachel (Anna)', stimme: 'Rachel' },
  { id: 'eleven-matilda', label: 'ElevenLabs — Matilda (Sabine)', stimme: 'Matilda' },
];
```

Skript har variant uchun besh so'zni yasaydi, fayllarni
`server/.tmp-voice-samples/<variant>/<so'z>.mp3` ga saqlaydi (bu yo'l
`server/.gitignore` da `.tmp-*` bilan allaqachon e'tiborsiz) va oxirida
jadval bosib chiqaradi: variant, so'z, fayl yo'li.

**Narx chegarasi:** skript boshida jami belgi sonini hisoblaydi va
**300 belgidan oshsa to'xtaydi** — noto'g'ri chaqiruvdan saqlaydi.

- [ ] **Step 2: Skript testini yozing**

`server/scripts/daf-voice-samples.spec.ts` — sof mantiqni sinang
(chaqiruvsiz): belgi hisobi, 300 chegarasi, fayl yo'llari.

```ts
it('300 belgidan oshsa to`xtaydi', () => {
  expect(() => pruefeBudget(301)).toThrow(/300/);
});
it('chegara ichida o`tadi', () => {
  expect(() => pruefeBudget(180)).not.toThrow();
});
```

- [ ] **Step 3: Testni yuritib, o'tishini ko'ring**

```
cd server && npx jest scripts/daf-voice-samples.spec.ts
```

- [ ] **Step 4: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/scripts/ server/package.json
git commit -m "Ovoz namunasi skripti (3 variant, 5 so'z)"
```

- [ ] **Step 5: TO'XTANG — koordinatorga xabar bering**

Statusni `DONE` qilib, hisobotda aniq yozing: skript tayyor, chaqirilmagan,
CEO eshitib ovoz tanlashi kerak. **7-vazifa shu tanlovsiz boshlanmaydi.**

---

## Task 7: 53 so'z audiosini yasash

**Files:**
- Create: `server/scripts/daf-gen-audio.ts`
- Create: `server/content/daf/a1/audio.json` (skript yozadi)
- Modify: `server/package.json` (`daf:gen-audio`)

**Interfaces:**
- Consumes: `neuerAudioSchluessel`, `AudioManifest` (Task 1); `FalClient` (Task 5); `R2Uploader.uploadMissing` (mavjud)

**BLOKLANGAN:** 6-vazifadagi ovoz tanlanmaguncha chaqirilmaydi.

- [ ] **Step 1: Skriptni yozing**

Mantiq:

1. `content/daf/a1/u01/woerter.json` ni o'qiydi
2. Mavjud `audio.json` ni o'qiydi (bo'lmasa `{}`)
3. **Manifestda allaqachon kaliti bor so'zni o'tkazib yuboradi** —
   idempotent; qayta yuritish pul sarflamaydi va audioni almashtirmaydi
4. Qolganlari uchun: `tts ?? de` matnini tanlangan ovoz bilan yasaydi,
   `neuerAudioSchluessel()` bilan kalit oladi
5. `R2Uploader.uploadMissing` bilan yuklaydi
6. **Faqat MUVAFFAQIYATLI yuklangan kalitni** manifestga yozadi va
   faylni saqlaydi

**Narx chegarasi:** jami belgi **400 dan oshsa to'xtaydi** (53 so'z =
278 belgi; chegara xato kirish ma'lumotidan saqlaydi).

- [ ] **Step 2: Skript testini yozing**

```ts
it('manifestda kaliti bor so`zni qayta yasamaydi', () => {
  const qoldi = zuGenerieren(
    [{ sourceId: 'a', de: 'hallo', tts: null }, { sourceId: 'b', de: 'danke', tts: null }],
    { a: 'daf/audio/x.mp3' },
  );
  expect(qoldi.map((w) => w.sourceId)).toEqual(['b']);
});

it('tts bo`lsa o`sha matn yuboriladi, aks holda de', () => {
  // Harf va raqamlar uchun kritik: `Z` ni TTS inglizcha o'qiydi,
  // `Zett` esa nemischa.
  expect(sprechtext({ de: 'Z', tts: 'Zett' })).toBe('Zett');
  expect(sprechtext({ de: 'hallo', tts: null })).toBe('hallo');
});

it('yuklash muvaffaqiyatsiz bo`lsa manifestga yozilmaydi', () => {
  // Aks holda manifest R2 da yo'q faylga ishora qilardi va o'quvchi
  // yangramaydigan tugmani ko'rardi.
  const m = manifestAktualisieren({}, [
    { sourceId: 'a', key: 'daf/audio/x.mp3', ok: true },
    { sourceId: 'b', key: 'daf/audio/y.mp3', ok: false },
  ]);
  expect(m).toEqual({ a: 'daf/audio/x.mp3' });
});
```

- [ ] **Step 3: Testlarni yuritib, o'tishini ko'ring**

```
cd server && npx jest scripts/daf-gen-audio.spec.ts
```

- [ ] **Step 4: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/scripts/ server/package.json
git commit -m "53 so'z audiosini yasaydigan skript"
```

- [ ] **Step 5: TO'XTANG — koordinator chaqiradi**

Skript chaqirilgandan keyin `audio.json` va yasalgan fayllar tekshiriladi,
so'ng `npm run daf:inhalt-seed -- --unit 1` bilan bazaga tushadi.

---

## Task 8: «Harf chizilmaydi» qoidasi

**Files:**
- Modify: `server/src/daf/media/picturable.ts`
- Test: `server/src/daf/media/picturable.spec.ts`

- [ ] **Step 1: Failing testni yozing**

```ts
describe('yakka harf hech qachon picturable emas', () => {
  it('lotin harfini rad etadi', () => {
    // Rasm uslubimiz matn, harf va yozuvni QAT'IY taqiqlaydi (Flux
    // harflarni buzib chizadi, va yozuv javobni oshkor qilardi) — ya'ni
    // harfni rasm qilib bo'lmaydi. Eski DiB kontentida alifbo bo'limi
    // bo'lmagani uchun bu qoida hech qachon kerak bo'lmagan; A1 ning
    // 1-uniti uni birinchi marta ochdi.
    for (const h of ['C', 'E', 'H', 'I', 'J', 'V', 'W', 'Y', 'Z', 'a', 'z']) {
      expect(isNeverPicturable(h)).toBe(true);
    }
  });

  it('bir harfli SO`Z emas, faqat yakka harf', () => {
    // Nemischada bir harfli so'z yo'q, lekin qoida keng bo'lmasligi
    // uchun: ikki va undan ortiq belgili so'zga tegmaydi.
    expect(isNeverPicturable('in')).toBe(false);
    expect(isNeverPicturable('Ei')).toBe(false);
  });
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx jest src/daf/media/picturable.spec.ts
```
Kutilgan: FAIL — `isNeverPicturable('C')` `false` qaytaradi

- [ ] **Step 3: Amalga oshiring**

```ts
/**
 * Yakka lotin harfi — alifbo bo'limi uchun.
 *
 * Sonlar qoidasi bilan bir xil mulohaza: rasm uslubimiz matn va harfni
 * qat'iy taqiqlaydi, ya'ni harfning rasmi bo'lishi mumkin emas. Ustiga,
 * chizilgan harf javobning O'ZI bo'lardi.
 */
function isSingleLetter(de: string): boolean {
  return /^[A-Za-zÄÖÜäöü]$/.test(de.trim());
}

export function isNeverPicturable(de: string): boolean {
  return (
    isGeographicProperNoun(de) ||
    isNumeric(de) ||
    isPhrase(de) ||
    isSingleLetter(de)
  );
}
```

- [ ] **Step 4: Testlarni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/media/
```
Kutilgan: PASS (mavjud son va geografik testlar ham)

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src/daf/media/
git commit -m "Yakka harf hech qachon rasmga tushmaydi"
```

---

## Task 9: A1 uchun `picturable` va rasm

**Files:**
- Modify: `server/scripts/daf-mark-picturable.ts`
- Modify: `server/src/daf/media/picturable.ts` (so'rov quruvchisi)
- Test: `server/src/daf/media/picturable.spec.ts`

**BLOKLANGAN:** pullik chaqiruvni koordinator qiladi.

- [ ] **Step 1: Failing testni yozing**

```ts
it('so`rov inglizchasiz, de va uz ustiga quriladi', () => {
  // A1 kontentida inglizcha maydon YO'Q (`u01/woerter.json` da faqat
  // `de`, `uz`). 53 so'zni inglizchaga tarjima qilish yana bitta pullik
  // chaqiruv va yana bitta qo'lda tekshiriladigan kontent qatlami
  // degani — rasm chizilishini hal qilish uchun bunday narsa kiritish
  // teskari tartib.
  const p = buildPicturablePrompt([
    { sourceId: 'u01-s2-frau', de: 'Frau', uz: 'ayol' },
  ]);
  expect(p).toContain('Frau');
  expect(p).toContain('ayol');
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx jest src/daf/media/picturable.spec.ts
```
Kutilgan: FAIL — `PicturableCandidate` `en` talab qiladi

- [ ] **Step 3: Amalga oshiring**

`PicturableCandidate` da `en: string` ni `uz: string` ga almashtiring va
`buildPicturablePrompt` ni shunga moslang. `daf-mark-picturable.ts` da
lexeme o'qishni `{ sourceId, de, uz }` qiling.

- [ ] **Step 4: Testlarni yuritib, o'tishini ko'ring**

```
cd server && npm test && npm run typecheck
```

- [ ] **Step 5: Commit va TO'XTANG**

```bash
git add server/scripts/ server/src/daf/media/
git commit -m "picturable so'rovi inglizchasiz — de va uz ustiga"
```

Koordinator `daf:mark-picturable` va `daf:gen-images` ni CEO ruxsati
bilan chaqiradi; natijani CEO ko'radi.

---

## Self-review natijasi

**Spec qamrovi.** §2 qamrov → 3, 4, 8, 9-vazifalar; §3 kalit → 1-vazifa
(tripwire testi bilan); §3.1 manifest → 1, 2; §3.2 route qurilmaydi →
Global Constraints; §4 ovoz → 5, 6; §5 rasm → 8, 9; §6 dvigatel → 3;
§7 ekran → 4; §8 sinash → har vazifaning testlari; §9 narx → 6, 7 dagi
budjet chegaralari.

**Qoplanmagan:** §8 dagi «odam tekshiradi» bandlari (ovoz tanlash, harf
va umlautni tinglash, rasm sifati) — bular ataylab vazifa emas, ular
6, 7, 9-vazifalardagi TO'XTASH nuqtalari.

**Tip mosligi.** `audioKey` (material va baza), `audioUrl` (savol va
mijoz) — ikkalasi ataylab boshqa nomda: birinchisi R2 kaliti,
ikkinchisi mijozga ketadigan manzil. `AudioManifest` 1-vazifada
e'lon qilinadi, 2 va 7-vazifalarda ishlatiladi.
