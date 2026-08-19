/**
 * audit-teacher-salaries — READ-ONLY.
 *
 * Berilgan oy uchun ustozlar oyligi ro'yxati + ustoz PROFILIDA ko'rinadigan
 * raqam (GET /teachers/:id/salary-summary → SalarySummaryView) bilan solishtirish.
 * Oy argument bilan beriladi (YYYY-MM); berilmasa 2026-07.
 *
 * Manba: haqiqiy `SalaryMonthlyService.getMonthly` (=/payments/salary sahifasi,
 * Excel "Oyliklar" varag'i va Telegram kartasi bilan bir xil) + haqiqiy
 * `SalarySummaryService.getTeacherSalarySummary` (=profil "Ish haqi" tabi).
 *
 * Qo'shimcha diagnostika (nega raqamlar farq qiladi):
 *   - konfiguratsiya bo'shlig'i (stavka versiyasi yo'q darslar) → kam hisoblash
 *   - BR-09 yangi o'quvchi (4 darsdan kam) → markaz qo'shimchasi ushlab turilgan
 *   - nofaol o'quvchi kepkasi → top-up berilmagan darslar
 *   - bekor qilingan (reversed) accruallar
 *   - profil "Haqiqiy yig'ilgan" ichidagi iyuldan TASHQARI to'lanmagan accruallar
 *
 * Usage:
 *   cd server && railway run npx ts-node --transpile-only scripts/audit-teacher-salaries.ts [2026-07]
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { SalarySummaryService } from '../src/salary/salary-summary.service';
import {
  perLessonAccrual,
  pickActiveVersion,
  RateVersion,
} from '../src/salary/shared/deserved-math';
import { NEW_STUDENT_TOPUP_MIN_LESSONS } from '../src/salary/shared/topup';
import { som, dbEnvLabel, dbHost, printTable, section } from './lib/check-cli';

@Module({
  imports: [PrismaModule],
  providers: [
    SalaryMonthlyService,
    SalaryStaffMonthlyService,
    SalarySummaryService,
  ],
})
class AuditModule {}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const MONTH =
    process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? '2026-07';

  const app = await NestFactory.createApplicationContext(AuditModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const monthly = app.get(SalaryMonthlyService);
  const summarySvc = app.get(SalarySummaryService);

  const ceo = await prisma.user.findFirst({
    where: { deletedAt: null, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true, companyId: true },
  });
  if (!ceo) {
    console.log('CEO topilmadi.');
    await app.close();
    return;
  }
  const companyId = ceo.companyId;

  // ─── 1. Kanonik oylik hisobot (=/payments/salary) ────────────────────────
  const res = await monthly.getMonthly({ month: MONTH }, companyId, ceo.id);
  const { periodStart, periodEnd } = res.period;

  console.log('═'.repeat(100));
  console.log(
    `  USTOZLAR OYLIGI — ${res.month}  (davr: ${dateStr(periodStart)} … ${dateStr(periodEnd)})`,
  );
  console.log(`  DB: ${dbHost()}  [${dbEnvLabel()}]   bugun: ${dateStr(new Date())}`);
  console.log('═'.repeat(100));

  // ─── 2. Diagnostika uchun xom ma'lumot (getMonthly bilan bir xil sweep) ──
  const ids = res.data.map((r) => r.user.id);
  const [
    attendances,
    groups,
    groupTeachers,
    overrides,
    versionRows,
    heldCounts,
    inactiveStudents,
    reversedAgg,
    unpaidAccruals,
  ] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        companyId,
        status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, studentId: true, groupId: true, date: true },
    }),
    prisma.group.findMany({
      where: { companyId },
      select: {
        id: true,
        course: { select: { price: true, lessonPaymentCount: true } },
      },
    }),
    prisma.groupTeacher.findMany({ select: { groupId: true, teacherId: true } }),
    prisma.lessonTeacherOverride.findMany({
      where: { deletedAt: null },
      select: { groupId: true, date: true, teacherIds: true },
    }),
    prisma.employeeSalaryConfigVersion.findMany({
      where: { companyId, config: { isActive: true } },
      select: {
        salaryType: true,
        value: true,
        effectiveFrom: true,
        effectiveTo: true,
        config: { select: { userId: true, groupId: true, salaryType: true } },
      },
    }),
    prisma.attendance.groupBy({
      by: ['studentId', 'groupId'],
      where: {
        companyId,
        status: { in: ['PRESENT', 'LATE'] },
        date: { lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.student.findMany({
      where: {
        companyId,
        status: { not: 'ACTIVE' },
        statusChangedAt: { not: null },
      },
      select: { id: true, statusChangedAt: true },
    }),
    // Iyulda bekor qilingan accruallar
    prisma.salaryAccrual.groupBy({
      by: ['userId'],
      where: {
        companyId,
        userId: { in: ids },
        reversedAt: { not: null },
        lessonDate: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Profil "Haqiqiy yig'ilgan" pooli: barcha to'lanmagan, bekor qilinmagan
    prisma.salaryAccrual.findMany({
      where: {
        companyId,
        userId: { in: ids },
        salaryPaymentId: null,
        reversedAt: null,
      },
      select: {
        userId: true,
        amount: true,
        lessonDate: true,
        creditPeriodDate: true,
        isCenterTopUp: true,
      },
    }),
  ]);

  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const rosterMap = new Map<string, number[]>();
  for (const gt of groupTeachers) {
    const arr = rosterMap.get(gt.groupId) ?? [];
    arr.push(gt.teacherId);
    rosterMap.set(gt.groupId, arr);
  }
  const overrideMap = new Map<string, number[]>();
  for (const o of overrides) overrideMap.set(`${o.groupId}::${dateStr(o.date)}`, o.teacherIds);
  const resolveTeachers = (groupId: string, d: string): number[] =>
    overrideMap.get(`${groupId}::${d}`) ?? rosterMap.get(groupId) ?? [];

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
    if (r.config.salaryType === 'FIXED_MONTHLY' && r.config.groupId == null)
      fixedMonthly.add(r.config.userId);
  }
  const resolveRate = (tid: number, gid: string, at: Date) =>
    pickActiveVersion(versByKey.get(`${tid}::${gid}`), at) ??
    pickActiveVersion(versByKey.get(`${tid}::GLOBAL`), at);

  const heldMap = new Map<string, number>();
  for (const h of heldCounts)
    heldMap.set(`${h.studentId}::${h.groupId}`, h._count._all);
  const inactiveSince = new Map<number, string>();
  for (const s of inactiveStudents)
    if (s.statusChangedAt)
      inactiveSince.set(
        s.id,
        new Date(s.statusChangedAt.getTime() + TASHKENT_OFFSET_MS)
          .toISOString()
          .slice(0, 10),
      );

  interface Diag {
    noConfigUnits: number;
    noConfigStudents: Set<number>;
    br09Units: number;
    br09Amount: number;
    inactiveUnits: number;
    inactiveAmount: number;
    heldLessons: Set<string>;
  }
  const diag = new Map<number, Diag>();
  for (const id of ids)
    diag.set(id, {
      noConfigUnits: 0,
      noConfigStudents: new Set(),
      br09Units: 0,
      br09Amount: 0,
      inactiveUnits: 0,
      inactiveAmount: 0,
      heldLessons: new Set(),
    });

  for (const att of attendances) {
    const g = groupMap.get(att.groupId);
    if (!g) continue;
    const lpc = g.course.lessonPaymentCount || 12;
    const perLessonCost = Math.round(g.course.price / lpc);
    const d = dateStr(att.date);
    const held = heldMap.get(`${att.studentId}::${att.groupId}`) ?? 0;
    const inactiveDay = inactiveSince.get(att.studentId);
    const capped = inactiveDay !== undefined && d > inactiveDay;

    for (const tid of resolveTeachers(att.groupId, d)) {
      const dg = diag.get(tid);
      if (!dg) continue;
      if (fixedMonthly.has(tid)) continue;
      dg.heldLessons.add(`${att.groupId}::${d}`);
      const v = resolveRate(tid, att.groupId, att.date);
      if (!v) {
        dg.noConfigUnits += 1;
        dg.noConfigStudents.add(att.studentId);
        continue;
      }
      const amount = perLessonAccrual(v, perLessonCost, lpc);
      if (held < NEW_STUDENT_TOPUP_MIN_LESSONS) {
        dg.br09Units += 1;
        dg.br09Amount += amount;
      } else if (capped) {
        dg.inactiveUnits += 1;
        dg.inactiveAmount += amount;
      }
    }
  }

  const reversedMap = new Map(
    reversedAgg.map((r) => [
      r.userId as number,
      { amount: r._sum.amount ?? 0, count: r._count._all },
    ]),
  );

  // to'lanmagan accruallarni davrga ajratish (profil "Haqiqiy yig'ilgan" tarkibi)
  const inPeriod = (a: { lessonDate: Date; creditPeriodDate: Date | null }) => {
    const eff = a.creditPeriodDate ?? a.lessonDate;
    return eff >= periodStart && eff <= periodEnd;
  };
  const unpaidByUser = new Map<
    number,
    { total: number; inMonth: number; outMonth: number; topUp: number }
  >();
  for (const id of ids)
    unpaidByUser.set(id, { total: 0, inMonth: 0, outMonth: 0, topUp: 0 });
  for (const a of unpaidAccruals) {
    const u = unpaidByUser.get(a.userId);
    if (!u) continue;
    u.total += a.amount;
    if (inPeriod(a)) u.inMonth += a.amount;
    else u.outMonth += a.amount;
    if (a.isCenterTopUp) u.topUp += a.amount;
  }

  // ─── 3. ASOSIY RO'YXAT ──────────────────────────────────────────────────
  section(`${MONTH} — USTOZLAR OYLIGI (kanonik: /payments/salary)`);
  const rows: (string | number)[][] = [];
  for (const [i, r] of res.data.entries()) {
    rows.push([
      i + 1,
      r.user.id,
      `${r.user.firstName} ${r.user.lastName}`.slice(0, 24),
      r.user.branch?.name?.slice(0, 12) ?? '—',
      som(r.fullDeserved),
      som(r.covered),
      som(r.gap),
      som(r.advances),
      som(r.netToPay),
      r.payment ? r.payment.status : '—',
    ]);
  }
  printTable(
    [
      '#',
      'ID',
      'Ustoz',
      'Filial',
      "To'liq ishlangan",
      "O'quvchi to'lagan",
      'Markaz qo\'shadi',
      'Avans',
      "To'lanishi kerak",
      'Holat',
    ],
    rows,
    ['r', 'r', 'l', 'l', 'r', 'r', 'r', 'r', 'r', 'l'],
  );
  const t = res.totals;
  console.log(
    `\n  JAMI: to'liq ${som(t.fullDeserved)} | o'quvchi to'lagan ${som(t.covered)} | markaz ${som(t.gap)} | avans ${som(t.advances)} | to'lanishi kerak ${som(t.netToPay)}`,
  );
  console.log(
    `  oldingi oydan kirgan: ${som(t.carriedIn)} | keyingi oyga o'tgan: ${som(t.carriedOut)}`,
  );

  // ─── 4. PROFIL RAQAMI vs KANONIK ────────────────────────────────────────
  section('PROFIL "Ish haqi" TABI vs KANONIK OYLIK');
  const profRows: (string | number)[][] = [];
  const issues: string[] = [];
  for (const r of res.data) {
    const s = await summarySvc.getTeacherSalarySummary(r.user.id, companyId);
    const u = unpaidByUser.get(r.user.id)!;
    const deserved = r.fullDeserved ?? 0;
    const diffVsDeserved = s.actualEarned - deserved;
    profRows.push([
      r.user.id,
      `${r.user.firstName} ${r.user.lastName}`.slice(0, 22),
      som(s.actualEarned),
      som(deserved),
      som(diffVsDeserved),
      som(u.outMonth),
      som(s.paidTotal),
      som(s.advancesTotal ?? 0),
    ]);
    if (Math.abs(diffVsDeserved) > 0) {
      issues.push(
        `#${r.user.id} ${r.user.firstName} ${r.user.lastName}: profil "Haqiqiy yig'ilgan" ${som(
          s.actualEarned,
        )} ≠ iyulda to'liq ishlangan ${som(deserved)} (farq ${som(diffVsDeserved)}; boshqa oy accruali ${som(u.outMonth)})`,
      );
    }
  }
  printTable(
    [
      'ID',
      'Ustoz',
      'Profil: Haqiqiy yig\'ilgan',
      "Kanonik: to'liq ishlangan",
      'Farq',
      'shundan boshqa oy',
      'Profil: to\'langan',
      'Profil: avans',
    ],
    profRows,
    ['r', 'l', 'r', 'r', 'r', 'r', 'r', 'r'],
  );

  // ─── 5. KAMCHILIK / KO'PAYTIRISH SIGNALLARI ─────────────────────────────
  section('DIQQAT: kam yoki ortiqcha hisoblash signallari');
  const flagRows: (string | number)[][] = [];
  for (const r of res.data) {
    const d = diag.get(r.user.id)!;
    const rev = reversedMap.get(r.user.id);
    if (
      d.noConfigUnits === 0 &&
      d.br09Units === 0 &&
      d.inactiveUnits === 0 &&
      !rev
    )
      continue;
    flagRows.push([
      r.user.id,
      `${r.user.firstName} ${r.user.lastName}`.slice(0, 22),
      d.noConfigUnits ? `${d.noConfigUnits} (${d.noConfigStudents.size} o'quvchi)` : '—',
      d.br09Units ? `${d.br09Units} → ${som(d.br09Amount)}` : '—',
      d.inactiveUnits ? `${d.inactiveUnits} → ${som(d.inactiveAmount)}` : '—',
      rev ? `${rev.count} → ${som(rev.amount)}` : '—',
    ]);
  }
  printTable(
    [
      'ID',
      'Ustoz',
      'Stavka yo\'q (dars×o\'quvchi)',
      'BR-09 yangi o\'quvchi',
      'Nofaol o\'quvchi kepkasi',
      'Bekor qilingan accrual',
    ],
    flagRows,
    ['r', 'l', 'l', 'l', 'l', 'l'],
  );

  if (issues.length) {
    section('PROFIL RAQAMI FARQ QILGAN USTOZLAR');
    for (const s of issues) console.log(`  • ${s}`);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
