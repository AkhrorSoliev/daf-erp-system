/** `TB-2026-0001`: «Teilnahmebestätigung», the Tashkent year, a per-company-and-year sequence. */
export function certificateNumber(year: number, seq: number): string {
  return `TB-${year}-${String(seq).padStart(4, '0')}`;
}
