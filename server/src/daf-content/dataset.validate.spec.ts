import { validateDataset } from './dataset.validate';
import type { DafDataset } from './dataset.types';

function base(): DafDataset {
  return {
    source: 'DIB',
    harvestedAt: '2026-08-25T00:00:00.000Z',
    license: 'CC BY 4.0',
    attribution: 'Deutsch im Blick, COERLL, UT Austin',
    chapters: [{ chapter: 1, grammarFocus: ['vi_05'], grammarRecommended: [] }],
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
});
