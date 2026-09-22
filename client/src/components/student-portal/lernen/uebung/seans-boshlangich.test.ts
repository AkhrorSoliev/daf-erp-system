import { describe, expect, it } from "vitest";
import { fortschrittSurati, keyingiBoshlangichSurati } from "./seans-boshlangich";

const A = { gesamt: 100, serie: 3, wochePlatzGruppe: 5 };
const B = { gesamt: 170, serie: 4, wochePlatzGruppe: 3 };

describe("fortschrittSurati", () => {
  it("to'liq javobdan faqat kerakli uch maydonni ajratib oladi", () => {
    expect(
      fortschrittSurati({
        gesamt: 100,
        stufe: { de: "A1", uz: "A1", ab: 0 },
        naechsteStufe: null,
        serie: 3,
        wochePunkte: 40,
        wochePlatzGruppe: 5,
        wochePlatzZentrum: 12,
        faelligeWoerter: 0,
      }),
    ).toEqual({ gesamt: 100, serie: 3, wochePlatzGruppe: 5 });
  });

  it("null yoki undefined bo'lsa null qaytaradi", () => {
    expect(fortschrittSurati(null)).toBeNull();
    expect(fortschrittSurati(undefined)).toBeNull();
  });
});

describe("keyingiBoshlangichSurati", () => {
  it("qayta o'tishda HAR DOIM joriy holatga tenglashadi — oldingi boshlang'ich e'tiborga olinmaydi", () => {
    expect(keyingiBoshlangichSurati(A, B, true)).toEqual(B);
  });

  it("qayta o'tishda `fortschritt` hali yuklanmagan/xato bo'lsa, boshlang'ich noma'lum qoladi", () => {
    expect(keyingiBoshlangichSurati(A, null, true)).toBeNull();
  });

  it("birinchi boshlanishda, boshlang'ich hali yo'q bo'lsa, joriy holatdan olinadi", () => {
    expect(keyingiBoshlangichSurati(null, B, false)).toEqual(B);
  });

  it("birinchi boshlanishda, boshlang'ich ALLAQACHON o'rnatilgan bo'lsa, qayta yozilmaydi", () => {
    // Effekt bir necha marta ishga tushishi mumkin (masalan boshqa qayta
    // chizilish sabab bo'lib) — allaqachon qo'lga olingan boshlang'ich
    // qiymat keyingi `fortschritt.data` yangilanishlaridan HIMOYALANGAN
    // bo'lishi kerak, chunki seans davomida u haqiqiy seans boshlanishini
    // emas, oraliq holatni bildirishi mumkin.
    expect(keyingiBoshlangichSurati(A, B, false)).toEqual(A);
  });

  it("hali hech narsa ma'lum bo'lmasa (ikkalasi ham null), null qoladi", () => {
    expect(keyingiBoshlangichSurati(null, null, false)).toBeNull();
  });
});
