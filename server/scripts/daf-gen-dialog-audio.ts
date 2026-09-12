/**
 * Dialoglarga ovoz yasaydi (`text-to-dialogue/eleven-v3`) va R2 ga yuklaydi.
 *
 *   npm run daf:gen-dialog-audio -- --dialog u02-d2     — bitta (namuna darvozasi)
 *   npm run daf:gen-dialog-audio -- --unit 2            — unitning hammasi
 *   npm run daf:gen-dialog-audio -- --unit 1 --unit 2   — bir nechta unit
 *
 * PULLIK: $0.10 / 1 000 belgi (2026-09-11). Manifestda xeshi mos dialog
 * QAYTA yasalmaydi — qayta yuritish pul sarflamaydi. Xeshi eskirgan
 * (matni tahrirlangan) dialog qayta yasaladi va eski kalit almashadi.
 *
 * Ro'yxatda (`stimmen.json`) yo'q gapiruvchi — TO'XTASH, standart ovoz
 * yo'q: ovoz obrazga biriktirilgan va kurs davomida o'zgarmaydi.
 *
 * `main()` faqat fayl to'g'ridan-to'g'ri ishga tushirilganda yuguradi
 * (`require.main === module`) — testlar import qilganda tarmoq yo'q.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import type { AssetRef } from '../src/daf-content/dataset.types';
import { FalClient } from '../src/daf/media/fal-client';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import {
  dialogTextHash,
  type DialogAudioManifest,
} from '../src/daf/inhalt/dialog-audio';
import type { Dialog, DialogeFile } from '../src/daf/inhalt/unit-inhalt.types';

const A1 = join(__dirname, '..', 'content', 'daf', 'a1');
const MANIFEST_PATH = join(A1, 'dialog-audio.json');
const STIMMEN_PATH = join(A1, 'stimmen.json');

/**
 * Bir yuritishdagi belgi chegarasi. 12 dialog = 1 592 belgi; chegara
 * 2 500 — tasodifan butun boshqa unit qo'shilib qolsa to'xtaydi.
 */
export const BELGI_CHEGARASI_DIALOG = 2500;

const REQUIRED_ENV = [
  'FAL_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

export type Stimmen = Record<string, string>;

/** Har satr → `{ voice, text }`; matn `tts ?? de`. Noma'lum gapiruvchi — xato. */
export function dialogInputs(
  dialog: Dialog,
  stimmen: Stimmen,
): Array<{ voice: string; text: string }> {
  return dialog.zeilen.map((z) => {
    const voice = stimmen[z.sprecher];
    if (!voice) {
      throw new Error(
        `${dialog.id}: «${z.sprecher}» uchun ovoz yo'q — stimmen.json ga qo'shing. ` +
          "Standart ovoz ATAYLAB yo'q: obraz ovozi kurs davomida o'zgarmaydi.",
      );
    }
    return { voice, text: z.tts ?? z.de };
  });
}

/** Manifestda xeshi mos dialoglar o'tkazib yuboriladi — idempotentlik. */
export function zuGenerierenDialoge(
  dialoge: Dialog[],
  manifest: DialogAudioManifest,
): Dialog[] {
  return dialoge.filter(
    (d) => manifest[d.id]?.textHash !== dialogTextHash(d.zeilen),
  );
}

export function gesamtZeichenDialoge(dialoge: Dialog[]): number {
  return dialoge.reduce(
    (sum, d) => sum + d.zeilen.reduce((s, z) => s + (z.tts ?? z.de).length, 0),
    0,
  );
}

export function pruefeDialogBudget(zeichen: number): void {
  if (zeichen > BELGI_CHEGARASI_DIALOG) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichen} belgi (chegara ${BELGI_CHEGARASI_DIALOG}). ` +
        "Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.",
    );
  }
}

function argValues(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

function ladeDialoge(): Dialog[] {
  const units = argValues('--unit').map(
    (n) => `u${String(Number(n)).padStart(2, '0')}`,
  );
  const einzeln = argValues('--dialog');
  if (units.length === 0 && einzeln.length === 0) {
    throw new Error('Kerak: --unit <raqam> yoki --dialog <kod>');
  }
  for (const code of einzeln) {
    const unit = code.slice(0, 3);
    if (!units.includes(unit)) units.push(unit);
  }
  const alle = units.flatMap(
    (u) =>
      (
        JSON.parse(
          readFileSync(join(A1, u, 'dialoge.json'), 'utf8'),
        ) as DialogeFile
      ).dialoge,
  );
  return einzeln.length > 0 ? alle.filter((d) => einzeln.includes(d.id)) : alle;
}

async function main(): Promise<void> {
  const stimmen = JSON.parse(readFileSync(STIMMEN_PATH, 'utf8')) as Stimmen;
  const manifest: DialogAudioManifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DialogAudioManifest)
    : {};

  const qoldi = zuGenerierenDialoge(ladeDialoge(), manifest);
  console.log(`${qoldi.length} ta dialogga ovoz kerak.`);
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
    return;
  }
  // Gapiruvchilar TARMOQDAN OLDIN tekshiriladi — yarim yasab to'xtamasin.
  const inputsById = new Map(
    qoldi.map((d) => [d.id, dialogInputs(d, stimmen)]),
  );

  const zeichen = gesamtZeichenDialoge(qoldi);
  console.log(
    `Jami belgi: ${zeichen} (≈ $${((zeichen / 1000) * 0.1).toFixed(3)}).`,
  );
  pruefeDialogBudget(zeichen);

  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    throw new Error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}`,
    );
  }

  const fal = new FalClient(process.env.FAL_KEY!);
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);

  const assets: AssetRef[] = [];
  const keyById = new Map<string, string>();
  for (const d of qoldi) {
    const sourceUrl = await fal.dialog(inputsById.get(d.id)!);
    const key = neuerAudioSchluessel();
    keyById.set(d.id, key);
    assets.push({
      sourceUrl,
      key,
      kind: 'AUDIO',
      license: 'Generated',
      attribution: 'DaF Sprachzentrum — fal.ai ElevenLabs text-to-dialogue v3',
      title: d.titelDe,
    });
    console.log(`  ${d.id}: ${d.titelDe} → yasaldi`);
  }

  const r = await uploader.uploadMissing(assets);
  console.log(
    `R2: yuklandi ${r.uploaded}, o'tkazildi ${r.skipped}, yiqildi ${r.failed.length}`,
  );
  const failed = new Set(r.failed.map((f) => f.key));

  // FAQAT muvaffaqiyatli yuklangan kalit manifestga — aks holda o'quvchi
  // yangramaydigan pleyerni ko'rardi.
  for (const d of qoldi) {
    const key = keyById.get(d.id)!;
    if (failed.has(key)) {
      console.error(`  DIQQAT: ${d.id} R2 ga yuklanmadi, manifestga YOZILMADI`);
      process.exitCode = 1;
      continue;
    }
    manifest[d.id] = { key, textHash: dialogTextHash(d.zeilen) };
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifest yangilandi: ${MANIFEST_PATH}`);
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
