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
} from "lucide-react";

export const navItems = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap },
  { title: "O'quvchilar", url: "/students", icon: BookOpen },
  { title: "Lidlar", url: "/leads", icon: UserPlus },
  { title: "Guruhlar", url: "/groups", icon: UsersRound },
  { title: "Dars jadvali", url: "/schedule", icon: CalendarDays },
  { title: "To'lovlar", url: "/payments", icon: CreditCard },
  { title: "Hisobotlar", url: "/reports", icon: BarChart3 },
  { title: "Sozlamalar", url: "/settings", icon: Settings },
];
