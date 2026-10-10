import {
  LayoutDashboard,
  CalendarDays,
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
  Images,
  Smartphone,
  Wallet,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { paymentsNavItems } from "./payments-nav";
import { reportsNavSections } from "./reports-nav";
import { dafNavItems } from "./daf-nav";
import { SETTINGS_PERMISSIONS } from "./settings-nav";
import type { Can } from "./permission-check";
import type { PermissionKey } from "./permission-keys";

export type NavBadgeKey = "qollanma-yangiliklar";

export interface NavItemChild {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown when the user holds ANY of these capabilities. Omit to show to all. */
  permission?: PermissionKey | readonly PermissionKey[];
  /** Identity-only items (a teacher's own salary): shown to these role ids. */
  forRoles?: number[];
  /** Optional nested sub-items rendered as an inner dropdown. */
  children?: NavItemChild[];
  /** Extra path prefixes that also mark the item active (its pages that live outside `url`). */
  activePrefixes?: string[];
}

/** The sidebar's active check for a sub-item: its own url or any of its `activePrefixes`. */
export const isNavChildActive = (pathname: string, child: NavItemChild) =>
  [child.url, ...(child.activePrefixes ?? [])].some((p) => pathname.startsWith(p));

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown when the user holds ANY of these capabilities. Omit to show to all. */
  permission?: PermissionKey | readonly PermissionKey[];
  /** Identity-only items (a teacher's own salary): shown to these role ids. */
  forRoles?: number[];
  /** When provided, the item renders as a collapsible group with these sub-links. */
  children?: NavItemChild[];
  /** Menyu bandining o'ng tomonidagi belgi (masalan, o'qilmagan yangiliklar soni). */
  badgeKey?: NavBadgeKey;
}

/** One rule for every menu: the capability gate, then the identity gate. */
export function isNavGateOpen(
  item: { permission?: PermissionKey | readonly PermissionKey[]; forRoles?: number[] },
  can: Can,
  roleIds: readonly number[],
): boolean {
  if (item.permission && !can(item.permission)) return false;
  if (item.forRoles && !item.forRoles.some((id) => roleIds.includes(id))) {
    return false;
  }
  return true;
}

const reportsChildren: NavItemChild[] = reportsNavSections.flatMap((s) => s.items);

export const navItems: NavItem[] = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  // Kunlik jadval ilgari bosh sahifaning o'zi edi. Bosh sahifa boshqaruv
  // paneliga aylangach u alohida sahifaga chiqdi — hamma rol ko'radi.
  { title: "Jadval", url: "/schedule", icon: CalendarDays },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap, permission: "teachers.view" },
  { title: "O'quvchilar", url: "/students", icon: BookOpen, permission: "students.list" },
  { title: "Lidlar", url: "/leads", icon: UserPlus, permission: "leads.view" },
  { title: "Aloqa markazi", url: "/outreach", icon: PhoneCall, permission: "outreach.view" },
  { title: "Mock imtihonlar", url: "/mock-exams", icon: ClipboardCheck, permission: "mock.view" },
  { title: "Guruhlar", url: "/groups", icon: UsersRound, permission: "groups.view" },
  { title: "Topshiriqlar", url: "/tasks", icon: ListTodo },
  { title: "Media", url: "/media", icon: Images, permission: "media.view" },
  // DaF ilovasi nazorati — markaz bo'yicha faollik. O'qituvchi bu bo'limni
  // ko'rmaydi: u o'z guruhidagi «Ilova faolligi» tabidan foydalanadi.
  {
    title: "DaF ilovasi",
    url: "/daf",
    icon: Smartphone,
    permission: "daf.activity",
    children: dafNavItems,
  },
  // Lehrer portal — only Teachers see this. Backend `/salary/me/*`
  // endpoints scope by @CurrentUser('id') so a teacher only sees their own.
  {
    title: "Mening oyligim",
    url: "/profile/salary",
    icon: Wallet,
    forRoles: [4],
  },

  {
    title: "Moliya",
    url: "/payments",
    icon: DollarSign,
    permission: ["payments.view", "debt.view", "expenses.view", "salary.view", "payments.gateway-log"],
    children: paymentsNavItems,
  },
  {
    title: "Hisobotlar",
    url: "/reports",
    icon: BarChart3,
    // An Administrator sees only the Lidlar and To'lov hisobotlari; the
    // children list filters the rest.
    permission: ["reports.finance", "reports.payments", "reports.students", "reports.leads"],
    children: reportsChildren,
  },
  // The guide is open to every staff member; it filters its pages by role itself.
  { title: "Qo'llanma", url: "/qollanma", icon: LifeBuoy, badgeKey: "qollanma-yangiliklar" },
  // Not a dropdown: at 12 entries it pushed the rest of the sidebar down when
  // opened. The list lives on the /settings page — its source is settings-nav.ts.
  {
    title: "Sozlamalar",
    url: "/settings",
    icon: Settings,
    permission: SETTINGS_PERMISSIONS,
  },
];
