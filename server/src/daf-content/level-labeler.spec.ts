import { labelChapter } from './level-labeler';

describe('labelChapter', () => {
  it('1-bobni A1.1 deb belgilaydi', () => {
    const r = labelChapter({
      chapter: 1,
      grammarFocus: ['vi_05'],
      grammarRecommended: [],
    });
    expect(r.level).toBe('A1.1');
    expect(r.needsReview).toBe(false);
  });

  it('9-bobni A2.2 deb belgilaydi', () => {
    const r = labelChapter({
      chapter: 9,
      grammarFocus: [],
      grammarRecommended: [],
    });
    expect(r.level).toBe('A2.2');
  });

  it("grammatika bobdan yuqori bo'lsa, darajani ko'taradi", () => {
    // vsub_02 = Konjunktiv II (present subjunctive) -> B1, bob esa A1.1
    const r = labelChapter({
      chapter: 1,
      grammarFocus: ['vsub_02'],
      grammarRecommended: [],
    });
    expect(r.level).toBe('B1');
    expect(r.reason).toContain('vsub_02');
  });

  it("ikki pog'onadan ortiq farqni ko'rikka belgilaydi", () => {
    const r = labelChapter({
      chapter: 1,
      grammarFocus: ['vsub_02'],
      grammarRecommended: [],
    });
    expect(r.needsReview).toBe(true);
  });

  it("aynan ikki pog'onalik farqni ham ko'rikka belgilaydi (chegara holati)", () => {
    // vcp_01 = conversational past -> A2.1 (indeks 2), bob 1 esa A1.1 (indeks 0):
    // farq aynan 2 pog'ona — shu chegarada needsReview true bo'lishi kerak.
    const r = labelChapter({
      chapter: 1,
      grammarFocus: ['vcp_01'],
      grammarRecommended: [],
    });
    expect(r.level).toBe('A2.1');
    expect(r.needsReview).toBe(true);
  });

  it("Recommended grammatika darajani ko'tarmaydi", () => {
    const r = labelChapter({
      chapter: 1,
      grammarFocus: [],
      grammarRecommended: ['vsub_02'],
    });
    expect(r.level).toBe('A1.1');
  });

  it("noma'lum grammatika kodi darajaga ta'sir qilmaydi", () => {
    const r = labelChapter({
      chapter: 2,
      grammarFocus: ['zzz_99'],
      grammarRecommended: [],
    });
    expect(r.level).toBe('A1.1');
    expect(r.needsReview).toBe(false);
  });
});
