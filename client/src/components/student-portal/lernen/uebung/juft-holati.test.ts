import { describe, expect, it } from "vitest";
import {
  boshlaJuftlar,
  hammasiTogri,
  juftJavobKeldi,
  juftlarniRichtigga,
  juftQoshildi,
  type JonliJuft,
} from "./juft-holati";

describe("juftQoshildi", () => {
  it("yangi juft kutilmoqda holatida qo'shiladi", () => {
    const j = juftQoshildi(boshlaJuftlar(), 0, 2);
    expect(j).toEqual([{ chapIdx: 0, ongIdx: 2, holat: "kutilmoqda" }]);
  });

  it("band chap yoki o'ng ustunni ikkinchi marta bog'lamaydi", () => {
    // Yashil juftning tugmasi boshqa bosilmaydi; band indeks kelsa
    // ro'yxat o'zgarmaydi.
    const bor: JonliJuft[] = [{ chapIdx: 0, ongIdx: 2, holat: "togri" }];
    expect(juftQoshildi(bor, 0, 3)).toEqual(bor);
    expect(juftQoshildi(bor, 1, 2)).toEqual(bor);
  });
});

describe("juftJavobKeldi", () => {
  const kutayotgan: JonliJuft[] = [{ chapIdx: 0, ongIdx: 2, holat: "kutilmoqda" }];

  it("to'g'ri javob juftni yashil qiladi", () => {
    expect(juftJavobKeldi(kutayotgan, 0, 2, true)).toEqual([
      { chapIdx: 0, ongIdx: 2, holat: "togri" },
    ]);
  });

  it("xato javob juftni butunlay olib tashlaydi", () => {
    // Ikkala tugma yana bo'sh bo'ladi va qayta bosilishi mumkin.
    expect(juftJavobKeldi(kutayotgan, 0, 2, false)).toEqual([]);
  });

  it("boshqa juftlarga tegmaydi", () => {
    const ikki: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 2, holat: "togri" },
      { chapIdx: 1, ongIdx: 3, holat: "kutilmoqda" },
    ];
    expect(juftJavobKeldi(ikki, 1, 3, false)).toEqual([ikki[0]]);
  });

  it("allaqachon yo'q juftga javob kelsa yiqilmaydi", () => {
    // Aloqa sekin bo'lsa javob kechikib kelishi mumkin. Bo'sh ro'yxat
    // BILAN emas — BOSHQA haqiqiy juft turgan ro'yxat bilan tekshiramiz:
    // "topilmadi" holatini indeks bo'yicha (masalan `findIndex` -1 qaytarib
    // `splice(-1, 1)` bilan) noto'g'ri qo'llagan amalga oshirish bo'sh
    // ro'yxatda sezilmay o'tib ketardi (hech narsa o'chadigan joy yo'q),
    // lekin BOR ro'yxatda oxirgi elementni bexosdan o'chirib qo'yardi.
    const boshqalar: JonliJuft[] = [{ chapIdx: 5, ongIdx: 6, holat: "kutilmoqda" }];
    expect(juftJavobKeldi(boshqalar, 0, 2, true)).toEqual(boshqalar);
    expect(juftJavobKeldi(boshqalar, 0, 2, false)).toEqual(boshqalar);
  });
});

describe("hammasiTogri", () => {
  it("hamma juft yashil bo'lganda va soni yetganda rost", () => {
    const j: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 1, holat: "togri" },
      { chapIdx: 1, ongIdx: 0, holat: "togri" },
    ];
    expect(hammasiTogri(j, 2)).toBe(true);
  });

  it("bittasi hali kutilayotgan bo'lsa yolg'on", () => {
    const j: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 1, holat: "togri" },
      { chapIdx: 1, ongIdx: 0, holat: "kutilmoqda" },
    ];
    expect(hammasiTogri(j, 2)).toBe(false);
  });

  it("soni yetmasa yolg'on", () => {
    expect(hammasiTogri([{ chapIdx: 0, ongIdx: 1, holat: "togri" }], 4)).toBe(false);
  });

  it("bo'sh ro'yxat yolg'on", () => {
    expect(hammasiTogri([], 4)).toBe(false);
  });
});

describe("juftlarniRichtigga", () => {
  // Ko'rik topilmasi tuzatildi: bu funksiya bo'lmaganda sintetik natija
  // `richtig: ""` bilan yuborilardi — seans oxiridagi xato ko'rigi
  // (`natija-ekrani.tsx`) juftlash formatlari uchun BO'SH chiqardi.
  const chapUstun = ["der Tisch", "das Buch", "die Tür", "das Auto"];
  const ongUstun = ["eshik", "stol", "kitob", "mashina"];

  it("hamma juft togri bo'lsa 'chap=o'ng' qatorlarini '|' bilan ulaydi", () => {
    const juftlar: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 1, holat: "togri" },
      { chapIdx: 1, ongIdx: 2, holat: "togri" },
    ];
    expect(juftlarniRichtigga(juftlar, chapUstun, ongUstun)).toBe(
      "der Tisch=stol|das Buch=kitob",
    );
  });

  it("chap va o'ng ALMASHTIRILMAYDI (tripwire)", () => {
    // `chapUstun`/`ongUstun` ATAYLAB ikki farqli so'z to'plamidan olingan
    // (nemischa vs o'zbekcha) — agar amalga oshirish ularni chalkashtirsa
    // (masalan `ongUstun[j.chapIdx]=chapUstun[j.ongIdx]` deb yozilsa),
    // natija "eshik=das Auto" kabi teskari chiqardi va bu test uni
    // ANIQ ushlab olardi. Ikkala ustun bir xil so'zlardan iborat bo'lsa
    // (masalan ikkalasi ham raqamlar), bunday almashtirish sezilmay
    // qolardi.
    const juftlar: JonliJuft[] = [{ chapIdx: 2, ongIdx: 3, holat: "togri" }];
    expect(juftlarniRichtigga(juftlar, chapUstun, ongUstun)).toBe("die Tür=mashina");
  });

  it("hali 'kutilmoqda' bo'lgan juftni chiqarib tashlaydi", () => {
    // Chaqiruvchi buni faqat `hammasiTogri` rost bo'lgandagina chaqirishi
    // kerak, lekin funksiya bu shartga MUSTAQIL ravishda ham amal
    // qiladi — filtri bo'lmasa, hali serverdan javob kelmagan juft ham
    // "to'g'ri javob" sifatida ko'rsatilib qolardi.
    const juftlar: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 1, holat: "togri" },
      { chapIdx: 1, ongIdx: 2, holat: "kutilmoqda" },
    ];
    expect(juftlarniRichtigga(juftlar, chapUstun, ongUstun)).toBe("der Tisch=stol");
  });

  it("bo'sh ro'yxatda bo'sh qator qaytaradi", () => {
    expect(juftlarniRichtigga([], chapUstun, ongUstun)).toBe("");
  });
});
