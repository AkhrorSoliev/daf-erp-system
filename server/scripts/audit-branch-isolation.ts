/**
 * audit-branch-isolation — READ-ONLY: filiallar bo'yicha ma'lumot taqsimoti va
 * filiallararo "aralashib ketish" nuqtalarini tekshiradi.
 * Usage: railway run npx ts-node scripts/audit-branch-isolation.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL topilmadi');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
console.log('DB host:', new URL(connectionString).host);
console.log('RAILWAY env:', process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local .env)');

async function main() {
  const branches = await prisma.branch.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, isActive: true, status: true, companyId: true } as any,
  });

  console.log('\n=== FILIALLAR ===');
  console.table(branches);

  for (const b of branches as any[]) {
    const [students, users, groups, rooms, courses, cashAccounts] = await Promise.all([
      prisma.studentBranch.count({ where: { branchId: b.id, student: { deletedAt: null } } }),
      prisma.userBranch.count({ where: { branchId: b.id, user: { deletedAt: null } } }),
      prisma.group.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.room.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.course.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.cashAccount.count({ where: { branchId: b.id, deletedAt: null } }),
    ]);
    console.log(
      `\n--- Filial #${b.id} "${b.name}" ---\n` +
        `  o'quvchi: ${students} | xodim/ustoz: ${users} | guruh: ${groups} | ` +
        `xona: ${rooms} | kurs: ${courses} | kassa: ${cashAccounts}`,
    );
  }

  console.log('\n=== FILIALSIZ (branch biriktirilmagan) YOZUVLAR ===');
  const [noBranchStudents, noBranchUsers, nullCourses, nullCash] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null, branches: { none: {} } } }),
    prisma.user.count({ where: { deletedAt: null, branches: { none: {} } } }),
    prisma.course.count({ where: { deletedAt: null, branchId: null } }),
    prisma.cashAccount.count({ where: { deletedAt: null, branchId: null } }),
  ]);
  console.log(`  filialsiz o'quvchi: ${noBranchStudents}`);
  console.log(`  filialsiz user (xodim/ustoz): ${noBranchUsers}`);
  console.log(`  filialsiz kurs (ikkala filialda ko'rinmaydi): ${nullCourses}`);
  console.log(`  umumiy (company-wide) kassa: ${nullCash}`);

  console.log('\n=== FILIALLARARO NOMUVOFIQLIK ===');
  const enrollments = await prisma.enrollment.findMany({
    where: { deletedAt: null, status: 'ACTIVE', group: { deletedAt: null } },
    select: {
      id: true,
      studentId: true,
      group: { select: { id: true, name: true, branchId: true } },
      student: { select: { branches: { select: { branchId: true } } } },
    },
  });
  const mismatched = enrollments.filter(
    (e) => !e.student.branches.some((sb) => sb.branchId === e.group.branchId),
  );
  console.log(
    `  guruh filiali ≠ o'quvchi filiali bo'lgan aktiv enrollment: ${mismatched.length}`,
  );
  mismatched.slice(0, 15).forEach((e) =>
    console.log(
      `    o'quvchi #${e.studentId} (filial: ${e.student.branches.map((b) => b.branchId).join(',') || 'yo\'q'}) → guruh "${e.group.name}" (filial ${e.group.branchId})`,
    ),
  );

  const [nullBranchPayments, nullBranchTx, totalPayments, totalTx] = await Promise.all([
    prisma.payment.count({ where: { branchId: null } }),
    prisma.transaction.count({ where: { branchId: null } as any }),
    prisma.payment.count(),
    prisma.transaction.count(),
  ]);
  console.log(`  branchId=null to'lov: ${nullBranchPayments} / ${totalPayments}`);
  console.log(`  branchId=null tranzaksiya: ${nullBranchTx} / ${totalTx}`);

  const leadCount = await prisma.lead.count({ where: { deletedAt: null } });
  console.log(`\n=== LIDLAR ===\n  aktiv lid: ${leadCount} (Lead modelida branch maydoni YO'Q — umumiy doska)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
