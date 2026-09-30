/**
 * Draws the pictures of one unit and uploads them to R2.
 *
 *   npm run daf:gen-bilder -- --unit 3 --dry-run     — list and price only
 *   npm run daf:gen-bilder -- --unit 3               — draw what is missing
 *   npm run daf:gen-bilder -- --unit 3 --ersetzen u03-s4-bus,u03-s4-auto@2
 *                                                    — redraw rejected ones
 *
 * What to draw comes from `content/daf/a1/bild-plan.json` (written and
 * reviewed by a person); the keys go to `content/daf/a1/bilder.json`. A word
 * already in the manifest is not drawn again, so a second run costs nothing.
 * Style: the flat style B the CEO chose on 2026-09-27 (`bild-stil.ts`).
 *
 * PAID: `fal-ai/flux/schnell`, $0.003 per megapixel — a 1024 px square is
 * $0.00315 (2026-09-27). Every paid run needs the CEO's approval of the
 * amount this script prints with `--dry-run`.
 *
 * A redraw uses the seed of its attempt: `id@2` hashes "id@2", exactly what
 * `seedFor(id, 2)` does, so a redraw neither repeats the rejected picture
 * nor the previous redraw. A bare `id` is attempt 1. The old R2 file is not
 * deleted: production shows it until the next content seed.
 *
 * Money safety, as in `daf-gen-dialog-audio.ts`:
 * 1. A repeated `--unit`/`--ersetzen` counts once (`parseBildArgs`).
 * 2. The plan is validated and the whole run priced before the first call.
 * 3. Pictures are drawn one at a time and the manifest is saved after each:
 *    a failure loses only the picture that failed.
 *
 * `main()` runs only when the file is executed directly
 * (`require.main === module`), so importing it in tests calls nothing.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import { FalClient } from '../src/daf/media/fal-client';
import { seedFor } from '../src/daf/media/media-keys';
import { bildPrompt } from '../src/daf/media/bild-stil';
import { verkleinereBild } from '../src/daf/media/bild-verkleinern';
import { svgZuPng } from '../src/daf/media/svg-zu-png';
import { zahlBildSvg } from '../src/daf/media/zahl-bild';
import { flaggeSvg, type Land } from '../src/daf/media/flagge-bild';
import {
  neuerBildSchluessel,
  type BildManifest,
} from '../src/daf/media/bild-keys';
import {
  bildPlanFuerUnit,
  validateBildPlan,
  type BildPlan,
} from '../src/daf/inhalt/bild-plan';
import type { WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const PLAN_PATH = join(A1, 'bild-plan.json');
const MANIFEST_PATH = join(A1, 'bilder.json');

/** `fal-ai/flux/schnell` on fal, 2026-09-27: $0.003 × 1.048576 MP. */
export const BILD_PREIS = 0.003 * 1.048576;

/**
 * Pictures per run. A unit plans about 20; the limit lets a unit and its
 * redraws through and stops a run that swept in far more than intended.
 */
export const BILD_CHEGARASI = 80;

const REQUIRED_ENV = [
  'FAL_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

export interface ErsetzenAuftrag {
  sourceId: string;
  versuch: number;
}

export interface BildAuftrag {
  sourceId: string;
  /** What fal.ai draws — absent for a picture drawn in code. */
  szene?: string;
  /** A number: the numeral on a house-number plate (`zahl-bild.ts`), free. */
  zahl?: number;
  /** A country: its flag (`flagge-bild.ts`), free. */
  flagge?: Land;
  /** 0 for a first drawing; a redraw's attempt otherwise (`seedFor`). */
  versuch: number;
}

/** The SVG of a picture drawn in code, or `null` for a scene fal.ai draws. */
export function codeSvg(a: BildAuftrag): string | null {
  if (a.zahl !== undefined) return zahlBildSvg(a.zahl);
  if (a.flagge !== undefined) return flaggeSvg(a.flagge);
  return null;
}

/** The jobs fal.ai is paid for — every scene; code-drawn pictures are free. */
export function bezahlteBilder(auftraege: BildAuftrag[]): number {
  return auftraege.filter((a) => a.szene !== undefined).length;
}

export interface BildArgs {
  unit: string;
  dryRun: boolean;
  ersetzen: ErsetzenAuftrag[];
}

function argValues(argv: string[], flag: string): string[] {
  const out: string[] = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
  });
  return out;
}

