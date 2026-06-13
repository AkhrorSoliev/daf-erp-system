/**
 * check-group — READ-ONLY diagnostic for one group.
 * Usage: npx ts-node scripts/check-group.ts <groupNumber | name> [--branch=<id>] [--full]
 *        railway run npx ts-node scripts/check-group.ts 45               (prod)
 *
 * Argument resolution is automatic: a numeric arg matches `groupNumber`,
 * otherwise it matches `name` (case-insensitive contains). If more than one
 * group matches it prints a disambiguation list (narrow with --branch=<id>).
 */
import { PrismaClient } from '@prisma/client';
import { som, day, printHeader, section, printTable, run, parseArgs } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const { positional, full, branch } = parseArgs();
  const arg = positional[0];
  if (!arg) {
    console.error(
      'Usage: npx ts-node scripts/check-group.ts <groupNumber | name> [--branch=<id>] [--full]',
    );
    process.exitCode = 1;
    return;
  }

  const isNum = /^\d+$/.test(arg);
  const where: Record<string, unknown> = { deletedAt: null };
  if (branch) where.branchId = branch;
  if (isNum) where.groupNumber = Number(arg);
  else where.name = { contains: arg, mode: 'insensitive' };

  const matches = await prisma.group.findMany({
    where,
    orderBy: [{ branchId: 'asc' }, { groupNumber: 'asc' }],
    select: {
      id: true,
      name: true,
      groupNumber: true,
      statusEnum: true,
      branch: { select: { id: true, name: true } },
    },
  });

  if (matches.length === 0) {
    console.log(
      `Guruh topilmadi: "${arg}"${branch ? ` (filial #${branch})` : ''}.` +
        (isNum ? " Nom bo'yicha qidirish uchun raqamsiz yozing." : ''),
    );
    return;
  }
  if (matches.length > 1) {
    console.log(`"${arg}" bo'yicha ${matches.length} ta guruh topildi — --branch=<id> bilan aniqlashtiring:`);
    printTable(
      ['groupNumber', 'nom', 'filial', 'status'],
      matches.map((m) => [m.groupNumber ?? '—', m.name, `${m.branch.name}#${m.branch.id}`, m.statusEnum]),
    );
    return;
  }

  const g = await prisma.group.findUnique({
    where: { id: matches[0].id },
    select: {
      id: true,
      name: true,
      groupNumber: true,
      level: true,
      statusEnum: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
      lessonMinutes: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      branch: { select: { id: true, name: true } },
      room: { select: { name: true } },
      course: { select: { name: true, price: true, lessonPaymentCount: true } },
      teachers: {
        select: { teacher: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      },
    },
  });
  if (!g) {
    console.log('Guruh yuklab bo\'lmadi.');
    return;
  }

  const perLesson = Math.round((g.course?.price ?? 0) / (g.course?.lessonPaymentCount || 1));

  printHeader(`GURUH ${g.groupNumber ? `#${g.groupNumber} ` : ''}${g.name}`);

  section('GURUH MA\'LUMOTI');
  console.log(`  Kurs        : ${g.course?.name ?? '—'}  (${som(g.course?.price)} so'm / ${g.course?.lessonPaymentCount} dars = ${som(perLesson)}/dars)`);
  console.log(`  Filial      : ${g.branch.name}#${g.branch.id}    Xona: ${g.room?.name ?? '—'}`);
  console.log(`  Daraja      : ${g.level ?? '—'}    Status: ${g.statusEnum}`);
  console.log(`  Jadval      : ${(g.exactDays ?? []).join(', ') || '—'}  ${g.lessonStartTime ?? '—'}–${g.lessonEndTime ?? '—'} (${g.lessonMinutes ?? '—'} daq)`);
  console.log(`  Davr        : ${day(g.startDate)} → ${day(g.endDate)}    yaratilgan: ${day(g.createdAt)}`);

  // ── teachers + salary config ──────────────────────────────────────────────
  const salaryConfigs = await prisma.employeeSalaryConfig.findMany({
    where: { groupId: g.id, isActive: true },
    select: { userId: true, salaryType: true, value: true },
  });
  const cfgByUser = new Map(salaryConfigs.map((c) => [c.userId, c]));
  section(`O'QITUVCHI(LAR) (${g.teachers.length})`);
  printTable(
    ['id', 'F.I.Sh', 'telefon', 'ish haqi (guruh)'],
    g.teachers.map((t) => {
      const c = cfgByUser.get(t.teacher.id);
      return [
        t.teacher.id,
        `${t.teacher.firstName} ${t.teacher.lastName}`,
        t.teacher.phone ?? '—',
        c ? `${c.salaryType} ${som(c.value)}` : '— (global)',
      ];
    }),
  );

  // ── students (enrollments) ────────────────────────────────────────────────
  const enrollments = await prisma.enrollment.findMany({
    where: { groupId: g.id, deletedAt: null },
    orderBy: { status: 'asc' },
    select: {
      status: true,
      startDate: true,
      prepaidLessonsRemaining: true,
      student: { select: { id: true, firstName: true, lastName: true, phone: true, balance: true } },
    },
  });
  const statusCount: Record<string, number> = {};
  for (const e of enrollments) statusCount[e.status] = (statusCount[e.status] ?? 0) + 1;
  const active = enrollments.filter((e) => e.status === 'ACTIVE');

  section(`O'QUVCHILAR — aktiv ${active.length} ta (jami non-deleted ${enrollments.length})`);
  console.log(`  ${Object.entries(statusCount).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}\n`);
  printTable(
    ['id', 'F.I.Sh', 'telefon', 'balans', 'prepaid', 'start'],
    active.map((e) => [
      e.student.id,
      `${e.student.firstName} ${e.student.lastName}`,
      e.student.phone ?? '—',
      som(e.student.balance),
      e.prepaidLessonsRemaining,
      day(e.startDate),
    ]),
    ['l', 'l', 'l', 'r', 'r', 'l'],
  );

  // ── financial summary ─────────────────────────────────────────────────────
  const balances = active.map((e) => e.student.balance);
  const debt = balances.filter((b) => b < 0).reduce((a, b) => a + b, 0);
  const debtors = balances.filter((b) => b < 0).length;
  const credit = balances.filter((b) => b > 0).reduce((a, b) => a + b, 0);
  const prepaidLessons = active.reduce((a, e) => a + e.prepaidLessonsRemaining, 0);
  section('MOLIYAVIY XULOSA (aktiv o\'quvchilar)');
  console.log(`  Qarzdorlar     : ${debtors} ta    jami qarz: ${som(debt)} so'm`);
  console.log(`  Ijobiy balans  : ${som(credit)} so'm`);
  console.log(`  Prepaid darslar: ${prepaidLessons} ta ≈ ${som(prepaidLessons * perLesson)} so'm`);

  // ── recent attendance (--full) ────────────────────────────────────────────
  if (full) {
    const lastAtt = await prisma.attendance.findFirst({
      where: { groupId: g.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (lastAtt) {
      const rows = await prisma.attendance.findMany({
        where: { groupId: g.id, date: lastAtt.date },
        select: { status: true, student: { select: { firstName: true, lastName: true } } },
      });
      const c: Record<string, number> = {};
      for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
      section(`OXIRGI DARS DAVOMATI — ${day(lastAtt.date)} (${rows.length} ta)`);
      console.log(`  ${Object.entries(c).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`);
      printTable(
        ['F.I.Sh', 'status'],
        rows.map((r) => [`${r.student.firstName} ${r.student.lastName}`, r.status]),
      );
    }
  }
}

run(main);
