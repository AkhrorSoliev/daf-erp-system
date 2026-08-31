import { equalsOrIn, toNumberArray, toStringArray } from './to-array';

describe('toStringArray', () => {
  it("vergulli satrni bo'laklarga ajratadi", () => {
    expect(toStringArray('CEO,Teacher')).toEqual(['CEO', 'Teacher']);
  });

  it("bo'shliqlarni kesadi va bo'sh bo'laklarni tashlaydi", () => {
    expect(toStringArray(' CEO , , Teacher ')).toEqual(['CEO', 'Teacher']);
  });

  it('takrorlangan query kalitidan kelgan massivni ham qabul qiladi', () => {
    expect(toStringArray(['CEO', 'Teacher'])).toEqual(['CEO', 'Teacher']);
  });

  it('obyekt kelsa e\'tiborsiz qoldiradi — "[object Object]" filtriga aylanmaydi', () => {
    expect(toStringArray({ a: 1 })).toBeUndefined();
    expect(toStringArray([{ a: 1 }, 'CEO'])).toEqual(['CEO']);
  });

  it("bo'sh kirishda undefined qaytaradi — [] emas", () => {
    expect(toStringArray(undefined)).toBeUndefined();
    expect(toStringArray(null)).toBeUndefined();
    expect(toStringArray('')).toBeUndefined();
    expect(toStringArray(',,')).toBeUndefined();
  });
});

describe('toNumberArray', () => {
  it('sonlarga aylantiradi', () => {
    expect(toNumberArray('10,11')).toEqual([10, 11]);
  });

  it("son bo'lmagan bo'laklarni tashlab yuboradi", () => {
    expect(toNumberArray('10,abc,12')).toEqual([10, 12]);
  });

  it("hammasi yaroqsiz bo'lsa undefined qaytaradi", () => {
    expect(toNumberArray('abc')).toBeUndefined();
  });
});

describe('equalsOrIn', () => {
  it('bitta qiymatni equals sifatida beradi', () => {
    expect(equalsOrIn(['A1'])).toBe('A1');
  });

  it("ko'p qiymatni in sifatida beradi", () => {
    expect(equalsOrIn(['A1', 'A2'])).toEqual({ in: ['A1', 'A2'] });
  });

  it("bo'sh yoki undefined uchun undefined — filtrsizlik", () => {
    expect(equalsOrIn([])).toBeUndefined();
    expect(equalsOrIn(undefined)).toBeUndefined();
  });
});
