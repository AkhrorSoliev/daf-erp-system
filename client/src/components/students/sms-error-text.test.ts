import { describe, expect, it } from "vitest";
import { smsErrorText } from "./sms-error-text";

describe("smsErrorText", () => {
  it.each([
    [
      "403: Forbidden: bot was blocked by the user",
      "O'quvchi botni bloklagan — xabar yetib bormadi",
    ],
    [
      "Forbidden: user is deactivated",
      "O'quvchining Telegram hisobi o'chirilgan — xabar yetib bormadi",
    ],
    [
      "400: Bad Request: chat not found",
      "O'quvchining Telegram chati topilmadi — xabar yetib bormadi",
    ],
  ])("says why Telegram refused: %s", (raw, text) => {
    expect(smsErrorText(raw)).toBe(text);
  });

  it("passes the server's own Uzbek reasons through", () => {
    expect(smsErrorText("Telegram bog'lanmagan")).toBe("Telegram bog'lanmagan");
  });

  it("never shows a raw network error, which carries the request URL", () => {
    const raw =
      "request to https://api.telegram.org/bot000:SECRET/sendMessage failed, reason: ";
    expect(smsErrorText(raw)).toBe("Xabar yuborilmadi: Telegram xatosi");
  });

  it("falls back when there is no reason", () => {
    expect(smsErrorText(null)).toBe("Xabar yuborilmadi: Telegram xatosi");
  });

  // A marker `t` shows which texts are handed over for translation.
  const mark = (source: string) => `T(${source})`;

  it("hands the client words, and only those, to the translator", () => {
    expect(smsErrorText("403: Forbidden: bot was blocked by the user", mark)).toBe(
      "T(O'quvchi botni bloklagan — xabar yetib bormadi)",
    );
    expect(smsErrorText("429: Too Many Requests", mark)).toBe(
      "T(Telegram band — birozdan keyin qayta yuboring)",
    );
    expect(smsErrorText(null, mark)).toBe("T(Xabar yuborilmadi: Telegram xatosi)");
    expect(smsErrorText("request to https://x failed", mark)).toBe(
      "T(Xabar yuborilmadi: Telegram xatosi)",
    );
  });

  it("never translates the server's own reasons", () => {
    expect(smsErrorText("Telegram bot ishlamayapti", mark)).toBe(
      "Telegram bot ishlamayapti",
    );
  });
});
