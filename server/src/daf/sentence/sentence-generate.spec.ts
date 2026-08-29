import {
  buildSentencePrompt,
  parseSentences,
  generateForUnit,
} from './sentence-generate';
import type { TranslateModel } from '../translate/translate-model';

function model(...replies: string[]): TranslateModel {
  const q = [...replies];
  return { name: 'test', complete: async () => q.shift() ?? '' };
}

describe('buildSentencePrompt', () => {
  it('ruxsat etilgan so`zlarni va namunani so`rovga qo`yadi', () => {
    const p = buildSentencePrompt(['heißen', 'kommen'], ['Wie heißt du?'], 5);
    expect(p).toContain('heißen');
    expect(p).toContain('Wie heißt du?');
    expect(p).toContain('5');
  });
});

describe('parseSentences', () => {
  it('har qatordan nemischa va o`zbekchani ajratadi', () => {
    expect(parseSentences('Ich heiße Anna. | Mening ismim Anna.\n')).toEqual([
      { de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
    ]);
  });

  it('ajratgichsiz qatorni tashlaydi', () => {
    expect(parseSentences('buzuq qator\nA. | B.')).toEqual([
      { de: 'A.', uz: 'B.' },
    ]);
  });

  it('bo`sh javobdan bo`sh ro`yxat qaytaradi', () => {
    expect(parseSentences('')).toEqual([]);
  });
});

describe('generateForUnit', () => {
  const allowed = new Set(['heiße', 'anna', 'komme']);

  it('toza gaplarni saqlaydi', async () => {
    const r = await generateForUnit(
      model('Ich heiße Anna. | Mening ismim Anna.'),
      { allowed, words: ['heißen'], examples: [], count: 1 },
    );
    expect(r.kept).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });

  // Tekshirilmagan generatsiya jimgina buzadi — shuning uchun
  // notanish so'zli gap qabul qilinmaydi.
  it('notanish so`zli gapni rad etadi va qayta so`raydi', async () => {
    const r = await generateForUnit(
      model(
        'Ich komme aus Kalifornien. | Men Kaliforniyadanman.',
        'Ich heiße Anna. | Mening ismim Anna.',
      ),
      { allowed, words: ['heißen'], examples: [], count: 1 },
    );
    expect(r.kept).toEqual([
      { de: 'Ich heiße Anna.', uz: 'Mening ismim Anna.' },
    ]);
    expect(r.rejected[0].unknown).toEqual(['kalifornien']);
  });

  // Cheksiz urinish skriptni qotirib qo'yardi.
  it('uch urinishdan keyin gapni tashlaydi', async () => {
    const bad = 'Ich komme aus Kalifornien. | Men Kaliforniyadanman.';
    const r = await generateForUnit(model(bad, bad, bad, bad), {
      allowed,
      words: ['heißen'],
      examples: [],
      count: 1,
    });
    expect(r.kept).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
  });
});
