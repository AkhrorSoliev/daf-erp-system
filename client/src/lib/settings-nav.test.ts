import { describe, expect, it } from "vitest";
import {
  canOpenEmployeeSettings,
  canOpenSettingsPath,
  findSettingsItem,
  getVisibleBlocks,
  getVisibleSettingsSections,
  settingsNavSections,
} from "./settings-nav";
import { makeCan } from "./permission-check";
import { PERMISSION_KEYS } from "./permission-keys";
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

/** The parts of a merged page a role sees. */
function blocksOf(url: string, roleIds: number[]): string[] {
  const item = findSettingsItem(url);
  if (!item) throw new Error(`no settings entry for ${url}`);
  return getVisibleBlocks(item, canForRoles(roleIds), roleIds.includes(CEO));
}

describe("getVisibleSettingsSections — /settings da kim nimani ko'radi", () => {
  it("the CEO sees all 14 pages in five topic sections", () => {
    const sections = getVisibleSettingsSections(canForRoles([CEO]), true);
    expect(sections.map((section) => section.title)).toEqual([
      "Markaz",
      "Jamoa va ruxsatlar",
      "O'quv jarayoni",
      "To'lov va lidlar",
      "Telegram va arxiv",
    ]);
    expect(sections.flatMap((section) => section.items)).toHaveLength(14);
  });

  it("no section is named after a role: every viewer meets only topic headings", () => {
    const topics = settingsNavSections.map((section) => section.title);
    expect(topics).not.toContain("CEO");
    expect(topics).not.toContain("Administratsiya");
  });

  it("filial direktori 10 ta sahifani ko'radi — Arxivsiz, Lidlar va KPIsiz", () => {
    const titles = Object.values(visibleTitles([BRANCH_DIRECTOR])).flat();
    expect(titles).toEqual([
      "Kompaniya ma'lumotlari",
      "Filiallar",
      "Xonalar",
      "Dam olish kunlari",
      "Xodimlar",
      "Kurslar",
      "Sabablar",
      "O'quv qoidalari",
      "To'lov",
      "Telegram",
    ]);
  });

  it("administrator 5 ta sahifani ko'radi", () => {
    expect(visibleTitles([ADMINISTRATOR])).toEqual({
      Markaz: ["Kompaniya ma'lumotlari", "Xonalar", "Dam olish kunlari"],
      "O'quv jarayoni": ["Kurslar", "Sabablar"],
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

describe("birlashtirilgan sahifalar: qismlar o'z eshigini saqlaydi", () => {
  it("«O'quv qoidalari»: CEO uchala qismni, filial direktori faqat pauzani, administrator hech narsani ko'rmaydi", () => {
    expect(blocksOf("/settings/rules", [CEO])).toEqual(["pauza", "daf", "hujjat"]);
    expect(blocksOf("/settings/rules", [BRANCH_DIRECTOR])).toEqual(["pauza"]);
    expect(blocksOf("/settings/rules", [ADMINISTRATOR])).toEqual([]);
  });

  it("«Telegram»: guruhlar — imkoniyat bilan, hisobot — faqat CEO", () => {
    expect(blocksOf("/settings/telegram", [CEO])).toEqual(["guruhlar", "hisobot"]);
    expect(blocksOf("/settings/telegram", [BRANCH_DIRECTOR])).toEqual(["guruhlar"]);
    expect(blocksOf("/settings/telegram", [ADMINISTRATOR])).toEqual([]);
  });

  it("«Lidlar va KPI»: ikkala qism ham faqat CEO uchun", () => {
    expect(blocksOf("/settings/leads-kpi", [CEO])).toEqual(["lidlar", "kpi"]);
    expect(blocksOf("/settings/leads-kpi", [BRANCH_DIRECTOR])).toEqual([]);
  });

  it("CEO-only qismni hech qaysi imkoniyat ochmaydi, hatto hammasiga ega bo'lsa ham", () => {
    const everyKey = makeCan(new Set(PERMISSION_KEYS));
    for (const url of ["/settings/rules", "/settings/telegram", "/settings/leads-kpi"]) {
      const item = findSettingsItem(url)!;
      const ceoOnlyIds = item.blocks!.filter((b) => b.ceoOnly).map((b) => b.id);
      const seen = getVisibleBlocks(item, everyKey, false);
      for (const id of ceoOnlyIds) expect(seen).not.toContain(id);
    }
  });

  it("sahifa URL bilan ham faqat ko'ra oladiganga ochiladi", () => {
    const bd = canForRoles([BRANCH_DIRECTOR]);
    expect(canOpenSettingsPath("/settings/leads-kpi", bd, false)).toBe(false);
    expect(canOpenSettingsPath("/settings/rules", bd, false)).toBe(true);
    expect(canOpenSettingsPath("/settings/telegram", bd, false)).toBe(true);
    expect(canOpenSettingsPath("/settings/rules", canForRoles([ADMINISTRATOR]), false)).toBe(false);
    expect(canOpenSettingsPath("/settings/leads-kpi", canForRoles([CEO]), true)).toBe(true);
  });

  it("eski manzillar hech bir sahifaga tegishli emas: ular yo'naltirish sahifalari", () => {
    for (const old of [
      "/settings/absence-pause",
      "/settings/daf",
      "/settings/participation",
      "/settings/lead-ownership",
      "/settings/kpi",
      "/settings/telegram-groups",
      "/settings/telegram-report",
    ]) {
      expect(settingsNavSections.flatMap((s) => s.items).some((i) => i.url === old)).toBe(false);
    }
  });

  it("birlashgan sahifada `permission` yoki `ceoOnly` yo'q — eshik faqat qismlarda", () => {
    for (const item of settingsNavSections.flatMap((s) => s.items).filter((i) => i.blocks)) {
      expect(item.permission, item.title).toBeUndefined();
      expect(item.ceoOnly, item.title).toBeUndefined();
    }
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

  it("«Soliq va komissiyalar» (/settings/tax) — standart bo'yicha faqat CEO uchun, boshqalar URL bilan ham kirmaydi", () => {
    expect(canOpenSettingsPath("/settings/tax", canForRoles([CEO]), true)).toBe(true);
    for (const role of [BRANCH_DIRECTOR, ADMINISTRATOR, CASHIER, TEACHER]) {
      expect(canOpenSettingsPath("/settings/tax", canForRoles([role]))).toBe(false);
    }
    expect(findSettingsItem("/settings/tax")?.permission).toBe("settings.tax");
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

describe("«Ruxsatlar» — the CEO's page, never a capability (ADR-0087)", () => {
  const PATH = "/settings/permissions";
  const everyKey = makeCan(new Set(PERMISSION_KEYS));
  const urls = (sections: ReturnType<typeof getVisibleSettingsSections>) =>
    sections.flatMap((section) => section.items.map((item) => item.url));

  it("the CEO sees it in «Jamoa va ruxsatlar»", () => {
    const section = getVisibleSettingsSections(canForRoles([CEO]), true).find(
      (s) => s.title === "Jamoa va ruxsatlar",
    );
    expect(section?.items.map((item) => item.url)).toContain(PATH);
  });

  it("no other role sees it, not even one holding every capability", () => {
    for (const roleIds of [[BRANCH_DIRECTOR], [ADMINISTRATOR], [CASHIER], [TEACHER], []]) {
      expect(urls(getVisibleSettingsSections(canForRoles(roleIds), false))).not.toContain(PATH);
    }
    expect(urls(getVisibleSettingsSections(everyKey))).not.toContain(PATH);
  });

  it("the URL opens only for the CEO; capabilities do not open it", () => {
    expect(canOpenSettingsPath(PATH, everyKey, false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([BRANCH_DIRECTOR]), false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([CEO]), true)).toBe(true);
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

  it("har bir bo'limda izoh va belgi bor, va har sahifa faqat bitta bo'limda", () => {
    for (const section of settingsNavSections) {
      expect(section.summary.trim(), section.title).not.toBe("");
      expect(section.icon, section.title).toBeDefined();
    }
    const urls = settingsNavSections.flatMap((s) => s.items.map((i) => i.url));
    expect(new Set(urls).size).toBe(urls.length);
  });
});
