import type { FrageFormat, VorschauFrage } from "./media-fragen-types";

/**
 * Panelda savol qanday ko'rsatilishini hal qiladi — o'n ikkita format
 * to'rtta o'qish shakliga tushadi (brief: "to'rt holat"). Alohida
 * funksiyaga chiqarilgan, chunki bu qaror sof mantiq — komponentning
 * o'zini (fetch, audio) render qilmasdan sinash mumkin
 * (`client/CLAUDE.md`: vitest, komponent render yo'q).
 */
export type VorschauShakli = "OVOZ" | "JUFT" | "DIALOG" | "MATN";

export function vorschauShakli(format: FrageFormat): VorschauShakli {
  switch (format) {
    // `prompt` bu ikkalasida ATAYLAB bo'sh — so'zning o'zi javob.
    // Matn o'rniga karnay ko'rsatilmasa, savol bo'sh qator bo'lib qolardi.
    case "AUDIO_WORT":
    case "WORT_TIPPEN":
      return "OVOZ";
    // Javob bitta satr emas — juftlar to'plami (`richtig` "de=uz|de=uz|...").
    case "PAAR":
    case "ZUORDNEN":
      return "JUFT";
    // `prompt` — butun suhbat, bitta qatori `___` bilan bo'shatilgan.
    case "DIALOG_LUECKE":
      return "DIALOG";
    default:
      return "MATN";
  }
}

/**
 * `PAAR`/`ZUORDNEN`ning `richtig`sini juftlar ro'yxatiga ajratadi.
 * Server bu shaklni `de=uz|de=uz|...` (yoki `funktionUz=de|...`) ko'rinishida
 * yozadi — `wort-fragen.ts`dagi `paar()` va `satz-fragen.ts`dagi
 * `zuordnen()`. Kutilmagan shakl (bo'sh yoki `=`siz bo'lak) uchrasa, o'sha
 * bo'lak jimgina o'tkazib yuboriladi — panel yiqilmasin, faqat kamroq
 * juft ko'rsatsin.
 */
export function juftlarniAjrat(
  richtig: string,
): { chap: string; ong: string }[] {
  if (!richtig) return [];
  const natija: { chap: string; ong: string }[] = [];
  for (const juft of richtig.split("|")) {
    const teng = juft.indexOf("=");
    if (teng === -1) continue;
    natija.push({ chap: juft.slice(0, teng), ong: juft.slice(teng + 1) });
  }
  return natija;
}

/**
 * Savollarni format bo'yicha guruhlaydi — CEO «`AUDIO_WORT` qanday
 * chiqadi?» degan savolga tez javob topsin (brief). `Map` tartibni
 * birinchi uchragan format bo'yicha saqlaydi, ya'ni server javobidagi
 * ketma-ketlik (`VORSCHAU_BAUER` e'lon tartibi) buzilmaydi.
 */
export function formatlarBoyichaGuruhla(
  fragen: VorschauFrage[],
): Map<FrageFormat, VorschauFrage[]> {
  const guruhlar = new Map<FrageFormat, VorschauFrage[]>();
  for (const f of fragen) {
    const royxat = guruhlar.get(f.format);
    if (royxat) {
      royxat.push(f);
    } else {
      guruhlar.set(f.format, [f]);
    }
  }
  return guruhlar;
}
