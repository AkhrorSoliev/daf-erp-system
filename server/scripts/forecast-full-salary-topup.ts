/**
 * FULL-SALARY TOP-UP FORECAST — READ-ONLY.
 *
 * Question (CEO): today teachers are paid only for lessons a student actually
 * PAID for (coverage rule B.1 — a debtor's lesson accrues nothing until the
 * student pays). If we switch to paying every teacher their FULL deserved
 * salary regardless of student payment, the center tops up the gap from its
 * own pocket. How much extra per month? Measure May + June (June still open →
 * extrapolate) and forecast the July top-up.
 *
 * Definitions (verified against the billing/salary code):
 *   perLessonCost = round(course.price / course.lessonPaymentCount)
 *   accrual/lesson = PERCENTAGE      → round(perLessonCost * value / 100)
 *                    FIXED_PER_STUDENT → round(value / lessonPaymentCount)
 *                    FIXED_MONTHLY    → no per-lesson accrual (flat salary)
 *   ACTUAL(teacher, cycle) = Σ SalaryAccrual.amount (reversedAt NULL,
 *                            lessonDate ∈ cycle)              ← ground truth
 *   For every BILLABLE attendance (PRESENT/LATE/ABSENT) in the cycle, per
 *   resolved teacher (LessonTeacherOverride-aware):
 *     - has a live accrual          → COVERED  (already in ACTUAL)
 *     - no accrual + rate exists     → UNCOVERED (student debt) → GAP
 *     - no accrual + FIXED_MONTHLY   → skip (flat salary, no per-lesson gap)
 *     - no accrual + NO rate at date → NO-CONFIG (can't compute; proxy at
 *                                       current rate, reported separately)
 *   FULL = ACTUAL + GAP.   TOP-UP = Σ GAP = what the center fronts.
 *
 * Caveat the script prints: the gap measured NOW is "lessons still unpaid by
 * students". Late payments retro-settle accruals, so a closed cycle's gap is a
 * LOWER bound on what was fronted at its close; the in-progress cycle (June)
 * is the better steady-state gauge. The top-up is cash fronted — recoverable
 * if the student eventually pays; the only PERMANENT cost is lessons students
 * never pay (write-offs).
 *
 * Usage (from server/):
 *   railway run npx ts-node scripts/forecast-full-salary-topup.ts        # PROD
 *   npx ts-node scripts/forecast-full-salary-topup.ts                    # local dev
 *   flags: --full (per-teacher table, all rows)  --json  --out=/tmp
 *
 * Writes NOTHING.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import {
  som,
  day,
  dbHost,
  dbEnvLabel,
  printHeader,
  section,
  printTable,
  run,
} from './lib/check-cli';

const COMPANY_ID = 1001;
const DEFAULT_CYCLE_START_DAY = 8;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const FULL = argv.includes('--full');
const JSON_ONLY = argv.includes('--json');
const OUT_DIR = (() => {
  const o = argv.find((a) => a.startsWith('--out='));
  return o ? o.split('=')[1] : '/tmp';
})();

const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// ── period math (pure copy of src/salary/shared/resolve-current-period.ts) ──
function computePeriodBounds(
  now: Date,
  cycleStartDay: number,
): { periodStart: Date; periodEnd: Date } {
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const d = t.getUTCDate();
  let startT: Date;
  let endTExcl: Date;
  if (d >= cycleStartDay) {
    startT = new Date(Date.UTC(y, m, cycleStartDay));
    endTExcl = new Date(Date.UTC(y, m + 1, cycleStartDay));
  } else {
    startT = new Date(Date.UTC(y, m - 1, cycleStartDay));
    endTExcl = new Date(Date.UTC(y, m, cycleStartDay));
  }
  return {
    periodStart: new Date(startT.getTime() - TASHKENT_OFFSET_MS),
    periodEnd: new Date(endTExcl.getTime() - TASHKENT_OFFSET_MS - 1),
  };
}

const dstr = (d: Date) => d.toISOString().slice(0, 10);
const cycleLabel = (p: { periodStart: Date; periodEnd: Date }) =>
  `${day(p.periodStart)} … ${day(p.periodEnd)}`;

// Enumerate the Tashkent calendar days of a cycle as {dateStr, weekday}.
function cycleDays(
  periodStart: Date,
  periodEnd: Date,
): { date: Date; weekday: number; str: string }[] {
  const startT = new Date(periodStart.getTime() + TASHKENT_OFFSET_MS);
  const endT = new Date(periodEnd.getTime() + TASHKENT_OFFSET_MS);
  const out: { date: Date; weekday: number; str: string }[] = [];
  let cur = new Date(
    Date.UTC(startT.getUTCFullYear(), startT.getUTCMonth(), startT.getUTCDate()),
  );
  const last = new Date(
    Date.UTC(endT.getUTCFullYear(), endT.getUTCMonth(), endT.getUTCDate()),
  );
  while (cur.getTime() <= last.getTime()) {
    out.push({ date: new Date(cur), weekday: cur.getUTCDay(), str: dstr(cur) });
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

// ── salary-type-aware per-lesson amount ─────────────────────────────────────
type Version = {
  salaryType: string;
  value: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};
function perLessonAccrual(
  v: Version,
  perLessonCost: number,
  lessonPaymentCount: number,
): number {
  if (v.salaryType === 'PERCENTAGE') {
    return Math.round((perLessonCost * v.value) / 100);
  }
  if (v.salaryType === 'FIXED_PER_STUDENT') {
    return lessonPaymentCount > 0
      ? Math.round(v.value / lessonPaymentCount)
      : v.value;
  }
  return 0; // FIXED_MONTHLY — no per-lesson accrual
}

interface TeacherAgg {
  teacherId: number;
  name: string;
  actual: number; // Σ live accruals (lessonDate ∈ cycle)
  coveredUnits: number; // lesson×teacher accrual rows
  realGap: number; // uncovered, rate-resolvable (student-debt top-up)
  realGapUnits: number;
  noConfigGap: number; // uncovered, no rate at lessonDate — proxy at current rate
  noConfigUnits: number;
  isFixedMonthly: boolean;
  fixedMonthlyValue: number;
}

interface PeriodResult {
  label: string;
  periodStart: Date;
  periodEnd: Date;
  partial: boolean;
  billableUnits: number;
  totals: {
    actual: number;
    realGap: number;
    full: number;
    noConfigGap: number;
    noConfigUnits: number;
  };
  teachers: TeacherAgg[];
  elapsedFraction: number; // 1 for a closed cycle
  projectedRealGap: number; // realGap / elapsedFraction
  projectedFull: number;
}

async function main(prisma: PrismaClient) {
  const NOW = new Date();

  printHeader('TO‘LIQ OYLIK PROGNOZI — markaz qo‘shimchasi (top-up)');
  console.log(`  Hisoblash vaqti (now): ${NOW.toISOString()}`);

  // ── cycle bounds ──────────────────────────────────────────────────────────
  const setting = await prisma.salaryPeriodSetting.findFirst({
    where: {
      companyId: COMPANY_ID,
      effectiveFrom: { lte: NOW },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: NOW } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { cycleStartDay: true },
  });
  const cycleStartDay = setting?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY;

  const june = computePeriodBounds(NOW, cycleStartDay); // current (open)
  const may = computePeriodBounds(
    new Date(june.periodStart.getTime() - 1),
    cycleStartDay,
  ); // previous (closed)

  section('Sozlamalar');
  console.log(`  cycleStartDay : ${cycleStartDay} (oyning ${cycleStartDay}-kuni 00:00 Tashkent)`);
  console.log(`  "May" sikli   : ${cycleLabel(may)}  (yopiq)`);
  console.log(`  "Iyun" sikli  : ${cycleLabel(june)}  (${june.periodEnd > NOW ? 'ochiq — qisman' : 'yopiq'})`);

  // ── shared lookups (loaded once) ───────────────────────────────────────────
  // Groups → perLessonCost basis + schedule.
  const groups = await prisma.group.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      exactDays: true,
      statusEnum: true,
      deletedAt: true,
      startDate: true,
      endDate: true,
      course: { select: { price: true, lessonPaymentCount: true } },
    },
  });
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  // GroupTeacher rosters.
  const groupTeachers = await prisma.groupTeacher.findMany({
    select: { groupId: true, teacherId: true },
  });
  const rosterMap = new Map<string, number[]>();
  for (const gt of groupTeachers) {
    const arr = rosterMap.get(gt.groupId) ?? [];
    arr.push(gt.teacherId);
    rosterMap.set(gt.groupId, arr);
  }

  // LessonTeacherOverride (active) → substitute roster per (group,date).
  const overrides = await prisma.lessonTeacherOverride.findMany({
    where: { deletedAt: null },
    select: { groupId: true, date: true, teacherIds: true },
  });
  const overrideMap = new Map<string, number[]>();
  for (const o of overrides) {
    overrideMap.set(`${o.groupId}::${dstr(o.date)}`, o.teacherIds);
  }
  const resolveTeachers = (groupId: string, lessonStr: string): number[] =>
    overrideMap.get(`${groupId}::${lessonStr}`) ?? rosterMap.get(groupId) ?? [];

  // Salary config versions (active configs only), grouped for findActiveVersion.
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
  const versByKey = new Map<string, Version[]>(); // `${teacher}::${group|GLOBAL}`
  const fixedMonthlyTeachers = new Map<number, number>(); // teacherId → value
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
      fixedMonthlyTeachers.set(r.config.userId, r.value);
    }
  }
  const pickActive = (arr: Version[] | undefined, at: Date): Version | null => {
    if (!arr) return null;
    const elig = arr.filter(
      (v) => v.effectiveFrom <= at && (v.effectiveTo == null || v.effectiveTo > at),
    );
    if (!elig.length) return null;
    return elig.reduce((a, b) => (a.effectiveFrom >= b.effectiveFrom ? a : b));
  };
  const pickLatest = (arr: Version[] | undefined): Version | null => {
    if (!arr || !arr.length) return null;
    return arr.reduce((a, b) => (a.effectiveFrom >= b.effectiveFrom ? a : b));
  };
  // findActiveVersion: per-group beats global, version active at lessonDate.
  const resolveRate = (
    teacherId: number,
    groupId: string,
    at: Date,
  ): Version | null =>
    pickActive(versByKey.get(`${teacherId}::${groupId}`), at) ??
    pickActive(versByKey.get(`${teacherId}::GLOBAL`), at);
  // Proxy rate when no version covers the lessonDate (config gap): use the
  // teacher's current rate (per-group preferred, else global, else latest).
  const proxyRate = (teacherId: number, groupId: string): Version | null =>
    resolveRate(teacherId, groupId, NOW) ??
    pickLatest(versByKey.get(`${teacherId}::${groupId}`)) ??
    pickLatest(versByKey.get(`${teacherId}::GLOBAL`));

  // Teacher names.
  const teacherIdsAll = new Set<number>();
  for (const ids of rosterMap.values()) ids.forEach((i) => teacherIdsAll.add(i));
  for (const ids of overrideMap.values()) ids.forEach((i) => teacherIdsAll.add(i));
  fixedMonthlyTeachers.forEach((_, id) => teacherIdsAll.add(id));
  const users = await prisma.user.findMany({
    where: { id: { in: [...teacherIdsAll] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameMap = new Map(
    users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]),
  );

  // ── per-cycle computation ───────────────────────────────────────────────────
  async function computeCycle(
    label: string,
    p: { periodStart: Date; periodEnd: Date },
  ): Promise<PeriodResult> {
    const { periodStart, periodEnd } = p;

    // Live accruals (ground truth ACTUAL), bucketed by lessonDate.
    const accruals = await prisma.salaryAccrual.findMany({
      where: {
        companyId: COMPANY_ID,
        reversedAt: null,
        lessonDate: { gte: periodStart, lte: periodEnd },
      },
      select: { userId: true, attendanceId: true, amount: true },
    });
    const coveredKey = new Set<string>(); // `${attendanceId}::${userId}`
    const agg = new Map<number, TeacherAgg>();
    const getAgg = (tid: number): TeacherAgg => {
      let a = agg.get(tid);
      if (!a) {
        a = {
          teacherId: tid,
          name: nameMap.get(tid) ?? `#${tid}`,
          actual: 0,
          coveredUnits: 0,
          realGap: 0,
          realGapUnits: 0,
          noConfigGap: 0,
          noConfigUnits: 0,
          isFixedMonthly: fixedMonthlyTeachers.has(tid),
          fixedMonthlyValue: fixedMonthlyTeachers.get(tid) ?? 0,
        };
        agg.set(tid, a);
      }
      return a;
    };
    for (const ac of accruals) {
      const a = getAgg(ac.userId);
      a.actual += ac.amount;
      a.coveredUnits += 1;
      if (ac.attendanceId) coveredKey.add(`${ac.attendanceId}::${ac.userId}`);
    }

    // Billable attendances in the cycle.
    const atts = await prisma.attendance.findMany({
      where: {
        companyId: COMPANY_ID,
        status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, groupId: true, date: true },
    });

    let billableUnits = 0;
    for (const att of atts) {
      const g = groupMap.get(att.groupId);
      if (!g) continue;
      const lessonPaymentCount = g.course.lessonPaymentCount || 12;
      const perLessonCost = Math.round(g.course.price / lessonPaymentCount);
      const lessonStr = dstr(att.date);
      const teachers = resolveTeachers(att.groupId, lessonStr);
      for (const tid of teachers) {
        billableUnits += 1;
        const a = getAgg(tid);
        if (coveredKey.has(`${att.id}::${tid}`)) continue; // covered → in ACTUAL
        if (a.isFixedMonthly) continue; // flat salary — no per-lesson gap
        const v = resolveRate(tid, att.groupId, att.date);
        if (v) {
          a.realGap += perLessonAccrual(v, perLessonCost, lessonPaymentCount);
          a.realGapUnits += 1;
        } else {
          const pv = proxyRate(tid, att.groupId);
          if (pv) {
            a.noConfigGap += perLessonAccrual(pv, perLessonCost, lessonPaymentCount);
          }
          a.noConfigUnits += 1;
        }
      }
    }

    const teachers = [...agg.values()].filter((t) => !t.isFixedMonthly);
    const totals = teachers.reduce(
      (s, t) => ({
        actual: s.actual + t.actual,
        realGap: s.realGap + t.realGap,
        full: s.full + t.actual + t.realGap,
        noConfigGap: s.noConfigGap + t.noConfigGap,
        noConfigUnits: s.noConfigUnits + t.noConfigUnits,
      }),
      { actual: 0, realGap: 0, full: 0, noConfigGap: 0, noConfigUnits: 0 },
    );

    // Elapsed fraction (for the open cycle) by scheduled lesson-days across
    // currently-ACTIVE groups. Ignores holidays (they shrink elapsed & total
    // proportionally, so the ratio is roughly stable).
    const partial = periodEnd > NOW;
    let elapsedFraction = 1;
    if (partial) {
      const elapsedEnd = NOW < periodEnd ? NOW : periodEnd;
      const allDays = cycleDays(periodStart, periodEnd);
      const elapsedCut = dstr(new Date(elapsedEnd.getTime() + TASHKENT_OFFSET_MS));
      let total = 0;
      let elapsed = 0;
      for (const g of groups) {
        if (g.statusEnum !== 'ACTIVE' || g.deletedAt) continue;
        const wd = new Set(
          g.exactDays.map((d) => DAY_NAME_TO_JS[d.toLowerCase()]).filter((x) => x !== undefined),
        );
        if (!wd.size) continue;
        const gs = g.startDate ? dstr(g.startDate) : null;
        const ge = g.endDate ? dstr(g.endDate) : null;
        for (const cd of allDays) {
          if (!wd.has(cd.weekday)) continue;
          if (gs && cd.str < gs) continue;
          if (ge && cd.str > ge) continue;
          total += 1;
          if (cd.str <= elapsedCut) elapsed += 1;
        }
      }
      elapsedFraction = total > 0 ? elapsed / total : 1;
    }
    const projectedRealGap =
      elapsedFraction > 0 ? Math.round(totals.realGap / elapsedFraction) : totals.realGap;
    const projectedFull =
      elapsedFraction > 0 ? Math.round(totals.full / elapsedFraction) : totals.full;

    return {
      label,
      periodStart,
      periodEnd,
      partial,
      billableUnits,
      totals,
      teachers,
      elapsedFraction,
      projectedRealGap,
      projectedFull,
    };
  }

  const mayR = await computeCycle('May', may);
  const juneR = await computeCycle('Iyun', june);

  // ── reporting ───────────────────────────────────────────────────────────────
  for (const r of [mayR, juneR]) {
    section(
      `${r.label} sikli (${cycleLabel(r)})${r.partial ? ' — QISMAN/ochiq' : ''}`,
    );
    const t = r.totals;
    const topupNow = t.realGap;
    console.log(`  Billable dars-birlik (dars×ustoz) : ${r.billableUnits.toLocaleString('ru-RU')}`);
    console.log(`  ACTUAL  (hozir ustozlar olgani)   : ${som(t.actual)} so'm`);
    console.log(`  GAP     (markaz qo'shimchasi)      : ${som(topupNow)} so'm   ← top-up`);
    console.log(`  FULL    (to'liq deserved oylik)    : ${som(t.full)} so'm`);
    const pctTopup = t.full > 0 ? Math.round((topupNow / t.full) * 100) : 0;
    console.log(`  Top-up ulushi                      : ${pctTopup}% (FULL ning)`);
    if (t.noConfigUnits > 0) {
      console.log(
        `  ⚠ Config-bo'shliq darslari         : ${t.noConfigUnits.toLocaleString('ru-RU')} dars-birlik, ` +
          `taxminiy qo'shimcha (joriy stavkada) ~${som(t.noConfigGap)} so'm`,
      );
      console.log(
        `     (bu darslar uchun dars sanasida faol salary-config yo'q — ledger bo'yicha accrual ham yo'q)`,
      );
    }
    if (r.partial) {
      console.log(
        `  Sikl o'tgan ulushi (dars-kun)      : ${(r.elapsedFraction * 100).toFixed(1)}%`,
      );
      console.log(`  → PROGNOZ to'liq sikl GAP (top-up) : ~${som(r.projectedRealGap)} so'm`);
      console.log(`  → PROGNOZ to'liq sikl FULL         : ~${som(r.projectedFull)} so'm`);
    }

    const rows = r.teachers
      .filter((x) => x.realGap > 0 || x.actual > 0 || x.noConfigUnits > 0)
      .sort((a, b) => b.realGap - a.realGap)
      .map((x) => {
        const full = x.actual + x.realGap;
        const covPct = full > 0 ? Math.round((x.actual / full) * 100) : 100;
        return [
          x.name.slice(0, 22),
          som(x.actual),
          som(x.realGap),
          som(full),
          `${covPct}%`,
          x.realGapUnits.toString(),
          x.noConfigUnits ? `${x.noConfigUnits} (~${som(x.noConfigGap)})` : '—',
        ];
      });
    const shown = FULL ? rows : rows.slice(0, 15);
    section(`${r.label}: ustozlar bo'yicha (top-up bo'yicha saralangan)${FULL ? '' : ' — top 15'}`);
    printTable(
      ['Ustoz', 'ACTUAL', 'GAP(top-up)', 'FULL', 'Qoplangan%', 'Qarz darslar', "Config-yo'q"],
      shown,
      ['l', 'r', 'r', 'r', 'r', 'r', 'r'],
    );
    if (!FULL && rows.length > 15) {
      console.log(`  … va yana ${rows.length - 15} ustoz (--full bilan to'liq ko'ring)`);
    }
  }

  // ── FIXED_MONTHLY context (no top-up; flat salary) ──────────────────────────
  if (fixedMonthlyTeachers.size > 0) {
    const fixedTotal = [...fixedMonthlyTeachers.values()].reduce((a, b) => a + b, 0);
    section('FIXED_MONTHLY xodimlar (top-up ga kirmaydi — oyligi to\'lovga bog\'liq emas)');
    console.log(`  Soni: ${fixedMonthlyTeachers.size} ta · jami oylik: ${som(fixedTotal)} so'm/oy`);
  }

  // ── JULY forecast ───────────────────────────────────────────────────────────
  section('IYUL PROGNOZI — markaz qancha qo\'shimcha to\'laydi');
  const juneSoFar = juneR.totals.realGap; // already un-covered this cycle
  const juneProjected = juneR.projectedRealGap; // full-cycle estimate
  const projActual = juneR.projectedFull - juneR.projectedRealGap;
  // May is unusable as a top-up base (config gap suppressed nearly all
  // accruals), so the forecast is June-based. We do cross-check the FULL
  // monthly payroll: May's would-be FULL (real + proxy) vs June's projection.
  const mayWouldBeFull = mayR.totals.full + mayR.totals.noConfigGap;
  const mayUnusable = mayR.totals.noConfigUnits > juneR.totals.noConfigUnits + 50;

  console.log(`  Asos: IYUN sikli (config to'liq, ishonchli).${mayUnusable ? ' May — config-bo\'shliq sabab asos sifatida olinmadi.' : ''}`);
  console.log('');
  console.log(`  Iyun — hozirgacha qoplanmagan (GAP) : ${som(juneSoFar)} so'm  (shu oyda allaqachon yetishmayapti)`);
  console.log(`  Iyun — to'liq siklga prognoz (GAP)  : ~${som(juneProjected)} so'm  ← asosiy o'lcham`);
  console.log('');
  console.log(`  To'liq oylik fond (FULL) prognozi   : ~${som(juneR.projectedFull)} so'm/oy`);
  console.log(`  Shundan hozir to'lanadi (ACTUAL)    : ~${som(projActual)} so'm/oy`);
  console.log('');
  console.log(`  ▶ IYUL uchun kutilayotgan TOP-UP    : ~${som(juneProjected)} so'm/oy`);
  console.log(`     (oraliq: ${som(juneSoFar)} … ${som(juneProjected)} so'm/oy)`);
  console.log('');
  console.log('  Cross-check (to\'liq oylik fond, may proksi bilan):');
  console.log(`     May would-be FULL ~${som(mayWouldBeFull)}  ~≈  Iyun prognoz FULL ~${som(juneR.projectedFull)}`);
  if (mayUnusable) {
    console.log('');
    console.log(
      `  ⚠ May: ${mayR.totals.noConfigUnits.toLocaleString('ru-RU')} dars-birlikda dars sanasida salary-config yo'q edi`,
    );
    console.log(
      `     → May'da accrual deyarli yozilmagan, top-up ajratib bo'lmaydi (faqat to'liq fond proksisi ~${som(mayR.totals.noConfigGap)}).`,
    );
  }
  console.log('');
  console.log(
    "  Eslatma: top-up'ning bir qismi o'quvchilar keyin to'lasa markazga qaytib keladi —",
  );
  console.log(
    '  barqaror SOF qiymat biroz pastroq bo\'lishi mumkin (CEO tajribasi ~27% kamomad).',
  );

  section('Izohlar (metodologiya)');
  console.log(
    [
      "  • Top-up = markaz o'z hisobidan qo'shadigan pul = qarzdor o'quvchilarning",
      "    qoplanmagan darslari uchun ustozning haqi (perLessonCost × stavka).",
      "  • * Yopiq sikl (May) GAP'i — bu HOZIR hali qoplanmagan darslar. O'quvchi keyin",
      "    to'lasa accrual retroaktiv yoziladi va GAP kamayadi — shuning uchun May qiymati",
      "    sikl yopilgan paytdagi haqiqiy frontingdan PAST (pastki chegara).",
      "  • Top-up — bu naqd 'fronting'. O'quvchi keyin to'lasa markaz qaytarib oladi.",
      "    HAQIQIY yo'qotish = o'quvchi UMUMAN to'lamagan (write-off) darslar.",
      "  • Iyun qisman — dars-kun ulushi bo'yicha to'liq siklga ekstrapolyatsiya qilindi",
      "    (bayramlar hisobga olinmagan; nisbat barqaror deb taxmin qilingan).",
      "  • Chegirma (discount) accrualni kamaytirmaydi — u allaqachon markaz hisobidan.",
      "  • FIXED_MONTHLY xodimlar top-up'ga kirmaydi (oyligi to'lovga bog'liq emas).",
    ].join('\n'),
  );

  // ── JSON dump ───────────────────────────────────────────────────────────────
  const payload = {
    generatedAt: NOW.toISOString(),
    dbHost: dbHost(),
    env: dbEnvLabel(),
    cycleStartDay,
    cycles: [mayR, juneR].map((r) => ({
      label: r.label,
      range: { start: r.periodStart.toISOString(), end: r.periodEnd.toISOString() },
      partial: r.partial,
      elapsedFraction: r.elapsedFraction,
      billableUnits: r.billableUnits,
      totals: r.totals,
      projectedRealGap: r.projectedRealGap,
      projectedFull: r.projectedFull,
      teachers: r.teachers.map((t) => ({
        teacherId: t.teacherId,
        name: t.name,
        actual: t.actual,
        realGap: t.realGap,
        full: t.actual + t.realGap,
        realGapUnits: t.realGapUnits,
        noConfigUnits: t.noConfigUnits,
        noConfigGap: t.noConfigGap,
      })),
    })),
    julyForecast: {
      primary: juneProjected,
      rangeLow: juneSoFar,
      rangeHigh: juneProjected,
      projectedFullPayroll: juneR.projectedFull,
      projectedActualPayroll: projActual,
      mayWouldBeFull,
    },
  };
  if (JSON_ONLY) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    try {
      const out = `${OUT_DIR}/forecast-full-salary-topup.json`;
      fs.writeFileSync(out, JSON.stringify(payload, null, 2));
      console.log(`\n  JSON: ${out}`);
    } catch {
      /* ignore */
    }
  }
}

run(main);
