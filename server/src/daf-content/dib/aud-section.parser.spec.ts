import { parseAudSections, stripTags } from './aud-section.parser';

const PAGE = `
<html><body>
<p class="bot_075"><i>Listen to the alphabet:</i></p>
<div id="fp_01">
  <audio controls="controls">
    <source src="https://media.la.utexas.edu:443/gg/audio/vi_05_01_haben.mp3" type="audio/mpeg" />
  </audio>
</div>
<div id="ps_01" class="aud_txt">
  <div class="bot_000">ich habe &#149; wir haben</div>
</div>
<div id="ps_01_t" class="aud_txtt"></div>

<p class="bot_075"><i>Listen to the dialogue:</i></p>
<div id="fp_02">
  <audio controls="controls">
    <source src="https://media.la.utexas.edu:443/gg/audio/vi_05_02_dialog.mp3" type="audio/mpeg" />
  </audio>
</div>
<div id="ps_02" class="aud_txt">
  <table class="unbor"><tr><td>Rotk&auml;ppchen</td></tr></table>
</div>
<div id="ps_02_t" class="aud_txtt"></div>
</body></html>`;

describe('stripTags', () => {
  it('teglarni olib tashlab, belgilarni tiklaydi', () => {
    expect(stripTags('<b>Tsch&uuml;ss</b> &#149; bye')).toBe('Tschüss • bye');
  });

  it("ketma-ket bo'shliqlarni bittaga keltiradi", () => {
    expect(stripTags('a\n\n  <i>b</i>   c')).toBe('a b c');
  });

  // Manba so'z ICHIDA bitta harfni <span> bilan ta'kidlaydi (masalan
  // `A<span>usland</span>` — real sahifada `das <span ...>A</span>usland`).
  // Bu inline teg bo'shliqqa almashtirilsa, so'z ikkiga bo'linib qolardi.
  it("so'z ichidagi <span> so'zni bo'lib yubormaydi", () => {
    expect(stripTags('das <span class="hi_11_0057d1">A</span>usland')).toBe(
      'das Ausland',
    );
  });

  // `<br>` esa qatorni AJRATADI — ikkala tomonidagi so'z tutashib qolmasligi
  // uchun bo'shliq saqlanishi shart.
  it("<br> ikki so'z orasida bo'shliqni saqlaydi", () => {
    expect(stripTags('erste Zeile<br>zweite Zeile')).toBe(
      'erste Zeile zweite Zeile',
    );
  });
});

describe('parseAudSections', () => {
  it("har audio blokini o'z mazmuni bilan juftlaydi", () => {
    const s = parseAudSections(PAGE);
    expect(s).toHaveLength(2);
    expect(s[0].index).toBe(1);
    expect(s[0].audioUrl).toBe(
      'https://media.la.utexas.edu:443/gg/audio/vi_05_01_haben.mp3',
    );
    expect(stripTags(s[0].contentHtml)).toBe('ich habe • wir haben');
  });

  it("bo'lim izohini oldingi kursiv qatordan oladi", () => {
    const s = parseAudSections(PAGE);
    expect(s[0].caption).toBe('Listen to the alphabet:');
    expect(s[1].caption).toBe('Listen to the dialogue:');
  });

  it("ikkinchi bo'limning mazmuni birinchisiga qo'shilib ketmaydi", () => {
    const s = parseAudSections(PAGE);
    expect(s[0].contentHtml).not.toContain('Rotk');
    expect(s[1].contentHtml).toContain('Rotk');
  });

  it("`ps_NN_t` bo'sh qutisini mazmun deb hisoblamaydi", () => {
    const s = parseAudSections(PAGE);
    expect(s.map((x) => x.index)).toEqual([1, 2]);
  });

  it("audio bloki yo'q sahifada bo'sh ro'yxat qaytaradi", () => {
    expect(parseAudSections('<html><body><p>x</p></body></html>')).toEqual([]);
  });
});
