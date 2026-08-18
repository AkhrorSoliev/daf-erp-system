/**
 * Telefon raqamni formatlash: 9 raqamli → +998 XX XXX XX XX.
 * `null`/`undefined` uchun "—" qaytaradi (jadval va kartochkalarda standart).
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  if (digits.length === 12 && digits.startsWith("998")) {
    const d = digits.slice(3);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return phone;
}

/**
 * Telefon input uchun jonli formatlash: raqamlarni "XX XXX XX XX" ko'rinishida
 * bo'sh joylar bilan ajratadi (prefixsiz — `+998` alohida addon sifatida chiqadi).
 * Login/parol tiklash inputlarida foydalaniladi; state'da faqat raw raqamlar saqlanadi.
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 5));
  if (digits.length > 5) parts.push(digits.slice(5, 7));
  if (digits.length > 7) parts.push(digits.slice(7, 9));
  return parts.join(" ");
}

/** Xalqaro raqam uzunligi chegarasi (E.164: maksimal 15 raqam). */
const MAX_PHONE_DIGITS = 15;

/** Mamlakat kodi bilan yozilgan raqamning guruh o'lchamlari: 998 90 123 45 67. */
const PHONE_WITH_CODE_GROUPS = [3, 2, 3, 2, 2];

/**
 * Mamlakat kodi bilan teriladigan input uchun jonli formatlash:
 * "998901234567" → "998 90 123 45 67" (faqat "+" addon alohida chiqadi).
 *
 * Chet el raqami boshqa uzunlikda bo'lishi mumkin, shuning uchun guruhlardan
 * ortgan raqamlar oxiriga bitta bo'lak bo'lib qo'shiladi — hech qachon
 * kesilmaydi. State'da faqat raw raqamlar saqlanadi.
 */
export function formatPhoneWithCodeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);
  const parts: string[] = [];
  let cursor = 0;
  for (const size of PHONE_WITH_CODE_GROUPS) {
    if (cursor >= digits.length) break;
    parts.push(digits.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < digits.length) parts.push(digits.slice(cursor));
  return parts.join(" ");
}

// Locale uchun yagona Intl.NumberFormat namunasi. O'zbek tilidagi
// foydalanuvchi guruh ajratuvchi sifatida bo'sh joyni va kasr ajratuvchi
// sifatida vergulni kutadi: 1 500 000,5 — bu uz-UZ konvensiyasi.
const NUMBER_LOCALE = "uz-UZ";
const defaultNumberFormat = new Intl.NumberFormat(NUMBER_LOCALE);

/**
 * Sonni o'zbek formatida formatlash: 1500000 → "1 500 000".
 * Markaz formatter — barcha hisobotlar va jadvallar shuni ishlatishi kerak.
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return "—";
  if (options) return new Intl.NumberFormat(NUMBER_LOCALE, options).format(value);
  return defaultNumberFormat.format(value);
}

/**
 * Foiz formatlash: 75.5 → "75.5%" (vergul kasr bilan: "75,5%").
 * `null` uchun "—" qaytaradi.
 */
export function formatPercent(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${formatNumber(value, options)}%`;
}

/**
 * Balansni formatlash: 1500000 → "1 500 000 so'm", -50000 → "-50 000 so'm".
 */
export function formatBalance(balance: number): string {
  const abs = formatNumber(Math.abs(balance));
  if (balance < 0) return `-${abs} so'm`;
  return `${abs} so'm`;
}

/**
 * Narxni formatlash (so'm qo'shilmasdan): 1500000 → "1 500 000".
 * Pul birligi qo'shilishi kerak bo'lsa, qo'l bilan " so'm" qo'shing yoki
 * `formatBalance()` ni ishlating.
 */
export function formatPrice(price: number): string {
  return formatNumber(price);
}
