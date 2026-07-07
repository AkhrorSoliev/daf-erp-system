/**
 * CENTER TOP-UP DRY-RUN — READ-ONLY.
 *
 * Shows EXACTLY what `SalaryCalculationService`'s Phase 0 would front if the
 * salary cron settled a given period today: per teacher, the uncovered
 * ("gap") billable lessons and the center-funded accrual total it would write.
 * This is the real write path's preview — it uses the SAME period resolution
 * (`resolveCompletedPeriod` / `resolveCurrentPeriod`), the SAME gap sweep
 * (`deserved-math`), and the SAME July-2026 gate (`isTopUpPeriod`) as
 * production, so the numbers match what the next run will actually pay.
 *
 * Cross-check the magnitude against `forecast-full-salary-topup.ts` (~32M/mo).
 *
 * Usage (from server/):
 *   railway run npx ts-node scripts/preview-topup-run.ts            # PROD, completed period
 *   railway run npx ts-node scripts/preview-topup-run.ts --month=2026-07
 *   npx ts-node scripts/preview-topup-run.ts                        # local dev
 *
 * Writes NOTHING.
 */
import { PrismaClient } from '@prisma/client';
import {
  som,
  day,
  dbEnvLabel,
  printHeader,
  section,
  printTable,
  run,
} from './lib/check-cli';
import {
  resolveCompletedPeriod,
  resolveCurrentPeriod,
  parseTashkentDateStart,
} from '../src/salary/shared/resolve-current-period';
import {
  perLessonAccrual,
  pickActiveVersion,
  RateVersion,
} from '../src/salary/shared/deserved-math';
import { isTopUpPeriod, monthKeyOf } from '../src/salary/shared/topup';

const COMPANY_ID = 1001;

const argv = process.argv.slice(2);
const monthArg = argv.find((a) => a.startsWith('--month='))?.split('=')[1];

