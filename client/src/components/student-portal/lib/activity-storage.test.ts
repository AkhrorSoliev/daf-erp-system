import { describe, expect, it } from "vitest";
import { payloadFor, yangiSeans } from "./activity-tracker";
import {
  JORIY_KALIT,
  KUTILMOQDA_KALIT,
  KUTILMOQDA_MAX,
  joriyniOchir,
  joriyniOqi,
  joriyniSaqla,
  kutilmoqdaOchir,
  kutilmoqdaOqi,
  kutilmoqdaQosh,
  xotiraSaqlagichi,
  type Saqlagich,
} from "./activity-storage";

function xotira(): Saqlagich & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const T0 = Date.parse("2026-09-13T10:00:00.000Z");

describe("joriy seans", () => {
  it("saqlangan seans o'sha foydalanuvchi, o'sha kun, 30 daqiqa ichida — davom etadi", () => {
    const s = xotira();
    const seans = { ...yangiSeans(7, T0, "s1"), activeMs: 5000 };
    joriyniSaqla(s, seans);
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({
      davom: seans,
      yopilgan: null,
    });
  });

  it("30 daqiqadan eski yoki boshqa kun — davom etmaydi, yopilgan sifatida qaytadi", () => {
    const s = xotira();
    const seans = yangiSeans(7, T0, "s1");
    joriyniSaqla(s, seans);
    expect(joriyniOqi(s, 7, T0 + 31 * 60_000)).toEqual({
      davom: null,
      yopilgan: seans,
    });
    expect(joriyniOqi(s, 7, T0 + 86_400_000)).toEqual({
      davom: null,
      yopilgan: seans,
    });
  });

  it("boshqa foydalanuvchiniki yoki buzilgan JSON — hech narsa qaytmaydi", () => {
    const s = xotira();
    joriyniSaqla(s, yangiSeans(8, T0, "s1"));
    expect(joriyniOqi(s, 7, T0)).toEqual({ davom: null, yopilgan: null });
    s.setItem(JORIY_KALIT, "{buzuq");
    expect(joriyniOqi(s, 7, T0)).toEqual({ davom: null, yopilgan: null });
    s.setItem(JORIY_KALIT, JSON.stringify({ sessionId: 5 }));
    expect(joriyniOqi(s, 7, T0)).toEqual({ davom: null, yopilgan: null });
  });

  it("joriyniOchir kalitni o'chiradi; saqlagich xato bersa jim o'tadi", () => {
    const s = xotira();
    joriyniSaqla(s, yangiSeans(7, T0, "s1"));
    joriyniOchir(s);
    expect(s.data.has(JORIY_KALIT)).toBe(false);
    const buzuq: Saqlagich = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(() => joriyniSaqla(buzuq, yangiSeans(7, T0, "s1"))).not.toThrow();
    expect(joriyniOqi(buzuq, 7, T0)).toEqual({ davom: null, yopilgan: null });
    expect(kutilmoqdaOqi(buzuq, 7, T0)).toEqual([]);
  });
});

describe("yuborilmaganlar", () => {
  it("bir xil seans qayta qo'shilsa eskisi almashtiriladi; o'chirish ishlaydi", () => {
    const s = xotira();
    const a = { ...yangiSeans(7, T0, "a"), activeMs: 10_000 };
    kutilmoqdaQosh(s, a);
    kutilmoqdaQosh(s, { ...a, activeMs: 20_000 });
    expect(kutilmoqdaOqi(s, 7, T0)).toEqual([
      {
        sessionId: "a",
        platform: "WEB",
        activeSeconds: 20,
        radioSeconds: 0,
        sections: { LERNEN: 0, OTHER: 0 },
      },
    ]);
    kutilmoqdaOchir(s, "a");
    expect(kutilmoqdaOqi(s, 7, T0)).toEqual([]);
  });

  it("ko'pi bilan 20 ta, eng eskilari tushib qoladi; buzilgan elementlar e'tiborga olinmaydi", () => {
    const s = xotira();
    for (let i = 0; i < KUTILMOQDA_MAX + 3; i++) {
      kutilmoqdaQosh(s, yangiSeans(7, T0, `s${i}`));
    }
    const royxat = kutilmoqdaOqi(s, 7, T0);
    expect(royxat).toHaveLength(KUTILMOQDA_MAX);
    expect(royxat[0].sessionId).toBe("s3");
    s.setItem(
      KUTILMOQDA_KALIT,
      JSON.stringify([
        { foo: 1 },
        { userId: 7, kun: "2026-09-13", payload: royxat[0] },
      ]),
    );
    expect(kutilmoqdaOqi(s, 7, T0)).toEqual([royxat[0]]);
  });

  it("boshqa foydalanuvchining yozuvi qaytarilmaydi va saqlagichdan o'chib ketadi; ID'siz (eski) yozuv ham", () => {
    const s = xotira();
    const mening = payloadFor(yangiSeans(7, T0, "mening"));
    const begona = payloadFor(yangiSeans(9, T0, "begona"));
    s.setItem(
      KUTILMOQDA_KALIT,
      JSON.stringify([
        { userId: 9, kun: "2026-09-13", payload: begona },
        { userId: 7, kun: "2026-09-13", payload: mening },
        begona, // eski format: userId'siz yozuv (begona bilan bir xil sessionId, lekin baribir yo'q qilinadi)
      ]),
    );
    // Faqat 7-foydalanuvchining yozuvi qaytadi — 9-foydalanuvchiniki hech qachon
    // yuborilmaydi (boshqa birovning tokeni bilan uni yuborib bo'lmaydi).
    expect(kutilmoqdaOqi(s, 7, T0)).toEqual([mening]);
    // Begona va ID'siz yozuvlar saqlagichdan butunlay olib tashlangan — keyinroq
    // qayta o'qishda ham qaytib kelmaydi, boshqa foydalanuvchiga ham yozilmaydi.
    expect(JSON.parse(s.data.get(KUTILMOQDA_KALIT)!)).toEqual([
      { userId: 7, kun: "2026-09-13", payload: mening },
    ]);
    expect(kutilmoqdaOqi(s, 9, T0)).toEqual([]);
  });

  it("ortiqcha maydonli yozuv qabul qilinadi, lekin qayta qurilganda faqat shartnoma maydonlari qoladi", () => {
    const s = xotira();
    const p = payloadFor(yangiSeans(7, T0, "x"));
    s.setItem(
      KUTILMOQDA_KALIT,
      JSON.stringify([
        {
          userId: 7,
          kun: "2026-09-13",
          payload: {
            ...p,
            studentId: 99999,
            extra: "boo",
            sections: { ...p.sections, FOO: 1 },
          },
        },
      ]),
    );
    expect(kutilmoqdaOqi(s, 7, T0)).toEqual([p]);
  });
});

