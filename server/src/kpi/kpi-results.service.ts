import { Injectable, Logger } from '@nestjs/common';
import { KpiResultStatus, KpiResultType, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { describeError } from '../telegram-digest/telegram-send';
import { KpiSettingsService } from './kpi-settings.service';
import { CANCEL_REASON, recordingSince } from './kpi-rules';
import {
  PAYMENT_FACTS,
  eligibility,
  movedDraft,
  planLeadPaid,
  planPromiseKept,
  type KpiDraft,
  type KpiRestore,
  type PaymentFacts,
} from './kpi-results.plan';

export type { KpiDraft, KpiRestore } from './kpi-results.plan';

/** The nightly repair walks this far back (spec §7.6). */
const SELF_HEAL_WINDOW_MS = 2 * 86_400_000;

/**
 * The one writer of `KpiResult` (ADR-0094; `kpi-write.single-source.spec.ts`).
 * Called after a payment commits (`KpiRecorderListener`), by the nightly
 * repair and by the backfill. Every call is safe to repeat: the partial
 * unique indexes keep one ACTIVE result per lead, per LEAD_PAID payment and
 * per promise, and a lost race is skipped.
 */
@Injectable()
export class KpiResultsService {
  private readonly logger = new Logger(KpiResultsService.name);

  constructor(
    private prisma: PrismaService,
    private kpiSettings: KpiSettingsService,
  ) {}

  /**
   * What a COMPLETED payment earns, without writing: the student's LEAD_PAID
   * and the PROMISE_KEPT of the promises this payment kept. The backfill's
   * dry run reads it; `restore` supplies what it would restore first.
   */
  async planForPayment(
    paymentId: string,
    restore?: KpiRestore,
  ): Promise<KpiDraft[]> {
    const payment = await this.payment(paymentId);
    return payment ? this.planFor(payment, restore) : [];
  }

  /**
   * Writes what `planForPayment` finds; returns what was written. A
   * correction's re-post first carries the old payment's results over.
   */
  async recordForPayment(paymentId: string): Promise<KpiDraft[]> {
    const payment = await this.payment(paymentId);
    if (!payment) return [];
    const written: KpiDraft[] = [];
    if (payment.correctsPaymentId) {
      written.push(...(await this.moveCorrected(payment)));
    }
    for (const draft of await this.planFor(payment)) {
      if (await this.insert(draft)) written.push(draft);
    }
    return written;
  }

  /**
   * A payment that no longer stands (spec §7.3): its ACTIVE results are
   * cancelled — also while the switch is off. After a plain reversal the
   * lead takes its next earliest payment; a correction leaves that to the
   * re-post, which carries the old result over (`moveCorrected`).
   */
  async cancelForPayment(
    paymentId: string,
    opts: { correction: boolean },
    now: Date = new Date(),
  ): Promise<number> {
    const active = await this.prisma.kpiResult.findMany({
      where: { paymentId, status: KpiResultStatus.ACTIVE },
      select: { id: true, type: true, studentId: true, companyId: true },
    });
    if (active.length === 0) return 0;
    const { count } = await this.prisma.kpiResult.updateMany({
      where: {
        id: { in: active.map((r) => r.id) },
        status: KpiResultStatus.ACTIVE,
      },
      data: {
        status: KpiResultStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: opts.correction
          ? CANCEL_REASON.CORRECTED
          : CANCEL_REASON.REVERSED,
      },
    });
    if (!opts.correction) {
      const students = new Map(
        active
          .filter((r) => r.type === KpiResultType.LEAD_PAID)
          .map((r) => [r.studentId, r.companyId] as const),
      );
      for (const [studentId, companyId] of students) {
        await this.rechooseLeadPaid(studentId, companyId);
      }
    }
    return count;
  }

  /**
   * The nightly repair (spec §7.6): results of payments that no longer stand
   * are cancelled (a correction's are moved to its re-post), and the last two
   * days' COMPLETED payments are recorded again. Idempotent; one failing
   * payment is logged and the run goes on.
   */
  async selfHeal(now: Date): Promise<{ cancelled: number; written: number }> {
    let cancelled = 0;
    let written = 0;
    // ponytail: scans every ACTIVE result's payment; narrow to recent months if the table grows past a few thousand rows.
    const standing = await this.prisma.kpiResult.findMany({
      where: { status: KpiResultStatus.ACTIVE },
      select: { paymentId: true },
      distinct: ['paymentId'],
    });
    const gone = standing.length
      ? await this.prisma.payment.findMany({
          where: {
            id: { in: standing.map((r) => r.paymentId) },
            status: { not: PaymentStatus.COMPLETED },
          },
          select: { id: true },
        })
      : [];
    for (const p of gone) {
      try {
        // A corrected payment's rows are looked up by the CORRECTED reason
        // (`moveCorrected`), so the cancel must say it was a correction.
        const corrector = await this.prisma.payment.findFirst({
          where: { correctsPaymentId: p.id },
          select: { id: true },
        });
        cancelled += await this.cancelForPayment(
          p.id,
          { correction: corrector != null },
          now,
        );
        if (corrector) {
          written += (await this.recordForPayment(corrector.id)).length;
        }
      } catch (e) {
        this.logger.warn(
          `KPI repair of payment ${p.id} failed: ${describeError(e)}`,
        );
      }
    }
    const recent = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        createdAt: { gte: new Date(now.getTime() - SELF_HEAL_WINDOW_MS) },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const p of recent) {
      try {
        written += (await this.recordForPayment(p.id)).length;
      } catch (e) {
        this.logger.warn(
          `KPI of payment ${p.id} not recorded: ${describeError(e)}`,
        );
      }
    }
    return { cancelled, written };
  }

  /** The lead's next earliest COMPLETED payment becomes its result — a new result, so the switch applies. */
  private async rechooseLeadPaid(
    studentId: number,
    companyId: number,
  ): Promise<void> {
    const settings = await this.kpiSettings.read(companyId);
    const since = recordingSince(settings);
    if (!since) return;
    const drafts = await planLeadPaid(
      this.prisma,
      studentId,
      companyId,
      settings,
      since,
      eligibility(this.prisma),
    );
    for (const draft of drafts) await this.insert(draft);
  }

  /**
   * A corrected amount (spec §7.3): the old payment's results move to the
   * re-post under their sealed rule (`movedDraft`). Written whatever the
   * switch says (a result moved is not a new one). Safe to repeat, and safe
   * in either order with the reversal's own handler.
   *
   * A moved PROMISE_KEPT also takes its promise along: the correction left
   * `PaymentPromise.resolvedPaymentId` on the REVERSED payment, so it is
   * re-pointed to the re-post. ponytail: this is a second write after the
   * result's insert, not one transaction (the writer runs on plain
   * `prisma`); it is guarded on the old id and runs for already-moved
   * results too, so a repeat finishes a half-done move.
   */
  private async moveCorrected(
    payment: PaymentFacts,
    now: Date = new Date(),
  ): Promise<KpiDraft[]> {
    const oldPaymentId = payment.correctsPaymentId as string;
    await this.prisma.kpiResult.updateMany({
      where: { paymentId: oldPaymentId, status: KpiResultStatus.ACTIVE },
      data: {
        status: KpiResultStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: CANCEL_REASON.CORRECTED,
      },
    });
    const old = await this.prisma.kpiResult.findMany({
      where: { paymentId: oldPaymentId, cancelReason: CANCEL_REASON.CORRECTED },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (old.length === 0) return [];
    const moved = new Set(
      (
        await this.prisma.kpiResult.findMany({
          where: { replacesResultId: { in: old.map((r) => r.id) } },
          select: { replacesResultId: true },
        })
      ).map((r) => r.replacesResultId),
    );
    const written: KpiDraft[] = [];
    for (const r of old) {
      if (!moved.has(r.id)) {
        const draft = movedDraft(r, payment);
        if (await this.insert(draft)) written.push(draft);
      }
      if (r.type === KpiResultType.PROMISE_KEPT && r.promiseId) {
        await this.prisma.paymentPromise.updateMany({
          where: { id: r.promiseId, resolvedPaymentId: oldPaymentId },
          data: { resolvedPaymentId: payment.id },
        });
      }
    }
    return written;
  }

  private async payment(id: string): Promise<PaymentFacts | null> {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      select: PAYMENT_FACTS,
    });
    return p && p.status === PaymentStatus.COMPLETED ? p : null;
  }

  private async planFor(
    payment: PaymentFacts,
    restore?: KpiRestore,
  ): Promise<KpiDraft[]> {
    const settings = await this.kpiSettings.read(payment.companyId);
    const since = recordingSince(settings);
    if (!since) return [];
    const eligible = eligibility(this.prisma);
    return [
      ...(await planLeadPaid(
        this.prisma,
        payment.studentId,
        payment.companyId,
        settings,
        since,
        eligible,
        restore,
      )),
      ...(await planPromiseKept(
        this.prisma,
        payment,
        settings,
        since,
        eligible,
        restore,
      )),
    ];
  }

  /** The one insert. A writer that got there first is not an error. */
  private async insert(draft: KpiDraft): Promise<boolean> {
    try {
      await this.prisma.kpiResult.create({ data: draft });
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }
}

/**
 * The partial unique index refused a second ACTIVE result. The pg adapter
 * reports it as Prisma's P2002 or, unmapped, as raw Postgres 23505 in
 * `cause` (same reading as `isUniqueViolation` in tasks/task-auto-write.ts).
 */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === 'P2002' || e?.cause?.code === '23505';
}
