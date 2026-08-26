import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export const ZUM_API = 'https://deutsch-lernen.zum.de/api.php';
export const ZUM_APPS = 'https://apps.zum.de/apps/';

/**
 * ZUM ikkita xostda yashaydi: wiki (`deutsch-lernen.zum.de`) va H5P
 * ilovalari (`apps.zum.de`). Klient ikkalasini ham keshlaydi — sabab
 * `DibClient` dagi bilan bir xil.
 */
export class ZumClient {
  constructor(
    private readonly cacheDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async get(url: string, tag: string): Promise<string> {
    const name = `${tag}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
    const file = join(this.cacheDir, name);
    if (existsSync(file)) return readFileSync(file, 'utf8');

    const res = await this.fetchFn(url, {
      headers: { 'user-agent': 'daf-erp-content-harvest' },
    });
    if (!res.ok) throw new Error(`ZUM javob bermadi (${res.status}): ${url}`);
    const text = await res.text();

    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(file, text, 'utf8');
    return text;
  }

  categoryMembers(category: string): Promise<string> {
    const u = new URL(ZUM_API);
    u.searchParams.set('action', 'query');
    u.searchParams.set('list', 'categorymembers');
    u.searchParams.set('cmtitle', `Kategorie:${category}`);
    u.searchParams.set('cmlimit', '500');
    u.searchParams.set('format', 'json');
    return this.get(u.toString(), 'cat');
  }

  wikitext(title: string): Promise<string> {
    const u = new URL(ZUM_API);
    u.searchParams.set('action', 'parse');
    u.searchParams.set('page', title);
    u.searchParams.set('prop', 'wikitext');
    u.searchParams.set('format', 'json');
    return this.get(u.toString(), 'wt');
  }

  h5pPage(id: number): Promise<string> {
    return this.get(`${ZUM_APPS}${id}`, 'h5p');
  }
}
