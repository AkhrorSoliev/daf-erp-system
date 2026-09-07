import type { FrageFormat, MaterialTyp, PruefErgebnis, PublicFrage } from "./types";

/**
 * Natija ekranida ko'rsatiladigan xato.
 *
 * `format` VA `titel` qo'shildi (ko'rik topilmasi): `DIALOG_LUECKE`da
 * `prompt` BUTUN suhbat, `ZUORDNEN`da `richtig` olti juftlik pipe bilan
 * ajratilgan ~300 belgili qator — ikkalasi ham natija ekranining bitta
 * `justify-between` qatoriga sig'maydi. `format` ekranga qaysi
 * formatga xos ko'rinish kerakligini aytadi; `titel` (faqat
 * `DIALOG_LUECKE`da to'ldirilgan) suhbat o'rniga ko'rsatiladigan qisqa
 * nom.
 */
export interface SeansXato {
  itemType: MaterialTyp;
  itemId: number;
  format: FrageFormat;
  prompt: string;
  richtig: string;
  titel?: string | null;
}

/**
 * Seansning butun holati. O'zgarmas (immutable): har funksiya YANGI
 * holat qaytaradi. Sabab — React holati sifatida ishlatiladi va joyida
 * o'zgartirilgan obyekt qayta chizilmaydi.
 */
export interface SeansHolati {
  /** Boshlang'ich savol soni. Almashtiruvchilar buni oshirmaydi. */
  jami: number;
  /** Qolgan savollar; birinchisi — joriy. */
  navbat: PublicFrage[];
  /** Endi hech qachon qaytmaydigan savollar soni. `4/12` ning `4`i. */
  tugatilgan: number;
  /** BIRINCHI urinishda to'g'ri bo'lganlar. `bestScore` shu. */
  togri: number;
  xatolar: SeansXato[];
  /** Qaytish huquqini ISHLATGAN material kalitlari (`WORT:5`). */
  qaytganlar: string[];
}

function kalit(f: PublicFrage): string {
  return `${f.itemType}:${f.itemId}`;
}

export function boshla(fragen: PublicFrage[]): SeansHolati {
  return {
    jami: fragen.length,
    navbat: [...fragen],
    tugatilgan: 0,
    togri: 0,
    xatolar: [],
    qaytganlar: [],
  };
}

export function joriy(h: SeansHolati): PublicFrage | null {
  return h.navbat[0] ?? null;
}

export function tugadimi(h: SeansHolati): boolean {
  return h.navbat.length === 0;
}

/**
 * Javob tekshirilgandan keyin chaqiriladi.
 *
 * `ersatzSoralsinmi: true` — chaqiruvchi serverdan boshqa formatdagi
 * savolni so'rab, natijani `ersatzKeldi` ga uzatishi SHART. Aks holda
 * `tugatilgan` hech qachon `jami` ga yetmaydi va seans tugamaydi.
 */
export function javobBerildi(
  h: SeansHolati,
  natija: PruefErgebnis,
): { holat: SeansHolati; ersatzSoralsinmi: boolean } {
  const frage = joriy(h);
  if (!frage) {
    throw new Error("Bo'sh navbatda javob berildi");
  }

  const qolgan = h.navbat.slice(1);
  const k = kalit(frage);
  const qaytganEdi = h.qaytganlar.includes(k);

  if (natija.isCorrect) {
    return {
      holat: {
        ...h,
        navbat: qolgan,
        tugatilgan: h.tugatilgan + 1,
        // Qaytgan savol to'g'ri bo'lsa ham ballga kirmaydi: `bestScore`
        // «birinchi urinishda nechtasi to'g'ri» degani.
        togri: qaytganEdi ? h.togri : h.togri + 1,
      },
      ersatzSoralsinmi: false,
    };
  }

  // Xato faqat BIRINCHI marta yoziladi — natija ekranida bir so'z ikki
  // marta chiqmasligi uchun.
  const xatolar = qaytganEdi
    ? h.xatolar
    : [
        ...h.xatolar,
        {
          itemType: frage.itemType,
          itemId: frage.itemId,
          format: frage.format,
          prompt: frage.prompt,
          richtig: natija.richtig,
          titel: frage.titel ?? null,
        },
      ];

  if (qaytganEdi) {
    // Ikkinchi xato: to'g'ri javob ko'rsatildi va dars davom etadi.
    // Cheksiz aylanish o'quvchini qamab qo'yardi.
    return {
      holat: { ...h, navbat: qolgan, tugatilgan: h.tugatilgan + 1, xatolar },
      ersatzSoralsinmi: false,
    };
  }

  return {
    holat: {
      ...h,
      navbat: qolgan,
      xatolar,
      qaytganlar: [...h.qaytganlar, k],
    },
    ersatzSoralsinmi: true,
  };
}

/**
 * Serverdan almashtiruvchi savol keldi (yoki kelmadi).
 *
 * `null` — bu material uchun boshqa format qurib bo'lmadi. Savol
 * tugatilgan hisoblanadi: so'z ertaga Leitner jadvali orqali qaytadi.
 */
export function ersatzKeldi(
  h: SeansHolati,
  frage: PublicFrage | null,
): SeansHolati {
  if (!frage) {
    return { ...h, tugatilgan: h.tugatilgan + 1 };
  }
  return { ...h, navbat: [...h.navbat, frage] };
}
