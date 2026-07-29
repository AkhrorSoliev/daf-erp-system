/**
 * verify-per-user-salary-parity — READ-ONLY.
 *
 * Proves the change: `getMonthlyForUser(id)` (profile tab, profile card,
 * lehrer portal) must return EXACTLY the row `getMonthly()` puts in the
 * `/payments/salary` table for that teacher.
 *
 * The risk this guards against is that narrowing the roster to one user also
 * narrows an input to the gap sweep and quietly changes the money. Every
 * teacher in the company is compared field by field.
 *
 * Usage:
 *   cd server && railway run npx ts-node --transpile-only \
 *     scripts/verify-per-user-salary-parity.ts [2026-07]
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { som, dbEnvLabel, dbHost, printTable, section } from './lib/check-cli';

@Module({
  imports: [PrismaModule],
  providers: [SalaryMonthlyService, SalaryStaffMonthlyService],
})
class VerifyModule {}

const FIELDS = [
  'fullDeserved',
  'covered',
  'gap',
  'advances',
  'netToPay',
] as const;

async function main() {
  const month = process.argv[2] ?? '2026-07';
  const app = await NestFactory.createApplicationContext(VerifyModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const monthly = app.get(SalaryMonthlyService);

  console.log(`\nDB: ${dbEnvLabel()} (${dbHost()})   Oy: ${month}\n`);

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error('No company');
  const companyId = company.id;
  const ceo = await prisma.user.findFirst({
    where: { companyId, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true },
  });
  if (!ceo) throw new Error('No CEO');

  // The table exactly as /payments/salary renders it.
  const table = await monthly.getMonthly({ month }, companyId, ceo.id);

  section(`Ustozlar: ${table.data.length} ta`);
  const rows: (string | number)[][] = [];
  const mismatches: string[] = [];

  for (const tableRow of table.data) {
    const single = await monthly.getMonthlyForUser(
      tableRow.user.id,
      { month },
      companyId,
      ceo.id,
    );
    const one = single.row as Record<string, unknown> | null;

    const bad: string[] = [];
    if (!one) {
      bad.push('qator topilmadi');
    } else {
      for (const f of FIELDS) {
        const a = (tableRow as Record<string, unknown>)[f] ?? null;
        const b = one[f] ?? null;
        if (a !== b) bad.push(`${f}: jadval ${String(a)} ≠ profil ${String(b)}`);
      }
      if (single.month !== table.month) bad.push('oy farq qiladi');
    }

    rows.push([
      tableRow.user.id,
      `${tableRow.user.firstName} ${tableRow.user.lastName}`.slice(0, 22),
      tableRow.fullDeserved == null ? '—' : som(tableRow.fullDeserved),
      one && one.netToPay != null ? som(one.netToPay as number) : '—',
      bad.length ? 'FARQ' : 'OK',
    ]);
    if (bad.length) {
      mismatches.push(`#${tableRow.user.id}: ${bad.join('; ')}`);
    }
  }

  printTable(
    ['ID', 'Ustoz', "Jadval: to'liq ishlangan", "Profil: to'lanishi kerak", 'Holat'],
    rows,
    ['r', 'l', 'r', 'r', 'l'],
  );

  // Non-teaching fixed-salary staff go through the same single-row path.
  section(`Xodimlar (FIXED_MONTHLY): ${table.staff.length} ta`);
  for (const s of table.staff) {
    const single = await monthly.getMonthlyForUser(
      s.user.id,
      { month },
      companyId,
      ceo.id,
    );
    const one = single.row as { netToPay?: number } | null;
    const ok = one?.netToPay === s.netToPay;
    console.log(
      `  #${s.user.id} ${s.user.firstName} ${s.user.lastName}: ` +
        `jadval ${som(s.netToPay)} / profil ${one?.netToPay != null ? som(one.netToPay) : '—'} → ${ok ? 'OK' : 'FARQ'}`,
    );
    if (!ok) mismatches.push(`#${s.user.id} (xodim): netToPay farq qiladi`);
  }

  section('Natija');
  if (mismatches.length === 0) {
    console.log(
      `  ✅ Barcha ${table.data.length + table.staff.length} ta yozuv bo'yicha ` +
        `profil raqami /payments/salary bilan AYNAN bir xil.\n`,
    );
  } else {
    console.log(`  ❌ ${mismatches.length} ta farq:`);
    for (const m of mismatches) console.log(`     ${m}`);
    console.log();
    process.exitCode = 1;
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
