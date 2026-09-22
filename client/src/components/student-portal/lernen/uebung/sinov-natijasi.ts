import type { YakuniySinovNatijasi } from "../types";

/**
 * Natija ekranidagi yakuniy sinov kartasining holati.
 *
 * O'tdi/o'tmadini FAQAT server aytadi (`abschluss` javobidagi `sinov`) —
 * mijoz o'z sanog'idan taxmin qilmaydi: server birinchi urinishlarni
 * urinish yozuvlaridan sanaydi va to'liq 15 savolni talab qiladi.
 */
export type SinovHolati =
  | { tur: "kutilmoqda" }
  | { tur: "xato" }
  | { tur: "tayyor"; natija: YakuniySinovNatijasi };

export interface SinovKorinishi {
  sarlavha: string;
  matn: string;
  ohang: "muvaffaqiyat" | "xavf" | "neytral";
  /** Asosiy tugma; `null` — javob kutilmoqda, tugmalar o'chiq. */
  asosiy: "davom" | "qayta" | "qayta-yubor" | null;
}

export function sinovKorinishi(holat: SinovHolati): SinovKorinishi {
  if (holat.tur === "kutilmoqda") {
    return {
      sarlavha: "Natija tekshirilmoqda",
      matn: "Bir necha soniya kuting.",
      ohang: "neytral",
      asosiy: null,
    };
  }
  if (holat.tur === "xato") {
    return {
      sarlavha: "Natijani tekshirib bo'lmadi",
      matn: "Internetni tekshirib, natijani qayta yuboring.",
      ohang: "xavf",
      asosiy: "qayta-yubor",
    };
  }
  const { bestanden, avvalOtilgan, togri, jami, kerak } = holat.natija;
  if (bestanden) {
    return {
      sarlavha: "Yakuniy sinovdan o'tdingiz!",
      matn: `${togri} / ${jami} — keyingi unit ochildi.`,
      ohang: "muvaffaqiyat",
      asosiy: "davom",
    };
  }
  if (avvalOtilgan) {
    return {
      sarlavha: `Bu safar ${togri} / ${jami}`,
      matn: "Sinovdan avval o'tgansiz — keyingi unit ochiq.",
      ohang: "neytral",
      asosiy: "davom",
    };
  }
  return {
    sarlavha: "Hali o'tmadingiz",
    matn: `${togri} / ${jami} — o'tish uchun kamida ${kerak} ta to'g'ri javob kerak.`,
    ohang: "xavf",
    asosiy: "qayta",
  };
}
