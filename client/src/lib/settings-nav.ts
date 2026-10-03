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
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
}

export interface SettingsNavSection {
  title: string;
  items: SettingsNavItem[];
}

export const settingsNavSections: SettingsNavSection[] = [
  {
    title: "Administratsiya",
    items: [
      // Kurslar, Xonalar, Dam olish kunlari: backend writes are
      // @Roles('CEO', 'Branch Director', 'Administrator') (adding a course is
      // CEO/BD only, and the page hides that button). The reads are open to
      // all staff, but these pages exist to edit — a cashier on them saw
      // add/edit/delete buttons that all answered 403.
      {
        title: "Kurslar",
        url: "/settings/courses",
        icon: BookOpen,
        description: "Kurslarni boshqarish va yangi kurs qo'shish",
        visibleForRoles: [1, 2, 3],
      },
      {
        title: "Xonalar",
        url: "/settings/rooms",
        icon: DoorOpen,
        description: "Filiallardagi xonalarni boshqarish",
        visibleForRoles: [1, 2, 3],
      },
      {
        title: "Dam olish kunlari",
        url: "/settings/holidays",
        icon: CalendarOff,
        description: "Rasmiy bayramlar va dam olish kunlari",
        visibleForRoles: [1, 2, 3],
      },
      {
        // Backend: /student-exit-reasons, /enrollment-transfer-reasons,
        // /group-teacher-change-reasons — @Roles('CEO', 'Branch Director',
        // 'Administrator'). visibleForRoles shu qamrovga ANIQ mos: 403ga
        // olib boradigan havola havolaning yo'qligidan yomonroq.
        title: "Sabablar",
        url: "/settings/reasons",
        icon: ListChecks,
        description: "Guruhdan chiqarish, o'tkazish va ustoz almashish sabablari",
        visibleForRoles: [1, 2, 3],
      },
      {
        // O'qish CEO va filial direktoriga; yozish serverda faqat CEO —
        // sozlama butun kompaniyaga taalluqli.
        title: "Avtomatik pauza",
        url: "/settings/absence-pause",
        icon: PauseCircle,
        description: "Ketma-ket dars qoldirgan o'quvchini pauzaga o'tkazish",
        visibleForRoles: [1, 2],
      },
      {
        title: "Arxiv",
        url: "/settings/archive",
        icon: Archive,
        description: "O'chirilgan ma'lumotlar",
        visibleForRoles: [1],
      },
      {
        title: "DaF normasi",
        url: "/settings/daf",
        icon: Smartphone,
        description: "O'quvchi ilovada qancha ishlashi kerakligi",
        visibleForRoles: [1],
      },
    ],
  },
  {
    title: "CEO",
    items: [
      {
        title: "Kompaniya ma'lumotlari",
        url: "/settings/general",
        icon: Building,
        description: "Kompaniya nomi, telefon va asosiy ma'lumotlar",
        visibleForRoles: [1, 2, 3],
      },
      {
        title: "Xodimlar",
        url: "/settings/employees",
        icon: Users,
        description: "Xodimlarni boshqarish va rollarni belgilash",
        visibleForRoles: [1, 2],
      },
      {
        title: "Filiallar",
        url: "/settings/branches",
        icon: Building2,
        description: "Filiallarni boshqarish va yangi filial qo'shish",
        visibleForRoles: [1, 2],
      },
      {
        title: "Telegram guruhlar",
        url: "/settings/telegram-groups",
        icon: Send,
        description: "Botga ulangan Telegram guruhlar",
        visibleForRoles: [1, 2],
      },
      {
        // Backend: GET/PATCH /settings/payment — @Roles('CEO', 'Branch
        // Director'). visibleForRoles quyida shu qamrovga ANIQ mos —
        // 403ga olib boradigan havola havolaning yo'qligidan yomonroq.
        title: "To'lov",
        url: "/settings/payment",
        icon: Wallet,
        description: "Kurs to'lov modeli va hisob-kitob qoidalari",
        visibleForRoles: [1, 2],
      },
    ],
  },
];

/**
 * Sections of /settings visible to a user with the given role IDs. An item
 * without `visibleForRoles` is visible to everyone; a section left with no
 * visible items is dropped.
 */
export function getVisibleSettingsSections(roleIds: number[]): SettingsNavSection[] {
  return settingsNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          !item.visibleForRoles || item.visibleForRoles.some((id) => roleIds.includes(id)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Whether these roles may open a /settings page or a page under it: the roles
 * its entry is shown to. SettingsLayoutShell sends anyone else back, so a typed
 * URL meets the same rule as the list. A path no entry owns is not restricted.
 */
export function canOpenSettingsPath(pathname: string, roleIds: number[]): boolean {
  const item = settingsNavSections
    .flatMap((section) => section.items)
    .find((entry) => pathname === entry.url || pathname.startsWith(`${entry.url}/`));
  return !item?.visibleForRoles || item.visibleForRoles.some((id) => roleIds.includes(id));
}

/**
 * Whether these roles can open an employee's page, /settings/employees/<id>:
 * the roles the "Xodimlar" entry is shown to. Anyone else is sent back by
 * SettingsLayoutShell or refused by the API, so a link there for them only
 * bounces.
 */
export function canOpenEmployeeSettings(roleIds: number[]): boolean {
  return getVisibleSettingsSections(roleIds).some((section) =>
    section.items.some((item) => item.url === "/settings/employees"),
  );
}
