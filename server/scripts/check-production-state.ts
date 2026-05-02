/**
 * Production schema state diagnostic (read-only).
 *
 * Maqsad: aniq aytib berish — production DB'da qaysi migratsiyalar applied,
 * qaysi pending, va asosiy moliya jadvallari (Payment, Student.balance,
 * Transaction) hozirgi holatda nima ishlatadi.
 *
 * Bu skript hech narsani o'zgartirmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? '').host;
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PRODUCTION SCHEMA STATE');
  console.log(`  DB host: ${dbHost}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1) Applied migrations (Prisma's internal table)
  const applied = await prisma.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
  >`
    SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
     ORDER BY started_at DESC
     LIMIT 30
  `;
  console.log('▶ Applied migrations (last 30):');
  applied.forEach((m) => {
    const status = m.rolled_back_at
      ? '❌ ROLLED BACK'
      : m.finished_at
        ? '✓'
        : '⏳ PENDING';
    console.log(`  ${status}  ${m.migration_name}`);
  });
  console.log('');

  // 2) Local pending migrations (folder vs DB)
  const localMigrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
  const localMigrations = fs
    .readdirSync(localMigrationsDir)
    .filter((d) => fs.statSync(path.join(localMigrationsDir, d)).isDirectory())
    .sort();
  const appliedNames = new Set(applied.filter((m) => m.finished_at).map((m) => m.migration_name));
  const pending = localMigrations.filter((name) => !appliedNames.has(name));
  console.log('▶ Local migrations pending in production:');
  if (pending.length === 0) {
    console.log('  (none) — production schema is up-to-date with local files');
  } else {
    pending.forEach((p) => console.log(`  • ${p}`));
  }
  console.log('');

  // 3) Critical financial table state (read-only)
  console.log('▶ Asosiy moliya jadvallarining hozirgi holati:');

  const studentStats = await prisma.$queryRaw<Array<{ total: bigint; with_balance: bigint; sum_balance: bigint | null }>>`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE balance > 0) AS with_balance,
           SUM(balance) FILTER (WHERE balance > 0) AS sum_balance
      FROM "Student"
     WHERE "deletedAt" IS NULL
  `;
  const s = studentStats[0];
  console.log(`  Student:  ${Number(s.total)} jami, ${Number(s.with_balance)} balansda pul borlar, jami balans ${Number(s.sum_balance ?? 0).toLocaleString('uz-UZ')} so'm`);

  const paymentStats = await prisma.$queryRaw<Array<{ total: bigint; completed: bigint; reversed: bigint; sum_completed: bigint | null }>>`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status::text = 'COMPLETED') AS completed,
           COUNT(*) FILTER (WHERE status::text = 'REVERSED') AS reversed,
           SUM(amount) FILTER (WHERE status::text = 'COMPLETED') AS sum_completed
      FROM "Payment"
  `;
  const p = paymentStats[0];
  console.log(`  Payment:  ${Number(p.total)} jami, ${Number(p.completed)} COMPLETED (${Number(p.sum_completed ?? 0).toLocaleString('uz-UZ')} so'm), ${Number(p.reversed)} REVERSED`);

  const txStats = await prisma.$queryRaw<Array<{ type: string; cnt: bigint; sum_amount: bigint | null }>>`
    SELECT type::text AS type, COUNT(*) AS cnt, SUM(amount) AS sum_amount
      FROM "Transaction"
     GROUP BY type
     ORDER BY cnt DESC
  `;
  console.log('  Transaction (per type):');
  txStats.forEach((t) => {
    console.log(`    ${t.type.padEnd(22)} ${String(Number(t.cnt)).padStart(6)} qator   ${Number(t.sum_amount ?? 0).toLocaleString('uz-UZ').padStart(15)} so'm`);
  });

  const attStats = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
    SELECT status::text AS status, COUNT(*) AS cnt
      FROM "Attendance"
     GROUP BY status
     ORDER BY cnt DESC
  `;
  console.log('  Attendance (per status):');
  attStats.forEach((a) => {
    console.log(`    ${a.status.padEnd(10)} ${String(Number(a.cnt)).padStart(6)} qator`);
  });

  // 4) Schema "yangi" maydonlar — production'da bormi?
  console.log('\n▶ Yangi (v3.0) schema maydonlari production\'da:');
  const newColumns = await prisma.$queryRaw<Array<{ table: string; column: string; exists: boolean }>>`
    SELECT 'Enrollment' AS "table", 'prepaidLessonsRemaining' AS "column",
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='Enrollment' AND column_name='prepaidLessonsRemaining') AS exists
    UNION ALL
    SELECT 'Enrollment', 'startDate',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='Enrollment' AND column_name='startDate')
    UNION ALL
    SELECT 'Transaction', 'metadata',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='Transaction' AND column_name='metadata')
    UNION ALL
    SELECT 'Transaction', 'reversedAt',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='Transaction' AND column_name='reversedAt')
    UNION ALL
    SELECT 'Attendance', 'cancellationId',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='Attendance' AND column_name='cancellationId')
  `;
  newColumns.forEach((c) => {
    console.log(`  ${c.exists ? '✓' : '❌'}  ${c.table}.${c.column}`);
  });

  // 5) New tables
  const newTables = await prisma.$queryRaw<Array<{ name: string; exists: boolean }>>`
    SELECT 'EmployeeSalaryConfigVersion' AS name,
           EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='EmployeeSalaryConfigVersion') AS exists
    UNION ALL
    SELECT 'SalaryPeriodSetting',
           EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='SalaryPeriodSetting')
    UNION ALL
    SELECT 'LessonCancellation',
           EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='LessonCancellation')
    UNION ALL
    SELECT 'CompanyTaxConfig',
           EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='CompanyTaxConfig')
  `;
  console.log('\n▶ Yangi (v3.0) jadvallar production\'da:');
  newTables.forEach((t) => {
    console.log(`  ${t.exists ? '✓' : '❌'}  ${t.name}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('XATO:', e);
  await prisma.$disconnect();
  process.exit(1);
});
