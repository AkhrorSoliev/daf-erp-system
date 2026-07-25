/**
 * OYLIK REAL FOYDA TAHLILI — READ-ONLY.
 *
 * Maqsad: "Foyda" cardi (+78 mln) va Excel "Sof foyda" (−8 mln) o'rtasidagi
 * farqni raqamma-raqam ko'rsatish va taklif qilingan YANGI formulani hisoblash.
 *
 * Har oy uchun uch xil foyda yonma-yon:
 *
 *   1) ESKI CARD   = kassaTushum − xarajat − naqdTolanganOylik(paidAt)
 *      (ustoz oyligi keyingi oyda to'lanadi → paidAt≈0 → foyda oshib ketadi)
 *
 *   2) ESKI EXCEL  = kassaTushum − (covered + gap) − xarajat − refund
 *      (gap = markaz qo'shimchasi HAR OY ayiriladi — hatto iyunda ham, noto'g'ri)
 *
 *   3) YANGI       = darsTushum − covered − (gap FAQAT iyuldan) − xarajat − refund
 *      darsTushum   = shu oyda O'TILGAN (va to'langan) darslarning perLessonCost
 *                     yig'indisi  → kechikkan/oldindan to'lovlar aralashmaydi
 *      covered      = shu oy darslari uchun ustozga hisoblangan accrual (lessonDate)
 *      gap          = qarzdor darslari uchun markaz qo'shimchasi; FAQAT '2026-07'+ ayiriladi
 *
 * Definitionlar billing/salary kodidan olingan (forecast-full-salary-topup.ts bilan bir xil).
 *
 * Usage (server/ ichidan):
 *   railway run npx ts-node scripts/analyze-monthly-real-profit.ts            # PROD
 *   npx ts-node scripts/analyze-monthly-real-profit.ts                        # local dev
 *   flags: --months=2026-05,2026-06,2026-07
 *
 * Hech narsa yozmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const TOPUP_EFFECTIVE_MONTH = '2026-07'; // markaz qo'shimchasi shu oydan real to'lanadi

const argv = process.argv.slice(2);
const MONTHS = (() => {
  const m = argv.find((a) => a.startsWith('--months='));
  return m ? m.split('=')[1].split(',') : ['2026-05', '2026-06', '2026-07'];
})();

const dstr = (d: Date) => d.toISOString().slice(0, 10);

// @db.Date maydonlari (attendance.date, lessonDate, expense.date) — UTC yarim tun.
function dateFieldRange(monthStr: string): { gte: Date; lt: Date } {
  const [y, m] = monthStr.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
}
// timestamptz maydonlari (createdAt, paidAt) — Tashkent kalendar oyi chegarasi.
function tsRange(monthStr: string): { gte: Date; lt: Date } {
  const [y, m] = monthStr.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1) - TASHKENT_OFFSET_MS),
    lt: new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS),
  };
}

// ── salary-type-aware per-lesson accrual (billing kodi bilan bir xil) ──
type Version = {
  salaryType: string;
  value: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};
function perLessonAccrual(v: Version, perLessonCost: number, lpc: number): number {
  if (v.salaryType === 'PERCENTAGE') return Math.round((perLessonCost * v.value) / 100);
  if (v.salaryType === 'FIXED_PER_STUDENT') return lpc > 0 ? Math.round(v.value / lpc) : v.value;
  return 0; // FIXED_MONTHLY
}

interface MonthResult {
  month: string;
  cashIn: number;
  recognizedRevenue: number;
  covered: number;
  gap: number;
  noConfigGap: number;
  salaryPaidCash: number;
  expenses: number;
  refunds: number;
}

async function main(prisma: PrismaClient) {
  printHeader('OYLIK REAL FOYDA TAHLILI (read-only)');
  console.log(`  Baza     : ${dbEnvLabel()}`);
  console.log(`  Oylar    : ${MONTHS.join(', ')}`);
  console.log(`  Top-up   : ${TOPUP_EFFECTIVE_MONTH} dan (undan oldin gap ayirilmaydi)`);

  // ── bir marta yuklanadigan umumiy ma'lumotlar (rate/roster/override) ──
  const groups = await prisma.group.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      course: { select: { price: true, lessonPaymentCount: true } },
    },
  });
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const perLessonCostOf = (groupId: string): number => {
    const g = groupMap.get(groupId);
    if (!g) return 0;
    const lpc = g.course.lessonPaymentCount || 12;
    return Math.round(g.course.price / lpc);
  };
  const lpcOf = (groupId: string): number =>
    groupMap.get(groupId)?.course.lessonPaymentCount || 12;

  const groupTeachers = await prisma.groupTeacher.findMany({
    select: { groupId: true, teacherId: true },
  });
  const rosterMap = new Map<string, number[]>();
  for (const gt of groupTeachers) {
    const arr = rosterMap.get(gt.groupId) ?? [];
    arr.push(gt.teacherId);
    rosterMap.set(gt.groupId, arr);
  }
  const overrides = await prisma.lessonTeacherOverride.findMany({
    where: { deletedAt: null },
    select: { groupId: true, date: true, teacherIds: true },
  });
  const overrideMap = new Map<string, number[]>();
  for (const o of overrides) overrideMap.set(`${o.groupId}::${dstr(o.date)}`, o.teacherIds);
  const resolveTeachers = (groupId: string, lessonStr: string): number[] =>
    overrideMap.get(`${groupId}::${lessonStr}`) ?? rosterMap.get(groupId) ?? [];

  const versionRows = await prisma.employeeSalaryConfigVersion.findMany({
    where: { companyId: COMPANY_ID, config: { isActive: true } },
    select: {
      salaryType: true,
      value: true,
      effectiveFrom: true,
      effectiveTo: true,
      config: { select: { userId: true, groupId: true, salaryType: true } },
    },
  });
  const versByKey = new Map<string, Version[]>();
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
    if (r.config.salaryType === 'FIXED_MONTHLY' && r.config.groupId == null)
      fixedMonthly.add(r.config.userId);
  }
  const pickActive = (arr: Version[] | undefined, at: Date): Version | null => {
    if (!arr) return null;
    const elig = arr.filter(
      (v) => v.effectiveFrom <= at && (v.effectiveTo == null || v.effectiveTo > at),
    );
    if (!elig.length) return null;
    return elig.reduce((a, b) => (a.effectiveFrom >= b.effectiveFrom ? a : b));
  };
  const resolveRate = (teacherId: number, groupId: string, at: Date): Version | null =>
    pickActive(versByKey.get(`${teacherId}::${groupId}`), at) ??
    pickActive(versByKey.get(`${teacherId}::GLOBAL`), at);

  async function computeMonth(month: string): Promise<MonthResult> {
    const df = dateFieldRange(month);
    const ts = tsRange(month);

    // 1) Kassa tushumi (COMPLETED to'lovlar, createdAt) — eski ta'rif
    const cashAgg = await prisma.payment.aggregate({
      where: { companyId: COMPANY_ID, status: 'COMPLETED', createdAt: { gte: ts.gte, lt: ts.lt } },
      _sum: { amount: true },
    });
    const cashIn = cashAgg._sum.amount ?? 0;

    // 2) Shu oy darslari (billable attendance, date bo'yicha)
    const atts = await prisma.attendance.findMany({
      where: {
        companyId: COMPANY_ID,
        status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
        date: { gte: df.gte, lt: df.lt },
      },
      select: { id: true, groupId: true, date: true },
    });
    const attMap = new Map(atts.map((a) => [a.id, a]));
    const attIds = atts.map((a) => a.id);

    // 3) darsTushum = shu oy darslarining LESSON_CONSUMPTION perLessonCost yig'indisi
    //    (faqat to'langan/billed darslar — qarzdor darsda consumption yo'q)
    let recognizedRevenue = 0;
    for (let i = 0; i < attIds.length; i += 1000) {
      const chunk = attIds.slice(i, i + 1000);
      const cons = await prisma.transaction.findMany({
        where: {
          companyId: COMPANY_ID,
          type: 'LESSON_CONSUMPTION',
          reversedAt: null,
          attendanceId: { in: chunk },
        },
        select: { attendanceId: true, metadata: true },
      });
      for (const c of cons) {
        const meta = c.metadata as { perLessonCost?: number } | null;
        const att = c.attendanceId ? attMap.get(c.attendanceId) : null;
        const fallback = att ? perLessonCostOf(att.groupId) : 0;
        recognizedRevenue += meta?.perLessonCost ?? fallback;
      }
    }

    // 4) covered = shu oy darslari uchun ustoz accruali (lessonDate, reversedAt null)
    //    DIQQAT: creditPeriodDate carry-over ATATAYIN e'tiborsiz — har dars o'z oyida
    const accruals = await prisma.salaryAccrual.findMany({
      where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: df.gte, lt: df.lt } },
      select: { userId: true, attendanceId: true, amount: true },
    });
    let covered = 0;
    const coveredKey = new Set<string>();
    for (const ac of accruals) {
      covered += ac.amount;
      if (ac.attendanceId) coveredKey.add(`${ac.attendanceId}::${ac.userId}`);
    }

    // 5) gap = qarzdor darslar uchun markaz qo'shimchasi (uncovered billable × rate)
    let gap = 0;
    let noConfigGap = 0;
    for (const att of atts) {
      const perLessonCost = perLessonCostOf(att.groupId);
      const lpc = lpcOf(att.groupId);
      const lessonStr = dstr(att.date);
      for (const tid of resolveTeachers(att.groupId, lessonStr)) {
        if (coveredKey.has(`${att.id}::${tid}`)) continue; // covered
        if (fixedMonthly.has(tid)) continue; // flat salary — gap yo'q
        const v = resolveRate(tid, att.groupId, att.date);
        if (v) gap += perLessonAccrual(v, perLessonCost, lpc);
        else noConfigGap += 1;
      }
    }

    // 6) Naqd to'langan oylik (SalaryPayment PAID, paidAt) — eski card shuni ayiradi
    const paidAgg = await prisma.salaryPayment.aggregate({
      where: { companyId: COMPANY_ID, status: 'PAID', paidAt: { gte: ts.gte, lt: ts.lt } },
      _sum: { amount: true },
    });
    const salaryPaidCash = paidAgg._sum.amount ?? 0;

    // 7) Xarajatlar (Expense.date, avanssiz)
    const expAgg = await prisma.expense.aggregate({
      where: {
        companyId: COMPANY_ID,
        deletedAt: null,
        category: { not: 'TEACHER_ADVANCE' },
        date: { gte: df.gte, lt: df.lt },
      },
      _sum: { amount: true },
    });
    const expenses = expAgg._sum.amount ?? 0;

    // 8) Refundlar (REFUND transaction, reversedAt null, createdAt)
    const refAgg = await prisma.transaction.aggregate({
      where: {
        companyId: COMPANY_ID,
        type: 'REFUND',
        reversedAt: null,
        createdAt: { gte: ts.gte, lt: ts.lt },
      },
      _sum: { amount: true },
    });
    const refunds = Math.abs(refAgg._sum.amount ?? 0);

    return {
      month,
      cashIn,
      recognizedRevenue,
      covered,
      gap,
      noConfigGap,
      salaryPaidCash,
      expenses,
      refunds,
    };
  }

  const results: MonthResult[] = [];
  for (const m of MONTHS) results.push(await computeMonth(m));

  for (const r of results) {
    const isTopUp = r.month >= TOPUP_EFFECTIVE_MONTH;
    const gapApplied = isTopUp ? r.gap : 0;

    const oldCard = r.cashIn - r.expenses - r.salaryPaidCash;
    const oldExcel = r.cashIn - (r.covered + r.gap) - r.expenses - r.refunds;
    const newProfit = r.recognizedRevenue - r.covered - gapApplied - r.expenses - r.refunds;

    section(`${r.month}  ${isTopUp ? '(top-up oy — gap ayiriladi)' : '(top-up YO‘Q — gap ayirilmaydi)'}`);
    console.log('  Komponentlar:');
    console.log(`    Kassa tushumi (createdAt)      : ${som(r.cashIn)}`);
    console.log(`    Dars tushumi (o'tilgan darslar): ${som(r.recognizedRevenue)}`);
    console.log(`    Ustoz haqi — covered           : ${som(r.covered)}`);
    console.log(`    Markaz qo'shimchasi — gap      : ${som(r.gap)}${isTopUp ? '' : '  (ayirilmaydi)'}`);
    if (r.noConfigGap) console.log(`      (config yo'q darslar: ${r.noConfigGap} ta — gap hisobga olinmadi)`);
    console.log(`    Naqd to'langan oylik (paidAt)  : ${som(r.salaryPaidCash)}`);
    console.log(`    Xarajatlar (avanssiz)          : ${som(r.expenses)}`);
    console.log(`    Refundlar                      : ${som(r.refunds)}`);
    console.log('  ─────────────────────────────────────────────');
    console.log(`  1) ESKI CARD  (soxta)  : ${som(oldCard)}`);
    console.log(`       = ${som(r.cashIn)} − ${som(r.expenses)} − ${som(r.salaryPaidCash)}`);
    console.log(`  2) ESKI EXCEL (past)   : ${som(oldExcel)}`);
    console.log(`       = ${som(r.cashIn)} − (${som(r.covered)} + ${som(r.gap)}) − ${som(r.expenses)} − ${som(r.refunds)}`);
    console.log(`  3) YANGI (real foyda)  : ${som(newProfit)}`);
    console.log(`       = ${som(r.recognizedRevenue)} − ${som(r.covered)} − ${som(gapApplied)} − ${som(r.expenses)} − ${som(r.refunds)}`);
  }

  console.log('\n  Izoh: (1) va (2) — hozirgi tizim. (3) — taklif qilinayotgan formula.');
  console.log('  YANGI = shu oyda o\'tilgan darslardan ishlab topilgan foyda; kechikkan/');
  console.log('  oldindan to\'lovlar boshqa oyga tegishli, shu oyga aralashmaydi.\n');
}

run(main);
