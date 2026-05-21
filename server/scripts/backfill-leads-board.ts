/**
 * Backfill the Leads board for existing Lead rows.
 *
 * Why: Faza 0 introduces LeadColumn / LeadSection and adds Lead.sectionId.
 * Existing leads have a null sectionId, so they would not appear on the board.
 *
 * What it does:
 *   1. Ensures the two fixed/system columns exist ("Yangi Lidlar" → systemKey
 *      NEW, "Aloqaga chiqilgan Lidlar" → systemKey CONTACTED).
 *   2. For every lead with a null sectionId, creates a default "Umumiy" section
 *      in the matching fixed column (NEW → "Yangi Lidlar" column, every other
 *      statusEnum → "Aloqaga chiqilgan Lidlar" column) and assigns the lead.
 *      The "Umumiy" section is created only in a column that actually receives
 *      leads, so a clean DB stays empty and the empty-state UX still applies.
 *   3. Assigns a sequential `order` per section (oldest lead first).
 *
 * Idempotent: re-running finds the columns already present and 0 leads with a
 * null sectionId, then exits without writing.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-leads-board.ts --dry-run
 *   npx ts-node scripts/backfill-leads-board.ts
 */
import { PrismaClient, LeadStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

const FIXED_COLUMNS = [
  { name: 'Yangi Lidlar', systemKey: 'NEW', order: 0 },
  { name: 'Aloqaga chiqilgan Lidlar', systemKey: 'CONTACTED', order: 1 },
] as const;

const DEFAULT_SECTION_NAME = 'Umumiy';

/** Ensures a fixed column exists for the given systemKey; returns its id. */
async function ensureColumn(spec: (typeof FIXED_COLUMNS)[number]): Promise<string> {
  const existing = await prisma.leadColumn.findFirst({
    where: { systemKey: spec.systemKey, deletedAt: null },
  });
  if (existing) return existing.id;

  if (DRY_RUN) {
    console.log(`  [dry-run] would create fixed column "${spec.name}"`);
    return `dry-run:${spec.systemKey}`;
  }
  const created = await prisma.leadColumn.create({
    data: {
      name: spec.name,
      systemKey: spec.systemKey,
      order: spec.order,
      isSystem: true,
    },
  });
  console.log(`  created fixed column "${spec.name}" (${created.id})`);
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

  console.log('Ensuring fixed columns ...');
  const newColumnId = await ensureColumn(FIXED_COLUMNS[0]);
  const contactedColumnId = await ensureColumn(FIXED_COLUMNS[1]);

  // All leads still without a board placement (archived ones included, so a
  // later restore lands them somewhere valid).
  const orphans = await prisma.lead.findMany({
    where: { sectionId: null },
    select: { id: true, statusEnum: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (orphans.length === 0) {
    console.log('\nNo leads need a section. Board backfill complete.');
    return;
  }

  const newLeads = orphans.filter((l) => l.statusEnum === LeadStatus.NEW);
  const contactedLeads = orphans.filter((l) => l.statusEnum !== LeadStatus.NEW);
  console.log(
    `\nFound ${orphans.length} lead(s) without a section: ` +
      `${newLeads.length} → "Yangi Lidlar", ` +
      `${contactedLeads.length} → "Aloqaga chiqilgan Lidlar".`,
  );

  if (DRY_RUN) {
    console.log('\nDRY RUN — no rows written.');
    return;
  }

  let assigned = 0;
  for (const [columnId, leads] of [
    [newColumnId, newLeads],
    [contactedColumnId, contactedLeads],
  ] as const) {
    if (leads.length === 0) continue;
    const sectionId = await ensureDefaultSection(columnId);
    for (let i = 0; i < leads.length; i++) {
      await prisma.lead.update({
        where: { id: leads[i].id },
        data: { sectionId, order: i },
      });
      assigned++;
    }
  }
  console.log(`\nAssigned ${assigned} lead(s) to a board section.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
