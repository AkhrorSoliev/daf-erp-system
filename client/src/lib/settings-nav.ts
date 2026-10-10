import {
  BookOpen,
  DoorOpen,
  CalendarOff,
  PauseCircle,
  ListChecks,
  Archive,
  Users,
  Building,
  Building2,
  Send,
  Wallet,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { Can } from "./permission-check";
import type { PermissionKey } from "./permission-keys";

// Single source for the /settings list. The sidebar "Sozlamalar" item is not a
// dropdown but a plain link to that page: a new settings page is registered
// here (not in the sidebar) and appears on /settings automatically. Its
// breadcrumb label is separate — add it to src/lib/breadcrumb-routes.ts.

export interface SettingsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** One-line summary shown under the title in the /settings list. */
  description: string;
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
}

export interface SettingsNavSection {
  title: string;
  items: SettingsNavItem[];
}

export const settingsNavSections: SettingsNavSection[] = [
  {
    title: "Administratsiya",
    items: [
      // Kurslar, Xonalar, Dam olish kunlari: the reads are open to all staff,
      // but these pages exist to edit — a cashier on them saw add/edit/delete
      // buttons that all answered 403. `settings.reference` is the capability
      // the writes check.
      {
        title: "Kurslar",
        url: "/settings/courses",
        icon: BookOpen,
        description: "Kurslarni boshqarish va yangi kurs qo'shish",
        permission: "settings.reference",
      },
      {
        title: "Xonalar",
        url: "/settings/rooms",
        icon: DoorOpen,
        description: "Filiallardagi xonalarni boshqarish",
        permission: "settings.reference",
      },
      {
        title: "Dam olish kunlari",
        url: "/settings/holidays",
        icon: CalendarOff,
        description: "Rasmiy bayramlar va dam olish kunlari",
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
        permission: "settings.reference",
      },
      {
        // The CEO and a Branch Director read it; only the CEO writes — the
        // setting belongs to the whole company.
        title: "Avtomatik pauza",
        url: "/settings/absence-pause",
        icon: PauseCircle,
        description: "Ketma-ket dars qoldirgan o'quvchini pauzaga o'tkazish",
        permission: "settings.absence-pause",
      },
      {
        title: "Arxiv",
        url: "/settings/archive",
        icon: Archive,
        description: "O'chirilgan ma'lumotlar",
        permission: "settings.archive",
      },
      {
        title: "DaF normasi",
        url: "/settings/daf",
        icon: Smartphone,
        description: "O'quvchi ilovada qancha ishlashi kerakligi",
        permission: "settings.company",
      },
    ],
  },
  {
    title: "CEO",
    items: [
      {
        // Shown to everyone who sees the reference pages; the form inside
        // edits only for a holder of `settings.company`.
        title: "Kompaniya ma'lumotlari",
        url: "/settings/general",
        icon: Building,
        description: "Kompaniya nomi, telefon va asosiy ma'lumotlar",
        permission: "settings.reference",
      },
      {
        title: "Xodimlar",
        url: "/settings/employees",
        icon: Users,
        description: "Xodimlarni boshqarish va rollarni belgilash",
        permission: "employees.view",
      },
      {
        title: "Filiallar",
        url: "/settings/branches",
        icon: Building2,
        description: "Filiallarni boshqarish va yangi filial qo'shish",
        permission: "settings.branches",
      },
      {
        title: "Telegram guruhlar",
        url: "/settings/telegram-groups",
        icon: Send,
        description: "Botga ulangan Telegram guruhlar",
        permission: "settings.telegram-groups",
      },
      {
        // GET/PATCH /settings/payment check `settings.payment`; the gate
        // matches it exactly — a link that ends in a 403 is worse than no link.
        title: "To'lov",
        url: "/settings/payment",
        icon: Wallet,
        description: "Kurs to'lov modeli va hisob-kitob qoidalari",
        permission: "settings.payment",
      },
    ],
  },
];

/** Sections of /settings this user sees; a section with nothing visible is dropped. */
export function getVisibleSettingsSections(can: Can): SettingsNavSection[] {
  return settingsNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * May the user open a /settings page or a page under it: the entry's gate.
 * SettingsLayoutShell sends anyone else back. A path no entry owns is open.
 */
export function canOpenSettingsPath(pathname: string, can: Can): boolean {
  const item = settingsNavSections
    .flatMap((section) => section.items)
    .find((entry) => pathname === entry.url || pathname.startsWith(`${entry.url}/`));
  return !item?.permission || can(item.permission);
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
      .map((i) => i.permission)
      .filter((p): p is PermissionKey => p !== undefined),
  ),
];
