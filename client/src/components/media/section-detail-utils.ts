import type { FrageFormat } from "./media-fragen-types";

/**
 * Bo'lim sahifasining ikki ichki bo'limi. `client/CLAUDE.md`: har ichki
 * bo'lim manzilda saqlanadi (`?tab=`), lekin sukut qiymat manzilga
 * YOZILMAYDI — shuning uchun `null` (manzilda yo'q) ham "material" ga
 * tushadi.
 */
export type SectionTab = "material" | "savollar";

/**
 * Manzildagi `?tab=` qiymatini ichki bo'limga aylantiradi. Notanish qiymat
 * (masalan manzil qo'lda o'zgartirilgan) sukutga tushadi — sahifa hech
 * qachon oq ekran bermasligi kerak.
 */
export function tanlanganTab(param: string | null): SectionTab {
  return param === "savollar" ? "savollar" : "material";
}

/**
 * Formatlar orasidan eng ko'p savolli birini tanlaydi. Ikki joyda kerak:
 * boshlang'ich formatni tanlashda (`boshlangichFormat`, pastda) va
 * foydalanuvchi formatni bosganda "bu allaqachon sukut, manzilga
 * yozilmasin" tekshiruvida (`section-detail-client.tsx`) — ikkalasi ham
 * BIR XIL "eng ko'p" ta'rifiga tayanishi kerak, aks holda ikkita joy
 * boshqa-boshqa formatni "sukut" deb hisoblab qolardi. Miqdorlar teng
 * bo'lsa birinchi uchragani (ya'ni server javobidagi, demak
 * `VORSCHAU_BAUER` e'lon tartibidagi ketma-ketlik) g'olib chiqadi —
 * natija tasodifiy emas, determinstik bo'lsin deb.
 */
export function engKopSavolliFormat(
  hisoblar: Iterable<[FrageFormat, number]>,
): FrageFormat | null {
  let best: FrageFormat | null = null;
  let bestCount = -1;
  for (const [format, count] of hisoblar) {
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Bo'lim sahifasi ochilganda "Savollar" tomonida qaysi format
 * ko'rsatilishini hal qiladi. Manzildagi `?format=` shu bo'limda
 * haqiqatan mavjud bo'lsa — o'sha ishlatiladi; aks holda (manzil bo'sh,
 * notanish yoki boshqa bo'limdan ko'chirilgan havola) eng ko'p savolli
 * formatga tushiladi — bo'sh ekran bilan boshlash odamni "endi nima
 * bosaman?" holatiga qo'yardi (brief).
 *
 * `param` ataylab tekshirilmagan `string | null` — manzildan to'g'ridan
 * to'g'ri keladi, `FrageFormat` emas (u yerga har qanday matn yozilishi
 * mumkin).
 */
export function boshlangichFormat(
  fragen: { format: FrageFormat }[],
  param: string | null,
): FrageFormat | null {
  if (fragen.length === 0) return null;

  const hisoblar = new Map<FrageFormat, number>();
  for (const f of fragen) {
    hisoblar.set(f.format, (hisoblar.get(f.format) ?? 0) + 1);
  }

  if (param && hisoblar.has(param as FrageFormat)) {
    return param as FrageFormat;
  }

  return engKopSavolliFormat(hisoblar);
}
