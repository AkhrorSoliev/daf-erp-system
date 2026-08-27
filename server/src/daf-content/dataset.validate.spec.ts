import { validateDataset } from './dataset.validate';
import type { DafDataset } from './dataset.types';

function base(): DafDataset {
  return {
    source: 'DIB',
    harvestedAt: '2026-08-25T00:00:00.000Z',
    license: 'CC BY 4.0',
    attribution: 'Deutsch im Blick, COERLL, UT Austin',
    chapters: [
      {
        chapter: 1,
        grammarFocus: ['vi_05'],
        grammarRecommended: [],
        level: 'A1.1',
        needsReview: false,
        reason: 'bob 1 → A1.1',
      },
    ],
    sections: [
      {
        id: 'dib-1-1',
        chapter: 1,
        titleDe: 'Begrüßungen',
        titleEn: 'Greetings',
        audio: null,
        entries: [{ de: 'Hallo!', en: 'Hello!', sectionId: 'dib-1-1' }],
      },
    ],
    transcripts: [],
    videos: [],
    grammar: [],
    phonetics: [],
    documents: [],
  };
}

describe('validateDataset', () => {
  it("to'g'ri dataset uchun bo'sh ro'yxat qaytaradi", () => {
    expect(validateDataset(base())).toEqual([]);
  });

  it("bo'sh lug'at yozuvini xato deb belgilaydi", () => {
    const d = base();
    d.sections[0].entries.push({ de: '  ', en: 'x', sectionId: 'dib-1-1' });
    expect(validateDataset(d)).toContain("dib-1-1: bo'sh `de` qiymati bor");
  });

  it("bo'limi yo'q yozuvni topadi", () => {
    const d = base();
    d.sections[0].entries[0].sectionId = 'yoq-bolim';
    expect(validateDataset(d)).toContain(
      "dib-1-1: `yoq-bolim` bo'limi mavjud emas",
    );
  });

  it("keyinroq turgan (oldinga qarab) bo'limga havolani xato demaydi", () => {
    // Ikki bosqichli tekshiruv: bo'lim id'lari OLDIN to'planadi, shuning
    // uchun ro'yxatda o'zidan KEYIN turgan bo'limga havola ham to'g'ri
    // topiladi — bitta o'tishli eski tekshiruv buni soxta xato deb belgilar
    // edi.
    const d = base();
    d.sections.push({
      id: 'dib-1-2',
      chapter: 1,
      titleDe: 'Zahlen',
      titleEn: 'Numbers',
      audio: null,
      entries: [],
    });
    d.sections[0].entries[0].sectionId = 'dib-1-2';
    expect(validateDataset(d)).toEqual([]);
  });

  it("litsenziyasiz aktivni o'tkazmaydi", () => {
    const d = base();
    d.sections[0].audio = {
      sourceUrl: 'https://x/a.mp3',
      key: 'dib/audio/a.mp3',
      kind: 'AUDIO',
      license: '',
      attribution: 'x',
    };
    expect(validateDataset(d)).toContain(
      "dib/audio/a.mp3: litsenziya ko'rsatilmagan",
    );
  });

  it("takrorlangan bo'lim id'sini topadi", () => {
    const d = base();
    d.sections.push({ ...d.sections[0], entries: [] });
    expect(validateDataset(d)).toContain("dib-1-1: bo'lim id'si takrorlangan");
  });

  it("litsenziyasiz `videos` yozuvini o'tkazmaydi", () => {
    const d = base();
    d.videos.push({
      sourceUrl: 'https://x/v.mp4',
      key: 'dib/video/v.mp4',
      kind: 'VIDEO',
      license: '',
      attribution: 'x',
    });
    expect(validateDataset(d)).toContain(
      "dib/video/v.mp4: litsenziya ko'rsatilmagan",
    );
  });

  it("takrorlangan transkript id'sini topadi", () => {
    const d = base();
    const t = {
      id: 'dib-t-1',
      chapter: 1,
      titleDe: 'x',
      linesDe: ['Hallo'],
      linesEn: [],
      video: null,
    };
    d.transcripts.push({ ...t }, { ...t });
    expect(validateDataset(d)).toContain(
      "dib-t-1: transkript id'si takrorlangan",
    );
  });

  it('takrorlangan video kalitini topadi', () => {
    const d = base();
    const v = {
      sourceUrl: 'https://x/v.mp4',
      key: 'dib/video/v.mp4',
      kind: 'VIDEO' as const,
      license: 'CC BY 4.0',
      attribution: 'x',
    };
    d.videos.push({ ...v }, { ...v });
    expect(validateDataset(d)).toContain(
      'dib/video/v.mp4: video kaliti takrorlangan',
    );
  });
});

