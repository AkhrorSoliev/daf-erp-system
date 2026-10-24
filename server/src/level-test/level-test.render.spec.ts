import {
  bar,
  optionLetter,
  renderQuiz,
  timeLine,
  type QuizCurrent,
  type QuizLogLine,
} from './level-test.render';

const current = (over: Partial<QuizCurrent> = {}): QuizCurrent => ({
  n: 3,
  text: 'Ich ___ Anna.',
  options: ['bin', 'bist', 'ist', 'sind'],
  seconds: 20,
  remaining: 14,
  ...over,
});

const line = (n: number, picked: string | null = 'bin'): QuizLogLine => ({
  n,
  text: `Savol matni ${n}`,
  picked,
});

describe('bar / timeLine', () => {
  it("to'la va bo'sh kataklar", () => {
    expect(bar(3, 5, '▰', '▱')).toBe('▰▰▰▱▱');
    expect(bar(-2, 3, '▰', '▱')).toBe('▱▱▱');
    expect(bar(9, 3, '▰', '▱')).toBe('▰▰▰');
  });

  it("vaqt chizig'i qolgan vaqt bilan kamayadi", () => {
    expect(timeLine(20, 20)).toBe('⏱ ██████████  20 s');
    expect(timeLine(10, 20)).toBe('⏱ █████░░░░░  10 s');
    expect(timeLine(1, 20)).toBe('⏱ █░░░░░░░░░  1 s');
    expect(timeLine(0, 20)).toBe('⏱ ░░░░░░░░░░  0 s');
    expect(timeLine(-3, 20)).toBe('⏱ ░░░░░░░░░░  0 s');
  });
});

describe('renderQuiz', () => {
  it("birinchi savol: tarix yo'q, sarlavha, variantlar harflar bilan, vaqt", () => {
    const text = renderQuiz([], current({ n: 1 }), 20);

    expect(text).toContain('📊 <b>Daraja testi</b> · <b>1</b> / 20');
    expect(text).toContain('▱'.repeat(20));
    expect(text).not.toContain('<blockquote');
    expect(text).toContain('<b>Savol 1</b>');
    expect(text).toContain('<b>Ich ___ Anna.</b>');
    expect(text).toContain('<b>A</b>  bin');
    expect(text).toContain('<b>D</b>  sind');
    expect(text).toContain('⏱ ');
  });

  it("javob berilganlar bitta xabarda yig'iladi, jarayon chizig'i o'sadi", () => {
    const text = renderQuiz([line(1), line(2, 'ist')], current(), 20);

    expect(text).toContain('<blockquote expandable>');
    expect(text).toContain('1. Savol matni 1 → <b>bin</b>');
    expect(text).toContain('2. Savol matni 2 → <b>ist</b>');
    expect(text).toContain('▰▰' + '▱'.repeat(18));
    // Tarix hozirgi savoldan oldin turadi.
    expect(text.indexOf('Savol matni 2')).toBeLessThan(
      text.indexOf('<b>Savol 3</b>'),
    );
  });

  it('vaqt tugagan savol tarixda "javobsiz" deb turadi', () => {
    const text = renderQuiz([line(1, null)], current({ n: 2 }), 20);
    expect(text).toContain('1. Savol matni 1 → <i>⏱ javobsiz</i>');
  });

  it("to'g'ri javob hech qayerda belgilanmaydi", () => {
    const text = renderQuiz([line(1)], current(), 20);
    expect(text).not.toMatch(/✅|❌|to'g'ri/);
  });

  it('matn HTML-xavfsiz: belgilar escape qilinadi', () => {
    const text = renderQuiz(
      [{ n: 1, text: 'a < b & c', picked: '<x>' }],
      current({ text: '<b>hack</b>', options: ['&', '<', '>', '"'] }),
      20,
    );
    expect(text).not.toContain('<b>hack</b>');
    expect(text).toContain('&lt;b&gt;hack&lt;/b&gt;');
    expect(text).toContain('a &lt; b &amp; c');
    expect(text).toContain('<b>&lt;x&gt;</b>');
  });

  it("tugagan ko'rinish: savol va vaqt yo'q, \"tugadi\" va to'liq tarix", () => {
    const log = Array.from({ length: 20 }, (_, i) => line(i + 1));
    const text = renderQuiz(log, null, 20);

    expect(text).toContain('tugadi');
    expect(text).toContain('▰'.repeat(20));
    expect(text).not.toContain('⏱');
    expect(text).toContain('20. Savol matni 20');
  });

  it('juda uzun tarix qisqartiriladi va 4096 belgidan oshmaydi', () => {
    const longText = 'x'.repeat(300);
    const log = Array.from({ length: 19 }, (_, i) => ({
      n: i + 1,
      text: longText,
      picked: 'y'.repeat(100),
    }));
    const text = renderQuiz(log, current({ n: 20 }), 20);

    expect(text.length).toBeLessThanOrEqual(3800);
    expect(text).toMatch(/oldingi \d+ ta savol yashirildi/);
    // Hozirgi savol hech qachon yo'qolmaydi.
    expect(text).toContain('<b>Savol 20</b>');
    expect(text).toContain('<b>A</b>  bin');
  });
});

describe('optionLetter', () => {
  it('A–D, undan keyin "?"', () => {
    expect([0, 1, 2, 3, 4].map(optionLetter)).toEqual([
      'A',
      'B',
      'C',
      'D',
      '?',
    ]);
  });
});
