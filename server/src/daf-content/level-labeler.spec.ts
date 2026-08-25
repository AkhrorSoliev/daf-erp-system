import { labelChapter } from './level-labeler';

describe('labelChapter', () => {
  it('1-bobni A1.1 deb belgilaydi', () => {
    const r = labelChapter({ chapter: 1, grammarFocus: ['vi_05'], grammarRecommended: [] });
    expect(r.level).toBe('A1.1');
    expect(r.needsReview).toBe(false);
  });

  it('9-bobni A2.2 deb belgilaydi', () => {
    const r = labelChapter({ chapter: 9, grammarFocus: [], grammarRecommended: [] });
    expect(r.level).toBe('A2.2');
  });

  it('grammatika bobdan yuqori bo\'lsa, darajani ko\'taradi', () => {
    // vsub_01 = Konjunktiv II -> B1, bob esa A1.1
    const r = labelChapter({ chapter: 1, grammarFocus: ['vsub_01'], grammarRecommended: [] });
    expect(r.level).toBe('B1');
    expect(r.reason).toContain('vsub_01');
  });

  it('ikki pog\'onadan ortiq farqni ko\'rikka belgilaydi', () => {
    const r = labelChapter({ chapter: 1, grammarFocus: ['vsub_01'], grammarRecommended: [] });
    expect(r.needsReview).toBe(true);
  });

  it('Recommended grammatika darajani ko\'tarmaydi', () => {
    const r = labelChapter({
      chapter: 1,
      grammarFocus: [],
      grammarRecommended: ['vsub_01'],
    });
    expect(r.level).toBe('A1.1');
  });

  it('noma\'lum grammatika kodi darajaga ta\'sir qilmaydi', () => {
    const r = labelChapter({ chapter: 2, grammarFocus: ['zzz_99'], grammarRecommended: [] });
    expect(r.level).toBe('A1.1');
    expect(r.needsReview).toBe(false);
  });
});