describe("validateDataset — Faza 1b to'plamlari", () => {
  it("grammatika sahifasining audiosini litsenziyasiz o'tkazmaydi", () => {
    const d = base();
    d.grammar.push({
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1',
      explanation: 'Haben can be used…',
      dialogue: [],
      audio: [
        {
          sourceUrl: 'https://x/a.mp3',
          key: 'dib/gg-audio/vi_05_01.mp3',
          kind: 'AUDIO',
          license: '',
          attribution: 'COERLL',
        },
      ],
      exercises: [],
    });
    expect(validateDataset(d)).toContain(
      "dib/gg-audio/vi_05_01.mp3: litsenziya ko'rsatilmagan",
    );
  });

  // Javobsiz mashq o'quvchiga ko'rsatiladi, lekin tekshirilmaydi — ya'ni u
  // mashq emas, matn. Bu holat jimgina o'tib ketmasligi kerak.
  it('javobsiz mashqni xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'vi_05_01_fib_1',
          kind: 'GAP',
          sentenceDe: 'Schneewittchen ___ eine neue Karriere.',
          blankCount: 1,
          answers: null,
          answerStatus: 'MISSING',
          grammarCode: 'vi_05',
          setCode: 'vi_05_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain("vi_05_01_fib_1: javobi yo'q");
  });

  // Javoblar soni o'rinlar soniga teng bo'lmasa, javob boshqa bo'sh joyga
  // tushadi — mashq javobli ko'rinadi, lekin javobi boshqa savolniki.
  it("o'rinlar soniga mos kelmagan javoblarni xato deb belgilaydi", () => {
    const d = base();
    d.grammar.push({
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'vi_05_01_fib_1',
          kind: 'GAP',
          sentenceDe: '___ Mutter gibt ___ Kind Kuchen.',
          blankCount: 2,
          answers: ['die'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'vi_05',
          setCode: 'vi_05_01_fib',
          slots: [1, 2],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "vi_05_01_fib_1: 2 ta javob o'rniga 1 ta javob",
    );
  });

  it('takrorlangan grammatika kodini topadi', () => {
    const d = base();
    const page = {
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1' as const,
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [],
    };
    d.grammar.push(page, { ...page });
    expect(validateDataset(d)).toContain('vi_05: grammatika kodi takrorlangan');
  });

  it("bo'sh joyi yo'q mashq gapini xato deb belgilaydi", () => {
    const d = base();
    d.grammar.push({
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'vi_05_fib_1',
          kind: 'GAP',
          sentenceDe: 'Schneewittchen hat eine neue Karriere.',
          blankCount: 0,
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'vi_05',
          setCode: 'vi_05_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "vi_05_fib_1: gapda bo'sh joy (___) yo'q",
    );
  });

  it('tokensiz REORDER mashqini xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'vsub_02',
      titleDe: 'Konjunktiv II im Präsens',
      titleEn: 'present subjunctive',
      level: 'B1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'vsub_02_fib_1',
          kind: 'REORDER',
          sentenceDe: 'Der Esel: Ich / machen / nichts anderes',
          tokens: [],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'vsub_02',
          setCode: 'vsub_02_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "vsub_02_fib_1: REORDER mashqida kamida ikkita `tokens` elementi bo'lishi shart",
    );
  });

  // Ikkitadan kam — nol EMAS — token invariantni buzishi ham shart: bitta
  // "token" gapni birlashtirish topshirig'i bo'lishi mumkin (con_03/vpp_01
  // holati), REORDER emas.
  it('bitta tokenli REORDER mashqini ham xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'vpp_01',
      titleDe: 'Perfekt',
      titleEn: 'perfekt',
      level: 'A2.1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'vpp_01_fib_1',
          kind: 'REORDER',
          sentenceDe: 'Am Abend haben die Kinder Hunger.',
          tokens: ['Am Abend haben die Kinder Hunger.'],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'vpp_01',
          setCode: 'vpp_01_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "vpp_01_fib_1: REORDER mashqida kamida ikkita `tokens` elementi bo'lishi shart",
    );
  });

  it('blankCount mos kelmagan GAP mashqini xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'vi_05_fib_1',
          kind: 'GAP',
          sentenceDe: 'Schneewittchen ___ eine neue Karriere. Sie ___ Anwalt.',
          blankCount: 1,
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'vi_05',
          setCode: 'vi_05_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "vi_05_fib_1: `blankCount` (1) matndagi bo'sh joylar soniga (2) mos kelmaydi",
    );
  });

  it('blankCount mos kelmagan MC mashqini xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'con_04',
      titleDe: 'Subordinating Conjunctions',
      titleEn: 'con_04',
      level: 'B1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'con_04_fib_1',
          kind: 'MC',
          sentenceDe: 'Die Kinder gehen nach Hause, ___ sie sehr reich sind.',
          blankCount: 2,
          options: ['a. weil', 'b. ob'],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'con_04',
          setCode: 'con_04_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "con_04_fib_1: `blankCount` (2) matndagi bo'sh joylar soniga (1) mos kelmaydi",
    );
  });

  it('blankCount mos kelmagan CLOZE mashqini xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'adv_03',
      titleDe: 'Das Adverb - Narration',
      titleEn: 'adverbs of narration',
      level: 'A2.2',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'adv_03_fib_1',
          kind: 'CLOZE',
          sentenceDe: '___ soll ich erzählen. ___ war es vorbei.',
          blankCount: 3,
          wordBank: ['plötzlich', 'dann'],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'adv_03',
          setCode: 'adv_03_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "adv_03_fib_1: `blankCount` (3) matndagi bo'sh joylar soniga (2) mos kelmaydi",
    );
  });

  // Manbada MC ikki xil keladi va ikkalasi ham haqiqiy: gapda `___`
  // bo'lgani, va butun gap berilib to'g'ri o'zgartirish tanlanadigani
  // («Zuerst holt der Mann… → a. Zuerst wird… geholt»). Bu test avval
  // teskarisini talab qilardi — parser 100 ta bunday MC'ni allaqachon
  // tashlab yuborgani uchun buni hech kim sezmagan.
  it("bo'sh joysiz MC mashqini o'tkazadi", () => {
    const d = base();
    d.grammar.push({
      code: 'con_04',
      titleDe: 'Subordinating Conjunctions',
      titleEn: 'con_04',
      level: 'B1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'con_04_fib_1',
          kind: 'MC',
          sentenceDe: 'Die Kinder gehen nach Hause, sie sehr reich sind.',
          blankCount: 0,
          options: ['a. weil', 'b. ob'],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'con_04',
          setCode: 'con_04_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toEqual([]);
  });

  it('ikkitadan kam variantli MC mashqini xato deb belgilaydi', () => {
    const d = base();
    d.grammar.push({
      code: 'con_04',
      titleDe: 'Subordinating Conjunctions',
      titleEn: 'con_04',
      level: 'B1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'con_04_fib_1',
          kind: 'MC',
          sentenceDe: 'Die Kinder gehen nach Hause, ___ sie sehr reich sind.',
          blankCount: 1,
          options: ['a. weil'],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'con_04',
          setCode: 'con_04_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "con_04_fib_1: MC mashqida kamida ikkita `options` bo'lishi shart",
    );
  });

  it("to'g'ri to'ldirilgan MC mashqini o'tkazadi", () => {
    const d = base();
    d.grammar.push({
      code: 'con_04',
      titleDe: 'Subordinating Conjunctions',
      titleEn: 'con_04',
      level: 'B1',
      explanation: 'x',
      dialogue: [],
      audio: [],
      exercises: [
        {
          id: 'con_04_fib_1',
          kind: 'MC',
          sentenceDe: 'Die Kinder gehen nach Hause, ___ sie sehr reich sind.',
          blankCount: 1,
          options: ['a. weil', 'b. ob'],
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'con_04',
          setCode: 'con_04_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toEqual([]);
  });

  it("takrorlangan talaffuz id'sini topadi", () => {
    const d = base();
    const item = {
      id: 'pho_01_01_abc',
      chapter: 1,
      textDe: 'A, B, C',
      textEn: '',
      caption: 'Listen to the alphabet',
      audio: {
        sourceUrl: 'https://x/p.mp3',
        key: 'dib/audio/pho_01_01_abc.mp3',
        kind: 'AUDIO' as const,
        license: 'CC BY 4.0',
        attribution: 'COERLL',
      },
    };
    d.phonetics.push(item, { ...item });
    expect(validateDataset(d)).toContain(
      "pho_01_01_abc: talaffuz id'si takrorlangan",
    );
  });

  it("to'g'ri to'ldirilgan Faza 1b to'plamlarini o'tkazadi", () => {
    const d = base();
    d.grammar.push({
      code: 'vi_05',
      titleDe: 'Haben',
      titleEn: 'haben',
      level: 'A1.1',
      explanation: 'x',
      dialogue: [
        { speaker: 'Rotkäppchen', de: 'Ich habe Brot.', en: 'I have bread.' },
      ],
      audio: [],
      exercises: [
        {
          id: 'vi_05_fib_1',
          kind: 'GAP',
          sentenceDe: 'Schneewittchen ___ eine neue Karriere.',
          blankCount: 1,
          answers: ['x'],
          answerStatus: 'FROM_SOURCE',
          grammarCode: 'vi_05',
          setCode: 'vi_05_01_fib',
          slots: [1],
        },
      ],
    });
    expect(validateDataset(d)).toEqual([]);
  });

  // Task 10: `html-entities.ts`dagi jadval fixture'larga qarshi tekshiriladi,
  // shuning uchun real datasetda qolib ketgan entity'ni (mas. yangi ochilgan
  // yoki hali jadvalga qo'shilmagan) strukturaviy ko'ra olmaydi. Bu qoida
  // butun datasetni aylanib chiqadi va shunday holatni ushlab qoladi.
  it('dekodlanmagan HTML entity qolgan matn maydonini xato deb belgilaydi', () => {
    const d = base();
    d.sections[0].entries[0].en = 'caf&eacute;';
    expect(validateDataset(d)).toContain(
      'dataset.sections[0].entries[0].en: dekodlanmagan HTML entity qoldi — "caf&eacute;"',
    );
  });
});
