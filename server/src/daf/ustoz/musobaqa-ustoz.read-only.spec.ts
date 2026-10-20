import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * S5 ustoz ko'rinishi hech narsa YOZMAYDI (spec S5 §1, ADR-0118). Bu papkaga
 * yozuvchi chaqiruv kirib qolsa test yiqiladi.
 */
const YOZUVCHI =
  /\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(|\$executeRaw|\bINSERT\b|\bUPDATE\b|\bDELETE\b/;

describe('S5 ustoz ko‘rinishi faqat o‘qiydi', () => {
  const papka = __dirname;
  const fayllar = readdirSync(papka).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  );
  it('papkada kamida servis, sql, qoidalar va kontroller bor', () => {
    expect(fayllar.length).toBeGreaterThanOrEqual(5);
  });
  it.each(fayllar)('%s yozuvchi chaqiruv yo‘q', (f) => {
    const src = readFileSync(join(papka, f), 'utf8')
      // izohlarni olib tashla: izohdagi so'z yolg'on signal bermasin
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(YOZUVCHI);
  });
});
