/**
 * Backfill branchId on gateway-webhook payments that were created before the fix.
 *
 * Finds all Payment rows where:
 *   - source = GATEWAY_WEBHOOK (Payme/Click webhook-created)
 *   - branchId IS NULL
 *
 * For each, resolves the student's branch using the same logic as
 * PaymentsService.resolveStudentBranchId (active enrollment → StudentBranch).
 *
 * Updates the Payment row. Safe to re-run — only touches rows still null.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-gateway-branchId.ts --dry-run   # preview
 *   npx ts-node scripts/backfill-gateway-branchId.ts             # apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function resolveBranchId(
  studentId: number,
  companyId: number | null,
): Promise<number | null> {
  const activeEnrollment = await prisma.enrollment.findFirst({
    where: {
      studentId,
      deletedAt: null,
      status: 'ACTIVE',
      group: { ...(companyId && { companyId }), deletedAt: null },
    },
    select: { group: { select: { branchId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (activeEnrollment?.group?.branchId) return activeEnrollment.group.branchId;

  const studentBranch = await prisma.studentBranch.findFirst({
    where: { studentId, student: { ...(companyId && { companyId }) } },
    select: { branchId: true },
  });
  return studentBranch?.branchId ?? null;
}

async function main() {
  const mode = DRY_RUN ? 'DRY RUN' : 'APPLY';
  console.log(`\n=== Backfill gateway Payment.branchId (${mode}) ===\n`);

  const orphans = await prisma.payment.findMany({
    where: {
      source: 'GATEWAY_WEBHOOK',
      branchId: null,
    },
    select: {
      id: true,
      studentId: true,
      companyId: true,
      method: true,
      amount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Topildi: ${orphans.length} ta branchId=null gateway to'lov`);
  if (orphans.length === 0) {
    console.log('Hech narsa qilish shart emas — tamom.');
    return;
  }

  let resolved = 0;
  let unresolved = 0;
  const plan: { id: string; studentId: number; toBranch: number }[] = [];

  for (const p of orphans) {
    const branchId = await resolveBranchId(p.studentId, p.companyId);
    if (branchId) {
      resolved++;
      plan.push({ id: p.id, studentId: p.studentId, toBranch: branchId });
      console.log(
        `  ✓ payment=${p.id.slice(0, 8)} student=${p.studentId} method=${p.method} amount=${p.amount} → branch=${branchId}`,
      );
    } else {
      unresolved++;
      console.log(
        `  ✗ payment=${p.id.slice(0, 8)} student=${p.studentId} method=${p.method} amount=${p.amount} → NO BRANCH FOUND`,
      );
    }
  }

  console.log(
    `\nXulosa: ${resolved} ta tuzatish mumkin, ${unresolved} ta aniqlab bo'lmadi`,
  );

  if (DRY_RUN) {
    console.log('\n(DRY RUN — hech nima saqlanmadi. --dry-run ni olib tashlab ishga tushiring.)');
    return;
  }

  if (plan.length === 0) {
    console.log('Yangilash uchun hech narsa yo\'q.');
    return;
  }

  console.log(`\n${plan.length} ta yozuvni yangilanmoqda...`);
  let updated = 0;
  for (const item of plan) {
    await prisma.payment.update({
      where: { id: item.id },
      data: { branchId: item.toBranch },
    });
    updated++;
  }
  console.log(`Muvaffaqiyatli yangilandi: ${updated} ta yozuv.`);
}

main()
  .catch((e) => {
    console.error('Xato:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
