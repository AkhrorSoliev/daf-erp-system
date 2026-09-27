# A1 Picture Exercises and Article Colours — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three picture word formats (`BILD_WORT`, `AUDIO_BILD`, `BILD_TIPPEN`), der/die/das colours, and the image pipeline (reviewed plan → generated manifest with random keys → seed), so pictures appear in A1 sessions as soon as images exist.

**Architecture:** The formats are word formats built exactly like `audioWort`/`wortTippen`: pure builders in `wort-fragen.ts` that return `null` without an image, wired into `UebungService` candidates, review, preferences and `pruefen`. Images get random R2 keys (`daf/bild/<hex>.jpg`) stored in `content/daf/a1/bilder.json`; `bild-plan.json` holds the human-reviewed scene and the `tippen` flag; the content seed writes `DafLexeme.imageKey` and the new `DafLexeme.bildTippen`. The client renders picture options in a 2×2 grid, shows the image for `BILD_TIPPEN`, and colours articles through Lumio tokens.

**Tech Stack:** NestJS + Prisma (server, Jest), Next.js + Tailwind v4 + Lumio tokens (client, Vitest), fal.ai `fal-ai/flux/schnell`, Cloudflare R2, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-09-27-a1-rasmli-mashqlar-design.md`

## Global Constraints

- Style B prompt (CEO 27.09), verbatim: `Flat vector illustration with bold simple shapes, clean thick outlines and bright friendly colors: <szene>. Minimal detail, plain light background, subject centered and filling most of the frame. No text, no letters, no words, no writing, no signs anywhere.`
- Image model `fal-ai/flux/schnell`, `image_size: square_hd`, `output_format: jpeg`, seed from `seedFor(sourceId, attempt)`; price $0.003 per megapixel (≈ $0.0031 per image). Every paid run needs the CEO's explicit approval of the stated amount.
- Image keys are random: `daf/bild/<32 hex>.jpg`. Never derive an image key from a `sourceId`.
- Picture options: exactly 4 (1 correct + 3 distractors), distractors from the same cumulative section pool, distinct image keys, different `de`.
- `BILD_TIPPEN`: only words with `bildTippen = true` AND an `artikel`; the answer is `"<artikel> <de>"`, article required, `normalisieren` forgiveness applies.
- Picture choice answers compare URLs by exact equality.
- Option `alt` text never names the word: `"1-variant"` … `"4-variant"`.
- Article colours: der blue, die red, das green, via tokens defined under `.lumio` and `.dark .lumio`; the article text is always shown (colour is supplementary).
- New code comments and commit messages in English; UI strings in Latin Uzbek.
- Do not create a new file above 500 lines.
- Old R2 files are never deleted by this work.

---

## File Structure

**Server**
- Modify `server/src/daf/uebung/frage.types.ts` — 3 formats, `MaterialWort.imageKey?`/`bildTippen?`, `Frage.bildUrl?`, `PublicFrage.bildUrl?`, `toPublic`.
- Modify `server/src/daf/uebung/wort-fragen.ts` — `bildWort`, `audioBild`, `bildTippen` + picture distractors.
- Create `server/src/daf/media/bild-keys.ts` — `neuerBildSchluessel`, `BildManifest`, `bildSchluesselFuer`.
- Modify `server/src/daf/media/audio-keys.ts` — correct the wrong "image keys are safe" comment.
- Modify `server/src/daf/uebung/format-skill.ts`, `server/src/daf/dto/uebung.dto.ts`, `server/src/daf/media/daf-media-fragen.service.ts` — compile-time maps + preview material.
- Modify `server/src/daf/uebung/uebung.service.ts` — material, candidates, review formats, `pruefen`, `loesungWort`.
- Modify `server/src/daf/uebung/kind-formate.ts` — preferences.
- Modify `server/prisma/schema.prisma` + create `server/prisma/migrations/20260927210000_daf_lexeme_bild_tippen/migration.sql`.
- Create `server/src/daf/inhalt/bild-plan.ts` — plan types + `validateBildPlan`.
- Modify `server/src/daf/inhalt/inhalt-seed.service.ts`, `server/scripts/daf-inhalt-seed.ts`, `server/scripts/daf-inhalt-check.ts`, `server/src/daf/inhalt/unit-inhalt.file.spec.ts`.
- Create `server/src/daf/media/bild-stil.ts` (style prompt), `server/src/daf/media/bild-verkleinern.ts` (ffmpeg resize).
- Create `server/scripts/daf-gen-bilder.ts` + spec; modify `server/package.json`.

**Client**
- Modify `client/src/components/student-portal/lernen/types.ts`, `client/src/components/media/media-fragen-types.ts`.
- Modify `client/src/components/student-portal/lernen/uebung/koersatma.ts`, `natija-xabari.ts`, `natija-ekrani.tsx`, `seans-ekrani.tsx`, `../seans-navbat.ts`, `tanlash.tsx`.
- Create `client/src/components/student-portal/lernen/uebung/rasm-tanlash.tsx`.
- Create `client/src/components/student-portal/lernen/uebung/artikel-farbe.ts` + test, `de-wort.tsx`.
- Modify `client/src/app/globals.css` (tokens), `client/src/lib/daf-format-nomlari.ts`, media preview components.

---

### Task 1: Picture word formats — types, image keys, builders, compile-time maps

**Files:**
- Modify: `server/src/daf/uebung/frage.types.ts`
- Modify: `server/src/daf/uebung/wort-fragen.ts`
- Create: `server/src/daf/media/bild-keys.ts`, `server/src/daf/media/bild-keys.spec.ts`
- Modify: `server/src/daf/media/audio-keys.ts` (comment only)
- Modify: `server/src/daf/uebung/format-skill.ts`, `server/src/daf/dto/uebung.dto.ts`, `server/src/daf/media/daf-media-fragen.service.ts`
- Test: `server/src/daf/uebung/wort-fragen.spec.ts`

**Interfaces:**
- Produces: `FrageFormat` gains `'BILD_WORT' | 'AUDIO_BILD' | 'BILD_TIPPEN'`; `MaterialWort.imageKey?: string | null`, `MaterialWort.bildTippen?: boolean`; `Frage.bildUrl?: string | null`; `PublicFrage.bildUrl?: string | null`.
- Produces: `bildWort(ziel, andere, rnd, mediaUrl): Frage | null`, `audioBild(ziel, andere, rnd, mediaUrl): Frage | null`, `bildTippen(ziel, rnd, mediaUrl): Frage | null` (all in `wort-fragen.ts`, `mediaUrl: MediaUrlResolver`).
- Produces: `neuerBildSchluessel(): string`, `type BildManifest = Record<string, string>`, `bildSchluesselFuer(manifest, sourceId): string | null` (in `bild-keys.ts`).

- [ ] **Step 1: Write failing builder tests** — append to `wort-fragen.spec.ts` (import `bildWort, audioBild, bildTippen`):

```ts
const mediaUrlB = (key: string): string => `https://media.example.com/${key}`;
function bild(
  id: number,
  de: string,
  uz: string,
  art: string | null = null,
  opts: { audio?: boolean; tippen?: boolean; bild?: boolean } = {},
): MaterialWort {
  return {
    id,
    de,
    uz,
    artikel: art,
    anzeige: null,
    sectionCode: 'u03-s1',
    audioKey: opts.audio === false ? null : `daf/audio/a${id}.mp3`,
    imageKey: opts.bild === false ? null : `daf/bild/b${id}.jpg`,
    bildTippen: opts.tippen ?? false,
  };
}
const BAHNHOF = bild(1, 'Bahnhof', 'vokzal', 'der', { tippen: true });
const POOL = [
  bild(2, 'Post', 'pochta', 'die'),
  bild(3, 'Kino', 'kino', 'das'),
  bild(4, 'Bank', 'bank', 'die'),
  bild(5, 'Park', 'park', 'der'),
];

