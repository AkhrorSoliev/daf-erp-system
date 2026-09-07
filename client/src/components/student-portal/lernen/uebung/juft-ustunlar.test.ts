import { describe, expect, it } from "vitest";
import { juftUstunlar } from "./yigish";

/**
 * `chapBosildi`/`ongBosildi`/`juftlarniMatngaAylantir` (eski nomlar)
 * BU FAYLDAN OLIB TASHLANDI — ular eski ikki bosqichli juftlash
 * mexanizmiga tegishli edi: chap/o'ng tugmani band bo'lgach QAYTA
 * bosish o'sha juftni BEKOR qilardi, va butun javob bitta "chap=o'ng|…"
 * qatoriga yig'ilib `pruefen`ga yuborilardi.
 *
 * Jonli juftlashda (Task 3) bu ikkalasi ham to'g'ri emas: juft hosil
 * bo'lgan zahoti serverga yuboriladi va DARHOL qulflanadi (yashil yoki
 * "kutilmoqda") — endi uni bosib bekor qilib bo'lmaydi, shuning uchun
 * "band tugmani bossa bekor qiladi" qoidasi endi HECH QACHON ishga
 * tushmaydi (`Juftlash`dagi tugmalar bunday holatda `disabled`). Butun
 * javobni bitta qatorga yig'ish ham kerak emas — `pruefen` PAAR/ZUORDNEN
 * uchun umuman chaqirilmaydi (`seans-ekrani.tsx`dagi `tekshir()`
 * qo'riqchisi). Shu sabab bu ikki funksiya va ularning testlari OLIB
 * TASHLANDI — endigi mos keladigan sof funksiya `juftUstunlar` (pastda).
 */
describe("juftUstunlar", () => {
  it("PAAR: 8 elementli options'ni 4+4 ga bo'ladi", () => {
    const options = ["der Tisch", "das Buch", "die Tür", "das Auto", "eshik", "stol", "kitob", "mashina"];
    expect(juftUstunlar(options, "PAAR")).toEqual({
      chapUstun: ["der Tisch", "das Buch", "die Tür", "das Auto"],
      ongUstun: ["eshik", "stol", "kitob", "mashina"],
    });
  });

  it("ZUORDNEN: 12 elementli options'ni 6+6 ga bo'ladi", () => {
    const chapUstun = [
      "salomlashish",
      "o'zini tanishtirish",
      "xayrlashish",
      "rahmat aytish",
      "so'rash",
      "javob berish",
    ];
    const ongUstun = [
      "Hallo!",
      "Ich bin Anna.",
      "Auf Wiedersehen!",
      "Danke!",
      "Wie heißen Sie?",
      "Ich heiße Timur.",
    ];
    expect(juftUstunlar([...chapUstun, ...ongUstun], "ZUORDNEN")).toEqual({
      chapUstun,
      ongUstun,
    });
  });

  it("o'ng ustun `soni*2`dan keyingi elementlarni OLMAYDI", () => {
    // Tripwire: `ongUstun: options.slice(soni)` (yuqori chegarasiz)
    // deb yozilgan buggy implementatsiya HAM birinchi ikkita testni
    // o'tkazib yuborardi — ular `options.length` aynan `soni*2` bo'lgan
    // holatni beradi, va o'sha holatda `slice(soni)` bilan
    // `slice(soni, soni*2)` natijasi FARQ QILMAYDI. Shu sababdan bu
    // testda options QASDDAN uzunroq (orqasida "ortiqcha" elementlar
    // bilan) beriladi — faqat ANIQ yuqori chegara bilan kesilgan kod
    // bu ortiqchani chiqarib tashlaydi.
    const options = ["a", "b", "c", "d", "e", "f", "g", "h", "ORTIQCHA-1", "ORTIQCHA-2"];
    const { chapUstun, ongUstun } = juftUstunlar(options, "PAAR");
    expect(chapUstun).toEqual(["a", "b", "c", "d"]);
    expect(ongUstun).toEqual(["e", "f", "g", "h"]);
    expect(ongUstun).not.toContain("ORTIQCHA-1");
  });
});