const ERSETZEN = /^(u\d{2}-[\w-]+?)(?:@(\d+))?$/;

export function parseBildArgs(argv: string[]): BildArgs {
  const units = Array.from(
    new Set(
      argValues(argv, '--unit').map(
        (n) => `u${String(Number(n)).padStart(2, '0')}`,
      ),
    ),
  );
  if (units.length === 0) throw new Error('Kerak: --unit <raqam>');
  if (units.length > 1) {
    throw new Error(
      `Bir yurishda bitta unit: ${units.join(', ')} — har unitning rasmlari alohida ko'riladi.`,
    );
  }
  const unit = units[0];

  const ersetzen: ErsetzenAuftrag[] = [];
  const tokens = argValues(argv, '--ersetzen').flatMap((v) => v.split(','));
  for (const token of tokens.map((t) => t.trim()).filter(Boolean)) {
    const m = ERSETZEN.exec(token);
    const versuch = m?.[2] === undefined ? 1 : Number(m[2]);
    if (!m || !m[1].startsWith(`${unit}-`) || versuch < 1) {
      throw new Error(
        `--ersetzen ${token}: ${unit} so'zi va 1 dan boshlanadigan urinish kerak (masalan ${unit}-s4-bus@2).`,
      );
    }
    if (!ersetzen.some((e) => e.sourceId === m[1])) {
      ersetzen.push({ sourceId: m[1], versuch });
    }
  }
  return { unit, dryRun: argv.includes('--dry-run'), ersetzen };
}

/**
 * The unit's planned words without a picture (attempt 0), plus the redraws,
 * in plan order. A redraw of a word that is not planned stops the run: it
 * is a typo, and a typo must cost nothing.
 */
export function zuZeichnen(
  plan: BildPlan,
  manifest: BildManifest,
  unit: string,
  ersetzen: ErsetzenAuftrag[],
): BildAuftrag[] {
  const unitPlan = bildPlanFuerUnit(plan, unit);
  for (const e of ersetzen) {
    if (!unitPlan[e.sourceId]) {
      throw new Error(`--ersetzen ${e.sourceId}: rasm rejasida yo'q.`);
    }
  }
  const auftraege: BildAuftrag[] = [];
  for (const [sourceId, eintrag] of Object.entries(unitPlan)) {
    const redraw = ersetzen.find((e) => e.sourceId === sourceId);
    const was =
      eintrag.zahl !== undefined
        ? { zahl: eintrag.zahl }
        : eintrag.flagge !== undefined
          ? { flagge: eintrag.flagge }
          : { szene: eintrag.szene };
    if (redraw) {
      auftraege.push({ sourceId, ...was, versuch: redraw.versuch });
    } else if (!manifest[sourceId]) {
      auftraege.push({ sourceId, ...was, versuch: 0 });
    }
  }
  return auftraege;
}

export function pruefeBildBudget(anzahl: number): void {
  if (anzahl > BILD_CHEGARASI) {
    throw new Error(
      `Rasm chegarasi oshib ketdi: ${anzahl} ta (chegara ${BILD_CHEGARASI}). ` +
        "Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.",
    );
  }
}

export type BildGenerierFn = (auftrag: BildAuftrag) => Promise<string>;

/**
 * One picture end to end: draw, download, shrink, upload under a NEW random
 * key (`neuerBildSchluessel`). Dependencies are injected so tests run
 * without a network.
 */
export function erstelleBildGeneriere(
  fal: Pick<FalClient, 'image'>,
  uploader: Pick<R2Uploader, 'uploadBytes'>,
  fetchFn: typeof fetch,
  verkleinere: (bytes: Buffer) => Promise<Buffer>,
  rendere: (svg: string) => Promise<Buffer> = (svg) => svgZuPng(svg),
): BildGenerierFn {
  return async (a) => {
    const svg = codeSvg(a);
    if (svg !== null) {
      const klein = await verkleinere(await rendere(svg));
      const key = neuerBildSchluessel();
      await uploader.uploadBytes(key, klein);
      return key;
    }
    if (!a.szene) throw new Error(`${a.sourceId}: sahna yo'q`);
    const sourceUrl = await fal.image(
      bildPrompt(a.szene),
      seedFor(a.sourceId, a.versuch),
    );
    // Three steps still follow; if one fails, this temporary public URL is
    // the only way back to a picture that has just been paid for.
    console.log(`    ${a.sourceId}: fal.ai natijasi — ${sourceUrl}`);
    const res = await fetchFn(sourceUrl);
    if (!res.ok) {
      throw new Error(`fal.ai rasmi yuklab olinmadi — HTTP ${res.status}`);
    }
    const klein = await verkleinere(Buffer.from(await res.arrayBuffer()));
    const key = neuerBildSchluessel();
    await uploader.uploadBytes(key, klein);
    return key;
  };
}

