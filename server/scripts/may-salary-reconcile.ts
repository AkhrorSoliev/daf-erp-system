/**
 * READ-ONLY May 2026 teacher-salary reconciliation (BATCHED, fast).
 *
 * Context: every teacher's EmployeeSalaryConfigVersion.effectiveFrom was set
 * ~31.05/01.06, so findActiveVersion resolves NOTHING for May lessons →
 * createAccrual returned null → teachers have ~0 May accruals. Policy: teachers
 * earn from the revenue of lessons taught 01.05–31.05 at their configured share
 * (e.g. Sohiba = 50%).
 *
 * Computes, per teacher, what a CORRECT May accrual backfill would write:
 *  - only PRESENT/LATE lessons
 *  - only lessons with an active LESSON_DEDUCTION (B.1)
 *  - only COVERED lessons (metadata.salaryDeferred !== true) — debtor/deferred
 *    lessons settle later via settleDeferredAccruals when the student pays
 *  - NET of lessons that ALREADY have an accrual (no double-pay)  [C1 guard]
 *  - amount read from deduction.metadata.perLessonCost, never recomputed
 *
 * Mutates NOTHING.
 *   railway run --service caring-courage npx ts-node scripts/may-salary-reconcile.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : '-');
const f = (n: number) => n.toLocaleString('en-US');
const MAY1 = new Date('2026-05-01T00:00:00.000Z');
const JUN1 = new Date('2026-06-01T00:00:00.000Z');
const COMPANY = 1001;

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('Period: 2026-05-01 .. 2026-05-31\n');

  // 1) configs + names + versions
  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { companyId: COMPANY, isActive: true },
    select: { id: true, userId: true, groupId: true, salaryType: true, value: true },
  });
  const teacherIds = [...new Set(configs.map((c) => c.userId))];
  const [users, versions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.employeeSalaryConfigVersion.findMany({
      where: { config: { userId: { in: teacherIds }, companyId: COMPANY } },
      select: { config: { select: { userId: true } }, effectiveFrom: true, effectiveTo: true, salaryType: true, value: true },
      orderBy: { effectiveFrom: 'asc' },
    }),
  ]);
  const nameMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const verByTeacher = new Map<number, string[]>();
  for (const v of versions) {
    const arr = verByTeacher.get(v.config.userId) ?? [];
    arr.push(`${v.salaryType}:${v.value}[${d(v.effectiveFrom)}→${d(v.effectiveTo)}]`);
    verByTeacher.set(v.config.userId, arr);
  }

  // headline config per teacher (global preferred)
  const headlineByTeacher = new Map<number, { salaryType: string; value: number }>();
  for (const t of teacherIds) {
    const my = configs.filter((c) => c.userId === t);
    const h = my.find((c) => c.groupId === null) ?? my[0];
    headlineByTeacher.set(t, { salaryType: h.salaryType, value: h.value });
  }

  // 2) all groupTeachers → which teacher teaches which groups
  const gts = await prisma.groupTeacher.findMany({
    where: { teacherId: { in: teacherIds } },
    select: { teacherId: true, groupId: true },
  });
  const allGroupIds = [...new Set(gts.map((g) => g.groupId))];
  const groups = await prisma.group.findMany({
    where: { id: { in: allGroupIds } },
    select: { id: true, name: true, deletedAt: true, course: { select: { lessonPaymentCount: true } } },
  });
  const groupInfo = new Map(groups.map((g) => [g.id, g]));
  const teacherGroups = new Map<number, string[]>();
  for (const gt of gts) {
    if (groupInfo.get(gt.groupId)?.deletedAt) continue;
    const arr = teacherGroups.get(gt.teacherId) ?? [];
    arr.push(gt.groupId);
    teacherGroups.set(gt.teacherId, arr);
  }
  const liveGroupIds = [...new Set([...teacherGroups.values()].flat())];

  // 3) all May PRESENT/LATE/ABSENT attendances in those groups (batched)
  const atts = await prisma.attendance.findMany({
    where: { groupId: { in: liveGroupIds }, status: { in: ['PRESENT', 'LATE', 'ABSENT'] }, date: { gte: MAY1, lt: JUN1 } },
    select: { id: true, groupId: true, date: true, status: true, cancellationId: true },
  });
  const attIds = atts.map((a) => a.id);

  // 4) active LESSON_DEDUCTION for those attendances (batched, chunked)
  const dedByAtt = new Map<string, { perLessonCost: number; deferred: boolean }>();
  for (let i = 0; i < attIds.length; i += 1000) {
    const chunk = attIds.slice(i, i + 1000);
    const deds = await prisma.transaction.findMany({
      where: { attendanceId: { in: chunk }, type: 'LESSON_DEDUCTION', reversedAt: null },
      select: { attendanceId: true, metadata: true },
    });
    for (const t of deds) {
      const md = (t.metadata ?? {}) as Record<string, unknown>;
      dedByAtt.set(t.attendanceId!, {
        perLessonCost: Number(md.perLessonCost ?? 0),
        deferred: md.salaryDeferred === true,
      });
    }
  }

  // 5) active SalaryAccrual for those attendances (batched) → set of "attId:userId"
  const accSet = new Set<string>();
  for (let i = 0; i < attIds.length; i += 1000) {
    const chunk = attIds.slice(i, i + 1000);
    const accs = await prisma.salaryAccrual.findMany({
      where: { attendanceId: { in: chunk }, userId: { in: teacherIds }, reversedAt: null },
      select: { attendanceId: true, userId: true },
    });
    for (const a of accs) accSet.add(`${a.attendanceId}:${a.userId}`);
  }

  // group attendances by group for fast per-teacher rollup
  const attsByGroup = new Map<string, typeof atts>();
  for (const a of atts) {
    const arr = attsByGroup.get(a.groupId) ?? [];
    arr.push(a);
    attsByGroup.set(a.groupId, arr as any);
  }

  type Row = {
    teacherId: number; name: string; salaryType: string; value: number; groups: string;
    mayLessons: number; billable: number; covered: number; deferred: number;
    alreadyAccrued: number; owedNet: number; owedDeferred: number;
  };
  const rows: Row[] = [];
  const fixedMonthly: { teacherId: number; name: string; value: number }[] = [];

  for (const teacherId of teacherIds) {
    const h = headlineByTeacher.get(teacherId)!;
    if (h.salaryType === 'FIXED_MONTHLY') {
      fixedMonthly.push({ teacherId, name: nameMap.get(teacherId) ?? `#${teacherId}`, value: h.value });
      continue;
    }
    const gids = teacherGroups.get(teacherId) ?? [];
    let mayLessons = 0, billable = 0, covered = 0, deferred = 0, alreadyAccrued = 0, owedNet = 0, owedDeferred = 0;
    let owedNetAbsent = 0; // covered ABSENT-billed lessons, not yet accrued
    for (const gid of gids) {
      const lc = groupInfo.get(gid)?.course?.lessonPaymentCount ?? 12;
      for (const a of attsByGroup.get(gid) ?? []) {
        const isAbsent = (a as any).status === 'ABSENT';
        if (!isAbsent) mayLessons++;
        const has = accSet.has(`${a.id}:${teacherId}`);
        if (has && !isAbsent) alreadyAccrued++;
        const ded = dedByAtt.get(a.id);
        if (!ded) continue; // B.1
        const share = h.salaryType === 'PERCENTAGE'
          ? Math.round((ded.perLessonCost * h.value) / 100)
          : (lc > 0 ? Math.round(h.value / lc) : h.value);
        if (isAbsent) {
          if (!ded.deferred && !has) owedNetAbsent += share;
          continue;
        }
        billable++;
        if (ded.deferred) { deferred++; owedDeferred += share; }
        else {
          covered++;
          if (!has) owedNet += share; // C1: only if not already accrued
        }
      }
    }
    rows.push({
      teacherId, name: nameMap.get(teacherId) ?? `#${teacherId}`, salaryType: h.salaryType, value: h.value,
      groups: gids.map((g) => '#' + (groupInfo.get(g)?.name ?? '?')).join(','),
      mayLessons, billable, covered, deferred, alreadyAccrued, owedNet, owedDeferred, owedNetAbsent,
    } as any);
  }

  rows.sort((a, b) => b.owedNet - a.owedNet);

  console.log('================ LESSON-BASED TEACHERS (May) ================');
  let tNet = 0, tDef = 0, tAcc = 0, tCov = 0, tAbs = 0;
  for (const r of rows as any[]) {
    console.log(`\n#${r.teacherId} ${r.name}  [${r.salaryType} ${r.value}]  groups=${r.groups}`);
    console.log(`   versions: ${(verByTeacher.get(r.teacherId) ?? []).join(' | ')}`);
    console.log(`   May PRESENT/LATE=${r.mayLessons} | billable=${r.billable} | covered=${r.covered} | deferred(debtor)=${r.deferred} | already-accrued=${r.alreadyAccrued}`);
    console.log(`   OWED NOW (covered PRESENT/LATE): ${f(r.owedNet)}  | owed-when-paid (deferred): ${f(r.owedDeferred)}  | +covered ABSENT-billed: ${f(r.owedNetAbsent)}`);
    tNet += r.owedNet; tDef += r.owedDeferred; tAcc += r.alreadyAccrued; tCov += r.covered; tAbs += r.owedNetAbsent;
  }

  console.log('\n================ FIXED_MONTHLY TEACHERS ================');
  for (const t of fixedMonthly) {
    const sp = await prisma.salaryPayment.findFirst({
      where: { userId: t.teacherId, periodStart: { lte: MAY1 }, periodEnd: { gte: MAY1 } },
      select: { status: true },
    });
    console.log(`#${t.teacherId} ${t.name}  monthly=${f(t.value)}  | May SalaryPayment: ${sp ? sp.status : 'NONE'}`);
  }

  console.log('\n================ GRAND TOTALS (lesson-based) ================');
  console.log(`Lesson-based teachers: ${rows.length}`);
  console.log(`Covered May lessons: ${tCov} | already-accrued (skipped): ${tAcc}`);
  console.log(`OWED NOW — PRESENT/LATE covered (net):  ${f(tNet)} so'm`);
  console.log(`  + covered ABSENT-billed (optional):   ${f(tAbs)} so'm`);
  console.log(`  = PRESENT/LATE + ABSENT total:        ${f(tNet + tAbs)} so'm`);
  console.log(`OWED WHEN STUDENTS PAY (deferred):      ${f(tDef)} so'm`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
