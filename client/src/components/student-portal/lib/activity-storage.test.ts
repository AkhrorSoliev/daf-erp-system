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
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({ davom: seans, yopilgan: null });
  });

  it("30 daqiqadan eski yoki boshqa kun — davom etmaydi, yopilgan sifatida qaytadi", () => {
    const s = xotira();
    const seans = yangiSeans(7, T0, "s1");
    joriyniSaqla(s, seans);
    expect(joriyniOqi(s, 7, T0 + 31 * 60_000)).toEqual({ davom: null, yopilgan: seans });
    expect(joriyniOqi(s, 7, T0 + 86_400_000)).toEqual({ davom: null, yopilgan: seans });
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
    expect(kutilmoqdaOqi(buzuq)).toEqual([]);
  });
});

describe("yuborilmaganlar", () => {
  it("bir xil seans qayta qo'shilsa eskisi almashtiriladi; o'chirish ishlaydi", () => {
    const s = xotira();
    const a = payloadFor({ ...yangiSeans(7, T0, "a"), activeMs: 10_000 });
    kutilmoqdaQosh(s, a);
    kutilmoqdaQosh(s, { ...a, activeSeconds: 20 });
    expect(kutilmoqdaOqi(s)).toEqual([{ ...a, activeSeconds: 20 }]);
    kutilmoqdaOchir(s, "a");
    expect(kutilmoqdaOqi(s)).toEqual([]);
  });

  it("ko'pi bilan 20 ta, eng eskilari tushib qoladi; buzilgan elementlar e'tiborga olinmaydi", () => {
    const s = xotira();
    for (let i = 0; i < KUTILMOQDA_MAX + 3; i++) {
      kutilmoqdaQosh(s, payloadFor(yangiSeans(7, T0, `s${i}`)));
    }
    const royxat = kutilmoqdaOqi(s);
    expect(royxat).toHaveLength(KUTILMOQDA_MAX);
    expect(royxat[0].sessionId).toBe("s3");
    s.setItem(KUTILMOQDA_KALIT, JSON.stringify([{ foo: 1 }, royxat[0]]));
    expect(kutilmoqdaOqi(s)).toEqual([royxat[0]]);
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
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({ davom: seans, yopilgan: null });
    joriyniOchir(s);
    expect(joriyniOqi(s, 7, T0 + 60_000)).toEqual({ davom: null, yopilgan: null });
  });
});
