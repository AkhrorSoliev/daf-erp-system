import type { AssetRef, SourceId } from './dataset.types';

/**
 * Har manba shu kontraktga quriladi (o'zak dizayni, 4-bo'lim).
 *
 * `harvest` va `map` ATAYLAB ajratilgan: xaritalash sof funksiya bo'lsa, uni
 * tarmoqsiz test qilish mumkin va manba o'chib qolganda ham qayta ishga
 * tushadi. Faza 1 da bu ajratma yozilmagan edi va ikki adapter bir-biridan
 * uzoqlashib ketgan edi.
 */
export interface DafSourceAdapter<Raw, Mapped> {
  readonly source: SourceId;

  /** Manbadan xom yozuvlarni oqim sifatida beradi. Tarmoq FAQAT shu yerda. */
  harvest(): AsyncIterable<Raw>;

  /** Xom yozuvni o'zak shakliga o'giradi. Sof funksiya — tarmoqqa tegmaydi. */
  map(raw: Raw): Mapped;

  /** R2'ga ketadigan fayllar. Litsenziyasi bilan birga. */
  assets(raw: Raw): AssetRef[];
}
