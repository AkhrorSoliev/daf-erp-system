/**
 * Backfill the Leads board for existing Lead rows.
 *
 * Why: Faza 0 introduced LeadColumn / LeadSection and added Lead.sectionId.
 * Existing leads have a null sectionId, so they would not appear on the board.
 *
 * What it does:
 *   1. Ensures the single fixed/system column exists ("Yangi Lidlar" → systemKey
 *      NEW). (The former "Aloqaga chiqilgan" / CONTACTED column was removed —
 *      see scripts/remove-contacted-column.ts for cleaning it up.)
 *   2. For every lead with a null sectionId, creates a default "Umumiy" section
 *      in the NEW column and assigns the lead. The "Umumiy" section is created
 *      only when at least one lead needs it, so a clean DB stays empty and the
 *      empty-state UX still applies.
 *   3. Assigns a sequential `order` per section (oldest lead first).
 *
 * Idempotent: re-running finds the column already present and 0 leads with a
 * null sectionId, then exits without writing.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-leads-board.ts --dry-run
 *   npx ts-node scripts/backfill-leads-board.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

const NEW_COLUMN = { name: 'Yangi Lidlar', systemKey: 'NEW', order: 0 } as const;
const DEFAULT_SECTION_NAME = 'Umumiy';

/** Ensures the fixed NEW column exists; returns its id. */
async function ensureNewColumn(): Promise<string> {
  const existing = await prisma.leadColumn.findFirst({
    where: { systemKey: NEW_COLUMN.systemKey, deletedAt: null },
  });
  if (existing) return existing.id;

  if (DRY_RUN) {
    console.log(`  [dry-run] would create fixed column "${NEW_COLUMN.name}"`);
    return `dry-run:${NEW_COLUMN.systemKey}`;
  }
  const created = await prisma.leadColumn.create({
    data: {
      name: NEW_COLUMN.name,
      systemKey: NEW_COLUMN.systemKey,
      order: NEW_COLUMN.order,
      isSystem: true,
    },
  });
  console.log(`  created fixed column "${NEW_COLUMN.name}" (${created.id})`);
  return created.id;
}

/** Finds or creates the default "Umumiy" section inside a column. */
async function ensureDefaultSection(columnId: string): Promise<string> {
  const existing = await prisma.leadSection.findFirst({
    where: { columnId, name: DEFAULT_SECTION_NAME, deletedAt: null },
  });
  if (existing) return existing.id;

  if (DRY_RUN) {
    console.log(`  [dry-run] would create section "${DEFAULT_SECTION_NAME}"`);
    return `dry-run:section:${columnId}`;
  }
  const created = await prisma.leadSection.create({
    data: { name: DEFAULT_SECTION_NAME, columnId, order: 0 },
  });
  console.log(`  created section "${DEFAULT_SECTION_NAME}" (${created.id})`);
  return created.id;
}

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  console.log('Ensuring fixed NEW column ...');
  const newColumnId = await ensureNewColumn();

  // All leads still without a board placement (archived ones included, so a
  // later restore lands them somewhere valid).
  const orphans = await prisma.lead.findMany({
    where: { sectionId: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (orphans.length === 0) {
    console.log('\nNo leads need a section. Board backfill complete.');
    return;
  }

  console.log(
    `\nFound ${orphans.length} lead(s) without a section → "Yangi Lidlar".`,
  );

  if (DRY_RUN) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  const sectionId = await ensureDefaultSection(newColumnId);
  let assigned = 0;
  for (let i = 0; i < orphans.length; i++) {
    await prisma.lead.update({
      where: { id: orphans[i].id },
      data: { sectionId, order: i },
    });
    assigned++;
  }
  console.log(`\nAssigned ${assigned} lead(s) to a board section.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
