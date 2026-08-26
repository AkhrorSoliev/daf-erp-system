import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseTranscriptPage,
  parseVideoList,
  repairDoubleEncodedUtf8,
} from './dib-transcript.parser';

/**
 * Haqiqiy DiB transkript sahifasi shu tuzilishga ega: qatorlar `<ul>` ichida
 * `<li class="vidt_i">` (intervyuchi) va `<li class="vidt_s">` (so'zlovchi)
 * elementlarida keladi, sarlavha esa ichida ichma-ich `<span>` bo'lgan
 * `class="vidt_th"` div'ida. `vidt_g` paneli o'zi ham nested div'lardan
 * iborat (`cont_tra_g` > `tra_g`) — bu `panel()` qavs moslashtiruvchisining
 * chinakam sinovi.
 */
const PAGE = `
<html><body>
<div id="vidt_g">
<div class="vidt_th">Kap 01 <span class="sm_sepbull_vidt">&#149;</span> Adan  <span class="sm_sepbull_vidt">&#149;</span> Wer bin ich?</div>
<div class="vidt_tsl">Deutsch</div>
<div id="cont_tra_g">
<div id="tra_g">
<ul>
	<li class="vidt_i">Wie hei&szlig;t du?</li>
	<li class="vidt_s">Ich hei&szlig;e Adan.</li>
	<li class="vidt_i">Woher kommst du?</li>
</ul>
</div>
</div>
</div>
<div id="vidt_e">
<div class="vidt_th">Ch 01 <span class="sm_sepbull_vidt">&#149;</span> Adan  <span class="sm_sepbull_vidt">&#149;</span> Who am I?</div>
<div class="vidt_tsl">Englisch</div>
<div id="cont_tra_e">
<div id="tra_e">
<ul>
	<li class="vidt_i">What is your name?</li>
	<li class="vidt_s">My name is Adan.</li>
	<li class="vidt_i">Where are you from?</li>
</ul>
</div>
</div>
</div>
<div id="vidt_v"></div>
</body></html>`;

const RSS = `<rss><channel>
<item><title>Kapitel 01 - Ankunft in W&#252;rzburg</title>
<enclosure url="http://coerll.utexas.edu/dib/mp4s/01_01_intro_arrival.mp4"/></item>
<item><title>Kapitel 01 - Interviews, Adan: Wer bin ich?</title>
<enclosure url="http://coerll.utexas.edu/dib/mp4s/01_02_int_ag_who.mp4"/></item>
</channel></rss>`;

describe('parseTranscriptPage', () => {
  it('nemischa va inglizcha qatorlarni alohida oladi', () => {
    const t = parseTranscriptPage(PAGE, '01_02_int_ag_who', 1)!;
    expect(t.linesDe).toEqual([
      'Wie heißt du?',
      'Ich heiße Adan.',
      'Woher kommst du?',
    ]);
    expect(t.linesEn[1]).toBe('My name is Adan.');
  });

  it("sarlavhani ajratib oladi va matn qatoriga qo'shmaydi", () => {
    const t = parseTranscriptPage(PAGE, '01_02_int_ag_who', 1)!;
    expect(t.titleDe).toBe('Kap 01 • Adan • Wer bin ich?');
    expect(t.linesDe).not.toContain('Kap 01 • Adan • Wer bin ich?');
  });

  it('video aktivini litsenziya bilan biriktiradi', () => {
    const t = parseTranscriptPage(PAGE, '01_02_int_ag_who', 1)!;
    expect(t.video?.key).toBe('dib/video/01_02_int_ag_who.mp4');
    expect(t.video?.kind).toBe('VIDEO');
    expect(t.video?.license).toBe('CC BY 4.0');
  });

  it("nemischa matni yo'q sahifada null qaytaradi", () => {
    expect(parseTranscriptPage('<html></html>', 'x', 1)).toBeNull();
  });

  it("inglizchasi yo'q bo'lsa ham nemischasini beradi", () => {
    const only =
      '<div id="vidt_g"><ul><li class="vidt_i">Guten Tag.</li></ul></div>';
    const t = parseTranscriptPage(only, 'y', 2)!;
    expect(t.linesDe).toEqual(['Guten Tag.']);
    expect(t.linesEn).toEqual([]);
  });

  it("haqiqiy DiB sahifasini to'g'ri tahlil qiladi", () => {
    const html = readFileSync(
      join(__dirname, '__fixtures__', 'vidt-01_02.html'),
      'utf8',
    );
    const t = parseTranscriptPage(html, '01_02_int_ag_who', 1)!;
    expect(t.linesDe).toHaveLength(16);
    expect(t.linesEn).toHaveLength(16);
    expect(t.titleDe.startsWith('Kap 01')).toBe(true);
    expect(t.titleDe).toContain('•');
    expect(t.linesDe[0]).toBe('Wie heißt du?');
    for (const line of [...t.linesDe, ...t.linesEn]) {
      expect(line).not.toContain('<');
    }
  });
});

