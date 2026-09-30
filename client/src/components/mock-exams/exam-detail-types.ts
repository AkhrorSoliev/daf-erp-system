import type { MockExamSummary } from "@/hooks/use-mock-exams-board";
import type { MockPaymentMethod, MockPaymentSource } from "./mock-payment";

export interface MockExamSubject {
  id: string;
  examId: string;
  name: string;
  maxScore: number;
  order: number;
}

export interface ExamDetail extends MockExamSummary {
  section: { id: string; name: string; color: string | null };
  subjects: MockExamSubject[];
  /** R2 public URL for the announced results PDF. Null while < ANNOUNCED. */
  resultsPdfUrl: string | null;
  resultsPdfGeneratedAt: string | null;
}

export interface MockExamParticipant {
  id: string;
  /**
   * 5-digit public identifier. Equals Student.id when the participant is a
   * DaF student; otherwise drawn from the same sequence so future
   * conversion preserves the id. Shown in the table, the Click/Payme
   * payment instructions and the eventual results PDF.
   */
  publicId: number;
  firstName: string;
  lastName: string;
  phone: string;
  telegramChatId: string | null;
  telegramUsername: string | null;
  registeredAt: string;
  /** Set only when the participant is a real DaF student. */
  studentId: number | null;
  /** CEFR level the participant chose (null when the exam offers none). */
  level: string | null;
  /** The exam time slot ("HH:mm") the participant chose (null if none). */
  examTime: string | null;
  /** The fee locked in for this registration (after any DaF discount). */
  feeAmount: number | null;
  /**
   * Raw registration answers + system markers. `__payIntent === "CASH"`
   * means the participant chose to pay cash on arrival (still unpaid).
   */
  formData: { __payIntent?: string } & Record<string, unknown>;
  paid: boolean;
  paidAt: string | null;
  /**
   * How it was paid. Null while unpaid, for an old balance payment, and for
   * a hand-accepted payment made before the method was stored.
   */
  paymentMethod: MockPaymentMethod | null;
  paymentNote: string | null;
  /** The staff member who accepted the payment by hand. */
  paidBy: { id: number; firstName: string; lastName: string } | null;
  /**
   * Where the money sits (server-decided, `mock-payment-source.ts`): only a
   * `MANUAL` payment may be edited or cancelled from the participants tab.
   */
  paymentSource?: MockPaymentSource | null;
  /**
   * 2026-08 gacha o'quvchi balansidan yechilgan to'lov. O'chirilganda uni
   * server o'zi balansga qaytaradi — admin naqd bermasligi kerak.
   */
  paidFromBalance?: boolean;
  totalScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  rank: number | null;
}

/** How a paid registration was paid (server `mock-exam-stats.ts`). */
export type MockStatsMethod =
  | "CASH"
  | "CLICK"
  | "PAYME"
  | "UZUM"
  | "TRANSFER"
  | "BALANCE"
  | "UNKNOWN";

/** `GET /mock-exams/:id/stats` — the «Umumiy» tab's statistics block. */
export interface MockExamStats {
  registered: number;
  channel: { bot: number; admin: number };
  daf: { student: number; outsider: number; converted: number };
  money: {
    paidCount: number;
    paidSum: number;
    unpaidCount: number;
    unpaidSum: number;
    cashIntentCount: number;
    freeCount: number;
  };
  methods: { method: MockStatsMethod; count: number; sum: number }[];
  levels: { level: string | null; registered: number; paid: number }[];
  times: { time: string | null; registered: number }[];
  /** Null until the results are announced; the four counts split `audience`. */
  results: {
    audience: number;
    delivered: number;
    noTelegram: number;
    failed: number;
    pending: number;
  } | null;
}
