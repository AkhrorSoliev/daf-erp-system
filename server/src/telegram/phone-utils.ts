/**
 * Telegram «📱 Telefon raqamni yuborish» tugmasi orqali kelgan raqamni
 * normallashtirish — barcha ro'yxatdan o'tish sahnalari uchun YAGONA joy.
 *
 * NEGA ALOHIDA QOIDA: tizimning qolgan qismi telefonni 9 xonali o'zbek raqami
 * deb biladi (`Student.phone`, `User.phone`, telefon bo'yicha login, Eskiz
 * SMS, frontenddagi `+998` prefiksi). Qo'lda yozilgan raqam uchun bu cheklov
 * o'rinli — xato terishdan saqlaydi.
 *
 * Ammo KONTAKT TUGMASI orqali kelgan raqamni Telegram o'zi beradi: u xato
 * terilgan bo'lishi mumkin emas va istalgan mamlakatniki bo'lishi mumkin.
 * Chet ellik odam (masalan Germaniyadagi o'quvchi) ro'yxatdan o'ta olishi
 * uchun bu yerda raqamni rad etmaymiz.
 *
 * O'zbek raqamlari AVVALGIDEK 9 xonaga keltiriladi — aks holda mavjud
 * o'quvchini telefon bo'yicha topish, telefon bilan login va dublikat
 * tekshiruvlari buzilardi.
 */

/** Xalqaro raqam uzunligi chegarasi (E.164: max 15 raqam). */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Kontakt tugmasidan kelgan raqamni saqlash formatiga keltiradi.
 *
 * - `+998 90 123 45 67` / `998901234567` / `901234567` → `901234567` (9 xona)
 * - `+49 174 9493338` → `491749493338` (o'zgarishsiz, kod bilan)
 * - juda qisqa yoki juda uzun → `null` (rad etiladi)
 */
export function normalizeSharedPhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  // O'zbekiston — mamlakat kodi olib tashlanadi, 9 xona qoladi.
  if (digits.length === 12 && digits.startsWith('998')) {
    return digits.slice(3);
  }
  if (digits.length === 9) {
    return digits;
  }

  // Chet el raqami — Telegram bergan holicha saqlanadi.
  if (digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS) {
    return digits;
  }

  return null;
}

/** Raqam o'zbekistonniki (9 xonaga keltirilgan) ekanini bildiradi. */
export function isUzbekPhone(normalized: string): boolean {
  return /^\d{9}$/.test(normalized);
}

/** Kontakt rad etilganda ko'rsatiladigan xabar. */
export const SHARED_PHONE_INVALID =
  "Telefon raqamni o'qib bo'lmadi. Iltimos, tugma orqali qayta yuboring.";
