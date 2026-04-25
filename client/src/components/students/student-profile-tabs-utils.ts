type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const STATUS_MAP: Record<number, { label: string; variant: BadgeVariant }> =
  {
    1: { label: "Faol", variant: "default" },
    2: { label: "Boshlanmagan", variant: "secondary" },
    3: { label: "Pauza", variant: "outline" },
    4: { label: "To'xtatilgan", variant: "destructive" },
  };

export const TRANSACTION_TYPE_INFO: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  PAYMENT: { label: "To'lov", variant: "default" },
  LESSON_DEDUCTION: { label: "Dars", variant: "outline" },
  REFUND: { label: "Qaytarish", variant: "destructive" },
  ADJUSTMENT: { label: "Tuzatish", variant: "secondary" },
  SALARY_PAYMENT: { label: "Oylik", variant: "outline" },
  EXPENSE: { label: "Xarajat", variant: "outline" },
  TAX: { label: "Soliq", variant: "outline" },
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
  payment: { method: string } | null;
  performedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}
