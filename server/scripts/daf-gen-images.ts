/**
 * A1 lug'atining `picturable = true` yozuvlariga rasm CHIZADI (fal.ai
 * FLUX.1 [schnell]) va R2'ga yuklaydi.
 *
 *   npm run daf:gen-images -- --unit 12          — 12-bo'limni chiqaradi
 *   npm run daf:gen-images -- --unit 12 --dry-run — nechta rasm kerakligini
 *                                                    aytadi, model chaqirmaydi
 *
 * `--unit N` MAJBURIY (`parseGenImagesArgs`, `src/daf/media/gen-images-args.ts`
 * da sinaladi). Bayroqsiz yugurtirilsa skript yiqiladi: rasmlar
 * bo'lim-bo'lim chiqarilishi va har bo'limdan keyin odam ko'rishi kerak —
 * sinovda `unterschreiben` rasmi uslubdan siljib chiqqan edi, va 450
 * rasmni bir yo'la chiqarib keyin uslubni rad etish bekor ketgan ish
 * bo'lardi.
 *
 * Oqim (Step 6, task-8-brief.md):
 *   1. bo'limning `picturable = true` va `imageKey = null` so'zlarini oladi;
 *   2. har biri uchun `sceneFor(de, en)` bilan modeldan sahna yozdiradi;
 *   3. `FalClient.image(imagePrompt(scene), seed)` — `seed` so'zning
 *      `sourceId`idan barqaror hisoblanadi, qayta yugurish bir xil rasm
 *      beradi;
 *   4. `AssetRef` yig'iladi;
 *   5. `R2Uploader.uploadMissing()` bilan R2'ga ko'chiriladi;
 *   6. bazaga `imageKey` yoziladi (faqat MUVAFFAQIYATLI yuklangan);
 *   7. oxirida ko'rik ro'yxati bosiladi — har rasmning ommaviy manzili
 *      va so'zi, odam brauzerda ochib ko'rishi uchun. Rasmning MA'NOSI,
 *      uslubi va yozuvsizligi ODAM tomonidan tekshiriladi — bu qadam
 *      AVTOMATLASHTIRILMAYDI. Lekin manzilning O'ZI (HTTP 200, `image/*`
 *      content-type) `verifyImageUrl` bilan avtomatik tekshiriladi:
 *      kalitda manzilda xavfli belgi (masalan `#`) qolib ketsa, ommaviy
 *      manzil R2'da BOR faylga ham 404/HTML qaytaradi — bu xato ODAMGA
 *      hech qachon ko'rinmaydi (HTTP javob keladi), shuning uchun odam
 *      brauzerda ochishdan OLDIN dastur o'zi bir marta tekshiradi.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import type { AssetRef } from '../src/daf-content/dataset.types';
import { FalClient } from '../src/daf/media/fal-client';
import { imagePrompt, sceneFor } from '../src/daf/media/image-prompt';
import { imageKeyFor, seedFor } from '../src/daf/media/media-keys';
import { attemptFor, loadRedrawMap } from '../src/daf/media/image-redraw';
import { uzbekSceneReason } from '../src/daf/media/scene-language';
import { verifyImageUrl } from '../src/daf/media/verify-image-url';
import {
  MissingUnitArgError,
  parseGenImagesArgs,
} from '../src/daf/media/gen-images-args';
import { join } from 'path';
import {
  OpenAiTranslateModel,
  type TranslateModel,
} from '../src/daf/translate/translate-model';

/** Har generatsiya qilingan rasmga yoziladigan litsenziya va muallif. */
const LICENSE = 'Generated';
const ATTRIBUTION = 'DaF Sprachzentrum — fal.ai FLUX.1 [schnell]';

/**
 * Haqiqiy generatsiya (dry-run emas) uchun kerak bo'ladigan muhit
 * o'zgaruvchilari. `daf-upload-media.ts` dagi bilan bir xil naqsh:
 * hammasi bir joyda tekshiriladi, yarim ishlab keyin yiqilish yo'q.
 */
const REQUIRED_ENV = [
  'FAL_KEY',
  'OPENAI_API_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
];

/**
 * Modeldan sahna so'raydi va uning INGLIZCHA ekanini tekshiradi.
 *
 * Model ba'zan o'zbekchada javob beradi (12-bo'limda 13 tadan 3 tasi).
 * FLUX o'zbekchani tushunmaydi, lekin xato bermaydi — shunchaki
 * ma'nosiz rasm chizadi. Shuning uchun til shu yerda tekshiriladi, va
 * ikki urinishdan keyin ham inglizcha bo'lmasa `null` qaytadi: rasm
 * chizilmaydi, pul sarflanmaydi, xato KO'RINADI.
 */
