/**
 * `audio.play()` va'dasi rad etilganda bu HAQIQIY xatomi — ekranga
 * "Ovoz yuklanmadi" chiqarish va qayta yuklash belgisini ko'rsatish
 * kerakmi — degan savolga javob beradi (ko'rik topilmasi, brauzerda
 * tekshirilgan).
 *
 * IKKITA rad etilish HAQIQIY XATO EMAS:
 * - `AbortError` — `pause()` (yoki komponent unmount/manba almashishi,
 *   `suhbat-pleyer.tsx`dagi `key={url}`) navbatdagi `play()` so'rovini
 *   TO'XTATDI. Bu operatorning o'zi qilgan ish — tarmoq yoki fayl
 *   muammosi emas.
 * - `NotAllowedError` — brauzer avtomatik ijroni bloklagan (sahifa
 *   bilan hali muloqot bo'lmagan). Tugma shunchaki bosilishini kutib
 *   turaveradi — xato matni bu holatda yolg'ondan qo'rqitardi (haqiqiy
 *   brauzer tekshiruvida aynan shu holat sodir bo'lgan: `readyState=4`,
 *   ovoz to'liq yuklangan, lekin `NotAllowedError` "Ovoz yuklanmadi"
 *   deb ko'rsatilgan).
 *
 * Boshqa har qanday rad etilish (fayl topilmadi, tarmoq uzilishi,
 * formatni brauzer o'qiy olmasligi va hokazo) — HAQIQIY xato.
 */
export function ovozXatosiMi(sabab: unknown): boolean {
  if (sabab instanceof DOMException) {
    return sabab.name !== "AbortError" && sabab.name !== "NotAllowedError";
  }
  return true;
}
