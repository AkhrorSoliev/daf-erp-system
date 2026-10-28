import {
  Receipt,
  UserMinus,
  UserPlus,
  GraduationCap,
  Activity,
  CalendarCheck,
  CalendarCheck2,
  Send,
  Megaphone,
  Star,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Can } from "./permission-check";
import { msg } from "@/i18n/msg";
import type { PermissionKey } from "./permission-keys";

export interface ReportsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
  /** Identity gate (role ids), like `nav-items.ts`. «Dars baholari» is the CEO's alone (spec 2026-10-13). */
  forRoles?: number[];
}

interface ReportsNavSection {
  title: string;
  items: ReportsNavItem[];
}

/**
 * An Administrator sees the Lidlar and «Guruhlar bo'yicha to'lov» reports (CEO
 * decisions: Lidlar 13.09.2026, the payments report 05.10.2026, kept by spec B5).
 * The rest — the money and centre figures — belong to the holders of
 * `reports.finance` and `reports.students`. The server agrees:
 * `reports/lead-funnel` and `reports/group-payments*` check `reports.leads` and
 * `reports.payments`.
 */
export const reportsNavSections: ReportsNavSection[] = [
  {
    title: msg("Moliyaviy hisobotlar"),
    items: [
      { title: msg("Guruhlar bo'yicha to'lov"), url: "/reports/payment-reports", icon: Receipt, permission: "reports.payments" },
      // «Oyni yopish»: bank xarajatini kiritish va oy hisobi (soliq stavkalari bilan bir imkoniyat).
      { title: msg("Oyni yopish"), url: "/reports/oyni-yopish", icon: CalendarCheck2, permission: "settings.tax" },
    ],
  },
  {
    title: msg("O'quvchilar hisoboti"),
    items: [
      { title: msg("Ketgan o'quvchilar hisoboti"), url: "/reports/departed-students", icon: UserMinus, permission: "reports.students" },
      { title: msg("Bitiruvchilar"), url: "/reports/graduates", icon: GraduationCap, permission: "reports.students" },
      { title: msg("Dars baholari"), url: "/reports/dars-baholari", icon: Star, forRoles: [1] },
    ],
  },
  {
    title: msg("Marketing va faoliyat"),
    items: [
      { title: msg("Lidlar hisoboti"), url: "/reports/leads", icon: UserPlus, permission: "reports.leads" },
      // «Xodimlar KPI» (ADR-0096): the managers' observation page.
      { title: msg("Xodimlar KPI"), url: "/reports/xodimlar-kpi", icon: Trophy, permission: "kpi.view" },
      // A money report (server: `GET /reports/marketing`, ADR-0067).
      { title: msg("Marketing"), url: "/reports/marketing", icon: Megaphone, permission: "reports.finance" },
      { title: msg("Markaz faoliyati"), url: "/reports/activity", icon: Activity, permission: "reports.students" },
      { title: msg("Davomat"), url: "/reports/attendance", icon: CalendarCheck, permission: "reports.students" },
      { title: msg("Bot hisoboti"), url: "/reports/bot", icon: Send, permission: "reports.students" },
      // «Auditoriya»: who studies here, by gender and age (ADR-0108).
      { title: msg("Auditoriya"), url: "/reports/audience", icon: Users, permission: "reports.students" },
    ],
  },
];

function itemVisible(item: ReportsNavItem, can: Can, roleIds: readonly number[]): boolean {
  if (item.permission && !can(item.permission)) return false;
  if (item.forRoles && !item.forRoles.some((id) => roleIds.includes(id))) return false;
  return true;
}

export { itemVisible as reportItemVisible };

/** May the user enter the reports section at all — at least one report shows. */
export function canEnterReports(can: Can, roleIds: readonly number[]): boolean {
  return reportsNavSections.some((s) => s.items.some((i) => itemVisible(i, can, roleIds)));
}

/**
 * May the user open this report page. `/reports` itself needs one visible
 * report. A page the menu does not list (a future inner path) stays with the
 * money-report holders, so a new report never opens to an administrator by
 * itself.
 */
export function canOpenReportPath(can: Can, pathname: string, roleIds: readonly number[]): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/reports") return canEnterReports(can, roleIds);
  const item = reportsNavSections
    .flatMap((s) => s.items)
    .find((i) => path === i.url || path.startsWith(`${i.url}/`));
  if (!item) return can("reports.finance");
  return itemVisible(item, can, roleIds);
}
