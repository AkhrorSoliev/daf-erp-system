import {
  BarChart3,
  Clock,
  Receipt,
  Banknote,
  UserMinus,
  Activity,
  HandCoins,
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
  // Spec B2b §3: the money of students who are not studying and the open refund
  // requests. Every role that sees Moliya; /payments/refunds/history shares the prefix.
  { title: "Qaytariladigan pul", url: "/payments/refunds", icon: HandCoins, visibleForRoles: [1, 2, 3, 5] },
  // One entry for everything owed to the center. Its sub-pages (spec B2a §2.6)
  // /payments/debt-history and /debt-write-offs share the url's prefix.
  { title: "Qarzdorlik", url: "/payments/debt", icon: UserMinus },
  { title: "To'lov tizimlari jurnali", url: "/payments/gateway-events", icon: Activity, visibleForRoles: [1] },
];
