import { stripTags } from './aud-section.parser';

/**
 * Tekshirgichning javobi — MASHQ TO'PLAMINING JAVOB KALITI.
 *
 * Grimm Grammar mashqlarining javoblari sahifada ham, bosma versiyada ham,
 * yuklab olinadigan PDF'da ham yo'q. Ular serverda: forma
 * `/gg/ex_set_proc.php?ec=<kod>` ga yuboriladi va javob sahifasi TO'G'RI
 * javoblarni belgilab qaytaradi:
 *
 *   <span class="ans_fib">die</span>   — bo'sh joyning to'g'ri javobi
 *   <span class="ans_mc">a. einen Präsidenten</span>  — to'g'ri variant
 *
 * Ya'ni javoblar taxmin qilinmaydi va AI bilan to'ldirilmaydi — ular
 * mualliflarning o'zidan olinadi. Bu muhim: mashq javobi noto'g'ri bo'lsa,
 * o'quvchiga to'g'ri javobi uchun «xato» deyiladi, va bunday tizimga
 * ishonch bir marta yo'qoladi.
 *
 * Natijalar xulosasi blokida izoh sifatida yolg'on `ans_fib` bor
 * («correct answers: underlined»). U TUZILISHI bilan ajraladi: izoh
 * `<span class="fib_ans">` o'ramasi ichida keladi, haqiqiy javob esa
 * hech qachon emas. O'ram olib tashlanadi, qolgani javob.
 *
 * Boshlanish nuqtasi sifatida `<table class="ex">` dan foydalanib
 * bo'lmaydi: CLOZE mashqlarida jadval umuman yo'q, javoblar
 * `<p class="clz">` paragrafida keladi — beshta to'plam (62 javob) shu
 * yo'l bilan jimgina yo'qolardi.
 */

/** Xulosa blokidagi izoh: `<span class="fib_ans"><span class="ans_fib">…</span></span>`. */
const LEGEND_RE =
  /<span class="fib_ans">\s*<span class="ans_fib">[\s\S]*?<\/span>\s*<\/span>/g;
const ANSWER_RE = /<span class="ans_(?:fib|mc)">([\s\S]*?)<\/span>/g;

/** Forma rad etilganda tekshirgich shu matnni qaytaradi. */
const REFUSED = 'No form data was submitted';

export class AnswerKeyRefusedError extends Error {
  constructor(code: string) {
    super(`Tekshirgich ${code} uchun formani rad etdi`);
    this.name = 'AnswerKeyRefusedError';
  }
}

/**
 * Javob sahifasidan to'g'ri javoblarni HUJJAT TARTIBIDA qaytaradi.
 * Tartib muhim: javoblar mashqlarga nomer bo'yicha emas, ketma-ketlik
 * bo'yicha biriktiriladi.
 */
export function parseAnswerKey(html: string, code: string): string[] {
  if (html.includes(REFUSED)) throw new AnswerKeyRefusedError(code);

  const body = html.replace(LEGEND_RE, '');
  return [...body.matchAll(ANSWER_RE)].map((m) => stripTags(m[1]));
}
