import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  UserPlus,
  CalendarDays,
  DollarSign,
  BarChart3,
  Settings,
  UsersRound,
  ListTodo,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
}

export const navItems: NavItem[] = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap, visibleForRoles: [1, 2, 3] },
  { title: "O'quvchilar", url: "/students", icon: BookOpen, visibleForRoles: [1, 2, 3] },
  { title: "Lidlar", url: "/leads", icon: UserPlus, visibleForRoles: [1, 2, 3] },
  { title: "Guruhlar", url: "/groups", icon: UsersRound },
  { title: "Topshiriqlar", url: "/tasks", icon: ListTodo },
  { title: "Dars jadvali", url: "/schedule", icon: CalendarDays },
  { title: "Moliya", url: "/payments", icon: DollarSign, visibleForRoles: [1, 2, 3, 5] },
  { title: "Hisobotlar", url: "/reports", icon: BarChart3, visibleForRoles: [1, 2] },
  { title: "Sozlamalar", url: "/settings", icon: Settings, visibleForRoles: [1, 2, 3] },
];
