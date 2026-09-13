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
  /**
   * Seansning uuid'i — server `DafSession` qatorini shu id bilan yaratadi.
   * Klient yaratadi: seans serverda saqlanmaydi (D6), server esa birinchi
   * urinishda qatorni ochadi. Holat bilan birga yashaydi — qayta chizilishda
   * o'zgarmaydi.
   */
  seansId: string;
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

/**
 * Seans uchun v4 uuid — server `@IsUUID('4')` bilan tekshiradigan aynan shu
 * shakl.
 *
 * `crypto.randomUUID` xavfsiz kontekst va yangi brauzer talab qiladi
 * (Chrome 92+, Safari 15.4+) — eski o'quvchi telefoni yoki WebView'da yo'q
 * bo'lishi mumkin, va yo'q bo'lganda funksiya CHAQIRILGANDA emas,
 * `boshla`ning sukut parametri HISOBLANGANDA yiqiladi — ya'ni mashq
 * ekrani ochilishning o'zida buziladi. Shuning uchun zaxira yo'l:
 * `crypto.getRandomValues` (kengroq qo'llab-quvvatlanadi) bilan 16 tasodifiy
 * baytdan RFC 4122 v4 uuid qo'lda quriladi — versiya nibble'i `4`ga,
 * variant bitlari `10xx`ga o'rnatiladi.
 */
export function seansIdYarat(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const baytlar = crypto.getRandomValues(new Uint8Array(16));
  baytlar[6] = (baytlar[6] & 0x0f) | 0x40; // versiya 4
  baytlar[8] = (baytlar[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(baytlar, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function boshla(
  fragen: PublicFrage[],
  seansId: string = seansIdYarat(),
): SeansHolati {
  return {
    seansId,
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

/**
 * Serverga yuboriladigan `attemptNo`: qaytish huquqini ishlatgan material
 * — o'rinbosar savol — 2, aks holda 1. `qaytganlar` allaqachon aynan shu
 * ma'lumotni saqlaydi; alohida bayroq kerak emas.
 */
export function urinishRaqami(h: SeansHolati, frage: PublicFrage): 1 | 2 {
  return h.qaytganlar.includes(kalit(frage)) ? 2 : 1;
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
 *
 * `aslIndex` — asl savolning `index`i. Server o'rinbosarni doim `index: 0`
 * bilan qaytaradi (`toPublic(nomzod, 0)`); statistikada esa o'rinbosar
 * YANGI savol emas, o'sha savolning 2-urinishi (dizayn 3-bo'lim), shuning
 * uchun `questionIndex` asl savolniki bo'lishi shart.
 */
export function ersatzKeldi(
  h: SeansHolati,
  frage: PublicFrage | null,
  aslIndex: number,
): SeansHolati {
  if (!frage) {
    return { ...h, tugatilgan: h.tugatilgan + 1 };
  }
  return { ...h, navbat: [...h.navbat, { ...frage, index: aslIndex }] };
}
