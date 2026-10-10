/**
 * Uploads the finished dialog pictures of one unit to R2.
 *
 *   npm run daf:upload-dialog-bilder -- --unit 4 --dir <folder> --dry-run
 *   npm run daf:upload-dialog-bilder -- --unit 4 --dir <folder>
 *
 * The folder holds `<dialogId>-bild.jpg` files (`u04-d1-bild.jpg`), one
 * picture per dialog that shows the whole story (CEO, 2026-10-10). Each is
 * shrunk to 800 px wide (proportions kept) and stored under a NEW random
 * key (`neuerBildSchluessel`); the key goes to
 * `content/daf/a1/dialog-bilder.json`, saved after every upload, so a
 * failure loses only the picture that failed. A dialog already in the
 * manifest is not uploaded again. Free: no paid service is called.
 *
 * `main()` runs only when the file is executed directly, so importing it
 * in tests uploads nothing.
 */
import 'dotenv/config';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import { verkleinereBild } from '../src/daf/media/bild-verkleinern';
import {
  neuerBildSchluessel,
  type BildManifest,
} from '../src/daf/media/bild-keys';
import type { DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const MANIFEST_PATH = join(A1, 'dialog-bilder.json');

/**
 * Shown across the content column: on a phone that is about 360 CSS px at
 * 2–3× density, so 800 px is sharp without spending the data of a full
 * 1184 px original.
 */
export const DIALOG_BILD_PX = 800;

const REQUIRED_ENV = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

export interface DialogBildArgs {
  unit: string;
  dir: string;
  dryRun: boolean;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

export function parseDialogBildArgs(argv: string[]): DialogBildArgs {
  const n = argValue(argv, '--unit');
  if (!n) throw new Error('Kerak: --unit <raqam>');
  const dir = argValue(argv, '--dir');
  if (!dir) throw new Error('Kerak: --dir <rasmlar papkasi>');
  return {
    unit: `u${String(Number(n)).padStart(2, '0')}`,
    dir,
    dryRun: argv.includes('--dry-run'),
  };
}

const DATEI = /^(u\d{2}-d\d+)-bild\.jpg$/;

/**
 * The unit's dialogs that have a picture file and no manifest entry yet,
 * in dialog order (d2 before d10). A file for a dialog the unit does not
 * have stops the run: it is a typo, and a typo must upload nothing.
 */
export function hochzuladen(
  dateien: string[],
  unit: string,
  dialogIds: ReadonlySet<string>,
  manifest: BildManifest,
): string[] {
  const ids = dateien
    .map((f) => DATEI.exec(f)?.[1])
    .filter((id): id is string => !!id && id.startsWith(`${unit}-`));
  const fremd = ids.filter((id) => !dialogIds.has(id));
  if (fremd.length > 0) {
    throw new Error(`${unit}da bunday dialog yo'q: ${fremd.join(', ')}`);
  }
  return ids
    .filter((id) => !manifest[id])
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * Uploads one picture at a time and saves the manifest after each.
 * `manifest` is mutated in place, so the caller still sees what was
 * written when a later upload fails.
 */
export async function ladeNacheinander(
  ids: string[],
  manifest: BildManifest,
  lade: (id: string) => Promise<string>,
  speichere: (manifest: BildManifest) => void,
): Promise<void> {
  for (const id of ids) {
    let key: string;
    try {
      key = await lade(id);
    } catch (err) {
      throw new Error(`${id} yuklanmadi: ${(err as Error).message}`);
    }
    manifest[id] = key;
    speichere(manifest);
    console.log(`  ${id}: yuklandi, manifestga yozildi`);
  }
}

async function main(): Promise<void> {
  const { unit, dir, dryRun } = parseDialogBildArgs(process.argv);
  const dialogIds = new Set(
    (
      JSON.parse(
        readFileSync(join(A1, unit, 'dialoge.json'), 'utf8'),
      ) as DialogeFile
    ).dialoge.map((d) => d.id),
  );
  const manifest: BildManifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as BildManifest)
    : {};

  const ids = hochzuladen(readdirSync(dir), unit, dialogIds, manifest);
  console.log(`${unit}: ${ids.length} ta dialog rasmi yuklanadi.`);
  ids.forEach((id) => console.log(`  ${id}`));
  if (ids.length === 0 || dryRun) {
    console.log(dryRun ? '--dry-run: hech narsa yuklanmadi.' : "Ish yo'q.");
    return;
  }

  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    throw new Error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}`,
    );
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);

  await ladeNacheinander(
    ids,
    manifest,
    async (id) => {
      const klein = await verkleinereBild(
        readFileSync(join(dir, `${id}-bild.jpg`)),
        DIALOG_BILD_PX,
        -2,
      );
      const key = neuerBildSchluessel();
      await uploader.uploadBytes(key, klein);
      return key;
    },
    (m) => writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n'),
  );

  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (base)
    ids.forEach((id) => console.log(`  ${id}: ${base}/${manifest[id]}`));
  console.log(`Manifest yangilandi: ${MANIFEST_PATH}.`);
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
