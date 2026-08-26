import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGrammarIndex, parseGrammarPage } from './dib-grammar.parser';

const REAL = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-vi_05.html'),
  'utf8',
);

// `vsub_02` — so'z tartiblash (REORDER) formatini, `adv_03` — cloze
// parchani (CLOZE), `cas_07` — dialogsiz GAP sahifasini tekshiradi. Uchalasi
// ham haqiqiy sahifa: fixture o'ylab topilsa, manbada uch xil mashq formati
// borligi ko'rinmay qolardi (Fix round 1 — task-4-report.md).
const REORDER_PAGE = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-vsub_02.html'),
  'utf8',
);
const CLOZE_PAGE = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-adv_03.html'),
  'utf8',
);
const NO_DIALOGUE_PAGE = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-cas_07.html'),
  'utf8',
);
// `cas_06` — 92 sahifalik to'liq yig'ishda topilgan TO'RTINCHI mashq
// formati: `<table class="ex">` qatorlari UCH ustunli va bitta raqamlangan
// mashq bir necha qatorga (davom + bo'sh joy) taqsimlangan — bo'sh joy
// `qnum`siz davom qatorida keladi. Eski bitta-qatorli parser bu holatda
// faqat so'zlovchi nomini olardi, haqiqiy bo'sh joyni ko'rmasdi va uni bo'sh
// `tokens` bilan REORDER deb noto'g'ri belgilardi.
const MULTI_ROW_PAGE = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-cas_06.html'),
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
    expect(p.exercises[0].kind).toBe('GAP');
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

describe("parseGrammarPage — so'z tartiblash formati (vsub_02)", () => {
  it("10 ta REORDER mashqini bo'sh bo'lmagan tokenlar bilan beradi", () => {
    const p = parseGrammarPage(REORDER_PAGE, 'vsub_02')!;
    expect(p.exercises).toHaveLength(10);
    for (const ex of p.exercises) {
      expect(ex.kind).toBe('REORDER');
      expect(ex.tokens).toBeDefined();
      expect(ex.tokens!.length).toBeGreaterThan(0);
      expect(ex.answer).toBeNull();
      expect(ex.answerStatus).toBe('MISSING');
    }
  });

  it("so'zlovchi prefiksini token emas, topshiriq matni deb hisoblaydi", () => {
    const p = parseGrammarPage(REORDER_PAGE, 'vsub_02')!;
    expect(p.exercises[0].sentenceDe).toContain('Der Esel:');
    expect(p.exercises[0].tokens).toEqual([
      'Ich',
      'machen',
      'nichts anderes',
      'weil',
      'ich',
      'sein',
      'gerne',
      'ein Tier',
    ]);
  });

  it("«Toifa:Sarlavha» yo'l belgisi tushuntirishga sizib kirmaydi", () => {
    // Bu sahifada yo'l belgisi 30 belgidan uzun ("Verbs : Konjunktiv II im
    // Präsens") — eski uzunlik filtridan sizib o'tgan aynan shu holat edi.
    const p = parseGrammarPage(REORDER_PAGE, 'vsub_02')!;
    expect(p.explanation).not.toContain('Verbs');
    expect(p.explanation).toContain('subjunctive mood');
  });
});

describe('parseGrammarPage — cloze formati (adv_03)', () => {
  it("bitta CLOZE mashqini bo'sh joylar soni va so'z banki bilan beradi", () => {
    const p = parseGrammarPage(CLOZE_PAGE, 'adv_03')!;
    expect(p.exercises).toHaveLength(1);
    const ex = p.exercises[0];
    expect(ex.kind).toBe('CLOZE');
    expect(ex.blankCount).toBe(11);
    expect((ex.sentenceDe.match(/___/g) ?? []).length).toBe(11);
    expect(ex.wordBank).toBeDefined();
    expect(ex.wordBank!.length).toBeGreaterThan(0);
    expect(ex.wordBank).toContain('plötzlich');
    expect(ex.answer).toBeNull();
    expect(ex.answerStatus).toBe('MISSING');
  });
});

