import type { GapExercise } from '../dataset.types';

/**
 * Javob kalitini mashqlarga biriktiradi.
 *
 * Biriktirish TARTIB bo'yicha emas, RAQAM bo'yicha: har bo'sh joy manbadagi
 * o'z raqamini olib yuradi (`name="fib_7"` → `slots: [7]`), va o'sha raqam
 * javob kalitidagi o'rinni ko'rsatadi. Tartib bo'yicha biriktirish bitta
 * o'tkazib yuborilgan mashqda butun to'plamni siljitib yuborardi — va bunday
 * xato ko'rinmaydi: har mashq javobli bo'lib turadi, faqat javoblar
 * boshqa mashqniki bo'ladi.
 *
 * Shuning uchun tekshiruv ham qattiq: kalitning HAR BIR o'rni aynan bir
 * marta ishlatilishi shart. Ortib qolgan o'rin — o'qilmagan mashq borligini
 * bildiradi; ikki marta ishlatilgan o'rin — mashqlar chalkashganini.
 */
export class AnswerKeyMismatchError extends Error {
  constructor(setCode: string, detail: string) {
    super(`${setCode}: javob kaliti mos kelmadi — ${detail}`);
    this.name = 'AnswerKeyMismatchError';
  }
}

export function attachAnswerKey(
  exercises: GapExercise[],
  key: string[],
  setCode: string,
): GapExercise[] {
  const used = new Map<number, string>();

  for (const ex of exercises) {
    if (ex.slots.length === 0) {
      throw new AnswerKeyMismatchError(setCode, `${ex.id} da javob o'rni yo'q`);
    }
    for (const slot of ex.slots) {
      if (slot < 1 || slot > key.length) {
        throw new AnswerKeyMismatchError(
          setCode,
          `${ex.id} ${slot}-o'rinni so'radi, kalitda ${key.length} ta javob bor`,
        );
      }
      const prev = used.get(slot);
      if (prev !== undefined) {
        throw new AnswerKeyMismatchError(
          setCode,
          `${slot}-o'rin ikki marta ishlatildi (${prev} va ${ex.id})`,
        );
      }
      used.set(slot, ex.id);
    }
  }

  if (used.size !== key.length) {
    const free = [...Array(key.length).keys()]
      .map((i) => i + 1)
      .filter((n) => !used.has(n));
    throw new AnswerKeyMismatchError(
      setCode,
      `${free.length} ta javob egasiz qoldi (o'rinlar: ${free.join(', ')})`,
    );
  }

  return exercises.map((ex) => {
    // Bo'sh javob — manba shu o'rin uchun kalit BERMAGANI. 1 306 o'rindan
    // 187 tasi shunday: gap birlashtirish va so'z tartiblash kabi ochiq
    // javobli topshiriqlarda to'g'ri javob bitta emas. Bo'sh satrni javob
    // sifatida saqlash ularni javobli qilib ko'rsatardi, va mashq dvigateli
    // o'quvchining har qanday javobini xato deb belgilardi.
    const answers = ex.slots.map((slot) => key[slot - 1] || null);
    const known = answers.filter((a) => a !== null).length;

    return {
      ...ex,
      answers,
      answerStatus:
        known === 0
          ? 'OPEN'
          : known === answers.length
            ? 'FROM_SOURCE'
            : 'PARTIAL',
    } as GapExercise;
  });
}
