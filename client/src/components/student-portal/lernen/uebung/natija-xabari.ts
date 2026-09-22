import type { FrageFormat } from "../types";

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

/**
 * Natija ekranidagi xato qatorining chap ustuni — odatda savol matni
 * (`prompt`).
 *
 * `AUDIO_WORT`/`WORT_TIPPEN`da server `prompt`ni ATAYLAB BO'SH yuboradi
 * (so'zning o'zi javob — server Task 3, mijoz Task 4): so'zni promptga
 * yozib qo'ysa, tinglash mashqi o'qish mashqiga aylanardi. Shu bo'sh
 * qatorni to'g'ridan-to'g'ri chizsak, o'quvchi xato ro'yxatida bo'sh
 * yorliq va faqat to'g'ri javobni ko'rar edi — bu savol turini
 * (eshitib tanish/yozish) yashiradi.
 *
 * `DIALOG_LUECKE` xuddi shu muammoni `titel` bilan hal qiladi — lekin
 * `titel` SERVERDAN `PublicFrage` bilan birga, JAVOBDAN OLDIN keladi,
 * shuning uchun uni javob so'zi bilan to'ldirish mumkin EMAS: bu
 * javobni savol chiqishi bilanoq oshkor qilib qo'yardi (aynan shu
 * ikki formatning butun qoidasi shuni taqiqlaydi). Shu sabab yechim
 * bu yerda, MIJOZDA, qat'iy (server bilmaydigan) matn bilan qilinadi —
 * hech qanday yangi ma'lumot serverdan so'ralmaydi.
 */
export function xatoYorligi(format: FrageFormat, prompt: string): string {
  if (format === "AUDIO_WORT" || format === "WORT_TIPPEN") return "Eshitish savoli";
  return prompt;
}
