import { describe, expect, it } from "vitest";
import { getVisibleSettingsSections, settingsNavSections } from "./settings-nav";

/**
 * The /settings page renders this list. `visibleForRoles` must match the
 * backend's @Roles(): a link that leads to a 403 is worse than no link. That is
 * why each role's expected list is spelled out here — when you add an item, you
 * decide consciously, in this file too, who gets to see it.
 */

const CEO = 1;
const BRANCH_DIRECTOR = 2;
const ADMINISTRATOR = 3;
const CASHIER = 5;

/** Section title → titles of the items visible in that section. */
function visibleTitles(roleIds: number[]): Record<string, string[]> {
  return Object.fromEntries(
    getVisibleSettingsSections(roleIds).map((section) => [
      section.title,
      section.items.map((item) => item.title),
    ]),
  );
}

describe("getVisibleSettingsSections — /settings da kim nimani ko'radi", () => {
  it("CEO hamma 12 ta punktni ikki bo'limda ko'radi", () => {
    const sections = getVisibleSettingsSections([CEO]);
    expect(sections.map((section) => section.title)).toEqual(["Administratsiya", "CEO"]);
    expect(sections.flatMap((section) => section.items)).toHaveLength(12);
  });

  it("filial direktori 10 ta punktni ko'radi — Arxiv va DaF normasisiz", () => {
    const titles = Object.values(visibleTitles([BRANCH_DIRECTOR])).flat();
    expect(titles).toHaveLength(10);
    expect(titles).not.toContain("Arxiv");
    expect(titles).not.toContain("DaF normasi");
  });

  it("administrator 5 ta punktni ko'radi", () => {
    expect(visibleTitles([ADMINISTRATOR])).toEqual({
      Administratsiya: ["Kurslar", "Xonalar", "Dam olish kunlari", "Sabablar"],
      CEO: ["Kompaniya ma'lumotlari"],
    });
  });

  it("rolsiz foydalanuvchi faqat ochiq punktlarni ko'radi, bo'sh bo'lim chiqmaydi", () => {
    expect(visibleTitles([])).toEqual({
      Administratsiya: ["Kurslar", "Xonalar", "Dam olish kunlari"],
    });
  });

  it("bir nechta rol bo'lsa, ko'rinish rollar birlashmasi", () => {
    // Cashier goes first on purpose: a buggy filter that only looks at the
    // first role returns the cashier's 3 items here and fails.
    expect(visibleTitles([CASHIER, ADMINISTRATOR])).toEqual(visibleTitles([ADMINISTRATOR]));
  });
});

describe("settingsNavSections", () => {
  it("har bir punktda izoh bor — u /settings ro'yxatida nom ostida chiqadi", () => {
    const withoutDescription = settingsNavSections
      .flatMap((section) => section.items)
      .filter((item) => !item.description?.trim())
      .map((item) => item.title);
    expect(withoutDescription).toEqual([]);
  });
});
