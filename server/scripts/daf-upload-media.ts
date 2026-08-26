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

// Loyihaning mavjud R2 konvensiyasi — `src/upload/upload.service.ts` ayni shu
// nomlarni o'qiydi. Yangi nom o'ylab topilmaydi: R2 allaqachon sozlangan
// bo'lsa ham «sozlanmagan» deb aytadigan skript eng yomon holat.
// `R2_ACCOUNT_ID` bu yerda kerak emas — hisob raqami `R2_ENDPOINT` ichida.
const REQUIRED = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
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
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);

  // Aktivlar bir nechta yo'lakda parallel yuklanadi. Sabab o'lchangan:
  // manba serveri (COERLL) fayl hajmidan qat'i nazar har so'rovga ~7 soniya
  // javob beradi, ya'ni 1 095 fayl ketma-ket ~2 soatga cho'ziladi. Yo'laklar
  // bir-biriga tegmaydi — har bir aktivning kaliti yagona va `uploadMissing`
  // idempotent, shuning uchun uzilgan yugurishni shunchaki qayta ishga
  // tushirsa bo'ladi.
  const LANES = 6;
  const CHUNK = 10;
  const totals = { uploaded: 0, skipped: 0 };
  const failed: { key: string; reason: string }[] = [];
  let done = 0;

  await Promise.all(
    Array.from({ length: LANES }, async (_, lane) => {
      const mine = assets.filter((_, i) => i % LANES === lane);
      for (let i = 0; i < mine.length; i += CHUNK) {
        const r = await uploader.uploadMissing(mine.slice(i, i + CHUNK));
        totals.uploaded += r.uploaded;
        totals.skipped += r.skipped;
        failed.push(...r.failed);
        done += Math.min(CHUNK, mine.length - i);
        console.log(
          `  ${done}/${assets.length} — yuklandi ${totals.uploaded}, o'tkazildi ${totals.skipped}, yiqildi ${failed.length}`,
        );
      }
    }),
  );

  console.log(`\nYuklandi: ${totals.uploaded}   O'tkazildi: ${totals.skipped}`);
  if (failed.length > 0) {
    console.error(`Yiqildi: ${failed.length}`);
    for (const f of failed.slice(0, 20)) {
      console.error(`  - ${f.key}: ${f.reason}`);
    }
    process.exitCode = 1;
  }
}

void main();
