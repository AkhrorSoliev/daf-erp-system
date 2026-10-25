import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "../liga";
import { nishonNomi } from "../nishon";
import type { FrageFormat, PruefErgebnis, SeansNatijasi } from "../types";

/**
 * What the panel under a checked question says. A picture choice's
 * `richtig` is a picture URL, so the word comes from `loesungWort` — shown
 * after a correct answer too, because the student may have found the
 * picture without knowing the word yet. A typed word one slip away counts
 * as correct (`tippfehler`) and shows the spelling to learn. A wrong answer
 * is the soft «almost» with the answer to learn (ADR-0128), never a verdict.
 */
export function javobPaneliMatni(
  natija: Pick<PruefErgebnis, "isCorrect" | "richtig" | "loesungWort" | "tippfehler">,
  t: Translate = interpolate,
): { sarlavha: string; izoh: string | null; soz: string | null } {
  // The word is the server's answer: data, never through `t`.
  if (!natija.isCorrect) {
    const soz = natija.loesungWort ?? natija.richtig;
    return { sarlavha: t("Deyarli!"), izoh: soz ? t("To'g'ri javob:") : null, soz };
  }
  if (natija.tippfehler) {
    return {
      sarlavha: t("To'g'ri!"),
      izoh: t("Imlosiga e'tibor bering:"),
      soz: natija.loesungWort ?? natija.richtig,
    };
  }
  return { sarlavha: t("To'g'ri!"), izoh: null, soz: natija.loesungWort ?? null };
}

// The pairing board's slip text and the failed-request line are drawn by the panel AND
// spoken by the live region; one constant each, so the two can never drift apart.
const JUFT_QAYTADI = msg(
  "Hammasi to'g'ri! Ammo bu savolda birinchi urinishda xato bo'lgani uchun u keyinroq yana qaytadi.",
);
const YUBORISH_XATO = msg("Yuborib bo'lmadi. Qayta urinib ko'ring");

/**
 * The panel text of a finished pairing question. The board is green by then, so
 * a first-try slip is not «almost»: it only means the question comes back later.
 */
export function juftPaneliMatni(isCorrect: boolean, t: Translate = interpolate): string {
  return isCorrect ? t("To'g'ri!") : t(JUFT_QAYTADI);
}

/** The line under the check button when the request did not go through. */
export function yuborishXatoMatni(t: Translate = interpolate): string {
  return t(YUBORISH_XATO);
}

/**
 * What a screen reader hears after a check (the session's visually-hidden live
 * region): the words the bottom bar shows. A wrong answer's word is the server's
 * and never goes through `t`. A failed request is spoken too; an answer wins
 * over it; before a check there is nothing to say.
 */
export function eshitiladiganMatn(
  holat: {
    natija: Pick<PruefErgebnis, "isCorrect" | "richtig" | "loesungWort" | "tippfehler"> | null;
    /** A `PAAR` / `ZUORDNEN` question: its panel has its own texts. */
    juftlash: boolean;
    yuborishXato: boolean;
  },
  t: Translate = interpolate,
): string {
  const { natija, juftlash, yuborishXato } = holat;
  if (natija) {
    if (juftlash) return juftPaneliMatni(natija.isCorrect, t);
    const panel = javobPaneliMatni(natija, t);
    return [panel.sarlavha, panel.izoh, panel.soz].filter(Boolean).join(" ");
  }
  return yuborishXato ? yuborishXatoMatni(t) : "";
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
  joy: "Guruhda" | "Markazda" = "Guruhda",
  t: Translate = interpolate,
): string | null {
  if (keyin == null) return null;
  const guruh = joy === "Guruhda";
  if (oldin == null) {
    return guruh
      ? t("Guruhda {n}-o'rin", { n: keyin })
      : t("Markazda {n}-o'rin", { n: keyin });
  }
  if (oldin === keyin) return null;
  const p = { n: keyin, farq: Math.abs(oldin - keyin) };
  if (keyin < oldin) {
    return guruh
      ? t("Guruhda {n}-o'rin — {farq} pog'ona ko'tarildingiz", p)
      : t("Markazda {n}-o'rin — {farq} pog'ona ko'tarildingiz", p);
  }
  return guruh
    ? t("Guruhda {n}-o'rin — {farq} pog'ona tushdingiz", p)
    : t("Markazda {n}-o'rin — {farq} pog'ona tushdingiz", p);
}

/**
 * The end screen's lines, straight from the server's `natija` (spec §5,
 * S2 §3.2): points only when above 0, the streak only on the day's first
 * practice, a rank only when it moved, the daily goal only when THIS session
 * reached it (an unmet goal is noise — the ring is on the path), one line per
 * new badge. The group speaks first; a student with no group gets the centre.
 */
export function natijaQatorlari(
  n: SeansNatijasi | null | undefined,
  t: Translate = interpolate,
): {
  ball: number | null;
  serie: number | null;
  orin: string | null;
  maqsad: string | null;
  nishonlar: string[];
} {
  if (!n) return { ball: null, serie: null, orin: null, maqsad: null, nishonlar: [] };
  const orin = n.orin.gruppe
    ? orinXabari(n.orin.gruppe.oldin, n.orin.gruppe.hozir, "Guruhda", t)
    : orinXabari(n.orin.zentrum.oldin, n.orin.zentrum.hozir, "Markazda", t);
  return {
    ball: n.punkte > 0 ? n.punkte : null,
    serie: n.serieYangi ? n.serie : null,
    orin,
    maqsad: n.maqsad?.yangiBajarildi
      ? t("Kunlik maqsad bajarildi — {n} / {total}", {
          n: n.maqsad.hozir,
          total: n.maqsad.ball,
        })
      : null,
    nishonlar: (n.yangiNishonlar ?? []).map((k) =>
      t("Yangi nishon: {name}", { name: nishonNomi(k, t) }),
    ),
  };
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
export function xatoYorligi(
  format: FrageFormat,
  prompt: string,
  t: Translate = interpolate,
): string {
  // `AUDIO_BILD` and `BILD_TIPPEN` also have an empty `prompt` on purpose:
  // showing the word would turn them into reading exercises.
  // `SATZ_HOEREN` too: the sentence it plays is the answer.
  if (
    format === "AUDIO_WORT" ||
    format === "WORT_TIPPEN" ||
    format === "AUDIO_BILD" ||
    format === "SATZ_HOEREN" ||
    format === "UHR_HOEREN"
  ) {
    return t("Eshitish savoli");
  }
  if (format === "BILD_TIPPEN") return t("Rasm savoli");
  // The clock is the question; its `prompt` is empty.
  if (format === "UHR_LESEN" || format === "UHR_TIPPEN") return t("Soat savoli");
  return prompt; // data: the server's question, never through `t`
}
