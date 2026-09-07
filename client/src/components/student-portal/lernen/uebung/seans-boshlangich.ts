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
 * QOIDA 1 — qayta o'tish HAR DOIM joriy holatga tenglashadi. Oldingi
 * boshlang'ich (`oldingi`) e'tiborga OLINMAYDI: `qaytaOtish` chaqirilgan
 * paytda `joriy` — bu aynan oldingi seansning YAKUNIY qiymati (tugash
 * effektida allaqachon `refetch` qilingan), demak yangi urinish uchun eng
 * to'g'ri boshlang'ich nuqta shu. Ref'ni `null`ga tushirib effektga
 * umid qilish ISHLAMAYDI — effekt faqat `fortschritt.data` REFERENSI
 * o'zgarganda ishga tushadi, u esa retry davomida o'zgarmasligi mumkin,
 * va boshlang'ich butun retry davomida `null`ligicha qolib, ball farqi
 * har safar 0ga aylanib qolgan edi (Task 9 review, Critical).
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
