import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  UserPlus,
  CalendarDays,
  CreditCard,
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
  hideForTeacher?: boolean;
}

export const navItems: NavItem[] = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap, hideForTeacher: true },
  { title: "O'quvchilar", url: "/students", icon: BookOpen },
  { title: "Lidlar", url: "/leads", icon: UserPlus, hideForTeacher: true },
  { title: "Guruhlar", url: "/groups", icon: UsersRound },
  { title: "Topshiriqlar", url: "/tasks", icon: ListTodo },
  { title: "Dars jadvali", url: "/schedule", icon: CalendarDays },
  { title: "To'lovlar", url: "/payments", icon: CreditCard, hideForTeacher: true },
  { title: "Hisobotlar", url: "/reports", icon: BarChart3, hideForTeacher: true },
  { title: "Sozlamalar", url: "/settings", icon: Settings, hideForTeacher: true },
];
