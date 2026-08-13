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
}

export const paymentsNavItems: PaymentsNavItem[] = [
  { title: "Umumiy ma'lumotlar", url: "/payments/overview", icon: BarChart3 },
  { title: "Kutilyotgan to'lovlar", url: "/payments/pending", icon: Clock },
  { title: "Xarajatlar", url: "/payments/expenses", icon: Receipt, visibleForRoles: [1, 2] },
  { title: "Ish haqi", url: "/payments/salary", icon: Banknote, visibleForRoles: [1, 2] },
  // One entry for everything owed to the center. The three pages it replaced —
  // Qarzdorlar, Oylik qarzdorlik, Qarz hisobdan chiqarishlar — are tabs of it
  // now, and their paths redirect here.
  { title: "Qarzdorlik", url: "/payments/debt", icon: UserMinus },
  { title: "To'lov tizimlari jurnali", url: "/payments/gateway-events", icon: Activity, visibleForRoles: [1] },
];
