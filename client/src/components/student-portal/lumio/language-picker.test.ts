import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-t", () => ({
  useT: () => (source: string) => source,
  useLocale: () => ({ locale: "ru", setLocale: async () => true }),
}));

import { LOCALES } from "@/i18n/locales";
import { LanguagePicker, pickPortalLocale } from "./language-picker";

const render = (variant: "list" | "compact") =>
  renderToStaticMarkup(createElement(LanguagePicker, { variant })).replace(/&#x27;/g, "'");

describe("LanguagePicker", () => {
  it("lists the five languages in their own language, the chosen one checked (list)", () => {
    const html = render("list");
    for (const { id, label } of LOCALES) {
      expect(html).toMatch(new RegExp(`role="radio" aria-checked="${id === "ru"}" lang="${id}"[^>]*>${label}`));
    }
  });

  it("lists the five languages with the chosen one selected (compact)", () => {
    const html = render("compact");
    expect(html).toMatch(/<select aria-label="Til"/);
    for (const { id, label } of LOCALES) {
      const selected = id === "ru" ? ' selected=""' : "";
      expect(html).toContain(`<option value="${id}" lang="${id}"${selected}>${label}</option>`);
    }
  });
});

describe("pickPortalLocale", () => {
  it("switches the device language and never saves it to an account", () => {
    const setLocale = vi.fn(async () => true);
    pickPortalLocale("de", "ru", setLocale);
    expect(setLocale).toHaveBeenCalledTimes(1);
    expect(setLocale).toHaveBeenCalledWith("de", { save: false });
  });

  it("does nothing for the current language or an unknown id", () => {
    const setLocale = vi.fn(async () => true);
    pickPortalLocale("ru", "ru", setLocale);
    pickPortalLocale("fr", "ru", setLocale);
    expect(setLocale).not.toHaveBeenCalled();
  });
});
