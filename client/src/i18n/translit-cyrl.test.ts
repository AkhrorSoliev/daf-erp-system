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

  it.each([
    ["Moliya", "Молия"],
    ["Familiya", "Фамилия"],
    ["Ayol", "Аёл"],
    ["Bo'yoq", "Бўёқ"],
    ["Kategoriya", "Категория"],
    ["Viloyat", "Вилоят"],
    ["Yaqinlashayotgan", "Яқинлашаётган"],
    ["Sayohat", "Саёҳат"],
  ])("writes ya yo yu ye after a vowel too: %s → %s", (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic);
  });

  it("writes an apostrophe inside a word as ъ and ts as ц", () => {
    expect(toCyrillic("Ma'lumot")).toBe("Маълумот");
    expect(toCyrillic("tsentr")).toBe("центр");
  });

  it("accepts every apostrophe variant", () => {
    for (const a of ["'", "ʻ", "ʼ", "‘", "’", "`"]) {
      expect(toCyrillic(`o${a}quvchi`)).toBe("ўқувчи");
      expect(toCyrillic(`ma${a}lumot`)).toBe("маълумот");
    }
  });

  it("keeps the case of a letter and of a digraph", () => {
    expect(toCyrillic("Sh")).toBe("Ш");
    expect(toCyrillic("SHAHAR".toLowerCase())).toBe("шаҳар");
    expect(toCyrillic("TO'LOV")).toBe("ТЎЛОВ");
  });

  it("converts an uppercase digraph (sh, ch, o', g') in a capitalised or a shouted word", () => {
    expect(toCyrillic("Shahar")).toBe("Шаҳар");
    expect(toCyrillic("Chiroyli")).toBe("Чиройли");
    expect(toCyrillic("SHO'RVA")).toBe("ШЎРВА");
    expect(toCyrillic("CHO'L")).toBe("ЧЎЛ");
    expect(toCyrillic("G'ISHT")).toBe("ҒИШТ");
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

  it("reads a word-final g' and o' as ғ and ў, not as a closing quote", () => {
    expect(toCyrillic("Tog'")).toBe("Тоғ");
    expect(toCyrillic("Tog' va dasht")).toBe("Тоғ ва дашт");
    expect(toCyrillic("Bo'lmasa, yo'q")).toBe("Бўлмаса, йўқ");
    expect(toCyrillic("'Tog''")).toBe("'Тоғ'");
  });

  it("keeps a brand or an acronym with a suffix in Latin and converts only the suffix", () => {
    expect(toCyrillic("Telegram'ga yuborish")).toBe("Telegram'га юбориш");
    expect(toCyrillic("Payme'ga o'tish")).toBe("Payme'га ўтиш");
    expect(toCyrillic("Click'ga o'tish")).toBe("Click'га ўтиш");
    expect(toCyrillic("SMS'lar")).toBe("SMS'лар");
    expect(toCyrillic("PDFni")).toBe("PDFни");
    expect(toCyrillic("SMSlar")).toBe("SMSлар");
    expect(toCyrillic("Telegram’ga")).toBe("Telegram'га");
  });

  it("leaves a level code (one capital letter and digits) alone, and keeps Goethe and Deutsch in Latin", () => {
    expect(toCyrillic("A1 daraja")).toBe("A1 даража");
    expect(toCyrillic("C1 darajasi")).toBe("C1 даражаси");
    expect(toCyrillic("B2, C1")).toBe("B2, C1");
    expect(toCyrillic("Goethe sinovi")).toBe("Goethe синови");
    expect(toCyrillic("Deutsch kursi")).toBe("Deutsch курси");
    expect(toCyrillic("Veb, Android va iOS bir xil qoida bilan sanaladi")).toBe("Веб, Андроид ва iOS бир хил қоида билан саналади");
  });
});
