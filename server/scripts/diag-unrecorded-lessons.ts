/**
 * READ-ONLY: scheduled lessons with NO attendance and NO cancellation.
 *
 * These are the lessons nobody recorded. If they happened, the student was
 * never billed and the teacher earned nothing for them — no attendance row
 * means no LESSON_CONSUMPTION and no SalaryAccrual. If they did not happen,
 * a LessonCancellation should have been written. Either way somebody has to
 * look at them, and today nothing surfaces them after the lesson day passes.
 *
 * Usage: railway run npx ts-node scripts/diag-unrecorded-lessons.ts 2026-07
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { buildScheduleDayResolver } from '../src/attendance/shared/schedule-resolver';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
} from '../src/attendance/shared/date-utils';
import { perLessonPrice } from '../src/common/finance/per-lesson-price';

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('no company');
  const month =
    process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? '2026-07';
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const endExcl = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStartStr = `${month}-01`;
  const monthEndStr = `${month}-${String(lastDay).padStart(2, '0')}`;

  const groups = await prisma.group.findMany({
    where: { companyId: company.id, deletedAt: null, statusEnum: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      exactDays: true,
      startDate: true,
      endDate: true,
      scheduleSnapshots: { select: { exactDays: true, validFrom: true, validTo: true } },
      course: { select: { price: true, lessonPaymentCount: true } },
      contracts: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: { studentId: true, totalAmount: true },
      },
      enrollments: {
        where: { deletedAt: null, status: 'ACTIVE' },
        select: { studentId: true, student: { select: { discountPercent: true } } },
      },
      teachers: {
        select: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const holidays = await prisma.holiday.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { date: true, endDate: true },
  });
  const holidaySet = new Set<string>();
  for (const h of holidays) {
    const s = new Date(h.date);
    const e = new Date(h.endDate ?? h.date);
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      holidaySet.add(d.toISOString().slice(0, 10));
    }
  }

  const atts = await prisma.attendance.findMany({
    where: { companyId: company.id, date: { gte: start, lt: endExcl } },
    select: { groupId: true, date: true },
  });
  const attKey = new Set(atts.map((a) => `${a.groupId}|${tashkentDateStr(a.date)}`));

  const cancels = await prisma.lessonCancellation.findMany({
    where: { deletedAt: null, date: { gte: start, lt: endExcl } },
    select: { groupId: true, date: true },
  });
  const cancelKey = new Set(
    cancels.map((c) => `${c.groupId}|${tashkentDateStr(c.date)}`),
  );

  console.log(`\n${company.name} — ${month}`);
  console.log('Jadvalda bor, lekin davomat ham, bekor qilish ham yozilmagan darslar:\n');

  let totalStudentLessons = 0;
  let totalValue = 0;
  const rows: string[] = [];

  for (const g of groups) {
    if (g.enrollments.length === 0) continue;
    const resolve = buildScheduleDayResolver(g.scheduleSnapshots, g.exactDays);
    const rosterValue = g.enrollments.reduce(
      (s, e) =>
        s +
        perLessonPrice({
          course: g.course,
          discountPercent: e.student?.discountPercent ?? 0,
          contractTotalAmount:
            g.contracts.find((c) => c.studentId === e.studentId)?.totalAmount ?? null,
        }),
      0,
    );
    const from =
      g.startDate && tashkentDateStr(g.startDate) > monthStartStr
        ? tashkentDateStr(g.startDate)
        : monthStartStr;
    const to =
      g.endDate && tashkentDateStr(g.endDate) < monthEndStr
        ? tashkentDateStr(g.endDate)
        : monthEndStr;

    for (let d = from; d <= to; d = addDaysToDateStr(d, 1)) {
      if (holidaySet.has(d)) continue;
      if (attKey.has(`${g.id}|${d}`)) continue;
      if (cancelKey.has(`${g.id}|${d}`)) continue;
      const days = resolve(d);
      if (!days || !days.includes(dayOfWeekForDateStr(d))) continue;

      const teacher = g.teachers[0]?.teacher;
      const teacherName = teacher
        ? `${teacher.lastName ?? ''} ${teacher.firstName ?? ''}`.trim()
        : '—';
      rows.push(
        `  ${d}  ${g.name.padEnd(22)}  ${String(g.enrollments.length).padStart(3)} o'quvchi  ` +
          `${fmt(rosterValue).padStart(12)} so'm   ${teacherName}`,
      );
      totalStudentLessons += g.enrollments.length;
      totalValue += rosterValue;
    }
  }

  rows.sort();
  rows.forEach((r) => console.log(r));
  console.log(
    `\n  JAMI: ${rows.length} ta guruh darsi · ${totalStudentLessons} ta o'quvchi-dars · ${fmt(totalValue)} so'm\n`,
  );
  console.log(
    "  Eslatma: bu darslar uchun o'quvchidan pul yechilmagan VA ustozga oylik hisoblanmagan.\n" +
      '  Davomat kiritilsa, tizim ikkalasini ham avtomatik bajaradi.\n',
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
