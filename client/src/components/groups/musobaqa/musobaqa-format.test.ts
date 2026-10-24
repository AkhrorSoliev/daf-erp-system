import { describe, expect, it } from "vitest";
import {
  haftaYorligi,
  kartaIzohi,
  kunFarqi,
  maqsadFoizi,
  oxirgiMashqMatni,
} from "./musobaqa-format";
import type { MusobaqaGuruh } from "./types";

describe("haftaYorligi", () => {
  it("dushanba–yakshanba, kun.oy", () => {
    expect(haftaYorligi("2026-10-19")).toBe("19.10 – 25.10");
  });
  it("oy almashganda", () => {
    expect(haftaYorligi("2026-10-26")).toBe("26.10 – 01.11");
  });
});

describe("kunFarqi", () => {
  it("sanalar satrdan, vaqt mintaqasiga bog'liq emas", () => {
    expect(kunFarqi("2026-10-17", "2026-10-19")).toBe(2);
    expect(kunFarqi("2026-09-30", "2026-10-01")).toBe(1);
  });
});

describe("oxirgiMashqMatni", () => {
  it.each([
    [null, "hech qachon"],
    ["2026-10-21", "bugun"],
    ["2026-10-20", "kecha"],
    ["2026-10-17", "4 kun oldin"],
  ])("%s → %s", (sana, kutilgan) => {
    expect(oxirgiMashqMatni(sana, "2026-10-21")).toBe(kutilgan);
  });
});

describe("kartaIzohi", () => {
  const g = (holat: MusobaqaGuruh["holat"], azolar = 2): MusobaqaGuruh => ({
    holat, orin: null, guruhSoni: null, baho: null, azolar, ball: 0, minAzolar: 3,
  });
  it("jadvalda — izoh yo'q", () => {
    expect(kartaIzohi(g("JADVALDA"))).toBeNull();
  });
  it("kam a'zo", () => {
    expect(kartaIzohi(g("KAM_AZO", 2))).toBe("Jadvalga kirish uchun kamida 3 a'zo kerak (hozir 2)");
  });
  it("faol emas / yozuv yo'q", () => {
    expect(kartaIzohi(g("FAOL_EMAS"))).toBe("Guruh faol emas — musobaqada qatnashmaydi");
    expect(kartaIzohi(g("YOZUV_YOQ"))).toBe("Bu haftada guruh jadvalda bo'lmagan");
  });
});

describe("maqsadFoizi", () => {
  it("0–100, null bo'lsa null", () => {
    expect(maqsadFoizi(40, 80)).toBe(50);
    expect(maqsadFoizi(200, 80)).toBe(100);
    expect(maqsadFoizi(null, 80)).toBeNull();
    expect(maqsadFoizi(10, null)).toBeNull();
    expect(maqsadFoizi(10, 0)).toBeNull();
  });
});
