import { CachedHttpClient } from '../http/cached-http-client';

export const WS_BASE = 'https://wort.schule/';

/** `CachedHttpClient.fetchText` xato xabariga status kodini shu shaklda qo'shadi. */
const NOT_FOUND_PATTERN = /\(404\):/;

/**
 * `wort.schule` har so'z uchun JSON endpointi beradi: `/<lemma>.json`.
 *
 * Topilmagan so'z HTTP 404 status bilan HTML sahifa qaytaradi, JSON emas —
 * `CachedHttpClient` buni "Manba javob bermadi (404): <url>" xatosi sifatida
 * tashlaydi. Bu xato "so'z yo'q" degani, shuning uchun `fetchWord` uni yutib,
 * `null` qaytaradi.
 *
 * Boshqa har qanday xato — tarmoq uzilishi, 5xx, cheklov (429) — "so'z yo'q"
 * EMAS, chinakam nosozlik. Ularni ham yutib yuborsak, sayt vaqtincha
 * bloklaganda ham quvur "yarmi topilmadi" deb noto'g'ri xulosaga keladi va
 * bu ikkalasi bir-biridan ajratib bo'lmaydigan holatga aylanadi. Shuning
 * uchun ular qayta tashlanadi (rethrow) — chaqiruvchi (Task 7 yig'uvchisi)
 * buni ko'radi va quvurni to'xtatishi yoki qayta urinishi mumkin.
 */
export class WortSchuleClient {
  private readonly http: CachedHttpClient;

  constructor(cacheDir: string, fetchFn: typeof fetch = fetch) {
    this.http = new CachedHttpClient(cacheDir, fetchFn);
  }

  async fetchWord(lemma: string): Promise<string | null> {
    try {
      return await this.http.fetchText(
        `${WS_BASE}${encodeURIComponent(lemma)}.json`,
      );
    } catch (err) {
      if (err instanceof Error && NOT_FOUND_PATTERN.test(err.message)) {
        return null;
      }
      throw err;
    }
  }
}
