/**
 * MAY (va IYUN) SOF FOYDA — READ-ONLY.
 * May config-gap oy (accrual yo'q) → ustoz ulushi HOZIRGI rate'lar (proxy) bilan
 * hisoblanadi: har TO'LANGAN (consumption) may darsi × ustoz joriy foizi.
 * Iyun — haqiqiy (66,7M, data-fix'dan keyin) — solishtirish uchun.
 *
 * Formula (ikkalasi bir xil): recognized dars tushumi − ustoz oyligi − xarajat − refund.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';

const COMPANY_ID = 1001;
const dstr = (d: Date) => d.toISOString().slice(0, 10);

type Version = { salaryType: string; value: number; effectiveFrom: Date; effectiveTo: Date | null };
function perLessonAccrual(v: Version, perLessonCost: number, lpc: number): number {
  if (v.salaryType === 'PERCENTAGE') return Math.round((perLessonCost * v.value) / 100);
  if (v.salaryType === 'FIXED_PER_STUDENT') return lpc > 0 ? Math.round(v.value / lpc) : v.value;
  return 0;
}

async function main(prismaClient: PrismaClient) {
  const prisma = prismaClient as unknown as PrismaService;
  const fin = new ReportsFinancialService(prisma);
  printHeader('MAY & IYUN — SOF FOYDA');
  console.log(`  Baza: ${dbEnvLabel()}`);

  // ── shared: groups, rosters, overrides, rate versions ──
  const groups = await prisma.group.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, course: { select: { price: true, lessonPaymentCount: true } } },
  });
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const groupTeachers = await prisma.groupTeacher.findMany({ select: { groupId: true, teacherId: true } });
  const rosterMap = new Map<string, number[]>();
  for (const gt of groupTeachers) {
    const arr = rosterMap.get(gt.groupId) ?? []; arr.push(gt.teacherId); rosterMap.set(gt.groupId, arr);
  }
  const overrides = await prisma.lessonTeacherOverride.findMany({ where: { deletedAt: null }, select: { groupId: true, date: true, teacherIds: true } });
  const overrideMap = new Map<string, number[]>();
  for (const o of overrides) overrideMap.set(`${o.groupId}::${dstr(o.date)}`, o.teacherIds);
  const resolveTeachers = (gid: string, dStr: string) => overrideMap.get(`${gid}::${dStr}`) ?? rosterMap.get(gid) ?? [];

  const versionRows = await prisma.employeeSalaryConfigVersion.findMany({
    where: { companyId: COMPANY_ID, config: { isActive: true } },
    select: { salaryType: true, value: true, effectiveFrom: true, effectiveTo: true, config: { select: { userId: true, groupId: true } } },
  });
  const versByKey = new Map<string, Version[]>();
  for (const r of versionRows) {
    const key = `${r.config.userId}::${r.config.groupId ?? 'GLOBAL'}`;
    const arr = versByKey.get(key) ?? []; arr.push({ salaryType: r.salaryType, value: r.value, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }); versByKey.set(key, arr);
  }
  const pickLatest = (arr?: Version[]) => (arr && arr.length ? arr.reduce((a, b) => (a.effectiveFrom >= b.effectiveFrom ? a : b)) : null);
  // Proxy: teacher's CURRENT rate (per-group preferred, else global).
  const proxyRate = (tid: number, gid: string): Version | null =>
    pickLatest(versByKey.get(`${tid}::${gid}`)) ?? pickLatest(versByKey.get(`${tid}::GLOBAL`));

  // ── teacher salary (proxy) over PAID lessons of a month ──
  async function teacherSalaryProxy(monthStart: Date, monthEndExcl: Date): Promise<number> {
    // billable attendances in month
    const atts = await prisma.attendance.findMany({
      where: { companyId: COMPANY_ID, status: { in: ['PRESENT', 'LATE', 'ABSENT'] }, date: { gte: monthStart, lt: monthEndExcl } },
      select: { id: true, groupId: true, date: true },
    });
    const attById = new Map(atts.map((a) => [a.id, a]));
    const ids = atts.map((a) => a.id);
    let salary = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const cons = await prisma.transaction.findMany({
        where: { companyId: COMPANY_ID, type: 'LESSON_CONSUMPTION', reversedAt: null, attendanceId: { in: ids.slice(i, i + 1000) } },
        select: { attendanceId: true, metadata: true },
      });
      for (const c of cons) {
        const att = c.attendanceId ? attById.get(c.attendanceId) : null;
        if (!att) continue;
        const g = groupMap.get(att.groupId);
        const lpc = g?.course.lessonPaymentCount || 12;
        const meta = c.metadata as { perLessonCost?: number } | null;
        const perLessonCost = meta?.perLessonCost ?? (g ? Math.round(g.course.price / lpc) : 0);
        for (const tid of resolveTeachers(att.groupId, dstr(att.date))) {
          const v = proxyRate(tid, att.groupId);
          if (v) salary += perLessonAccrual(v, perLessonCost, lpc);
        }
      }
    }
    return salary;
  }

  for (const [label, y, m] of [['MAY', 2026, 5], ['IYUN', 2026, 6]] as const) {
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEndExcl = new Date(Date.UTC(y, m, 1));
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate())}`;

    const [revenue, salaryProxy, outflows, expOverview] = await Promise.all([
      fin.getRecognizedRevenue(COMPANY_ID, { start: monthStart, end: monthEndExcl }),
      teacherSalaryProxy(monthStart, monthEndExcl),
      fin.getPeriodOutflows(COMPANY_ID, { startDate, endDate }),
      fin.getFinancialOverview(COMPANY_ID, { startDate, endDate }),
    ]);
    const expenses = expOverview.expenses; // avanssiz operatsion xarajat
    const refunds = outflows.refunds ?? 0;
    // Iyun uchun HAQIQIY oylik (66,7M), may uchun proxy.
    const salary = label === 'IYUN' ? 66_704_430 : salaryProxy;
    const profit = revenue - salary - expenses - refunds;

    section(`${label} 2026`);
    console.log(`  Dars tushumi (recognized)   : ${som(revenue)}`);
    console.log(`  − Ustoz oyligi ${label === 'IYUN' ? '(haqiqiy, siz bergan)' : '(proxy — joriy rate)'} : ${som(salary)}`);
    if (label === 'MAY') console.log(`     (may proxy hisob-kitobi: ${som(salaryProxy)})`);
    console.log(`  − Operatsion xarajat        : ${som(expenses)}`);
    console.log(`  − Refund                    : ${som(refunds)}`);
    console.log(`  ═ SOF FOYDA                 : ${som(profit)}`);
  }
  console.log('\n  Eslatma: may ustoz ulushi HOZIRGI rate\'lar bilan hisoblangan (may config bo\'sh edi).\n');
}

run(main);
