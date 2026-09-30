import { describe, expect, it } from "vitest";
import { engYangiSana, oqilmaganSoni, yangiliklarRolUchun } from "./yangiliklar-holati";
import type { Yangilik } from "./turlar";

const y = (sana: string, rollar?: Yangilik["rollar"]): Yangilik => ({ sana, sarlavha: sana, matn: "", rollar });

describe("yangiliklar holati", () => {
  const royxat = [y("2026-09-01"), y("2026-09-20", [1, 2]), y("2026-09-29", [4])];

  it("rolsiz yozuvni hamma ko'radi", () => {
    expect(yangiliklarRolUchun(royxat, [5]).map((x) => x.sana)).toEqual(["2026-09-01"]);
    expect(yangiliklarRolUchun(royxat, [4]).map((x) => x.sana)).toEqual(["2026-09-01", "2026-09-29"]);
  });
  it("oxirgi ko'rilgandan keyingilar o'qilmagan", () => {
    expect(oqilmaganSoni(royxat, "2026-09-20", "2026-09-30")).toBe(1);
    expect(oqilmaganSoni(royxat, "2026-09-29", "2026-09-30")).toBe(0);
  });
  it("birinchi kirishda oxirgi 14 kun sanaladi", () => {
    expect(oqilmaganSoni(royxat, null, "2026-09-30")).toBe(2);
  });
  it("eng yangi sana", () => {
    expect(engYangiSana(royxat)).toBe("2026-09-29");
    expect(engYangiSana([])).toBeNull();
  });
});
