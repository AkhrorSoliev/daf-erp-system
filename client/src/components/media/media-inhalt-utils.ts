import type { InhaltWort, SectionInhalt } from "./media-inhalt-types";

/**
 * So'z qatorida ko'rsatiladigan matn. Ot bo'lsa artikl oldida, son bo'lsa
 * raqam (`anzeige`) qavs ichida — ikkalasi ham bo'lmasa so'zning o'zi
 * yetarli. Bu qaror render qilinmaydigan sof funksiyaga chiqarilgan, chunki
 * komponentning o'zini (audio, holat, fetch) testda render qilib bo'lmaydi
 * (`client/CLAUDE.md`: vitest, komponent render yo'q).
 */
export function wortMatni(
  wort: Pick<InhaltWort, "de" | "artikel" | "anzeige">,
): string {
  if (wort.artikel) return `${wort.artikel} ${wort.de}`;
  if (wort.anzeige) return `${wort.de} (${wort.anzeige})`;
  return wort.de;
}

/**
 * Bo'limda hali umuman material yo'qmi — bo'sh holatni ("hali hech narsa
 * yozilmagan") oddiy ro'yxatdan ajratish uchun. To'rtta ro'yxatning
 * HAMMASI bo'sh bo'lishi kerak: faqat so'zlar bo'lib, gaplar hali
 * yozilmagan bo'lim "bo'sh" emas — u qisman to'ldirilgan.
 */
export function sectionInhaltBosh(inhalt: SectionInhalt): boolean {
  return (
    inhalt.woerter.length === 0 &&
    inhalt.saetze.length === 0 &&
    inhalt.phrasen.length === 0 &&
    inhalt.dialogZeilen.length === 0
  );
}
