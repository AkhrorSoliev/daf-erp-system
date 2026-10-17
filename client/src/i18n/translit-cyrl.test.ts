import { describe, expect, it } from "vitest";
import { toCyrillic } from "./translit-cyrl";

describe("toCyrillic", () => {
  it.each([
    ["Bosh sahifa", "Бош саҳифа"],
    ["O'qituvchilar", "Ўқитувчилар"],
    ["O'quvchilar", "Ўқувчилар"],
    ["To'lovlar", "Тўловлар"],
    ["Ish haqi", "Иш ҳақи"],
    ["Guruhlar", "Гуруҳлар"],
    ["Hisobotlar", "Ҳисоботлар"],
    ["Qarzdorlik", "Қарздорлик"],
    ["Xarajatlar", "Харажатлар"],
    ["Sozlamalar", "Созламалар"],
    ["Chiqish", "Чиқиш"],
    ["Ko'rinish", "Кўриниш"],
    ["Qo'llanma", "Қўлланма"],
    ["Jadval", "Жадвал"],
    ["Topshiriq", "Топшириқ"],
    ["Barcha filiallar", "Барча филиаллар"],
    ["Aloqa markazi", "Алоқа маркази"],
    ["Dizayn uslubi", "Дизайн услуби"],
    ["So'm", "Сўм"],
    ["O'zbekcha", "Ўзбекча"],
    ["G'azna", "Ғазна"],
  ])("%s → %s", (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic);
  });

  it("writes e as э at the start of a word and after a vowel, е elsewhere", () => {
    expect(toCyrillic("Elektron")).toBe("Электрон");
    expect(toCyrillic("Eshik")).toBe("Эшик");
    expect(toCyrillic("Mening")).toBe("Менинг");
  });

  it("handles y: я ё ю before a vowel after a consonant or at the start, й elsewhere", () => {
    expect(toCyrillic("yangi")).toBe("янги");
    expect(toCyrillic("Yordam")).toBe("Ёрдам");
    expect(toCyrillic("Texnik yordam")).toBe("Техник ёрдам");
    expect(toCyrillic("yo'l")).toBe("йўл");
    expect(toCyrillic("mayda")).toBe("майда");
    expect(toCyrillic("Mening oyligim")).toBe("Менинг ойлигим");
  });

  it("writes an apostrophe inside a word as ъ and ts as ц", () => {
    expect(toCyrillic("Ma'lumot")).toBe("Маълумот");
    expect(toCyrillic("tsentr")).toBe("центр");
  });

  it("accepts every apostrophe variant", () => {
    for (const a of ["'", "ʻ", "ʼ", "‘", "’"]) {
      expect(toCyrillic(`o${a}quvchi`)).toBe("ўқувчи");
      expect(toCyrillic(`ma${a}lumot`)).toBe("маълумот");
    }
  });

  it("keeps the case of a letter and of a digraph", () => {
    expect(toCyrillic("Sh")).toBe("Ш");
    expect(toCyrillic("SHAHAR".toLowerCase())).toBe("шаҳар");
    expect(toCyrillic("TO'LOV")).toBe("ТЎЛОВ");
  });

  it("leaves placeholders, urls, e-mails, handles, numbers, punctuation, acronyms and brands alone", () => {
    expect(toCyrillic("{n} ta o'quvchi")).toBe("{n} та ўқувчи");
    expect(toCyrillic("Xodimlar KPI")).toBe("Ходимлар KPI");
    expect(toCyrillic("PDF yuklab olish")).toBe("PDF юклаб олиш");
    expect(toCyrillic("Telegram orqali")).toBe("Telegram орқали");
    expect(toCyrillic("17.10.2026, 14:05")).toBe("17.10.2026, 14:05");
    expect(toCyrillic("https://t.me/akhror_soliev")).toBe("https://t.me/akhror_soliev");
    expect(toCyrillic("yozing: a.b@mail.uz")).toBe("ёзинг: a.b@mail.uz");
    expect(toCyrillic("@dafferganaadmin")).toBe("@dafferganaadmin");
  });

  it("leaves a quote mark around a word alone", () => {
    expect(toCyrillic("'Yangi'")).toBe("'Янги'");
  });
});
