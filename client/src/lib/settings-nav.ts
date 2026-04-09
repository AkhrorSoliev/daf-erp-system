import {
  BookOpen,
  DoorOpen,
  CalendarOff,
  Archive,
  UserMinus,
  Settings,
  Users,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface SettingsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
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
      { title: "Dam olish kunlari", url: "/settings/holidays", icon: CalendarOff },
      { title: "Arxiv", url: "/settings/archive", icon: Archive },
      {
        title: "Guruhni tark etganlar",
        url: "/settings/left-students",
        icon: UserMinus,
      },
    ],
  },
  {
    title: "CEO",
    items: [
      { title: "Umumiy sozlamalar", url: "/settings/general", icon: Settings, visibleForRoles: [1, 2, 3] },
      { title: "Xodimlar", url: "/settings/employees", icon: Users, visibleForRoles: [1, 2] },
      { title: "Filiallar", url: "/settings/branches", icon: Building2, visibleForRoles: [1, 2] },
    ],
  },
];
