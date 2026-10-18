import {
  BookOpen,
  DoorOpen,
  CalendarOff,
  ListChecks,
  Archive,
  Users,
  Building,
  Building2,
  Send,
  Wallet,
  ShieldCheck,
  UserCheck,
  Scale,
  Landmark,
  UsersRound,
  GraduationCap,
  Banknote,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import type { Can } from "./permission-check";
import type { PermissionKey } from "./permission-keys";

// Single source for the /settings list. The sidebar "Sozlamalar" item is not a
// dropdown but a plain link to that page: a new settings page is registered
// here (not in the sidebar) and appears on /settings automatically. Its
// breadcrumb label is separate — add it to src/lib/breadcrumb-routes.ts.
//
// Sections group pages by TOPIC, never by who sees them: a Branch Director or
// an Administrator must not meet a heading named after another role.

/**
 * One part of a page that gathers several small settings («O'quv qoidalari»,
 * «Lidlar va KPI», «Telegram»). Each part keeps the gate its own endpoints
 * have, so merging pages never widens who may change what.
 */
export interface SettingsBlock {
  id: string;
  permission?: PermissionKey;
  /** Identity, not a capability: see `SettingsNavItem.ceoOnly`. */
  ceoOnly?: true;
}

export interface SettingsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** One-line summary shown under the title in the /settings list. */
  description: string;
  /** Extra words the /settings search matches (what people call it). */
  keywords?: string[];
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
  /**
   * Only the CEO sees and opens it — an identity, never a capability (the
   * API is `@CeoOnly()`, ADR-0087). Such an item has no `permission`.
   */
  ceoOnly?: true;
  /**
   * A page made of parts. It shows (and opens) for whoever may see at least
   * one part, and draws only those parts. Such an item has neither
   * `permission` nor `ceoOnly` of its own.
   */
  blocks?: SettingsBlock[];
}

export interface SettingsNavSection {
  title: string;
  /** Small mark beside the title: the eye finds a topic before it reads. */
  icon: LucideIcon;
  /** What the section is about, in a few words, under its title. */
  summary: string;
  items: SettingsNavItem[];
}

export const settingsNavSections: SettingsNavSection[] = [
  {
    title: "Markaz",
    icon: Landmark,
    summary: "Kompaniya, filiallar, xonalar va bayramlar",
    items: [
      // Shown to everyone who sees the reference pages; the form inside
      // edits only for a holder of `settings.company`.
      {
        title: "Kompaniya ma'lumotlari",
        url: "/settings/general",
        icon: Building,
        description: "Kompaniya nomi, telefon va asosiy ma'lumotlar",
        keywords: ["nom", "telefon", "umumiy", "markaz"],
        permission: "settings.reference",
      },
      {
        title: "Filiallar",
        url: "/settings/branches",
        icon: Building2,
        description: "Filiallarni boshqarish va yangi filial qo'shish",
        keywords: ["filial", "yangi filial", "manzil"],
        permission: "settings.branches",
      },
      // Kurslar, Xonalar, Dam olish kunlari: the reads are open to all staff,
      // but these pages exist to edit — a cashier on them saw add/edit/delete
      // buttons that all answered 403. `settings.reference` is the capability
      // the writes check.
      {
        title: "Xonalar",
        url: "/settings/rooms",
        icon: DoorOpen,
        description: "Filiallardagi xonalarni boshqarish",
        keywords: ["xona", "sinf", "sig'im"],
        permission: "settings.reference",
      },
      {
        title: "Dam olish kunlari",
        url: "/settings/holidays",
        icon: CalendarOff,
        description: "Rasmiy bayramlar va dam olish kunlari",
        keywords: ["bayram", "dam olish", "ta'til"],
        permission: "settings.reference",
      },
    ],
  },
  {
    title: "Jamoa va ruxsatlar",
    icon: UsersRound,
    summary: "Xodimlar va ularning imkoniyatlari",
    items: [
      {
        title: "Xodimlar",
        url: "/settings/employees",
        icon: Users,
        description: "Xodimlarni boshqarish va rollarni belgilash",
        keywords: ["xodim", "ustoz", "administrator", "kassir", "rol", "parol"],
        permission: "employees.view",
      },
      {
        title: "Ruxsatlar",
        url: "/settings/permissions",
        icon: ShieldCheck,
        description: "Har bir rol uchun imkoniyatlarni yoqish va o'chirish",
        keywords: ["huquq", "rol", "imkoniyat"],
        ceoOnly: true,
      },
    ],
  },
  {
    title: "O'quv jarayoni",
    icon: GraduationCap,
    summary: "Kurslar, sabablar va o'quvchiga qo'yiladigan talablar",
    items: [
      {
        title: "Kurslar",
        url: "/settings/courses",
        icon: BookOpen,
        description: "Kurslarni boshqarish va yangi kurs qo'shish",
        keywords: ["kurs", "narx", "daraja"],
        permission: "settings.reference",
      },
      {
        // The writes of the student-exit, enrollment-transfer and
        // group-teacher-change reason endpoints check `settings.reference`;
        // the gate matches them exactly — a link that ends in a 403 is worse
        // than no link.
        title: "Sabablar",
        url: "/settings/reasons",
        icon: ListChecks,
        description: "Guruhdan chiqarish, o'tkazish va ustoz almashish sabablari",
        keywords: ["sabab", "chiqarish", "o'tkazish"],
        permission: "settings.reference",
      },
      {
        // Three small settings on one page. Avtomatik pauza: the CEO and a
        // Branch Director read it, only the CEO writes. DaF normasi:
        // `settings.company`. Qatnashganlik hujjati: every route is
        // `@CeoOnly()` (spec 2026-10-17).
        title: "O'quv qoidalari",
        url: "/settings/rules",
        icon: Scale,
        description: "Avtomatik pauza, DaF normasi va qatnashganlik hujjati chegaralari",
        keywords: [
          "pauza",
          "davomat",
          "dars qoldirish",
          "ogohlantirish",
          "ilova",
          "norma",
          "daf",
          "vaqt",
          "savol",
          "teilnahmebestätigung",
          "sertifikat",
          "hujjat",
          "chegara",
        ],
        blocks: [
          { id: "pauza", permission: "settings.absence-pause" },
          { id: "daf", permission: "settings.company" },
          { id: "hujjat", ceoOnly: true },
        ],
      },
    ],
  },
  {
    title: "To'lov va lidlar",
    icon: Banknote,
    summary: "Pul qoidalari, lidlar va KPI",
    items: [
      {
        // GET/PATCH /settings/payment check `settings.payment`; the gate
        // matches it exactly — a link that ends in a 403 is worse than no link.
        title: "To'lov",
        url: "/settings/payment",
        icon: Wallet,
        description: "Kurs to'lov modeli va hisob-kitob qoidalari",
        keywords: ["pul", "model", "oylik to'lov", "qarz", "hisob-kitob"],
        permission: "settings.payment",
      },
      {
        // Both writes are `@CeoOnly()` (ADR-0093, ADR-0096): identity, not a
        // capability.
        title: "Lidlar va KPI",
        url: "/settings/leads-kpi",
        icon: UserCheck,
        description: "Lidni band qilish muddatlari va KPI narxlari",
        keywords: ["lid", "band qilish", "muddat", "mas'ul", "kpi", "mukofot", "bonus", "narx"],
        blocks: [
          { id: "lidlar", ceoOnly: true },
          { id: "kpi", ceoOnly: true },
        ],
      },
    ],
  },
  {
    title: "Telegram va arxiv",
    icon: MessagesSquare,
    summary: "Bot ulanishlari, hisobotlar va o'chirilgan ma'lumotlar",
    items: [
      {
        // Guruhlar: `settings.telegram-groups`. Hisobot: every route is
        // `@CeoOnly()` (ADR-0095).
        title: "Telegram",
        url: "/settings/telegram",
        icon: Send,
        description: "Botga ulangan guruhlar va kunlik hisobot qabul qiluvchilar",
        keywords: ["telegram", "bot", "guruh", "kunlik hisobot", "chat", "qabul qiluvchi"],
        blocks: [
          { id: "guruhlar", permission: "settings.telegram-groups" },
          { id: "hisobot", ceoOnly: true },
        ],
      },
      {
        title: "Arxiv",
        url: "/settings/archive",
        icon: Archive,
        description: "O'chirilgan ma'lumotlar",
        keywords: ["o'chirilgan", "tiklash", "arxiv"],
        permission: "settings.archive",
      },
    ],
  },
];

