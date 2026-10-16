/**
 * KPI results since KPI_START (ADR-0094, spec §7.6), written by the same
 * `KpiResultsService` the payment events use. Run once after the deploy.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/kpi-backfill.ts [--expect=<N>] [--apply]
 *
 * Dry run (default): the connection is read-only (checked, else it stops).
 * It restores in memory (1) the `conversionKind` of the leads converted since
 * KPI_START that have none, and (2) the `resolvedPaymentId` of the promises
 * KEPT since KPI_START that have none (`resolvingPaymentId`: the student's
 * latest COMPLETED payment in the 60 seconds up to `resolvedAt`); then it
 * plans every COMPLETED payment since KPI_START oldest first and prints the
 * kinds, the links, the results per type and N (kinds + links + results).
 * `--apply --expect=<N>` plans again and stops before writing if the count
 * differs; then it writes the kinds and the links and records the payments
 * one by one. A failed payment is logged, the run goes on and exits
 * non-zero; a repeat writes nothing new.
 */
import {
  LeadConversionKind,
  LeadStatus,
  PaymentPromiseStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { KpiSettingsService } from '../src/kpi/kpi-settings.service';
import {
  KpiResultsService,
  type KpiDraft,
  type KpiRestore,
} from '../src/kpi/kpi-results.service';
import { KPI_START } from '../src/kpi/kpi-rules';
import {
  RESOLVE_WINDOW_MS,
  resolvingPaymentId,
  restoredConversionKind,
} from '../src/kpi/kpi-backfill-restore';
import { LEAD_LINKED_REASON } from '../src/leads/leads.service';
import { formatSom } from '../src/payments/shared/format-som';
import { printHeader } from './lib/check-cli';
import { parseApplyExpectArgs, UsageError } from './lib/apply-expect-args';

const USAGE =
  'Usage: kpi-backfill.ts [--expect=<N>] [--apply]  (--apply requires --expect=<N>)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

/** The kind each lead converted since KPI_START without one gets back. */
async function missingKinds(
  prisma: PrismaService,
): Promise<Map<string, LeadConversionKind>> {
  const leads = await prisma.lead.findMany({
    where: {
      statusEnum: LeadStatus.CONVERTED,
      conversionKind: null,
      convertedStudentId: { not: null },
      statusChangedAt: { gte: KPI_START },
    },
    select: {
      id: true,
      convertedStudentId: true,
      statusChangedAt: true,
      statusChangeReason: true,
    },
  });
  const out = new Map<string, LeadConversionKind>();
  for (const lead of leads) {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: lead.convertedStudentId as number, deletedAt: null },
      select: {
        createdAt: true,
        statusChangedAt: true,
        status: true,
        stateLog: {
          select: { status: true, transitionAt: true },
          orderBy: { transitionAt: 'asc' },
        },
      },
    });
    out.set(
      lead.id,
      restoredConversionKind(
        lead.statusChangeReason === LEAD_LINKED_REASON,
        enrollments.map((e) => ({
          createdAt: e.createdAt,
          statusChangedAt: e.statusChangedAt,
          status: e.status,
          log: e.stateLog,
        })),
        lead.statusChangedAt as Date,
      ),
    );
  }
  return out;
}

/** promise id → the payment that kept it, for KEPT promises since KPI_START without one. */
async function missingResolvers(
  prisma: PrismaService,
): Promise<Map<string, string>> {
  const promises = await prisma.paymentPromise.findMany({
    where: {
      status: PaymentPromiseStatus.KEPT,
      resolvedPaymentId: null,
      resolvedAt: { gte: KPI_START },
    },
    select: { id: true, studentId: true, resolvedAt: true },
  });
  const out = new Map<string, string>();
  let unmatched = 0;
  for (const p of promises) {
    const resolvedAt = p.resolvedAt as Date;
    const payments = await prisma.payment.findMany({
      where: {
        studentId: p.studentId,
        status: PaymentStatus.COMPLETED,
        createdAt: {
          gte: new Date(resolvedAt.getTime() - RESOLVE_WINDOW_MS),
          lte: resolvedAt,
        },
      },
      select: { id: true, createdAt: true },
    });
    const paymentId = resolvingPaymentId(resolvedAt, payments);
    if (paymentId) out.set(p.id, paymentId);
    else unmatched += 1;
  }
  console.log(
    `promises KEPT without a payment: ${promises.length}, linked: ${out.size}, unmatched: ${unmatched}`,
  );
  return out;
}

