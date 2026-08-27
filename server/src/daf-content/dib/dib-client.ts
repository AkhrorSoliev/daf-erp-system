import { CachedHttpClient } from '../http/cached-http-client';

export const DIB_BASE = 'https://coerll.utexas.edu/dib/';
export const DIB_MEDIA_BASE = 'https://media.la.utexas.edu/dib/';

/**
 * DiB sahifalarini olib, diskka keshlaydi.
 *
 * Kesh va tarmoq mantiqi `CachedHttpClient` da — bu klient faqat DiB'ga xos
 * bazaviy URL'ni qo'shadi.
 */
export class DibClient {
  private readonly http: CachedHttpClient;

  constructor(cacheDir: string, fetchFn: typeof fetch = fetch) {
    this.http = new CachedHttpClient(cacheDir, fetchFn);
  }

  fetchText(path: string): Promise<string> {
    return this.http.fetchText(DIB_BASE + path);
  }
}