describe('bildWort', () => {
  it('shows the word with its article and offers 4 picture URLs, one of them its own', () => {
    const f = bildWort(BAHNHOF, POOL, rnd, mediaUrlB)!;
    expect(f.format).toBe('BILD_WORT');
    expect(f.prompt).toBe('der Bahnhof');
    expect(f.options).toHaveLength(4);
    expect(new Set(f.options).size).toBe(4);
    expect(f.richtig).toBe('https://media.example.com/daf/bild/b1.jpg');
    expect(f.options).toContain(f.richtig);
    expect(f.audioUrl).toBe('https://media.example.com/daf/audio/a1.mp3');
  });

  it('never names a word in an option URL', () => {
    const f = bildWort(BAHNHOF, POOL, rnd, mediaUrlB)!;
    for (const o of f.options) expect(o.toLowerCase()).not.toMatch(/bahnhof|post|kino|bank|park/);
  });

  it('is not built without an image, or with fewer than 3 picture distractors', () => {
    expect(bildWort(bild(1, 'Bahnhof', 'vokzal', 'der', { bild: false }), POOL, rnd, mediaUrlB)).toBeNull();
    expect(bildWort(BAHNHOF, POOL.slice(0, 2), rnd, mediaUrlB)).toBeNull();
    const ohneBild = POOL.map((w) => ({ ...w, imageKey: null }));
    expect(bildWort(BAHNHOF, ohneBild, rnd, mediaUrlB)).toBeNull();
  });

  it('skips distractors that share the image or the word', () => {
    const doppelt = [
      { ...POOL[0], imageKey: BAHNHOF.imageKey },
      { ...POOL[1], id: 9, de: 'bahnhof' },
      ...POOL.slice(2),
    ];
    expect(bildWort(BAHNHOF, doppelt, rnd, mediaUrlB)).toBeNull();
  });

  it('is not built when media URLs cannot be formed', () => {
    expect(bildWort(BAHNHOF, POOL, rnd, () => null)).toBeNull();
  });
});

describe('audioBild', () => {
  it('shows no word: only the audio and 4 picture options', () => {
    const f = audioBild(BAHNHOF, POOL, rnd, mediaUrlB)!;
    expect(f.format).toBe('AUDIO_BILD');
    expect(f.prompt).toBe('');
    expect(f.audioUrl).toBe('https://media.example.com/daf/audio/a1.mp3');
    expect(f.options).toHaveLength(4);
    expect(f.richtig).toBe('https://media.example.com/daf/bild/b1.jpg');
  });

  it('needs both audio and image', () => {
    expect(audioBild(bild(1, 'Bahnhof', 'vokzal', 'der', { audio: false }), POOL, rnd, mediaUrlB)).toBeNull();
    expect(audioBild(bild(1, 'Bahnhof', 'vokzal', 'der', { bild: false }), POOL, rnd, mediaUrlB)).toBeNull();
  });
});

describe('bildTippen', () => {
  it('shows only the picture and expects the word with its article', () => {
    const f = bildTippen(BAHNHOF, rnd, mediaUrlB)!;
    expect(f.format).toBe('BILD_TIPPEN');
    expect(f.prompt).toBe('');
    expect(f.options).toEqual([]);
    expect(f.bildUrl).toBe('https://media.example.com/daf/bild/b1.jpg');
    expect(f.richtig).toBe('der Bahnhof');
    expect(f.audioUrl).toBeNull();
  });

  it('is only built for a word marked unambiguous that has an article', () => {
    expect(bildTippen({ ...BAHNHOF, bildTippen: false }, rnd, mediaUrlB)).toBeNull();
    expect(bildTippen({ ...BAHNHOF, artikel: null }, rnd, mediaUrlB)).toBeNull();
    expect(bildTippen({ ...BAHNHOF, imageKey: null }, rnd, mediaUrlB)).toBeNull();
  });

  it('carries bildUrl to the public question', () => {
    const f = bildTippen(BAHNHOF, rnd, mediaUrlB)!;
    expect(toPublic(f, 0).bildUrl).toBe('https://media.example.com/daf/bild/b1.jpg');
  });
});
```

- [ ] **Step 2: Write failing key tests** — `server/src/daf/media/bild-keys.spec.ts`:

```ts
import { bildSchluesselFuer, neuerBildSchluessel } from './bild-keys';

describe('neuerBildSchluessel', () => {
  it('is random under daf/bild and never repeats', () => {
    const a = neuerBildSchluessel();
    const b = neuerBildSchluessel();
    expect(a).toMatch(/^daf\/bild\/[0-9a-f]{32}\.jpg$/);
    expect(a).not.toBe(b);
  });
});

