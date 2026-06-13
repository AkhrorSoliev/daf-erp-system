/**
 * check-employee — READ-ONLY diagnostic for one employee (User), incl. teachers.
 * Usage: npx ts-node scripts/check-employee.ts <employeeId> [--full]
 *        railway run npx ts-node scripts/check-employee.ts 10010          (prod)
 *
 * Sections: profil + rollar, o'qitadigan guruhlar (agar teacher), ish haqi
 * konfiguratsiyasi (versiyalar), joriy to'lanmagan accruallar, ish haqi tarixi.
 */
import { PrismaClient } from '@prisma/client';
import {
  TEACHER_ROLE_ID,
  som,
  day,
  dt,
  printHeader,
  section,
  printTable,
  run,
  parseArgs,
} from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const { positional, full } = parseArgs();
  const id = Number(positional[0]);
  if (!id) {
    console.error('Usage: npx ts-node scripts/check-employee.ts <employeeId> [--full]');
    process.exitCode = 1;
    return;
  }

  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      isActive: true,
      balance: true,
      mainBranch: true,
      companyId: true,
      createdAt: true,
      statusChangedAt: true,
      statusChangeReason: true,
      deletedAt: true,
      roles: { select: { role: { select: { id: true, name: true } } } },
      branches: { select: { branch: { select: { id: true, name: true } } } },
    },
  });
  if (!u) {
    console.log(`Employee #${id} NOT FOUND.`);
    return;
  }
  const isTeacher = u.roles.some((r) => r.role.id === TEACHER_ROLE_ID);

  printHeader(`XODIM #${u.id} — ${u.firstName} ${u.lastName}`);
  if (u.deletedAt) console.log(`  ⚠ ARXIVLANGAN (deletedAt=${day(u.deletedAt)})`);

  section('PROFIL');
  console.log(`  Rollar      : ${u.roles.map((r) => r.role.name).join(', ') || '—'}`);
  console.log(`  Status      : ${u.status}  (isActive=${u.isActive})`);
  console.log(`  Telefon     : ${u.phone ?? '—'}`);
  console.log(`  Balans      : ${som(u.balance)} so'm`);
  console.log(`  Filial(lar) : ${u.branches.map((b) => `${b.branch.name}#${b.branch.id}`).join(', ') || '—'}   asosiy: ${u.mainBranch ?? '—'}`);
  console.log(`  Yaratilgan  : ${day(u.createdAt)}   companyId=${u.companyId}`);
  if (u.statusChangedAt)
    console.log(`  Status o'zg.: ${day(u.statusChangedAt)}${u.statusChangeReason ? ` — ${u.statusChangeReason}` : ''}`);

  // ── groups taught (teacher) ───────────────────────────────────────────────
  if (isTeacher) {
    const gt = await prisma.groupTeacher.findMany({
      where: { teacherId: id, group: { deletedAt: null } },
      select: {
        group: { select: { id: true, name: true, groupNumber: true, statusEnum: true } },
      },
    });
    const withCounts = await Promise.all(
      gt.map(async (x) => ({
        g: x.group,
        active: await prisma.enrollment.count({
          where: { groupId: x.group.id, status: 'ACTIVE', deletedAt: null },
        }),
      })),
    );
    section(`O'QITADIGAN GURUHLAR (${withCounts.length})`);
    printTable(
      ['groupNumber', 'nom', 'status', 'aktiv o\'quvchi'],
      withCounts.map((w) => [w.g.groupNumber ?? '—', w.g.name, w.g.statusEnum, w.active]),
      ['r', 'l', 'l', 'r'],
    );
  }

  // ── salary config + versions ──────────────────────────────────────────────
  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { userId: id },
    select: {
      groupId: true,
      salaryType: true,
      value: true,
      isActive: true,
      group: { select: { name: true, groupNumber: true } },
      versions: {
        orderBy: { effectiveFrom: 'desc' },
        select: { salaryType: true, value: true, effectiveFrom: true, effectiveTo: true },
      },
    },
  });
  section(`ISH HAQI KONFIGURATSIYASI (${configs.length})`);
  printTable(
    ['qamrov', 'tur', 'qiymat', 'aktiv', 'joriy versiya (effectiveFrom)'],
    configs.map((c) => {
      const scope = c.groupId
        ? `guruh ${c.group?.groupNumber ? `#${c.group.groupNumber}` : c.group?.name}`
        : 'global';
      const v = c.versions[0];
      return [scope, c.salaryType, som(c.value), c.isActive ? '✓' : '✗', v ? day(v.effectiveFrom) : '—'];
    }),
    ['l', 'l', 'r', 'l', 'l'],
  );
  if (full) {
    for (const c of configs) {
      if (!c.versions.length) continue;
      const scope = c.groupId ? `guruh ${c.group?.groupNumber ?? c.group?.name}` : 'global';
      console.log(`\n  ${scope} versiya tarixi:`);
      printTable(
        ['tur', 'qiymat', 'effectiveFrom', 'effectiveTo'],
        c.versions.map((v) => [v.salaryType, som(v.value), day(v.effectiveFrom), day(v.effectiveTo)]),
        ['l', 'r', 'l', 'l'],
      );
    }
  }

  // ── unpaid accruals (current, not yet in a salary run) ────────────────────
  const accruals = await prisma.salaryAccrual.findMany({
    where: { userId: id, reversedAt: null, salaryPaymentId: null },
    select: {
      amount: true,
      lessonDate: true,
      groupId: true,
      creditPeriodDate: true,
      group: { select: { name: true, groupNumber: true } },
    },
  });
  const byGroup = new Map<string, { name: string; sum: number; count: number; carried: number }>();
  let total = 0;
  let carriedTotal = 0;
  for (const a of accruals) {
    const name = a.group?.groupNumber ? `#${a.group.groupNumber} ${a.group?.name}` : a.group?.name ?? a.groupId;
    const e = byGroup.get(a.groupId) ?? { name, sum: 0, count: 0, carried: 0 };
    e.sum += a.amount;
    e.count++;
    if (a.creditPeriodDate) {
      e.carried += a.amount;
      carriedTotal += a.amount;
    }
    byGroup.set(a.groupId, e);
    total += a.amount;
  }
  section(`JORIY TO'LANMAGAN ACCRUALLAR — jami ${som(total)} so'm (${accruals.length} dars)`);
  if (carriedTotal) console.log(`  shundan oldingi oydan (carry-over): ${som(carriedTotal)} so'm`);
  printTable(
    ['guruh', 'darslar', 'summa', 'oldingi oydan'],
    [...byGroup.values()].map((v) => [v.name, v.count, som(v.sum), v.carried ? som(v.carried) : '—']),
    ['l', 'r', 'r', 'r'],
  );

  // ── salary payment history ────────────────────────────────────────────────
  const payments = await prisma.salaryPayment.findMany({
    where: { userId: id },
    orderBy: { periodEnd: 'desc' },
    take: 12,
    select: { periodStart: true, periodEnd: true, amount: true, status: true, paidAt: true },
  });
  section(`ISH HAQI TARIXI (oxirgi ${payments.length})`);
  printTable(
    ['period', 'summa', 'status', 'to\'langan'],
    payments.map((p) => [`${day(p.periodStart)} → ${day(p.periodEnd)}`, som(p.amount), p.status, day(p.paidAt)]),
    ['l', 'r', 'l', 'l'],
  );

  // ── teacher transactions (--full) ─────────────────────────────────────────
  if (full) {
    const txns = await prisma.transaction.findMany({
      where: { teacherId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { createdAt: true, type: true, amount: true, reversedAt: true, description: true },
    });
    section(`TEACHER TRANZAKSIYALARI (oxirgi ${txns.length})`);
    printTable(
      ['sana', 'type', 'amount', 'belgi', 'izoh'],
      txns.map((t) => [dt(t.createdAt), t.type, som(t.amount), t.reversedAt ? 'REVERSED' : '', t.description ?? '']),
      ['l', 'l', 'r', 'l', 'l'],
    );
  }
}

run(main);
