import {
  KpiResultStatus,
  KpiResultType,
  KpiRuleMode,
  LeadConversionKind,
  LeadStatus,
  PaymentPromiseStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { whereUserMayAct } from '../common/auth/blocked-user';
import { tashkentMonthKey } from '../common/date/tashkent';
import {
  KPI_START,
  isKpiEligible,
  kpiAmount,
  promiseOldEnough,
  type KpiSettings,
} from './kpi-rules';

/**
 * What a payment earns (ADR-0095, spec §7.2), read without writing. Every
 * `KpiResult` write stays in `KpiResultsService`.
 */

/** A result about to be written (spec §7.5): every column but the generated ones. */
export interface KpiDraft {
  companyId: number;
  branchId: number | null;
  userId: number;
  type: KpiResultType;
  leadId: string | null;
  promiseId: string | null;
  studentId: number;
  paymentId: string;
  paymentAmount: number;
  baseAmount: number;
  ruleMode: KpiRuleMode;
  ruleValue: number;
  amount: number;
  month: string;
  occurredAt: Date;
  replacesResultId: string | null;
}

/**
 * Values the backfill would restore but has not written yet (its dry run):
 * a lead's conversion kind, and the payment (`resolvers`: promise id →
 * payment id) that made a promise KEPT before `resolvedPaymentId` existed.
 */
export interface KpiRestore {
  kinds: ReadonlyMap<string, LeadConversionKind>;
  resolvers: ReadonlyMap<string, string>;
}

export const PAYMENT_FACTS = {
  id: true,
  studentId: true,
  amount: true,
  status: true,
  createdAt: true,
  companyId: true,
  branchId: true,
  correctsPaymentId: true,
} satisfies Prisma.PaymentSelect;
export type PaymentFacts = Prisma.PaymentGetPayload<{
  select: typeof PAYMENT_FACTS;
}>;
export type Eligible = (userId: number) => Promise<boolean>;

/** The conversions that earn a LEAD_PAID (spec §7.2): a new student, or one who came back. */
const EARNING_KINDS: readonly LeadConversionKind[] = [
  LeadConversionKind.NEW_STUDENT,
  LeadConversionKind.RETURNING,
];

/** Spec §7.1/1, read from the database when the result is written. Cached per call. */
export function eligibility(db: PrismaService): Eligible {
  const cache = new Map<number, boolean>();
  return async (userId) => {
    const hit = cache.get(userId);
    if (hit !== undefined) return hit;
    const user = await db.user.findFirst({
      where: { id: userId, ...whereUserMayAct() },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const ok = !!user && isKpiEligible(user.roles.map((r) => r.role.name));
    cache.set(userId, ok);
    return ok;
  };
}

/**
 * Spec §7.2 LEAD_PAID: each converted lead of the student with an owner gets
 * the student's first COMPLETED payment after the conversion that no other
 * lead holds. A converted lead archived with its section still counts (no
 * `deletedAt` filter): the conversion happened.
 */
export async function planLeadPaid(
  db: PrismaService,
  studentId: number,
  companyId: number,
  settings: KpiSettings,
  since: Date,
  eligible: Eligible,
  restore?: KpiRestore,
): Promise<KpiDraft[]> {
  const leads = await db.lead.findMany({
    where: {
      companyId,
      convertedStudentId: studentId,
      statusEnum: LeadStatus.CONVERTED,
      ownerId: { not: null },
      statusChangedAt: { gte: KPI_START },
    },
    select: {
      id: true,
      ownerId: true,
      branchId: true,
      statusChangedAt: true,
      conversionKind: true,
    },
    orderBy: [{ statusChangedAt: 'asc' }, { id: 'asc' }],
  });
  if (leads.length === 0) return [];
  const active = await db.kpiResult.findMany({
    where: {
      type: KpiResultType.LEAD_PAID,
      status: KpiResultStatus.ACTIVE,
      studentId,
    },
    select: { leadId: true, paymentId: true },
  });
  const done = new Set(active.map((r) => r.leadId));
  const usedPayments = active.map((r) => r.paymentId);

  const drafts: KpiDraft[] = [];
  for (const lead of leads) {
    const kind = lead.conversionKind ?? restore?.kinds.get(lead.id) ?? null;
    if (!kind || !EARNING_KINDS.includes(kind)) continue;
    if (
      done.has(lead.id) ||
      lead.ownerId == null ||
      lead.statusChangedAt == null
    )
      continue;
    const first = await db.payment.findFirst({
      where: {
        studentId,
        companyId,
        status: PaymentStatus.COMPLETED,
        createdAt: { gte: lead.statusChangedAt },
        // A copy: the list grows below, and the query must keep what it was asked.
        id: { notIn: [...usedPayments] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amount: true, createdAt: true, branchId: true },
    });
    // Paid while the switch was off: that result is never written later.
    if (!first || first.createdAt < since) continue;
    if (!(await eligible(lead.ownerId))) continue;
    usedPayments.push(first.id);
    drafts.push({
      companyId,
      branchId: lead.branchId ?? first.branchId,
      userId: lead.ownerId,
      type: KpiResultType.LEAD_PAID,
      leadId: lead.id,
      promiseId: null,
      studentId,
      paymentId: first.id,
      paymentAmount: first.amount,
      baseAmount: first.amount,
      ruleMode: settings.leadPaid.mode,
      ruleValue: settings.leadPaid.value,
      amount: kpiAmount(settings.leadPaid, first.amount),
      month: tashkentMonthKey(first.createdAt),
      occurredAt: first.createdAt,
      replacesResultId: null,
    });
  }
  return drafts;
}

/** Spec §7.2 PROMISE_KEPT: the promises this payment made KEPT, to their writer. */
export async function planPromiseKept(
  db: PrismaService,
  payment: PaymentFacts,
  settings: KpiSettings,
  since: Date,
  eligible: Eligible,
  restore?: KpiRestore,
): Promise<KpiDraft[]> {
  if (payment.createdAt < since) return [];
  const restored = restore
    ? [...restore.resolvers]
        .filter(([, paymentId]) => paymentId === payment.id)
        .map(([id]) => id)
    : [];
  const promises = await db.paymentPromise.findMany({
    where: restored.length
      ? {
          status: PaymentPromiseStatus.KEPT,
          OR: [{ resolvedPaymentId: payment.id }, { id: { in: restored } }],
        }
      : { resolvedPaymentId: payment.id, status: PaymentPromiseStatus.KEPT },
    select: {
      id: true,
      createdById: true,
      balanceAtPromise: true,
      branchId: true,
      studentId: true,
      companyId: true,
      createdAt: true,
    },
  });
  if (promises.length === 0) return [];
  const done = new Set(
    (
      await db.kpiResult.findMany({
        where: {
          type: KpiResultType.PROMISE_KEPT,
          status: KpiResultStatus.ACTIVE,
          promiseId: { in: promises.map((p) => p.id) },
        },
        select: { promiseId: true },
      })
    ).map((r) => r.promiseId),
  );
  const drafts: KpiDraft[] = [];
  for (const p of promises) {
    if (
      done.has(p.id) ||
      !promiseOldEnough(p.createdAt, payment.createdAt) ||
      !(await eligible(p.createdById))
    )
      continue;
    const base = Math.max(0, -p.balanceAtPromise);
    drafts.push({
      companyId: p.companyId,
      branchId: p.branchId ?? payment.branchId,
      userId: p.createdById,
      type: KpiResultType.PROMISE_KEPT,
      leadId: null,
      promiseId: p.id,
      studentId: p.studentId,
      paymentId: payment.id,
      paymentAmount: payment.amount,
      baseAmount: base,
      ruleMode: settings.promiseKept.mode,
      ruleValue: settings.promiseKept.value,
      amount: kpiAmount(settings.promiseKept, base),
      month: tashkentMonthKey(payment.createdAt),
      occurredAt: payment.createdAt,
      replacesResultId: null,
    });
  }
  return drafts;
}

/**
 * A corrected amount (spec §7.3): the old result on the re-post under its
 * sealed rule. A percent LEAD_PAID is re-read from the new amount; a
 * promise keeps its debt as the base.
 */
export function movedDraft(
  old: Pick<
    KpiDraft,
    | 'companyId'
    | 'branchId'
    | 'userId'
    | 'type'
    | 'leadId'
    | 'promiseId'
    | 'studentId'
    | 'baseAmount'
    | 'ruleMode'
    | 'ruleValue'
  > & { id: string },
  payment: Pick<PaymentFacts, 'id' | 'amount' | 'createdAt'>,
): KpiDraft {
  const base =
    old.type === KpiResultType.LEAD_PAID ? payment.amount : old.baseAmount;
  return {
    companyId: old.companyId,
    branchId: old.branchId,
    userId: old.userId,
    type: old.type,
    leadId: old.leadId,
    promiseId: old.promiseId,
    studentId: old.studentId,
    paymentId: payment.id,
    paymentAmount: payment.amount,
    baseAmount: base,
    ruleMode: old.ruleMode,
    ruleValue: old.ruleValue,
    amount: kpiAmount({ mode: old.ruleMode, value: old.ruleValue }, base),
    month: tashkentMonthKey(payment.createdAt),
    occurredAt: payment.createdAt,
    replacesResultId: old.id,
  };
}