describe('parseGrammarPage — dialogsiz sahifa (cas_07)', () => {
  it("10 ta GAP mashqini beradi va dialogni bo'sh deb belgilaydi", () => {
    const p = parseGrammarPage(NO_DIALOGUE_PAGE, 'cas_07')!;
    expect(p.exercises).toHaveLength(10);
    for (const ex of p.exercises) {
      expect(ex.kind).toBe('GAP');
    }
    // Xom HTML'da tekshirilgan: bu sahifada haqiqatan ham dialog jadvali
    // yo'q — bu kamchilik emas, sahifaning haqiqiy holati.
    expect(p.dialogue).toEqual([]);
  });
});

describe("parseGrammarPage — ko'p qatorli dialog formati (cas_06)", () => {
  it("6 ta GAP mashqini beradi, hech biri bo'sh tokenlar bilan qolmaydi", () => {
    const p = parseGrammarPage(MULTI_ROW_PAGE, 'cas_06')!;
    expect(p.exercises).toHaveLength(6);
    for (const ex of p.exercises) {
      expect(ex.kind).toBe('GAP');
      expect(ex.sentenceDe).toContain('___');
      // GAP mashqida `tokens` umuman yozilmaydi (REORDER uchun maydon) —
      // eski xato aynan bo'sh `tokens: []` bilan REORDER chiqarardi.
      expect(ex.tokens).toBeUndefined();
    }
  });

  it("so'zlovchi nomi VA dialog matni bitta gapga birlashadi", () => {
    const p = parseGrammarPage(MULTI_ROW_PAGE, 'cas_06')!;
    expect(p.exercises[0].sentenceDe).toContain('Brummbär:');
    expect(p.exercises[0].sentenceDe).toContain('Chef:');
    expect(p.exercises[0].sentenceDe).toContain('Ich will eine neue Badehose');
    expect(p.exercises[0].sentenceDe).toContain(
      'Wieso brauchst du eine neue Badehose',
    );
  });

  it("ajratuvchi bo'sh qator (`&nbsp;`) matnga hech narsa qo'shmaydi", () => {
    const p = parseGrammarPage(MULTI_ROW_PAGE, 'cas_06')!;
    for (const ex of p.exercises) {
      expect(ex.sentenceDe).not.toMatch(/\s{2,}/);
    }
  });
});

describe('parseGrammarPage — hech bir sahifada xom teg qolmaydi', () => {
  it.each([
    ['vi_05', REAL],
    ['vsub_02', REORDER_PAGE],
    ['adv_03', CLOZE_PAGE],
    ['cas_07', NO_DIALOGUE_PAGE],
    ['cas_06', MULTI_ROW_PAGE],
  ])('%s sahifasidagi mashqlarda `<` uchramaydi', (code, html) => {
    const p = parseGrammarPage(html, code)!;
    const texts = p.exercises.flatMap((e) => [
      e.sentenceDe,
      ...(e.tokens ?? []),
      ...(e.wordBank ?? []),
    ]);
    expect(texts.some((t) => t.includes('<'))).toBe(false);
  });
});

// `decodeEntities`'ning NAMED jadvali qo'lda to'ldiriladi — talaffuz
// sahifasida aynan shu tarzda oltita belgi (masalan `&int;`, `&theta;`)
// unutilib, xom holida chiqib ketgan edi. `stripTags` grammatika bilan
// talaffuz o'rtasida umumiy bo'lgani uchun bu tekshiruv shu yerda ham kerak —
// keyingi yetishmagan entity o'quvchiga emas, shu testga uchraydi.
describe('parseGrammarPage — hech bir sahifada xom entity qolmaydi', () => {
  it.each([
    ['vi_05', REAL],
    ['vsub_02', REORDER_PAGE],
    ['adv_03', CLOZE_PAGE],
    ['cas_07', NO_DIALOGUE_PAGE],
  ])(
    '%s sahifasida `&harf;` shaklidagi dekodlanmagan entity uchramaydi',
    (code, html) => {
      const p = parseGrammarPage(html, code)!;
      const texts = [
        p.explanation,
        ...p.dialogue.flatMap((d) => [d.speaker, d.de, d.en]),
        ...p.exercises.flatMap((e) => [
          e.sentenceDe,
          ...(e.tokens ?? []),
          ...(e.wordBank ?? []),
        ]),
      ];
      expect(texts.some((t) => /&[A-Za-z]+;/.test(t))).toBe(false);
    },
  );
});
