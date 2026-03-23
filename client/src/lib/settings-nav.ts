import {
  BookOpen,
  DoorOpen,
  CalendarOff,
  Archive,
  UserMinus,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface SettingsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export interface SettingsNavSection {
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
      { title: "Umumiy sozlamalar", url: "/settings/general", icon: Settings },
      { title: "Xodimlar", url: "/settings/employees", icon: Users },
    ],
  },
];
