import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  UserPlus,
  ClipboardCheck,
  PhoneCall,
  DollarSign,
  BarChart3,
  Settings,
  UsersRound,
  ListTodo,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { paymentsNavItems } from "./payments-nav";
import { reportsNavSections } from "./reports-nav";
import { settingsNavSections } from "./settings-nav";

export interface NavItemChild {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
  /** Optional nested sub-items rendered as an inner dropdown. */
  children?: NavItemChild[];
}

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
  /** When provided, the item renders as a collapsible group with these sub-links. */
  children?: NavItemChild[];
}

const reportsChildren: NavItemChild[] = reportsNavSections.flatMap((s) => s.items);
const settingsChildren: NavItemChild[] = settingsNavSections.flatMap((s) => s.items);

export const navItems: NavItem[] = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap, visibleForRoles: [1, 2, 3] },
  { title: "O'quvchilar", url: "/students", icon: BookOpen, visibleForRoles: [1, 2, 3] },
  { title: "Lidlar", url: "/leads", icon: UserPlus, visibleForRoles: [1, 2, 3] },
  { title: "Aloqa markazi", url: "/outreach", icon: PhoneCall, visibleForRoles: [1, 2, 3] },
  { title: "Mock imtihonlar", url: "/mock-exams", icon: ClipboardCheck, visibleForRoles: [1, 2, 3] },
  { title: "Guruhlar", url: "/groups", icon: UsersRound },
  { title: "Topshiriqlar", url: "/tasks", icon: ListTodo },
  // Lehrer portal — only Teachers see this. Backend `/salary/me/*`
  // endpoints scope by @CurrentUser('id') so a teacher only sees their own.
  {
    title: "Mening oyligim",
    url: "/profile/salary",
    icon: Wallet,
    visibleForRoles: [4],
  },

  {
    title: "Moliya",
    url: "/payments",
    icon: DollarSign,
    visibleForRoles: [1, 2, 3, 5],
    children: paymentsNavItems,
  },
  {
    title: "Hisobotlar",
    url: "/reports",
    icon: BarChart3,
    visibleForRoles: [1, 2],
    children: reportsChildren,
  },
  {
    title: "Sozlamalar",
    url: "/settings",
    icon: Settings,
    visibleForRoles: [1, 2, 3],
    children: settingsChildren,
  },
];
