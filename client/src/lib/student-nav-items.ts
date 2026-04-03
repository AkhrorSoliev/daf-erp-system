import {
  User,
  CalendarDays,
  CreditCard,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface StudentNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export const studentNavItems: StudentNavItem[] = [
  { title: "Bosh sahifa", url: "/portal", icon: User },
  { title: "Jadval", url: "/portal/schedule", icon: CalendarDays },
  { title: "AI", url: "/portal/ai", icon: Sparkles },
  { title: "To'lovlar", url: "/portal/payments", icon: CreditCard },
  { title: "Sozlamalar", url: "/portal/settings", icon: Settings },
];
