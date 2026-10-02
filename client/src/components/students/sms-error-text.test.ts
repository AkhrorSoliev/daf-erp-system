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
});
