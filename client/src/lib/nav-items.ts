import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  UserPlus,
  Building2,
  CalendarDays,
  CreditCard,
  BarChart3,
  Settings,
  UsersRound,
} from "lucide-react";

export const navItems = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  { title: "Xodimlar", url: "/staff", icon: Users },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap },
  { title: "O'quvchilar", url: "/students", icon: BookOpen },
  { title: "Lidlar", url: "/leads", icon: UserPlus },
  { title: "Guruhlar", url: "/groups", icon: UsersRound },
  { title: "Filiallar", url: "/branches", icon: Building2 },
  { title: "Dars jadvali", url: "/schedule", icon: CalendarDays },
  { title: "To'lovlar", url: "/payments", icon: CreditCard },
  { title: "Hisobotlar", url: "/reports", icon: BarChart3 },
  { title: "Sozlamalar", url: "/settings", icon: Settings },
];
