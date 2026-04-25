/**
 * Remove all records created by seed-departed-students-report.ts so the
 * script can be re-run from a clean state.
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

  if (ids.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Delete in dependency order (enrollments, attendance, contracts → students).
  const att = await prisma.attendance.deleteMany({ where: { studentId: { in: ids } } });
  const enr = await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
  const con = await prisma.contract.deleteMany({ where: { studentId: { in: ids } } });
  const sb = await prisma.studentBranch.deleteMany({ where: { studentId: { in: ids } } });
  const stu = await prisma.student.deleteMany({ where: { id: { in: ids } } });
  const gth = await prisma.groupTeacherHistory.deleteMany({});

  console.log(`  Deleted attendances: ${att.count}`);
  console.log(`  Deleted enrollments: ${enr.count}`);
  console.log(`  Deleted contracts: ${con.count}`);
  console.log(`  Deleted student-branch links: ${sb.count}`);
  console.log(`  Deleted students: ${stu.count}`);
  console.log(`  Deleted group-teacher-history: ${gth.count}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
