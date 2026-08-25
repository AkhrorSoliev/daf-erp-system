import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const DIB_BASE = 'https://coerll.utexas.edu/dib/';
export const DIB_MEDIA_BASE = 'https://media.la.utexas.edu/dib/';

/**
 * DiB sahifalarini olib, diskka keshlaydi.
 *
 * Kesh ixtiyoriy tezlashtirish emas, ATAYIN: yig'ish quvuri ishlab chiqilayotib
 * o'nlab marta qayta ishga tushadi, va har safar universitet serverini 300+
 * so'rov bilan urish — na xushmuomalalik, na ishonchli. Kesh o'chirilsa
 * (`rm -rf .cache/daf`) manba qaytadan o'qiladi.
 */
export class DibClient {
  constructor(
    private readonly cacheDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async fetchText(path: string): Promise<string> {
    const file = join(this.cacheDir, path.replace(/[/?&]/g, '_') + '.html');
    if (existsSync(file)) return readFileSync(file, 'utf8');

    const res = await this.fetchFn(DIB_BASE + path, {
      headers: { 'user-agent': 'daf-erp-content-harvest' },
    });
    if (!res.ok) {
      throw new Error(`DiB javob bermadi (${res.status}): ${path}`);
    }
    const text = await res.text();

    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(file, text, 'utf8');
    return text;
  }
}
