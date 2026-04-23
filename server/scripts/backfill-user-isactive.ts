/**
 * Backfill isActive on users where it is out of sync with status.
 *
 * The edit-employee form historically only updated `status` (ACTIVE / INACTIVE /
 * SUSPENDED / TERMINATED / ARCHIVED) and never touched the `isActive` boolean.
 * Several downstream queries (attendance-reminder notifications, salary config
 * lookups, etc.) filter by `isActive: true`, so deactivated/fired admins kept
 * receiving notifications.
 *
 * Rule: isActive = (status === 'ACTIVE').
 *
 * Safe to re-run — only touches rows that are still out of sync.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-user-isactive.ts --dry-run   # preview
 *   npx ts-node scripts/backfill-user-isactive.ts             # apply
 */
import { PrismaClient, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const mismatches = await prisma.user.findMany({
    where: {
      OR: [
        { status: UserStatus.ACTIVE, isActive: false },
        { status: { not: UserStatus.ACTIVE }, isActive: true },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      isActive: true,
      companyId: true,
    },
    orderBy: { id: 'asc' },
  });

  if (mismatches.length === 0) {
    console.log('No out-of-sync users found.');
    return;
  }

  console.log(`Found ${mismatches.length} out-of-sync user(s):\n`);
  for (const u of mismatches) {
    const expected = u.status === UserStatus.ACTIVE;
    console.log(
      `  #${u.id} ${u.firstName} ${u.lastName} (company ${u.companyId}): status=${u.status} isActive=${u.isActive} → ${expected}`,
    );
  }

  if (DRY_RUN) {
    console.log('\nDry run — no changes written.');
    return;
  }

  const toActivate = mismatches
    .filter((u) => u.status === UserStatus.ACTIVE)
    .map((u) => u.id);
  const toDeactivate = mismatches
    .filter((u) => u.status !== UserStatus.ACTIVE)
    .map((u) => u.id);

  const [activated, deactivated] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: toActivate } },
      data: { isActive: true },
    }),
    prisma.user.updateMany({
      where: { id: { in: toDeactivate } },
      data: { isActive: false },
    }),
  ]);

  console.log(
    `\nUpdated: ${activated.count} → isActive=true, ${deactivated.count} → isActive=false`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
