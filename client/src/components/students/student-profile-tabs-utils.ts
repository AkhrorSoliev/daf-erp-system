type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const STATUS_MAP: Record<number, { label: string; variant: BadgeVariant }> =
  {
    1: { label: "Faol", variant: "default" },
    2: { label: "Boshlanmagan", variant: "secondary" },
    3: { label: "Pauza", variant: "outline" },
    4: { label: "To'xtatilgan", variant: "destructive" },
  };

// Only the money-flow types the "To'lovlar" tab actually requests live here.
// Lesson-related types (LESSON_DEDUCTION/LESSON_CONSUMPTION) are scoped to
// the "Darslar" tab via lesson-trail-tab.tsx — they have their own labels.
export const TRANSACTION_TYPE_INFO: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  PAYMENT: { label: "To'lov", variant: "default" },
  REFUND: { label: "Qaytarish", variant: "destructive" },
  ADJUSTMENT: { label: "Tuzatish", variant: "secondary" },
  INITIAL_BALANCE: { label: "Boshlang'ich balans", variant: "outline" },
  BALANCE_WITHDRAWAL: { label: "Yechib olish", variant: "destructive" },
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

export interface StudentTransaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  payment: { id: string; method: string; status: string } | null;
  performedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}
