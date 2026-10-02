// The parts of `GET /students/:id/statement` the To'lovlar tab reads.
// Mirrors server/src/statements/present-statement.ts (StatementView) and
// statement.types.ts (StatementModel). Every sentence comes from `view`;
// `model` is read only for numbers, ids and lesson days.

export interface Segment {
  text: string;
  bold?: boolean;
  tone?: "red" | "green" | "muted";
}

export type Tone = "red" | "green" | "muted";

/** One row of "Oylar bo'yicha": a month, or a charge that is not a lesson. */
export interface DueView {
  /** The month, for a month's row. */
  key: string | null;
  label: string;
  wide: boolean;
  bold: boolean;
  lessons: string;
  lessonsNote: string | null;
  cost: string | null;
  costNote: string | null;
  paid: string;
  left: string;
  leftTone: Tone;
  details: string[];
  highlight: boolean;
}

export interface DuesTotalView {
  cost: string;
  paid: string;
  left: string;
  leftTone: Tone;
  details: string[];
}

export interface PaymentView {
  date: string;
  what: string;
  amount: string;
  to: string;
  paymentId: string | null;
}

export interface StatementView {
  title: string;
  studentLine: string;
  asOfLine: string;
  answer: { tone: "debt" | "credit" | "zero"; title: string; subtitle: string };
  equation: Segment[];
  dues: DueView[];
  duesTotal: DuesTotalView | null;
  surplus: { label: string; amount: string } | null;
  sharpNote: Segment[] | null;
  payments: PaymentView[];
  paidTotal: string | null;
  notes: string[];
  warning: string | null;
}

export type LessonStatus =
  | "keldi"
  | "kelmagan"
  | "uzrli"
  | "belgilanmagan"
  | "kelgusi";

export interface LessonDay {
  /** 'YYYY-MM-DD', a Tashkent day. */
  day: string;
  group: string;
  status: LessonStatus;
}

export interface ModelAllocation {
  kind: "payment" | "credit";
  paymentId: string | null;
  method: string | null;
  amount: number;
  /** When the payment was taken (ISO). Null for a credit. */
  at: string | null;
}

export interface StatementModel {
  asOf: string;
  /** paid + Σ items − lessons − prepaidAhead = balance, so'm by so'm. */
  equation: {
    paid: number;
    items: Array<{ kind: string; amount: number }>;
    lessons: number;
    prepaidAhead: number;
    balance: number;
  };
  months: Array<{ key: string; lessonDays: LessonDay[] }>;
  allocations: ModelAllocation[];
}

export interface StatementResponse {
  model: StatementModel;
  view: StatementView;
}
