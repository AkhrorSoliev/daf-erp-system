import { bankDaysBetween } from '../common/date/bank-days';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { debtKindOf, type DebtKindKey } from '../reports/debt-split';
import {
  latestValidNotice,
  type NoticeCell,
} from '../balance-notices/transfer-condition';
import { dm } from '../statements/statement-text';

/** «Qaytariladigan pul» (spec B2b §3, ADR-0077). Pure. */

export type RefundableTab = 'muzlatilgan' | 'guruhsiz' | 'ketgan';
export const REFUNDABLE_TABS: readonly RefundableTab[] = [
  'muzlatilgan',
  'guruhsiz',
  'ketgan',
];

export type AgeBucket = 'upto30' | 'd31to60' | 'over60';
export const AGE_BUCKETS: readonly AgeBucket[] = [
  'upto30',
  'd31to60',
  'over60',
];

/** The frozen tab's «Holat» — the same three buckets as the chips. */
export const AGE_STATE_LABEL: Record<AgeBucket, string> = {
  upto30: 'kutilmoqda',
  d31to60: "muddati o'tgan",
  over60: 'ketgan hisoblanadi',
};

const TAB_OF_KIND: Record<DebtKindKey, RefundableTab> = {
  frozen: 'muzlatilgan',
  ungrouped: 'guruhsiz',
  left: 'ketgan',
};

/** ADR-0067's kinds of a student who is not studying. */
export function refundableTab(status: string): RefundableTab {
  return TAB_OF_KIND[debtKindOf(status)];
}

/** Calendar days from one Tashkent day to another. */
export function daysBetween(fromStr: string, toStr: string): number {
  return Math.round(
    (utcMidnightFromDateStr(toStr).getTime() -
      utcMidnightFromDateStr(fromStr).getTime()) /
      86_400_000,
  );
}

export function ageBucket(days: number): AgeBucket {
  if (days <= 30) return 'upto30';
  return days <= 60 ? 'd31to60' : 'over60';
}

export interface RefundableStudentFact {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  status: string;
  statusChangedAt: Date | null;
  createdAt: Date;
}

export interface LastEnrollmentFact {
  statusChangedAt: Date | null;
  group: { id: string; name: string };
}

export interface RefundableRow {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  kind: RefundableTab;
  /** 'YYYY-MM-DD' — frozen / ungrouped / left since. */
  since: string;
  days: number;
  ageBucket: AgeBucket;
  lastGroup: { id: string; name: string } | null;
  notice: NoticeCell | null;
}

/**
 * Since when the student is in their tab. Leaving a group keeps the status
 * ACTIVE, so an ungrouped student counts from the last enrollment's change;
 * frozen and left count from their own status change. Both fall back to the
 * status change, then the card's creation.
 */
export function sinceDay(
  kind: RefundableTab,
  s: RefundableStudentFact,
  last: LastEnrollmentFact | null,
): string {
  const at =
    (kind === 'guruhsiz' ? last?.statusChangedAt : null) ??
    s.statusChangedAt ??
    s.createdAt;
  return tashkentDateStr(at);
}

export function toRefundableRow(
  s: RefundableStudentFact,
  last: LastEnrollmentFact | null,
  latestNotice: { createdAt: Date; channel: NoticeCell['channel'] } | null,
  today: string,
): RefundableRow {
  const kind = refundableTab(s.status);
  const since = sinceDay(kind, s, last);
  const days = daysBetween(since, today);
  return {
    studentId: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    phone: s.phone,
    balance: s.balance,
    kind,
    since,
    days,
    ageBucket: ageBucket(days),
    lastGroup: last ? { id: last.group.id, name: last.group.name } : null,
    notice: latestValidNotice(latestNotice, s.statusChangedAt),
  };
}

/** Largest balance first, then the student id. */
export function sortRefundableRows(
  rows: readonly RefundableRow[],
): RefundableRow[] {
  return [...rows].sort(
    (a, b) => b.balance - a.balance || a.studentId - b.studentId,
  );
}

export function refundableTabTotals(
  rows: readonly RefundableRow[],
): Record<RefundableTab, { total: number; count: number }> {
  const out = {
    muzlatilgan: { total: 0, count: 0 },
    guruhsiz: { total: 0, count: 0 },
    ketgan: { total: 0, count: 0 },
  };
  for (const r of rows) {
    out[r.kind].total += r.balance;
    out[r.kind].count += 1;
  }
  return out;
}

/** The frozen tab's chips, over the rows given (the caller passes that tab's). */
export function chipCounts(
  rows: readonly RefundableRow[],
): Record<'all' | AgeBucket, number> {
  const out = { all: rows.length, upto30: 0, d31to60: 0, over60: 0 };
  for (const r of rows) out[r.ageBucket] += 1;
  return out;
}

export interface PendingDue {
  overdue: boolean;
  bankDays: number;
}

/**
 * «N bank kuni qoldi» / «muddati o'tdi · N bank kuni». Both branches count
 * forward (earlier day first), so `bankDays` is never negative and never -0.
 */
export function pendingDue(
  today: string,
  dueDate: string,
  holidays: ReadonlySet<string>,
): PendingDue {
  return today > dueDate
    ? { overdue: true, bankDays: bankDaysBetween(dueDate, today, holidays) }
    : { overdue: false, bankDays: bankDaysBetween(today, dueDate, holidays) };
}

export interface PendingFact {
  id: string;
  studentId: number;
  requestedAmount: number;
  approvedAmount: number | null;
  createdAt: Date;
  dueDate: Date | null;
  reason: string | null;
  student: {
    firstName: string;
    lastName: string;
    phone: string;
    branches: { branchId: number }[];
  };
}

export interface PendingRefundRow {
  id: string;
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number | null;
  amount: number;
  requestedAt: string;
  dueDate: string;
  due: PendingDue;
  reason: string | null;
}

export function pendingBranchId(r: PendingFact): number | null {
  return r.student.branches[0]?.branchId ?? null;
}

export function toPendingRow(
  r: PendingFact,
  today: string,
  holidays: ReadonlySet<string>,
): PendingRefundRow {
  // Every request is written with a due date; `today` only guards bad data.
  const dueDate = r.dueDate ? tashkentDateStr(r.dueDate) : today;
  return {
    id: r.id,
    studentId: r.studentId,
    firstName: r.student.firstName,
    lastName: r.student.lastName,
    phone: r.student.phone,
    branchId: pendingBranchId(r),
    amount: r.approvedAmount ?? r.requestedAmount,
    requestedAt: r.createdAt.toISOString(),
    dueDate,
    due: pendingDue(today, dueDate, holidays),
    reason: r.reason,
  };
}

/** The pill as text (Excel; the client renders its own). */
export function pendingDueLabel(d: PendingDue): string {
  if (!d.overdue) {
    // Zero bank days left is the due day itself.
    return d.bankDays > 0
      ? `${d.bankDays} bank kuni qoldi`
      : 'bugun oxirgi kun';
  }
  return d.bankDays > 0
    ? `muddati o'tdi · ${d.bankDays} bank kuni`
    : "muddati o'tdi";
}

/** The «Xabar» cell as text. */
export function noticeLabel(n: NoticeCell | null): string {
  if (!n) return 'berilmagan';
  return `${dm(n.date)} · ${n.channel === 'BOT' ? 'bot orqali' : "qo'ng'iroq qilib aytildi"}`;
}
