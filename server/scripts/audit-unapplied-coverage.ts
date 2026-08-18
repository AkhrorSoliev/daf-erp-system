/**
 * audit-unapplied-coverage — READ-ONLY.
 * Simulates settleDeferredAccruals() exactly as coded, for every student that
 * still carries `salaryDeferred=true` deductions. Reports what WOULD settle if
 * it ran today, and splits by root cause (no ACTIVE enrolment = the 726d65f
 * empty-roster bug vs. something else).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const f = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

(async () => {
  const deferred = await prisma.transaction.findMany({
    where: { type: 'LESSON_DEDUCTION', reversedAt: null, metadata: { path: ['salaryDeferred'], equals: true } },
    select: { id: true, studentId: true, attendanceId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const sids = [...new Set(deferred.map((d) => d.studentId).filter(Boolean))] as number[];
  const [students, enrs, accruals] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: sids } },
      select: { id: true, firstName: true, lastName: true, balance: true, status: true, deletedAt: true } }),
    prisma.enrollment.findMany({ where: { studentId: { in: sids } }, select: { studentId: true, status: true } }),
    prisma.salaryAccrual.findMany({ where: { studentId: { in: sids }, reversedAt: null },
      select: { studentId: true, attendanceId: true, amount: true, isCenterTopUp: true } }),
  ]);
  const smap = new Map(students.map((s) => [s.id, s]));
  const activeEnr = new Set(enrs.filter((e) => e.status === 'ACTIVE').map((e) => e.studentId));
  const frontedByAtt = new Map(accruals.filter((a) => a.isCenterTopUp).map((a) => [a.attendanceId, a.amount]));
  const anyAccrualAtt = new Set(accruals.map((a) => a.attendanceId));

  const byStudent = new Map<number, typeof deferred>();
  for (const d of deferred) {
    if (!d.studentId) continue;
    const arr = byStudent.get(d.studentId) ?? [];
    arr.push(d); byStudent.set(d.studentId, arr);
  }

  type R = { sid: number; name: string; status: string; hasActive: boolean; debt: number;
             openUncovered: number; lessonsSettle: number; centerCleared: number; noAccrual: number };
  const rows: R[] = [];
  for (const [sid, ds] of byStudent) {
    const s = smap.get(sid); if (!s) continue;
    const totalUncovered = ds.reduce((t, d) => t + Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0)), 0);
    const debt = s.balance < 0 ? -s.balance : 0;
    let apply = Math.max(0, totalUncovered - debt);
    let lessons = 0, cleared = 0;
    for (const d of ds) {                        // oldest first — mirrors the loop
      if (apply <= 0) break;
      const u = Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0));
      if (u <= 0) continue;
      const applied = Math.min(u, apply);
      apply -= applied;
      if (applied < u) continue;                 // partial → stays deferred
      lessons++;
      cleared += frontedByAtt.get(d.attendanceId!) ?? 0;
    }
    const noAccrual = ds.filter((d) => d.attendanceId && !anyAccrualAtt.has(d.attendanceId)).length;
    rows.push({ sid, name: `${s.firstName} ${s.lastName}`.trim(), status: s.status + (s.deletedAt ? '/ARX' : ''),
      hasActive: activeEnr.has(sid), debt, openUncovered: totalUncovered, lessonsSettle: lessons,
      centerCleared: cleared, noAccrual });
  }

  const hit = rows.filter((r) => r.lessonsSettle > 0).sort((a, b) => b.centerCleared - a.centerCleared);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  QOʻLLANMAGAN QOPLAMA (settleDeferredAccruals simulyatsiyasi)');
  console.log('══════════════════════════════════════════════════════════════════\n');
  console.log(`salaryDeferred=true ochiq yechimlar : ${deferred.length} dars, ${f(rows.reduce((s,r)=>s+r.openUncovered,0))} so'm`);
  console.log(`shundan o'quvchilar                 : ${rows.length}`);
  console.log(`\nAGAR HOZIR ISHLASA:`);
  console.log(`  yopiladigan darslar               : ${hit.reduce((s,r)=>s+r.lessonsSettle,0)}`);
  console.log(`  markaz avansidan tozalanadi       : ${f(hit.reduce((s,r)=>s+r.centerCleared,0))} so'm`);
  console.log(`  ta'sirlangan o'quvchilar          : ${hit.length}`);

  const noRoster = hit.filter((r) => !r.hasActive);
  const withRoster = hit.filter((r) => r.hasActive);
  console.log(`\nSABAB bo'yicha:`);
  console.log(`  A) ACTIVE enrollment YO'Q (726d65f bug) : ${noRoster.length} o'quvchi, ${noRoster.reduce((s,r)=>s+r.lessonsSettle,0)} dars, markaz ${f(noRoster.reduce((s,r)=>s+r.centerCleared,0))}`);
  console.log(`  B) ACTIVE enrollment BOR (boshqa sabab) : ${withRoster.length} o'quvchi, ${withRoster.reduce((s,r)=>s+r.lessonsSettle,0)} dars, markaz ${f(withRoster.reduce((s,r)=>s+r.centerCleared,0))}`);

  console.log('\n── TOP: markazga qaytishi kerak bo\'lgan summa bo\'yicha ──');
  console.log("#id     ism                        status      ACTIVE  qarz       ochiq qopl.  yopilar dars  markaz tozalanadi");
  console.log('──────  ─────────────────────────  ──────────  ──────  ─────────  ───────────  ────────────  ─────────────────');
  for (const r of hit.slice(0, 30))
    console.log([String(r.sid).padEnd(6), r.name.slice(0,25).padEnd(25), r.status.padEnd(10),
      (r.hasActive ? 'ha' : 'YO`Q').padEnd(6), f(r.debt).padStart(9), f(r.openUncovered).padStart(11),
      String(r.lessonsSettle).padStart(12), f(r.centerCleared).padStart(17)].join('  '));

  const orphan = rows.filter((r) => r.noAccrual > 0);
  console.log(`\n── QO'SHIMCHA: yechilgan, lekin HECH QANDAY accrual yo'q darslar ──`);
  console.log(`  ${orphan.reduce((s,r)=>s+r.noAccrual,0)} dars, ${orphan.length} o'quvchida — o'qituvchiga ham, markazdan ham to'lanmagan.`);
  await prisma.$disconnect();
})();
