import {
  Receipt,
  Wallet,
  UserMinus,
  UserPlus,
  GraduationCap,
  Activity,
  CalendarCheck,
  Send,
  type LucideIcon,
} from "lucide-react";

export interface ReportsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
}

interface ReportsNavSection {
  title: string;
  items: ReportsNavItem[];
}

export const reportsNavSections: ReportsNavSection[] = [
  {
    title: "Moliyaviy hisobotlar",
    items: [
      { title: "To'lov hisobotlari", url: "/reports/payment-reports", icon: Receipt },
      { title: "O'quvchi to'lovi", url: "/reports/student-payments", icon: Wallet },
    ],
  },
  {
    title: "O'quvchilar hisoboti",
    items: [
      { title: "Ketgan o'quvchilar hisoboti", url: "/reports/departed-students", icon: UserMinus },
      { title: "Bitiruvchilar", url: "/reports/graduates", icon: GraduationCap },
    ],
  },
  {
    title: "Marketing va faoliyat",
    items: [
      { title: "Lidlar hisoboti", url: "/reports/leads", icon: UserPlus },
      { title: "Markaz faoliyat statistikasi", url: "/reports/activity", icon: Activity },
      { title: "Davomat statistikasi", url: "/reports/attendance", icon: CalendarCheck },
      { title: "Bot hisoboti", url: "/reports/bot", icon: Send },
    ],
  },
];
