/**
 * Makes the audio of the clock times for `UHR_HOEREN` (the student hears a
 * time and picks its clock) and uploads it to R2.
 *
 *   npm run daf:gen-uhr-audio -- --stimme Johanna --speed 0.85 --dry-run
 *   npm run daf:gen-uhr-audio -- --stimme Johanna --speed 0.85 [--unit 5]
 *
 * The twin of `daf-gen-satz-audio.ts`, built from the same parts: the CEO
 * voice (Inworld "Johanna (de)"), the required `--speed` with local
 * slowdown, the refusal retry and random keys — a key derived from the
 * time would print the answer in the URL.
 *
 * What is spoken is the taught informal form in a sentence («Es ist halb
 * vier.», `sprechtext` in `uhrzeit-text.ts`). Each time is made once,
 * whatever sections teach it (`uhr-audio.json` is keyed by `zeit`). Only
 * times missing from the manifest, or whose spoken text changed since
 * (`uhrTextHash`), are made, so a rerun costs nothing. The manifest is
 * written after EACH upload. Then `daf:inhalt-seed` puts the keys in the
 * database.
 *
 * `--dry-run` prints the texts, the character count and the price and
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
  uhrAudioSchluessel,
  uhrTextHash,
  uhrzeitenDesUnits,
  validateUhrzeiten,
  type UhrAudioManifest,
  type UhrzeitenFile,
} from '../src/daf/inhalt/uhrzeiten';
import { parseZeit, sprechtext } from '../src/daf/uebung/uhrzeit-text';
import {
  INWORLD_STIMMEN,
  REQUIRED_ENV,
  StimmeArgError,
  UnitArgError,
  parseGenAudioArgs,
  parseUnitArg,
  sprichMitAblehnungsschutz,
} from './daf-gen-audio';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const ZEITEN_PATH = join(A1, 'uhrzeiten.json');
const MANIFEST_PATH = join(A1, 'uhr-audio.json');

/**
 * Character limit of one run. A whole clock face (144 five-minute steps)
 * is about 3 000 characters; 3 500 ($0.035) stops a wrong input first.
 */
export const UHR_BELGI_CHEGARASI = 3500;

/** Inworld TTS price on fal: $0.01 per 1 000 characters. */
const NARX_1000_BELGI = 0.01;

export function preisUsd(zeichen: number): number {
  return (zeichen / 1000) * NARX_1000_BELGI;
}

/** Called before any fal.ai request. */
export function pruefeUhrBudget(zeichen: number): void {
  if (zeichen > UHR_BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichen} belgi (chegara ${UHR_BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

/** Every time in the file once, sorted; `unit` narrows to one unit. */
export function alleZeiten(file: UhrzeitenFile, unit?: string): string[] {
  const bolimlar = unit
    ? Object.values(uhrzeitenDesUnits(file, unit))
    : Object.values(file).map((z) => z.map((e) => e.zeit));
  return [...new Set(bolimlar.flat())].sort();
}

export function uhrSprechtext(zeit: string): string {
  const z = parseZeit(zeit);
  if (!z) throw new Error(`Noto'g'ri vaqt: ${zeit}`);
  return sprechtext(z.h, z.m);
}

export function gesamtZeichen(zeiten: string[]): number {
  return zeiten.reduce((sum, z) => sum + uhrSprechtext(z).length, 0);
}

/** Times with no usable audio: not in the manifest, or a stale hash. */
export function zuGenerierenZeiten(
  zeiten: string[],
  manifest: UhrAudioManifest,
): string[] {
  return zeiten.filter((z) => uhrAudioSchluessel(manifest, z) === null);
}

/** The manifest with one more uploaded time (input left untouched). */
export function manifestMitZeit(
  manifest: UhrAudioManifest,
  zeit: string,
  key: string,
): UhrAudioManifest {
  return { ...manifest, [zeit]: { key, textHash: uhrTextHash(zeit) } };
}

function manifestOquv(): UhrAudioManifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as UhrAudioManifest;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let stimme: string;
  let speed: number;
  let unit: string | undefined;
  try {
    ({ stimme, speed } = parseGenAudioArgs(argv));
    unit = argv.includes('--unit') ? parseUnitArg(argv) : undefined;
  } catch (err) {
    if (err instanceof StimmeArgError || err instanceof UnitArgError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (!existsSync(ZEITEN_PATH)) {
    console.error("uhrzeiten.json yo'q — avval vaqtlarni yozing.");
    process.exitCode = 1;
    return;
  }
  const file = JSON.parse(readFileSync(ZEITEN_PATH, 'utf8')) as UhrzeitenFile;
  const fehler = validateUhrzeiten(file);
  if (fehler.length > 0) {
    fehler.forEach((f) => console.error(`  - ${f}`));
    process.exitCode = 1;
    return;
  }
  let manifest = manifestOquv();
  const zeiten = alleZeiten(file, unit);
  const qoldi = zuGenerierenZeiten(zeiten, manifest);
  console.log(
    `${zeiten.length} ta vaqtdan ${qoldi.length} tasiga audio kerak ` +
      `(${zeiten.length - qoldi.length} tasi manifestda bor).`,
  );
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }

  const zeichen = gesamtZeichen(qoldi);
  console.log(
    `Jami belgi: ${zeichen} (≈ $${preisUsd(zeichen).toFixed(3)}, chegara ${UHR_BELGI_CHEGARASI}).`,
  );
  try {
    pruefeUhrBudget(zeichen);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  if (argv.includes('--dry-run')) {
    for (const z of qoldi) console.log(`  ${z}: ${uhrSprechtext(z)}`);
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
  const yasalmadi: string[] = [];
  for (const [i, zeit] of qoldi.entries()) {
    const key = neuerAudioSchluessel();
    try {
      const gesagt = await sprichMitAblehnungsschutz(
        (t) => fal.speechInworld(t, stimmeId),
        uhrSprechtext(zeit),
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
      manifest = manifestMitZeit(manifest, zeit, key);
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      console.log(
        `  ${i + 1}/${qoldi.length}: ${zeit} → "${gesagt.gesprochen}"`,
      );
    } catch (err) {
      yasalmadi.push(zeit);
      console.error(
        `  ${i + 1}/${qoldi.length}: ${zeit} YASALMADI: ${(err as Error).message}`,
      );
    }
  }

  console.log(
    `\n${qoldi.length - yasalmadi.length}/${qoldi.length} ta vaqt audiosi yuklandi. Manifest: ${MANIFEST_PATH}`,
  );
  if (yasalmadi.length > 0) {
    console.error(`Yasalmadi (qayta yuriting): ${yasalmadi.join(', ')}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
