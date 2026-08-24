import {
  ASK_FIRST_NAME,
  ASK_LAST_NAME,
  FIRST_NAME_HINT,
  MULTI_WORD_NAME_HINT,
  looksLikeFullName,
} from './name-prompts';

describe('name-prompts', () => {
  describe('looksLikeFullName', () => {
    it("bitta so'zli ismni o'tkazadi", () => {
      expect(looksLikeFullName('Ali')).toBe(false);
      expect(looksLikeFullName('Dilnoza')).toBe(false);
    });

    it("to'liq ism-familiyani aniqlaydi", () => {
      expect(looksLikeFullName('Ali Valiyev')).toBe(true);
      expect(looksLikeFullName("Abdulla Abdurahmon o'g'li")).toBe(true);
    });

    it("ortiqcha probellar yolg'on ishora bermaydi", () => {
      // Oldi/keti va ikkilangan probel bir so'zni ikkiga bo'lib ko'rsatmasligi kerak.
      expect(looksLikeFullName('  Ali  ')).toBe(false);
      expect(looksLikeFullName('Ali')).toBe(false);
    });

    it("so'zlar orasida bir nechta probel bo'lsa ham ikki so'z deb biladi", () => {
      expect(looksLikeFullName('Ali    Valiyev')).toBe(true);
    });

    it("chiziqcha bilan yozilgan qo'shma ismni bitta so'z deb biladi", () => {
      // Probel yo'q — bo'lish uchun asos yo'q, foydalanuvchini bezovta qilmaymiz.
      expect(looksLikeFullName('Gul-Nora')).toBe(false);
    });
  });

  describe('matnlar', () => {
    it("ism so'rovi familiya keyin so'ralishini aytadi", () => {
      expect(ASK_FIRST_NAME).toContain('Familiya'.toLowerCase().slice(0, 5));
      expect(ASK_FIRST_NAME.toLowerCase()).toContain('keyingi qadamda');
    });

    it("familiya so'rovi alohida qadam ekanini bildiradi", () => {
      expect(ASK_LAST_NAME.toLowerCase()).toContain('familiya');
    });

    it('ogohlantirish nima qilish kerakligini aytadi', () => {
      expect(MULTI_WORD_NAME_HINT.toLowerCase()).toContain('faqat');
      expect(MULTI_WORD_NAME_HINT).toContain('Masalan');
    });

    it("izoh to'liq so'rov ichida ham bor (ikkalasi ajralib ketmasin)", () => {
      // Mock imtihonda savol matni bazadan keladi, shuning uchun u yerda faqat
      // FIRST_NAME_HINT qo'shiladi. Ikkisi bitta manbadan bo'lishi shart.
      expect(ASK_FIRST_NAME).toContain(FIRST_NAME_HINT);
    });

    it("matnlarda formatlash belgilari yo'q (parse_mode ishlatilmaydi)", () => {
      // Ismlarda `_` yoki `*` uchrasa Markdown xabarni buzardi — shuning uchun
      // so'rovlar ataylab oddiy matn.
      for (const t of [ASK_FIRST_NAME, ASK_LAST_NAME, MULTI_WORD_NAME_HINT]) {
        expect(t).not.toMatch(/<\/?[a-z]+>/i);
        expect(t).not.toMatch(/\*\*/);
      }
    });
  });
});
