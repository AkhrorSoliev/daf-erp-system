/**
 * Production'dagi LESSON_DEDUCTION yozuvlarini tekshirish (read-only).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}\n`);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      created_at: Date;
      amount: number;
      description: string | null;
      student_id: number | null;
      student_name: string | null;
      enrollment_id: string | null;
      attendance_id: string | null;
      contract_id: string | null;
      group_name: string | null;
      course_name: string | null;
      performed_by_id: number | null;
      performer_name: string | null;
      performer_role: string | null;
      reversed_at: Date | null;
      metadata: any;
    }>
  >`
    SELECT t.id,
           t."createdAt" AS created_at,
           t.amount,
           t.description,
           t."studentId" AS student_id,
           CASE WHEN s.id IS NULL THEN NULL
                ELSE s."firstName" || ' ' || s."lastName" END AS student_name,
           t."enrollmentId" AS enrollment_id,
           t."attendanceId" AS attendance_id,
           t."contractId" AS contract_id,
           g.name AS group_name,
           c.name AS course_name,
           t."performedById" AS performed_by_id,
           CASE WHEN u.id IS NULL THEN NULL
                ELSE u."firstName" || ' ' || u."lastName" END AS performer_name,
           STRING_AGG(DISTINCT r.name, ',') AS performer_role,
           t."reversedAt" AS reversed_at,
           t.metadata
      FROM "Transaction" t
      LEFT JOIN "Student" s ON s.id = t."studentId"
      LEFT JOIN "Enrollment" e ON e.id = t."enrollmentId"
      LEFT JOIN "Group" g ON g.id = e."groupId"
      LEFT JOIN "Course" c ON c.id = g."courseId"
      LEFT JOIN "User" u ON u.id = t."performedById"
      LEFT JOIN "UserRole" ur ON ur."userId" = u.id
      LEFT JOIN "Role" r ON r.id = ur."roleId"
     WHERE t.type::text = 'LESSON_DEDUCTION'
     GROUP BY t.id, t."createdAt", t.amount, t.description,
              t."studentId", s.id, s."firstName", s."lastName",
              t."enrollmentId", t."attendanceId", t."contractId",
              g.name, c.name,
              t."performedById", u.id, u."firstName", u."lastName",
              t."reversedAt", t.metadata
     ORDER BY t."createdAt"
  `;

  console.log(`▶ ${rows.length} ta LESSON_DEDUCTION topildi:\n`);
  rows.forEach((r, idx) => {
    console.log(`──── #${idx + 1} ─────────────────────────────────────`);
    console.log(`  id:           ${r.id}`);
    console.log(`  Yaratilgan:   ${r.created_at.toISOString()} (${r.created_at.toLocaleString('uz-UZ')})`);
    console.log(`  Summa:        ${r.amount.toLocaleString('uz-UZ')} so'm`);
    console.log(`  Description:  ${r.description ?? '(yo\'q)'}`);
    console.log(`  Talaba:       #${r.student_id} ${r.student_name ?? '(yo\'q)'}`);
    console.log(`  Guruh/kurs:   ${r.group_name ?? '?'} / ${r.course_name ?? '?'}`);
    console.log(`  Enrollment:   ${r.enrollment_id ?? '(yo\'q)'}`);
    console.log(`  Attendance:   ${r.attendance_id ?? '(yo\'q)'}`);
    console.log(`  Performed by: ${r.performer_name ?? '(NULL — script orqali)'} ${r.performer_role ? '[' + r.performer_role + ']' : ''}`);
    console.log(`  Reversed:     ${r.reversed_at ? r.reversed_at.toISOString() : 'YO\'Q (aktiv)'}`);
    console.log(`  Metadata:     ${JSON.stringify(r.metadata)}`);
    console.log('');
  });

  // Bog'liq EntityHistory yozuvlari
  if (rows.length > 0) {
    const studentIds = [...new Set(rows.map((r) => r.student_id).filter((x) => x !== null))] as number[];
    if (studentIds.length > 0) {
      console.log('▶ Shu talabalar uchun oxirgi EntityHistory yozuvlari:');
      const history = await prisma.$queryRaw<
        Array<{ entity_id: string; action: string; field_changes: any; created_at: Date; changed_by: number | null; changed_by_name: string | null }>
      >`
        SELECT eh."entityId" AS entity_id,
               eh.action::text AS action,
               eh."fieldChanges" AS field_changes,
               eh."createdAt" AS created_at,
               eh."changedById" AS changed_by,
               CASE WHEN u.id IS NULL THEN NULL
                    ELSE u."firstName" || ' ' || u."lastName" END AS changed_by_name
          FROM "EntityHistory" eh
          LEFT JOIN "User" u ON u.id = eh."changedById"
         WHERE eh."entityType" = 'Student'
           AND eh."entityId" = ANY(${studentIds.map(String)}::text[])
           AND eh."createdAt" > NOW() - INTERVAL '30 days'
         ORDER BY eh."createdAt" DESC
         LIMIT 30
      `;
      history.forEach((h) => {
        console.log(`  ${h.created_at.toISOString().substring(0, 19)}  Talaba #${h.entity_id}  ${h.action}  by ${h.changed_by_name ?? 'NULL'}  ${JSON.stringify(h.field_changes).substring(0, 120)}`);
      });
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('XATO:', e);
  await prisma.$disconnect();
  process.exit(1);
});
