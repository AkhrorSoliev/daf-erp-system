import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { MAQSAD_VARIANTLARI, maqsadKartasi } from "./maqsad";

const m = (o: Partial<Parameters<typeof maqsadKartasi>[0]>) => ({
  daraja: "ORTA" as const,
  ball: 80,
  hozir: 40,
  bajarildi: false,
  bosh: false,
  ...o,
});

describe("MAQSAD_VARIANTLARI", () => {
  // The client cannot import server code; the numbers must still be the server's.
  it("ballar serverdagi MAQSAD_BALL bilan bir xil", () => {
    const src = readFileSync(
      join(__dirname, "../../../../../server/src/daf/uebung/punkte.ts"),
      "utf8",
    );
    const hit = /YENGIL:\s*(\d+),\s*ORTA:\s*(\d+),\s*JIDDIY:\s*(\d+)/.exec(src);
    expect(hit).not.toBeNull();
    expect(MAQSAD_VARIANTLARI.map((v) => v.ball)).toEqual(
      hit!.slice(1).map(Number),
    );
  });

  it("uch daraja, o'zbekcha nomlar", () => {
    expect(MAQSAD_VARIANTLARI.map((v) => [v.nomi, v.seans])).toEqual([
      ["Yengil", "≈ yarim seans"],
      ["O'rta", "≈ bir seans"],
      ["Jiddiy", "≈ ikki seans"],
    ]);
  });
});

describe("maqsadKartasi", () => {
  it("jarayon: foiz va «40 / 80 ball»", () => {
    expect(maqsadKartasi(m({}))).toEqual({
      holat: "jarayon",
      foiz: 50,
      sarlavha: "Bugungi maqsad",
      ballMatni: "40 / 80 ball",
      darajaNomi: "O'rta",
    });
  });

  it("bajarildi: halqa to'liq", () => {
    expect(maqsadKartasi(m({ hozir: 130, bajarildi: true }))).toMatchObject({
      holat: "bajarildi",
      foiz: 100,
      sarlavha: "Maqsad bajarildi",
      ballMatni: "130 / 80 ball",
    });
  });

  it("bosh: halqa to'liq, «Bugun mashq qolmadi»", () => {
    expect(maqsadKartasi(m({ hozir: 0, bajarildi: true, bosh: true }))).toMatchObject({
      holat: "bosh",
      foiz: 100,
      sarlavha: "Bugun mashq qolmadi",
    });
  });

  it("maqsad bajarilgan bo'lsa bosh ham «Maqsad bajarildi» deydi", () => {
    expect(maqsadKartasi(m({ hozir: 90, bajarildi: true, bosh: true })).holat).toBe(
      "bajarildi",
    );
  });
});
