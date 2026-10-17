import { describe, expect, it } from "vitest";
import { LOCALE_IDS, type UiLocale } from "@/i18n/locales";
import { dateFnsLocale } from "./date-fns-locale";

describe("dateFnsLocale", () => {
  it("maps every interface language to a date-fns locale", () => {
    for (const id of LOCALE_IDS) {
      expect(dateFnsLocale(id).code, id).toBeTruthy();
    }
  });

  it("gives each interface language its own date-fns locale", () => {
    const codes = LOCALE_IDS.map((id) => dateFnsLocale(id).code);
    expect(new Set(codes).size).toBe(LOCALE_IDS.length);
  });

  it("keeps the Uzbek locales the pages used before", () => {
    expect(dateFnsLocale("uz").code).toBe("uz");
    expect(dateFnsLocale("uz-Cyrl").code).toBe("uz-Cyrl");
  });

  it("names the months in the page language", () => {
    const march = 2;
    const name = (id: UiLocale) => dateFnsLocale(id).localize.month(march, { width: "wide" });
    expect(name("ru")).toBe("март");
    expect(name("de")).toBe("März");
    expect(name("en")).toBe("March");
  });
});
