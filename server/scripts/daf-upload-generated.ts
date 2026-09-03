/**
 * O'zimiz yaratgan media fayllarni Cloudflare R2'ga chiqaradi.
 *
 *   npm run daf:upload-generated -- --from ~/Desktop/daf-kontent/r2
 *
 * `daf:upload-media`dan ALOHIDA turadi. Sabab ma'noda: u skript tashqi
 * manbalardan YIG'ILGAN kontentni chiqaradi va har aktivdan uchinchi tomon
 * litsenziyasi hamda muallif atributsiyasini talab qiladi. Bu yerdagi
 * fayllar bizniki — atributsiya qiladigan uchinchi tomon yo'q, shuning
 * uchun o'sha darvozani qanoatlantirish uchun soxta qiymat yozish kerak
 * bo'lardi. Ikkita manifest ikkita ma'noni ajratib turadi.
 *
 * Idempotent: R2'da bor kalit qayta yuklanmaydi.
 */
import 'dotenv/config';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { contentTypeOf } from '../src/daf-content/media/r2-uploader';

const MANIFEST = join(__dirname, '..', 'content', 'daf', 'generated-manifest.json');

interface GeneratedAsset {
  key: string;
  kind: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'PDF';
  bytes: number;
  sha256: string;
  quelle: string;
  lizenz: string;
}

/**
 * `--from` majburiy: mahalliy fayllar repoda emas (media git'ga kirmaydi),
 * shuning uchun ularning joyini faqat chaqiruvchi biladi. Standart qiymat
 * qo'yilsa, boshqa kompyuterda jimgina noto'g'ri papkani o'qir edi.
 */
function fromDir(): string {
  const i = process.argv.indexOf('--from');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Kerak: --from <media papkasi>');
    console.error('Masalan: npm run daf:upload-generated -- --from ~/Desktop/daf-kontent/r2');
    process.exit(1);
  }
  return resolve(process.argv[i + 1].replace(/^~/, process.env.HOME ?? '~'));
}

async function main() {
  const dir = fromDir();
  const assets = JSON.parse(readFileSync(MANIFEST, 'utf8')).assets as GeneratedAsset[];
  console.log(`Manifestda ${assets.length} ta aktiv. Manba: ${dir}`);

  const REQUIRED = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`R2 sozlanmagan, yetishmayapti: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  // Yuklashdan OLDIN hamma fayl joyidami va hajmi mosmi — tekshiriladi.
  // Yarmi yuklanib, keyin to'xtash eng yomon holat: R2 qisman to'ladi va
  // idempotentlik keyingi ishga tushirishda buni yashiradi.
  const broken: string[] = [];
  for (const a of assets) {
    const p = join(dir, a.key);
    if (!existsSync(p)) broken.push(`${a.key} — fayl yo'q`);
    else if (statSync(p).size !== a.bytes)
      broken.push(`${a.key} — hajm mos emas (${statSync(p).size} ≠ ${a.bytes})`);
  }
  if (broken.length > 0) {
    console.error(`\n${broken.length} ta muammo, hech narsa yuklanmadi:`);
    for (const b of broken) console.error(`  - ${b}`);
    process.exitCode = 1;
    return;
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.R2_BUCKET_NAME!;

  let uploaded = 0;
  let skipped = 0;
  for (const a of assets) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: a.key }));
      skipped++;
      continue;
    } catch {
      // yo'q — yuklaymiz
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: a.key,
        Body: readFileSync(join(dir, a.key)),
        ContentType: contentTypeOf(a.key),
      }),
    );
    uploaded++;
    console.log(`  ↑ ${a.key}`);
  }
  console.log(`\nYuklandi: ${uploaded}, o'tkazib yuborildi: ${skipped}`);
}

void main();
