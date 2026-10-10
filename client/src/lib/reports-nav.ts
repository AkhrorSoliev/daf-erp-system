import {
  Receipt,
  Wallet,
  UserMinus,
  UserPlus,
  GraduationCap,
  Activity,
  CalendarCheck,
  Send,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import type { Can } from "./permission-check";
import type { PermissionKey } from "./permission-keys";

export interface ReportsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
}

interface ReportsNavSection {
  title: string;
  items: ReportsNavItem[];
}

/**
 * An Administrator sees the Lidlar and To'lov hisobotlari reports (CEO
 * decisions: Lidlar 13.09.2026, To'lov hisobotlari 05.10.2026). The rest — the
 * money and centre figures — belong to the holders of `reports.finance` and
 * `reports.students`. The server agrees: `reports/lead-funnel` and
 * `reports/payment-reports*` check `reports.leads` and `reports.payments`.
 */
export const reportsNavSections: ReportsNavSection[] = [
  {
    title: "Moliyaviy hisobotlar",
    items: [
      { title: "To'lov hisobotlari", url: "/reports/payment-reports", icon: Receipt, permission: "reports.payments" },
      { title: "O'quvchi to'lovi", url: "/reports/student-payments", icon: Wallet, permission: "reports.finance" },
    ],
  },
  {
    title: "O'quvchilar hisoboti",
    items: [
      { title: "Ketgan o'quvchilar hisoboti", url: "/reports/departed-students", icon: UserMinus, permission: "reports.students" },
      { title: "Bitiruvchilar", url: "/reports/graduates", icon: GraduationCap, permission: "reports.students" },
    ],
  },
  {
    title: "Marketing va faoliyat",
    items: [
      { title: "Lidlar hisoboti", url: "/reports/leads", icon: UserPlus, permission: "reports.leads" },
      // A money report (server: `GET /reports/marketing`, ADR-0067).
      { title: "Marketing", url: "/reports/marketing", icon: Megaphone, permission: "reports.finance" },
      { title: "Markaz faoliyat statistikasi", url: "/reports/activity", icon: Activity, permission: "reports.students" },
      { title: "Davomat statistikasi", url: "/reports/attendance", icon: CalendarCheck, permission: "reports.students" },
      { title: "Bot hisoboti", url: "/reports/bot", icon: Send, permission: "reports.students" },
    ],
  },
];

/** May the user enter the reports section at all — at least one report shows. */
export function canEnterReports(can: Can): boolean {
  return reportsNavSections.some((s) =>
    s.items.some((i) => !i.permission || can(i.permission)),
  );
}

/**
 * May the user open this report page. `/reports` itself needs one visible
 * report. A page the menu does not list (a future inner path) stays with the
 * money-report holders, so a new report never opens to an administrator by
 * itself.
 */
export function canOpenReportPath(can: Can, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/reports") return canEnterReports(can);
  const item = reportsNavSections
    .flatMap((s) => s.items)
    .find((i) => path === i.url || path.startsWith(`${i.url}/`));
  if (!item) return can("reports.finance");
  return !item.permission || can(item.permission);
}