async function main(prisma: PrismaClient) {
  const now = new Date();

  printHeader("MARKAZ TOP-UP — DRY-RUN (keyingi cron nima to'laydi)");
  console.log(`  DB muhiti: ${dbEnvLabel()}`);
  console.log(`  Hisoblash vaqti (now): ${now.toISOString()}`);

  // Same period resolution as the cron / manual calculate.
  const period = monthArg
    ? await resolveCurrentPeriod(
        prisma as never,
        COMPANY_ID,
        parseTashkentDateStart(`${monthArg}-15`),
      )
    : await resolveCompletedPeriod(prisma as never, COMPANY_ID, now);
  const { periodStart, periodEnd } = period;

  section('Davr');
  console.log(`  ${day(periodStart)} … ${day(periodEnd)}  (oy: ${monthKeyOf(periodStart)})`);
  if (!isTopUpPeriod(periodStart)) {
    console.log(
      "  ⚠ Bu davr top-up chegarasidan (Iyul 2026) OLDIN — haqiqiy cron top-up YOZMAYDI (faqat covered).",
    );
    console.log(
      '    (Quyidagi hisob "agar yoqilganda nima bo\'lardi"ni ko\'rsatadi.)',
    );
  }

  // ── Same bulk loads + sweep as SalaryCalculationService.computeGapAccruals ──
  const [accruals, attendances, groups, groupTeachers, overrides, versionRows] =
    await Promise.all([
      prisma.salaryAccrual.findMany({
        where: {
          companyId: COMPANY_ID,
          reversedAt: null,
          OR: [
            { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
            {
              creditPeriodDate: null,
              lessonDate: { gte: periodStart, lte: periodEnd },
            },
          ],
        },
        select: { userId: true, attendanceId: true },
      }),
      prisma.attendance.findMany({
        where: {
          companyId: COMPANY_ID,
          status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
          date: { gte: periodStart, lte: periodEnd },
        },
        select: { id: true, studentId: true, groupId: true, date: true },
      }),
      prisma.group.findMany({
        where: { companyId: COMPANY_ID },
        select: {
          id: true,
          course: { select: { price: true, lessonPaymentCount: true } },
        },
      }),
      prisma.groupTeacher.findMany({
        select: { groupId: true, teacherId: true },
      }),
      prisma.lessonTeacherOverride.findMany({
        where: { deletedAt: null },
        select: { groupId: true, date: true, teacherIds: true },
      }),
      prisma.employeeSalaryConfigVersion.findMany({
        where: { companyId: COMPANY_ID, config: { isActive: true } },
        select: {
          salaryType: true,
          value: true,
          effectiveFrom: true,
          effectiveTo: true,
          config: { select: { userId: true, groupId: true, salaryType: true } },
        },
      }),
    ]);

  const dstr = (d: Date) => d.toISOString().slice(0, 10);

  const coveredKey = new Set<string>();
  for (const a of accruals) {
    if (a.attendanceId) coveredKey.add(`${a.attendanceId}::${a.userId}`);
  }
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const rosterMap = new Map<string, number[]>();
  for (const gt of groupTeachers) {
    const arr = rosterMap.get(gt.groupId) ?? [];
    arr.push(gt.teacherId);
    rosterMap.set(gt.groupId, arr);
  }
  const overrideMap = new Map<string, number[]>();
  for (const o of overrides) {
    overrideMap.set(`${o.groupId}::${dstr(o.date)}`, o.teacherIds);
  }
  const resolveTeachers = (groupId: string, ds: string): number[] =>
    overrideMap.get(`${groupId}::${ds}`) ?? rosterMap.get(groupId) ?? [];

  const versByKey = new Map<string, RateVersion[]>();
  const fixedMonthly = new Set<number>();
  for (const r of versionRows) {
    const key = `${r.config.userId}::${r.config.groupId ?? 'GLOBAL'}`;
    const arr = versByKey.get(key) ?? [];
    arr.push({
      salaryType: r.salaryType,
      value: r.value,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    });
    versByKey.set(key, arr);
    if (r.config.salaryType === 'FIXED_MONTHLY' && r.config.groupId == null) {
      fixedMonthly.add(r.config.userId);
    }
  }
  const resolveRate = (tid: number, gid: string, at: Date): RateVersion | null =>
    pickActiveVersion(versByKey.get(`${tid}::${gid}`), at) ??
    pickActiveVersion(versByKey.get(`${tid}::GLOBAL`), at);

  const gap = new Map<number, { units: number; total: number }>();
  let noConfigUnits = 0;
  for (const att of attendances) {
    const g = groupMap.get(att.groupId);
    if (!g) continue;
    const lpc = g.course.lessonPaymentCount || 12;
    const perLessonCost = Math.round(g.course.price / lpc);
    const ds = dstr(att.date);
    for (const tid of resolveTeachers(att.groupId, ds)) {
      if (coveredKey.has(`${att.id}::${tid}`)) continue;
      if (fixedMonthly.has(tid)) continue;
      const v = resolveRate(tid, att.groupId, att.date);
      if (!v) {
        noConfigUnits += 1;
        continue;
      }
      const amount = perLessonAccrual(v, perLessonCost, lpc);
      if (amount <= 0) continue;
      const e = gap.get(tid) ?? { units: 0, total: 0 };
      e.units += 1;
      e.total += amount;
      gap.set(tid, e);
    }
  }

  // Teacher names.
  const ids = [...gap.keys()];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameMap = new Map(
    users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]),
  );

  const rows = [...gap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([tid, e]) => [nameMap.get(tid) ?? `#${tid}`, `${e.units}`, som(e.total)]);
  const grandUnits = [...gap.values()].reduce((s, e) => s + e.units, 0);
  const grandTotal = [...gap.values()].reduce((s, e) => s + e.total, 0);

  section("Yoziladigan markaz-fund accruallar (top-up)");
  printTable(['Ustoz', 'Dars-birlik', 'Top-up (so\'m)'], rows, ['l', 'r', 'r']);
  console.log('');
  console.log(`  JAMI: ${grandUnits} dars-birlik · ${som(grandTotal)} so'm`);
  if (noConfigUnits > 0) {
    console.log(
      `  ⚠ ${noConfigUnits} dars-birlikda dars sanasida faol salary-config yo'q — top-up YOZILMAYDI (fabrikatsiya yo'q).`,
    );
  }
  console.log('');
  console.log('  Bu skript hech nima yozmaydi. Haqiqiy yozuv cron/hisoblash Phase 0 orqali bo\'ladi.');
}

run(main);
