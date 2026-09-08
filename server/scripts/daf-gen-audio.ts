/**
 * 1-bo'limning 53 so'ziga TALAFFUZ audiosi yasaydi (tanlangan ovoz bilan)
 * va R2'ga yuklaydi.
 *
 *   npm run daf:gen-audio -- --stimme none      — Chatterbox (stimme'siz)
 *   npm run daf:gen-audio -- --stimme Rachel    — ElevenLabs Rachel
 *   npm run daf:gen-audio -- --stimme Matilda   — ElevenLabs Matilda
 *
 * `--stimme` MAJBURIY, standart qiymati YO'Q. Task-6 (`daf-voice-samples.ts`)
 * uchta variantni odam eshitib solishtirishi uchun namuna tayyorlaydi, va
 * shu tanlov hali qilinmagan — noto'g'ri ovozda 53 so'zni gapirtirish
 * umuman ovozsizlikdan YOMONROQ (audio — talaffuz namunasi). Bayroqni
 * MAJBURIY qilish shu tanlovni skript darajasida kafolatlaydi: uni
 * o'tkazib yuborib xato bilan ham "ishlab ketish" mumkin emas.
 *
 * MUHIM: bu skript PULLIK `fal.ai` chaqiruvi qiladi va R2'ga yozadi.
 * Shuning uchun `main()` faqat fayl to'g'ridan-to'g'ri ishga tushirilganda
 * yuguradi (`require.main === module`) — testlar bu faylni import
 * qilganda HECH QANDAY tarmoq so'rovi yubormaydi (`daf-voice-samples.ts`
 * dagi bilan bir xil naqsh, bir xil sabab bilan).
 *
 * Oqim (task-7-brief.md):
 *   1. `content/daf/a1/u01/woerter.json` ni o'qiydi;
 *   2. mavjud `content/daf/a1/audio.json` manifestini o'qiydi (bo'lmasa `{}`);
 *   3. manifestda allaqachon kaliti bor so'zni O'TKAZIB YUBORADI — idempotent,
 *      qayta yuritish pul sarflamaydi va audioni almashtirmaydi;
 *   4. qolganlari uchun `tts ?? de` matnini tanlangan ovoz bilan yasaydi,
 *      `neuerAudioSchluessel()` bilan TASODIFIY kalit oladi (so'zdan
 *      chiqarib bo'lmaydigan — `audio-keys.ts` dagi izohga qarang: bu
 *      audio talaffuz mashqida javobning O'ZI, kalitda yozilsa javobni
 *      manzilda ochib qo'yardi);
 *   5. `R2Uploader.uploadMissing()` bilan yuklaydi;
 *   6. FAQAT MUVAFFAQIYATLI yuklangan kalitni manifestga yozadi va faylni
 *      saqlaydi — aks holda manifest R2'da yo'q faylga ishora qilib,
 *      o'quvchi yangramaydigan tugmani ko'rardi.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Uploader } from '../src/daf-content/media/r2-uploader';
import type { AssetRef } from '../src/daf-content/dataset.types';
import { FalClient } from '../src/daf/media/fal-client';
import {
  audioSchluesselFuer,
  neuerAudioSchluessel,
  type AudioManifest,
} from '../src/daf/media/audio-keys';
import type { Wort, WoerterFile } from '../src/daf/inhalt/unit-inhalt.types';

const WOERTER_PATH = join(
  __dirname,
  '..',
  'content',
  'daf',
  'a1',
  'u01',
  'woerter.json',
);
const MANIFEST_PATH = join(
  __dirname,
  '..',
  'content',
  'daf',
  'a1',
  'audio.json',
);

/** Har generatsiya qilingan audioga yoziladigan litsenziya. */
const LICENSE = 'Generated';

/**
 * Narx chegarasi (belgi soni). Brifda qat'iy belgilangan — 53 so'z = 278
 * belgi, chegara 400: xato kirish ma'lumotidan (masalan butun boshqa
 * unit tasodifan qo'shilib qolishi) saqlaydi.
 */
export const BELGI_CHEGARASI = 400;

/**
 * Haqiqiy chaqiruv (dry-run emas) uchun kerak bo'ladigan muhit
 * o'zgaruvchilari — `daf-gen-images.ts` dagi bilan bir xil naqsh: hammasi
 * bir joyda tekshiriladi, yarim ishlab keyin yiqilish yo'q.
 */