/**
 * Draws one picture at a time and saves the manifest after each, before the
 * next. `manifest` is mutated in place, so the caller still sees what was
 * written when a later picture fails.
 */
export async function generiereBilderNacheinander(
  auftraege: BildAuftrag[],
  manifest: BildManifest,
  generiere: BildGenerierFn,
  speichere: (manifest: BildManifest) => void,
): Promise<void> {
  for (const a of auftraege) {
    let key: string;
    try {
      key = await generiere(a);
    } catch (err) {
      throw new Error(
        `${a.sourceId} chizilmadi/yuklanmadi: ${(err as Error).message}`,
      );
    }
    manifest[a.sourceId] = key;
    speichere(manifest);
    console.log(`  ${a.sourceId}: chizildi, yuklandi, manifestga yozildi`);
  }
}

async function main(): Promise<void> {
  const { unit, dryRun, ersetzen } = parseBildArgs(process.argv);
  if (!existsSync(PLAN_PATH)) {
    throw new Error(`Rasm rejasi yo'q: ${PLAN_PATH}`);
  }
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as BildPlan;
  const manifest: BildManifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as BildManifest)
    : {};
  const woerter = (
    JSON.parse(
      readFileSync(join(A1, unit, 'woerter.json'), 'utf8'),
    ) as WoerterFile
  ).woerter;

  // The reviewed plan must be clean before anything is paid for.
  const problems = validateBildPlan(
    bildPlanFuerUnit(plan, unit),
    woerter,
    manifest,
  );
  if (problems.length > 0) {
    throw new Error(
      `Rasm rejasida ${problems.length} ta muammo:\n  - ${problems.join('\n  - ')}`,
    );
  }

  const auftraege = zuZeichnen(plan, manifest, unit, ersetzen);
  const bezahlt = bezahlteBilder(auftraege);
  console.log(
    `${unit}: ${auftraege.length} ta rasm, shundan fal.ai ${bezahlt} ta ` +
      `(≈ $${(bezahlt * BILD_PREIS).toFixed(4)}); son va bayroqlar kodda, pulsiz.`,
  );
  for (const a of auftraege) {
    const was =
      a.zahl !== undefined
        ? `son ${a.zahl}`
        : a.flagge !== undefined
          ? `bayroq ${a.flagge}`
          : a.szene;
    console.log(`  ${a.sourceId}@${a.versuch}: ${was}`);
  }
  pruefeBildBudget(auftraege.length);
  if (auftraege.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }
  if (dryRun) {
    console.log('--dry-run: hech narsa yuborilmadi.');
    return;
  }

  // A run of numbers alone pays nothing and needs no fal.ai key.
  const missingEnv = REQUIRED_ENV.filter(
    (k) => !process.env[k] && !(k === 'FAL_KEY' && bezahlt === 0),
  );
  if (missingEnv.length > 0) {
    throw new Error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}`,
    );
  }
  // Without a key only numbers are drawn (checked above), so fal is unused.
  const fal = new FalClient(process.env.FAL_KEY ?? '');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);

  await generiereBilderNacheinander(
    auftraege,
    manifest,
    erstelleBildGeneriere(fal, uploader, fetch, (b) => verkleinereBild(b)),
    (m) => writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n'),
  );

  // For the review page: every new picture's public address.
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (base) {
    for (const a of auftraege) {
      console.log(`  ${a.sourceId}: ${base}/${manifest[a.sourceId]}`);
    }
  }
  console.log(`Manifest yangilandi: ${MANIFEST_PATH}.`);
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
