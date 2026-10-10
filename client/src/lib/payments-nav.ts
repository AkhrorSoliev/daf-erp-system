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
import type { PermissionKey } from "./permission-keys";

export interface PaymentsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
  /** Extra path prefixes that also mark the item active (its pages that live outside `url`). */
  activePrefixes?: string[];
}

export const paymentsNavItems: PaymentsNavItem[] = [
  { title: "Umumiy ma'lumotlar", url: "/payments/overview", icon: BarChart3, permission: "payments.view" },
  { title: "Kutilyotgan to'lovlar", url: "/payments/pending", icon: Clock, permission: "payments.view" },
  { title: "Xarajatlar", url: "/payments/expenses", icon: Receipt, permission: "expenses.view" },
  { title: "Ish haqi", url: "/payments/salary", icon: Banknote, permission: "salary.view" },
  // Spec B2b §3: the money of students who are not studying and the open refund
  // requests (GET /refundable/list). /payments/refunds/history shares the prefix.
  { title: "Qaytariladigan pul", url: "/payments/refunds", icon: HandCoins, permission: "debt.view" },
  // One entry for everything owed to the center. Its sub-pages (spec B2a §2.6)
  // /payments/debt-history and /debt-write-offs share the url's prefix.
  { title: "Qarzdorlik", url: "/payments/debt", icon: UserMinus, permission: "debt.view" },
  { title: "To'lov tizimlari jurnali", url: "/payments/gateway-events", icon: Activity, permission: "payments.gateway-log" },
];
