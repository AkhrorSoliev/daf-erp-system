import { describe, expect, it } from "vitest";
import {
  bolimFor,
  boshlangichHolat,
  payloadFor,
  tashkentKuni,
  tick,
  yangiSeans,
  yuborishgaArziydi,
  type TickKirish,
  type TrackerHolati,
} from "./activity-tracker";

// 2026-09-13 15:00 Toshkent
const T0 = Date.parse("2026-09-13T10:00:00.000Z");

function holat(ortiqcha: Partial<TrackerHolati> = {}): TrackerHolati {
  return { ...boshlangichHolat(yangiSeans(7, T0, "s1"), T0), ...ortiqcha };
}

function kirish(ortiqcha: Partial<TickKirish> = {}): TickKirish {
  return {
    now: T0 + 1000,
    visible: true,
    focused: true,
    lastInputAt: T0,
    mediaPlaying: false,
    pathname: "/portal/lernen/lessons/5",
    radio: null,
    ...ortiqcha,
  };
}

let n = 0;
const id = () => `yangi-${++n}`;

describe("tick — faol vaqt", () => {
  it("ko'rinib turgan, fokusdagi, yaqinda tegilgan ekran: qadam faol vaqtga va bo'limga qo'shiladi", () => {
    const r = tick(holat(), kirish(), id);
    expect(r.holat.seans.activeMs).toBe(1000);
    expect(r.holat.seans.sections).toEqual({ LERNEN: 1000, OTHER: 0 });
    expect(r.holat.seans.lastActiveAt).toBe(T0 + 1000);
    expect(r.holat.lastTickAt).toBe(T0 + 1000);
    expect(r.yopilgan).toBeNull();
  });

  it("tab yashirin yoki oyna fokusda emas — sanalmaydi", () => {
    expect(tick(holat(), kirish({ visible: false }), id).holat.seans.activeMs).toBe(0);
    expect(tick(holat(), kirish({ focused: false }), id).holat.seans.activeMs).toBe(0);
  });

  it("oxirgi tegilganidan 2 daqiqa o'tgan — sanalmaydi, lekin ta'lim audiosi o'ynasa sanaladi", () => {
    const eski = { lastInputAt: T0 - 120_001 };
    expect(tick(holat(), kirish(eski), id).holat.seans.activeMs).toBe(0);
    expect(tick(holat(), kirish({ ...eski, mediaPlaying: true }), id).holat.seans.activeMs).toBe(1000);
  });

  it("uzoq tanaffusdan keyingi tick 5 soniyaga qirqiladi (kompyuter uxlagan)", () => {
    const r = tick(holat(), kirish({ now: T0 + 60_000, lastInputAt: T0 + 59_000 }), id);
    expect(r.holat.seans.activeMs).toBe(5000);
  });

  it("boshqa sahifa OTHER bo'limiga tushadi", () => {
    const r = tick(holat(), kirish({ pathname: "/portal/payments" }), id);
    expect(r.holat.seans.sections).toEqual({ LERNEN: 0, OTHER: 1000 });
  });
});

describe("tick — radio", () => {
  const radio = (position: number, audible = true) => ({ position, audible });

  it("pozitsiya o'sishi radio vaqtiga qo'shiladi, faol vaqtga emas, ekran yashirin bo'lsa ham", () => {
    const h = holat({ lastRadioPos: 10 });
    const r = tick(h, kirish({ radio: radio(10.8), visible: false }), id);
    expect(r.holat.seans.radioMs).toBeCloseTo(800, 5);
    expect(r.holat.seans.activeMs).toBe(0);
    expect(r.holat.lastRadioPos).toBe(10.8);
  });

  it("bir o'lchovdagi siljish o'tgan soat vaqti + 1 s dan oshmaydi", () => {
    const h = holat({ lastRadioPos: 0 });
    const r = tick(h, kirish({ radio: radio(30) }), id); // devor 1 s → ko'pi bilan 2 s
    expect(r.holat.seans.radioMs).toBe(2000);
  });

  it("stansiya almashdi (pozitsiya kamaydi), birinchi o'lchov yoki eshitilmayapti — 0", () => {
    expect(tick(holat({ lastRadioPos: 50 }), kirish({ radio: radio(1) }), id).holat.seans.radioMs).toBe(0);
    expect(tick(holat({ lastRadioPos: null }), kirish({ radio: radio(5) }), id).holat.seans.radioMs).toBe(0);
    expect(tick(holat({ lastRadioPos: 5 }), kirish({ radio: radio(5.9, false) }), id).holat.seans.radioMs).toBe(0);
  });
});

describe("tick — seans almashishi", () => {
  it("30 daqiqadan uzoq harakatsizlikdan keyin harakat boshlansa: eski seans yopiladi, yangisi shu tickni oladi", () => {
    const h = holat({ lastTickAt: T0 + 31 * 60_000 - 1000 });
    const now = T0 + 31 * 60_000;
    const r = tick(h, kirish({ now, lastInputAt: now }), id);
    expect(r.yopilgan?.sessionId).toBe("s1");
    expect(r.holat.seans.sessionId).not.toBe("s1");
    expect(r.holat.seans.activeMs).toBe(1000);
  });

  it("harakatsiz qolsa seans almashmaydi", () => {
    const h = holat({ lastTickAt: T0 + 40 * 60_000 - 1000 });
    const r = tick(h, kirish({ now: T0 + 40 * 60_000, visible: false }), id);
    expect(r.yopilgan).toBeNull();
    expect(r.holat.seans.sessionId).toBe("s1");
  });

  it("Toshkent yarim tunida harakat bo'lsa yangi seans", () => {
    const kechqurun = Date.parse("2026-09-13T18:59:59.000Z"); // 23:59:59 Toshkent
    const h = boshlangichHolat(yangiSeans(7, kechqurun, "s1"), kechqurun);
    const r = tick(h, kirish({ now: kechqurun + 2000, lastInputAt: kechqurun + 2000 }), id);
    expect(r.yopilgan?.sessionId).toBe("s1");
    expect(r.holat.seans.kun).toBe("2026-09-14");
  });
});

describe("yordamchilar", () => {
  it("tashkentKuni UTC+5", () => {
    expect(tashkentKuni(Date.parse("2026-09-13T18:59:59.000Z"))).toBe("2026-09-13");
    expect(tashkentKuni(Date.parse("2026-09-13T19:00:00.000Z"))).toBe("2026-09-14");
  });

  it("bolimFor: faqat /portal/lernen va uning ichi LERNEN", () => {
    expect(bolimFor("/portal/lernen")).toBe("LERNEN");
    expect(bolimFor("/portal/lernen/units/2")).toBe("LERNEN");
    expect(bolimFor("/portal/lernenx")).toBe("OTHER");
    expect(bolimFor("/portal/radio")).toBe("OTHER");
  });

  it("payloadFor soniyaga pastga yumaloqlaydi; yuborishgaArziydi kamida 1 s bo'lsa", () => {
    const s = { ...yangiSeans(7, T0, "s1"), activeMs: 61_900, radioMs: 999, sections: { LERNEN: 40_500, OTHER: 21_400 } };
    expect(payloadFor(s)).toEqual({
      sessionId: "s1",
      platform: "WEB",
      activeSeconds: 61,
      radioSeconds: 0,
      sections: { LERNEN: 40, OTHER: 21 },
    });
    expect(yuborishgaArziydi(s)).toBe(true);
    expect(yuborishgaArziydi(yangiSeans(7, T0, "s2"))).toBe(false);
  });
});
