import { Gauge, Users, type LucideIcon } from "lucide-react";

export interface DafNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. */
  visibleForRoles?: number[];
}

/** Bo'lim egalari — CEO, Filial direktori, Administrator. O'qituvchi o'z guruhining «Ilova faolligi» tabidan ko'radi. */
const CEO_BD_ADMIN = [1, 2, 3];

export const dafNavItems: DafNavItem[] = [
  {
    title: "Umumiy holat",
    url: "/daf",
    icon: Gauge,
    visibleForRoles: CEO_BD_ADMIN,
  },
  {
    title: "O'quvchilar",
    url: "/daf/oquvchilar",
    icon: Users,
    visibleForRoles: CEO_BD_ADMIN,
  },
];

const hasAny = (roleIds: number[], allowed: number[]) =>
  allowed.some((id) => roleIds.includes(id));

export function canEnterDaf(roleIds: number[]): boolean {
  return dafNavItems.some(
    (i) => !i.visibleForRoles || hasAny(roleIds, i.visibleForRoles),
  );
}

/**
 * Bu sahifani ocha oladimi. Menyuda yo'q yangi yo'l (kelajakdagi /daf/kontent
 * kabi) faqat CEO ga qoladi — yangi sahifa o'z-o'zidan adminga ochilib
 * ketmasin (`reports-nav.ts` dagi qoida).
 */
export function canOpenDafPath(roleIds: number[], pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const item = dafNavItems.find(
    (i) => path === i.url || (i.url !== "/daf" && path.startsWith(`${i.url}/`)),
  );
  if (!item) return roleIds.includes(1);
  return !item.visibleForRoles || hasAny(roleIds, item.visibleForRoles);
}
