/**
 * Production'dagi INITIAL_BALANCE yozuvlarini tekshirish (read-only).
 *
 * Maqsad: 90 ta INITIAL_BALANCE qator qaerdan kelganini aniqlash —
 *   - Kim yozdi (performedById)
 *   - Qachon yozildi
 *   - Qaysi talabalarga
 *   - Reversed bormi
 *   - Notes/description nima
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}\n`);

  // 1) Kim yozdi va qachon
  const byUser = await prisma.$queryRaw<
    Array<{
      performed_by: number | null;
      performer_name: string | null;
      performer_role: string | null;
      cnt: bigint;
      total: bigint | null;
      first_at: Date | null;
      last_at: Date | null;
      reversed_count: bigint;
    }>
  >`
    SELECT t."performedById" AS performed_by,
           CASE WHEN u.id IS NULL THEN '(noma''lum)'
                ELSE u."firstName" || ' ' || u."lastName" END AS performer_name,
           STRING_AGG(DISTINCT r.name, ',') AS performer_role,
           COUNT(*) AS cnt,
           SUM(t.amount) AS total,
           MIN(t."createdAt") AS first_at,
           MAX(t."createdAt") AS last_at,
           COUNT(*) FILTER (WHERE t."reversedAt" IS NOT NULL) AS reversed_count
      FROM "Transaction" t
      LEFT JOIN "User" u ON u.id = t."performedById"
      LEFT JOIN "UserRole" ur ON ur."userId" = u.id
      LEFT JOIN "Role" r ON r.id = ur."roleId"
     WHERE t.type::text = 'INITIAL_BALANCE'
     GROUP BY t."performedById", u.id, u."firstName", u."lastName"
     ORDER BY cnt DESC
  `;
  console.log('▶ INITIAL_BALANCE — kim yozdi:');
  byUser.forEach((u) => {
    console.log(`  Kim:        ${u.performer_name} (id=${u.performed_by ?? 'NULL'}, role=${u.performer_role ?? '-'})`);
    console.log(`  Yozuvlar:   ${Number(u.cnt)} ta`);
    console.log(`  Jami summa: ${Number(u.total ?? 0).toLocaleString('uz-UZ')} so'm`);
    console.log(`  Reversed:   ${Number(u.reversed_count)} ta`);
    console.log(`  Birinchi:   ${u.first_at?.toISOString()}`);
    console.log(`  Oxirgisi:   ${u.last_at?.toISOString()}`);
    console.log('');
  });

  // 2) Sana bo'yicha taqsimlanishi
  const byDate = await prisma.$queryRaw<Array<{ date: string; cnt: bigint; total: bigint | null }>>`
    SELECT TO_CHAR("createdAt", 'YYYY-MM-DD HH24:00') AS date,
           COUNT(*) AS cnt,
           SUM(amount) AS total
      FROM "Transaction"
     WHERE type::text = 'INITIAL_BALANCE'
     GROUP BY 1
     ORDER BY 1
  `;
  console.log('▶ Sana bo\'yicha taqsimlanishi:');
  byDate.forEach((d) => {
    console.log(`  ${d.date}   ${String(Number(d.cnt)).padStart(4)} ta   ${Number(d.total ?? 0).toLocaleString('uz-UZ').padStart(12)} so'm`);
  });

  // 3) Birinchi 10 tasi (description bilan)
  const samples = await prisma.$queryRaw<
    Array<{
      id: string;
      student_id: number;
      first_name: string;
      last_name: string;
      amount: number;
      description: string | null;
      created_at: Date;
      performed_by: number | null;
    }>
  >`
    SELECT t.id,
           t."studentId" AS student_id,
           s."firstName" AS first_name,
           s."lastName" AS last_name,
           t.amount,
           t.description,
           t."createdAt" AS created_at,
           t."performedById" AS performed_by
      FROM "Transaction" t
      JOIN "Student" s ON s.id = t."studentId"
     WHERE t.type::text = 'INITIAL_BALANCE'
     ORDER BY t."createdAt" DESC
     LIMIT 10
  `;
  console.log('\n▶ Eng oxirgi 10 ta yozuv (sample):');
  samples.forEach((s) => {
    console.log(`  ${s.created_at.toISOString().substring(0, 16)}  Talaba #${s.student_id} (${s.first_name} ${s.last_name})`);
    console.log(`    Summa: ${s.amount.toLocaleString('uz-UZ')} so'm   Description: "${s.description ?? '-'}"`);
  });

  // 4) Bu talabalar — ularning hozirgi balansi qancha?
  const balanceCheck = await prisma.$queryRaw<
    Array<{
      student_id: number;
      first_name: string;
      last_name: string;
      current_balance: number;
      ib_amount: number;
      payment_count: bigint;
      total_paid: bigint | null;
    }>
  >`
    SELECT s.id AS student_id,
           s."firstName" AS first_name,
           s."lastName" AS last_name,
           s.balance AS current_balance,
           t.amount AS ib_amount,
           COUNT(p.id) AS payment_count,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status::text = 'COMPLETED'), 0) AS total_paid
      FROM "Transaction" t
      JOIN "Student" s ON s.id = t."studentId"
      LEFT JOIN "Payment" p ON p."studentId" = s.id
     WHERE t.type::text = 'INITIAL_BALANCE'
     GROUP BY s.id, s."firstName", s."lastName", s.balance, t.amount
     ORDER BY t.amount DESC
     LIMIT 10
  `;
  console.log('\n▶ Eng katta INITIAL_BALANCE bor talabalar (top 10):');
  balanceCheck.forEach((b) => {
    console.log(`  Talaba #${b.student_id} (${b.first_name} ${b.last_name})`);
    console.log(`    INITIAL_BALANCE: ${b.ib_amount.toLocaleString('uz-UZ')}   Hozirgi balans: ${b.current_balance.toLocaleString('uz-UZ')}   Payment'lar: ${Number(b.payment_count)} (jami ${Number(b.total_paid ?? 0).toLocaleString('uz-UZ')})`);
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('XATO:', e);
  await prisma.$disconnect();
  process.exit(1);
});
