/**
 * READ-ONLY — itemize the May PRESENT/LATE lessons MARKED BY Dostonbek #10004
 * (departed teacher), with: group, group-live?, LESSON_DEDUCTION coverage +
 * perLessonCost, already-accrued?, and the current group teacher (who the
 * naive backfill would wrongly credit). Mutates nothing.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const COMPANY = 1001;
const DOSTONBEK = 10004;
const MAY1 = new Date('2026-05-01T00:00:00.000Z');
const JUN1 = new Date('2026-06-01T00:00:00.000Z');
const f = (n: number) => n.toLocaleString('en-US');

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host, '\n');

  const atts = await prisma.attendance.findMany({
    where: {
      companyId: COMPANY,
      markedById: DOSTONBEK,
      status: { in: ['PRESENT', 'LATE'] },
      date: { gte: MAY1, lt: JUN1 },
    },
    select: { id: true, groupId: true, date: true, status: true },
    orderBy: { date: 'asc' },
  });
  const attIds = atts.map((a) => a.id);
  const groupIds = [...new Set(atts.map((a) => a.groupId))];

  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      teachers: { select: { teacherId: true } },
      course: { select: { lessonPaymentCount: true } },
    },
  });
  const gMap = new Map(groups.map((g) => [g.id, g]));

  const teacherUserIds = [...new Set(groups.flatMap((g) => g.teachers.map((t) => t.teacherId)))];
  const tUsers = await prisma.user.findMany({
    where: { id: { in: teacherUserIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const tName = new Map(tUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const deds = await prisma.transaction.findMany({
    where: { attendanceId: { in: attIds }, type: 'LESSON_DEDUCTION', reversedAt: null },
    select: { attendanceId: true, metadata: true },
  });
  const dedByAtt = new Map(
    deds.map((t) => {
      const md = (t.metadata ?? {}) as Record<string, unknown>;
      return [t.attendanceId!, { perLessonCost: Number(md.perLessonCost ?? 0), deferred: md.salaryDeferred === true }];
    }),
  );

  const accs = await prisma.salaryAccrual.findMany({
    where: { attendanceId: { in: attIds }, reversedAt: null },
    select: { attendanceId: true, userId: true, amount: true },
  });
  const accByAtt = new Map(accs.map((a) => [a.attendanceId!, a]));

  let coveredCost = 0;
  let coveredCount = 0;
  console.log('================ Dostonbek #10004 — May PRESENT/LATE lessons marked ================');
  for (const a of atts) {
    const g = gMap.get(a.groupId)!;
    const ded = dedByAtt.get(a.id);
    const acc = accByAtt.get(a.id);
    const curT = g.teachers.map((t) => tName.get(t.teacherId) ?? `#${t.teacherId}`).join(',') || 'none';
    const cov = ded ? (ded.deferred ? 'DEFERRED(debtor)' : `COVERED plc=${f(ded.perLessonCost)}`) : 'NOT covered';
    if (ded && !ded.deferred) {
      coveredCost += ded.perLessonCost;
      coveredCount++;
    }
    console.log(
      `${a.date.toISOString().slice(0, 10)} #${g.name} live=${!g.deletedAt} | ${cov} | accrued=${acc ? `#${acc.userId}:${f(acc.amount)}` : 'no'} | now=${curT}`,
    );
  }

  console.log('\n================ SUMMARY ================');
  console.log(`Total marked: ${atts.length} | covered (billable, not deferred): ${coveredCount}`);
  console.log(`Sum of perLessonCost for covered lessons: ${f(coveredCost)} so'm`);
  console.log('Dostonbek would be owed = sum(perLessonCost) × his% :');
  for (const pct of [40, 50, 60]) {
    console.log(`   @ ${pct}% → ${f(Math.round((coveredCost * pct) / 100))} so'm (approx; per-lesson rounding may differ slightly)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
