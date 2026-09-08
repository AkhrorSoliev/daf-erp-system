import {
  decidePicturable,
  generate,
  type Lexeme,
} from './daf-mark-picturable';
import type { TranslateModel } from '../src/daf/translate/translate-model';
import type { PicturableMap } from '../src/daf/media/picturable';

// Bu fayl `daf-mark-picturable.ts`ni IMPORT qiladi, lekin `main()` faqat
// `require.main === module`da yuguradi (skriptning o'zidagi izohga
// qarang) — shuning uchun shu import HECH QANDAY DB ulanishi yoki pullik
// model chaqiruvi qilmaydi. Quyidagi testlar ham faqat sof funksiyalarni
// va soxta (fake) modelni sinaydi — haqiqiy OpenAI'ga hech qachon chiqilmaydi.

/**
 * Har chaqiruvni yozib boradigan soxta model — `decidePicturable`ning
 * "bo'sh missing modelni chaqirmaydi" va'dasini haqiqiy `fetch`siz
 * tekshirish uchun. Javobni `answers` xaritasidan (`de` -> "ha"/"yo'q")
 * quradi — `buildPicturablePrompt` chiqargan qatorlarni qayta o'qib.
 */
class FakeModel implements TranslateModel {
  readonly name = 'fake';
  callCount = 0;
  askedDe: string[] = [];

  constructor(private readonly answers: Record<string, boolean>) {}

  async complete(prompt: string): Promise<string> {
    this.callCount++;
    const des = [...prompt.matchAll(/^\d+\.\s+(.+?)\s+\[uz:/gm)].map(
      (m) => m[1],
    );
    this.askedDe.push(...des);
    return des
      .map((de, i) => `${i + 1}. ${this.answers[de] ? 'ha' : "yo`q"}`)
      .join('\n');
  }
}

function lex(sourceId: string, de: string, uz = ''): Lexeme {
  return { sourceId, de, uz };
}

describe('generate', () => {
  it("bo'sh ro'yxat bilan chaqirilganda modelni umuman chaqirmaydi", async () => {
    const model = new FakeModel({});
    const result = await generate([], model);
    expect(result).toEqual({});
    expect(model.callCount).toBe(0);
  });

  it("mamlakat/son/iborani modeldan so'ramay to'g'ridan-to'g'ri false qiladi", async () => {
    const model = new FakeModel({ Apfel: true });
    const result = await generate(
      [lex('a', 'Deutschland'), lex('b', 'Apfel')],
      model,
    );
    expect(result).toEqual({ a: false, b: true });
    // Faqat "Apfel" so'raldi — "Deutschland" isNeverPicturable tomonidan
    // model chaqirilishidan OLDIN chetlatildi.
    expect(model.askedDe).toEqual(['Apfel']);
  });
});

describe('decidePicturable', () => {
  it('existing yozuvlar tegilmasdan saqlanadi, missing esa modeldan so`raladi', async () => {
    const lexemes = [
      lex('u01-s1-hallo', 'hallo'),
      lex('u01-s2-frau', 'Frau', 'ayol'),
    ];
    // "hallo" uchun qaror ALLAQACHON bor (masalan avvalgi yurishdan) —
    // model uni QAYTA so'ramasligi kerak, hatto model "false" desa ham.
    const existing: PicturableMap = { 'u01-s1-hallo': true };
    const model = new FakeModel({ Frau: true, hallo: false });

    const { result, missingCount, additionsCount } = await decidePicturable(
      lexemes,
      existing,
      () => model,
    );

    expect(result).toEqual({ 'u01-s1-hallo': true, 'u01-s2-frau': true });
    expect(missingCount).toBe(1);
    expect(additionsCount).toBe(1);
    // "hallo" uchun model umuman so'ralmadi.
    expect(model.askedDe).toEqual(['Frau']);
  });

  it("bo'sh missing holatida modelni HATTO qurish uchun ham chaqirmaydi", async () => {
    const lexemes = [lex('a', 'hallo')];
    const existing: PicturableMap = { a: true };
    const buildModel = jest.fn<TranslateModel, []>();

    const { result, missingCount, additionsCount } = await decidePicturable(
      lexemes,
      existing,
      buildModel,
    );

    expect(result).toEqual({ a: true });
    expect(missingCount).toBe(0);
    expect(additionsCount).toBe(0);
    // `buildModel` chaqirilmadi — apiKey sozlanmagan bo'lsa ham (real
    // skriptda `buildModel` shu yerda throw qilardi) bu holat yiqilmaydi,
    // chunki chaqirilmaydi.
    expect(buildModel).not.toHaveBeenCalled();
  });

  it("qattiq qoidalar (harf, son) modelning 'ha' javobini ENG OXIRIDA yengadi", async () => {
    // Fayldagi eski, qoidasiz paytda yozib qo'yilgan "true" — buni
    // simulyatsiya qiladi (masalan boshqa manbadan kelib qolgan xato
    // yozuv). `applyNeverPicturableRule` `decidePicturable` ichida
    // SO'ZSIZ qo'llanadi, shuning uchun bu qanday paydo bo'lishidan
    // qat'i nazar false ga qaytishi kerak.
    const lexemes = [lex('letter', 'C'), lex('number', 'zwei')];
    const existing: PicturableMap = { letter: true, number: true };
    const buildModel = jest.fn<TranslateModel, []>();

    const { result } = await decidePicturable(lexemes, existing, buildModel);

    expect(result).toEqual({ letter: false, number: false });
  });

  it("missing ichidagi harf/sonni ham modeldan so'ramay false qiladi", async () => {
    // Bu safar "missing" tomondan: fayl bo'sh, ya'ni model chaqirilishi
    // MUMKIN edi, lekin `generate()` ichidagi `isNeverPicturable` ularni
    // model chaqirilishidan OLDIN chetlatadi — modelga hech narsa
    // yubormaydi, va natija baribir false.
    const lexemes = [lex('letter', 'Z'), lex('word', 'Apfel')];
    const model = new FakeModel({ Z: true, Apfel: true });

    const { result } = await decidePicturable(lexemes, {}, () => model);

    expect(result).toEqual({ letter: false, word: true });
    expect(model.askedDe).toEqual(['Apfel']);
  });
});
