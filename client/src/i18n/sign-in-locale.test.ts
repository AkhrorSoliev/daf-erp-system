import { describe, expect, it, vi } from "vitest";
import { adoptAccountLocale, localeToAdopt } from "./sign-in-locale";

describe("localeToAdopt", () => {
  it.each([[null], [undefined], [""], ["klingon"], [42]])("leaves the page alone when the account holds %j", (account) => {
    expect(localeToAdopt(account, "ru")).toBeNull();
  });

  it("leaves the page alone when the account language is the page's language", () => {
    expect(localeToAdopt("ru", "ru")).toBeNull();
  });

  it.each(["uz", "uz-Cyrl", "ru", "de", "en"] as const)("adopts %s over a different page language", (account) => {
    const other = account === "uz" ? "en" : "uz";
    expect(localeToAdopt(account, other)).toBe(account);
  });
});

describe("adoptAccountLocale", () => {
  it("switches the page to the account language without saving it back", async () => {
    const setLocale = vi.fn().mockResolvedValue(true);
    await expect(adoptAccountLocale("uz", { current: "ru", setLocale })).resolves.toBe(true);
    expect(setLocale).toHaveBeenCalledTimes(1);
    expect(setLocale).toHaveBeenCalledWith("uz", { save: false });
  });

  it("does not touch the page when there is nothing to adopt", async () => {
    const setLocale = vi.fn();
    await expect(adoptAccountLocale(null, { current: "ru", setLocale })).resolves.toBe(false);
    await expect(adoptAccountLocale("ru", { current: "ru", setLocale })).resolves.toBe(false);
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("reports false when the language could not be loaded", async () => {
    const setLocale = vi.fn().mockResolvedValue(false);
    await expect(adoptAccountLocale("de", { current: "uz", setLocale })).resolves.toBe(false);
  });

  it("never throws, so the greeting still appears", async () => {
    const setLocale = vi.fn().mockRejectedValue(new Error("network"));
    await expect(adoptAccountLocale("de", { current: "uz", setLocale })).resolves.toBe(false);
  });
});
