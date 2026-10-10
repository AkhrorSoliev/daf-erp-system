import type { CallOutcome, CallReason, Prisma, TaskKind } from '@prisma/client';
import { studentName } from './task-auto-rules';

type Db = Prisma.TransactionClient;

export interface SourceCall {
  at: Date;
  outcome: CallOutcome;
  note: string | null;
  by: string;
}

/** What a system task's sheet shows about its source (spec §4 screen 10). */
export interface TaskSource {
  student?: {
    id: number;
    name: string;
    phone: string | null;
    debt: number;
    lastCall: SourceCall | null;
  };
  promise?: { date: Date; amount: number | null; comment: string | null };
  /** CALLBACK: the call that asked for it. */
  previousCall?: SourceCall;
  /** What «Qo'ng'iroqni yozish» pre-fills in the call dialog. */
  callReason?: CallReason;
  lead?: {
    id: string;
    name: string;
    phone: string;
    source: string | null;
    createdAt: Date;
  };
}

const CALL_SELECT = {
  id: true,
  createdAt: true,
  outcome: true,
  note: true,
  reason: true,
  calledBy: { select: { firstName: true, lastName: true } },
} as const;

const callLine = (c: {
  createdAt: Date;
  outcome: CallOutcome;
  note: string | null;
  calledBy: { firstName: string; lastName: string };
}): SourceCall => ({
  at: c.createdAt,
  outcome: c.outcome,
  note: c.note,
  by: `${c.calledBy.lastName} ${c.calledBy.firstName}`.trim(),
});

/**
 * `sameCallId`: the call a callback task came from. When it is also the
 * student's last call the card would print it twice, so `lastCall` stays null.
 */
async function studentFacts(
  db: Db,
  studentId: number,
  companyId: number,
  sameCallId?: string,
) {
  const s = await db.student.findFirst({
    where: { id: studentId, companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      balance: true,
    },
  });
  if (!s) return null;
  const last = await db.callLog.findFirst({
    where: { studentId, companyId },
    orderBy: { createdAt: 'desc' },
    select: CALL_SELECT,
  });
  return {
    id: s.id,
    name: studentName(s),
    phone: s.phone,
    debt: Math.max(0, -s.balance),
    lastCall: last && last.id !== sameCallId ? callLine(last) : null,
  };
}

/** Null for a manual task, «Dars bo'ldimi?» (its own prompt) or a source that is gone. */
export async function loadTaskSource(
  db: Db,
  t: { kind: TaskKind; sourceKey: string | null; companyId: number },
): Promise<TaskSource | null> {
  const id = t.sourceKey?.slice(t.sourceKey.indexOf(':') + 1);
  if (!id) return null;
  switch (t.kind) {
    case 'BROKEN_PROMISE': {
      const p = await db.paymentPromise.findFirst({
        where: { id, companyId: t.companyId },
        select: {
          promiseDate: true,
          promisedAmount: true,
          comment: true,
          studentId: true,
        },
      });
      const student = p && (await studentFacts(db, p.studentId, t.companyId));
      if (!p || !student) return null;
      return {
        student,
        promise: {
          date: p.promiseDate,
          amount: p.promisedAmount,
          comment: p.comment,
        },
        callReason: 'DEBT',
      };
    }
    case 'CALLBACK': {
      const c = await db.callLog.findFirst({
        where: { id, companyId: t.companyId },
        select: { ...CALL_SELECT, studentId: true },
      });
      const student =
        c && (await studentFacts(db, c.studentId, t.companyId, c.id));
      if (!c || !student) return null;
      return { student, previousCall: callLine(c), callReason: c.reason };
    }
    case 'UNCALLED_LEAD': {
      const l = await db.lead.findFirst({
        where: { id, companyId: t.companyId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
          source: { select: { name: true } },
        },
      });
      if (!l) return null;
      return {
        lead: {
          id: l.id,
          name: `${l.lastName} ${l.firstName}`.trim(),
          phone: l.phone,
          source: l.source?.name ?? null,
          createdAt: l.createdAt,
        },
      };
    }
    default:
      return null;
  }
}
