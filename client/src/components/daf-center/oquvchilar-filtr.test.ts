import { describe, expect, it } from "vitest";
import {
  filtrniUrldanOqi,
  filtrniUrlgaYoz,
  sorovParametrlari,
  STANDART_FILTR,
  type OquvchilarFiltri,
} from "./oquvchilar-filtr";

describe("o'quvchilar filtri ↔ URL", () => {
  it("bo'sh URL standart filtr, standart filtr bo'sh URL", () => {
    expect(filtrniUrldanOqi(new URLSearchParams(""))).toEqual(STANDART_FILTR);
    expect(filtrniUrlgaYoz(STANDART_FILTR)).toBe("");
  });

  it("aylanma sayohat: filtr → URL → filtr", () => {
    const f: OquvchilarFiltri = {
      ...STANDART_FILTR,
      davr: 30,
      status: ["QIZIL", "SARIQ"],
      kirgan: "yoq",
      groupId: "g-1",
      teacherId: 20001,
      level: "A2",
      q: "nodira",
      sort: "vaqt",
      dir: "desc",
      page: 3,
    };
    const url = filtrniUrlgaYoz(f);
    expect(url).toContain("status=QIZIL%2CSARIQ");
    expect(filtrniUrldanOqi(new URLSearchParams(url))).toEqual(f);
  });

  it("noto'g'ri qiymatlar standartga tushadi", () => {
    const f = filtrniUrldanOqi(new URLSearchParams("period=15&status=BINAFSHA,QIZIL&sort=telefon&page=abc&teacherId=x"));
    expect(f.davr).toBe(7);
    expect(f.status).toEqual(["QIZIL"]);
    expect(f.sort).toBe("holat");
    expect(f.page).toBe(1);
    expect(f.teacherId).toBeNull();
  });

  it("so'rov parametrlari: bo'shlar tashlanadi, holatlar vergul bilan", () => {
    expect(sorovParametrlari(STANDART_FILTR)).toEqual({
      period: 7, status: undefined, kirgan: undefined, groupId: undefined, teacherId: undefined,
      level: undefined, q: undefined, sort: "holat", dir: "asc", page: 1, pageSize: 50,
    });
    expect(sorovParametrlari({ ...STANDART_FILTR, status: ["QIZIL", "SARIQ"], q: "  ali " }).status).toBe("QIZIL,SARIQ");
    expect(sorovParametrlari({ ...STANDART_FILTR, q: "  ali " }).q).toBe("ali");
  });
});
