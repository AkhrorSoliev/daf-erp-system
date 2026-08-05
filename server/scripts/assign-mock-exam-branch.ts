/**
 * One-off: attribute every branch-less mock exam to a branch.
 *
 * `MockExam.branchId` was nullable and `create` defaulted it to null, so the
 * exams held before the multi-branch work carry no venue. Once the read paths
 * filter by branch (`branchIdWhere` compiles to `{ in: [...] }`, which excludes
 * nulls) those rows are visible from NO branch view at all — not Fargona's, not
 * Namangan's. Mock money is deliberately never written to the ledger, so the
 * exam row is the only record of which branch earned it; leaving it null makes
 * that revenue permanently unattributable.
 *
 * Default target is the company's lowest branch id (Fargona), which is where
 * every pre-Namangan exam actually happened.
 *
 *   npx ts-node scripts/assign-mock-exam-branch.ts            # dry run
 *   npx ts-node scripts/assign-mock-exam-branch.ts --apply
 *   npx ts-node scripts/assign-mock-exam-branch.ts --apply --branch 2
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const apply = process.argv.includes('--apply');
  const branchArgIdx = process.argv.indexOf('--branch');
  const explicitBranch =
    branchArgIdx !== -1 ? Number(process.argv[branchArgIdx + 1]) : null;

  const orphans = await prisma.mockExam.findMany({
    where: { branchId: null, deletedAt: null },
    select: {
      id: true,
      title: true,
      examDate: true,
      status: true,
      companyId: true,
      _count: { select: { participants: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (orphans.length === 0) {
    console.log('Filialsiz mock imtihon yo\'q — hech narsa qilinmadi.');
    return;
  }

  const companyIds = [...new Set(orphans.map((e) => e.companyId))];
  if (companyIds.length > 1) {
    throw new Error(
      `Bir nechta kompaniya topildi (${companyIds.join(', ')}) — bu skript bitta kompaniya uchun mo'ljallangan.`,
    );
  }
  const companyId = companyIds[0];

  const branches = await prisma.branch.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, status: true },
    orderBy: { id: 'asc' },
  });
  if (branches.length === 0) {
    throw new Error(`Kompaniya ${companyId} uchun filial topilmadi.`);
  }

  const target =
    explicitBranch != null
      ? branches.find((b) => b.id === explicitBranch)
      : branches[0];
  if (!target) {
    throw new Error(
      `Filial ${explicitBranch} bu kompaniyada topilmadi. Mavjud: ${branches
        .map((b) => `${b.id}=${b.name}`)
        .join(', ')}`,
    );
  }

  console.log(`Kompaniya: ${companyId}`);
  console.log(
    `Filiallar:  ${branches.map((b) => `${b.id}=${b.name}`).join(', ')}`,
  );
  console.log(`Maqsad:     ${target.id} = ${target.name}\n`);
  console.log(`Filialsiz mock imtihonlar (${orphans.length} ta):`);
  for (const e of orphans) {
    const date = e.examDate ? e.examDate.toISOString().slice(0, 10) : '—';
    console.log(
      `  • ${e.title}  [${e.status}]  sana=${date}  ishtirokchi=${e._count.participants}  id=${e.id}`,
    );
  }

  if (!apply) {
    console.log(
      `\nDRY RUN — hech narsa yozilmadi. Qo'llash uchun: --apply${
        explicitBranch != null ? ` --branch ${explicitBranch}` : ''
      }`,
    );
    return;
  }

  const result = await prisma.mockExam.updateMany({
    where: { branchId: null, deletedAt: null, companyId },
    data: { branchId: target.id },
  });
  console.log(`\n${result.count} ta imtihon "${target.name}" ga biriktirildi.`);

  const remaining = await prisma.mockExam.count({
    where: { branchId: null, deletedAt: null },
  });
  console.log(`Qolgan filialsiz imtihon: ${remaining}`);
  if (remaining !== 0) {
    throw new Error('Tekshiruv MUVAFFAQIYATSIZ — hali filialsiz qator bor.');
  }
  console.log('Tekshiruv OK.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
