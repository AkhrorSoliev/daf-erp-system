import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePhoneticsPage } from './dib-phonetics.parser';

const REAL = readFileSync(
  join(__dirname, '__fixtures__', 'pho-k1.html'),
  'utf8',
);

describe('parsePhoneticsPage — haqiqiy sahifada', () => {
  it("1-bobning barcha audio bo'limlarini beradi", () => {
    const items = parsePhoneticsPage(REAL, 1);
    expect(items.length).toBeGreaterThanOrEqual(30);
  });

  it("id'ni audio fayl nomidan oladi", () => {
    const items = parsePhoneticsPage(REAL, 1);
    expect(items[0].id).toBe('pho_01_01_abc');
    expect(items[0].chapter).toBe(1);
  });

  it('audio aktivini litsenziyasi bilan beradi', () => {
    const items = parsePhoneticsPage(REAL, 1);
    expect(items[0].audio.key).toBe('dib/audio/pho_01_01_abc.mp3');
    expect(items[0].audio.license).toBe('CC BY 4.0');
  });

  it("birinchi bo'limda nemis alifbosi bor", () => {
    const items = parsePhoneticsPage(REAL, 1);
    expect(items[0].textDe).toContain('Ä');
    expect(items[0].textDe).toContain('ß');
  });

  it('inglizcha izohni overlib() ichidan oladi', () => {
    const items = parsePhoneticsPage(REAL, 1);
    const withGloss = items.find((i) => i.textEn.length > 0)!;
    expect(withGloss).toBeDefined();
    expect(withGloss.textEn).not.toContain('overlib');
  });

  it("bo'lim izohini beradi", () => {
    const items = parsePhoneticsPage(REAL, 1);
    expect(items[0].caption.toLowerCase()).toContain('listen');
  });

  it('hech bir chiqishda HTML tegi qolmaydi', () => {
    const items = parsePhoneticsPage(REAL, 1);
    const bad = items.filter(
      (i) => i.textDe.includes('<') || i.textEn.includes('<'),
    );
    expect(bad).toEqual([]);
  });

  it("audiosi yo'q sahifada bo'sh ro'yxat qaytaradi", () => {
    expect(parsePhoneticsPage('<html><body></body></html>', 7)).toEqual([]);
  });
});
