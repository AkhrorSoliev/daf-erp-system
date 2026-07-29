/**
 * audit-null-branch-transactions — READ-ONLY.
 *
 * `branchId = null` tranzaksiyalarni turlarga ajratadi va HAR BIRI uchun
 * bog'langan obyekt (o'quvchi / guruh / ustoz) qaysi filialga tegishli ekanini
 * tekshiradi. Maqsad: backfill qoidasi haqiqatan ham "hammasi filial 1" ekanini
 * tasdiqlash yoki rad etish.
 *
 * Usage: railway run npx ts-node scripts/audit-null-branch-transactions.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log(
    `DB: ${new URL(connectionString!).host} | RAILWAY: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local)'}`,
  );

  const byType = await prisma.transaction.groupBy({
    by: ['type'],
    where: { branchId: null },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  });
  console.log('\n=== branchId = null tranzaksiyalar, turlar bo\'yicha ===');
  console.table(
    byType.map((r) => ({ tur: r.type, soni: r._count._all })),
  );
  const total = byType.reduce((s, r) => s + r._count._all, 0);
  console.log(`  JAMI: ${total} ta`);

  // Har bir qatorni bog'langan obyekt orqali filialga bog'lashga urinamiz.
  const rows = await prisma.transaction.findMany({
    where: { branchId: null },
    select: {
      id: true,
      type: true,
      studentId: true,
      teacherId: true,
      companyId: true,
      attendanceId: true,
    },
  });

  const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean))] as number[];
  const teacherIds = [...new Set(rows.map((r) => r.teacherId).filter(Boolean))] as number[];
  const attIds = [...new Set(rows.map((r) => r.attendanceId).filter(Boolean))] as string[];

  const [sBranches, uBranches, atts] = await Promise.all([
    prisma.studentBranch.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, branchId: true },
    }),
    prisma.userBranch.findMany({
      where: { userId: { in: teacherIds } },
      select: { userId: true, branchId: true },
    }),
    prisma.attendance.findMany({
      where: { id: { in: attIds } },
      select: { id: true, group: { select: { branchId: true } } },
    }),
  ]);

  const sMap = new Map<number, number[]>();
  for (const b of sBranches) {
    sMap.set(b.studentId, [...(sMap.get(b.studentId) ?? []), b.branchId]);
  }
  const uMap = new Map<number, number[]>();
  for (const b of uBranches) {
    uMap.set(b.userId, [...(uMap.get(b.userId) ?? []), b.branchId]);
  }
  const aMap = new Map(atts.map((a) => [a.id, a.group?.branchId]));

  const tally = new Map<string, number>();
  const unresolved: typeof rows = [];
  const nonOne: { id: string; type: string; branches: string }[] = [];

  for (const r of rows) {
    const candidates = new Set<number>();
    if (r.attendanceId && aMap.get(r.attendanceId) != null) {
      candidates.add(aMap.get(r.attendanceId)!);
    }
    if (r.studentId) (sMap.get(r.studentId) ?? []).forEach((b) => candidates.add(b));
    if (r.teacherId) (uMap.get(r.teacherId) ?? []).forEach((b) => candidates.add(b));

    if (candidates.size === 0) {
      unresolved.push(r);
      tally.set('aniqlanmadi', (tally.get('aniqlanmadi') ?? 0) + 1);
      continue;
    }
    const key = [...candidates].sort().join(',');
    tally.set(`filial ${key}`, (tally.get(`filial ${key}`) ?? 0) + 1);
    if (key !== '1') nonOne.push({ id: r.id, type: r.type, branches: key });
  }

  console.log('\n=== Bog\'langan obyekt qaysi filialga ishora qiladi ===');
  console.table([...tally.entries()].map(([k, v]) => ({ natija: k, soni: v })));

  if (nonOne.length) {
    console.log(`\n⚠️  FILIAL 1 EMAS: ${nonOne.length} ta`);
    console.table(nonOne.slice(0, 20));
  } else {
    console.log('\n✅ Filial 1 dan boshqasiga ishora qiluvchi qator YO\'Q');
  }

  if (unresolved.length) {
    console.log(`\n=== Bog'lanmagan (obyektsiz) ${unresolved.length} ta qator ===`);
    const uByType = new Map<string, number>();
    for (const r of unresolved) uByType.set(r.type, (uByType.get(r.type) ?? 0) + 1);
    console.table([...uByType.entries()].map(([tur, soni]) => ({ tur, soni })));
    console.log('  namunalar:', unresolved.slice(0, 5).map((r) => `${r.type}#${r.id.slice(0, 8)}`).join(', '));
  }

  // Ikkinchi filialda umuman ma'lumot bormi?
  const [b2students, b2groups, b2tx] = await Promise.all([
    prisma.studentBranch.count({ where: { branchId: 2 } }),
    prisma.group.count({ where: { branchId: 2, deletedAt: null } }),
    prisma.transaction.count({ where: { branchId: 2 } }),
  ]);
  console.log(
    `\n=== Filial #2 holati === o'quvchi: ${b2students}, guruh: ${b2groups}, tranzaksiya: ${b2tx}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
