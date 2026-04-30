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
