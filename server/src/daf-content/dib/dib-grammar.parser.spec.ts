import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGrammarIndex, parseGrammarPage } from './dib-grammar.parser';

const REAL = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-vi_05.html'),
  'utf8',
);

const INDEX = `
<html><body>
<a href="no_01.html">nouns overview</a>
<a href="vi_05.html">haben</a>
<a href="vi_05.html">haben</a>
<a href="about.html">about</a>
<a href="../gr/vsub_02.html">present subjunctive</a>
</body></html>`;

describe('parseGrammarIndex', () => {
  it("sahifa kodlarini yig'adi va takrorini tashlaydi", () => {
    expect(parseGrammarIndex(INDEX)).toEqual(['no_01', 'vi_05', 'vsub_02']);
  });

  it('kod shakliga tushmagan havolani olmaydi', () => {
    expect(parseGrammarIndex(INDEX)).not.toContain('about');
  });
});

describe('parseGrammarPage — haqiqiy sahifada', () => {
  it('sarlavha va darajani beradi', () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    expect(p.code).toBe('vi_05');
    expect(p.titleDe).toBe('Haben');
    expect(p.level).toBe('A1.1');
  });

  it('inglizcha tushuntirishni oladi', () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    expect(p.explanation).toContain('Haben can be used');
    expect(p.explanation).not.toContain('<');
  });

  it("to'rtta audio aktivini litsenziyasi bilan beradi", () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    expect(p.audio).toHaveLength(4);
    expect(p.audio[0].key).toBe('dib/gg-audio/vi_05_01_haben.mp3');
    expect(p.audio[0].license).toBe('CC BY 4.0');
    expect(p.audio[0].kind).toBe('AUDIO');
  });

  it("dialogni so'zlovchi, nemischa va inglizcha ustunlarga ajratadi", () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    expect(p.dialogue.length).toBeGreaterThanOrEqual(4);
    expect(p.dialogue[0].speaker).toContain('Rotkäppchen');
    expect(p.dialogue[0].de).toBe('Liebling, was hast du im Korb?');
    expect(p.dialogue[0].en).toBe('Darling, what do you have in the basket?');
  });

  it("14 ta mashq gapini bo'sh joy belgisi bilan beradi", () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    expect(p.exercises).toHaveLength(14);
    expect(p.exercises[0].id).toBe('vi_05_fib_1');
    expect(p.exercises[0].sentenceDe).toBe(
      'Schneewittchen ___ eine neue Karriere. Sie ist Rechtsanwältin für Menschenrechte.',
    );
    expect(p.exercises[0].grammarCode).toBe('vi_05');
  });

  it("javob kalitini bo'sh qoldiradi", () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    for (const ex of p.exercises) {
      expect(ex.answer).toBeNull();
      expect(ex.answerStatus).toBe('MISSING');
    }
  });

  it('hech bir chiqishda HTML tegi qolmaydi', () => {
    const p = parseGrammarPage(REAL, 'vi_05')!;
    const all = [
      p.explanation,
      ...p.dialogue.flatMap((d) => [d.speaker, d.de, d.en]),
      ...p.exercises.map((e) => e.sentenceDe),
    ];
    expect(all.some((t) => t.includes('<'))).toBe(false);
  });

  it("audio bloki yo'q sahifa uchun null qaytaradi", () => {
    expect(parseGrammarPage('<html><body></body></html>', 'zz_99')).toBeNull();
  });
});
