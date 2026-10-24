/**
 * Makes the audio of one unit's sentences for `SATZ_HOEREN` (the student
 * hears a sentence and builds it from tiles) and uploads it to R2.
 *
 *   npm run daf:gen-satz-audio -- --unit 4 --stimme Johanna --speed 0.85 --dry-run
 *   npm run daf:gen-satz-audio -- --unit 4 --stimme Johanna --speed 0.85
 *
 * The twin of `daf-gen-audio.ts` (word audio) and built from its parts: the
 * same CEO voice (Inworld "Johanna (de)", `--stimme` accepts that one only),
 * the same required `--speed` with local slowdown (`audio-tempo.ts`), the
 * same refusal retry and random keys — a key derived from the sentence
 * would print the answer in the URL.
 *
 * Only sentences missing from `content/daf/a1/satz-audio.json`, or whose
 * text changed since their audio was made (`satzTextHash`), are made. A
 * rerun therefore costs nothing. The manifest is written after EACH upload,
 * so a run that stops halfway keeps what it already paid for.
 *
 * `--dry-run` prints the sentences, the character count and the price and
 * sends nothing.
 *
 * PAID: fal.ai calls and R2 writes. `main()` only runs when the file is
 * executed directly (`require.main === module`), so the tests import it
 * without any network call.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import { FalClient } from '../src/daf/media/fal-client';
import { verlangsameMp3 } from '../src/daf/media/audio-tempo';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import {
  satzAudioSchluessel,
  satzTextHash,
  type SatzAudioManifest,
} from '../src/daf/inhalt/satz-audio';
import type { SaetzeFile, Satz } from '../src/daf/inhalt/unit-inhalt.types';
import {
  INWORLD_STIMMEN,
  REQUIRED_ENV,
  StimmeArgError,
  UnitArgError,
  gesamtZeichenzahl,
  parseGenAudioArgs,
  parseUnitArg,
  sprechtext,
  sprichMitAblehnungsschutz,
} from './daf-gen-audio';

const MANIFEST_PATH = join(
  __dirname,
  '..',
  'content',
  'daf',
  'a1',
  'satz-audio.json',
);

/**
 * Character limit of one run. u04 has 149 sentences = 3 863 characters and u06
 * (situation texts, 24.10.2026) 195 sentences = 5 105; 5 500 ($0.055) stops a
 * wrong input before it is paid for.
 */
export const SATZ_BELGI_CHEGARASI = 5500;

/** Inworld TTS price on fal: $0.01 per 1 000 characters. */
const NARX_1000_BELGI = 0.01;

/** The chosen unit's sentence file. */
export function saetzePfad(unit: string): string {
  return join(__dirname, '..', 'content', 'daf', 'a1', unit, 'saetze.json');
}

export function preisUsd(zeichen: number): number {
  return (zeichen / 1000) * NARX_1000_BELGI;
}

/** Called before any fal.ai request. */
export function pruefeSatzBudget(zeichen: number): void {
  if (zeichen > SATZ_BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichen} belgi (chegara ${SATZ_BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

/** Sentences with no usable audio: not in the manifest, or a stale hash. */
export function zuGenerierenSaetze(
  saetze: Satz[],
  manifest: SatzAudioManifest,
): Satz[] {
  return saetze.filter((s) => satzAudioSchluessel(manifest, s) === null);
}

/** The manifest with one more uploaded sentence (input left untouched). */
export function manifestMitSatz(
  manifest: SatzAudioManifest,
  satz: Satz,
  key: string,
): SatzAudioManifest {
  return {
    ...manifest,
    [satz.sourceId]: { key, textHash: satzTextHash(satz) },
  };
}

function manifestOquv(): SatzAudioManifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as SatzAudioManifest;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let stimme: string;
  let speed: number;
  let unit: string;
  try {
    ({ stimme, speed } = parseGenAudioArgs(argv));
    unit = parseUnitArg(argv);
  } catch (err) {
    if (err instanceof StimmeArgError || err instanceof UnitArgError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const pfad = saetzePfad(unit);
  if (!existsSync(pfad)) {
    console.error(`${unit}: saetze.json yo'q — avval unit matnini yozing.`);
    process.exitCode = 1;
    return;
  }
  const { saetze } = JSON.parse(readFileSync(pfad, 'utf8')) as SaetzeFile;
  let manifest = manifestOquv();

  const qoldi = zuGenerierenSaetze(saetze, manifest);
  console.log(
    `${unit}: ${saetze.length} gapdan ${qoldi.length} tasiga audio kerak ` +
      `(${saetze.length - qoldi.length} tasi manifestda bor).`,
  );
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }

  const zeichen = gesamtZeichenzahl(qoldi);
  console.log(
    `Jami belgi: ${zeichen} (≈ $${preisUsd(zeichen).toFixed(3)}, chegara ${SATZ_BELGI_CHEGARASI}).`,
  );
  try {
    pruefeSatzBudget(zeichen);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  if (argv.includes('--dry-run')) {
    for (const s of qoldi) console.log(`  ${s.sourceId}: ${sprechtext(s)}`);
    console.log('--dry-run: hech narsa yuborilmadi.');
    return;
  }

  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}.\n` +
        "Ovoz generatsiyasi TO'XTATILDI — hech narsa chaqirilmadi, hech narsa yozilmadi.",
    );
    process.exitCode = 1;
    return;
  }

  const fal = new FalClient(process.env.FAL_KEY!);
  const uploader = new R2Uploader(
    new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    }),
    process.env.R2_BUCKET_NAME!,
  );

  const stimmeId = INWORLD_STIMMEN[stimme];
  const fehler: string[] = [];
  for (const [i, satz] of qoldi.entries()) {
    const text = sprechtext(satz);
    const key = neuerAudioSchluessel();
    try {
      const gesagt = await sprichMitAblehnungsschutz(
        (t) => fal.speechInworld(t, stimmeId),
        text,
      );
      const res = await fetch(gesagt.url);
      if (!res.ok) {
        throw new Error(`audio yuklab olinmadi (HTTP ${res.status})`);
      }
      const sekin = await verlangsameMp3(
        Buffer.from(await res.arrayBuffer()),
        speed,
      );
      await uploader.uploadBytes(key, sekin);
      // Written after each upload: a key reaches the manifest only once its
      // file is in R2, and a stopped run loses nothing already paid for.
      manifest = manifestMitSatz(manifest, satz, key);
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      console.log(
        `  ${i + 1}/${qoldi.length}: ${satz.sourceId} → "${gesagt.gesprochen}"`,
      );
    } catch (err) {
      fehler.push(satz.sourceId);
      console.error(
        `  ${i + 1}/${qoldi.length}: ${satz.sourceId} YASALMADI: ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `\n${qoldi.length - fehler.length}/${qoldi.length} ta gap audiosi yuklandi. Manifest: ${MANIFEST_PATH}`,
  );
  if (fehler.length > 0) {
    console.error(`Yasalmadi (qayta yuriting): ${fehler.join(', ')}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
