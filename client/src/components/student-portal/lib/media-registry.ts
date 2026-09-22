/**
 * Ta'lim audiosi reyestri (dizayn 4.5).
 *
 * Faollik hisobi «o'quvchi hozir ta'lim audiosini tinglayaptimi» degan savolga
 * shu yerdan javob oladi: audio ijro etilayotganda o'quvchi ekranga tegmasa ham
 * faol hisoblanadi. `use-clip-player` `new Audio()` yaratadi va u DOM'da yo'q —
 * `querySelector("audio")` uni topmaydi, shuning uchun har pleyer o'zi yoziladi.
 *
 * RADIO BU YERGA KIRMAYDI: radio vaqti alohida o'lchanadi va o'quvchini «faol»
 * qilmaydi. Yangi ta'lim audio pleyeri qo'shilsa, u ham `registerMedia` qilishi SHART.
 */
export interface IjroEtuvchi {
  readonly paused: boolean;
  readonly ended: boolean;
}

const royxat = new Set<IjroEtuvchi>();

/** Elementni yozadi; qaytgan funksiya uni ro'yxatdan chiqaradi. */
export function registerMedia(el: IjroEtuvchi): () => void {
  royxat.add(el);
  return () => {
    royxat.delete(el);
  };
}

export function anyMediaPlaying(): boolean {
  for (const el of royxat) {
    if (!el.paused && !el.ended) return true;
  }
  return false;
}

/** Faqat testlar uchun. */
export function _reyestrniTozala(): void {
  royxat.clear();
}
