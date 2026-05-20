/**
 * Formats a so'm amount with spaces as thousand separators — the Uzbek
 * convention, matching the client's `formatBalance`. Locale-independent
 * (manual regex) so it behaves the same regardless of the Node ICU build.
 * Negative values keep the leading minus.
 */
export function formatSom(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toFixed(0);
  const withSeparators = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + withSeparators;
}
