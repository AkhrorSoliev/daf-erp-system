import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KpiSettingsService } from './kpi-settings.service';
import { recordingSince } from './kpi-rules';
import {
  PAYMENT_FACTS,
  eligibility,
  planLeadPaid,
  planPromiseKept,
  type KpiDraft,
  type KpiRestore,
  type PaymentFacts,
} from './kpi-results.plan';

export type { KpiDraft, KpiRestore } from './kpi-results.plan';

/**
 * The one writer of `KpiResult` (ADR-0094; `kpi-write.single-source.spec.ts`).
 * Called after a payment commits (`KpiRecorderListener`), by the nightly
 * repair and by the backfill. Every call is safe to repeat: the partial
 * unique indexes keep one ACTIVE result per lead, per LEAD_PAID payment and
 * per promise, and a lost race is skipped.
 */
@Injectable()
export class KpiResultsService {
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

  /** Writes what `planForPayment` finds; returns what was written. */
  async recordForPayment(paymentId: string): Promise<KpiDraft[]> {
    const payment = await this.payment(paymentId);
    if (!payment) return [];
    const written: KpiDraft[] = [];
    for (const draft of await this.planFor(payment)) {
      if (await this.insert(draft)) written.push(draft);
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

  /** The one insert. A writer that got there first (`P2002`) is not an error. */
  private async insert(draft: KpiDraft): Promise<boolean> {
    try {
      await this.prisma.kpiResult.create({ data: draft });
      return true;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return false;
      }
      throw e;
    }
  }
}
