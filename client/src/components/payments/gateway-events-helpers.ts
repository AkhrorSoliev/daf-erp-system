export interface GatewayEvent {
  id: string;
  provider: "PAYME" | "CLICK" | "UZUM" | "CASH" | "TRANSFER";
  externalId: string;
  eventType: string;
  payload: any;
  signatureValid: boolean;
  processed: boolean;
  processedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  student: { id: number; firstName: string; lastName: string } | null;
  amount: number | null;
}

export interface EventsResponse {
  data: GatewayEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export const PROVIDER_LABELS: Record<string, string> = {
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
};

export const PROVIDER_COLORS: Record<string, string> = {
  PAYME:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 border-blue-200",
  CLICK:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 border-purple-200",
  UZUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-200",
};

// Bosqich nomi + qisqa tushuntirish
export const STEP_INFO: Record<
  string,
  { label: string; description: string }
> = {
  CheckPerformTransaction: {
    label: "Tekshirish",
    description: "To'lov qilish mumkinligini tekshirish (boshlanmagan)",
  },
  CreateTransaction: {
    label: "Boshlandi",
    description: "Foydalanuvchi karta kiritdi, to'lov yaratildi",
  },
  PerformTransaction: {
    label: "To'landi",
    description: "Kartadan pul yechildi, balans to'ldirildi",
  },
  CancelTransaction: {
    label: "Bekor qilindi",
    description: "To'lov bekor qilindi yoki qaytarildi",
  },
  CheckTransaction: {
    label: "Payme holat so'radi",
    description:
      "Payme tizimi avtomatik ushbu to'lov holatini tekshirdi (pul harakati yo'q)",
  },
  GetStatement: {
    label: "Davriy ro'yxat",
    description:
      "Payme tizimi davriy tekshiruv uchun tranzaksiyalar ro'yxatini so'radi (pul harakati yo'q)",
  },
  Prepare: {
    label: "Tayyorlash",
    description: "Click to'lovni tayyorladi (kartadan pul yechishdan oldin)",
  },
  Complete: {
    label: "Yakunlash",
    description: "Click to'lovni yakunladi, pul yechildi",
  },
};

// Amount comes from the backend (resolved via provider transaction table),
// so we only extract studentId here as a fallback when the backend didn't
// find a linked Student row.
export function extractPaymentInfo(e: GatewayEvent): {
  amount: number | null;
  studentIdFromPayload: number | null;
} {
  const p = e.payload;
  const amount = e.amount;

  if (!p) return { amount, studentIdFromPayload: null };

  if (e.provider === "PAYME") {
    const studentIdFromPayload = p.params?.account?.student_id
      ? Number(p.params.account.student_id)
      : null;
    return { amount, studentIdFromPayload };
  }

  if (e.provider === "CLICK") {
    const studentIdFromPayload = p.merchant_trans_id
      ? Number(p.merchant_trans_id)
      : null;
    return { amount, studentIdFromPayload };
  }

  return { amount, studentIdFromPayload: null };
}

// Umumiy natija: muvaffaqiyatli/kutilmoqda/xato
export type Outcome = "success" | "pending" | "failed" | "rejected";

export function computeOutcome(e: GatewayEvent): Outcome {
  if (!e.signatureValid) return "rejected";
  if (e.errorMessage) return "failed";
  if (e.processed) return "success";
  return "pending";
}

export function formatAmount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("uz-UZ") + " so'm";
}
