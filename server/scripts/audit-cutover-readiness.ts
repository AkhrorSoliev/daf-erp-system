/**
 * Cutover Readiness Audit (read-only)
 *
 * Production-da yangi prepaid billing modeliga o'tishdan oldin
 * kerakli ma'lumotlarni yig'adi:
 *   A) Aktiv talabalar — balansi pul borlar (Payme/Click test to'lovlari)
 *   B) Test davomatlar — un-billed PRESENT/LATE (deploy keyin retroaktiv hisoblanmaydi)
 *   C) Aktiv guruhlar va kurs narxlari (lessonPaymentCount, perLessonCost)
 *   D) Ustozlar va salary config holati (kimda yo'q?)
 *   E) Aktiv enrollmentlar (har talaba qaysi guruhda)
 *
 * Output:
 *   - Console summary
 *   - audit-output/students-with-balance.csv
 *   - audit-output/active-groups.csv
 *   - audit-output/teachers-config-status.csv
 *   - audit-output/active-enrollments.csv
 *
 * Buxgalter shu CSV'larni Excel'da ochib, har talabaning eski tizimdagi
 * qoldig'ini hisoblaydi (qolgan dars × perLessonCost = INITIAL_BALANCE).
 *
 * MUHIM: bu skript faqat SELECT bajaradi, hech narsani o'zgartirmaydi.
 * Lekin production DB ga ulanish uchun DATABASE_URL'ni production'ga
 * yo'naltirish kerak. Eng xavfsiz yo'l — alohida shellda:
 *
 *   export DATABASE_URL="<prod-connection-string>"
 *   npx ts-node scripts/audit-cutover-readiness.ts
 *
 * Yoki Railway CLI bilan:
 *   railway run --service api npx ts-node scripts/audit-cutover-readiness.ts
 *
 * Ishga tushirilgandan keyin DATABASE_URL'ni qayta lokal'ga qaytaring.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const OUTPUT_DIR = path.join(__dirname, '..', 'audit-output');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), '(no rows)\n');
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), lines.join('\n') + '\n');
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? '').host;
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CUTOVER READINESS AUDIT (read-only)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  DB host: ${dbHost}`);
  console.log(`  Time:    ${new Date().toISOString()}`);
  console.log(`  Output:  ${OUTPUT_DIR}/`);
  console.log('═══════════════════════════════════════════════════════════\n');

  ensureOutputDir();

  // ──────────────────────────────────────────────────────────────────
  // A) Talabalar — balansi pul bor (Payme/Click test to'lovlari)
  // ──────────────────────────────────────────────────────────────────
  console.log('▶ A) Talabalar — balansi musbat (real pul):');
  const studentsWithBalance = await prisma.$queryRaw<
    Array<{
      id: number;
      firstName: string;
      lastName: string;
      balance: number;
      status: string;
      payments: bigint;
      methods: string | null;
      total_paid: bigint | null;
    }>
  >`
    SELECT s.id,
           s."firstName",
           s."lastName",
           s.balance,
           s.status::text AS status,
           COUNT(p.id) AS payments,
           STRING_AGG(DISTINCT p.method::text, ',') AS methods,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'COMPLETED'), 0) AS total_paid
      FROM "Student" s
      LEFT JOIN "Payment" p
             ON p."studentId" = s.id
            AND p.status = 'COMPLETED'
     WHERE s.balance > 0
       AND s."deletedAt" IS NULL
     GROUP BY s.id, s."firstName", s."lastName", s.balance, s.status
     ORDER BY s.balance DESC
  `;
  console.log(`  Topildi: ${studentsWithBalance.length} ta talaba`);
  const totalBalance = studentsWithBalance.reduce((sum, s) => sum + Number(s.balance), 0);
  console.log(`  Jami balans: ${totalBalance.toLocaleString('uz-UZ')} so'm`);
  writeCsv(
    'students-with-balance.csv',
    studentsWithBalance.map((s) => ({
      ...s,
      payments: Number(s.payments),
      total_paid: s.total_paid ? Number(s.total_paid) : 0,
    })),
  );
  console.log('  → students-with-balance.csv\n');

  // ──────────────────────────────────────────────────────────────────
  // B) Test davomatlar (PRESENT/LATE, un-billed)
  // ──────────────────────────────────────────────────────────────────
  console.log('▶ B) Test davomatlar (PRESENT/LATE, hozir un-billed):');
  // Production'da `LESSON_CONSUMPTION` enum hali bo'lmasligi mumkin
  // (financial_model_v2 migratsiyasi deploy qilinmagan). Shuning uchun
  // ham eski (`LESSON_DEDUCTION`) ham yangi turini hisobga olamiz.
  const billingTypes = await prisma.$queryRaw<Array<{ enum_value: string }>>`
    SELECT unnest(enum_range(NULL::"TransactionType"))::text AS enum_value
  `;
  const enumValues = billingTypes.map((r) => r.enum_value);
  const hasConsumption = enumValues.includes('LESSON_CONSUMPTION');
  const hasReversedAt = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Transaction' AND column_name = 'reversedAt'
    ) AS exists
  `;
  const reversedAtExists = hasReversedAt[0]?.exists ?? false;
  console.log(`  Schema holati: LESSON_CONSUMPTION enum=${hasConsumption}, reversedAt column=${reversedAtExists}`);

  // Build dynamic exists-clause based on schema availability
  const billedTypes = hasConsumption
    ? `('LESSON_CONSUMPTION','LESSON_DEDUCTION')`
    : `('LESSON_DEDUCTION')`;
  const reversedFilter = reversedAtExists ? `AND t."reversedAt" IS NULL` : ``;

  // Attendance does NOT have deletedAt (no soft-delete on this table)
  const unbilledRaw = await prisma.$queryRawUnsafe<
    Array<{
      total_attendance: bigint;
      affected_students: bigint;
      affected_groups: bigint;
    }>
  >(`
    SELECT COUNT(*) AS total_attendance,
           COUNT(DISTINCT a."studentId") AS affected_students,
           COUNT(DISTINCT a."groupId") AS affected_groups
      FROM "Attendance" a
     WHERE a.status IN ('PRESENT','LATE')
       AND NOT EXISTS (
         SELECT 1 FROM "Transaction" t
          WHERE t."attendanceId" = a.id
            AND t.type::text IN ${billedTypes}
            ${reversedFilter}
       )
  `);
  const unbilled = unbilledRaw[0];
  console.log(`  Un-billed davomatlar:    ${Number(unbilled.total_attendance).toLocaleString('uz-UZ')}`);
  console.log(`  Affected talabalar:      ${Number(unbilled.affected_students).toLocaleString('uz-UZ')}`);
  console.log(`  Affected guruhlar:       ${Number(unbilled.affected_groups).toLocaleString('uz-UZ')}`);
  console.log('  Eslatma: bu yozuvlar deploy keyin RETROAKTIV hisoblanmaydi.\n');

  // ──────────────────────────────────────────────────────────────────
  // C) Aktiv guruhlar va kurs narxlari
  // ──────────────────────────────────────────────────────────────────
  console.log('▶ C) Aktiv guruhlar va kurs narxlari:');
  const activeGroups = await prisma.$queryRaw<
    Array<{
      group_id: string;
      group_name: string;
      course_name: string;
      course_price: number;
      lesson_payment_count: number;
      per_lesson_cost: number;
      branch_name: string | null;
      active_enrollments: bigint;
      teacher_count: bigint;
    }>
  >`
    SELECT g.id AS group_id,
           g.name AS group_name,
           c.name AS course_name,
           c.price AS course_price,
           c."lessonPaymentCount" AS lesson_payment_count,
           ROUND(c.price::numeric / NULLIF(c."lessonPaymentCount", 0))::int AS per_lesson_cost,
           b.name AS branch_name,
           COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'ACTIVE') AS active_enrollments,
           COUNT(DISTINCT gt."teacherId") AS teacher_count
      FROM "Group" g
      JOIN "Course" c ON c.id = g."courseId"
      LEFT JOIN "Branch" b ON b.id = g."branchId"
      LEFT JOIN "Enrollment" e ON e."groupId" = g.id AND e."deletedAt" IS NULL
      LEFT JOIN "GroupTeacher" gt ON gt."groupId" = g.id
     WHERE g."deletedAt" IS NULL
       AND g."statusEnum" = 'ACTIVE'
     GROUP BY g.id, g.name, c.name, c.price, c."lessonPaymentCount", b.name
     ORDER BY active_enrollments DESC, g.name
  `;
  console.log(`  Aktiv guruhlar: ${activeGroups.length}`);
  const totalActiveEnrollments = activeGroups.reduce((sum, g) => sum + Number(g.active_enrollments), 0);
  console.log(`  Jami aktiv enrollmentlar: ${totalActiveEnrollments}`);
  const groupsWithoutTeacher = activeGroups.filter((g) => Number(g.teacher_count) === 0);
  if (groupsWithoutTeacher.length > 0) {
    console.log(`  ⚠️  Ustozsiz guruhlar: ${groupsWithoutTeacher.length} (config majburiy!)`);
    groupsWithoutTeacher.forEach((g) => console.log(`     - ${g.group_name}`));
  }
  writeCsv(
    'active-groups.csv',
    activeGroups.map((g) => ({
      ...g,
      active_enrollments: Number(g.active_enrollments),
      teacher_count: Number(g.teacher_count),
    })),
  );
  console.log('  → active-groups.csv\n');

  // ──────────────────────────────────────────────────────────────────
  // D) Ustozlar va salary config holati
  // ──────────────────────────────────────────────────────────────────
  console.log('▶ D) Ustozlar va salary config holati:');
  const teachers = await prisma.$queryRaw<
    Array<{
      user_id: number;
      first_name: string;
      last_name: string;
      role_name: string;
      is_active: boolean;
      config_count: bigint;
      config_types: string | null;
    }>
  >`
    SELECT u.id AS user_id,
           u."firstName" AS first_name,
           u."lastName" AS last_name,
           r.name AS role_name,
           u."isActive" AS is_active,
           COUNT(esc.id) FILTER (WHERE esc."isActive" = true) AS config_count,
           STRING_AGG(DISTINCT esc."salaryType"::text, ',')
             FILTER (WHERE esc."isActive" = true) AS config_types
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u.id
      JOIN "Role" r ON r.id = ur."roleId"
      LEFT JOIN "EmployeeSalaryConfig" esc
             ON esc."userId" = u.id
     WHERE u."isActive" = true
       AND u."deletedAt" IS NULL
       AND r.name IN ('Teacher','Administrator','Cashier','Branch Director','CEO')
     GROUP BY u.id, u."firstName", u."lastName", r.name, u."isActive"
     ORDER BY r.name, u."lastName", u."firstName"
  `;
  console.log(`  Hammasi: ${teachers.length} xodim`);
  const teachersWithoutConfig = teachers.filter((t) => Number(t.config_count) === 0);
  if (teachersWithoutConfig.length > 0) {
    console.log(`  ⚠️  Config yo'q: ${teachersWithoutConfig.length} xodim (cutover'gacha kiritish kerak!)`);
    teachersWithoutConfig.forEach((t) =>
      console.log(`     - [${t.role_name}] ${t.first_name} ${t.last_name}`),
    );
  }
  writeCsv(
    'teachers-config-status.csv',
    teachers.map((t) => ({
      ...t,
      config_count: Number(t.config_count),
    })),
  );
  console.log('  → teachers-config-status.csv\n');

  // ──────────────────────────────────────────────────────────────────
  // E) Aktiv enrollmentlar (buxgalter uchun: har talaba qayerda)
  // ──────────────────────────────────────────────────────────────────
  console.log('▶ E) Aktiv enrollmentlar (buxgalter uchun ishchi ro\'yxat):');
  const activeEnrollments = await prisma.$queryRaw<
    Array<{
      student_id: number;
      first_name: string;
      last_name: string;
      balance: number;
      group_name: string;
      course_name: string;
      course_price: number;
      lesson_payment_count: number;
      per_lesson_cost: number;
      attended_count: bigint;
    }>
  >`
    SELECT s.id AS student_id,
           s."firstName" AS first_name,
           s."lastName" AS last_name,
           s.balance,
           g.name AS group_name,
           c.name AS course_name,
           c.price AS course_price,
           c."lessonPaymentCount" AS lesson_payment_count,
           ROUND(c.price::numeric / NULLIF(c."lessonPaymentCount", 0))::int AS per_lesson_cost,
           (SELECT COUNT(*) FROM "Attendance" a
             WHERE a."studentId" = s.id
               AND a."groupId" = g.id
               AND a.status IN ('PRESENT','LATE')) AS attended_count
      FROM "Enrollment" e
      JOIN "Student" s ON s.id = e."studentId"
      JOIN "Group" g ON g.id = e."groupId"
      JOIN "Course" c ON c.id = g."courseId"
     WHERE e.status = 'ACTIVE'
       AND e."deletedAt" IS NULL
       AND s."deletedAt" IS NULL
       AND s.status = 'ACTIVE'
     ORDER BY s."lastName", s."firstName", g.name
  `;
  console.log(`  Jami aktiv enrollmentlar: ${activeEnrollments.length}`);
  writeCsv(
    'active-enrollments.csv',
    activeEnrollments.map((e) => ({
      ...e,
      attended_count: Number(e.attended_count),
      // Buxgalter uchun bo'sh ustun: u qoldiq darslarni qo'lda hisoblaydi
      remaining_lessons_FILL_BY_ACCOUNTANT: '',
      initial_balance_FILL_BY_ACCOUNTANT: '',
      note_FILL_BY_ACCOUNTANT: '',
    })),
  );
  console.log('  → active-enrollments.csv (buxgalter uchun, oxirida 3 bo\'sh ustun)\n');

  // ──────────────────────────────────────────────────────────────────
  // Yakuniy summary
  // ──────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  YAKUNIY SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Balansda pul borlar:        ${studentsWithBalance.length} ta talaba`);
  console.log(`  Jami balans summasi:        ${totalBalance.toLocaleString('uz-UZ')} so'm`);
  console.log(`  Un-billed test davomatlar:  ${Number(unbilled.total_attendance).toLocaleString('uz-UZ')}`);
  console.log(`  Aktiv guruhlar:             ${activeGroups.length}`);
  console.log(`  Aktiv enrollmentlar:        ${totalActiveEnrollments}`);
  console.log(`  Xodimlar (config siz):      ${teachersWithoutConfig.length} / ${teachers.length}`);
  console.log('');
  console.log('  Keyingi qadam:');
  console.log('  1. audit-output/ papkasidagi CSV fayllarni Excel\'ga oching');
  console.log('  2. active-enrollments.csv\'da har talaba uchun:');
  console.log('     - "remaining_lessons" = eski tizimda qancha to\'langan dars qoldi');
  console.log('     - "initial_balance" = remaining_lessons × per_lesson_cost − current_balance');
  console.log('       (agar balansda allaqachon pul bor bo\'lsa, shu summani chegiradi)');
  console.log('  3. Cutover kuni shu ro\'yxat asosida har talabaga');
  console.log('     POST /api/students/:id/initial-balance yuborilsa');
  console.log('═══════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('XATO:', e);
  await prisma.$disconnect();
  process.exit(1);
});
