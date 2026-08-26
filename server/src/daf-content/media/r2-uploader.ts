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
 * Aktivlarni R2'ga chiqaradi. R2 S3-mos, shuning uchun mavjud
 * `@aws-sdk/client-s3` ishlatiladi — yangi paket kerak emas.
 *
 * Idempotent: `HeadObject` bilan tekshiradi va bor faylni qayta yuklamaydi.
 * Buning sababi amaliy — 268 video ≈ 1.27 GB, va quvur uzilib qolsa qaytadan
 * boshidan yuklash soatlab vaqt olardi.
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
    } catch {
      return false;
    }
  }

  async uploadMissing(
    assets: AssetRef[],
  ): Promise<{ uploaded: number; skipped: number; failed: string[] }> {
    let uploaded = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const a of assets) {
      if (await this.exists(a.key)) {
        skipped++;
        continue;
      }

      try {
        const res = await this.fetchFn(a.sourceUrl);
        if (!res.ok) {
          failed.push(a.key);
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
              license: a.license,
              attribution: a.attribution,
              source: a.sourceUrl,
            },
          }),
        );
        uploaded++;
      } catch {
        failed.push(a.key);
      }
    }

    return { uploaded, skipped, failed };
  }
}
