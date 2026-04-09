/**
 * Telefon raqamni formatlash: 9 raqamli → +998 XX XXX XX XX
 */
export function formatPhone(phone: string): string {
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
 * Balansni formatlash: 1500000 → "1,500,000 so'm"
 */
export function formatBalance(balance: number): string {
  const abs = Math.abs(balance)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (balance < 0) return `-${abs} so'm`;
  return `${abs} so'm`;
}
