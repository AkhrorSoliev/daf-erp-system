/**
 * check-salary-payments — READ-ONLY diagnostic for the "Xodimlar ish haqini
 * boshqarish" table (SalaryPayment rows). Explains, per row, WHO got a salary
 * calculated, for which period, how much, and WHY (accrual-based vs
 * fixed-monthly), including the underlying SalaryConfig + accrual coverage.
 *
 * Usage:
 *   railway run npx ts-node scripts/check-salary-payments.ts          (prod)
 *   npx ts-node scripts/check-salary-payments.ts                      (dev)
 */
import { PrismaClient } from '@prisma/client';
import { som, day, dt, printHeader, section, printTable, run } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  printHeader('SalaryPayment — Xodim oyliklari diagnostikasi');

  const payments = await prisma.salaryPayment.findMany({
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      userId: true,
      periodStart: true,
      periodEnd: true,
      amount: true,
      status: true,
      paidAt: true,
      createdAt: true,
      companyId: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      },
      accruals: {
        select: {
          id: true,
          amount: true,
          lessonDate: true,
          creditPeriodDate: true,
          groupId: true,
          studentId: true,
          attendanceId: true,
        },
      },
      settledExpenses: { select: { id: true, amount: true } },
    },
  });

  section(`Jami SalaryPayment yozuvlari: ${payments.length}`);
  printTable(
    ['#', 'xodim', 'roli', 'davr', 'summa', 'status', 'accrual', 'tur', 'yaratilgan'],
    payments.map((p, i) => {
      const roles = p.user.roles.map((r) => r.role.name).join(',') || '—';
      const kind = p.accruals.length > 0 ? 'ACCRUAL' : 'FIXED?';
      return [
        i + 1,
        `${p.user.firstName} ${p.user.lastName} #${p.userId}`,
        roles,
        `${day(p.periodStart)} → ${day(p.periodEnd)}`,
        som(p.amount),
        p.status,
        p.accruals.length,
        kind,
        dt(p.createdAt),
      ];
    }),
    ['l', 'l', 'l', 'l', 'r', 'l', 'r', 'l', 'l'],
  );

  // Per-payment deep dive
  for (const p of payments) {
    const name = `${p.user.firstName} ${p.user.lastName} #${p.userId}`;
    const roles = p.user.roles.map((r) => r.role.name).join(', ') || '—';
    section(`${name} (${roles}) — ${p.status}`);
    console.log(`  Davr:       ${day(p.periodStart)} → ${day(p.periodEnd)}`);
    console.log(`  Summa:      ${som(p.amount)} so'm (advans yechilgandan keyin net)`);
    console.log(`  Yaratilgan: ${dt(p.createdAt)}   To'langan: ${p.paidAt ? dt(p.paidAt) : '—'}`);

    if (p.accruals.length > 0) {
      const gross = p.accruals.reduce((s, a) => s + a.amount, 0);
      const carried = p.accruals.filter((a) => a.creditPeriodDate != null);
      const withdrawal = p.accruals.filter((a) => a.attendanceId == null);
      console.log(`  TUR:        ACCRUAL-BASED (ustoz) — ${p.accruals.length} ta accrual, jami ${som(gross)} so'm`);
      if (carried.length) console.log(`              shundan ${carried.length} ta "oldingi oydan" (creditPeriodDate)`);
      if (withdrawal.length) console.log(`              shundan ${withdrawal.length} ta balance-withdrawal accrual (attendanceId yo'q)`);
    } else {
      // No linked accruals → must be a FIXED_MONTHLY config payment.
      const config = await prisma.employeeSalaryConfig.findFirst({
        where: { userId: p.userId, companyId: p.companyId, groupId: null },
        select: { id: true, salaryType: true, value: true, isActive: true },
      });
      const activeVersion = config
        ? await prisma.employeeSalaryConfigVersion.findFirst({
            where: {
              configId: config.id,
              effectiveFrom: { lte: p.periodEnd },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: p.periodEnd } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            select: { salaryType: true, value: true, effectiveFrom: true, effectiveTo: true },
          })
        : null;
      console.log(`  TUR:        FIXED_MONTHLY (belgilangan oylik) — accrual yo'q`);
      if (config) {
        console.log(`              Config: ${config.salaryType} qiymat=${som(config.value)} isActive=${config.isActive}`);
      } else {
        console.log(`              ⚠ EmployeeSalaryConfig topilmadi (groupId:null) — qo'lda yaratilgan bo'lishi mumkin`);
      }
      if (activeVersion) {
        console.log(
          `              periodEnd da amal qilgan versiya: ${activeVersion.salaryType} ${som(activeVersion.value)} ` +
            `(${day(activeVersion.effectiveFrom)} → ${activeVersion.effectiveTo ? day(activeVersion.effectiveTo) : 'ochiq'})`,
        );
      }
    }

    if (p.settledExpenses.length > 0) {
      const adv = p.settledExpenses.reduce((s, e) => s + e.amount, 0);
      console.log(`  Advans:     ${p.settledExpenses.length} ta TEACHER_ADVANCE yechildi, jami ${som(adv)} so'm`);
    }
  }

  // Context: who has a salary config at all, and who got skipped
  section('Kontekst — barcha aktiv EmployeeSalaryConfig lar');
  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { isActive: true },
    select: {
      userId: true,
      groupId: true,
      salaryType: true,
      value: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ salaryType: 'asc' }, { userId: 'asc' }],
  });
  printTable(
    ['xodim', 'tur', 'qiymat', 'guruhga bog.'],
    configs.map((c) => [
      `${c.user.firstName} ${c.user.lastName} #${c.userId}`,
      c.salaryType,
      som(c.value),
      c.groupId ? 'ha' : "yo'q (global)",
    ]),
    ['l', 'l', 'r', 'l'],
  );
}

run(main);
