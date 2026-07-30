/**
 * audit-july-clean — READ-ONLY. Tizim ko'rsatayotgan IYUL raqamlari va SOF
 * 01.07…bugun raqamlari yonma-yon.
 *
 * ⚠️ ESKIRGAN FRAMING: bu skript H3 (30.06 chegara xatosi) TUZATILISHIDAN OLDIN
 * yozilgan. Chegara tuzatilgach (`periodStartDate`/`periodEndDateExclusive`)
 * `lessonDate` bo'yicha bucketlash 30.06 ni iyulga tortmaydi — tizim raqami
 * 90 824 433 dan 89 005 090 ga tushdi (aynan 1 819 343 kamaydi).
 *
 * Shuning uchun pastdagi «ORTIQCHA (30.06 ikki marta)» qatori endi ikki marta
 * sanashni O'LCHAMAYDI. Iyulda qolgan 30.06 accruallari (37 ta, 613 505 so'm)
 * `creditPeriodDate` orqali ATAYLAB o'sha davrga kiritilgan — bu «oldingi
 * oydan» funksiyasi. Skriptning SOF ustuni ularni ham chiqarib tashlaydi, ya'ni
 * SOF endi tizimdan bir oz PAST chiqadi. Chegarani tekshirish uchun
 * `audit-boundary-probe.ts` dan foydalaning.
 *
 * gap (markaz qo'shimchasi) sweepi `SalaryMonthlyService.getMonthly` bilan
 * bir xil: BR-09 gate + nofaol o'quvchi kepkasi + FIXED_MONTHLY istisnosi.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import {
  perLessonAccrual,
  pickActiveVersion,
  RateVersion,
} from '../src/salary/shared/deserved-math';
import { NEW_STUDENT_TOPUP_MIN_LESSONS } from '../src/salary/shared/topup';
import { som, printTable, section, dbEnvLabel, dbHost } from './lib/check-cli';

@Module({
  imports: [PrismaModule],
  providers: [SalaryMonthlyService, SalaryStaffMonthlyService],
})
class M {}

const TZ = 5 * 3600 * 1000;
const ds = (d: Date) => d.toISOString().slice(0, 10);
const BOUNDARY_DAY = '2026-06-30'; // iyul oynasiga noto'g'ri kirib qolgan kun

async function main() {
  const app = await NestFactory.createApplicationContext(M, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const monthly = app.get(SalaryMonthlyService);

  const ceo = await prisma.user.findFirst({
    where: { deletedAt: null, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true, companyId: true },
  });
  if (!ceo) return void (await app.close());
  const companyId = ceo.companyId;

  const res = await monthly.getMonthly({ month: '2026-07' }, companyId, ceo.id);
  const { periodStart, periodEnd } = res.period;
  const ids = res.data.map((r) => r.user.id);

  console.log('═'.repeat(104));
  console.log(`  IYUL — TIZIM RAQAMI vs SOF 01.07…${ds(new Date())}   [${dbEnvLabel()} · ${dbHost()}]`);
  console.log('═'.repeat(104));

  // ── 30.06 accruallari (iyul `covered` ichiga noto'g'ri kirgan) ─────────
  const b = await prisma.salaryAccrual.groupBy({
    by: ['userId'],
    where: {
      companyId,
      userId: { in: ids },
      reversedAt: null,
      creditPeriodDate: null,
      lessonDate: {
        gte: new Date(`${BOUNDARY_DAY}T00:00:00.000Z`),
        lte: new Date(`${BOUNDARY_DAY}T23:59:59.999Z`),
      },
    },
    _sum: { amount: true },
  });
  const boundaryCovered = new Map(b.map((x) => [x.userId as number, x._sum.amount ?? 0]));

  // ── 30.06 gap hissasi: getMonthly sweepini AYNAN takrorlab, faqat 30.06 ─
  const [attendances, groups, groupTeachers, overrides, versionRows, heldCounts, inactive, accrualsAll] =
    await Promise.all([
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
        select: { id: true, course: { select: { price: true, lessonPaymentCount: true } } },
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
        where: { companyId, status: { in: ['PRESENT', 'LATE'] }, date: { lte: periodEnd } },
        _count: { _all: true },
      }),
      prisma.student.findMany({
        where: { companyId, status: { not: 'ACTIVE' }, statusChangedAt: { not: null } },
        select: { id: true, statusChangedAt: true },
      }),
      prisma.salaryAccrual.findMany({
        where: {
          companyId,
          userId: { in: ids },
          reversedAt: null,
          OR: [
            { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
            { creditPeriodDate: null, lessonDate: { gte: periodStart, lte: periodEnd } },
          ],
        },
        select: { userId: true, attendanceId: true },
      }),
    ]);

  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const roster = new Map<string, number[]>();
  for (const gt of groupTeachers) roster.set(gt.groupId, [...(roster.get(gt.groupId) ?? []), gt.teacherId]);
  const ovr = new Map<string, number[]>();
  for (const o of overrides) ovr.set(`${o.groupId}::${ds(o.date)}`, o.teacherIds);
  const teachersOf = (g: string, d: string) => ovr.get(`${g}::${d}`) ?? roster.get(g) ?? [];

  const vers = new Map<string, RateVersion[]>();
  const fixed = new Set<number>();
  for (const r of versionRows) {
    const k = `${r.config.userId}::${r.config.groupId ?? 'GLOBAL'}`;
    vers.set(k, [
      ...(vers.get(k) ?? []),
      { salaryType: r.salaryType, value: r.value, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo },
    ]);
    if (r.config.salaryType === 'FIXED_MONTHLY' && r.config.groupId == null) fixed.add(r.config.userId);
  }
  const rate = (t: number, g: string, at: Date) =>
    pickActiveVersion(vers.get(`${t}::${g}`), at) ?? pickActiveVersion(vers.get(`${t}::GLOBAL`), at);

  const held = new Map<string, number>();
  for (const h of heldCounts) held.set(`${h.studentId}::${h.groupId}`, h._count._all);
  const inact = new Map<number, string>();
  for (const s of inactive)
    if (s.statusChangedAt) inact.set(s.id, new Date(s.statusChangedAt.getTime() + TZ).toISOString().slice(0, 10));

  const coveredAtt = new Map<number, Set<string>>();
  for (const a of accrualsAll) {
    if (!a.attendanceId) continue;
    const s = coveredAtt.get(a.userId) ?? new Set<string>();
    s.add(a.attendanceId);
    coveredAtt.set(a.userId, s);
  }

  const boundaryGap = new Map<number, number>();
  for (const att of attendances) {
    if (ds(att.date) !== BOUNDARY_DAY) continue;
    const g = groupMap.get(att.groupId);
    if (!g) continue;
    if ((held.get(`${att.studentId}::${att.groupId}`) ?? 0) < NEW_STUDENT_TOPUP_MIN_LESSONS) continue;
    const dead = inact.get(att.studentId);
    if (dead !== undefined && ds(att.date) > dead) continue;
    const lpc = g.course.lessonPaymentCount || 12;
    const perLesson = Math.round(g.course.price / lpc);
    for (const t of teachersOf(att.groupId, ds(att.date))) {
      if (!ids.includes(t) || fixed.has(t)) continue;
      if (coveredAtt.get(t)?.has(att.id)) continue;
      const v = rate(t, att.groupId, att.date);
      if (!v) continue;
      boundaryGap.set(t, (boundaryGap.get(t) ?? 0) + perLessonAccrual(v, perLesson, lpc));
    }
  }

  // ── Yakuniy jadval ────────────────────────────────────────────────────
  section(`SOF 01.07…${ds(new Date())} (30.06 chiqarib tashlangan)`);
  const rows: (string | number)[][] = [];
  let TD = 0, TC = 0, TG = 0, TA = 0, TN = 0, TB = 0;
  for (const [i, r] of res.data.entries()) {
    const bc = boundaryCovered.get(r.user.id) ?? 0;
    const bg = boundaryGap.get(r.user.id) ?? 0;
    const cov = (r.covered ?? 0) - bc;
    const gap = (r.gap ?? 0) - bg;
    const des = cov + gap;
    const net = Math.max(0, des - r.advances);
    if (r.fullDeserved == null && bc === 0 && bg === 0 && r.advances === 0) continue;
    rows.push([
      i + 1,
      r.user.id,
      `${r.user.firstName} ${r.user.lastName}`.replace(/\s+/g, ' ').slice(0, 24),
      som(des),
      som(cov),
      som(gap),
      som(r.advances),
      som(net),
      som(bc + bg),
    ]);
    TD += des; TC += cov; TG += gap; TA += r.advances; TN += net; TB += bc + bg;
  }
  printTable(
    ['#', 'ID', 'Ustoz', "To'liq ishlangan", "O'quvchi to'lagan", "Markaz qo'shadi", 'Avans', "Qo'lga tegishi", '30.06 farqi'],
    rows,
    ['r', 'r', 'l', 'r', 'r', 'r', 'r', 'r', 'r'],
  );
  console.log(
    `\n  SOF JAMI: to'liq ${som(TD)} | to'langan ${som(TC)} | markaz ${som(TG)} | avans ${som(TA)} | qo'lga ${som(TN)}`,
  );
  console.log(`  TIZIM JAMI: to'liq ${som(res.totals.fullDeserved)} | qo'lga ${som(res.totals.netToPay)}`);
  console.log(`  ORTIQCHA (30.06 ikki marta): ${som(TB)} so'm`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
