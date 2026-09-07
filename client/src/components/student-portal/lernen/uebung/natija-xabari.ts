/**
 * Seans oxirida o'rin haqidagi xabar — yoki jimlik.
 *
 * O'RIN FAQAT O'ZGARGANDA AYTILADI. Har seansdan keyin "3-o'rin" deb
 * turaversa, u shovqinga aylanadi va o'quvchi e'tibor bermay qo'yadi.
 * Ko'tarilgan yoki tushgan lahza esa aynan qaytib kelishga undaydi.
 */
export function orinXabari(
  oldin: number | null,
  keyin: number | null,
): string | null {
  if (keyin == null) return null;
  if (oldin == null) return `Guruhda ${keyin}-o'rin`;
  if (oldin === keyin) return null;
  const farq = Math.abs(oldin - keyin);
  const yonalish = keyin < oldin ? "ko'tarildingiz" : "tushdingiz";
  return `Guruhda ${keyin}-o'rin — ${farq} pog'ona ${yonalish}`;
}
