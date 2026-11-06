/**
 * Makes the audio of one unit's phrases (Redemittel) and uploads it to R2.
 *
 *   npm run daf:gen-phrase-audio -- --unit 6 --stimme Johanna --speed 0.85 --dry-run
 *   npm run daf:gen-phrase-audio -- --unit 6 --stimme Johanna --speed 0.85
 *
 * The twin of `daf-gen-satz-audio.ts` (sentence audio): the same CEO voice
 * (Inworld "Johanna (de)", `--stimme` accepts that one only), the same
 * required `--speed` with local slowdown, the same refusal retry and random
 * keys. A phrase is a short ready sentence for a situation, so it is made
 * and kept exactly like one.
 *
 * Only phrases missing from `content/daf/a1/phrase-audio.json`, or whose text
 * changed since their audio was made (`phraseTextHash`), are made, so a
 * rerun costs nothing. The manifest is keyed by the phrase code
 * (`phraseCodesOf`, the one the seed writes as `DafPhrase.code`) and is saved
 * after EACH upload, so a run that stops halfway keeps what it already paid
 * for. `--dry-run` prints the phrases, the character count and the price and
 * sends nothing.
 *
 * PAID: fal.ai calls and R2 writes. `main()` only runs when the file is
 * executed directly (`require.main === module`).
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
  phraseAudioSchluessel,
  phraseCodesOf,
  phraseTextHash,
  type PhraseAudioManifest,
} from '../src/daf/inhalt/phrase-audio';
import type {
  Phrase,
  RedemittelFile,
} from '../src/daf/inhalt/unit-inhalt.types';
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
import { preisUsd } from './daf-gen-satz-audio';

const MANIFEST_PATH = join(
  __dirname,
  '..',
  'content',
  'daf',
  'a1',
  'phrase-audio.json',
);

/**
 * Character limit of one run. A unit has about 20 phrases of ~30 characters
 * (u06: 22 phrases); 1 500 ($0.015) stops a wrong input before it is paid for.
 */
export const PHRASE_BELGI_CHEGARASI = 1500;

/** The chosen unit's phrase file. */
export function redemittelPfad(unit: string): string {
  return join(__dirname, '..', 'content', 'daf', 'a1', unit, 'redemittel.json');
}

/** Called before any fal.ai request. */
export function prueferPhraseBudget(zeichen: number): void {
  if (zeichen > PHRASE_BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichen} belgi (chegara ${PHRASE_BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

export interface PhraseJob {
  code: string;
  phrase: Phrase;
}

/** Phrases with no usable audio: not in the manifest, or a stale hash. */
export function zuGenerierenPhrasen(
  phrasen: Phrase[],
  manifest: PhraseAudioManifest,
): PhraseJob[] {
  const codes = phraseCodesOf(phrasen);
  return phrasen
    .map((phrase, i) => ({ code: codes[i], phrase }))
    .filter((j) => phraseAudioSchluessel(manifest, j.code, j.phrase) === null);
}

/** The manifest with one more uploaded phrase (input left untouched). */
export function manifestMitPhrase(
  manifest: PhraseAudioManifest,
  job: PhraseJob,
  key: string,
): PhraseAudioManifest {
  return {
    ...manifest,
    [job.code]: { key, textHash: phraseTextHash(job.phrase) },
  };
}

function manifestOquv(): PhraseAudioManifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as PhraseAudioManifest;
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

  const pfad = redemittelPfad(unit);
  if (!existsSync(pfad)) {
    console.error(`${unit}: redemittel.json yo'q — avval unit matnini yozing.`);
    process.exitCode = 1;
    return;
  }
  const { phrasen } = JSON.parse(readFileSync(pfad, 'utf8')) as RedemittelFile;
  let manifest = manifestOquv();

  const qoldi = zuGenerierenPhrasen(phrasen, manifest);
  console.log(
    `${unit}: ${phrasen.length} iboradan ${qoldi.length} tasiga audio kerak ` +
      `(${phrasen.length - qoldi.length} tasi manifestda bor).`,
  );
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }

  const zeichen = gesamtZeichenzahl(qoldi.map((j) => j.phrase));
  console.log(
    `Jami belgi: ${zeichen} (≈ $${preisUsd(zeichen).toFixed(3)}, chegara ${PHRASE_BELGI_CHEGARASI}).`,
  );
  try {
    prueferPhraseBudget(zeichen);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  if (argv.includes('--dry-run')) {
    for (const j of qoldi) console.log(`  ${j.code}: ${sprechtext(j.phrase)}`);
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
  for (const [i, job] of qoldi.entries()) {
    const text = sprechtext(job.phrase);
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
      manifest = manifestMitPhrase(manifest, job, key);
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      console.log(
        `  ${i + 1}/${qoldi.length}: ${job.code} → "${gesagt.gesprochen}"`,
      );
    } catch (err) {
      fehler.push(job.code);
      console.error(
        `  ${i + 1}/${qoldi.length}: ${job.code} YASALMADI: ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `\n${qoldi.length - fehler.length}/${qoldi.length} ta ibora audiosi yuklandi. Manifest: ${MANIFEST_PATH}`,
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