const REQUIRED_ENV = [
  'FAL_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

/**
 * `zuGenerieren`/`sprechtext` uchun minimal shakl. `Wort`ning o'zi emas —
 * bu yerda faqat uchta maydon kerak, va `tts` `null` bo'lishi ham mumkin
 * (spec testlarida ishlatilgan qiymat), `Wort.tts` esa faqat
 * `string | undefined`. Haqiqiy `Wort[]` (JSON'dan o'qilgan) shu tipga
 * strukturaviy mos keladi — ortiqcha maydonlar muammo emas.
 */
export type SprachEintrag = Pick<Wort, 'sourceId' | 'de'> & {
  tts?: string | null;
};

/**
 * Chaqiruvdan OLDIN to'xtatuvchi himoya. Har qanday `fal.ai` so'rovidan
 * OLDIN chaqiriladi — noto'g'ri kirish ma'lumoti pulni sarflab bo'lgandan
 * keyin emas, sarflashdan OLDIN to'xtaydi.
 */
export function pruefeBudget(zeichenzahl: number): void {
  if (zeichenzahl > BELGI_CHEGARASI) {
    throw new Error(
      `Narx chegarasi oshib ketdi: ${zeichenzahl} belgi (chegara ${BELGI_CHEGARASI}). Chaqiruv TO'XTATILDI, hech narsa yuborilmadi.`,
    );
  }
}

/**
 * TTS'ga yuboriladigan matn. Harf va raqamlar uchun kritik: `Z` ni TTS
 * inglizcha o'qiydi, `Zett` esa nemischa — shuning uchun `tts` bor bo'lsa
 * O'SHA ishlatiladi, aks holda `de`ning o'zi.
 */
export function sprechtext(wort: Pick<SprachEintrag, 'de' | 'tts'>): string {
  return wort.tts ?? wort.de;
}

/** Berilgan so'zlar ro'yxatining jami belgi soni (`sprechtext` bo'yicha). */
export function gesamtZeichenzahl(woerter: SprachEintrag[]): number {
  return woerter.reduce((sum, w) => sum + sprechtext(w).length, 0);
}

/**
 * Manifestda ALLAQACHON kaliti bor so'zlarni chiqarib tashlaydi —
 * idempotentlikning yuragi. Qayta yuritish shu funksiya tufayli pul
 * sarflamaydi va mavjud audioni almashtirmaydi.
 */
export function zuGenerieren(
  woerter: SprachEintrag[],
  manifest: AudioManifest,
): SprachEintrag[] {
  return woerter.filter(
    (w) => audioSchluesselFuer(manifest, w.sourceId) === null,
  );
}

/** Bitta so'zning yuklash natijasi — kalit va muvaffaqiyat belgisi. */
export interface YuklashNatijasi {
  sourceId: string;
  key: string;
  ok: boolean;
}

/**
 * Manifestni FAQAT muvaffaqiyatli yuklangan kalitlar bilan yangilaydi.
 * `ok: false` bo'lgan yozuv manifestga hech qachon tushmaydi — aks holda
 * u R2'da yo'q faylga ishora qilardi va o'quvchi yangramaydigan tugmani
 * ko'rardi.
 */
export function manifestAktualisieren(
  manifest: AudioManifest,
  natijalar: YuklashNatijasi[],
): AudioManifest {
  const yangi: AudioManifest = { ...manifest };
  for (const n of natijalar) {
    if (n.ok) yangi[n.sourceId] = n.key;
  }
  return yangi;
}

/** `--stimme` bayrog'i yo'q yoki qiymatsiz bo'lsa tashlanadi. */
export class MissingStimmeArgError extends Error {}

/**
 * `--stimme` bayrog'ini o'qiydi. `none` — Chatterbox (stimme'siz
 * `FalClient.speech()`); boshqa har qanday qiymat — ElevenLabs ovoz nomi
 * (`FalClient.speechMitStimme()`ga uzatiladi).
 *
 * Standart qiymat ATAYLAB yo'q: bayroqsiz yugurish `MissingStimmeArgError`
 * bilan yiqiladi. Chatterbox ham "standart" emas, balki `--stimme none`
 * bilan ATAYLAB tanlanadigan variantlardan biri — shu bilan skript hech
 * qachon tasodifan (masalan bayroq yozishni unutib) noto'g'ri ovozda
 * yugurmaydi.
 */
export function parseGenAudioArgs(argv: string[]): { stimme: string | null } {
  const idx = argv.indexOf('--stimme');
  const value = idx === -1 ? undefined : argv[idx + 1];
  if (!value) {
    throw new MissingStimmeArgError(
      '`--stimme` MAJBURIY — Task-6 namunalarini eshitib tanlangan ovoz. ' +
        'Chatterbox uchun `--stimme none`, ElevenLabs uchun ovoz nomi (masalan `--stimme Rachel`).',
    );
  }
  return { stimme: value === 'none' ? null : value };
}

function manifestOquv(): AudioManifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
}

