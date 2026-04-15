import {
  BarChart3,
  Clock,
  Receipt,
  Banknote,
  UserMinus,
  FileText,
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
  { title: "Xarajatlar", url: "/payments/expenses", icon: Receipt },
  { title: "Ish haqi", url: "/payments/salary", icon: Banknote, visibleForRoles: [1, 2] },
  { title: "Qarzdorlar", url: "/payments/debtors", icon: UserMinus },
  { title: "Shartnomalar", url: "/payments/contracts", icon: FileText },
];
