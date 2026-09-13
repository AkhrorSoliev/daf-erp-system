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

/** Hisobotlar bo'limining asosiy egalari. */
const CEO_BD = [1, 2];

/**
 * Administrator hisobotlar bo'limida faqat Lidlar hisobotini ko'radi (CEO
 * qarori, 13.09.2026). Qolganlari — pul va markaz ko'rsatkichlari — CEO/BD.
 * Backend ham shunday: `reports/lead-funnel` Administrator'ga ochiq, qolgan
 * pul hisobotlari `@Roles('CEO', 'Branch Director')`.
 */
export const reportsNavSections: ReportsNavSection[] = [
  {
    title: "Moliyaviy hisobotlar",
    items: [
      { title: "To'lov hisobotlari", url: "/reports/payment-reports", icon: Receipt, visibleForRoles: CEO_BD },
      { title: "O'quvchi to'lovi", url: "/reports/student-payments", icon: Wallet, visibleForRoles: CEO_BD },
    ],
  },
  {
    title: "O'quvchilar hisoboti",
    items: [
      { title: "Ketgan o'quvchilar hisoboti", url: "/reports/departed-students", icon: UserMinus, visibleForRoles: CEO_BD },
      { title: "Bitiruvchilar", url: "/reports/graduates", icon: GraduationCap, visibleForRoles: CEO_BD },
    ],
  },
  {
    title: "Marketing va faoliyat",
    items: [
      { title: "Lidlar hisoboti", url: "/reports/leads", icon: UserPlus, visibleForRoles: [1, 2, 3] },
      { title: "Markaz faoliyat statistikasi", url: "/reports/activity", icon: Activity, visibleForRoles: CEO_BD },
      { title: "Davomat statistikasi", url: "/reports/attendance", icon: CalendarCheck, visibleForRoles: CEO_BD },
      { title: "Bot hisoboti", url: "/reports/bot", icon: Send, visibleForRoles: CEO_BD },
    ],
  },
];

const hasAny = (roleIds: number[], allowed: number[]) =>
  allowed.some((id) => roleIds.includes(id));

/** Hisobotlar bo'limiga umuman kira oladimi — kamida bitta hisobot ko'rinsa. */
export function canEnterReports(roleIds: number[]): boolean {
  return reportsNavSections.some((s) =>
    s.items.some((i) => !i.visibleForRoles || hasAny(roleIds, i.visibleForRoles)),
  );
}

/**
 * Bu hisobot sahifasini ocha oladimi. `/reports` ildizi — bo'limga kira
 * olsa bas. Menyuda yo'q sahifa (masalan kelajak ichki yo'l) CEO/BD ga
 * qoladi: yangi hisobot o'z-o'zidan adminga ochilib ketmasin.
 */
export function canOpenReportPath(roleIds: number[], pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/reports") return canEnterReports(roleIds);
  const item = reportsNavSections
    .flatMap((s) => s.items)
    .find((i) => path === i.url || path.startsWith(`${i.url}/`));
  if (!item) return hasAny(roleIds, CEO_BD);
  return !item.visibleForRoles || hasAny(roleIds, item.visibleForRoles);
}
