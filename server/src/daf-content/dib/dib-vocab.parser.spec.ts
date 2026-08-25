import { parseVocabPage } from './dib-vocab.parser';
import { decodeEntities } from './html-entities';

const HTML = `
<html><body>
<ul><li><span class="hi_12_0057d1">Sections</span></li></ul>
<a href="https://media.la.utexas.edu:443/dib/audio/voc_01_01_begr.mp3">audio</a>
<span class="hi_12_0057d1">Begr&uuml;&szlig;ungen  </span>
<span class="sm_sepbull">&#149;</span>
<span class="hi_12_0057d1">Greetings </span>
<table>
<tr onmouseover="this.className='vtr_over'"><td>Hallo!</td><td>Hello!</td></tr>
<tr onmouseover="this.className='vtr_over'"><td>Tsch&uuml;ss!</td><td>Bye!</td></tr>
</table>
<a href="https://media.la.utexas.edu:443/dib/audio/voc_01_02_werbistdu.mp3">audio</a>
<span class="hi_12_0057d1">Zahlen</span>
<span class="hi_12_0057d1">Numbers</span>
<table>
<tr onmouseover="this.className='vtr_over'"><td>eins</td><td>one</td></tr>
</table>
</body></html>`;

describe('decodeEntities', () => {
  it('nemis harflarini tiklaydi', () => {
    expect(decodeEntities('Tsch&uuml;ss! Gru&szlig;')).toBe('Tschüss! Gruß');
  });

  it('tipografik belgilarni oddiy shaklga keltiradi', () => {
    expect(decodeEntities('Mach&rsquo;s gut')).toBe('Mach’s gut');
    expect(decodeEntities('&ldquo;good day&rdquo;')).toBe('“good day”');
  });

  it('&nbsp; ni oddiy bo\'shliqqa aylantiradi', () => {
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });

  it('Windows-1252 raqamli havolani to\'g\'ri belgiga aylantiradi', () => {
    // 149 Unicode'da boshqaruv belgisi; DiB uni «•» ma'nosida ishlatadi
    expect(decodeEntities('Kap 01 &#149; Adan')).toBe('Kap 01 • Adan');
    expect(decodeEntities('&#150;')).toBe('–');
  });
});

describe('parseVocabPage', () => {
  it('har bo\'limni sarlavhasi va audiosi bilan ajratadi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s).toHaveLength(2);
    expect(s[0].titleDe).toBe('Begrüßungen');
    expect(s[0].titleEn).toBe('Greetings');
    expect(s[0].chapter).toBe(1);
    expect(s[0].audio?.key).toBe('dib/audio/voc_01_01_begr.mp3');
    expect(s[0].audio?.license).toBe('CC BY 4.0');
    expect(s[1].titleDe).toBe('Zahlen');
  });

  it('yozuvlarni to\'g\'ri bo\'limga biriktiradi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s[0].entries).toEqual([
      { de: 'Hallo!', en: 'Hello!', sectionId: s[0].id },
      { de: 'Tschüss!', en: 'Bye!', sectionId: s[0].id },
    ]);
    expect(s[1].entries).toHaveLength(1);
    expect(s[1].entries[0].de).toBe('eins');
  });

  it('navigatsiyadagi «Sections» sarlavhasini bo\'lim deb hisoblamaydi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s.map((x) => x.titleDe)).not.toContain('Sections');
  });

  it('bo\'lim id\'si bob va tartib raqamidan tuziladi', () => {
    const s = parseVocabPage(HTML, 1);
    expect(s[0].id).toBe('dib-voc-01-01');
    expect(s[1].id).toBe('dib-voc-01-02');
  });

  it('lug\'ati yo\'q sahifada bo\'sh ro\'yxat qaytaradi', () => {
    expect(parseVocabPage('<html></html>', 3)).toEqual([]);
  });
});
