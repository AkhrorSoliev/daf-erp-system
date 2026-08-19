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
  // These three move the balance too. Leaving them off the tab left 37 rows
  // (4 296 450 so'm) of balance movement with no visible cause, so the list
  // could not explain its own totals.
  DISCOUNT_ADJUSTMENT: { label: "Chegirma tuzatishi", variant: "secondary" },
  DEBT_WRITE_OFF: { label: "Qarz kechirildi", variant: "secondary" },
  MOCK_EXAM_FEE: { label: "Mock imtihon to'lovi", variant: "outline" },
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
  // Computed server-side for PAYMENT rows by replaying the stored ledger.
  //
  // There is deliberately no "remainderInBalance" any more: the name claimed
  // the money was sitting on the balance, which is what let a student read
  // "233 339 qoldi" while owing 33 325. `unspent` is money that has not
  // bought anything yet — say it in the past tense, never as a holding.
  //
  // `reconciled: false` means the ledger chain did not add up for this
  // student. Render the balance facts only and suppress the allocation —
  // a patched-up number is exactly the defect this replaced.
  destination: {
    amount: number;
    toPreviousDebt: number;
    debtLessonCount: number;
    debtFirstLessonDate: string | null;
    debtLastLessonDate: string | null;
    toLessons: number;
    // `lessonCount` — shu pul to'lagan darslarning HAMMASI (o'tilgani ham,
    // oldindan to'langani ham). `firstLessonDate`/`lastLessonDate` oralig'i
    // esa faqat O'TILGANLARINI qamraydi — ikkisini bitta qatorda yonma-yon
    // yozish (#10601: "10 ta darsga yetdi · 12.08 — 19.08") ikki xil
    // to'plamni bitta gap qilib ko'rsatgan edi. Shuning uchun quyidagi ikki
    // son bor: qaysi qismi o'tilgan, qaysi qismi oldinda.
    lessonCount: number;
    heldLessonCount: number;
    pendingLessonCount: number;
    firstLessonDate: string | null;
    lastLessonDate: string | null;
    // Oldinda turgan darslarning TAXMINIY oxirgi sanasi — guruh jadvalidan
    // proyeksiya, fakt emas. `null` = ayta olmaymiz (jadval noma'lum, bir
    // nechta guruh aralashgan, yoki guruh tugab qolgan). UI uni "taxminan"
    // deb belgilamasa, o'sha eski nuqson yangi shaklda qaytadi.
    projectedLastLessonDate: string | null;
    toOther: number;
    unspent: number;
    reconciled: boolean;
  } | null;
  payment: { id: string; method: string; status: string } | null;
  performedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}
