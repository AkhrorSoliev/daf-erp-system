// The parts of `GET /students/:id/statement` the To'lovlar tab reads.
// Mirrors server/src/statements/present-statement.ts (StatementView) and
// statement.types.ts (StatementModel). Every sentence comes from `view`;
// `model` is read only for numbers, ids and lesson days.

export interface Segment {
  text: string;
  bold?: boolean;
  tone?: "red" | "green" | "muted";
}

export interface MonthView {
  key: string;
  label: string;
  lessons: string;
  absent: string | null;
  cost: string | null;
  costNote: string | null;
  money: string;
  running: string;
  runningTone: "red" | "green" | "muted";
  details: string[];
  highlight: boolean;
  isLast: boolean;
}

export interface AllocationView {
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
  packHint: string | null;
  months: MonthView[];
  sharpNote: Segment[] | null;
  modelChanges: Array<{ title: string; lines: string[] }>;
  allocations: AllocationView[];
  footnote: string;
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
  months: Array<{ key: string; lessonDays: LessonDay[] }>;
  allocations: ModelAllocation[];
}

export interface StatementResponse {
  model: StatementModel;
  view: StatementView;
}
