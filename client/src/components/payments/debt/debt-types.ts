import type { CallOutcome } from "@/components/outreach/outreach-types";

/** The server's shapes (`server/src/payments/debt/debt-list.math.ts`, `promise-rule.ts`). */
export type DebtTab = "shu-oy" | "eski" | "chiqqan";
export const DEBT_TABS: readonly DebtTab[] = ["shu-oy", "eski", "chiqqan"];
export type DebtKind = "ungrouped" | "frozen" | "left";

export interface DebtGroup { id: string; name: string; teachers: { id: number; name: string }[] }
/** `promiseDate`: Tashkent day, YYYY-MM-DD. */
export interface PromiseCell { state: "open" | "broken"; promiseDate: string; promisedAmount: number | null }

export interface DebtListItem {
  studentId: number; firstName: string; lastName: string; phone: string | null;
  amount: number; otherPart: number; debt: number; kind: DebtKind | null;
  groups: DebtGroup[]; promise: PromiseCell | null;
  months: { monthKey: string; amount: number }[]; oldestMonth: string | null;
  dueDate: string | null;
  lastCall: { createdAt: string; outcome: CallOutcome } | null;
  lastPayment: { createdAt: string; amount: number } | null;
}

export interface TabTotal { total: number; count: number }

export interface DebtListResponse {
  data: DebtListItem[]; total: number; page: number; pageSize: number; sum: number;
  tabs: { "shu-oy": TabTotal; eski: TabTotal; chiqqan: TabTotal & { byKind: Record<DebtKind, TabTotal> } };
  leftThisMonth: number;
  options: { groups: { id: string; name: string }[]; teachers: { id: number; name: string }[] };
  writeOffCount: number;
}

export interface DebtDrawer {
  student: { id: number; firstName: string; lastName: string; phone: string | null };
  kind: DebtKind | null; groups: DebtGroup[]; debt: number;
  /** `month` is null on a line that is not a month's lessons; `label` names it then. */
  months: { month: string | null; label: string | null; charged: number | null; paid: number | null; left: number }[];
  lastPayment: { createdAt: string; amount: number; method: string } | null;
  lastCall: { createdAt: string; outcome: CallOutcome; note: string | null; calledByName: string } | null;
  promise: PromiseCell | null;
}

export interface PromiseMonthState {
  monthPromise: { id: string; status: string; promiseDate: string; promisedAmount: number | null; createdAt: string } | null;
  create: { from: string; to: string } | null;
  edit: { from: string; to: string } | null;
}

/** Who the payment dialog opens for. */
export interface PayTarget { id: number; firstName: string; lastName: string; balance: number; suggested: number }