describe('parseVideoList', () => {
  it('RSS dan fayl id va sarlavhani oladi', () => {
    expect(parseVideoList(RSS)).toEqual([
      {
        fileId: '01_01_intro_arrival',
        title: 'Kapitel 01 - Ankunft in Würzburg',
      },
      {
        fileId: '01_02_int_ag_who',
        title: 'Kapitel 01 - Interviews, Adan: Wer bin ich?',
      },
    ]);
  });

  it("bo'sh RSS uchun bo'sh ro'yxat", () => {
    expect(parseVideoList('<rss></rss>')).toEqual([]);
  });

  it("ikki marta kodlangan sarlavhani ham to'g'rilaydi", () => {
    const mojibakeTitle = Buffer.from(
      'Kapitel 01 - Ankunft in Würzburg',
      'utf8',
    ).toString('latin1');
    const rss = `<rss><channel><item><title>${mojibakeTitle}</title><enclosure url="http://coerll.utexas.edu/dib/mp4s/01_01_intro_arrival.mp4"/></item></channel></rss>`;
    expect(parseVideoList(rss)).toEqual([
      {
        fileId: '01_01_intro_arrival',
        title: 'Kapitel 01 - Ankunft in Würzburg',
      },
    ]);
  });

  // Task 10: manba ba'zan `&amp;quot;` deb IKKI MARTA entity-kodlaydi.
  // Bitta `decodeEntities` bosqichi buni faqat yarim yechadi — `&amp;`
  // `&`ga aylanadi-yu, ortidagi `quot;` xom holida qoladi va natijada xom
  // `&quot;` matnda chiqib ketadi («Kapitel 07» intervyu sarlavhalarida
  // aynan shu topilgan). Ikkinchi dekodlash bosqichi buni yakunlaydi.
  it('ikki marta entity-kodlangan (&amp;quot;) sarlavhani ham yechadi', () => {
    const rss =
      '<rss><channel><item><title>Berna: &amp;quot;Schlaf, Kindlein, schlaf&amp;quot;</title>' +
      '<enclosure url="http://coerll.utexas.edu/dib/mp4s/07_04_int.mp4"/></item></channel></rss>';
    expect(parseVideoList(rss)).toEqual([
      {
        fileId: '07_04_int',
        title: 'Berna: "Schlaf, Kindlein, schlaf"',
      },
    ]);
  });
});

describe('repairDoubleEncodedUtf8', () => {
  it('ikki marta UTF-8 kodlangan matnni bir marta ochadi', () => {
    const mojibake = Buffer.from('Würzburg', 'utf8').toString('latin1');
    expect(repairDoubleEncodedUtf8(mojibake)).toBe('Würzburg');
  });

  it("to'g'ri kelgan matnga tegmaydi", () => {
    expect(repairDoubleEncodedUtf8('Würzburg')).toBe('Würzburg');
    expect(repairDoubleEncodedUtf8('Kapitel 01')).toBe('Kapitel 01');
  });
});
