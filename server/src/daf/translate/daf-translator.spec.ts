import {
  buildPrompt,
  parseTranslations,
  translateBatch,
  TranslationCountMismatchError,
} from './daf-translator';
import type { TranslateModel } from './translate-model';

function fake(reply: string): TranslateModel & { lastPrompt: string } {
  return {
    name: 'fake',
    lastPrompt: '',
    async complete(prompt: string) {
      this.lastPrompt = prompt;
      return reply;
    },
  };
}

describe('translateBatch', () => {
  // Inglizcha izoh ma'noni aniqlashtiradi (`Bank` — o'rindiqmi yoki bank?),
  // shuning uchun u so'rovga kiradi. Lekin tarjima nemischadan qilinadi:
  // inglizchaning o'zi allaqachon tarjima.
  it("so'rovga nemischa va inglizcha matnni birga yuboradi", async () => {
    const model = fake('["Salom!"]');
    await translateBatch([{ de: 'Hallo!', en: 'Hello!' }], model);

    expect(model.lastPrompt).toContain('Hallo!');
    expect(model.lastPrompt).toContain('Hello!');
  });

  // Asl matn tarjima ustiga yozilmaydi: qayta ko'rilganda solishtirish
  // uchun ikkalasi ham kerak.
  it('asl nemischa va inglizcha matnni saqlaydi', async () => {
    const [out] = await translateBatch(
      [{ de: 'Guten Tag!', en: 'Good day.' }],
      fake('["Xayrli kun!"]'),
    );

    expect(out).toEqual({
      de: 'Guten Tag!',
      en: 'Good day.',
      uz: 'Xayrli kun!',
    });
  });

  // Bu eng muhim tekshiruv. Soni mos kelmasa tarjimalar bir pozitsiyaga
  // siljiydi va HAR BIRI boshqa so'zga tushadi — lekin har so'z tarjimali
  // bo'lib turadi, ya'ni xato ko'rinmaydi.
  it('qaytgan tarjimalar soni mos kelmasa yiqiladi', async () => {
    await expect(
      translateBatch(
        [
          { de: 'a', en: 'a' },
          { de: 'b', en: 'b' },
        ],
        fake('["faqat bitta"]'),
      ),
    ).rejects.toBeInstanceOf(TranslationCountMismatchError);
  });

  it("bo'sh ro'yxatda modelga umuman murojaat qilmaydi", async () => {
    const model = fake('["x"]');
    expect(await translateBatch([], model)).toEqual([]);
    expect(model.lastPrompt).toBe('');
  });

  it("tarjima atrofidagi bo'shliqni tozalaydi", async () => {
    const [out] = await translateBatch(
      [{ de: 'Hallo!', en: 'Hello!' }],
      fake('["  Salom!  "]'),
    );
    expect(out.uz).toBe('Salom!');
  });
});

describe('buildPrompt', () => {
  // O'zbek matnlari faqat lotin alifbosida bo'lishi loyihaning qoidasi;
  // model kirillga o'tib ketmasligi uchun bu so'rovda aniq aytiladi.
  it('lotin alifbosini talab qiladi', () => {
    expect(buildPrompt([{ de: 'a', en: 'b' }])).toMatch(/lotin/i);
  });

  it('kutilgan elementlar sonini aytadi', () => {
    const p = buildPrompt([
      { de: 'a', en: 'a' },
      { de: 'b', en: 'b' },
    ]);
    expect(p).toContain('2 ta element');
  });
});

describe('parseTranslations', () => {
  // Model javobni ba'zan izoh yoki ``` bloki bilan o'raydi.
  it('matn ichidagi JSON massivni ajratadi', () => {
    expect(parseTranslations('Mana natija:\n```json\n["a","b"]\n```')).toEqual([
      'a',
      'b',
    ]);
  });

  it('massiv topilmasa yiqiladi', () => {
    expect(() => parseTranslations('hech narsa')).toThrow(/massiv topilmadi/);
  });

  it('satr bo`lmagan elementli massivni rad etadi', () => {
    expect(() => parseTranslations('["a", 5]')).toThrow(/satrlar massivi emas/);
  });
});
