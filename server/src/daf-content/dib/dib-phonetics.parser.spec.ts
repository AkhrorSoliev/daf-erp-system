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

  // Manbada har misol so'zning birinchi harfi <span> bilan ta'kidlangan
  // (masalan `das <span ...>A</span>usland`). `stripTags` bu tegni bo'shliq
  // bilan almashtirsa, so'z "A usland" bo'lib ikkiga bo'linib qolardi — aniq
  // tenglik shuni tutib qoladi, `toContain` esa tutmas edi.
  it("'A' bo'limida so'zlar bo'linib ketmaydi", () => {
    const items = parsePhoneticsPage(REAL, 1);
    const aSection = items.find((i) => i.id === 'pho_01_02_a')!;
    expect(aSection).toBeDefined();
    expect(aSection.textDe).toContain('das Ausland');
    expect(aSection.textDe).not.toContain('A usland');
  });

  // Fonetik belgilar (masalan `&int;`, `&theta;`) `decodeEntities`'ning NAMED
  // jadvalida bo'lmasa, xom entity sifatida chiqib ketardi — aynan shu
  // modul buni o'quvchiga o'rgatishi kerak bo'lgan joyda. Faqat birinchi
  // elementni emas, BARCHASINI tekshiradi.
  it('hech bir elementda xom entity yoki overlib qoldiqi qolmaydi', () => {
    const items = parsePhoneticsPage(REAL, 1);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.textDe).not.toMatch(/&[A-Za-z]+;/);
      expect(item.textEn).not.toMatch(/&[A-Za-z]+;/);
      expect(item.textDe).not.toContain('overlib');
      expect(item.textEn).not.toContain('overlib');
      expect(item.textDe).not.toContain('<');
      expect(item.textEn).not.toContain('<');
    }
  });

  it("audiosi yo'q sahifada bo'sh ro'yxat qaytaradi", () => {
    expect(parsePhoneticsPage('<html><body></body></html>', 7)).toEqual([]);
  });
});

// Task 6: `overlib('…')` payload'i ichida `<br />` uchrashi mumkin (4-bob
// qofiyali mashqlari, masalan «The fat roofer roofed the thick
// roof.<br />Then the fat roofer…»). Eski kod faqat `decodeEntities`
// chaqirardi, `stripTags` emas — xom `<br />` `textEn`ga sizib chiqqan edi.
describe('parsePhoneticsPage — overlib ichidagi <br /> tozalanadi', () => {
  const PAGE_WITH_BR_GLOSS = `
<html><body>
<p class="bot_075"><i>Listen:</i></p>
<div id="fp_01">
  <audio controls="controls">
    <source src="https://media.la.utexas.edu:443/dib/audio/pho_04_01_reim.mp3" type="audio/mpeg" />
  </audio>
</div>
<div id="ps_01" class="aud_txt">
  <a href="javascript:;" onmouseover="return overlib('The fat roofer roofed the thick roof.<br />Then the fat roofer carried the lady.')">Der dicke Dachdecker deckte das Dach.</a>
</div>
<div id="ps_01_t" class="aud_txtt"></div>
</body></html>`;

  it("gloss ichidagi <br /> bo'shliqqa almashadi, xom teg qolmaydi", () => {
    const items = parsePhoneticsPage(PAGE_WITH_BR_GLOSS, 4);
    expect(items).toHaveLength(1);
    expect(items[0].textEn).not.toContain('<');
    expect(items[0].textEn).toContain(
      'The fat roofer roofed the thick roof. Then the fat roofer carried the lady.',
    );
  });
});
