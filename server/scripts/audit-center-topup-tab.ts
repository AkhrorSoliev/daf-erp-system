/**
 * audit-center-topup-tab — READ-ONLY deep check of /payments/debt?tab=markaz.
 *
 * Runs the real service, then recomputes every figure it returned straight
 * from the tables and compares. Nothing is trusted twice: the service's own
 * numbers are never used as the expectation for themselves.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DebtAgeService } from '../src/common/finance/debt-age.service';
import { RedisService } from '../src/redis/redis.service';
import { SalaryCenterTopUpService } from '../src/salary/salary-center-topup.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SalaryCenterTopUpService,
    DebtAgeService,
    { provide: RedisService, useValue: { get: async () => null, setex: async () => undefined } },
  ],
})
class AuditModule {}

const f = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

(async () => {
  const app = await NestFactory.createApplicationContext(AuditModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const svc = app.get(SalaryCenterTopUpService);
  const ceo = await prisma.user.findFirst({
    where: { roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true, companyId: true },
  });
  if (!ceo) { console.log('CEO yo`q'); await app.close(); return; }

  const res = await svc.getStudents({ allMonths: true } as any, ceo.companyId, ceo.id);

  // ── independent recomputation, straight from the tables ──────────────────
  const accruals = await prisma.salaryAccrual.findMany({
    where: { companyId: ceo.companyId, reversedAt: null, isCenterTopUp: true },
    select: { studentId: true, attendanceId: true, amount: true, perLessonCost: true, lessonDate: true, userId: true, groupId: true },
  });
  const deductions = await prisma.transaction.findMany({
    where: {
      attendanceId: { in: accruals.map((a) => a.attendanceId).filter((x): x is string => !!x) },
      type: 'LESSON_DEDUCTION', reversedAt: null,
    },
    select: { attendanceId: true, metadata: true },
  });
  const outstanding = new Map<string, number>();
  for (const d of deductions)
    if (d.attendanceId)
      outstanding.set(d.attendanceId, Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0)));

  const students = await prisma.student.findMany({
    where: { id: { in: [...new Set(accruals.map((a) => a.studentId))] } },
    select: { id: true, balance: true, status: true, firstName: true, lastName: true },
  });
  const bal = new Map(students.map((s) => [s.id, s.balance]));

  type Exp = { lessons: number; paid: number; unrec: number };
  const expected = new Map<number, Exp>();
  for (const a of accruals) {
    const e = expected.get(a.studentId) ?? { lessons: 0, paid: 0, unrec: 0 };
    e.lessons += 1;
    e.paid += a.amount;
    e.unrec += Math.min(a.amount, (a.attendanceId ? outstanding.get(a.attendanceId) : undefined) ?? a.perLessonCost);
    expected.set(a.studentId, e);
  }
  // student-level cap
  for (const [sid, e] of expected) {
    const debt = Math.max(0, -(bal.get(sid) ?? 0));
    e.unrec = Math.min(e.unrec, debt);
  }

  console.log('══════════ 1. QATOR DARAJASIDA ══════════');
  const rowById = new Map(res.data.map((r) => [r.student.id, r]));
  let badLessons = 0, badPaid = 0, badUnrec = 0, badDebt = 0;
  const ex: string[] = [];
  for (const r of res.data) {
    const e = expected.get(r.student.id);
    if (!e) { badUnrec++; ex.push(`#${r.student.id} xom ma'lumotda yo'q`); continue; }
    if (r.lessons !== e.lessons) { badLessons++; ex.push(`#${r.student.id} darslar ${r.lessons}≠${e.lessons}`); }
    if (r.centerPaid !== e.paid) { badPaid++; ex.push(`#${r.student.id} chiqim ${r.centerPaid}≠${e.paid}`); }
    if (r.centerUnrecovered !== e.unrec) { badUnrec++; ex.push(`#${r.student.id} qaytmagan ${r.centerUnrecovered}≠${e.unrec}`); }
    const debt = Math.max(0, -(bal.get(r.student.id) ?? 0));
    if (r.studentDebt !== debt) { badDebt++; ex.push(`#${r.student.id} qarz ${r.studentDebt}≠${debt}`); }
  }
  check(badLessons === 0, `darslar soni xom ma'lumotga mos (${res.data.length} qator)`, ex.filter(x=>x.includes('darslar')).slice(0,3).join('; '));
  check(badPaid === 0, 'markaz chiqimi mos', ex.filter(x=>x.includes('chiqim')).slice(0,3).join('; '));
  check(badUnrec === 0, 'markaz hali olmagani mos', ex.filter(x=>x.includes('qaytmagan')).slice(0,3).join('; '));
  check(badDebt === 0, 'jami qarz = profil balansi', ex.filter(x=>x.includes('qarz')).slice(0,3).join('; '));

  console.log('\n══════════ 2. USTUNLAR ORASIDAGI MANTIQ ══════════');
  const overDebt = res.data.filter((r) => r.centerUnrecovered > r.studentDebt);
  const overPaid = res.data.filter((r) => r.centerUnrecovered > r.centerPaid);
  const zero = res.data.filter((r) => r.centerUnrecovered <= 0);
  const negative = res.data.filter((r) => r.centerUnrecovered < 0 || r.studentDebt < 0 || r.centerPaid < 0);
  check(overDebt.length === 0, 'markaz olmagani ≤ jami qarz (ichida turadi)', overDebt.slice(0,3).map(r=>`#${r.student.id} ${f(r.centerUnrecovered)}>${f(r.studentDebt)}`).join('; '));
  check(overPaid.length === 0, 'markaz olmagani ≤ markaz chiqargani', overPaid.slice(0,3).map(r=>`#${r.student.id}`).join('; '));
  check(zero.length === 0, 'nol qatorlar ro`yxatga tushmagan', zero.slice(0,3).map(r=>`#${r.student.id}`).join('; '));
  check(negative.length === 0, 'manfiy summa yo`q');

  console.log('\n══════════ 3. JAMI QATORI ══════════');
  const sumRows = res.data.reduce((t, r) => ({
    unrec: t.unrec + r.centerUnrecovered, debt: t.debt + r.studentDebt, lessons: t.lessons + r.lessons,
  }), { unrec: 0, debt: 0, lessons: 0 });
  const rawPaidAll = accruals.reduce((t, a) => t + a.amount, 0);
  const rawLessonsAll = accruals.length;
  check(res.totals.centerPaid === rawPaidAll,
    `totals.centerPaid = barcha isCenterTopUp accrual yig'indisi (${f(res.totals.centerPaid)})`,
    `servis ${f(res.totals.centerPaid)} vs xom ${f(rawPaidAll)}`);
  check(res.totals.centerUnrecovered === sumRows.unrec,
    `totals.centerUnrecovered = ko'rinadigan qatorlar yig'indisi (${f(sumRows.unrec)})`,
    `${f(res.totals.centerUnrecovered)} vs ${f(sumRows.unrec)}`);
  check(res.totals.lessonCount === rawLessonsAll,
    `darslar jami = ${rawLessonsAll}`, `${res.totals.lessonCount} vs ${rawLessonsAll}`);
  const listedLessons = sumRows.lessons;
  console.log(`     ℹ ro'yxatdagi qatorlar ${res.data.length} ta / ${expected.size} tadan · ularning darslari ${listedLessons} / ${rawLessonsAll}`);

  console.log('\n══════════ 4. OY BO`YICHA BO`LINISH ══════════');
  let monthLessonMismatch = 0, monthPaidMismatch = 0, debtMonthMismatch = 0;
  const dm: string[] = [];
  for (const r of res.data) {
    const ml = r.months.reduce((t: number, m: any) => t + m.lessons, 0);
    const mp = r.months.reduce((t: number, m: any) => t + m.centerPaid, 0);
    if (ml !== r.lessons) monthLessonMismatch++;
    if (mp !== r.centerPaid) monthPaidMismatch++;
    const db = r.debtByMonth.reduce((t: number, m: any) => t + m.amount, 0);
    if (r.debtByMonth.length && Math.abs(db - r.studentDebt) > 1) {
      debtMonthMismatch++;
      if (dm.length < 3) dm.push(`#${r.student.id} ⧉ ${f(db)} vs qarz ${f(r.studentDebt)}`);
    }
  }
  check(monthLessonMismatch === 0, 'oy nishonlaridagi darslar yig`indisi = qatordagi darslar');
  check(monthPaidMismatch === 0, 'oy nishonlaridagi markaz summasi = qatordagi chiqim');
  check(debtMonthMismatch === 0, '⧉ oylar bo`yicha qarz yig`indisi = jami qarz', dm.join('; '));
  const noBreakdown = res.data.filter((r) => r.debtByMonth.length === 0);
  console.log(`     ℹ ⧉ bo'linishi yo'q qatorlar: ${noBreakdown.length}`);

  console.log('\n══════════ 5. FILTR: KIM TUSHMAY QOLDI ══════════');
  const dropped = [...expected.entries()].filter(([sid]) => !rowById.has(sid));
  let wrongDrop = 0;
  for (const [sid, e] of dropped) if (e.unrec > 0) { wrongDrop++; }
  check(wrongDrop === 0, `tushib qolganlarning hammasida qaytmagan = 0 (${dropped.length} ta)`,
    dropped.filter(([,e])=>e.unrec>0).slice(0,3).map(([sid,e])=>`#${sid} ${f(e.unrec)}`).join('; '));
  for (const [sid] of dropped.slice(0, 6)) {
    const s = students.find((x) => x.id === sid)!;
    console.log(`     · #${sid} ${`${s.firstName} ${s.lastName}`.slice(0,22).padEnd(22)} balans ${f(s.balance).padStart(9)} → puli qaytgan`);
  }

  console.log('\n══════════ 6. BIR OY TANLANGANDA ══════════');
  const july = await svc.getStudents({ month: '2026-07' } as any, ceo.companyId, ceo.id);
  const julyRaw = accruals.filter((a) => a.lessonDate >= new Date('2026-07-01') && a.lessonDate < new Date('2026-08-01'));
  check(july.totals.lessonCount === julyRaw.length,
    `iyul: darslar ${july.totals.lessonCount} = xom ${julyRaw.length}`);
  check(july.data.every((r) => r.centerUnrecovered <= r.studentDebt), 'iyul: ustun ichida turadi');
  console.log(`     ℹ iyul: ${july.data.length} qator, chiqim ${f(july.totals.centerPaid)}, qaytmagan ${f(july.totals.centerUnrecovered)}`);

  console.log(`\n══════════ NATIJA: ${pass} ✅   ${fail} ❌ ══════════`);
  await app.close();
})();
