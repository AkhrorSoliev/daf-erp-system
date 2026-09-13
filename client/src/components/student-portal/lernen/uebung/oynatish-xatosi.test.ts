import { describe, expect, it } from "vitest";
import { ovozXatosiMi } from "./oynatish-xatosi";

describe("ovozXatosiMi", () => {
  it("AbortError — pause() to'xtatgan so'rov, xato EMAS", () => {
    expect(ovozXatosiMi(new DOMException("aborted", "AbortError"))).toBe(false);
  });

  it("NotAllowedError — brauzer avtomatik ijroni bloklagan, xato EMAS", () => {
    expect(ovozXatosiMi(new DOMException("blocked", "NotAllowedError"))).toBe(
      false,
    );
  });

  it("boshqa DOMException (masalan NotSupportedError) — HAQIQIY xato", () => {
    expect(
      ovozXatosiMi(new DOMException("bad format", "NotSupportedError")),
    ).toBe(true);
  });

  it("Error yoki boshqa Error EMAS qiymat ham — HAQIQIY xato", () => {
    expect(ovozXatosiMi(new Error("tarmoq uzildi"))).toBe(true);
    expect(ovozXatosiMi("satr")).toBe(true);
    expect(ovozXatosiMi(undefined)).toBe(true);
  });
});
