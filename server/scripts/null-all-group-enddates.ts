/**
 * null-all-group-enddates — set Group.endDate = NULL for all live (deletedAt IS NULL) groups.
 *
 * Motivation: auto-complete cron is intentionally disabled (2026-07-14), but the dashboard
 * schedule + attendance validation still gate on endDate, so groups whose endDate passes
 * silently drop off the schedule while staying ACTIVE. Nulling endDate makes them run
 * open-ended until manually COMPLETED. All endDate gates are null-safe.
 *
 * READ-ONLY by default (dry-run). Writes a full backup JSON first, then only updates
 * with --apply. Backup path is printed so the change can be reversed.
 *
 * Usage:
 *   railway run npx ts-node --transpile-only scripts/null-all-group-enddates.ts            (dry-run + backup)
 *   railway run npx ts-node --transpile-only scripts/null-all-group-enddates.ts --apply    (execute)
 */
import { writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { run } from './lib/check-cli';

const APPLY = process.argv.includes('--apply');
const BACKUP_PATH =
  process.argv.find((a) => a.startsWith('--backup='))?.slice('--backup='.length) ??
  '/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/36be5b77-a93a-49b1-81db-1d2581499c08/scratchpad/group-enddate-backup.json';

async function main(prisma: PrismaClient) {
  const groups = await prisma.group.findMany({
    where: { deletedAt: null },
    select: { id: true, groupNumber: true, name: true, status: true, statusEnum: true, endDate: true },
    orderBy: [{ statusEnum: 'asc' }, { groupNumber: 'asc' }],
  });

  const withEnd = groups.filter((g) => g.endDate !== null);

  // Distribution by statusEnum × endDate-presence
  const byStatus: Record<string, { total: number; withEnd: number }> = {};
  for (const g of groups) {
    const k = String(g.statusEnum);
    byStatus[k] ??= { total: 0, withEnd: 0 };
    byStatus[k].total++;
    if (g.endDate) byStatus[k].withEnd++;
  }

  console.log(`\nLive (deletedAt IS NULL) guruhlar: ${groups.length}`);
  console.log(`endDate hozir to'ldirilgan: ${withEnd.length}    bo'sh (null): ${groups.length - withEnd.length}\n`);
  console.log('Status kesimida (statusEnum: withEnd / total):');
  for (const [k, v] of Object.entries(byStatus)) {
    console.log(`  ${k.padEnd(12)} ${v.withEnd} / ${v.total}`);
  }

  // Always write the backup so the operation is reversible.
  const backup = groups.map((g) => ({
    id: g.id,
    groupNumber: g.groupNumber,
    name: g.name,
    statusEnum: g.statusEnum,
    endDate: g.endDate ? g.endDate.toISOString() : null,
  }));
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
  console.log(`\nZaxira yozildi (barcha ${groups.length} guruh): ${BACKUP_PATH}`);

  if (!APPLY) {
    console.log(`\n[DRY-RUN] Hech narsa o'zgartirilmadi. ${withEnd.length} ta guruhning endDate si null qilinadi.`);
    console.log(`Qo'llash uchun: qayta ishga tushiring + --apply`);
    return;
  }

  const res = await prisma.group.updateMany({
    where: { deletedAt: null, endDate: { not: null } },
    data: { endDate: null },
  });
  console.log(`\n[APPLY] ✅ ${res.count} ta guruhning endDate si null qilindi.`);

  const remaining = await prisma.group.count({ where: { deletedAt: null, endDate: { not: null } } });
  console.log(`Tekshiruv: endDate hali to'ldirilgan live guruhlar: ${remaining} (0 bo'lishi kerak)`);
}

run(main);
