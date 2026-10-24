import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, LOCALE_IDS, isUiLocale, localeOrDefault } from "./locales";

describe("locales", () => {
  it("lists the five languages, the default first, each in its own name", () => {
    expect([...LOCALE_IDS]).toEqual(["uz", "uz-Cyrl", "ru", "de", "en"]);
    expect(DEFAULT_LOCALE).toBe("uz");
    expect(LOCALES.map((l) => l.label)).toEqual(["O'zbekcha", "Ўзбекча", "Русский", "Deutsch", "English"]);
  });

  it("knows a locale id and falls back to the default for anything else", () => {
    expect(isUiLocale("ru")).toBe(true);
    expect(isUiLocale("fr")).toBe(false);
    expect(isUiLocale(undefined)).toBe(false);
    expect(localeOrDefault("de")).toBe("de");
    expect(localeOrDefault("DE")).toBe("uz");
    expect(localeOrDefault(null)).toBe("uz");
  });

  it("lists exactly the ids the server accepts", () => {
    const server = readFileSync(path.join(__dirname, "../../../server/src/common/ui-locales.ts"), "utf8");
    const list = server.match(/UI_LOCALES = \[([^\]]*)\]/)?.[1] ?? "";
    const ids = [...list.matchAll(/'([A-Za-z-]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual([...LOCALE_IDS]);
  });
});
