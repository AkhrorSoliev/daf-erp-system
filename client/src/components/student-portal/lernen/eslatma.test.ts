import { describe, expect, it } from "vitest";
import {
  ESLATMA_IZOH,
  ESLATMA_SARLAVHA,
  SAQLANMADI,
  ULANMAGAN_IZOH,
  eslatmaHolati,
} from "./eslatma";

describe("eslatmaHolati", () => {
  it("ulangan: yoqilgan yoki o'chirilgan", () => {
    expect(eslatmaHolati({ eslatmalar: true, telegramUlangan: true })).toBe("yoqilgan");
    expect(eslatmaHolati({ eslatmalar: false, telegramUlangan: true })).toBe("ochirilgan");
  });

  it("botga ulanmagan — sozlamadan qat'i nazar «ulanmagan»", () => {
    expect(eslatmaHolati({ eslatmalar: true, telegramUlangan: false })).toBe("ulanmagan");
    expect(eslatmaHolati({ eslatmalar: false, telegramUlangan: false })).toBe("ulanmagan");
  });

  it("eski server (maydon yo'q) — null, qator chizilmaydi", () => {
    expect(eslatmaHolati({})).toBeNull();
    expect(eslatmaHolati({ eslatmalar: true })).toBeNull();
  });

  it("xato matni aynan shu", () => {
    expect(SAQLANMADI).toBe("Saqlab bo'lmadi. Qayta urinib ko'ring");
  });

  it("matnlar — lotin o'zbekcha, inglizcha so'z yo'q", () => {
    expect([ESLATMA_SARLAVHA, ESLATMA_IZOH, ULANMAGAN_IZOH]).toEqual([
      "Telegram eslatmalari",
      "Kechki eslatma va dushanba xulosasi",
      "Botga ulang",
    ]);
    expect([ESLATMA_SARLAVHA, ESLATMA_IZOH, ULANMAGAN_IZOH, SAQLANMADI].join(" ")).not.toMatch(
      /\b(reminder|notification|on|off|bot)\b/i,
    );
  });
});
