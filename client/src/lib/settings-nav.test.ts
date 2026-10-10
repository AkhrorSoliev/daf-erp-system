import { describe, expect, it } from "vitest";
import {
  canOpenEmployeeSettings,
  canOpenSettingsPath,
  getVisibleSettingsSections,
  settingsNavSections,
} from "./settings-nav";
import { canForRoles } from "@/test-support/server-catalog";

/**
 * The /settings page renders this list. `permission` must match the capability
 * the page's endpoints check: a link that leads to a 403 is worse than no link.
 * That is why each role's expected list is spelled out here — when you add an
 * item, you decide consciously, in this file too, who gets to see it.
 */

const CEO = 1;
const BRANCH_DIRECTOR = 2;
const ADMINISTRATOR = 3;
const TEACHER = 4;
const CASHIER = 5;

/** Section title → titles of the items visible in that section. */
function visibleTitles(roleIds: number[]): Record<string, string[]> {
  return Object.fromEntries(
    getVisibleSettingsSections(canForRoles(roleIds)).map((section) => [
      section.title,
      section.items.map((item) => item.title),
    ]),
  );
}

describe("getVisibleSettingsSections — /settings da kim nimani ko'radi", () => {
  it("CEO hamma 12 ta punktni ikki bo'limda ko'radi", () => {
    const sections = getVisibleSettingsSections(canForRoles([CEO]));
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

  it("kassir, o'qituvchi va rolsiz foydalanuvchi hech narsa ko'rmaydi, bo'sh bo'lim chiqmaydi", () => {
    // Kurslar, Xonalar and Dam olish kunlari are edit pages whose writes are
    // CEO/BD/Administrator only: a cashier there met buttons that all 403.
    expect(visibleTitles([CASHIER])).toEqual({});
    expect(visibleTitles([TEACHER])).toEqual({});
    expect(visibleTitles([])).toEqual({});
  });

  it("bir nechta rol bo'lsa, ko'rinish rollar birlashmasi", () => {
    // Cashier goes first on purpose: a buggy filter that only looks at the
    // first role returns the cashier's empty list here and fails.
    expect(visibleTitles([CASHIER, ADMINISTRATOR])).toEqual(visibleTitles([ADMINISTRATOR]));
  });
});

describe("canOpenEmployeeSettings", () => {
  it("opens an employee's page to the CEO and a Branch Director", () => {
    expect(canOpenEmployeeSettings(canForRoles([CEO]))).toBe(true);
    expect(canOpenEmployeeSettings(canForRoles([BRANCH_DIRECTOR]))).toBe(true);
    expect(canOpenEmployeeSettings(canForRoles([ADMINISTRATOR, BRANCH_DIRECTOR]))).toBe(true);
  });

  it("keeps it closed to anyone else: SettingsLayoutShell or the API sends them back", () => {
    expect(canOpenEmployeeSettings(canForRoles([ADMINISTRATOR]))).toBe(false);
    expect(canOpenEmployeeSettings(canForRoles([TEACHER]))).toBe(false);
    expect(canOpenEmployeeSettings(canForRoles([ADMINISTRATOR, TEACHER]))).toBe(false);
    expect(canOpenEmployeeSettings(canForRoles([CASHIER]))).toBe(false);
    expect(canOpenEmployeeSettings(canForRoles([]))).toBe(false);
  });
});

describe("canOpenSettingsPath — SettingsLayoutShell shu qoida bilan qaytaradi", () => {
  it("ro'yxatda ko'rinmagan sahifa URL bilan ham ochilmaydi", () => {
    expect(canOpenSettingsPath("/settings/holidays", canForRoles([CASHIER]))).toBe(false);
    expect(canOpenSettingsPath("/settings/courses/42", canForRoles([CASHIER]))).toBe(false);
    expect(canOpenSettingsPath("/settings/rooms", canForRoles([TEACHER]))).toBe(false);
    expect(canOpenSettingsPath("/settings/employees/10042", canForRoles([ADMINISTRATOR]))).toBe(false);
    expect(canOpenSettingsPath("/settings/payment", canForRoles([ADMINISTRATOR]))).toBe(false);
    expect(canOpenSettingsPath("/settings/archive", canForRoles([BRANCH_DIRECTOR]))).toBe(false);
  });

  it("ko'rinadigan sahifa va uning ichki sahifalari ochiladi", () => {
    expect(canOpenSettingsPath("/settings/holidays", canForRoles([ADMINISTRATOR]))).toBe(true);
    expect(canOpenSettingsPath("/settings/courses/42", canForRoles([CASHIER, ADMINISTRATOR]))).toBe(true);
    expect(canOpenSettingsPath("/settings/employees/10042", canForRoles([BRANCH_DIRECTOR]))).toBe(true);
    expect(canOpenSettingsPath("/settings/archive", canForRoles([CEO]))).toBe(true);
  });

  it("faqat butun yo'l bo'lagi mos keladi", () => {
    // "/settings/generalx" is not under "/settings/general".
    expect(canOpenSettingsPath("/settings/generalx", canForRoles([CASHIER]))).toBe(true);
    expect(canOpenSettingsPath("/settings", canForRoles([CASHIER]))).toBe(true);
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
