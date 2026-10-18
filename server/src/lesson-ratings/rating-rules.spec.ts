import {
  cleanComment,
  isWithinWindow,
  parseRatingCallback,
  ratingKeyboard,
  ratingQuestion,
  shouldAskNow,
  thanksText,
} from './rating-rules';

const ID = '11111111-2222-3333-4444-555555555555';

describe('shouldAskNow', () => {
  it('asks from 10 minutes after the end up to 3 hours', () => {
    expect(shouldAskNow('10:00', 10 * 60 + 9)).toBe(false);
    expect(shouldAskNow('10:00', 10 * 60 + 10)).toBe(true);
    expect(shouldAskNow('10:00', 13 * 60)).toBe(true);
    expect(shouldAskNow('10:00', 13 * 60 + 1)).toBe(false);
  });
});

describe('ratingQuestion', () => {
  it('names the student, the group and every teacher, HTML-escaped', () => {
    const text = ratingQuestion({
      studentFirstName: 'Ali',
      groupName: 'A1 <3>',
      teacherNames: ['Anna Schmidt', 'Vali Karimov'],
    });
    expect(text).toBe(
      "📚 <b>Ali</b>, bugungi «A1 &lt;3&gt;» darsi qanday o'tdi?\n" +
        'Ustoz: Anna Schmidt, Vali Karimov\n\nBaho bering:\n' +
        "🔒 Baho to'liq anonim: hech kimga ismingiz ko'rinmaydi.",
    );
  });

  it('drops the teacher line when nobody taught', () => {
    const text = ratingQuestion({
      studentFirstName: 'Ali',
      groupName: 'A1',
      teacherNames: [],
    });
    expect(text).not.toContain('Ustoz:');
  });
});

describe('ratingKeyboard / parseRatingCallback', () => {
  it('builds five buttons in one row that parse back', () => {
    const kb = ratingKeyboard(ID);
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0].map((b) => b.text)).toEqual([
      '1 ⭐',
      '2 ⭐',
      '3 ⭐',
      '4 ⭐',
      '5 ⭐',
    ]);
    expect(kb.inline_keyboard[0][3].callback_data).toBe(`lr:${ID}:4`);
    expect(
      Buffer.byteLength(kb.inline_keyboard[0][3].callback_data),
    ).toBeLessThanOrEqual(64);
    expect(parseRatingCallback(`lr:${ID}:4`)).toEqual({
      ratingId: ID,
      score: 4,
    });
  });

  it('refuses anything else', () => {
    expect(parseRatingCallback(`lr:${ID}:6`)).toBeNull();
    expect(parseRatingCallback(`lr:${ID}:0`)).toBeNull();
    expect(parseRatingCallback('lr:abc:3')).toBeNull();
    expect(parseRatingCallback(`tk:list`)).toBeNull();
  });
});

describe('isWithinWindow', () => {
  it('is open for 48 hours', () => {
    const sent = new Date('2026-10-12T10:00:00Z');
    expect(isWithinWindow(sent, new Date('2026-10-14T09:59:59Z'))).toBe(true);
    expect(isWithinWindow(sent, new Date('2026-10-14T10:00:01Z'))).toBe(false);
  });
});

describe('cleanComment', () => {
  it('trims, cuts at 500 and turns blank into null', () => {
    expect(cleanComment('  zerikarli edi  ')).toBe('zerikarli edi');
    expect(cleanComment('   ')).toBeNull();
    expect(cleanComment('x'.repeat(600))).toHaveLength(500);
  });
});

describe('thanksText', () => {
  it('repeats the score', () => {
    expect(thanksText(4)).toBe("Rahmat! Siz 4 ⭐ qo'ydingiz.");
  });
});
