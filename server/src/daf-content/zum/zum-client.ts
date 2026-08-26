import { CachedHttpClient } from '../http/cached-http-client';

export const ZUM_API = 'https://deutsch-lernen.zum.de/api.php';
export const ZUM_APPS = 'https://apps.zum.de/apps/';

/**
 * ZUM ikkita xostda yashaydi: wiki (`deutsch-lernen.zum.de`) va H5P
 * ilovalari (`apps.zum.de`). Kesh va tarmoq mantiqi `CachedHttpClient` da —
 * bu klient faqat ZUM'ga xos URL'larni yasaydi.
 */
export class ZumClient {
  private readonly http: CachedHttpClient;

  constructor(cacheDir: string, fetchFn: typeof fetch = fetch) {
    this.http = new CachedHttpClient(cacheDir, fetchFn);
  }

  private get(url: string): Promise<string> {
    return this.http.fetchText(url);
  }

  categoryMembers(category: string): Promise<string> {
    const u = new URL(ZUM_API);
    u.searchParams.set('action', 'query');
    u.searchParams.set('list', 'categorymembers');
    u.searchParams.set('cmtitle', `Kategorie:${category}`);
    u.searchParams.set('cmlimit', '500');
    u.searchParams.set('format', 'json');
    return this.get(u.toString());
  }

  wikitext(title: string): Promise<string> {
    const u = new URL(ZUM_API);
    u.searchParams.set('action', 'parse');
    u.searchParams.set('page', title);
    u.searchParams.set('prop', 'wikitext');
    u.searchParams.set('format', 'json');
    return this.get(u.toString());
  }

  h5pPage(id: number): Promise<string> {
    return this.get(`${ZUM_APPS}${id}`);
  }
}
