import {
  Prisma,
  UserStatus,
  type TaskKind,
  type TaskPriority,
} from '@prisma/client';
import {
  TASHKENT_OFFSET_MS,
  dayOfWeekForDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { formatSom } from '../payments/shared/format-som';
import { CALL_LOG_CREATED } from '../call-logs/call-log-events';
import { LEAD_CALLED } from '../leads/lead-events';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import { lessonTaskAssigneeIds, nextWorkingDay } from './lesson-task';
import { defaultDueAt, shiftSystemDueAt } from './task-due';

type Db = Prisma.TransactionClient;

/**
 * Automatic tasks (spec 2026-10-07 §7) — every rule in this one file: kind,
 * priority, source key, the events that close it, the texts, who, when.
 * «Dars bo'ldimi?» (LESSON_QUESTION) keeps its own file, `lesson-task.ts`, and
 * «Yangi o'quvchi so'rovi» (JOIN_REQUEST) its own, `join-request-task.ts`:
 * neither is an AutoKind. Adding a kind = an entry in AUTO_RULES, its text
 * below, its creator in `task-auto*.service.ts`.
 */
export type AutoKind = 'BROKEN_PROMISE' | 'CALLBACK' | 'UNCALLED_LEAD';
export const AUTO_KINDS: readonly AutoKind[] = [
  'BROKEN_PROMISE',
  'CALLBACK',
  'UNCALLED_LEAD',
];

interface AutoRule {
  priority: TaskPriority;
  /** What the task links to: the «Topshiriqlar» panel and the source card read it. */
  entityType: 'Student' | 'Lead';
  /** `sourceKey` = `<prefix>:<id>`; one OPEN task per key (`task_open_source_unique`). */
  sourcePrefix: 'promise' | 'calllog' | 'lead';
  /**
   * The events that close it (`TaskAutoCloseListener`). Nothing else does.
   * A `payment.received` closes a BROKEN_PROMISE only when
   * `paymentClosesBrokenPromise` says the debt is gone; a CallLog event closes
   * it whatever its result.
   */
  closesOn: readonly string[];
}

export const AUTO_RULES: Record<AutoKind, AutoRule> = {
  BROKEN_PROMISE: {
    priority: 'HIGH',
    entityType: 'Student',
    sourcePrefix: 'promise',
    closesOn: ['payment.received', CALL_LOG_CREATED],
  },
  CALLBACK: {
    priority: 'MEDIUM',
    entityType: 'Student',
    sourcePrefix: 'calllog',
    closesOn: ['payment.received', CALL_LOG_CREATED],
  },
  UNCALLED_LEAD: {
    priority: 'HIGH',
    entityType: 'Lead',
    sourcePrefix: 'lead',
    closesOn: [LEAD_CALLED, 'entity.status.changed'],
  },
};

export const sourceKeyOf = (kind: AutoKind, id: string): string =>
  `${AUTO_RULES[kind].sourcePrefix}:${id}`;

export const kindsClosedBy = (event: string): AutoKind[] =>
  AUTO_KINDS.filter((k) => AUTO_RULES[k].closesOn.includes(event));

/**
 * A payment closes a broken-promise task only when the debt is gone
 * (`studentBalance` after the payment): a partial payment keeps it open.
 * Same threshold as the 09:00 alert — a debt under it was never listed.
 */
export const paymentClosesBrokenPromise = (studentBalance: number): boolean =>
  studentBalance > -MIN_ALERT_DEBT;

/** `TaskEvent.meta.reason` of an automatic close; the client words it (task-feed-text.ts). */
export type AutoCloseReason =
  | 'PAYMENT_RECEIVED'
  | 'CALL_LOGGED'
  | 'LEAD_CALLED'
  | 'LEAD_STATUS_CHANGED'
  | 'LEAD_GONE'
  | 'STUDENT_GONE'
  | 'DEBT_CLEARED';

// ---------- when ----------

/** A lead waits this long without a call before it becomes a task. */
export const UNCALLED_LEAD_AGE_MS = 24 * 3_600_000;

/** A lead that still waits for its first call. */
export const UNCALLED_LEAD_WHERE: Prisma.LeadWhereInput = {
  calledAt: null,
  statusEnum: 'NEW',
  deletedAt: null,
};

/** Spec §9.6: the lead run works 08:00–18:00, Monday–Saturday (Tashkent). */
export function uncalledLeadWindowOpen(now: Date): boolean {
  const hour = new Date(now.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
  return (
    dayOfWeekForDateStr(tashkentDateStr(now)) !== 0 && hour >= 8 && hour <= 18
  );
}

/**
 * 18:00 Tashkent on `dateStr`, moved off a Sunday or a branch holiday. A day
 * already behind us counts as today, and a due that is already past (the 18:00
 * run, a callback logged in the evening for today) moves to the next working
 * day 18:00: a task is never born overdue.
 */
export function systemDueAt(
  dateStr: string,
  holidays: ReadonlySet<string>,
  now: Date,
): Date {
  const today = tashkentDateStr(now);
  const day = dateStr < today ? today : dateStr;
  const due = shiftSystemDueAt(defaultDueAt(day), holidays);
  if (due.getTime() > now.getTime()) return due;
  return defaultDueAt(nextWorkingDay(tashkentDateStr(due), holidays));
}

const TELEGRAM_FROM_HOUR = 8;

/**
 * A callback is for its own day: its Telegram notice waits for 08:00 of the
 * due day (spec §7). The bell gets it at once. Every other task: null.
 */
export function telegramNotBefore(
  kind: TaskKind,
  dueAt: Date | null,
): Date | null {
  if (kind !== 'CALLBACK' || !dueAt) return null;
  return new Date(
    utcMidnightFromDateStr(tashkentDateStr(dueAt)).getTime() +
      TELEGRAM_FROM_HOUR * 3_600_000 -
      TASHKENT_OFFSET_MS,
  );
}

// ---------- who ----------

const ACTIVE_STAFF = {
  deletedAt: null,
  isActive: true,
  status: UserStatus.ACTIVE,
};

/**
 * The branch's administrators (then directors, then CEOs) — the
 * «Dars bo'ldimi?» ladder. A source with no branch (a lead from before the
 * per-branch board) goes to the whole company's administrators the same way.
 */
export async function autoTaskAssigneeIds(
  db: Db,
  companyId: number,
  branchId: number | null,
): Promise<number[]> {
  if (branchId !== null) return lessonTaskAssigneeIds(db, companyId, branchId);
  for (const role of ['Administrator', 'Branch Director', 'CEO']) {
    const users = await db.user.findMany({
      where: {
        ...ACTIVE_STAFF,
        companyId,
        roles: { some: { role: { name: role } } },
      },
      select: { id: true },
    });
    if (users.length > 0) return users.map((u) => u.id);
  }
  return [];
}

/** A callback belongs to whoever logged the call, while they still work here. */
export async function callbackAssigneeIds(
  db: Db,
  companyId: number,
  userId: number,
): Promise<number[]> {
  const u = await db.user.findFirst({
    where: { ...ACTIVE_STAFF, id: userId, companyId },
    select: { id: true },
  });
  return u ? [u.id] : [];
}

// ---------- texts ----------

const ddmmyyyy = (d: Date) => tashkentDateStr(d).split('-').reverse().join('.');

export const studentName = (p: { firstName: string; lastName: string }) =>
  `${p.lastName} ${p.firstName}`.trim();

export function brokenPromiseText(a: {
  name: string;
  debt: number;
  promiseDate: Date;
  promisedAmount: number | null;
  comment: string | null;
}): { title: string; description: string } {
  const lines = [`Va'da sanasi: ${ddmmyyyy(a.promiseDate)}`];
  if (a.promisedAmount) {
    lines.push(`Va'da summasi: ${formatSom(a.promisedAmount)} so'm`);
  }
  const comment = a.comment?.trim();
  if (comment) lines.push(`Izoh: ${comment}`);
  return {
    title: `Va'da buzildi: ${a.name} — qarz ${formatSom(a.debt)} so'm`,
    description: lines.join('\n'),
  };
}

export function callbackText(a: { name: string; note: string | null }): {
  title: string;
  description: string | null;
} {
  const note = a.note?.trim();
  return {
    title: `Qayta qo'ng'iroq: ${a.name}`,
    description: note ? `Oldingi qo'ng'iroq izohi: ${note}` : null,
  };
}

export function uncalledLeadText(a: { name: string }): {
  title: string;
  description: string | null;
} {
  return {
    title: `Lidga qo'ng'iroq qilinmagan: ${a.name}`,
    description: null,
  };
}
