type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export const STATUS_MAP: Record<number, { label: string; variant: BadgeVariant }> =
  {
    1: { label: "Faol", variant: "default" },
    2: { label: "Boshlanmagan", variant: "secondary" },
    3: { label: "Pauza", variant: "outline" },
    4: { label: "To'xtatilgan", variant: "destructive" },
  };

// The money-flow types the "To'lovlar" tab requests — every type that moves
// the student balance. LESSON_DEDUCTION is included on purpose: it is a real
// outflow, so the tab can explain a balance drop (retroactive billing after a
// payment). It is the one type intentionally shared with the "Darslar" tab.
// LESSON_CONSUMPTION (amount=0, no balance movement) stays Darslar-only.
export const TRANSACTION_TYPE_INFO: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  PAYMENT: { label: "To'lov", variant: "default" },
  REFUND: { label: "Qaytarish", variant: "destructive" },
  ADJUSTMENT: { label: "Tuzatish", variant: "secondary" },
  INITIAL_BALANCE: { label: "Boshlang'ich balans", variant: "outline" },
  BALANCE_WITHDRAWAL: { label: "Yechib olish", variant: "destructive" },
  LESSON_DEDUCTION: { label: "Darsga yechildi", variant: "outline" },
};

// LESSON_DEDUCTION metadata `mode` → human label for the "Tafsilot" column.
export const LESSON_DEDUCTION_MODE_LABELS: Record<string, string> = {
  FULL_CYCLE: "To'liq tsikl",
  PARTIAL: "Qisman",
  SINGLE_UNCOVERED: "Qarzga yozildi",
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
  // Present on LESSON_DEDUCTION rows — drives the "Tafsilot" label.
  metadata: {
    mode?: string;
    perLessonCost?: number;
    lessonsCovered?: number;
  } | null;
  // Computed server-side for LESSON_DEDUCTION rows. Tells admin "this batch
  // is sikl #N for the enrollment and has paid for these lessons so far".
  coverage: {
    cycleSequenceNumber: number;
    coveredCount: number;
    capacity: number;
    firstCoveredDate: string | null;
    lastCoveredDate: string | null;
  } | null;
  payment: { id: string; method: string; status: string } | null;
  performedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}