describe('bildSchluesselFuer', () => {
  it('reads the manifest and answers null for a word without an image', () => {
    const m = { 'u03-s4-fahrrad': 'daf/bild/abc.jpg' };
    expect(bildSchluesselFuer(m, 'u03-s4-fahrrad')).toBe('daf/bild/abc.jpg');
    expect(bildSchluesselFuer(m, 'u03-s4-bus')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd server && npx jest src/daf/uebung/wort-fragen.spec.ts src/daf/media/bild-keys.spec.ts`
Expected: FAIL — `bildWort is not a function`, `Cannot find module './bild-keys'`.

- [ ] **Step 4: Implement types** — in `frage.types.ts`:

```ts
export type FrageFormat =
  | 'WORT_UZ' | 'UZ_WORT' | 'PAAR' | 'ARTIKEL' | 'LUECKE' | 'SATZ_BAUEN'
  | 'SATZ_UEBERSETZEN' | 'REAKTION' | 'ZUORDNEN' | 'DIALOG_LUECKE'
  | 'AUDIO_WORT' | 'WORT_TIPPEN' | 'HOEREN_WAHL'
  | 'BILD_WORT'
  | 'AUDIO_BILD'
  | 'BILD_TIPPEN';
```
(keep the existing one-per-line layout), add to `MaterialWort`:
```ts
  /**
   * Random R2 key of the word's picture (`daf/bild/<hex>.jpg`); absent or
   * `null` — no picture yet, and no picture question is built.
   */
  imageKey?: string | null;
  /**
   * The picture names this word alone (a bicycle, a bus), so a student may be
   * asked to type the word from it. People and states stay `false`: "die Frau"
   * is a correct name for the grandmother's picture too.
   */
  bildTippen?: boolean;
```
add to `Frage` (after `audioUrl`):
```ts
  /**
   * `BILD_TIPPEN` only: the picture shown as the question. Choice formats
   * carry their pictures in `options` instead.
   */
  bildUrl?: string | null;
```
add the same optional field to `PublicFrage`, and in `toPublic` add `bildUrl: f.bildUrl ?? null,`.

- [ ] **Step 5: Implement keys** — `server/src/daf/media/bild-keys.ts`:

```ts
import { randomBytes } from 'crypto';

/**
 * Picture file key in R2 — random, like audio keys.
 *
 * A key derived from the word (`daf/img/u03-s1-bahnhof.jpg`) would give the
 * answer away: in `BILD_WORT` and `AUDIO_BILD` the four OPTIONS are pictures,
 * so each option's URL would name its word. The key is stored in
 * `content/daf/a1/bilder.json` because it cannot be recomputed.
 */
export function neuerBildSchluessel(): string {
  return `daf/bild/${randomBytes(16).toString('hex')}.jpg`;
}

/** `sourceId` → R2 key. Content, kept in git. */
export type BildManifest = Record<string, string>;

export function bildSchluesselFuer(
  manifest: BildManifest,
  sourceId: string,
): string | null {
  return manifest[sourceId] ?? null;
}
```

In `audio-keys.ts` replace the paragraph starting `NEGA TASODIFIY, \`media-keys.ts\` dagi rasm kaliti kabi` with:

```ts
 * NEGA TASODIFIY. `AUDIO_WORT` va `WORT_TIPPEN` da so'z javobning O'ZI —
 * so'zdan yasalgan kalit to'g'ri javobni manzilda yozib berardi. Rasm
 * kalitlari ham shu sababdan tasodifiy (`bild-keys.ts`): `BILD_WORT`da
 * variantlar rasm, ya'ni so'zli manzil qaysi variant to'g'ri ekanini aytardi.
```

- [ ] **Step 6: Implement builders** — append to `wort-fragen.ts`:

```ts
/**
 * Three picture distractors: other words WITH a picture, each picture and
 * each word only once. `null` when the pool has fewer than three.
 */
function bildAblenker(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
): MaterialWort[] | null {
  const bilder = new Set<string>([ziel.imageKey as string]);
  const zielDe = normalisieren(ziel.de);
  const gewaehlt: MaterialWort[] = [];
  for (const w of mischen(andere, rnd)) {
    if (w.id === ziel.id || !w.imageKey) continue;
    if (bilder.has(w.imageKey) || normalisieren(w.de) === zielDe) continue;
    bilder.add(w.imageKey);
    gewaehlt.push(w);
    if (gewaehlt.length === 3) return gewaehlt;
  }
  return null;
}

function bildOptionen(
  woerter: MaterialWort[],
  rnd: () => number,
  mediaUrl: MediaUrlResolver,
): string[] | null {
  const urls = woerter.map((w) => mediaUrl(w.imageKey as string));
  if (urls.some((u) => !u)) return null;
  return mischen(urls as string[], rnd);
}

export function bildWort(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  if (!ziel.imageKey) return null;
  const richtig = mediaUrl(ziel.imageKey);
  if (!richtig) return null;
  const falsch = bildAblenker(ziel, andere, rnd);
  if (!falsch) return null;
  const options = bildOptionen([ziel, ...falsch], rnd, mediaUrl);
  if (!options) return null;
  return {
    format: 'BILD_WORT',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: anzeigen(ziel),
    hilfe: null,
    options,
    richtig,
    akzeptiert: [],
    belegteItems: [materialSchluessel('WORT', ziel.id)],
    // The word is on screen anyway; hearing it ties sound to picture.
    audioUrl: ziel.audioKey ? mediaUrl(ziel.audioKey) : null,
  };
}

export function audioBild(
  ziel: MaterialWort,
  andere: MaterialWort[],
  rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  if (!ziel.imageKey || !ziel.audioKey) return null;
  const audioUrl = mediaUrl(ziel.audioKey);
  const richtig = mediaUrl(ziel.imageKey);
  if (!audioUrl || !richtig) return null;
  const falsch = bildAblenker(ziel, andere, rnd);
  if (!falsch) return null;
  const options = bildOptionen([ziel, ...falsch], rnd, mediaUrl);
  if (!options) return null;
  return {
    format: 'AUDIO_BILD',
    itemType: 'WORT',
    itemId: ziel.id,
    // EMPTY: showing the word would turn listening into reading.
    prompt: '',
    hilfe: null,
    options,
    richtig,
    akzeptiert: [],
    belegteItems: [materialSchluessel('WORT', ziel.id)],
    audioUrl,
  };
}

export function bildTippen(
  ziel: MaterialWort,
  _rnd: () => number,
  mediaUrl: MediaUrlResolver,
): Frage | null {
  // The article is part of the answer, so a word without one is not asked.
  if (!ziel.imageKey || !ziel.bildTippen || !ziel.artikel) return null;
  const bildUrl = mediaUrl(ziel.imageKey);
  if (!bildUrl) return null;
  return {
    format: 'BILD_TIPPEN',
    itemType: 'WORT',
    itemId: ziel.id,
    prompt: '',
    hilfe: null,
    options: [],
    richtig: anzeigen(ziel),
    akzeptiert: [],
    belegteItems: [materialSchluessel('WORT', ziel.id)],
    audioUrl: null,
    bildUrl,
  };
}
```

- [ ] **Step 7: Compile-time maps.** `format-skill.ts` add `BILD_WORT: 'WORTSCHATZ'`, `AUDIO_BILD: 'HOEREN'`, `BILD_TIPPEN: 'SCHREIBEN'`. `uebung.dto.ts` `ALLE_FRAGE_FORMATLAR` add the three keys with `true`. In `daf-media-fragen.service.ts`: import the three builders; add to `VORSCHAU_BAUER`:
```ts
  BILD_WORT: (m, r) =>
    m.woerter.map((w) => bildWort(w, m.woerter, r, m.mediaUrl)).filter(nichtNull),
  AUDIO_BILD: (m, r) =>
    m.woerter.map((w) => audioBild(w, m.woerter, r, m.mediaUrl)).filter(nichtNull),
  BILD_TIPPEN: (m, r) =>
    m.woerter.map((w) => bildTippen(w, r, m.mediaUrl)).filter(nichtNull),
```
add `imageKey: true, bildTippen: true` to the lexeme `select`, `imageKey: string | null; bildTippen: boolean;` to its `LexemeRow`, and pass both through in its word mapping. Add `bildUrl?: string | null` to `VorschauFrage` and set it where the preview maps a `Frage` (`bildUrl: f.bildUrl ?? null`). Update `client/src/components/media/media-fragen-types.ts` `FrageFormat` with the three literals (the parity spec reads it) and `bildUrl?: string | null` on its question type; add names to `client/src/lib/daf-format-nomlari.ts`: `BILD_WORT: "So'zga mos rasmni topish"`, `AUDIO_BILD: "Eshitilgan so'zning rasmini topish"`, `BILD_TIPPEN: "Rasmga qarab so'zni yozish"`.

The Prisma client does not know `bildTippen` until Task 3 migrates; the `select` is cast `as any` like its neighbours, and Jest mocks Prisma, so this task stays green.

- [ ] **Step 8: Run and verify**

Run: `cd server && npx jest src/daf/uebung/wort-fragen.spec.ts src/daf/media && npx tsc -p tsconfig.check.json --noEmit`
Expected: PASS, typecheck clean (fix any `Record<FrageFormat>` the compiler reports).

- [ ] **Step 9: Commit**

```bash
git add server/src/daf client/src/components/media/media-fragen-types.ts client/src/lib/daf-format-nomlari.ts
git commit -m "feat(daf): picture word formats BILD_WORT, AUDIO_BILD, BILD_TIPPEN"
```

---

### Task 2: Engine wiring — material, candidates, review, preferences, answer checking

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts`, `server/src/daf/uebung/kind-formate.ts`
- Test: `server/src/daf/uebung/uebung.service.spec.ts`, `server/src/daf/uebung/kind-formate.spec.ts`

**Interfaces:**
- Consumes: Task 1 builders, `MaterialWort.imageKey/bildTippen`.
- Produces: `PruefenErgebnis.loesungWort?: string` (the word, e.g. `"der Bahnhof"`, for the three picture formats).

- [ ] **Step 1: Failing tests** — in `kind-formate.spec.ts` assert `bevorzugteFormate('SECTION_A')` contains `'BILD_WORT'` and `'AUDIO_BILD'`, `bevorzugteFormate('SECTION_B')` contains `'BILD_TIPPEN'`. In `uebung.service.spec.ts` add (reuse the file's existing prisma mock helpers for `dafLexeme.findUnique`, `dafAttempt.create`, `dafLexemeState.*` and the `R2_PUBLIC_URL` config stub the audio tests use):
  - `pruefen` `BILD_WORT` with `given` = the word's image URL → `isCorrect: true`, `richtig` = that URL, `loesungWort: 'der Bahnhof'`.
  - `pruefen` `AUDIO_BILD` with another word's URL → `isCorrect: false`, `loesungWort` present.
  - `pruefen` `BILD_WORT` when the lexeme has no `imageKey` → `BadRequestException`.
  - `pruefen` `BILD_WORT` with `itemType: 'SATZ'` → `BadRequestException`.
  - `pruefen` `BILD_TIPPEN` `given: 'der bahnhof'` → true; `given: 'Bahnhof'` → false (article required); `loesungWort: 'der Bahnhof'`.
  - `seans` for a section whose four core lexemes all have `imageKey` and `audioKey` returns at least one `BILD_WORT` or `AUDIO_BILD` question whose `options` are 4 URLs under the configured `R2_PUBLIC_URL`.

- [ ] **Step 2: Run to verify failure** — `cd server && npx jest src/daf/uebung` → FAIL on the new cases.

- [ ] **Step 3: Implement.**
  - `toWort`: accept `imageKey?: string | null; bildTippen?: boolean` and copy them (`imageKey: l.imageKey ?? null, bildTippen: l.bildTippen ?? false`).
  - `LexemeRow` in `baueKandidaten` and the two other lexeme row types (`wiederholung`, `baueWiederholung`): add `imageKey: string | null; bildTippen: boolean;` (Prisma `findMany` without `select` already returns them).
  - `WORT_FORMATE`: append `'BILD_WORT', 'AUDIO_BILD', 'BILD_TIPPEN'` (comment: a due word may come back as a picture; each builder returns `null` without an image).
  - `baueWortFrage`: add
    ```ts
      case 'BILD_WORT':
        return bildWort(wort, andere, Math.random, (key) => this.mediaUrl(key));
      case 'AUDIO_BILD':
        return audioBild(wort, andere, Math.random, (key) => this.mediaUrl(key));
      case 'BILD_TIPPEN':
        return bildTippen(wort, Math.random, (key) => this.mediaUrl(key));
    ```
  - candidate loop (after `wortTippen`):
    ```ts
      const bw = bildWort(w, coreWords, rnd, (key) => this.mediaUrl(key));
      if (bw) rohKandidaten.push(bw);
      const ab = audioBild(w, coreWords, rnd, (key) => this.mediaUrl(key));
      if (ab) rohKandidaten.push(ab);
      const bt = bildTippen(w, rnd, (key) => this.mediaUrl(key));
      if (bt) rohKandidaten.push(bt);
    ```
  - `richtigeAntwort`: add before `default`:
    ```ts
    case 'BILD_TIPPEN':
      // Typed from the picture alone, so the article is part of the answer:
      // the instruction asks for it and the colour of the answer shows it.
      if (!material.artikel) {
        throw new BadRequestException("Bu so'zda artikl yo'q");
      }
      return { richtig: `${material.artikel} ${material.de}`, akzeptiert: [] };
    ```
  - `ladeMaterial` WORT branch type: add `imageKey: string | null;`; the return type gains `imageKey?: string | null;`.
  - `PruefenErgebnis`: add
    ```ts
      /**
       * Picture formats only: the word itself ("der Bahnhof"), sent after the
       * answer so the student learns what was heard or shown.
       */
      loesungWort?: string;
    ```
  - `pruefen`: declare `let loesungWort: string | undefined;`, add a branch before the generic `else`:
    ```ts
    } else if (format === 'BILD_WORT' || format === 'AUDIO_BILD') {
      if (itemType !== 'WORT') {
        throw new BadRequestException("Rasmli savol faqat so'zga tegishli");
      }
      const url = material.imageKey ? this.mediaUrl(material.imageKey) : null;
      if (!url) {
        throw new BadRequestException("Bu so'zda rasm yo'q");
      }
      // A URL, not text: exact equality, no forgiveness.
      isCorrect = given === url;
      richtig = url;
      loesungWort = material.artikel
        ? `${material.artikel} ${material.de}`
        : material.de;
    ```
    in the generic branch after `richtig = antwort.richtig;` add `if (format === 'BILD_TIPPEN') loesungWort = antwort.richtig;`, and return `{ isCorrect, richtig, ...(loesungWort ? { loesungWort } : {}) }` from the final return (the `HOEREN_WAHL` return stays as is).
  - `kind-formate.ts`: `SECTION_A: ['WORT_UZ', 'PAAR', 'ZUORDNEN', 'AUDIO_WORT', 'BILD_WORT', 'AUDIO_BILD']`, `SECTION_B: ['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN', 'WORT_TIPPEN', 'BILD_TIPPEN']`; update the comment's "bugun 10 tasi bor" count to "16".

- [ ] **Step 4: Run** — `cd server && npx jest src/daf && npx tsc -p tsconfig.check.json --noEmit` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(daf): picture formats in sessions, review and answer checking"`

---

### Task 3: Data and content — `bildTippen` column, plan/manifest, validator, seed

**Files:**
- Modify: `server/prisma/schema.prisma` (`DafLexeme`)
- Create: `server/prisma/migrations/20260927210000_daf_lexeme_bild_tippen/migration.sql`
- Create: `server/src/daf/inhalt/bild-plan.ts`, `server/src/daf/inhalt/bild-plan.spec.ts`
- Modify: `server/src/daf/inhalt/inhalt-seed.service.ts` (+ spec), `server/scripts/daf-inhalt-seed.ts`, `server/scripts/daf-inhalt-check.ts`, `server/src/daf/inhalt/unit-inhalt.file.spec.ts`

**Interfaces:**
- Produces: `type BildPlan = Record<string, { szene: string; tippen: boolean }>`, `validateBildPlan(plan: BildPlan, woerter: WoerterFile['woerter'][], manifest: BildManifest): string[]` (problems, empty = clean).
- Produces: `InhaltFiles.bilder?: BildManifest`, `InhaltFiles.bildPlan?: BildPlan`; seed writes `imageKey` and `bildTippen`.

- [ ] **Step 1: Failing validator tests** — `bild-plan.spec.ts`:

```ts
import { validateBildPlan } from './bild-plan';

const woerter = [
  { sourceId: 'u03-s4-fahrrad', section: 'u03-s4', de: 'Fahrrad', artikel: 'das', uz: 'velosiped', core: true, order: 1 },
  { sourceId: 'u03-s5-oft', section: 'u03-s5', de: 'oft', uz: "ko'pincha", core: true, order: 2 },
] as any[];

describe('validateBildPlan', () => {
  it('accepts a planned noun with its generated key', () => {
    const plan = { 'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true } };
    expect(validateBildPlan(plan, woerter, { 'u03-s4-fahrrad': 'daf/bild/a.jpg' })).toEqual([]);
  });
  it('rejects a plan entry for an unknown word', () => {
    expect(validateBildPlan({ 'u03-s4-xyz': { szene: 'x', tippen: false } }, woerter, {})).toEqual([
      "u03-s4-xyz: rasm rejasida bor, lekin so'zlar faylida yo'q",
    ]);
  });
  it('rejects tippen on a word without an article', () => {
    expect(validateBildPlan({ 'u03-s5-oft': { szene: 'x', tippen: true } }, woerter, {})).toEqual([
      "u03-s5-oft: rasmga qarab yozish faqat artiklli otga (tippen: true artiklsiz so'zda)",
    ]);
  });
  it('rejects an empty scene', () => {
    expect(validateBildPlan({ 'u03-s4-fahrrad': { szene: ' ', tippen: false } }, woerter, {})).toEqual([
      "u03-s4-fahrrad: sahna (szene) bo'sh",
    ]);
  });
  it('rejects a manifest key for a word that is not planned', () => {
    expect(validateBildPlan({}, woerter, { 'u03-s4-fahrrad': 'daf/bild/a.jpg' })).toEqual([
      "u03-s4-fahrrad: rasm manifestda bor, lekin rasm rejasida yo'q",
    ]);
  });
  it('rejects a key that is not a random picture key', () => {
    const plan = { 'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true } };
    expect(validateBildPlan(plan, woerter, { 'u03-s4-fahrrad': 'daf/img/u03-s4-fahrrad.jpg' })).toEqual([
      "u03-s4-fahrrad: rasm kaliti tasodifiy emas (daf/bild/<hex>.jpg bo'lishi kerak)",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/daf/inhalt/bild-plan.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `bild-plan.ts`:**

```ts
import type { BildManifest } from '../media/bild-keys';

/**
 * `content/daf/a1/bild-plan.json` — written by a person and reviewed: what
 * to draw for a word (`szene`, English, for the model) and whether its
 * picture names the word alone (`tippen`).
 */
export type BildPlan = Record<string, { szene: string; tippen: boolean }>;

const BILD_KEY = /^daf\/bild\/[0-9a-f]{32}\.jpg$/;

interface PlanWort {
  sourceId: string;
  artikel?: string | null;
}

export function validateBildPlan(
  plan: BildPlan,
  woerter: PlanWort[],
  manifest: BildManifest,
): string[] {
  const bySourceId = new Map(woerter.map((w) => [w.sourceId, w]));
  const problems: string[] = [];
  for (const [sourceId, eintrag] of Object.entries(plan)) {
    const wort = bySourceId.get(sourceId);
    if (!wort) {
      problems.push(`${sourceId}: rasm rejasida bor, lekin so'zlar faylida yo'q`);
      continue;
    }
    if (!eintrag.szene.trim()) {
      problems.push(`${sourceId}: sahna (szene) bo'sh`);
    }
    if (eintrag.tippen && !wort.artikel) {
      problems.push(
        `${sourceId}: rasmga qarab yozish faqat artiklli otga (tippen: true artiklsiz so'zda)`,
      );
    }
  }
  for (const [sourceId, key] of Object.entries(manifest)) {
    if (!bySourceId.has(sourceId)) continue; // another unit's word
    if (!plan[sourceId]) {
      problems.push(`${sourceId}: rasm manifestda bor, lekin rasm rejasida yo'q`);
    } else if (!BILD_KEY.test(key)) {
      problems.push(
        `${sourceId}: rasm kaliti tasodifiy emas (daf/bild/<hex>.jpg bo'lishi kerak)`,
      );
    }
  }
  return problems;
}
```

Note: the plan and manifest are shared by all units, so the validator receives one unit's words and only judges entries whose `sourceId` belongs to that unit — except plan entries, whose `sourceId` prefix (`u03-`) names the unit. Filter the plan to the unit's prefix before calling (done by the callers below).

- [ ] **Step 4: Migration.** In `schema.prisma` under `DafLexeme` add:
```prisma
  /// Rasm so'zni yakka o'zi aniq bildiradi — o'quvchidan rasmga qarab so'zni
  /// yozish so'raladi (`BILD_TIPPEN`). Manba: `content/daf/a1/bild-plan.json`.
  bildTippen        Boolean               @default(false)
```
Create `server/prisma/migrations/20260927210000_daf_lexeme_bild_tippen/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "DafLexeme" ADD COLUMN "bildTippen" BOOLEAN NOT NULL DEFAULT false;
```
Apply to the dev database and record it:
```bash
cd server
npx prisma db execute --file prisma/migrations/20260927210000_daf_lexeme_bild_tippen/migration.sql
npx prisma migrate resolve --applied 20260927210000_daf_lexeme_bild_tippen
npx prisma generate
```
(`migrate dev` is broken in this repo; see memory `project_prisma_migration_workflow`.)

- [ ] **Step 5: Seed.** `InhaltFiles` gains:
```ts
  /** `content/daf/a1/bilder.json` — picture keys; optional like `audio`. */
  bilder?: BildManifest;
  /** `content/daf/a1/bild-plan.json` — the `tippen` flag per word. */
  bildPlan?: BildPlan;
```
In the word `data` object add:
```ts
        // Manifest is the source: a key removed from it clears the stale one.
        imageKey: bildSchluesselFuer(files.bilder ?? {}, w.sourceId),
        bildTippen: files.bildPlan?.[w.sourceId]?.tippen ?? false,
```
Add a seed spec case: a word listed in `bilder` and `bildPlan` (tippen true) is upserted with that `imageKey` and `bildTippen: true`; a word absent from both gets `imageKey: null, bildTippen: false`.
In `scripts/daf-inhalt-seed.ts` read `bilder.json` and `bild-plan.json` next to `audio.json` (both optional: `existsSync` → `{}`) and pass them in. In `scripts/daf-inhalt-check.ts` and `unit-inhalt.file.spec.ts` run `validateBildPlan(planForUnit, woerter.woerter, bilder)` where `planForUnit` keeps entries whose key starts with `${unit}-`, and require `[]`.

- [ ] **Step 6: Run** — `cd server && npx jest src/daf/inhalt && npx tsc -p tsconfig.check.json --noEmit` → PASS.

- [ ] **Step 7: Commit** — `git add server/prisma server/src/daf/inhalt server/scripts && git commit -m "feat(daf): picture plan, manifest and bildTippen in the content seed"`

---

### Task 4: Image generation script `daf-gen-bilder`

**Files:**
- Create: `server/src/daf/media/bild-stil.ts` (+ spec), `server/src/daf/media/bild-verkleinern.ts` (+ spec)
- Create: `server/scripts/daf-gen-bilder.ts`, `server/scripts/daf-gen-bilder.spec.ts`
- Modify: `server/package.json` (`"daf:gen-bilder": "ts-node scripts/daf-gen-bilder.ts"`)

**Interfaces:**
- Consumes: `FalClient.image(prompt, seed): Promise<string>`, `seedFor(sourceId, attempt)` (`media-keys.ts`), `neuerBildSchluessel`, `R2Uploader.uploadBytes`, `BildPlan`, `BildManifest`.
- Produces: `bildPrompt(szene: string): string`; `verkleinereBild(input: Buffer, px?: number): Promise<Buffer>`; script exports `parseBildArgs(argv)`, `zuZeichnen(plan, manifest, unit, ersetzen)`, `pruefeBildBudget(anzahl)`, `erstelleBildGeneriere(fal, uploader, fetchFn, verkleinere)`, `generiereBilderNacheinander(...)`, constants `BILD_PREIS = 0.003 * 1.048576`, `BILD_CHEGARASI` (count per run).

- [ ] **Step 1: Failing tests.**
  - `bild-stil.spec.ts`: `bildPrompt('a bicycle')` equals the Global Constraints style string with `<szene>` replaced; throws on an empty scene.
  - `bild-verkleinern.spec.ts`: with a real ffmpeg (like `audio-tempo.spec.ts`), a generated 64×64 JPEG (`ffmpeg -f lavfi -i color=c=red:s=64x64 -frames:v 1`) resized to 32 px returns a JPEG buffer (starts with `0xFF 0xD8`) whose `ffprobe` width is 32.
  - `daf-gen-bilder.spec.ts` (mirror `daf-gen-dialog-audio.spec.ts`): `parseBildArgs` requires `--unit`, dedupes, reads `--ersetzen a,b` and `--dry-run`; `zuZeichnen` returns only the unit's planned words without a manifest key, plus `--ersetzen` words; `pruefeBildBudget(BILD_CHEGARASI + 1)` throws `/TO'XTATILDI/`; `erstelleBildGeneriere` calls `fal.image(bildPrompt(szene), seedFor(sourceId, attempt))`, resizes, uploads under a key matching `/^daf\/bild\/[0-9a-f]{32}\.jpg$/`; a failed download throws before resize/upload; `generiereBilderNacheinander` saves the manifest after every image and keeps earlier keys when a later one fails.

- [ ] **Step 2: Run to verify failure** — `npx jest src/daf/media/bild-stil.spec.ts src/daf/media/bild-verkleinern.spec.ts scripts/daf-gen-bilder.spec.ts` → FAIL.

- [ ] **Step 3: Implement.**

`bild-stil.ts`:
```ts
/**
 * The A1 picture style the CEO chose on 2026-09-27 from two samples (B,
 * flat). Kept verbatim so every picture of the course looks the same.
 */
const STIL =
  'Flat vector illustration with bold simple shapes, clean thick outlines and bright friendly colors: {szene}. ' +
  'Minimal detail, plain light background, subject centered and filling most of the frame. ' +
  'No text, no letters, no words, no writing, no signs anywhere.';

export function bildPrompt(szene: string): string {
  if (!szene.trim()) throw new Error("Rasm sahnasi bo'sh");
  return STIL.replace('{szene}', szene.trim());
}
```

`bild-verkleinern.ts` (same shape as `audio-tempo.ts`): write the input to a temp file, run `ffmpeg -i in.jpg -vf scale=<px>:<px> -q:v 4 -y out.jpg`, read `out.jpg`, clean up; throw on a non-zero exit. Default `px = 512`.

`daf-gen-bilder.ts` (structure identical to `daf-gen-dialog-audio.ts`): paths `A1/bild-plan.json`, `A1/bilder.json`; `--unit N` required (`u0N`), `--dry-run`, `--ersetzen <ids>` (a redraw uses `attempt = 1` for its seed so the picture changes); budget `anzahl × BILD_PREIS` printed and `BILD_CHEGARASI = 80` images per run; per image: `fal.image` → `fetch` (403 guard via `User-Agent: curl/8.7.1` not needed — fal media URLs are public) → `verkleinereBild` → `uploader.uploadBytes(neuerBildSchluessel(), bytes)` → `manifest[sourceId] = key` → write manifest → log the public URL for review. `main()` only under `require.main === module`; env `FAL_KEY`, `R2_*` required only after the dry-run gate.

- [ ] **Step 4: Run** — the three spec files + `npx tsc -p tsconfig.check.json --noEmit` (scripts are not in the typecheck scope; `ts-node` type-checks the script on its dry run in Task 8) → PASS.

- [ ] **Step 5: Commit** — `git add server/src/daf/media server/scripts server/package.json && git commit -m "feat(daf): picture generation script in the CEO-chosen flat style"`

---

### Task 5: Client — picture exercises

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/koersatma.ts` (+ test), `natija-xabari.ts` (+ test), `natija-ekrani.tsx`, `seans-ekrani.tsx`
- Modify: `client/src/components/student-portal/lernen/seans-navbat.ts` (+ test)
- Create: `client/src/components/student-portal/lernen/uebung/rasm-tanlash.tsx`
- Modify: media preview row component that renders `options` (find with `grep -rn "vorschauShakli" client/src/components/media`)

**Interfaces:**
- Consumes: server `PublicFrage.bildUrl`, `PruefErgebnis.loesungWort`.
- Produces: `harakat(format)` returns `"RASM"` for `BILD_WORT`/`AUDIO_BILD`, `"YOZISH"` for `BILD_TIPPEN`; `SeansXato.bildUrl?: string | null`.

- [ ] **Step 1: Failing tests.**
  - `koersatma.test.ts`: `koersatma('BILD_WORT') === "Mos rasmni tanlang"`, `koersatma('AUDIO_BILD') === "Eshiting va mos rasmni tanlang"`, `koersatma('BILD_TIPPEN') === "Rasmda nima? Artikli bilan yozing"`; `harakat('BILD_WORT') === "RASM"`, `harakat('AUDIO_BILD') === "RASM"`, `harakat('BILD_TIPPEN') === "YOZISH"`.
  - `natija-xabari.test.ts`: `xatoYorligi('AUDIO_BILD', '') === "Eshitish savoli"`, `xatoYorligi('BILD_TIPPEN', '') === "Rasm savoli"`, `xatoYorligi('BILD_WORT', 'der Bahnhof') === "der Bahnhof"`.
  - seans-navbat test: a wrong `AUDIO_BILD` answer with `natija = { isCorrect: false, richtig: 'https://m/b1.jpg', loesungWort: 'der Bahnhof' }` records `richtig: 'der Bahnhof'` and `bildUrl: 'https://m/b1.jpg'`; a wrong `BILD_TIPPEN` records `bildUrl` = the question's `bildUrl` and `richtig` = `loesungWort`.

- [ ] **Step 2: Run to verify failure** — `cd client && npx vitest run src/components/student-portal/lernen` → FAIL.

- [ ] **Step 3: Implement.**
  - `types.ts`: add the three literals; `PublicFrage.bildUrl?: string | null` (comment: BILD_TIPPEN's picture); `PruefErgebnis.loesungWort?: string` (comment: the word after a picture question).
  - `koersatma.ts`: add the three texts; `harakat` returns `"TANLASH" | "YOZISH" | "YIGISH" | "RASM"`, with `if (format === "BILD_WORT" || format === "AUDIO_BILD") return "RASM";` and `"BILD_TIPPEN"` added to the `YOZISH` condition.
  - `natija-xabari.ts`: `xatoYorligi` returns `"Eshitish savoli"` for `AUDIO_BILD` too and `"Rasm savoli"` for `BILD_TIPPEN`.
  - `seans-navbat.ts`: `SeansXato.bildUrl?: string | null`; in `javobBerildi` build the entry with
    ```ts
          richtig: natija.loesungWort ?? natija.richtig,
          bildUrl:
            frage.format === "BILD_TIPPEN"
              ? (frage.bildUrl ?? null)
              : frage.format === "BILD_WORT" || frage.format === "AUDIO_BILD"
                ? natija.richtig
                : null,
    ```
  - `rasm-tanlash.tsx`:
    ```tsx
    "use client";

    import * as React from "react";
    import { CheckCircle, XCircle } from "@phosphor-icons/react";
    import { cn } from "@/lib/utils";
    import type { PruefErgebnis } from "../types";

    export interface RasmTanlashProps {
      options: string[];
      tanlangan: string | null;
      onTanla: (v: string) => void;
      natija: PruefErgebnis | null;
      kutilmoqda?: boolean;
    }

    /**
     * Picture options for `BILD_WORT` / `AUDIO_BILD`: a 2×2 grid. The answer
     * is not in the props; `alt` never names the word, or a screen reader
     * would read the answer out.
     */
    export function RasmTanlash({ options, tanlangan, onTanla, natija, kutilmoqda = false }: RasmTanlashProps) {
      return (
        <div className="grid grid-cols-2 gap-3">
          {options.map((url, i) => {
            const bosilgan = tanlangan === url;
            const togri = natija != null && url === natija.richtig;
            const xatoTanlov = natija != null && bosilgan && !natija.isCorrect;
            return (
              <button
                key={url}
                type="button"
                disabled={natija != null || kutilmoqda}
                onClick={() => onTanla(url)}
                aria-pressed={bosilgan}
                className={cn(
                  "relative aspect-square w-full max-w-full overflow-hidden rounded-2xl border-4 bg-white transition-colors",
                  "border-transparent",
                  bosilgan && !natija && "border-coral-500",
                  togri && "border-success",
                  xatoTanlov && "border-danger",
                  (natija != null || kutilmoqda) && "cursor-default",
                )}
              >
                <img src={url} alt={`${i + 1}-variant`} className="size-full object-cover" draggable={false} />
                {togri ? (
                  <CheckCircle size={28} weight="fill" className="absolute right-2 top-2 text-success" />
                ) : xatoTanlov ? (
                  <XCircle size={28} weight="fill" className="absolute right-2 top-2 text-danger" />
                ) : null}
              </button>
            );
          })}
        </div>
      );
    }
    ```
  - `seans-ekrani.tsx`: `rejim === "RASM"` renders `<RasmTanlash options={frage.options} tanlangan={tanlangan} onTanla={setTanlangan} natija={natija} kutilmoqda={pruefen.isPending} />` (same state as `Tanlash`; `tayyor` for RASM = `tanlangan != null`, find the existing `tayyor` computation and add RASM beside TANLASH). Before the answer area, when `frage.format === "BILD_TIPPEN" && frage.bildUrl`, render `<img src={frage.bildUrl} alt="Rasm" className="mx-auto aspect-square w-full max-w-64 rounded-2xl bg-white object-cover" />`. In the answer panel, replace the wrong-answer line `{natija.richtig}` with `{natija.loesungWort ?? natija.richtig}` and, for `BILD_WORT`/`AUDIO_BILD`, show `natija.loesungWort` under "To'g'ri!" as well (the student learns the word). The `"Xato"` panel must never print a picture URL: for picture formats `loesungWort` is always present.
  - `natija-ekrani.tsx` `XatoQatori`: when `xato.bildUrl`, render a 40 px rounded thumbnail (`<img src={xato.bildUrl} alt="" className="size-10 rounded-lg object-cover" />`) before the label.
  - media preview: where options are listed, render `<img>` thumbnails (48 px) when the format is `BILD_WORT`/`AUDIO_BILD`, and the `bildUrl` thumbnail for `BILD_TIPPEN`.

- [ ] **Step 4: Run** — `cd client && npx vitest run src/components/student-portal/lernen src/components/media && npx tsc --noEmit && npx eslint src/components/student-portal/lernen src/components/media` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(portal): picture exercises in the lesson screen"` (plus `git add` for the new component).

---

### Task 6: Client — article colours

**Files:**
- Modify: `client/src/app/globals.css`
- Create: `client/src/components/student-portal/lernen/uebung/artikel-farbe.ts`, `artikel-farbe.test.ts`, `de-wort.tsx`
- Modify: `seans-ekrani.tsx`, `tanlash.tsx`, `natija-ekrani.tsx`

**Interfaces:**
- Produces: `artikelTeilen(text: string): { artikel: "der" | "die" | "das" | null; rest: string }`, `artikelKlasse(artikel): string` (Tailwind text class or `""`), `<DeWort text={string} className? />`.

- [ ] **Step 1: Failing tests** — `artikel-farbe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { artikelKlasse, artikelTeilen } from "./artikel-farbe";

describe("artikelTeilen", () => {
  it("splits a leading article", () => {
    expect(artikelTeilen("der Bahnhof")).toEqual({ artikel: "der", rest: "Bahnhof" });
    expect(artikelTeilen("die Post")).toEqual({ artikel: "die", rest: "Post" });
    expect(artikelTeilen("das Auto")).toEqual({ artikel: "das", rest: "Auto" });
  });
  it("leaves text without an article alone", () => {
    expect(artikelTeilen("Eltern")).toEqual({ artikel: null, rest: "Eltern" });
    expect(artikelTeilen("Guten Morgen")).toEqual({ artikel: null, rest: "Guten Morgen" });
  });
  it("treats a bare article as an article with no rest (ARTIKEL options)", () => {
    expect(artikelTeilen("das")).toEqual({ artikel: "das", rest: "" });
  });
  it("does not split sentences that start with Der/Die/Das", () => {
    expect(artikelTeilen("Der Bus ist neu.")).toEqual({ artikel: null, rest: "Der Bus ist neu." });
  });
});

describe("artikelKlasse", () => {
  it("maps each article to its token class", () => {
    expect(artikelKlasse("der")).toBe("text-artikel-der");
    expect(artikelKlasse("die")).toBe("text-artikel-die");
    expect(artikelKlasse("das")).toBe("text-artikel-das");
    expect(artikelKlasse(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/student-portal/lernen/uebung/artikel-farbe.test.ts` → FAIL.

- [ ] **Step 3: Implement.**
  - `globals.css`: in the `@theme` Lumio alias block add `--color-artikel-der: var(--artikel-der); --color-artikel-die: var(--artikel-die); --color-artikel-das: var(--artikel-das);`; in `.lumio` add `--artikel-der: #1b6fd1; --artikel-die: #d93a3a; --artikel-das: #168a4e;`; in `.dark .lumio` add `--artikel-der: #6fb3ff; --artikel-die: #ff8a80; --artikel-das: #5fd394;`.
  - `artikel-farbe.ts`:
    ```ts
    export type Artikel = "der" | "die" | "das";

    /**
     * Splits a word shown with its article ("der Bahnhof"). Only a lowercase
     * article followed by one capitalised noun counts, so a sentence that
     * starts with "Der Bus …" is left alone. A bare article (the ARTIKEL
     * options) is an article with no rest.
     */
    export function artikelTeilen(text: string): { artikel: Artikel | null; rest: string } {
      if (text === "der" || text === "die" || text === "das") return { artikel: text, rest: "" };
      const m = /^(der|die|das) (\S+)$/.exec(text);
      if (!m) return { artikel: null, rest: text };
      return { artikel: m[1] as Artikel, rest: m[2] };
    }

    /** der blue, die red, das green — tokens under `.lumio` in globals.css. */
    export function artikelKlasse(artikel: Artikel | null): string {
      if (!artikel) return "";
      return `text-artikel-${artikel}`;
    }
    ```
  - `de-wort.tsx`:
    ```tsx
    import { cn } from "@/lib/utils";
    import { artikelKlasse, artikelTeilen } from "./artikel-farbe";

    /** A German word with its article in the article's colour; the text stays. */
    export function DeWort({ text, className }: { text: string; className?: string }) {
      const { artikel, rest } = artikelTeilen(text);
      if (!artikel) return <span className={className}>{text}</span>;
      return (
        <span className={className} lang="de">
          <span className={cn("font-bold", artikelKlasse(artikel))}>{artikel}</span>
          {rest ? <> {rest}</> : null}
        </span>
      );
    }
    ```
  - Use it: the question prompt in `seans-ekrani.tsx` for word formats (`WORT_UZ`, `BILD_WORT`, `ARTIKEL` prompt `___ Tisch` stays plain); the answer panel's `loesungWort ?? richtig`; `tanlash.tsx` option label for `ARTIKEL` (pass a `format` prop or detect a bare article with `artikelTeilen`); `natija-ekrani.tsx` label and answer.

- [ ] **Step 4: Run** — `cd client && npx vitest run src/components/student-portal/lernen && npx tsc --noEmit && npx eslint src/components/student-portal/lernen src/app` → PASS.

- [ ] **Step 5: Commit** — `git add client && git commit -m "feat(portal): der/die/das colours in lessons"`

---

### Task 7: Verification and pull request

- [ ] **Step 1:** `cd server && npm test && npm run typecheck && npx eslint src` → all green (errors 0).
- [ ] **Step 2:** `cd client && npm test -- --run && npx tsc --noEmit && npx eslint src && npm run build` → all green.
- [ ] **Step 3:** `cd server && npx ts-node scripts/daf-gen-bilder.ts --unit 3 --dry-run` → prints `0 ta rasm kerak` (no plan yet) without network calls; confirms the script type-checks.
- [ ] **Step 4:** Browser check with a mocked session (memory `reference_mock_api_browser_check`): lesson screen with a `BILD_WORT` question (4 images, selection, green/red after check, `loesungWort` shown), a `BILD_TIPPEN` question (image + input), an `ARTIKEL` question (coloured der/die/das), light and dark theme, phone width.
- [ ] **Step 5:** Push the branch and open a PR (English title and body, not live until deployed; migration listed).

---

### Task 8: Content — picture plan for units 1–3 (free) and images (paid, separate approval)

- [ ] **Step 1:** Write `server/content/daf/a1/bild-plan.json` for the picturable core words of `u01`–`u03` (≈ 60): concrete nouns, places, vehicles, people, visible states. `tippen: true` only for objects, places and vehicles with an article; `false` for people (family, professions), adjectives and abstract words. Numbers, letters, countries and function words are never planned.
- [ ] **Step 2:** `npx jest src/daf/inhalt/unit-inhalt.file.spec.ts && npm run daf:inhalt-check -- --unit 1` (and 2, 3) → clean. Commit `content: A1 unit 1-3 picture plan`.
- [ ] **Step 3:** Show the CEO the list (word + Uzbek + what will be drawn). Ask for the exact paid amount from `npm run daf:gen-bilder -- --unit N --dry-run` summed over units.
- [ ] **Step 4 (after the CEO's yes):** run `daf:gen-bilder` per unit with `FAL_KEY` from `~/.claude.json` in-process (scratch `run-with-fal.py`), build a review page of all pictures with the words, have the CEO review, redraw rejects with `--ersetzen`, commit `bilder.json`, seed the dev database and confirm `imageKey`/`bildTippen` equal the manifest/plan.
- [ ] **Step 5 (after the CEO's «yaxshi»):** merge, deploy server (migration) and client, run the production content seed for units 1–3 from a clean `origin/main`, read the keys back.
