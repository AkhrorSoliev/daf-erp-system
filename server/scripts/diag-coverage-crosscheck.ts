/**
 * READ-ONLY cross-check for audit P3: is "every held lesson is paid" real?
 *
 * diag-lesson-coverage.ts found 0 unpaid billable lessons in Jun/Jul/Aug, which
 * would make a lesson-coverage ratio a constant 100%. That is only believable if
 * it also holds for students who are CURRENTLY in debt. Checks, for one month:
 *
 *   1. billable attendances vs live LESSON_CONSUMPTION rows (independent count)
 *   2. the same split restricted to students with balance < 0 today
 *   3. billable attendances with NO live SalaryAccrual — the salary module's
 *      "gap" (Markaz qo'shimchasi) basis, which should NOT be 0
 *
 * Usage: railway run npx ts-node scripts/diag-coverage-crosscheck.ts [YYYY-MM]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('no company');
  const companyId = company.id;

  const arg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? '2026-07';
  const [y, m] = arg.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const endExcl = new Date(Date.UTC(y, m, 1));
  console.log(`Company: ${company.name} (#${companyId})   Oy: ${arg}\n`);

  const atts = await prisma.attendance.findMany({
    where: {
      companyId,
      status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
      date: { gte: start, lt: endExcl },
    },
    select: { id: true, studentId: true, student: { select: { balance: true } } },
  });
  const ids = atts.map((a) => a.id);
  console.log(`1) Billable davomat: ${fmt(atts.length)} ta`);

  // Independent count of live consumptions for exactly those attendances.
  const consIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'LESSON_CONSUMPTION',
        reversedAt: null,
        attendanceId: { in: ids.slice(i, i + 1000) },
      },
      select: { attendanceId: true },
    });
    rows.forEach((r) => r.attendanceId && consIds.add(r.attendanceId));
  }
  console.log(`   LESSON_CONSUMPTION bor : ${fmt(consIds.size)}`);
  console.log(`   consumption YO'Q       : ${fmt(atts.length - consIds.size)}`);

  // 2) Restrict to students who are in debt right now.
  const debtorAtts = atts.filter((a) => (a.student?.balance ?? 0) < 0);
  const debtorNoCons = debtorAtts.filter((a) => !consIds.has(a.id));
  const debtorIds = new Set(debtorAtts.map((a) => a.studentId));
  console.log(
    `\n2) Bugun qarzdor o'quvchilar: ${fmt(debtorIds.size)} ta — ularning ${arg} dagi darsi: ${fmt(debtorAtts.length)} ta, consumption yo'q: ${fmt(debtorNoCons.length)}`,
  );

  // 3) Salary side: billable attendances with no live accrual.
  const accIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await prisma.salaryAccrual.findMany({
      where: { reversedAt: null, attendanceId: { in: ids.slice(i, i + 1000) } },
      select: { attendanceId: true },
    });
    rows.forEach((r) => r.attendanceId && accIds.add(r.attendanceId));
  }
  console.log(`\n3) Tirik SalaryAccrual bor : ${fmt(accIds.size)}`);
  console.log(`   accrual YO'Q            : ${fmt(atts.length - accIds.size)}   <-- oylik "gap" asosi`);

  const accrualSum = await prisma.salaryAccrual.aggregate({
    where: { reversedAt: null, lessonDate: { gte: start, lt: endExcl } },
    _sum: { amount: true },
    _count: true,
  });
  const centerTopUp = await prisma.salaryAccrual.aggregate({
    where: { reversedAt: null, lessonDate: { gte: start, lt: endExcl }, wasCenterTopUp: true },
    _sum: { amount: true },
    _count: true,
  });
  console.log(
    `   Σ accrual (lessonDate ${arg}): ${fmt(accrualSum._sum.amount ?? 0)} (${fmt(accrualSum._count)} ta)`,
  );
  console.log(
    `   shundan markaz qo'shimchasi : ${fmt(centerTopUp._sum.amount ?? 0)} (${fmt(centerTopUp._count)} ta)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
