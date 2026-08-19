/**
 * dryrun-settle-clean-students — READ-ONLY dry run.
 *
 * The "eng to'g'ri" cohort: students who (a) still carry deferred coverage that
 * settleDeferredAccruals() would apply today, and (b) whose balance was built
 * from REAL money only — no positive ADJUSTMENT, no REFUND. For them, "the
 * student has paid" means cash actually arrived, so writing the teacher's
 * accrual is unambiguous.
 *
 * Prints exactly what `POST /billing/retroactive/:studentId` would do per
 * student: which lessons settle, which teacher earns, how much, and which
 * payroll period the accrual lands in. Writes NOTHING.
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

  const [students, accruals, adjRows] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: sids } },
      select: { id: true, firstName: true, lastName: true, balance: true, status: true, deletedAt: true } }),
    prisma.salaryAccrual.findMany({ where: { studentId: { in: sids }, reversedAt: null },
      select: { attendanceId: true, amount: true, isCenterTopUp: true } }),
    prisma.transaction.findMany({ where: { studentId: { in: sids }, reversedAt: null,
      type: { in: ['ADJUSTMENT', 'REFUND'] } }, select: { studentId: true, type: true, amount: true } }),
  ]);
  const smap = new Map(students.map((s) => [s.id, s]));
  const accByAtt = new Map(accruals.map((a) => [a.attendanceId, a]));

  // "dirty" = balance touched by a positive correction or a refund → not pure cash
  const dirty = new Map<number, string[]>();
  for (const r of adjRows) {
    if (r.type === 'ADJUSTMENT' && r.amount <= 0) continue;
    const arr = dirty.get(r.studentId!) ?? [];
    arr.push(`${r.type} ${f(r.amount)}`);
    dirty.set(r.studentId!, arr);
  }

  const byStudent = new Map<number, typeof deferred>();
  for (const d of deferred) { const a = byStudent.get(d.studentId!) ?? []; a.push(d); byStudent.set(d.studentId!, a); }

  type Hit = { sid: number; name: string; status: string; debt: number; atts: string[] };
  const hits: Hit[] = [];
  for (const [sid, ds] of byStudent) {
    const s = smap.get(sid); if (!s) continue;
    const tot = ds.reduce((t, d) => t + Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0)), 0);
    const debt = Math.max(0, -s.balance);
    let apply = Math.max(0, tot - debt);
    const atts: string[] = [];
    for (const d of ds) {
      if (apply <= 0) break;
      const u = Math.max(0, Number((d.metadata as any)?.uncoveredAmount ?? 0));
      if (u <= 0) continue;
      const applied = Math.min(u, apply); apply -= applied;
      if (applied === u && d.attendanceId) atts.push(d.attendanceId);
    }
    if (atts.length) hits.push({ sid, name: `${s.firstName} ${s.lastName}`.trim(),
      status: s.status + (s.deletedAt ? '/ARX' : ''), debt, atts });
  }

  const clean = hits.filter((h) => !dirty.has(h.sid));
  const flagged = hits.filter((h) => dirty.has(h.sid));

  // resolve teachers + rate for the lessons that would settle
  const allAtt = clean.flatMap((h) => h.atts);
  const atts = await prisma.attendance.findMany({ where: { id: { in: allAtt } },
    select: { id: true, groupId: true, date: true } });
  const attMap = new Map(atts.map((a) => [a.id, a]));
  const gts = await prisma.groupTeacher.findMany({ where: { groupId: { in: [...new Set(atts.map((a) => a.groupId))] } },
    select: { groupId: true, teacherId: true } });
  const teachersOf = new Map<string, number[]>();
  for (const g of gts) { const a = teachersOf.get(g.groupId) ?? []; a.push(g.teacherId); teachersOf.set(g.groupId, a); }
  const teacherRows = await prisma.user.findMany({ where: { id: { in: [...new Set(gts.map((g) => g.teacherId))] } },
    select: { id: true, firstName: true, lastName: true } });
  const tname = new Map(teacherRows.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]));
  const dedMeta = new Map<string, number>();
  for (const d of deferred) if (d.attendanceId) dedMeta.set(d.attendanceId, Number((d.metadata as any)?.perLessonCost ?? 0));

  // observed teacher share (median) — used only to SIZE the new accruals
  const liveRatios = (await prisma.salaryAccrual.findMany({ where: { reversedAt: null, perLessonCost: { gt: 0 } },
    select: { amount: true, perLessonCost: true }, take: 5000 })).map((a) => a.amount / a.perLessonCost).sort((a, b) => a - b);
  const ratio = liveRatios[Math.floor(liveRatios.length / 2)] ?? 0.5;

  let newLessons = 0, newCost = 0, clearsCenter = 0, clearsLessons = 0, noTeacher = 0;
  const byMonth = new Map<string, number>();
  const byTeacher = new Map<number, { n: number; est: number }>();
  for (const h of clean) for (const id of h.atts) {
    const a = attMap.get(id); if (!a) continue;
    const ex = accByAtt.get(id);
    if (ex?.isCenterTopUp) { clearsCenter += ex.amount; clearsLessons++; continue; }
    if (ex) continue;
    const ts = teachersOf.get(a.groupId) ?? [];
    if (!ts.length) { noTeacher++; continue; }
    newLessons++;
    const cost = dedMeta.get(id) ?? 0;
    newCost += cost;
    const k = a.date.toISOString().slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
    for (const t of ts) { const e = byTeacher.get(t) ?? { n: 0, est: 0 }; e.n++; e.est += cost * ratio; byTeacher.set(t, e); }
  }

  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  DRY RUN — «eng to\'g\'ri» guruh (faqat haqiqiy pul bilan to\'laganlar)');
  console.log('  HECH NARSA YOZILMADI');
  console.log('══════════════════════════════════════════════════════════════════\n');
  console.log(`yopilishi kerak bo'lgan o'quvchilar (jami)       : ${hits.length}`);
  console.log(`  ✓ TOZA  — musbat tuzatish/qaytarish YO'Q       : ${clean.length}`);
  console.log(`  ⚠ SHUBHALI — ADJUSTMENT/REFUND bor, CEO ko'rsin: ${flagged.length}`);
  console.log(`\nTOZA guruhda nima bo'ladi:`);
  console.log(`  markaz avansi tozalanadi : ${clearsLessons} dars → ${f(clearsCenter)} so'm`);
  console.log(`  YANGI accrual yoziladi   : ${newLessons} dars`);
  console.log(`    darslarning o'quvchi narxi : ${f(newCost)}`);
  console.log(`    o'qituvchiga tegadi (≈${(ratio*100).toFixed(0)}%): ≈ ${f(newCost * ratio)} so'm`);
  if (noTeacher) console.log(`  ⚠ o'qituvchisi biriktirilmagan guruh darslari: ${noTeacher} (hech kimga yozilmaydi)`);
  console.log(`\n  darslar qaysi oydan:`);
  for (const [k, v] of [...byMonth].sort()) console.log(`    ${k} : ${v} dars`);
  console.log(`  ⚠ iyul davri allaqachon CALCULATED — bu accruallar OCHIQ davrga (avgust) tushadi.`);

  console.log(`\n── o'qituvchilar bo'yicha (≈) ──`);
  for (const [t, v] of [...byTeacher].sort((a, b) => b[1].est - a[1].est))
    console.log(`  #${t}  ${(tname.get(t) ?? '?').slice(0, 28).padEnd(28)} ${String(v.n).padStart(4)} dars  ≈ ${f(v.est).padStart(10)}`);

  console.log(`\n── TOZA o'quvchilar ro'yxati (${clean.length}) ──`);
  console.log("#id     ism                        status      qarz       dars");
  for (const h of clean.sort((a, b) => b.atts.length - a.atts.length))
    console.log([String(h.sid).padEnd(6), h.name.slice(0,25).padEnd(25), h.status.padEnd(10), f(h.debt).padStart(9), String(h.atts.length).padStart(5)].join('  '));

  console.log(`\n── SHUBHALI (${flagged.length}) — hozir TEGILMAYDI ──`);
  for (const h of flagged.sort((a, b) => b.atts.length - a.atts.length))
    console.log(`  #${h.sid}  ${h.name.slice(0,25).padEnd(25)} ${String(h.atts.length).padStart(3)} dars  [${(dirty.get(h.sid) ?? []).slice(0,2).join(', ')}]`);

  console.log(`\nIDLAR (toza): ${clean.map((h) => h.sid).join(' ')}`);
  await prisma.$disconnect();
})();
