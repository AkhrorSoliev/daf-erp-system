import { CachedHttpClient } from '../http/cached-http-client';

export const WS_BASE = 'https://wort.schule/';

/**
 * `wort.schule` har so'z uchun JSON endpointi beradi: `/<lemma>.json`.
 *
 * Topilmagan so'z HTML 404 sahifasini qaytaradi, JSON emas — shuning uchun
 * `fetchWord` xato TASHLAMAYDI, `null` qaytaradi. 1 843 leksemadan yarmi
 * topilmasligi kutilgan holat, har biri uchun yiqilish quvurni to'xtatardi.
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
    } catch {
      return null;
    }
  }
}
