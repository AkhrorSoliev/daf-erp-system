import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Kesh fayl nomi URL'ning sha1'idan olinadi.
 *
 * Oldingi DiB klienti kalitni `path.replace(/[/?&]/g, '_')` bilan yasagan edi:
 * uchta har xil ajratgich bir xil belgiga aylanardi va yo'lning ichidagi
 * mavjud `_` ekranlanmasdi, ya'ni ikki boshqa URL bir faylga tushishi mumkin
 * edi. Hash bunday to'qnashuvni butunlay yopadi.
 */
export function cacheKeyFor(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 24);
}

/**
 * Manbalardan matn olib, diskka keshlaydi. Uchala adapter shuni ishlatadi.
 *
 * Kesh ixtiyoriy tezlashtirish emas, ATAYIN: quvur ishlab chiqilayotib o'nlab
 * marta qayta ishga tushadi, va har safar manbani yuzlab so'rov bilan urish
 * na xushmuomalalik, na ishonchli. Kesh o'chirilsa manba qaytadan o'qiladi.
 */
export class CachedHttpClient {
  constructor(
    private readonly cacheDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async fetchText(url: string): Promise<string> {
    const file = join(this.cacheDir, cacheKeyFor(url));
    if (existsSync(file)) return readFileSync(file, 'utf8');

    const res = await this.fetchFn(url, {
      headers: { 'user-agent': 'daf-erp-content-harvest' },
    });
    if (!res.ok) {
      throw new Error(`Manba javob bermadi (${res.status}): ${url}`);
    }
    const text = await res.text();

    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(file, text, 'utf8');
    return text;
  }
}
