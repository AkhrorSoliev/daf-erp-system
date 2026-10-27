import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  jangFayliXatolari,
  type JangSavolFayli,
} from './jang-savollari.validate';

const DIR = join(__dirname, '..', '..', '..', 'content', 'daf', 'jang');
const eshitish = JSON.parse(
  readFileSync(join(DIR, 'eshitish-uzunligi.json'), 'utf8'),
) as Record<string, number>;
const fayllar = readdirSync(DIR).filter((f) => /^a1-u\d{2}\.json$/.test(f));

describe('content/daf/jang', () => {
  it('kamida u01–u06 bor', () =>
    expect(fayllar.length).toBeGreaterThanOrEqual(6));
  it.each(fayllar)('%s xatosiz', (f) => {
    const fayl = JSON.parse(
      readFileSync(join(DIR, f), 'utf8'),
    ) as JangSavolFayli;
    expect(jangFayliXatolari(fayl, eshitish)).toEqual([]);
  });
  it('id lar fayllar orasida ham takrorlanmaydi', () => {
    const ids = fayllar.flatMap((f) =>
      (
        JSON.parse(readFileSync(join(DIR, f), 'utf8')) as JangSavolFayli
      ).savollar.map((s) => s.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
