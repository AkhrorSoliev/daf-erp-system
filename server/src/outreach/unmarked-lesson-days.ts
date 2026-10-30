/**
 * «Darsga qo'yilmayotganlar» tabi: o'quvchi uchun hisoblangan, o'tib ketgan va
 * ustoz davomat olgan, lekin o'quvchining o'ziga hech qanday belgi
 * (Keldi / Kelmadi / Kechikdi / Sababli) qo'yilmagan dars kunlari.
 *
 * Nega aynan shu: 2-darsdan keyin to'lamagan o'quvchiga davomat belgilab
 * bo'lmaydi (ADR-0047), shuning uchun u hech qanday davomat qatori
 * qoldirmaydi va «kelmaganlar» / «ko'p dars qoldirganlar» ro'yxatlariga
 * tushmaydi. Qatorning yo'qligi — shu holatning o'zi.
 *
 * Sanalar — Toshkent kunlari, 'YYYY-MM-DD' matni (leksikografik taqqoslanadi).
 */
export interface UnmarkedLessonDaysInput {
  /** Oylik hisobning muzlatilgan qoplangan sanalari (bir necha oy bo'lishi mumkin). */
  coveredDates: string[];
  /** Hisobdan qaytarilgan sanalar (bekor qilingan dars, ketgandan keyingi kunlar). */
  frozenOutDates: string[];
  /** Guruhda ustoz kamida bitta o'quvchiga davomat belgilagan kunlar. */
  heldDays: ReadonlySet<string>;
  /** Shu o'quvchida davomat qatori bor kunlar (har qanday holat). */
  markedDays: ReadonlySet<string>;
  /** Shu sanadan boshlab (kiritilgan). */
  from: string;
  /** Shu sanagacha (kiritilmagan) — odatda bugun. */
  to: string;
}

export function unmarkedLessonDays(input: UnmarkedLessonDaysInput): string[] {
  const frozen = new Set(input.frozenOutDates);
  const days = new Set<string>();
  for (const d of input.coveredDates) {
    if (d < input.from || d >= input.to) continue;
    if (frozen.has(d)) continue;
    if (!input.heldDays.has(d)) continue;
    if (input.markedDays.has(d)) continue;
    days.add(d);
  }
  return [...days].sort();
}
