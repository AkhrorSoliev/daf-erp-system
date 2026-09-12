/**
 * Mavjud 12 dialog yozuviga boshi/oxiridagi jimlik qo'shadi (Task 11e) —
 * PULSIZ: fal.ai ga HECH QANDAY chaqiruv qilinmaydi.
 *
 *   npm run daf:polster-dialog-audio
 *
 * Har yozuv uchun: mavjud audio R2'dan (`R2_PUBLIC_URL`) yuklab olinadi →
 * `polstereMp3` bilan ishlanadi → YANGI tasodifiy kalit bilan qayta
 * yuklanadi → manifestda `key` va `polster` yangilanadi. `textHash`
 * O'ZGARMAYDI — matn o'zgarmagan, faqat audio fayl.
 *
 * Qayta ishlashdan himoya: `polster === POLSTER_KENNUNG` bo'lgan yozuv
 * `zuPolsterndeEintraege` tomonidan O'TKAZIB YUBORILADI — jimlik
 * ALLAQACHON qo'shilgan, qayta qo'shish boshida 1.4 s, oxirida 2.0 s
 * jimlik yasardi. Maydon YO'Q yozuv — hali ishlanmagan.
 *
 * Har yozuvdan keyin manifest DARHOL saqlanadi (`daf-gen-dialog-audio.ts`
 * dagi bilan bir xil naqsh) — o'rtada yiqilsa, qayta yuritish faqat
 * to'xtagan joydan davom etadi.
 *
 * `main()` faqat fayl to'g'ridan-to'g'ri ishga tushirilganda yuguradi
 * (`require.main === module`) — testlar import qilganda tarmoq yo'q.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import { neuerAudioSchluessel } from '../src/daf/media/audio-keys';
import { polstereMp3, POLSTER_KENNUNG } from '../src/daf/media/audio-polster';
import type { DialogAudioManifest } from '../src/daf/inhalt/dialog-audio';

const MANIFEST_PATH = join(
  __dirname,
  '..',
  'content',
  'daf',
  'a1',
  'dialog-audio.json',
);

const REQUIRED_ENV = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
];

/**
 * Manifestdan hali jimlik olmagan yozuvlarni tanlaydi — SOF funksiya.
 *
 * `polster === POLSTER_KENNUNG` bo'lgan yozuv o'tkazib yuboriladi.
 * Boshqa har qanday holat (maydon yo'q, yoki eski/mos kelmagan qiymat)
 * qayta ishlanadi — kelajakda `POLSTER` qiymatlari o'zgarsa, eski
 * yozuvlar avtomatik ravishda "ishlanmagan" deb topiladi.
 */
export function zuPolsterndeEintraege(manifest: DialogAudioManifest): string[] {
  return Object.keys(manifest).filter(
    (id) => manifest[id].polster !== POLSTER_KENNUNG,
  );
}

export type PolsterFn = (bytes: Buffer) => Promise<Buffer>;

/**
 * Bitta yozuvni ishlaydi: R2'dan ochiq (`R2_PUBLIC_URL`) manzil orqali
 * yuklab oladi, jimlik qo'shadi, YANGI tasodifiy kalit bilan qayta
 * yuklaydi. `textHash`ga TEGMAYDI — chaqiruvchi uni manifestda saqlab
 * qoladi (matn o'zgarmagan).
 *
 * Bog'liqliklar (fetchFn, polster, uploader) INJEKTSIYA QILINADI —
 * testda tarmoqqa chiqmasdan tekshiriladi.
 */
export async function polstereEintrag(
  eskiKalit: string,
  publicUrlBase: string,
  fetchFn: typeof fetch,
  polster: PolsterFn,
  uploader: Pick<R2Uploader, 'uploadBytes'>,
): Promise<{ key: string; polster: string }> {
  const url = `${publicUrlBase.replace(/\/$/, '')}/${eskiKalit}`;
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`R2'dan yuklab olinmadi (${url}) — HTTP ${res.status}`);
  }
  const roh = Buffer.from(await res.arrayBuffer());
  const gepolstert = await polster(roh);
  const yangiKalit = neuerAudioSchluessel();
  await uploader.uploadBytes(yangiKalit, gepolstert);
  return { key: yangiKalit, polster: POLSTER_KENNUNG };
}

async function main(): Promise<void> {
  const manifest: DialogAudioManifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as DialogAudioManifest)
    : {};

  const qoldi = zuPolsterndeEintraege(manifest);
  console.log(`${qoldi.length} ta yozuvga jimlik kerak.`);
  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q.");
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
  const publicUrlBase = process.env.R2_PUBLIC_URL!;

  for (const id of qoldi) {
    const eski = manifest[id];
    let natija: { key: string; polster: string };
    try {
      natija = await polstereEintrag(
        eski.key,
        publicUrlBase,
        fetch,
        polstereMp3,
        uploader,
      );
    } catch (err) {
      throw new Error(
        `${id}: jimlik qo'shilmadi/yuklanmadi: ${(err as Error).message}`,
      );
    }
    manifest[id] = { ...eski, key: natija.key, polster: natija.polster };
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  ${id}: jimlik qo'shildi, yuklandi, manifestga yozildi`);
  }

  console.log(
    `Manifest yangilandi: ${MANIFEST_PATH} (${qoldi.length} ta yozuv).`,
  );
}

if (require.main === module) {
  void main().catch((e: unknown) => {
    // Butun xatoni (stack bilan) chop etadi — `daf-gen-dialog-audio.ts`
    // dagi bilan bir xil naqsh.
    console.error(e);
    process.exit(1);
  });
}