async function askScene(
  model: TranslateModel,
  de: string,
  en: string,
): Promise<string | null> {
  for (let tries = 0; tries < 2; tries++) {
    const scene = (await model.complete(sceneFor(de, en))).trim();
    const reason = uzbekSceneReason(scene);
    if (reason === null) return scene;
    console.warn(
      `  ! ${de}: sahna inglizcha emas (${reason}) — qayta so'ralmoqda`,
    );
  }
  return null;
}

async function main() {
  let args;
  try {
    args = parseGenImagesArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof MissingUnitArgError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const unit = await prisma.dafUnit.findFirst({
    where: { level: 'A1', order: args.unit },
  });
  if (!unit) {
    console.error(`A1 darajasida ${args.unit}-bo'lim topilmadi.`);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  // Rad etilgan rasmlar jurnali BOSHIDA o'qiladi — noto'g'ri yozilgan
  // fayl uchun xato model yoki fal.ai chaqirilgandan KEYIN emas, undan
  // OLDIN chiqsin.
  const redrawMap = loadRedrawMap(
    join(__dirname, '..', 'content', 'daf', 'image-redraw.json'),
  );

  // Oddiy yugurish faqat rasmi YO'Q so'zlarni oladi. `--redraw` bilan
  // jurnalda rad etilgan deb belgilangan so'zlar ham qo'shiladi — ularda
  // `imageKey` bor, lekin rasm yaroqsiz.
  const lexemes = await prisma.dafLexeme.findMany({
    where: {
      unitId: unit.id,
      picturable: true,
      ...(args.redraw
        ? {
            OR: [
              { imageKey: null },
              { sourceId: { in: Object.keys(redrawMap) } },
            ],
          }
        : { imageKey: null }),
    },
    select: { id: true, sourceId: true, de: true, en: true },
    orderBy: { order: 'asc' },
  });

  const redrawCount = lexemes.filter(
    (l) => attemptFor(redrawMap, l.sourceId) > 0,
  ).length;

  console.log(
    `${unit.order}-bo'lim: "${unit.titleUz}" — ${lexemes.length} ta so'zga rasm kerak` +
      (redrawCount > 0
        ? ` (shundan ${redrawCount} tasi QAYTA chiziladi)`
        : '') +
      '.',
  );

  if (args.dryRun) {
    console.log('(--dry-run: model va fal.ai CHAQIRILMADI)');
    await prisma.$disconnect();
    return;
  }

  if (lexemes.length === 0) {
    console.log(
      "Qilinadigan ish yo'q — bu bo'limdagi barcha picturable so'zlarda imageKey allaqachon bor.",
    );
    await prisma.$disconnect();
    return;
  }

  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    console.error(
      `Sozlanmagan muhit o'zgaruvchisi: ${missingEnv.join(', ')}.\n` +
        "Rasm generatsiyasi to'xtatildi — hech narsa chaqirilmadi, hech narsa yozilmadi.",
    );
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  const model: TranslateModel = new OpenAiTranslateModel(
    process.env.OPENAI_API_KEY!,
  );
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
  const drawn: typeof lexemes = [];

  let done = 0;
  const rejectedScenes: { de: string; scene: string; reason: string }[] = [];

  for (const lex of lexemes) {
    const scene = await askScene(model, lex.de, lex.en);
    if (scene === null) {
      // Ikki urinishda ham o'zbekcha keldi — rasm CHIZILMAYDI. Chizilsa
      // FLUX o'zbekchani tushunmay ma'nosiz shakl berardi, va xato hech
      // qayerda ko'rinmasdi: model javob berdi, fal.ai rasm qaytardi,
      // R2 qabul qildi. Shuning uchun bu yerda TO'XTAYMIZ.
      rejectedScenes.push({
        de: lex.de,
        scene: '(ikki urinish ham inglizcha emas)',
        reason: 'sahna inglizchada olinmadi',
      });
      continue;
    }
    const attempt = attemptFor(redrawMap, lex.sourceId);
    const seed = seedFor(lex.sourceId, attempt);
    const sourceUrl = await fal.image(imagePrompt(scene), seed);

    assets.push({
      sourceUrl,
      key: imageKeyFor(lex.sourceId),
      kind: 'IMAGE',
      license: LICENSE,
      attribution: ATTRIBUTION,
      title: lex.de,
    });
    // `lexemes` va `assets` endi bir xil uzunlikda EMAS (sahnasi rad
    // etilgani o'tkazib yuborilgan), shuning uchun quyida indeks bo'yicha
    // emas, shu ro'yxat bo'yicha yuriladi.
    drawn.push(lex);

    done++;
    console.log(
      `  ${done}/${assets.length + rejectedScenes.length}: ${lex.de}` +
        (attempt > 0 ? ` [qayta #${attempt}]` : '') +
        ` — "${scene}"`,
    );
  }

  // R2'da AYNAN shu kalit bilan eski (rad etilgan) fayl turibdi, va
  // `uploadMissing` nomiga sodiq — bori bo'lsa o'tkazib yuboradi. Qayta
  // chizishda uni oldin O'CHIRISH kerak, aks holda fal.ai chaqirilib pul
  // sarflanadi, ammo R2'dagi rasm eskiligicha qoladi va hech kim sezmaydi.
  const redrawKeys = lexemes
    .filter((l) => attemptFor(redrawMap, l.sourceId) > 0)
    .map((l) => imageKeyFor(l.sourceId));
  for (const key of redrawKeys) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      }),
    );
  }
  if (redrawKeys.length > 0) {
    console.log(
      `R2: ${redrawKeys.length} ta eski rasm o'chirildi (qayta chizish).`,
    );
  }

  if (rejectedScenes.length > 0) {
    console.error(
      `\nDIQQAT: ${rejectedScenes.length} ta so'zga rasm CHIZILMADI —`,
    );
    for (const r of rejectedScenes) console.error(`  - ${r.de}: ${r.reason}`);
    process.exitCode = 1;
  }

  const uploadResult = await uploader.uploadMissing(assets);
  console.log(
    `\nR2: yuklandi ${uploadResult.uploaded}, o'tkazildi ${uploadResult.skipped}, yiqildi ${uploadResult.failed.length}`,
  );
  const failedKeys = new Set(uploadResult.failed.map((f) => f.key));
  if (uploadResult.failed.length > 0) {
    for (const f of uploadResult.failed)
      console.error(`  - ${f.key}: ${f.reason}`);
  }

  // Faqat MUVAFFAQIYATLI yuklangan rasm bazaga yoziladi — aks holda
  // `imageKey` R2'da hech qachon bo'lmagan faylga ishora qilib qolardi,
  // va klient uni "bor" deb noto'g'ri ko'rsatardi.
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');
  const review: { de: string; url: string }[] = [];

  for (const [i, lex] of drawn.entries()) {
    const asset = assets[i];
    if (failedKeys.has(asset.key)) continue;

    await prisma.dafLexeme.update({
      where: { id: lex.id },
      data: { imageKey: asset.key },
    });
    review.push({ de: lex.de, url: `${base}/${asset.key}` });
  }

  // Manzilning o'zi haqiqatan ham rasm qaytarishini tekshirish —
  // `imageKeyFor` kalitni to'g'ri yasagan bo'lsa ham, ommaviy manzilga
  // qo'shilganda xavfli belgi (masalan `#`) HTTP darajasida boshqacha
  // talqin qilinishi mumkin edi (`verify-image-url.ts`dagi izohga
  // qarang). Odam brauzerda ochishdan oldin shu yerda bir marta
  // avtomatik tekshiriladi — muvaffaqiyatsiz bo'lgani alohida
  // belgilanadi, ko'rik ro'yxatidan chiqarib tashlanmaydi (odam baribir
  // ko'rishi kerak, lekin OGOHLANTIRISH bilan).
  let unreachable = 0;
  for (const r of review) {
    const check = await verifyImageUrl(r.url);
    if (!check.ok) {
      unreachable++;
      console.error(
        `  ✗ ${r.de}: HTTP ${check.status}, content-type=${check.contentType ?? 'yo`q'} — ${r.url}`,
      );
    }
  }

  console.log(
    `\nKO'RIK RO'YXATI (${review.length} ta, ${unreachable} tasi ISHLAMAYDI) — HAR BIRINI BRAUZERDA OCHIB KO'RING:`,
  );
  console.log(
    "Tekshiring: yozuv yo'qmi, ma'no aniqmi, uslub qolganlariga o'xshaydimi.",
  );
  console.log('Yaroqsizini bazadan `imageKey = null` qilib qayta chiqaring.\n');
  for (const r of review) {
    console.log(`  ${r.de.padEnd(30)} ${r.url}`);
  }

  if (unreachable > 0) process.exitCode = 1;

  await prisma.$disconnect();
}

void main();
