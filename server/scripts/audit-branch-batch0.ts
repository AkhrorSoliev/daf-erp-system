/**
 * audit-branch-batch0 — READ-ONLY. Batch 0 (filial #2 ishga tushirish) holatini ko'rsatadi.
 * Usage: railway run npx ts-node scripts/audit-branch-batch0.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const STAFF_ROLES = ['CEO', 'Branch Director', 'Administrator', 'Teacher', 'Cashier'];

async function main() {
  console.log('DB:', new URL(connectionString!).host, '| RAILWAY:', process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local)');

  console.log('\n=== FILIALLAR ===');
  const branches = await prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, status: true, startOfWorkingDay: true, endOfWorkingDay: true },
  });
  console.table(branches);

  console.log('\n=== FILIAL RESURSLARI ===');
  for (const b of branches) {
    const [courses, rooms, groups, cash, students, users] = await Promise.all([
      prisma.course.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.room.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.group.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.cashAccount.count({ where: { branchId: b.id, deletedAt: null } }),
      prisma.studentBranch.count({ where: { branchId: b.id, student: { deletedAt: null } } }),
      prisma.userBranch.count({ where: { branchId: b.id, user: { deletedAt: null } } }),
    ]);
    console.log(
      `  #${b.id} ${b.name}: kurs=${courses} xona=${rooms} guruh=${groups} kassa=${cash} o'quvchi=${students} biriktirilgan-user=${users}`,
    );
  }
  const nullCash = await prisma.cashAccount.findMany({
    where: { branchId: null, deletedAt: null },
    select: { id: true, name: true, type: true, balance: true } as any,
  });
  console.log("\n  Filialsiz (umumiy) kassalar — D4 bo'yicha yopilishi kerak:");
  console.table(nullCash);

  console.log("\n=== XODIMLAR (o'quvchilarsiz) ===");
  const staff = await prisma.user.findMany({
    where: { deletedAt: null, roles: { some: { role: { name: { in: STAFF_ROLES } } } } },
    select: {
      id: true, firstName: true, lastName: true, status: true, mainBranch: true,
      roles: { select: { role: { select: { name: true } } } },
      branches: { select: { branchId: true } },
    },
    orderBy: { id: 'asc' },
  });
  console.table(
    staff.map((u) => ({
      id: u.id,
      ism: `${u.firstName} ${u.lastName}`.trim().slice(0, 24),
      rol: u.roles.map((r) => r.role.name).join(','),
      status: u.status,
      mainBranch: u.mainBranch ?? '❌ NULL',
      userBranches: u.branches.map((b) => b.branchId).join(',') || "❌ yo'q",
    })),
  );
  const staffNoMain = staff.filter((u) => u.mainBranch == null);
  console.log(`  mainBranch NULL bo'lgan xodim: ${staffNoMain.length} ta`);

  console.log("\n=== D5/D6 INVARIANT TEKSHIRUVI ===");
  const dupStudents = await prisma.$queryRaw<Array<{ studentId: number }>>`
    SELECT "studentId" FROM "StudentBranch" GROUP BY "studentId" HAVING COUNT(*) > 1
  `;
  const dupUsers = await prisma.$queryRaw<Array<{ userId: number }>>`
    SELECT "userId" FROM "UserBranch" GROUP BY "userId" HAVING COUNT(*) > 1
  `;
  const noBranchStudents = await prisma.student.count({ where: { deletedAt: null, branches: { none: {} } } });
  console.log(`  ikki filialli o'quvchi (D5 buzilishi): ${dupStudents.length} ta`);
  console.log(`  ikki filialli xodim  (D6 buzilishi): ${dupUsers.length} ta`);
  console.log(`  filialsiz o'quvchi:                  ${noBranchStudents} ta`);

  console.log('\n=== TELEGRAM GURUHLARI ===');
  const tg = await prisma.telegramGroup.findMany({
    select: { id: true, title: true, status: true, branchId: true } as any,
    orderBy: { title: 'asc' },
  });
  console.table(tg.map((g: any) => ({ title: g.title, status: g.status, branchId: g.branchId ?? '❌ NULL' })));

  console.log('\n=== USTOZLAR: STAVKA + JONLI GURUH ===');
  const teachers = await prisma.user.findMany({
    where: { deletedAt: null, roles: { some: { role: { name: 'Teacher' } } } },
    select: {
      id: true, firstName: true, lastName: true, status: true, mainBranch: true,
      branches: { select: { branchId: true } },
      salaryConfigs: { where: { isActive: true }, select: { salaryType: true, value: true } } as any,
    },
    orderBy: { id: 'asc' },
  });
  const rows: Record<string, unknown>[] = [];
  for (const t of teachers as any[]) {
    const [groupCount, lastAccrual] = await Promise.all([
      prisma.groupTeacher.count({
        where: { teacherId: t.id, group: { deletedAt: null, statusEnum: 'ACTIVE' } },
      }),
      prisma.salaryAccrual.findFirst({
        where: { userId: t.id, reversedAt: null },
        orderBy: { lessonDate: 'desc' },
        select: { lessonDate: true },
      }),
    ]);
    rows.push({
      id: t.id,
      ism: `${t.firstName} ${t.lastName}`.trim().slice(0, 22),
      status: t.status,
      filial: t.branches.map((b: any) => b.branchId).join(',') || '—',
      stavka: t.salaryConfigs.length
        ? t.salaryConfigs.map((c: any) => `${c.salaryType}:${c.value}`).join(' | ')
        : "❌ YO'Q",
      aktivGuruh: groupCount,
      oxirgiAccrual: lastAccrual?.lessonDate?.toISOString().slice(0, 10) ?? '—',
    });
  }
  console.table(rows);

  const risky = rows.filter((r) => r.stavka === "❌ YO'Q" && (r.aktivGuruh as number) > 0);
  if (risky.length) {
    console.log(`\n  ⚠️  STAVKASIZ, LEKIN AKTIV GURUHI BOR USTOZ: ${risky.length} ta — darslari uchun oylik yozilmaydi!`);
  } else {
    console.log('\n  ✅ Stavkasiz + aktiv guruhli ustoz yo\'q');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
