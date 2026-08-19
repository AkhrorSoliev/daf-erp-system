/**
 * audit-stale-center-topup — READ-ONLY.
 *
 * Finds accruals still flagged `isCenterTopUp=true` (the center is recorded as
 * having fronted the teacher's pay for an unpaid lesson) where the student has
 * SINCE PAID. The recovery flip only fires when a lesson is re-billed, so a
 * payment that merely tops the balance back up never clears the flag.
 *
 * FIFO model: a balance settles oldest lesson first, so the genuinely unpaid
 * lessons are the NEWEST ones summing to the student's current debt. A fronted
 * lesson outside that tail has been paid for → the flag is stale.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const SYSTEM_START = '2026-05-01';
const f = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const day = (d: Date) => d.toISOString().slice(0, 10);

(async () => {
  const fronted = await prisma.salaryAccrual.findMany({
    where: { reversedAt: null, isCenterTopUp: true },
    select: { id: true, studentId: true, userId: true, groupId: true, attendanceId: true,
              lessonDate: true, amount: true, perLessonCost: true },
  });
  const sids = [...new Set(fronted.map((r) => r.studentId))];

  const [students, enrollments, atts, groups] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: sids } },
      select: { id: true, firstName: true, lastName: true, balance: true, status: true,
                discountPercent: true, deletedAt: true, phone: true },
    }),
    prisma.enrollment.findMany({
      where: { studentId: { in: sids } },
      select: { studentId: true, groupId: true, status: true, startDate: true, prepaidLessonsRemaining: true },
    }),
    prisma.attendance.findMany({
      where: { studentId: { in: sids }, date: { gte: new Date('2026-05-01T00:00:00.000Z') },
               status: { in: ['PRESENT', 'LATE', 'ABSENT'] } },
      select: { id: true, studentId: true, groupId: true, date: true },
    }),
    prisma.group.findMany({ select: { id: true, name: true, groupNumber: true,
      course: { select: { price: true, lessonPaymentCount: true } } } }),
  ]);

  const perLesson = new Map(groups.map((g) => [g.id, Math.round((g.course?.price ?? 0) / (g.course?.lessonPaymentCount || 1))]));
  const gname = new Map(groups.map((g) => [g.id, g.groupNumber ? `#${g.groupNumber}` : g.id.slice(0, 6)]));
  const smap = new Map(students.map((s) => [s.id, s]));

  // prepaid value + enrollment start per student
  const prepaid = new Map<number, number>();
  const startBy = new Map<string, string>(); // `${sid}|${gid}`
  for (const e of enrollments) {
    if (e.status === 'ACTIVE' && e.prepaidLessonsRemaining > 0)
      prepaid.set(e.studentId, (prepaid.get(e.studentId) ?? 0) + e.prepaidLessonsRemaining * (perLesson.get(e.groupId) ?? 0));
    const k = `${e.studentId}|${e.groupId}`;
    const sd = e.startDate ? day(e.startDate) : '';
    const cur = startBy.get(k);
    if (sd && (!cur || sd < cur)) startBy.set(k, sd);
  }

  const lessonsBy = new Map<number, { id: string; date: Date; cost: number }[]>();
  for (const a of atts) {
    const s = smap.get(a.studentId);
    if (!s) continue;
    const start = startBy.get(`${a.studentId}|${a.groupId}`);
    const d = day(a.date);
    if (d < SYSTEM_START) continue;
    if (start && d < start) continue;
    const cost = Math.round((perLesson.get(a.groupId) ?? 0) * (1 - (s.discountPercent || 0) / 100));
    const arr = lessonsBy.get(a.studentId) ?? [];
    arr.push({ id: a.id, date: a.date, cost });
    lessonsBy.set(a.studentId, arr);
  }

  type Row = {
    sid: number; name: string; status: string; balance: number; position: number; debt: number;
    lessons: number; centerTotal: number; staleCenter: number; genuineCenter: number;
    staleLessons: number; genuineLessons: number; klass: string; teachers: Set<number>;
  };
  const rows: Row[] = [];

  for (const sid of sids) {
    const s = smap.get(sid);
    if (!s) continue;
    const pre = Math.round((prepaid.get(sid) ?? 0) * (1 - (s.discountPercent || 0) / 100));
    const position = s.balance + pre;
    const debt = Math.max(0, -position);

    // FIFO: newest lessons totalling `debt` are the unpaid ones.
    const ls = (lessonsBy.get(sid) ?? []).sort((a, b) => b.date.getTime() - a.date.getTime());
    const unpaid = new Set<string>();
    let acc = 0;
    for (const l of ls) {
      if (acc >= debt) break;
      unpaid.add(l.id);
      acc += l.cost;
    }

    const mine = fronted.filter((r) => r.studentId === sid);
    let stale = 0, genuine = 0, staleN = 0, genuineN = 0;
    for (const r of mine) {
      if (r.attendanceId && unpaid.has(r.attendanceId)) { genuine += r.amount; genuineN++; }
      else { stale += r.amount; staleN++; }
    }
    const centerTotal = stale + genuine;
    const klass = staleN === 0 ? 'TOG\'RI' : genuineN === 0 ? 'TO\'LIQ ESKIRGAN' : 'QISMAN ESKIRGAN';
    rows.push({ sid, name: `${s.firstName} ${s.lastName}`.trim(), status: s.status + (s.deletedAt ? '/ARX' : ''),
      balance: s.balance, position, debt, lessons: mine.length, centerTotal,
      staleCenter: stale, genuineCenter: genuine, staleLessons: staleN, genuineLessons: genuineN,
      klass, teachers: new Set(mine.map((r) => r.userId)) });
  }

  rows.sort((a, b) => b.staleCenter - a.staleCenter);
  const tot = (k: keyof Row) => rows.reduce((s, r) => s + (r[k] as number), 0);

  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  ESKIRGAN «MARKAZ QOPLADI» BAYROQLARI — PROD AUDIT');
  console.log('══════════════════════════════════════════════════════════════════════\n');
  console.log(`fronted o'quvchilar         : ${rows.length}`);
  console.log(`fronted darslar             : ${fronted.length}`);
  console.log(`Z (hisobotdagi «qolgan»)    : ${f(tot('centerTotal'))} so'm`);
  console.log(`  ├─ HAQIQIY (hali qarzdor) : ${f(tot('genuineCenter'))} so'm  (${tot('genuineLessons')} dars)`);
  console.log(`  └─ ESKIRGAN (to'lab bo'lgan): ${f(tot('staleCenter'))} so'm  (${tot('staleLessons')} dars)  ← XATO`);
  const pctStale = (tot('staleCenter') / (tot('centerTotal') || 1)) * 100;
  console.log(`\nZ ning ${pctStale.toFixed(1)}% i noto'g'ri.\n`);

  const byKlass = new Map<string, { n: number; a: number }>();
  for (const r of rows) {
    const e = byKlass.get(r.klass) ?? { n: 0, a: 0 };
    e.n++; e.a += r.staleCenter; byKlass.set(r.klass, e);
  }
  console.log('toifa               o\'quvchi   eskirgan summa');
  for (const [k, v] of [...byKlass].sort((a, b) => b[1].a - a[1].a))
    console.log(`${k.padEnd(20)} ${String(v.n).padStart(6)}   ${f(v.a).padStart(12)}`);

  console.log('\n── ESKIRGAN BAYROQLI O\'QUVCHILAR (staleCenter > 0) ──');
  console.log('#id     ism                          status      balans      pozitsiya  fr.dars  eskirgan  haqiqiy   toifa');
  console.log('──────  ───────────────────────────  ──────────  ──────────  ─────────  ───────  ────────  ────────  ──────────────');
  for (const r of rows.filter((r) => r.staleCenter > 0)) {
    console.log([
      String(r.sid).padEnd(6), r.name.slice(0, 27).padEnd(27), r.status.padEnd(10),
      f(r.balance).padStart(10), f(r.position).padStart(9), String(r.lessons).padStart(7),
      f(r.staleCenter).padStart(8), f(r.genuineCenter).padStart(8), r.klass,
    ].join('  '));
  }

  console.log('\n── HAQIQATDAN QARZDOR (bayroq to\'g\'ri) ──');
  const ok = rows.filter((r) => r.staleCenter === 0).sort((a, b) => b.genuineCenter - a.genuineCenter);
  console.log(`${ok.length} o'quvchi, ${f(ok.reduce((s, r) => s + r.genuineCenter, 0))} so'm — top 10:`);
  for (const r of ok.slice(0, 10))
    console.log(`  #${r.sid}  ${r.name.slice(0, 25).padEnd(25)} qarz ${f(r.debt).padStart(9)}  markaz ${f(r.genuineCenter).padStart(8)}`);

  await prisma.$disconnect();
})();
