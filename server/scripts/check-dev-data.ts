import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [
    companies,
    branches,
    courses,
    groups,
    teachers,
    students,
    enrollments,
    droppedEnrollments,
    reasons,
    attendances,
    contracts,
  ] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.branch.count({ where: { deletedAt: null } }),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.group.count({ where: { deletedAt: null } }),
    prisma.user.count({
      where: {
        roles: { some: { roleId: 4 } },
        deletedAt: null,
      },
    }),
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.enrollment.count({ where: { deletedAt: null } }),
    prisma.enrollment.count({ where: { status: 'DROPPED', deletedAt: null } }),
    prisma.studentExitReason.count({ where: { deletedAt: null } }),
    prisma.attendance.count(),
    prisma.contract.count({ where: { deletedAt: null } }),
  ]);

  console.log('=== Dev DB snapshot ===');
  console.log('Companies:', companies);
  console.log('Branches:', branches);
  console.log('Courses:', courses);
  console.log('Groups:', groups);
  console.log('Teachers:', teachers);
  console.log('Students:', students);
  console.log('Enrollments (total):', enrollments);
  console.log('Enrollments (DROPPED):', droppedEnrollments);
  console.log('Departure reasons:', reasons);
  console.log('Attendance rows:', attendances);
  console.log('Contracts:', contracts);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
