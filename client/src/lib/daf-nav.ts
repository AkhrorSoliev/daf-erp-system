import { Gauge, Users, type LucideIcon } from "lucide-react";
import type { Can } from "./permission-check";
import type { PermissionKey } from "./permission-keys";

export interface DafNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
}

// Section holders: CEO, Branch Director, Administrator (`daf.activity`). A
// teacher sees the app activity in their own group's «Ilova faolligi» tab.
export const dafNavItems: DafNavItem[] = [
  {
    title: "Umumiy holat",
    url: "/daf",
    icon: Gauge,
    permission: "daf.activity",
  },
  {
    title: "O'quvchilar",
    url: "/daf/oquvchilar",
    icon: Users,
    permission: "daf.activity",
  },
];

export function canEnterDaf(can: Can): boolean {
  return dafNavItems.some((i) => !i.permission || can(i.permission));
}

/**
 * May the user open this page. A path the menu does not list (a future
 * `/daf/kontent`) stays with the CEO alone — a new page never opens to an
 * administrator by itself. Stricter than `canOpenReportPath`, on purpose.
 */
export function canOpenDafPath(
  can: Can,
  pathname: string,
  roleIds: readonly number[],
): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  // Without `i.url !== "/daf"`, the root item would match every `/daf/...`
  // path as a prefix and the CEO-only fallback below would never run.
  const item = dafNavItems.find(
    (i) => path === i.url || (i.url !== "/daf" && path.startsWith(`${i.url}/`)),
  );
  if (!item) return roleIds.includes(1);
  return !item.permission || can(item.permission);
}
