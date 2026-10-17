import { afterEach, describe, expect, it, vi } from "vitest";
import { writeLocaleCookie } from "./locale-cookie";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeLocaleCookie", () => {
  it("writes the device cookie for a year, on every path", () => {
    const fakeDocument = { cookie: "" };
    vi.stubGlobal("document", fakeDocument);

    writeLocaleCookie("ru");

    expect(fakeDocument.cookie).toContain("daf-locale=ru");
    expect(fakeDocument.cookie).toContain("path=/");
    expect(fakeDocument.cookie).toContain("max-age=31536000");
    expect(fakeDocument.cookie).toContain("samesite=lax");
  });

  it("does nothing, and does not throw, where there is no document", () => {
    vi.stubGlobal("document", undefined);
    expect(() => writeLocaleCookie("de")).not.toThrow();
  });
});
