import { parseTranscriptPage, parseVideoList } from './dib-transcript.parser';

const PAGE = `
<html><body>
<div id="vidt_g">
  <div class="ti">Kap 01 &#149; Adan &#149; Wer bin ich?</div>
  <p>Wie hei&szlig;t du?</p>
  <p>Ich hei&szlig;e Adan.</p>
  <p>Woher kommst du?</p>
</div>
<div id="vidt_e">
  <div class="ti">Ch 01 &#149; Adan &#149; Who am I?</div>
  <p>What is your name?</p>
  <p>My name is Adan.</p>
  <p>Where are you from?</p>
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

  it('sarlavhani ajratib oladi va matn qatoriga qo\'shmaydi', () => {
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

  it('nemischa matni yo\'q sahifada null qaytaradi', () => {
    expect(parseTranscriptPage('<html></html>', 'x', 1)).toBeNull();
  });

  it('inglizchasi yo\'q bo\'lsa ham nemischasini beradi', () => {
    const only = '<div id="vidt_g"><p>Guten Tag.</p></div>';
    const t = parseTranscriptPage(only, 'y', 2)!;
    expect(t.linesDe).toEqual(['Guten Tag.']);
    expect(t.linesEn).toEqual([]);
  });
});

describe('parseVideoList', () => {
  it('RSS dan fayl id va sarlavhani oladi', () => {
    expect(parseVideoList(RSS)).toEqual([
      { fileId: '01_01_intro_arrival', title: 'Kapitel 01 - Ankunft in Würzburg' },
      { fileId: '01_02_int_ag_who', title: 'Kapitel 01 - Interviews, Adan: Wer bin ich?' },
    ]);
  });

  it('bo\'sh RSS uchun bo\'sh ro\'yxat', () => {
    expect(parseVideoList('<rss></rss>')).toEqual([]);
  });
});
