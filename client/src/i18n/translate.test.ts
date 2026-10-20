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

  it("writes the payments loanwords with ц and keeps technical terms in Latin", () => {
    expect(translate("uz-Cyrl", uzCyrl, "Kvitansiya")).toBe("Квитанция");
    expect(translate("uz-Cyrl", uzCyrl, "Tranzaksiyani biriktirish")).toBe("Транзакцияни бириктириш");
    expect(translate("uz-Cyrl", uzCyrl, "Tranzaksiya raqami (externalId)")).toBe("Транзакция рақами (externalId)");
    expect(translate("uz-Cyrl", uzCyrl, "Tranzaksiya raqami ({provider} tizimida)", { provider: "Payme" })).toBe(
      "Транзакция рақами (Payme тизимида)",
    );
    expect(translate("uz-Cyrl", uzCyrl, "Ism, telefon, ID yoki kvitansiya raqami")).toBe("Исм, телефон, ID ёки квитанция рақами");
    expect(translate("uz-Cyrl", uzCyrl, "Webhook so'rovi")).toBe("Webhook сўрови");
    expect(translate("uz-Cyrl", uzCyrl, "Bu {n} ta xodim uchun mavjud **umumiy** qoidani bekor qiladi (per-group qoidalar tegmaydi).", { n: 3 })).toBe(
      "Бу 3 та ходим учун мавжуд **умумий** қоидани бекор қилади (per-group қоидалар тегмайди).",
    );
  });

  it("writes «тс» across a suffix boundary in the mock exams texts, not «ц»", () => {
    expect(translate("uz-Cyrl", {}, "Narx kiritilmadi. Agar shunday davom etsangiz, imtihon bepul bo'lib yaratiladi va bot ro'yxatdan o'tganlardan to'lov so'ramaydi.")).toContain("эцангиз");
    expect(translate("uz-Cyrl", uzCyrl, "Narx kiritilmadi. Agar shunday davom etsangiz, imtihon bepul bo'lib yaratiladi va bot ro'yxatdan o'tganlardan to'lov so'ramaydi.")).toBe(
      "Нарх киритилмади. Агар шундай давом этсангиз, имтиҳон бепул бўлиб яратилади ва бот рўйхатдан ўтганлардан тўлов сўрамайди.",
    );
    expect(translate("uz-Cyrl", uzCyrl, "Bu ishtirokchi {amount} so'm to'lagan. O'chirilsa, bu to'lov mock daromadidan chiqadi, qayta ro'yxatdan o'tsa undan yana to'lov so'raladi. Avval pulni odamga qaytaring.", { amount: "50 000" })).toBe(
      "Бу иштирокчи 50 000 сўм тўлаган. Ўчирилса, бу тўлов mock даромадидан чиқади, қайта рўйхатдан ўтса ундан яна тўлов сўралади. Аввал пулни одамга қайтаринг.",
    );
  });

  it("keeps key names and file-size units Latin in the tasks texts", () => {
    expect(translate("uz-Cyrl", {}, "Ctrl+Enter — yuborish")).not.toBe("Ctrl+Enter — юбориш");
    expect(translate("uz-Cyrl", {}, "{n} B", { n: "5" })).not.toBe("5 B");
    expect(translate("uz-Cyrl", uzCyrl, "Ctrl+Enter — yuborish")).toBe("Ctrl+Enter — юбориш");
    expect(["{n} B", "{n} KB", "{n} MB"].map((s) => translate("uz-Cyrl", uzCyrl, s, { n: "5" }))).toEqual(["5 B", "5 KB", "5 MB"]);
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

  it("writes the month locatives («sentabrda») with the same stems as the month names", () => {
    const locative = ["yanvarda", "fevralda", "martda", "aprelda", "mayda", "iyunda", "iyulda", "avgustda", "sentabrda", "oktabrda", "noyabrda", "dekabrda"];
    expect(locative.map((m) => translate("uz-Cyrl", uzCyrl, m))).toEqual([
      "январда", "февралда", "мартда", "апрелда", "майда", "июнда", "июлда", "августда", "сентябрда", "октябрда", "ноябрда", "декабрда",
    ]);
  });
});
