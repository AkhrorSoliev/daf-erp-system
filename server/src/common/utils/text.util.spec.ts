import { truncateChars, stripLoneSurrogates } from './text.util';

/**
 * The receipt bug, 2026-08-18. `content.slice(0, 100)` cut the payment
 * receipt exactly between the two halves of 📄 (U+1F4C4 = 📄),
 * leaving a lone high surrogate. PostgreSQL `jsonb` refuses such a string
 * ("invalid input syntax for type json"), so the audit row for a receipt
 * that HAD been delivered was lost — 42 of the last 400 automatic messages.
 */
describe('truncateChars', () => {
  it('keeps a short string untouched', () => {
    expect(truncateChars('salom', 100)).toBe('salom');
  });

  it('cuts on a code point boundary, never inside a surrogate pair', () => {
    // 'ab' + 📄 — a naive slice(0, 3) would keep only the high surrogate.
    const text = 'ab\u{1F4C4}cd';
    const cut = truncateChars(text, 3);

    expect(cut).toBe('ab\u{1F4C4}');
    expect(hasLoneSurrogate(cut)).toBe(false);
  });

  it('drops the emoji entirely when it does not fit', () => {
    const text = 'ab\u{1F4C4}cd';
    expect(truncateChars(text, 2)).toBe('ab');
  });

  it('counts an astral character as one, not two', () => {
    expect(truncateChars('\u{1F4C4}\u{1F4C4}\u{1F4C4}', 2)).toBe(
      '\u{1F4C4}\u{1F4C4}',
    );
  });

  it('reproduces the real receipt without leaving half an emoji', () => {
    const receipt =
      "Salom, Davronbek!\n300 000 so'm to'lovingiz qabul qilindi (Naqd).\n" +
      "Joriy balansingiz: 134 348 so'm.\n\n\u{1F4C4} Chek: https://invoice.dafzentrum.uz/x";

    // What the code used to do.
    expect(hasLoneSurrogate(receipt.slice(0, 100))).toBe(true);
    // What it does now.
    expect(hasLoneSurrogate(truncateChars(receipt, 100))).toBe(false);
  });

  it('handles an empty string and a zero limit', () => {
    expect(truncateChars('', 100)).toBe('');
    expect(truncateChars('salom', 0)).toBe('');
  });
});

describe('stripLoneSurrogates', () => {
  it('leaves a well-formed string alone', () => {
    expect(stripLoneSurrogates('salom \u{1F4C4}')).toBe('salom \u{1F4C4}');
  });

  it('removes a trailing high surrogate', () => {
    expect(stripLoneSurrogates('salom \uD83D')).toBe('salom ');
  });

  it('removes a leading low surrogate', () => {
    expect(stripLoneSurrogates('\uDCC4 salom')).toBe(' salom');
  });

  it('keeps the pair but drops the stray next to it', () => {
    expect(stripLoneSurrogates('📄\uD83D')).toBe('\u{1F4C4}');
  });
});

function hasLoneSurrogate(s: string): boolean {
  return /[\uD800-\uDFFF]/.test(
    s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''),
  );
}
