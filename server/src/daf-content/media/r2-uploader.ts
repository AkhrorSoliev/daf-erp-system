import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { AssetRef } from '../dataset.types';

const CONTENT_TYPE: Record<AssetRef['kind'], string> = {
  AUDIO: 'audio/mpeg',
  VIDEO: 'video/mp4',
  IMAGE: 'image/jpeg',
  PDF: 'application/pdf',
};

/**
 * Tipografik belgilarni ASCII ekvivalentiga tekislaydigan jadval. Bu yerda
 * bizning manba matnlarimizda haqiqatda uchraydigan belgilar sanab o'tilgan
 * (em/en tire, qayrilma bir va qo'sh tirnoqlar, ko'p nuqta, uzilmas probel).
 */
const ASCII_FOLD_MAP: Record<string, string> = {
  '—': '-', // em tire —
  '–': '-', // en tire –
  '‘': "'", // chap bitta qayrilma tirnoq '
  '’': "'", // o'ng bitta qayrilma tirnoq '
  '“': '"', // chap qo'sh qayrilma tirnoq "
  '”': '"', // o'ng qo'sh qayrilma tirnoq "
  '…': '...', // ko'p nuqta …
  ' ': ' ', // uzilmas probel
};

/**
 * S3/R2 metama'lumoti HTTP sarlavha sifatida yuboriladi, va Node ASCII
 * bo'lmagan belgini sarlavha qiymatida rad etadi (`ERR_INVALID_CHAR`).
 * Shuning uchun R2'ga ketuvchi metama'lumot satrlari shu funksiya orqali
 * tekislanadi: yuqoridagi jadvaldagi tipografik belgilar mos ASCII
 * ekvivalentiga almashtiriladi, qolgan har qanday ASCII bo'lmagan belgi esa
 * xavfsizlik to'ri sifatida `?` bilan almashtiriladi — shu bilan hech narsa
 * sezilmay o'tib ketmaydi. Dataset va manifestdagi asl (tekislanmagan)
 * qiymat — huquqiy jihatdan asosiy hisoblanadigan nusxa — o'zgarmaydi;
 * faqat R2 sarlavhasiga ketadigan nusxa tekislanadi.
 */
export function asciiMetadata(value: string): string {
  let out = '';
  for (const ch of value) {
    const folded = ASCII_FOLD_MAP[ch];
    if (folded !== undefined) {
      out += folded;
    } else if (ch.charCodeAt(0) > 127) {
      out += '?';
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * `HeadObject` xatosi haqiqatan ham "obyekt yo'q" degani bo'lsa `true`
 * qaytaradi (AWS SDK buni `NotFound`/`NoSuchKey` nomi yoki 404 http-status
 * orqali bildiradi). Boshqa har qanday xato — noto'g'ri credentials, yopiq
 * endpoint, ruxsat yo'qligi — chaqiruvchiga qayta uloqtiriladi, chunki uni
 * "mavjud emas" deb hisoblash butun korpusni behuda qayta yuklashga olib
 * keladi.
 */
function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (e.name === 'NotFound' || e.name === 'NoSuchKey') return true;
  const status = e.$metadata?.httpStatusCode;
  return status === 404;
}

/** Xatoni diagnostik satrga aylantiradi — `failed` ro'yxati sababsiz bo'lmasligi uchun. */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; name?: unknown };
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.name === 'string' && e.name) return e.name;
  }
  return String(err);
}

/**
 * Aktivlarni R2'ga chiqaradi. R2 S3-mos, shuning uchun mavjud
 * `@aws-sdk/client-s3` ishlatiladi — yangi paket kerak emas.
 *
 * Idempotent: `HeadObject` bilan tekshiradi va bor faylni qayta yuklamaydi.
 * Buning sababi amaliy — 268 video ≈ 1.27 GB, va quvur uzilib qolsa qaytadan
 * boshidan yuklash soatlab vaqt olardi. Faqat haqiqiy "obyekt yo'q" xatosi
 * "yuklash kerak" deb talqin qilinadi; boshqa xato (masalan noto'g'ri
 * credentials) darhol yuqoriga uloqtiriladi — aks holda butun korpus
 * behuda yuklab olinib, keyin har bir `PutObject` ham muvaffaqiyatsiz
 * tugagan bo'lardi.
 *
 * Litsenziya va muallif R2 metama'lumotiga yoziladi (spec Q9): aktiv qayerga
 * ko'chirilsa ham, kimning ishi ekani u bilan birga ketadi.
 */
export class R2Uploader {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (isMissingObjectError(err)) return false;
      throw err;
    }
  }

  async uploadMissing(
    assets: AssetRef[],
  ): Promise<{
    uploaded: number;
    skipped: number;
    failed: { key: string; reason: string }[];
  }> {
    let uploaded = 0;
    let skipped = 0;
    const failed: { key: string; reason: string }[] = [];

    for (const a of assets) {
      if (await this.exists(a.key)) {
        skipped++;
        continue;
      }

      try {
        const res = await this.fetchFn(a.sourceUrl);
        if (!res.ok) {
          failed.push({ key: a.key, reason: `HTTP ${res.status}` });
          continue;
        }
        const body = Buffer.from(await res.arrayBuffer());

        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: a.key,
            Body: body,
            ContentType: CONTENT_TYPE[a.kind],
            Metadata: {
              license: asciiMetadata(a.license),
              attribution: asciiMetadata(a.attribution),
              source: asciiMetadata(a.sourceUrl),
            },
          }),
        );
        uploaded++;
      } catch (err) {
        failed.push({ key: a.key, reason: describeError(err) });
      }
    }

    return { uploaded, skipped, failed };
  }
}
