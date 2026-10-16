/** The JSON of `/kpi/*` (server `src/kpi/`, ADR-0095). Dates arrive as ISO strings. */
export type KpiResultType = "LEAD_PAID" | "PROMISE_KEPT";
export type KpiResultStatus = "ACTIVE" | "CANCELLED";
export type KpiRuleMode = "FIXED" | "PERCENT";

export interface KpiRule {
  mode: KpiRuleMode;
  value: number;
}

export interface KpiSettings {
  enabled: boolean;
  /** When the switch last flipped; null = never. */
  changedAt: string | null;
  leadPaid: KpiRule;
  promiseKept: KpiRule;
}

export interface KpiSettingsPatch {
  enabled?: boolean;
  leadPaid?: KpiRule;
  promiseKept?: KpiRule;
}

export interface KpiPair {
  value: number;
  compare: number;
}

export interface KpiSignal {
  kind: "DROP" | "SILENT" | "EXPIRED" | "PROMISE_LOW" | "SURGE" | "BEST_CONVERSION";
  userId: number;
  tone: "bad" | "good";
  text: string;
  weight: number;
}

export interface KpiAdminRow {
  userId: number;
  name: string;
  leadPaid: { count: number; amount: number; compare: number };
  promiseKept: { count: number; amount: number; compare: number };
  leadToPaid: { paid: number; received: number; pct: number | null };
  promiseRate: { kept: number; closed: number; pct: number | null };
  expired: { count: number; compare: number };
  held: number;
  total: number;
}

export interface KpiOverview {
  month: string;
  compare: string;
  /**
   * False when the compare month is before 2026-10: nothing was read for it, so
   * every `compare` figure is an empty 0/null. Hide ▲/▼, the compare line and the compare series.
   */
  compareAvailable: boolean;
  status: { enabled: boolean; changedAt: string | null };
  cards: {
    results: KpiPair;
    amount: KpiPair;
    leadToPaid: { value: number | null; compare: number | null };
    forecast: number | null;
  };
  signals: KpiSignal[];
  daily: { day: number; current: number | null; compare: number | null }[];
  months: { month: string; leadPaid: number; promiseKept: number; amount: number }[];
  rows: KpiAdminRow[];
}

export interface KpiResultView {
  id: string;
  type: KpiResultType;
  occurredAt: string;
  studentId: number;
  studentName: string;
  paymentAmount: number;
  amount: number;
  /** «Qanday hisoblandi», written by the server. */
  explanation: string;
  status: KpiResultStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface KpiUserView {
  user: { id: number; name: string };
  month: string;
  hasAny: boolean;
  /** False when the month before is before 2026-10: `compareTotal` is an empty 0. */
  compareAvailable: boolean;
  total: number;
  compareTotal: number;
  months: { month: string; count: number; amount: number }[];
  results: KpiResultView[];
}
