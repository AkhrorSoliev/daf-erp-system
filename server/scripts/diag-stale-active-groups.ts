/**
 * READ-ONLY: ACTIVE groups that are not actually running.
 *
 * A group the system still believes is live keeps a schedule, so every month
 * the expectation projects lessons for it that will never be taught and never
 * be billed. Group #035 is the known case — 2 test students, last attendance
 * 7 May, still ACTIVE, ~870k of phantom expectation a month.
 *
 * Lists every ACTIVE group by how long it has been silent, with the monthly
 * value it is currently adding.
 *
 * Usage: railway run npx ts-node scripts/diag-stale-active-groups.ts [kun]
 *        (default: 21 kundan beri davomat yo'q)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { perLessonPrice } from '../src/common/finance/per-lesson-price';
import { tashkentDateStr } from '../src/attendance/shared/date-utils';

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('no company');
  const thresholdDays = Number(process.argv[2]) || 21;

  const groups = await prisma.group.findMany({
    where: { companyId: company.id, deletedAt: null, statusEnum: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      exactDays: true,
      createdAt: true,
      course: { select: { price: true, lessonPaymentCount: true } },
      contracts: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: { studentId: true, totalAmount: true },
      },
      enrollments: {
        where: { deletedAt: null, status: 'ACTIVE' },
        select: {
          studentId: true,
          student: {
            select: { firstName: true, lastName: true, discountPercent: true },
          },
        },
      },
      teachers: {
        select: { teacher: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows: {
    name: string;
    days: number | null;
    last: string;
    students: number;
    monthly: number;
    teacher: string;
    sample: string;
  }[] = [];

  const today = new Date();
  for (const g of groups) {
    const last = await prisma.attendance.findFirst({
      where: { groupId: g.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const lastStr = last ? tashkentDateStr(last.date) : null;
    const days = last
      ? Math.floor(
          (today.getTime() - new Date(lastStr + 'T00:00:00Z').getTime()) /
            86_400_000,
        )
      : null;

    if (days !== null && days < thresholdDays) continue;

    // Rough monthly phantom value: weekly lesson days x ~4.3 weeks x roster.
    const rosterValue = g.enrollments.reduce(
      (s, e) =>
        s +
        perLessonPrice({
          course: g.course,
          discountPercent: e.student?.discountPercent ?? 0,
          contractTotalAmount:
            g.contracts.find((c) => c.studentId === e.studentId)?.totalAmount ??
            null,
        }),
      0,
    );
    const monthly = Math.round(rosterValue * (g.exactDays?.length ?? 0) * 4.3);

    rows.push({
      name: g.name,
      days,
      last: lastStr ?? 'HECH QACHON',
      students: g.enrollments.length,
      monthly,
      teacher:
        g.teachers
          .map((t) =>
            `${t.teacher.lastName ?? ''} ${t.teacher.firstName ?? ''}`.trim(),
          )
          .join(', ') || '—',
      sample: g.enrollments
        .slice(0, 2)
        .map((e) =>
          `${e.student?.lastName ?? ''} ${e.student?.firstName ?? ''}`.trim(),
        )
        .join(', '),
    });
  }

  rows.sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));

  console.log(
    `\n${company.name} — ACTIVE guruhlar, ${thresholdDays}+ kundan beri davomat yo'q\n`,
  );
  if (rows.length === 0) {
    console.log('  Bunday guruh yo\'q — hammasi faol.\n');
  } else {
    console.log(
      "  Guruh   Oxirgi davomat  Kun   O'quv  Oyiga taxminan  Ustoz / o'quvchilar",
    );
    console.log(
      '  ──────  ──────────────  ────  ─────  ──────────────  ───────────────────',
    );
    for (const r of rows) {
      console.log(
        `  ${r.name.padEnd(6)}  ${r.last.padEnd(14)}  ${String(r.days ?? '—').padStart(4)}  ` +
          `${String(r.students).padStart(5)}  ${fmt(r.monthly).padStart(14)}  ${r.teacher}${r.sample ? ` · ${r.sample}` : ''}`,
      );
    }
    const total = rows.reduce((s, r) => s + r.monthly, 0);
    console.log(
      `\n  JAMI: ${rows.length} ta guruh · oyiga taxminan ${fmt(total)} so'm soxta kutilma\n`,
    );
  }
  console.log(`  Tekshirilgan aktiv guruhlar: ${groups.length} ta\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
