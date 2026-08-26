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
// `con_04` — 92 sahifalik to'liq yig'ishda topilgan BESHINCHI mashq formati:
// MC (ko'p variantli). Raqamlash `qnum` klassisiz, yalang'och
// `<td><b>N.</b></td>` bilan keladi, bo'sh joy `txt_1` emas, chiziqchalar
// ketma-ketligi bilan belgilanadi, variantlar esa ichma-ich
// `<table class="mc_vert">` radio jadvalida keladi. Sahifada IKKITA
// `<table class="ex">` bloki bor (birinchisi — 10 ta MC, ikkinchisi — 12 ta
// GAP) — bu `sliceExerciseTable`ning bitta `indexOf` bilan faqat birinchi
// blokni olishi kabi ikkinchi defektni ham fosh qildi.
const MC_PAGE = readFileSync(
  join(__dirname, '__fixtures__', 'gg-pr-con_04.html'),
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
    const reorder = p.exercises.filter((e) => e.kind === 'REORDER');
    expect(reorder).toHaveLength(10);
    for (const ex of reorder) {
      expect(ex.tokens).toBeDefined();
      expect(ex.tokens!.length).toBeGreaterThan(0);
      expect(ex.answer).toBeNull();
      expect(ex.answerStatus).toBe('MISSING');
    }
  });

  // Sahifada IKKINCHI `<table class="ex">` bloki ham bor — u to'liq MC
  // (12 ta savol). Eski bitta-blokli parser buni butunlay ko'rmasdi, shuning
  // uchun sahifa jami 10 ta emas, 22 ta mashq beradi endi. Eski sonni
  // majburlash o'rniga, haqiqiy sonni tasdiqlaymiz.
  it("ikkinchi blokdagi 12 ta MC mashqini ham qo'shib, jami 22 ta mashq beradi", () => {
    const p = parseGrammarPage(REORDER_PAGE, 'vsub_02')!;
    expect(p.exercises).toHaveLength(22);
    const mc = p.exercises.filter((e) => e.kind === 'MC');
    expect(mc).toHaveLength(12);
    for (const ex of mc) {
      expect(ex.sentenceDe).toContain('___');
      expect(ex.options).toBeDefined();
      expect(ex.options!.length).toBeGreaterThanOrEqual(2);
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
  // Sahifada UCHTA `<table class="ex">` bloki bor: ikkitasi GAP (10+10),
  // uchinchisi to'liq MC (12). Eski bitta-blokli parser faqat birinchi
  // GAP blokini ko'rardi (10 ta); tuzatilgandan keyin sahifa jami 32 ta
  // mashq beradi.
  it("32 ta mashqni (20 GAP + 12 MC) beradi va dialogni bo'sh deb belgilaydi", () => {
    const p = parseGrammarPage(NO_DIALOGUE_PAGE, 'cas_07')!;
    expect(p.exercises).toHaveLength(32);
    const gap = p.exercises.filter((e) => e.kind === 'GAP');
    const mc = p.exercises.filter((e) => e.kind === 'MC');
    expect(gap).toHaveLength(20);
    expect(mc).toHaveLength(12);
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
    ['con_04', MC_PAGE],
  ])('%s sahifasidagi mashqlarda `<` uchramaydi', (code, html) => {
    const p = parseGrammarPage(html, code)!;
    const texts = p.exercises.flatMap((e) => [
      e.sentenceDe,
      ...(e.tokens ?? []),
      ...(e.wordBank ?? []),
      ...(e.options ?? []),
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
    ['con_04', MC_PAGE],
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
          ...(e.options ?? []),
        ]),
      ];
      expect(texts.some((t) => /&[A-Za-z]+;/.test(t))).toBe(false);
    },
  );
});

describe("parseGrammarPage — ko'p variantli (MC) formati (con_04)", () => {
  it("birinchi blokdagi 10 ta MC mashqini bo'sh joy va kamida ikkita variant bilan beradi", () => {
    const p = parseGrammarPage(MC_PAGE, 'con_04')!;
    const mc = p.exercises.filter((e) => e.kind === 'MC');
    expect(mc).toHaveLength(10);
    for (const ex of mc) {
      expect(ex.sentenceDe).toContain('___');
      expect(ex.options).toBeDefined();
      expect(ex.options!.length).toBeGreaterThanOrEqual(2);
      expect(ex.answer).toBeNull();
      expect(ex.answerStatus).toBe('MISSING');
      // Variant matni radio/input belgilaridan tozalangan bo'lishi shart —
      // manba `<input type="radio" ...>` va `<input type="hidden" ...>`ni
      // variant matni bilan bir katakka joylaydi.
      for (const opt of ex.options!) {
        expect(opt).not.toMatch(/input|radio|hidden/i);
      }
    }
  });

  it('birinchi variant `a.`, ikkinchisi `b.` bilan boshlanadi', () => {
    const p = parseGrammarPage(MC_PAGE, 'con_04')!;
    const first = p.exercises.find((e) => e.kind === 'MC')!;
    expect(first.options![0]).toBe('a. weil');
    expect(first.options![1]).toBe('b. ob');
    expect(first.sentenceDe).toBe(
      'Die Kinder gehen nach Hause und sind sehr froh, ___ sie sehr reich sind.',
    );
  });

  // Sahifaning IKKINCHI `<table class="ex">` bloki oddiy GAP formatida —
  // ikkala blok ham parse qilinishi va id'lar sahifa bo'ylab ketma-ket
  // (takrorlanmasdan) raqamlanishi kerak.
  it("ikkinchi blokdagi 12 ta GAP mashqini ham qo'shib, jami 22 ta mashq beradi, id'lar ketma-ket", () => {
    const p = parseGrammarPage(MC_PAGE, 'con_04')!;
    expect(p.exercises).toHaveLength(22);
    const gap = p.exercises.filter((e) => e.kind === 'GAP');
    expect(gap).toHaveLength(12);
    const ids = p.exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('con_04_fib_1');
    expect(ids[ids.length - 1]).toBe(`con_04_fib_${ids.length}`);
  });
});
