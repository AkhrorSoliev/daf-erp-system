import { describe, expect, it } from "vitest";
import { chapBosildi, juftlarniMatngaAylantir, ongBosildi, type IndexJuft } from "./yigish";

/**
 * `Juftlash`ning bosish mantig'i — POZITSIYA (indeks) bo'yicha, MATN
 * bo'yicha emas.
 *
 * Sabab (Task 4 ko'rigi): server `zuordnen()`da vaziyat (`funktionUz`)
 * VA ibora matnini (`de`) ikkalasini ham noyob qiladi, lekin
 * `DafPhrase.de`da unique constraint yo'q — nazariy jihatdan ikki
 * BOSHQA vaziyat bir xil ibora matniga ega bo'lishi mumkin edi. Matn
 * bo'yicha moslashtirilgan eski mexanizmda bu ikkinchi bir xil
 * matnli o'ng tugmani "allaqachon band" deb ko'rsatib, uni HECH QACHON
 * tanlab bo'lmay qolishiga olib kelardi — o'quvchi mashqni tugata
 * olmay qolardi. Bu — server tuzatishidan MUSTAQIL ikkinchi qatlam.
 */
describe("ongBosildi", () => {
  it("band bo'lmagan ongni tanlangan chap bilan juftlaydi", () => {
    const natija = ongBosildi([], 0, 3);
    expect(natija).toEqual({ juftlar: [{ chapIdx: 0, ongIdx: 3 }], kutilayotganIdx: null });
  });

  it("kutilayotgan chap yo'q bo'lsa hech narsa qilmaydi", () => {
    const natija = ongBosildi([], null, 3);
    expect(natija).toEqual({ juftlar: [], kutilayotganIdx: null });
  });

  it("band ongni bossa — o'sha JUFTNI bekor qiladi", () => {
    const juftlar: IndexJuft[] = [{ chapIdx: 0, ongIdx: 3 }];
    const natija = ongBosildi(juftlar, null, 3);
    expect(natija).toEqual({ juftlar: [], kutilayotganIdx: null });
  });

  it("ikkita BIR XIL MATNLI o'ng tugma pozitsiyasi bo'yicha MUSTAQIL bo'lib qoladi", () => {
    // Ustunlar mazmuni bu funksiyaga umuman berilmaydi — u faqat
    // indekslar bilan ishlaydi, shuning uchun ikkita "Hallo!" matnli
    // tugma (masalan ongIdx 0 va 2) unga aynan ikkita BOSHQA raqam
    // sifatida ko'rinadi va aslo aralashmaydi.
    let holat = ongBosildi([], 0, 0); // chap0 = ong0 ("Hallo!")
    expect(holat.juftlar).toEqual([{ chapIdx: 0, ongIdx: 0 }]);

    holat = ongBosildi(holat.juftlar, 1, 2); // chap1 = ong2 (matni ham "Hallo!")
    expect(holat.juftlar).toEqual([
      { chapIdx: 0, ongIdx: 0 },
      { chapIdx: 1, ongIdx: 2 },
    ]);
  });

  it("MATN BO'YICHA moslashtirilgan eski mexanizm xuddi shu holatda ikkinchi juftni HECH QACHON tuza olmasdi", () => {
    // Bu ishlab chiqarish kodida YO'Q — faqat TUZATISHDAN OLDINGI
    // mexanizmni takrorlab, tuzatish nimani hal qilganini isbotlash
    // uchun shu yerda qayta qurilgan (`Juftlash`ning eski `juftOngTop`
    // funksiyasi bilan bir xil: `tanlangan.find(p => p.endsWith(...))`).
    function ongBosildiMatnBoyicha(
      tanlangan: string[],
      kutilayotgan: string | null,
      ongText: string,
    ): string[] {
      const mavjud = tanlangan.find((p) => p.endsWith(`=${ongText}`));
      if (mavjud) return tanlangan.filter((p) => p !== mavjud);
      if (kutilayotgan == null) return tanlangan;
      return [...tanlangan, `${kutilayotgan}=${ongText}`];
    }

    // chap0 BIRINCHI "Hallo!" tugmasi bilan juftlangan.
    let tanlangan = ongBosildiMatnBoyicha([], "chap0", "Hallo!");
    expect(tanlangan).toEqual(["chap0=Hallo!"]);

    // chap1 IKKINCHI "Hallo!" tugmasini bosadi — matn bir xil bo'lgani
    // uchun bu "allaqachon band" deb topiladi va YANGI juft o'rniga
    // BIRINCHI juft yechib tashlanadi. Ikkinchi juft HECH QACHON
    // tuzilmaydi — aynan ko'rikda tasvirlangan qulflanib qolish.
    tanlangan = ongBosildiMatnBoyicha(tanlangan, "chap1", "Hallo!");
    expect(tanlangan).toEqual([]);
  });
});

