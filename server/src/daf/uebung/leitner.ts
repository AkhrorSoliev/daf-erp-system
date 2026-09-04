/**
 * Qaytarish jadvali — Leitner qutisi.
 *
 * NEGA XATO JAVOB NOLGA TUSHIRADI. Yumshoq tushirish (`strength - 1`)
 * sinovda so'zni juda tez qaytardi va o'quvchi uni «bilaman» deb
 * o'ylab qolardi. Noldan boshlash ochiqroq: bilmagan so'z qaytadan
 * o'rganiladi.
 *
 * Kun hisobi UTC da yuritiladi. Toshkent vaqtiga o'tkazish keyingi
 * rejaning ishi — hozir muddat faqat «necha kundan keyin» degan
 * ma'noda ishlatiladi.
 */
export const INTERVALLE = [0, 1, 3, 7, 16, 35];

const TAG_MS = 24 * 60 * 60 * 1000;

export interface LeitnerZustand {
  strength: number;
  dueAt: Date;
}

export function naechsterZustand(
  strength: number,
  richtig: boolean,
  jetzt: Date,
): LeitnerZustand {
  if (!richtig) {
    return { strength: 0, dueAt: new Date(jetzt.getTime() + TAG_MS) };
  }
  const neu = Math.min(INTERVALLE.length - 1, strength + 1);
  return { strength: neu, dueAt: new Date(jetzt.getTime() + INTERVALLE[neu] * TAG_MS) };
}
