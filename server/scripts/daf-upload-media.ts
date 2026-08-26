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
  const assets = JSON.parse(readFileSync(MANIFEST, 'utf8')) as AssetRef[];
  console.log(`Manifestda ${assets.length} ta aktiv.`);

  // Litsenziya darvozasi: `validateDataset` yig'ish bosqichida shu tekshiruvni
  // qiladi, lekin bu skript o'sha yo'lni majburlay olmaydi — qo'lda
  // tahrirlangan manifest yoki kelajakdagi boshqa ishlab chiqaruvchi uni
  // chetlab o'tishi mumkin. Shuning uchun R2'ga chiqishdan OLDIN bu yerda
  // ham, mustaqil ravishda tekshiriladi. Aniqlangan aktivlar jimgina
  // o'tkazib yuborilmaydi — ro'yxati chiqadi va butun yuklash to'xtaydi.
  const rejected = assets.filter(
    (a) => !a.license.trim() || !a.attribution.trim(),
  );
  if (rejected.length > 0) {
    console.error(
      `\n${rejected.length} ta aktiv litsenziyasiz yoki muallifsiz — R2'ga CHIQARILMAYDI:`,
    );
    for (const a of rejected) console.error(`  - ${a.key}`);
    process.exitCode = 1;
    return;
  }

  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`R2 sozlanmagan. Yetishmayotgan: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

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
