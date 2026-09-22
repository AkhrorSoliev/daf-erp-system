import type { Fortschritt } from "../types";

/**
 * Ball/seriya/o'rin farqini hisoblash uchun ishlatiladigan qisqa "hozirgi
 * holat" surati — to'liq `Fortschritt`dan faqat shu ekranga kerakli uch
 * maydon.
 */
export interface FortschrittSurati {
  gesamt: number;
  serie: number;
  wochePlatzGruppe: number | null;
}

/** To'liq `Fortschritt` javobidan faqat kerakli uch maydonni ajratib oladi. */
export function fortschrittSurati(
  data: Fortschritt | null | undefined,
): FortschrittSurati | null {
  if (!data) return null;
  return {
    gesamt: data.gesamt,
    serie: data.serie,
    wochePlatzGruppe: data.wochePlatzGruppe,
  };
}

/**
 * Seans (yoki uning qayta urinishi) uchun YANGI boshlang'ich suratni
 * hisoblaydi — sof mantiq, componentdagi ref va effekt tafsilotlarini
 * bilmaydi, shuning uchun retry xatosi kabi holatlar bu yerda sinaladi.
 *
 * QOIDA 1 — qayta o'tish HAR DOIM `joriy`ga tenglashadi. Oldingi
 * boshlang'ich (`oldingi`) e'tiborga OLINMAYDI. MUHIM: bu funksiya
 * `joriy`ning HAQIQATDA yangilangan qiymat ekanini o'ZI TEKSHIRA OLMAYDI
 * — buni ta'minlash chaqiruvchining vazifasi. `seans-ekrani.tsx`dagi
 * `qaytaOtish` shuning uchun `fortschritt.refetch()`ni CHAQIRIB, natijani
 * KUTIB, faqat O'SHA NATIJADAN `joriy`ni oladi — ambient `fortschritt.data`
 * keshiga ishonmaydi. Ilgari xuddi shu ambient keshga ishonilgan edi
 * (izoh "allaqachon refetch qilingan" deb da'vo qilardi, lekin hech narsa
 * buni MAJBURLAMAGAN): `fortschritt.refetch()` kutilmasdan chaqirilgan,
 * "Qayta o'tish" tugmasi darhol bosiladigan edi, va sekin ulanishda
 * retry `fortschritt.data`ning ESKI (birinchi seansdan OLDINGI) qiymatini
 * boshlang'ich sifatida qulflab qo'yardi — natijada ko'rsatilgan farq
 * birinchi seans + retry'ni birga qamrab olardi (Task 9 review, round 2).
 * Shuning uchun BU FUNKSIYA emas, uni chaqirgan joy to'g'ri bo'lishi
 * shart; bu yerda faqat qoida ifodalanadi: qayta o'tishda oldingi
 * boshlang'ich chiqarib tashlanadi va `joriy` — nima bo'lishidan qat'iy
 * nazar — yangi boshlang'ich bo'ladi.
 *
 * QOIDA 2 — birinchi boshlanishda boshlang'ich FAQAT bir marta yoziladi.
 * Agar u ALLAQACHON o'rnatilgan bo'lsa (`oldingi != null`), qayta
 * yozilmaydi — bu componentdagi effektning bir necha marta ishga
 * tushishidan (masalan boshqa holat o'zgarishi sabab) himoya qiladi: aks
 * holda seans o'rtasida `fortschritt` yangilanib ketsa (masalan boshqa
 * oynada ball topilsa), boshlang'ich nuqta noto'g'ri siljib ketardi.
 */
export function keyingiBoshlangichSurati(
  oldingi: FortschrittSurati | null,
  joriy: FortschrittSurati | null,
  qaytaOtishMi: boolean,
): FortschrittSurati | null {
  if (qaytaOtishMi) return joriy;
  return oldingi ?? joriy;
}