function gateOpens(
  gate: { permission?: PermissionKey; ceoOnly?: true },
  can: Can,
  isCeo: boolean,
): boolean {
  if (gate.ceoOnly) return isCeo;
  return !gate.permission || can(gate.permission);
}

/** The entry that owns this exact page url. */
export function findSettingsItem(url: string): SettingsNavItem | undefined {
  return settingsNavSections.flatMap((s) => s.items).find((item) => item.url === url);
}

/** The parts of a merged page this user may see, in page order. */
export function getVisibleBlocks(item: SettingsNavItem, can: Can, isCeo = false): string[] {
  return (item.blocks ?? []).filter((b) => gateOpens(b, can, isCeo)).map((b) => b.id);
}

/** One rule for the list and the URL: a CEO-only item for the CEO, else its capability. */
function isVisible(item: SettingsNavItem, can: Can, isCeo: boolean): boolean {
  if (item.blocks) return getVisibleBlocks(item, can, isCeo).length > 0;
  return gateOpens(item, can, isCeo);
}

/** Sections of /settings this user sees; a section with nothing visible is dropped. */
export function getVisibleSettingsSections(can: Can, isCeo = false): SettingsNavSection[] {
  return settingsNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isVisible(item, can, isCeo)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * May the user open a /settings page or a page under it: the entry's gate.
 * SettingsLayoutShell sends anyone else back. A path no entry owns is open.
 */
export function canOpenSettingsPath(pathname: string, can: Can, isCeo = false): boolean {
  const item = settingsNavSections
    .flatMap((section) => section.items)
    .find((entry) => pathname === entry.url || pathname.startsWith(`${entry.url}/`));
  return !item || isVisible(item, can, isCeo);
}

/** May the user open an employee's page, /settings/employees/<id>. */
export function canOpenEmployeeSettings(can: Can): boolean {
  return can("employees.view");
}

/** Every capability that shows some /settings entry — the sidebar item's gate. */
export const SETTINGS_PERMISSIONS: PermissionKey[] = [
  ...new Set(
    settingsNavSections
      .flatMap((s) => s.items)
      .flatMap((i) => [i.permission, ...(i.blocks ?? []).map((b) => b.permission)])
      .filter((p): p is PermissionKey => p !== undefined),
  ),
];