describe("yuborilmaganlar — faqat bugungi kun", () => {
  // The server files a session it has never seen under the day the request
  // ARRIVES, so an unsent session from another day would show up as today's.
  // Two sides of a Tashkent midnight (UTC+5): 23:59 on 13.09, 00:01 on 14.09.
  const KECHA_2359 = Date.parse("2026-09-13T18:59:00.000Z");
  const BUGUN_0001 = Date.parse("2026-09-13T19:01:00.000Z");

  it("boshqa kunga tegishli seans qaytarilmaydi va saqlagichdan o'chadi — bugungisi qoladi", () => {
    const s = xotira();
    kutilmoqdaQosh(s, {
      ...yangiSeans(7, KECHA_2359, "kecha"),
      activeMs: 30_000,
    });
    kutilmoqdaQosh(s, {
      ...yangiSeans(7, BUGUN_0001, "bugun"),
      activeMs: 45_000,
    });

    expect(kutilmoqdaOqi(s, 7, BUGUN_0001 + 60_000)).toEqual([
      {
        sessionId: "bugun",
        platform: "WEB",
        activeSeconds: 45,
        radioSeconds: 0,
        sections: { LERNEN: 0, OTHER: 0 },
      },
    ]);
    const saqlangan = JSON.parse(s.data.get(KUTILMOQDA_KALIT)!) as Array<{
      payload: { sessionId: string };
    }>;
    expect(saqlangan.map((y) => y.payload.sessionId)).toEqual(["bugun"]);
  });

  it("kuni yozilmagan (eski formatdagi) yozuv yuborilmaydi — tuzatishgacha yig'ilib qolganlar", () => {
    const s = xotira();
    s.setItem(
      KUTILMOQDA_KALIT,
      JSON.stringify([
        {
          userId: 7,
          payload: {
            sessionId: "eski",
            platform: "WEB",
            activeSeconds: 90,
            radioSeconds: 0,
            sections: { LERNEN: 90, OTHER: 0 },
          },
        },
      ]),
    );
    expect(kutilmoqdaOqi(s, 7, T0)).toEqual([]);
  });
});

describe("xotiraSaqlagichi", () => {
  it("getItem/setItem/removeItem to'g'ri ishlaydi", () => {
    const s = xotiraSaqlagichi();
    expect(s.getItem("k")).toBeNull();
    s.setItem("k", "v1");
    expect(s.getItem("k")).toBe("v1");
    s.setItem("k", "v2");
    expect(s.getItem("k")).toBe("v2");
    s.removeItem("k");
    expect(s.getItem("k")).toBeNull();
  });

  it("joriyniSaqla/joriyniOqi bu saqlagich bilan ham ishlaydi (localStorage'siz zaxira)", () => {
    const s = xotiraSaqlagichi();
    const seans = { ...yangiSeans(7, T0, "s1"), activeMs: 5000 };
    joriyniSaqla(s, seans);
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({
      davom: seans,
      yopilgan: null,
    });
    joriyniOchir(s);
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({
      davom: null,
      yopilgan: null,
    });
  });
});
