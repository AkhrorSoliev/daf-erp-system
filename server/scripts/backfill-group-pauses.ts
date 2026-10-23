/**
 * One-off (ADR-0119, §8): writes `GroupPause` rows for the pauses groups went
 * through since monthly billing began, from their status history. The nightly
 * job (23:15) then cancels the unheld lessons of the open pauses and of the
 * ones that ended in the last 14 days.
 *
 * Dry run (default, read-only): lists every pause it would write.
 *   railway run npx ts-node --transpile-only scripts/backfill-group-pauses.ts
 *
 * Apply:
 *   railway run npx ts-node --transpile-only scripts/backfill-group-pauses.ts --apply --expect=<N>
 *
 * Groups that already have a `GroupPause` are skipped, so a repeat is a no-op.
 * A branch pause (no `StatusHistory`, ADR-0099) is not found here: list those
 * groups from `EntityHistory` and open them by hand.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { utcMidnightFromDateStr } from '../src/common/date/tashkent';
import { pausesFromHistory } from '../src/groups/group-pause-backfill';

const SINCE = new Date('2026-09-26T00:00:00.000Z');
const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaService();
  try {
    const rows = await prisma.statusHistory.findMany({
      where: {
        entityType: 'Group',
        createdAt: { gte: SINCE },
        OR: [{ toStatus: 'PAUSED' }, { fromStatus: 'PAUSED' }],
      },
      orderBy: { createdAt: 'asc' },
    });
    const have = new Set(
      (await prisma.groupPause.findMany({ select: { groupId: true } })).map(
        (p) => p.groupId,
      ),
    );
    const plans = pausesFromHistory(
      rows
        .filter((r) => !have.has(r.entityId))
        .map((r) => ({
          groupId: r.entityId,
          companyId: r.companyId,
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          reason: r.reason,
          changedById: r.changedById,
          createdAt: r.createdAt,
        })),
    );
    const names = new Map(
      (
        await prisma.group.findMany({
          where: { id: { in: [...new Set(plans.map((p) => p.groupId))] } },
          select: { id: true, name: true },
        })
      ).map((g) => [g.id, g.name]),
    );
    for (const p of plans) {
      console.log(
        `${names.get(p.groupId) ?? p.groupId}  ${p.startedAt.toISOString().slice(0, 10)} → ${
          p.endedAt ? p.endedAt.toISOString().slice(0, 10) : 'hozir pauzada'
        }${p.resumeOn ? ` (qaytdi ${p.resumeOn})` : ''}  ${p.reason ?? ''}`,
      );
    }
    console.log(`\n${plans.length} ta pauza`);
    if (!apply) return console.log('DRY RUN — hech narsa yozilmadi.');
    if (Number(arg('expect')) !== plans.length) {
      throw new Error(`--expect=${plans.length} bo'lishi kerak`);
    }

    for (const p of plans) {
      await prisma.$transaction(async (tx) => {
        await tx.groupPause.create({
          data: {
            groupId: p.groupId,
            companyId: p.companyId,
            startedAt: p.startedAt,
            reason: p.reason,
            startedById: p.startedById,
            endedAt: p.endedAt,
            endedById: p.endedById,
            resumeOn: p.resumeOn ? utcMidnightFromDateStr(p.resumeOn) : null,
          },
        });
        if (p.resumeOn) {
          await tx.group.update({
            where: { id: p.groupId },
            data: { lastResumedOn: utcMidnightFromDateStr(p.resumeOn) },
          });
        }
      });
    }
    console.log(`Yozildi: ${plans.length}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