/**
 * Ko'rik topilmasi: javob qatorini ("chap=o'ng") quruvchi kod ilgari
 * `Juftlash` komponenti ICHIDA yashiringan edi — hech qanday test
 * bosmagan yagona bo'g'in, garchi ustun tartibi va `=` ajratkichi
 * serverning `pruefePaar`/`pruefeZuordnen` parserlari kutgan shaklga
 * ANIQ mos kelishi shart bo'lsa ham. Endi SOF FUNKSIYA sifatida
 * eksport qilingan — shu yerda mustaqil sinaladi.
 */
describe("juftlarniMatngaAylantir", () => {
  it("ZUORDNEN: olti indeks jufti — o'n ikki elementli options'dan server kutgan qatorlarni quradi", () => {
    // Birinchi olti — chap ustun (vaziyat), keyingi olti — o'ng ustun
    // (ibora), ARALASHTIRILGAN tartibda (server shunday yuboradi).
    const options = [
      "salomlashish",
      "o'zini tanishtirish",
      "xayrlashish",
      "rahmat aytish",
      "so'rash",
      "javob berish",
      "Danke!",
      "Hallo!",
      "Ich bin Anna.",
      "Auf Wiedersehen!",
      "Wie heißen Sie?",
      "Ich heiße Timur.",
    ];
    const juftlar: IndexJuft[] = [
      { chapIdx: 0, ongIdx: 1 }, // salomlashish=Hallo!
      { chapIdx: 1, ongIdx: 2 }, // o'zini tanishtirish=Ich bin Anna.
      { chapIdx: 2, ongIdx: 3 }, // xayrlashish=Auf Wiedersehen!
      { chapIdx: 3, ongIdx: 0 }, // rahmat aytish=Danke!
      { chapIdx: 4, ongIdx: 4 }, // so'rash=Wie heißen Sie?
      { chapIdx: 5, ongIdx: 5 }, // javob berish=Ich heiße Timur.
    ];

    expect(juftlarniMatngaAylantir(juftlar, options, 6)).toEqual([
      "salomlashish=Hallo!",
      "o'zini tanishtirish=Ich bin Anna.",
      "xayrlashish=Auf Wiedersehen!",
      "rahmat aytish=Danke!",
      "so'rash=Wie heißen Sie?",
      "javob berish=Ich heiße Timur.",
    ]);
  });

  it("PAAR: to'rt indeks jufti — sakkiz elementli options bilan ham xuddi shu shaklda ishlaydi", () => {
    const options = ["der Tisch", "das Buch", "die Tür", "das Auto", "eshik", "stol", "kitob", "mashina"];
    const juftlar: IndexJuft[] = [
      { chapIdx: 0, ongIdx: 1 },
      { chapIdx: 1, ongIdx: 2 },
      { chapIdx: 2, ongIdx: 0 },
      { chapIdx: 3, ongIdx: 3 },
    ];
    expect(juftlarniMatngaAylantir(juftlar, options, 4)).toEqual([
      "der Tisch=stol",
      "das Buch=kitob",
      "die Tür=eshik",
      "das Auto=mashina",
    ]);
  });

  it("bo'sh juftlar ro'yxati — bo'sh massiv qaytaradi", () => {
    expect(juftlarniMatngaAylantir([], ["a", "b"], 1)).toEqual([]);
  });
});

describe("chapBosildi", () => {
  it("band bo'lmagan chapni kutilayotgan qiladi", () => {
    const natija = chapBosildi([], null, 2);
    expect(natija).toEqual({ juftlar: [], kutilayotganIdx: 2 });
  });

  it("xuddi shu chapni qayta bossa — tanlovni bekor qiladi", () => {
    const natija = chapBosildi([], 2, 2);
    expect(natija).toEqual({ juftlar: [], kutilayotganIdx: null });
  });

  it("boshqa chapni bossa — eskisi o'rniga YANGISINI kutadi", () => {
    const natija = chapBosildi([], 2, 5);
    expect(natija).toEqual({ juftlar: [], kutilayotganIdx: 5 });
  });

  it("band chapni bossa — o'sha JUFTNI (ong bilan birga) bekor qiladi", () => {
    const juftlar: IndexJuft[] = [{ chapIdx: 0, ongIdx: 3 }];
    const natija = chapBosildi(juftlar, null, 0);
    expect(natija).toEqual({ juftlar: [], kutilayotganIdx: null });
  });
});
