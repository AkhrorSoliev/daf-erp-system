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
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'vi_05',
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
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'vsub_02',
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "vsub_02_fib_1: REORDER mashqida `tokens` ro'yxati bo'sh",
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
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'adv_03',
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "adv_03_fib_1: `blankCount` (3) matndagi bo'sh joylar soniga (2) mos kelmaydi",
    );
  });

  it("bo'sh joyi yo'q MC mashqini xato deb belgilaydi", () => {
    // MC ham umumiy `___` qoidasidan istisno EMAS — u REORDER emasligi
    // uchun umumiy `else if` shoxobchasiga tushadi.
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
          options: ['a. weil', 'b. ob'],
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'con_04',
        },
      ],
    });
    expect(validateDataset(d)).toContain(
      "con_04_fib_1: gapda bo'sh joy (___) yo'q",
    );
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
          options: ['a. weil'],
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'con_04',
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
          options: ['a. weil', 'b. ob'],
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'con_04',
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
          answer: null,
          answerStatus: 'MISSING',
          grammarCode: 'vi_05',
        },
      ],
    });
    expect(validateDataset(d)).toEqual([]);
  });
});
