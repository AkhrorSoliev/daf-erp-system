/**
 * Remove all records created by seed-departed-students-report.ts so the
 * script can be re-run from a clean state.
 *
 * Every delete here is scoped by the `SEED:departed-report` tag the seed
 * writes — `Student.comment` for people, `GroupTeacherHistory.changeReason`
 * for teacher-change events. Nothing untagged is ever touched.
 *
 * Rows seeded BEFORE the tag was added to teacher-change events carry no tag
 * and are therefore left alone; the script reports them rather than guessing.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_MARKER = 'SEED:departed-report';

async function main() {
  const seedStudents = await prisma.student.findMany({
    where: { comment: SEED_MARKER },
    select: { id: true },
  });
  const ids = seedStudents.map((s) => s.id);
  console.log(`Found ${ids.length} seed students to delete`);

  if (ids.length > 0) {
    // Delete in dependency order (enrollments, attendance, contracts → students).
    const att = await prisma.attendance.deleteMany({ where: { studentId: { in: ids } } });
    const enr = await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    const con = await prisma.contract.deleteMany({ where: { studentId: { in: ids } } });
    const sb = await prisma.studentBranch.deleteMany({ where: { studentId: { in: ids } } });
    const stu = await prisma.student.deleteMany({ where: { id: { in: ids } } });

    console.log(`  Deleted attendances: ${att.count}`);
    console.log(`  Deleted enrollments: ${enr.count}`);
    console.log(`  Deleted contracts: ${con.count}`);
    console.log(`  Deleted student-branch links: ${sb.count}`);
    console.log(`  Deleted students: ${stu.count}`);
  }

  // Scoped to the seed's own tag. This used to be `deleteMany({})` — an empty
  // WHERE, i.e. every teacher-change event in the database, for every branch,
  // including ones the seed never touched. It ran unguarded: no --apply, no
  // dry-run, no host check.
  //
  // It also lives outside the seed-student branch above, because a tagged
  // history row can outlive its students — the old early return would have
  // silently left it behind.
  const gth = await prisma.groupTeacherHistory.deleteMany({
    where: { changeReason: SEED_MARKER },
  });
  console.log(`  Deleted group-teacher-history: ${gth.count}`);

  // Rows created before the seed started tagging them cannot be distinguished
  // from real teacher changes. Report, never guess.
  const untagged = await prisma.groupTeacherHistory.count({
    where: { changeReason: null },
  });
  if (untagged > 0) {
    console.log(
      `\n  ℹ ${untagged} ta belgisiz GroupTeacherHistory qatori qoldi.\n` +
        '    Bular haqiqiy o\'qituvchi almashuvlari BO\'LISHI MUMKIN — bu skript\n' +
        '    ularga tegmaydi. Belgi qo\'shilishidan oldin seed ishlatilgan bo\'lsa,\n' +
        '    qaysilari seed ekanini qo\'lda aniqlang.',
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
