import { describe, expect, it } from "vitest";
import { haqiqiySanami, kunQosh, sanaKorinishi } from "./sana";

describe("sana", () => {
  it("ko'rinish dd.MM.yyyy", () => {
    expect(sanaKorinishi("2026-09-30")).toBe("30.09.2026");
  });
  it("kun qo'shish oy va yil chegarasidan o'tadi", () => {
    expect(kunQosh("2026-09-30", 1)).toBe("2026-10-01");
    expect(kunQosh("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("haqiqiy sana", () => {
    expect(haqiqiySanami("2026-09-30")).toBe(true);
    expect(haqiqiySanami("2026-02-30")).toBe(false);
    expect(haqiqiySanami("30.09.2026")).toBe(false);
  });
  it("noto'g'ri oy va kun xato bermaydi, false qaytaradi", () => {
    for (const iso of ["2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32"]) {
      expect(haqiqiySanami(iso), iso).toBe(false);
    }
  });
});
