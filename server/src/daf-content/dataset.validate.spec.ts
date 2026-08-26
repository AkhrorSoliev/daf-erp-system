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
        reason: "bob 1 → A1.1",
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
  };
}

describe('validateDataset', () => {
  it('to\'g\'ri dataset uchun bo\'sh ro\'yxat qaytaradi', () => {
    expect(validateDataset(base())).toEqual([]);
  });

  it('bo\'sh lug\'at yozuvini xato deb belgilaydi', () => {
    const d = base();
    d.sections[0].entries.push({ de: '  ', en: 'x', sectionId: 'dib-1-1' });
    expect(validateDataset(d)).toContain('dib-1-1: bo\'sh `de` qiymati bor');
  });

  it('bo\'limi yo\'q yozuvni topadi', () => {
    const d = base();
    d.sections[0].entries[0].sectionId = 'yoq-bolim';
    expect(validateDataset(d)).toContain(
      "dib-1-1: `yoq-bolim` bo'limi mavjud emas",
    );
  });

  it('keyinroq turgan (oldinga qarab) bo\'limga havolani xato demaydi', () => {
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

  it('litsenziyasiz aktivni o\'tkazmaydi', () => {
    const d = base();
    d.sections[0].audio = {
      sourceUrl: 'https://x/a.mp3',
      key: 'dib/audio/a.mp3',
      kind: 'AUDIO',
      license: '',
      attribution: 'x',
    };
    expect(validateDataset(d)).toContain(
      'dib/audio/a.mp3: litsenziya ko\'rsatilmagan',
    );
  });

  it('takrorlangan bo\'lim id\'sini topadi', () => {
    const d = base();
    d.sections.push({ ...d.sections[0], entries: [] });
    expect(validateDataset(d)).toContain("dib-1-1: bo'lim id'si takrorlangan");
  });

  it('litsenziyasiz `videos` yozuvini o\'tkazmaydi', () => {
    const d = base();
    d.videos.push({
      sourceUrl: 'https://x/v.mp4',
      key: 'dib/video/v.mp4',
      kind: 'VIDEO',
      license: '',
      attribution: 'x',
    });
    expect(validateDataset(d)).toContain(
      'dib/video/v.mp4: litsenziya ko\'rsatilmagan',
    );
  });

  it('takrorlangan transkript id\'sini topadi', () => {
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
      "dib/video/v.mp4: video kaliti takrorlangan",
    );
  });
});
