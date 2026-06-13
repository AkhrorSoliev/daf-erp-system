/**
 * Seed default cash accounts for the Finance Module (Phase 0).
 *
 * Creates a CASH (kassa) and a BANK account for every active branch of every
 * company, plus a company-wide CASH + BANK fallback. Accounts start at balance
 * 0 — the admin sets the real counted figure later via the "Solishtiruv"
 * (reconcile) action, which writes a proper ADJUSTMENT cash movement. We do NOT
 * invent opening balances or backfill historical movements: the cash ledger
 * begins cleanly from the reconciled opening balance going forward.
 *
 * Idempotent — skips any (company, branch, type) that already has an account.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-cash-accounts.ts --dry-run   # preview
 *   npx ts-node scripts/backfill-cash-accounts.ts             # apply
 */
import { PrismaClient, CashAccountType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function ensureAccount(
  companyId: number,
  branchId: number | null,
  type: CashAccountType,
  name: string,
): Promise<'created' | 'exists'> {
  const existing = await prisma.cashAccount.findFirst({
    where: { companyId, branchId, type, deletedAt: null },
    select: { id: true },
  });
  if (existing) return 'exists';
  if (!DRY_RUN) {
    await prisma.cashAccount.create({
      data: { companyId, branchId, type, name },
    });
  }
  return 'created';
}

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });

  let created = 0;
  let skipped = 0;

  for (const company of companies) {
    // Company-wide fallback accounts (branchId = null).
    for (const [type, label] of [
      [CashAccountType.CASH, 'Asosiy kassa'],
      [CashAccountType.BANK, 'Bank hisobi'],
    ] as const) {
      const r = await ensureAccount(company.id, null, type, label);
      r === 'created' ? created++ : skipped++;
      console.log(
        `  [${company.name}] umumiy ${type} — ${r === 'created' ? 'YARATILDI' : 'mavjud'}`,
      );
    }

    const branches = await prisma.branch.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
    });

    for (const branch of branches) {
      for (const [type, suffix] of [
        [CashAccountType.CASH, 'kassa'],
        [CashAccountType.BANK, 'bank'],
      ] as const) {
        const r = await ensureAccount(
          company.id,
          branch.id,
          type,
          `${branch.name} ${suffix}`,
        );
        r === 'created' ? created++ : skipped++;
        console.log(
          `  [${company.name}] ${branch.name} ${type} — ${r === 'created' ? 'YARATILDI' : 'mavjud'}`,
        );
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? 'Yaratiladigan' : 'Yaratilgan'}: ${created}, mavjud: ${skipped}`,
  );
  if (!DRY_RUN) {
    console.log(
      "\nKeyingi qadam: har hisob uchun haqiqiy qoldiqni 'Solishtiruv' (reconcile) orqali kiriting.",
    );
  }
}

main()
  .catch((e) => {
    console.error('XATO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
