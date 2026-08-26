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
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`R2 sozlanmagan. Yetishmayotgan: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const assets = JSON.parse(readFileSync(MANIFEST, 'utf8')) as AssetRef[];
  console.log(`Manifestda ${assets.length} ta aktiv.`);

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
