import { parseAnswerKey, AnswerKeyRefusedError } from './dib-answer-key.parser';

describe('parseAnswerKey', () => {
  const page = (body: string) =>
    `<div class="res_summ"><span class="fib_ans"><span class="ans_fib">underlined</span></span></div><table class="ex">${body}</table>`;

  it('bo`sh joy javoblarini hujjat tartibida qaytaradi', () => {
    const html = page(
      '<tr><td><span class="ans_fib">die</span></td></tr>' +
        '<tr><td><span class="ans_fib">das</span></td></tr>' +
        '<tr><td><span class="ans_fib">der</span></td></tr>',
    );

    expect(parseAnswerKey(html, 'no_02_01_fib')).toEqual(['die', 'das', 'der']);
  });

  it('variant tanlash javobini variant matni bilan qaytaradi', () => {
    const html = page(
      '<tr><td><span class="ans_mc">a. einen Pr&auml;sidenten</span></td></tr>',
    );

    expect(parseAnswerKey(html, 'no_04_01_mcr')).toEqual([
      'a. einen Präsidenten',
    ]);
  });

  // Xulosa blokidagi «underlined» ham `ans_fib` klassida keladi. U javob
  // emas — hisobga olinsa, butun to'plamning javoblari bittaga siljiydi va
  // HAR BIR mashq noto'g'ri javob oladi.
  it('xulosa blokidagi izohni javob deb hisoblamaydi', () => {
    const html = page('<tr><td><span class="ans_fib">die</span></td></tr>');

    expect(parseAnswerKey(html, 'x')).toEqual(['die']);
  });

  it('javob ichidagi teglarni tozalaydi', () => {
    const html = page(
      '<tr><td><span class="ans_fib">ist <i>gekommen</i></span></td></tr>',
    );

    expect(parseAnswerKey(html, 'x')).toEqual(['ist gekommen']);
  });

  // Bo'sh natijani muvaffaqiyat deb hisoblash — aynan shu 256 ta mashqni
  // yo'qotgan xato. Rad etilgan forma ovozsiz nol javob qaytarmasligi kerak.
  it('forma rad etilsa yiqiladi, bo`sh ro`yxat qaytarmaydi', () => {
    expect(() =>
      parseAnswerKey('No form data was submitted.', 'vi_08_02_dd'),
    ).toThrow(AnswerKeyRefusedError);
  });

  it('javob umuman bo`lmasa bo`sh qaytaradi', () => {
    expect(parseAnswerKey('<html><body>hech narsa</body></html>', 'x')).toEqual(
      [],
    );
  });

  // CLOZE mashqlarida `<table class="ex">` yo'q — javoblar paragrafda
  // keladi. Jadvalni boshlanish nuqtasi qilib olgan birinchi versiya
  // beshta to'plamning 62 javobini jimgina yo'qotgan edi.
  it('jadvalsiz CLOZE javoblarini ham o`qiydi', () => {
    const html =
      '<span class="fib_ans"><span class="ans_fib">underlined</span></span>' +
      '<p class="clz">Heute Abend <span class="ans_fib">ist</span> es ' +
      '<span class="ans_fib">kalt</span>.</p>';

    expect(parseAnswerKey(html, 'vi_11_01_fib')).toEqual(['ist', 'kalt']);
  });
});
