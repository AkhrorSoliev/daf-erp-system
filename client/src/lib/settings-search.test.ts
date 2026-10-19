import { describe, expect, it } from "vitest";
import { getVisibleSettingsSections, settingsNavSections } from "./settings-nav";
import {
  filterSettingsSections,
  normalizeQuery,
  settingsSearchPages,
  splitByQuery,
} from "./settings-search";
import { canForRoles } from "@/test-support/server-catalog";

const CEO = 1;
const ADMINISTRATOR = 3;

const titles = (query: string, roles = [CEO]) =>
  filterSettingsSections(getVisibleSettingsSections(canForRoles(roles), roles.includes(CEO)), query)
    .flatMap((section) => section.items)
    .map((item) => item.title);

describe("filterSettingsSections — /settings qidiruvi", () => {
  it("bo'sh so'rov hamma bo'limni o'zgartirmay qaytaradi", () => {
    expect(filterSettingsSections(settingsNavSections, "")).toBe(settingsNavSections);
    expect(filterSettingsSections(settingsNavSections, "   ")).toBe(settingsNavSections);
  });

  it("nom bo'yicha topadi, katta-kichik harf farqsiz", () => {
    expect(titles("KURS")).toContain("Kurslar");
  });

  it("kalit so'z bo'yicha topadi: «bayram» → Dam olish kunlari", () => {
    expect(titles("bayram")).toEqual(["Dam olish kunlari"]);
  });

  it("birlashgan sahifaning ichidagi sozlamani ham topadi: «pauza», «kpi», «hujjat»", () => {
    expect(titles("pauza")).toEqual(["O'quv qoidalari"]);
    expect(titles("kpi")).toEqual(["Lidlar va KPI"]);
    expect(titles("hujjat")).toEqual(["O'quv qoidalari"]);
  });

  it("izoh bo'yicha topadi", () => {
    expect(titles("band qilish")).toEqual(["Lidlar va KPI"]);
  });

  it("apostrof turi farq qilmaydi: «o'quv» va «oʻquv» bir xil", () => {
    expect(titles("o'quv")).toEqual(titles("oʻquv"));
    expect(titles("oquv").length).toBeGreaterThan(0);
  });

  it("bo'lim nomi qidirilmaydi: «telegram» faqat Telegram sahifasini topadi, Arxivni emas", () => {
    expect(titles("telegram")).toEqual(["Telegram"]);
  });

  it("mos kelmagan so'rovda bo'sh ro'yxat", () => {
    expect(titles("zzzxxx")).toEqual([]);
  });

  it("matches the translated name and description; Uzbek keywords still match", () => {
    const ru: Record<string, string> = {
      "Dam olish kunlari": "Выходные дни",
      "Rasmiy bayramlar va dam olish kunlari": "Официальные праздники и выходные дни",
    };
    const translated = (query: string) =>
      filterSettingsSections(settingsNavSections, query, (s) => ru[s] ?? s)
        .flatMap((section) => section.items)
        .map((item) => item.title);
    expect(translated("выходные")).toEqual(["Dam olish kunlari"]);
    expect(translated("праздник")).toEqual(["Dam olish kunlari"]);
    expect(translated("bayram")).toEqual(["Dam olish kunlari"]);
    // The Uzbek name is not searched once a translation replaces it (only keywords are).
    expect(translated("olish kun")).toEqual([]);
  });

  it("qidiruv ruxsatni kengaytirmaydi: administrator CEO punktini topa olmaydi", () => {
    expect(titles("ruxsatlar", [ADMINISTRATOR])).toEqual([]);
    expect(titles("ruxsatlar")).toEqual(["Ruxsatlar"]);
  });
});

describe("settingsSearchPages — umumiy qidiruv uchun", () => {
  const urls = (roles: number[]) =>
    settingsSearchPages(canForRoles(roles), roles.includes(CEO)).map((p) => p.url);

  it("CEO hamma 13 sahifani oladi, administrator faqat o'z 5 tasini", () => {
    expect(urls([CEO])).toHaveLength(13);
    expect(urls([ADMINISTRATOR])).toEqual([
      "/settings/general",
      "/settings/rooms",
      "/settings/holidays",
      "/settings/courses",
      "/settings/reasons",
    ]);
  });

  it("eski, yo'naltirilgan manzillar qidiruvga chiqmaydi", () => {
    expect(urls([CEO])).not.toContain("/settings/absence-pause");
    expect(urls([CEO])).not.toContain("/settings/kpi");
  });
});

describe("normalizeQuery", () => {
  it("harf kattaligi, apostrof va ortiqcha bo'shliqni tozalaydi", () => {
    expect(normalizeQuery("  O'QUV   jarayoni ")).toBe("oquv jarayoni");
  });
});

describe("splitByQuery — nomdagi mos qismni ajratadi", () => {
  it("o'rtadagi qismni match qiladi", () => {
    expect(splitByQuery("Kompaniya ma'lumotlari", "ma'lum")).toEqual([
      { text: "Kompaniya ", match: false },
      { text: "ma'lum", match: true },
      { text: "otlari", match: false },
    ]);
  });

  it("apostrofli matnda belgilar siljimaydi", () => {
    const parts = splitByQuery("O'quv jarayoni", "jarayon");
    expect(parts.map((p) => p.text).join("")).toBe("O'quv jarayoni");
    expect(parts.find((p) => p.match)?.text).toBe("jarayon");
  });

  it("mos kelmasa yoki so'rov bo'sh bo'lsa butun matn", () => {
    expect(splitByQuery("Filiallar", "xyz")).toEqual([{ text: "Filiallar", match: false }]);
    expect(splitByQuery("Filiallar", "")).toEqual([{ text: "Filiallar", match: false }]);
  });
});
