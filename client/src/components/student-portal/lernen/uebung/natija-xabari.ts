import type { FrageFormat, PruefErgebnis } from "../types";

/**
 * What the panel under a checked question says. A picture choice's
 * `richtig` is a picture URL, so the word comes from `loesungWort` — shown
 * after a correct answer too, because the student may have found the
 * picture without knowing the word yet. A typed word one slip away counts
 * as correct (`tippfehler`) and shows the spelling to learn.
 */
export function javobPaneliMatni(
  natija: Pick<PruefErgebnis, "isCorrect" | "richtig" | "loesungWort" | "tippfehler">,
): { sarlavha: string; izoh: string | null; soz: string | null } {
  if (!natija.isCorrect) {
    return { sarlavha: "Xato", izoh: null, soz: natija.loesungWort ?? natija.richtig };
  }
  if (natija.tippfehler) {
    return {
      sarlavha: "To'g'ri!",
      izoh: "Imlosiga e'tibor bering:",
      soz: natija.loesungWort ?? natija.richtig,
    };
  }
  return { sarlavha: "To'g'ri!", izoh: null, soz: natija.loesungWort ?? null };
}

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
  // `AUDIO_BILD` and `BILD_TIPPEN` also have an empty `prompt` on purpose:
  // showing the word would turn them into reading exercises.
  if (format === "AUDIO_WORT" || format === "WORT_TIPPEN" || format === "AUDIO_BILD") {
    return "Eshitish savoli";
  }
  if (format === "BILD_TIPPEN") return "Rasm savoli";
  return prompt;
}
