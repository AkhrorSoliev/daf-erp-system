/**
 * Remove the legacy "Aloqaga chiqilgan Lidlar" (systemKey CONTACTED) board
 * column and everything still inside it.
 *
 * Why: the CONTACTED fixed column was dropped from the leads board. Any leads /
 * sections that still live under it must be cleaned out. Per the product
 * decision they are simply archived (soft-deleted) — the board is mostly empty,
 * so this is a no-op on a clean DB.
 *
 * What it does (one shared deletionBatchId so the set stays grouped):
 *   1. Finds the CONTACTED column (systemKey='CONTACTED', deletedAt null).
 *      If none → exits (already cleaned / fresh DB).
 *   2. Soft-deletes every live lead inside its sections.
 *   3. Soft-deletes every live section of the column.
 *   4. Soft-deletes the column itself.
 *
 * Idempotent: re-running finds no live CONTACTED column and exits.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/remove-contacted-column.ts --dry-run
 *   npx ts-node scripts/remove-contacted-column.ts
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const column = await prisma.leadColumn.findFirst({
    where: { systemKey: 'CONTACTED', deletedAt: null },
    select: { id: true, name: true },
  });

  if (!column) {
    console.log('No live CONTACTED column found — nothing to clean. Done.');
    return;
  }

  const sections = await prisma.leadSection.findMany({
    where: { columnId: column.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const sectionIds = sections.map((s) => s.id);

  const leadCount = await prisma.lead.count({
    where: { sectionId: { in: sectionIds }, deletedAt: null },
  });

  console.log(
    `CONTACTED column "${column.name}" (${column.id}): ` +
      `${sections.length} section(s), ${leadCount} live lead(s).`,
  );

  if (DRY_RUN) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  const batchId = randomUUID();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (sectionIds.length > 0) {
      await tx.lead.updateMany({
        where: { sectionId: { in: sectionIds }, deletedAt: null },
        data: { deletedAt: now, deletionBatchId: batchId },
      });
      await tx.leadSection.updateMany({
        where: { columnId: column.id, deletedAt: null },
        data: { deletedAt: now, deletionBatchId: batchId },
      });
    }
    await tx.leadColumn.update({
      where: { id: column.id },
      data: { deletedAt: now, deletionBatchId: batchId },
    });
  });

  console.log(
    `\nArchived ${leadCount} lead(s) + ${sections.length} section(s) + 1 column ` +
      `(batch ${batchId}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