function paymentsSinceStart(prisma: PrismaService) {
  return prisma.payment.findMany({
    where: { status: PaymentStatus.COMPLETED, createdAt: { gte: KPI_START } },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** What would be written: one result per lead and per promise. */
async function plan(
  prisma: PrismaService,
  results: KpiResultsService,
  restore: KpiRestore,
): Promise<KpiDraft[]> {
  const byKey = new Map<string, KpiDraft>();
  for (const p of await paymentsSinceStart(prisma)) {
    for (const d of await results.planForPayment(p.id, restore)) {
      const key = d.type === 'LEAD_PAID' ? `L:${d.leadId}` : `P:${d.promiseId}`;
      if (!byKey.has(key)) byKey.set(key, d);
    }
  }
  return [...byKey.values()];
}

async function main() {
  // Refuse a bad command line before anything connects.
  const { apply: APPLY, expect } = parseApplyExpectArgs(
    process.argv.slice(2),
    USAGE,
  );
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  // No Redis: the settings cache reads the database (settings-cache.ts); the
  // script never writes a setting, so history is never asked for.
  const settings = new SettingsService(prisma, null as never, null as never);
  const results = new KpiResultsService(
    prisma,
    new KpiSettingsService(settings),
  );
  try {
    printHeader(
      `KPI backfill since ${KPI_START.toISOString()} — ${APPLY ? 'APPLY' : 'DRY RUN'}`,
    );
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    const restore: KpiRestore = {
      kinds: await missingKinds(prisma),
      resolvers: await missingResolvers(prisma),
    };
    const drafts = await plan(prisma, results, restore);
    for (const kind of Object.values(LeadConversionKind)) {
      console.log(
        `kind ${kind}\t${[...restore.kinds.values()].filter((k) => k === kind).length}`,
      );
    }
    for (const type of ['LEAD_PAID', 'PROMISE_KEPT'] as const) {
      const list = drafts.filter((d) => d.type === type);
      console.log(
        `${type}\t${list.length}\t${formatSom(list.reduce((s, d) => s + d.amount, 0))} so'm`,
      );
    }
    const total = restore.kinds.size + restore.resolvers.size + drafts.length;
    console.log(
      `\ntotal: ${total} (kinds ${restore.kinds.size} + links ${restore.resolvers.size} + results ${drafts.length})`,
    );
    if (!APPLY) return;

    // What was reviewed is what gets written.
    if (expect !== total) {
      throw new UsageError(
        `This run found ${total} but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    // The kinds and the links first: the results need them.
    for (const [id, kind] of restore.kinds) {
      await prisma.lead.updateMany({
        where: { id, conversionKind: null },
        data: { conversionKind: kind },
      });
    }
    for (const [id, paymentId] of restore.resolvers) {
      await prisma.paymentPromise.updateMany({
        where: { id, resolvedPaymentId: null },
        data: { resolvedPaymentId: paymentId },
      });
    }
    let written = 0;
    let failed = 0;
    for (const p of await paymentsSinceStart(prisma)) {
      try {
        written += (await results.recordForPayment(p.id)).length;
      } catch (err) {
        failed += 1;
        console.error(
          `FAILED ${p.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    console.log(
      `kinds written: ${restore.kinds.size}, links written: ${restore.resolvers.size}, results written: ${written}`,
    );
    if (failed > 0) {
      console.error(
        `${failed} payment(s) failed — repeat the same command to retry them.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? err.message : err);
  process.exitCode = 1;
});
