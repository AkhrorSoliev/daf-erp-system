import {
  BookOpen,
  DoorOpen,
  CalendarOff,
  PauseCircle,
  Archive,
  Users,
  Building,
  Building2,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

export interface SettingsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
  /** Optional nested sub-items rendered as an inner dropdown in the main sidebar. */
  children?: SettingsNavItem[];
}

interface SettingsNavSection {
  title: string;
  items: SettingsNavItem[];
}

export const settingsNavSections: SettingsNavSection[] = [
  {
    title: "Administratsiya",
    items: [
      { title: "Kurslar", url: "/settings/courses", icon: BookOpen },
      { title: "Xonalar", url: "/settings/rooms", icon: DoorOpen },
      {
        title: "Dam olish kunlari",
        url: "/settings/holidays",
        icon: CalendarOff,
      },
      {
        // O'qish CEO va filial direktoriga; yozish serverda faqat CEO —
        // sozlama butun kompaniyaga taalluqli.
        title: "Avtomatik pauza",
        url: "/settings/absence-pause",
        icon: PauseCircle,
        visibleForRoles: [1, 2],
      },
      {
        title: "Arxiv",
        url: "/settings/archive",
        icon: Archive,
        visibleForRoles: [1],
      },
      { title: "DaF normasi", url: "/settings/daf", icon: Smartphone, visibleForRoles: [1] },
    ],
  },
  {
    title: "CEO",
    items: [
      {
        title: "Kompaniya ma'lumotlari",
        url: "/settings/general",
        icon: Building,
        visibleForRoles: [1, 2, 3],
      },
      {
        title: "Xodimlar",
        url: "/settings/employees",
        icon: Users,
        visibleForRoles: [1, 2],
      },
      {
        title: "Filiallar",
        url: "/settings/branches",
        icon: Building2,
        visibleForRoles: [1, 2],
      },
      {
        title: "Telegram guruhlar",
        url: "/settings/telegram-groups",
        icon: Send,
        visibleForRoles: [1, 2],
      },
    ],
  },
];
