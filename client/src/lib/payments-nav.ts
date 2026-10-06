import {
  BarChart3,
  Clock,
  Receipt,
  Banknote,
  UserMinus,
  Activity,
  type LucideIcon,
} from "lucide-react";

export interface PaymentsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
  /** Extra path prefixes that also mark the item active (its pages that live outside `url`). */
  activePrefixes?: string[];
}

export const paymentsNavItems: PaymentsNavItem[] = [
  { title: "Umumiy ma'lumotlar", url: "/payments/overview", icon: BarChart3 },
  { title: "Kutilyotgan to'lovlar", url: "/payments/pending", icon: Clock },
  { title: "Xarajatlar", url: "/payments/expenses", icon: Receipt, visibleForRoles: [1, 2] },
  { title: "Ish haqi", url: "/payments/salary", icon: Banknote, visibleForRoles: [1, 2] },
  // One entry for everything owed to the center. Its sub-pages (spec B2a §2.6)
  // stay under it in the sidebar: /payments/debt-history and /debt-write-offs
  // share the url's prefix, /payments/frozen-balances needs activePrefixes.
  {
    title: "Qarzdorlik",
    url: "/payments/debt",
    icon: UserMinus,
    activePrefixes: ["/payments/frozen-balances"],
  },
  { title: "To'lov tizimlari jurnali", url: "/payments/gateway-events", icon: Activity, visibleForRoles: [1] },
];
