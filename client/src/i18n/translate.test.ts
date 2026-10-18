import { describe, expect, it } from "vitest";
import uzCyrl from "./dictionaries/uz-cyrl";
import { interpolate, translate } from "./translate";

const ru = { "Bosh sahifa": "Главная", "{n} ta o'quvchi": "{n} учеников" };

describe("interpolate", () => {
  it("fills {name} placeholders and leaves unknown ones", () => {
    expect(interpolate("{n} ta o'quvchi", { n: 5 })).toBe("5 ta o'quvchi");
    expect(interpolate("{a} va {b}", { a: "x" })).toBe("x va {b}");
    expect(interpolate("oddiy matn")).toBe("oddiy matn");
  });
});

describe("translate", () => {
  it("returns the Uzbek source for uz, whatever the dictionary holds", () => {
    expect(translate("uz", ru, "Bosh sahifa")).toBe("Bosh sahifa");
  });

  it("takes the translation from the dictionary for ru, de and en", () => {
    expect(translate("ru", ru, "Bosh sahifa")).toBe("Главная");
    expect(translate("ru", ru, "{n} ta o'quvchi", { n: 3 })).toBe("3 учеников");
  });

  it("shows the Uzbek source when there is no translation", () => {
    expect(translate("ru", ru, "Hali tarjima qilinmagan")).toBe("Hali tarjima qilinmagan");
    expect(translate("de", {}, "Jadval")).toBe("Jadval");
  });

  it("transliterates the source for uz-Cyrl, an override in the dictionary wins", () => {
    expect(translate("uz-Cyrl", {}, "Bosh sahifa")).toBe("Бош саҳифа");
    expect(translate("uz-Cyrl", { "Bosh sahifa": "Асосий саҳифа" }, "Bosh sahifa")).toBe("Асосий саҳифа");
    expect(translate("uz-Cyrl", {}, "{n} ta o'quvchi", { n: 5 })).toBe("5 та ўқувчи");
  });

  it("returns an empty text for a non-string source (an unmapped code) instead of throwing", () => {
    for (const locale of ["uz", "uz-Cyrl", "ru"] as const) {
      expect(translate(locale, ru, undefined as unknown as string)).toBe("");
      expect(translate(locale, ru, 5 as unknown as string)).toBe("");
    }
  });

  it("uses the real uz-Cyrl overrides: «Profil» keeps its soft sign", () => {
    expect(translate("uz-Cyrl", {}, "Profil")).toBe("Профил");
    expect(translate("uz-Cyrl", uzCyrl, "Profil")).toBe("Профиль");
  });

  it("uses the real uz-Cyrl overrides: the all-caps «JAMI» is a word, not an acronym", () => {
    expect(translate("uz-Cyrl", {}, "JAMI")).toBe("JAMI");
    expect(translate("uz-Cyrl", uzCyrl, "JAMI")).toBe("ЖАМИ");
  });

  it("writes the month lists (full and short) in Uzbek Cyrillic spelling", () => {
    const full = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
    const short = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
    expect(full.map((m) => translate("uz-Cyrl", uzCyrl, m))).toEqual([
      "Январ", "Феврал", "Март", "Апрел", "Май", "Июн", "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр",
    ]);
    expect(short.map((m) => translate("uz-Cyrl", uzCyrl, m))).toEqual([
      "Ян", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
    ]);
  });
});