async function main() {
  let args: { stimme: string | null };
  try {
    args = parseGenAudioArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof MissingStimmeArgError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const dataset: WoerterFile = JSON.parse(readFileSync(WOERTER_PATH, 'utf8'));
  const manifest = manifestOquv();

  const qoldi = zuGenerieren(dataset.woerter, manifest);
  console.log(
    `${dataset.unit}: ${dataset.woerter.length} so'zdan ${qoldi.length} tasiga audio kerak ` +
      `(${dataset.woerter.length - qoldi.length} tasi manifestda allaqachon bor).`,
  );

  if (qoldi.length === 0) {
    console.log("Qilinadigan ish yo'q — hammasida allaqachon audio bor.");
    return;
  }

  // Budjet — birinchi `fal.ai` so'rovidan OLDIN, FAL_KEY tekshiruvidan
  // ham OLDIN: noto'g'ri kirish ma'lumoti pul sarflashdan oldin to'xtashi
  // kerak, muhit sozlanmagani aniqlangandan keyin emas.
  const gesamt = gesamtZeichenzahl(qoldi);
  console.log(`Jami belgi soni: ${gesamt} (chegara ${BELGI_CHEGARASI}).`);
  try {
    pruefeBudget(gesamt);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
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
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const uploader = new R2Uploader(s3, process.env.R2_BUCKET_NAME!);

  const attribution = args.stimme
    ? `DaF Sprachzentrum — fal.ai ElevenLabs (${args.stimme})`
    : 'DaF Sprachzentrum — fal.ai Chatterbox';

  const assets: AssetRef[] = [];
  const keyBySourceId = new Map<string, string>();

  let done = 0;
  for (const wort of qoldi) {
    const text = sprechtext(wort);
    let sourceUrl: string;
    try {
      sourceUrl = args.stimme
        ? await fal.speechMitStimme(text, args.stimme)
        : await fal.speech(text);
    } catch (err) {
      // Qaysi so'z yiqilganini ANIQ aytish — 53 tadan qaysi biri
      // muammoli ekanini operator darhol bilishi kerak.
      throw new Error(
        `"${wort.de}" (${wort.sourceId}) uchun ovoz yasalmadi: ${(err as Error).message}`,
      );
    }

    // Kalit TASODIFIY — so'zdan yoki `sourceId`dan hisoblanmaydi
    // (`neuerAudioSchluessel()` argument olmaydi). Shu skript kalit bilan
    // so'zning TO'QNASHGAN yagona joyi, shuning uchun bog'liqlik shu
    // yerda ham qasddan yaratilmaydi.
    const key = neuerAudioSchluessel();
    keyBySourceId.set(wort.sourceId, key);
    assets.push({
      sourceUrl,
      key,
      kind: 'AUDIO',
      license: LICENSE,
      attribution,
      title: wort.de,
    });
    done++;
    console.log(`  ${done}/${qoldi.length}: ${wort.de} → "${text}"`);
  }

  const uploadResult = await uploader.uploadMissing(assets);
  console.log(
    `\nR2: yuklandi ${uploadResult.uploaded}, o'tkazildi ${uploadResult.skipped}, yiqildi ${uploadResult.failed.length}`,
  );
  const failedKeys = new Set(uploadResult.failed.map((f) => f.key));
  for (const f of uploadResult.failed) {
    console.error(`  - ${f.key}: ${f.reason}`);
  }

  // FAQAT muvaffaqiyatli yuklangan kalit manifestga yoziladi — Step 6
  // talabi. `keyBySourceId` har `qoldi` a'zosi uchun to'ldirilgan
  // (yuqoridagi siklda), shuning uchun `!` xavfsiz.
  const natijalar: YuklashNatijasi[] = qoldi.map((wort) => {
    const key = keyBySourceId.get(wort.sourceId)!;
    return { sourceId: wort.sourceId, key, ok: !failedKeys.has(key) };
  });

  const yangiManifest = manifestAktualisieren(manifest, natijalar);
  writeFileSync(MANIFEST_PATH, JSON.stringify(yangiManifest, null, 2) + '\n');
  console.log(`\nManifest yangilandi: ${MANIFEST_PATH}`);

  const muvaffaqiyatsiz = natijalar.filter((n) => !n.ok);
  if (muvaffaqiyatsiz.length > 0) {
    console.error(
      `\nDIQQAT: ${muvaffaqiyatsiz.length} ta so'z audiosi R2'ga yuklanmadi, manifestga YOZILMADI:`,
    );
    for (const n of muvaffaqiyatsiz) console.error(`  - ${n.sourceId}`);
    process.exitCode = 1;
  }

  console.log(
    `\n${natijalar.length - muvaffaqiyatsiz.length}/${natijalar.length} ta so'z audiosi muvaffaqiyatli yuklandi.`,
  );
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda yuguradi — bu skript
// PULLIK (fal.ai ovoz generatsiyasi + R2 yuklash) va TASODIFIY ovoz bilan
// yugursa, ovoz tanlovi hali qilinmagani sababli xato natija chiqaradi.
// Testlar bu faylni import qilganda `require.main !== module`, shuning
// uchun hech qanday tarmoq so'rovi test paytida ishga tushmaydi
// (`daf-voice-samples.ts`/`daf-gen-images.ts` dagi bilan bir xil naqsh).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
