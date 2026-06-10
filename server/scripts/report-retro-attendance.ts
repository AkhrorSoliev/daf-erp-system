/**
 * Verification-ready REPORT of the #10453-signature retroactive attendance.
 * Read-only. Groups suspects by group+teacher so the center can confirm with
 * teachers WHICH students actually did not attend the back-entered lessons,
 * before any correction. Writes a CSV the center can open in Excel.
 *
 * "Phantom" = admin-entered (>=5d late) lesson dated BEFORE the student's
 * first real-time TEACHER mark. NOTE: back-filling real attendance is also a
 * legitimate workflow here, so these are SUSPECTS, not proven over-charges.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const GAP_DAYS = 5;
const ADMIN_ROLES = ['CEO', 'Branch Director', 'Administrator'];
const TEST_IDS = new Set([10003, 10028, 10051]);
const OUT = '/Users/a1111/Desktop/daf-erp-system/phantom-attendance-report.csv';
const DOW = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

function tk(d: Date) {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function gap(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

(async () => {
  const roleUsers = await prisma.userRole.findMany({
    select: { userId: true, role: { select: { name: true } } },
  });
  const adminIds = new Set<number>();
  const teacherIds = new Set<number>();
  for (const ru of roleUsers) {
    if (ADMIN_ROLES.includes(ru.role.name)) adminIds.add(ru.userId);
    if (ru.role.name === 'Teacher') teacherIds.add(ru.userId);
  }
  const users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true } });
  const uName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const atts = await prisma.attendance.findMany({
    where: { markedById: { in: [...adminIds] } },
    select: {
      id: true, date: true, status: true, createdAt: true, markedById: true, studentId: true,
      group: {
        select: {
          id: true, name: true, startDate: true,
          course: { select: { price: true, lessonPaymentCount: true } },
          teachers: { select: { teacher: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });
  const flagged = atts.filter((a) => gap(a.date, a.createdAt) >= GAP_DAYS && !TEST_IDS.has(a.studentId));

  // first teacher-marked date per student
  const sids = [...new Set(flagged.map((f) => f.studentId))];
  const tAtts = await prisma.attendance.findMany({
    where: { studentId: { in: sids }, markedById: { in: [...teacherIds] } },
    select: { studentId: true, date: true }, orderBy: { date: 'asc' },
  });
  const firstTeacher = new Map<number, Date>();
  for (const t of tAtts) if (!firstTeacher.has(t.studentId)) firstTeacher.set(t.studentId, t.date);

  const students = await prisma.student.findMany({
    where: { id: { in: sids } },
    select: { id: true, firstName: true, lastName: true, balance: true, deletedAt: true },
  });
  const sMap = new Map(students.map((s) => [s.id, s]));

  // phantom rows
  type Row = {
    group: string; teacher: string; groupStart: string;
    sid: number; sname: string; balance: number;
    date: string; dow: string; status: string;
    enteredBy: string; enteredOn: string; perLesson: number;
    firstTeacher: string; beforeStart: boolean;
  };
  const rows: Row[] = [];
  for (const f of flagged) {
    const ftd = firstTeacher.get(f.studentId);
    if (!ftd || f.date.getTime() >= ftd.getTime()) continue; // phantom only
    const s = sMap.get(f.studentId);
    const perLesson = Math.round((f.group.course.price || 0) / (f.group.course.lessonPaymentCount || 12));
    rows.push({
      group: f.group.name,
      teacher: f.group.teachers.map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`).join('/') || '-',
      groupStart: f.group.startDate ? tk(f.group.startDate) : '-',
      sid: f.studentId,
      sname: s ? `${s.firstName} ${s.lastName}` : `#${f.studentId}`,
      balance: s?.balance ?? 0,
      date: tk(f.date),
      dow: DOW[f.date.getUTCDay()],
      status: f.status,
      enteredBy: uName.get(f.markedById!) ?? '-',
      enteredOn: tk(f.createdAt),
      perLesson,
      firstTeacher: ftd ? tk(ftd) : '-',
      beforeStart: f.group.startDate ? f.date.getTime() < f.group.startDate.getTime() : false,
    });
  }
  rows.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.sid - b.sid || (a.date < b.date ? -1 : 1)));

  // CSV
  const header = 'Guruh,Oqituvchi,Guruh_boshlanishi,Oquvchi_ID,Oquvchi,Balans,Dars_sanasi,Kun,Status,Kim_kiritgan,Qachon_kiritgan,Dars_narxi,Oqituvchi_1belgi,Guruhdan_oldinmi';
  const body = rows.map((r) =>
    [r.group, r.teacher, r.groupStart, r.sid, r.sname, r.balance, r.date, r.dow, r.status, r.enteredBy, r.enteredOn, r.perLesson, r.firstTeacher, r.beforeStart ? 'HA' : '']
      .map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','),
  );
  fs.writeFileSync(OUT, [header, ...body].join('\n'), 'utf8');

  // Console: per-group rollup
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Phantom dars qatorlari: ${rows.length} | o'quvchilar: ${new Set(rows.map((r) => r.sid)).size}\n`);

  const byGroup = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.group} (o'qit: ${r.teacher}, boshl: ${r.groupStart})`;
    (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(r);
  }
  console.log('=== GURUH BO\'YICHA (tasdiqlash uchun) ===');
  const groupSummary = [...byGroup.entries()].map(([k, rs]) => {
    const studs = new Set(rs.map((r) => r.sid)).size;
    const exposure = rs.reduce((s, r) => s + r.perLesson, 0);
    return { k, studs, lessons: rs.length, exposure, rs };
  }).sort((a, b) => b.exposure - a.exposure);

  for (const g of groupSummary) {
    console.log(`\n▸ ${g.k}`);
    console.log(`  ${g.studs} o'quvchi, ${g.lessons} phantom dars, ≈${g.exposure.toLocaleString()} so'm`);
    const perStud = new Map<number, Row[]>();
    for (const r of g.rs) (perStud.get(r.sid) ?? perStud.set(r.sid, []).get(r.sid)!).push(r);
    for (const [sid, rs] of perStud) {
      console.log(
        `    #${sid} ${rs[0].sname} (bal ${rs[0].balance.toLocaleString()}, teacher ${rs[0].firstTeacher}): ${rs.map((r) => `${r.date}/${r.status}${r.beforeStart ? '⛔' : ''}`).join(', ')} — kiritdi ${[...new Set(rs.map((r) => r.enteredBy))].join('/')}`,
      );
    }
  }

  const beforeStart = rows.filter((r) => r.beforeStart);
  console.log(`\n=== OBYEKTIV XATO (dars guruh boshlanishidan oldin ⛔): ${beforeStart.length} ta ===`);
  for (const r of beforeStart)
    console.log(`  #${r.sid} ${r.sname} | ${r.group} boshl ${r.groupStart} | dars ${r.date}`);

  const totalExposure = rows.reduce((s, r) => s + r.perLesson, 0);
  console.log(`\n=== JAMI ≈ ${totalExposure.toLocaleString()} so'm (per-dars narx asosida) ===`);
  console.log(`CSV saqlandi: ${OUT}`);
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
