import { normalizeSharedPhone, isUzbekPhone } from './phone.util';

/**
 * Kontakt tugmasidan kelgan raqam. Telegram uni O'ZI beradi — xato terilgan
 * bo'lishi mumkin emas, shuning uchun chet el raqamini rad etmaymiz.
 */
describe('normalizeSharedPhone', () => {
  describe("O'zbekiston — 9 xonaga keltiriladi", () => {
    it.each([
      ['+998901234567', '901234567'],
      ['998901234567', '901234567'],
      ['+998 90 123 45 67', '901234567'],
      ['901234567', '901234567'],
      ['+998972062922', '972062922'],
    ])('%s → %s', (input, expected) => {
      expect(normalizeSharedPhone(input)).toBe(expected);
    });
  });

  describe('Chet el — kod bilan saqlanadi', () => {
    it.each([
      // CEO test qilgan haqiqiy raqam
      ['+49 174 9493338', '491749493338'],
      ['+49 174 9493338'.replace(/\s/g, ''), '491749493338'],
      ['+7 926 1234567', '79261234567'],
      ['+1 202 555 0143', '12025550143'],
      ['+90 532 123 45 67', '905321234567'],
    ])('%s → %s', (input, expected) => {
      expect(normalizeSharedPhone(input)).toBe(expected);
    });
  });

  describe('rad etiladigan holatlar', () => {
    it.each([
      ['', 'bosh satr'],
      ['   ', 'faqat probel'],
      ['abc', 'raqamsiz'],
      ['1234567', 'juda qisqa (7)'],
      ['1234567890123456', 'juda uzun (16)'],
    ])('%s (%s) → null', (input) => {
      expect(normalizeSharedPhone(input)).toBeNull();
    });
  });

  it('998 bilan boshlanuvchi lekin uzunligi boshqa raqamni kesmaydi', () => {
    // 998 — Kolumbiya/boshqa raqam boshi ham bo'lishi mumkin; faqat aynan
    // 12 xonali o'zbek formatida kesamiz.
    expect(normalizeSharedPhone('9981234567')).toBe('9981234567');
  });

  it('bir xil raqam turli formatda bir xil natija beradi', () => {
    const forms = [
      '+998901234567',
      '998901234567',
      '901234567',
      '+998 90 123-45-67',
    ];
    const results = forms.map((f) => normalizeSharedPhone(f));
    expect(new Set(results).size).toBe(1);
  });
});

describe('isUzbekPhone', () => {
  it("9 xonali raqamni o'zbekistonniki deb biladi", () => {
    expect(isUzbekPhone('901234567')).toBe(true);
  });

  it('chet el raqamini rad etadi', () => {
    expect(isUzbekPhone('491749493338')).toBe(false);
  });
});
