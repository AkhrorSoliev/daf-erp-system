import { describe, expect, it } from "vitest";
import { aylanganSana } from "./aylangan-sana";

/**
 * `statusChangedAt` lid YO'QOTILGAN deb belgilanganda ham yoziladi, va
 * `LeadsArchiveService.restore` bosqichni `NEW` ga qaytarganda uni tozalamaydi.
 * Shuning uchun sanani shartsiz chiqarish tiklangan lidni "<o'chirilgan kuni>
 * da o'quvchi bo'ldi" deb ko'rsatardi. Prodda 214 ta LOST lid bor.
 */
describe("aylanganSana", () => {
  it("aylangan lid uchun sanani beradi", () => {
    expect(
      aylanganSana({
        statusEnum: "CONVERTED",
        statusChangedAt: "2026-09-05T10:00:00.000Z",
      }),
    ).toBe("05.09.2026");
  });

  it("tiklangan lidning hisobdan chiqarilgan sanasini ko'rsatmaydi", () => {
    expect(
      aylanganSana({
        statusEnum: "NEW",
        statusChangedAt: "2026-07-01T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("yo'qotilgan lid uchun ham sana bermaydi", () => {
    expect(
      aylanganSana({
        statusEnum: "LOST",
        statusChangedAt: "2026-07-01T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("sanasi yo'q aylangan lid uchun null qaytaradi", () => {
    expect(
      aylanganSana({ statusEnum: "CONVERTED", statusChangedAt: null }),
    ).toBeNull();
  });
});
