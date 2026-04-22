import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const studentId = 10003;
  const companyId = 1001;

  console.log(`\n=== Test resolveStudentBranchId(${studentId}, ${companyId}) ===\n`);

  // 1. Active enrollment?
  const activeEnrollment = await prisma.enrollment.findFirst({
    where: {
      studentId,
      deletedAt: null,
      status: 'ACTIVE',
      group: { companyId, deletedAt: null },
    },
    select: {
      id: true,
      groupId: true,
      status: true,
      group: { select: { branchId: true, name: true, companyId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Faol enrollment:', activeEnrollment);

  // 2. StudentBranch?
  const studentBranch = await prisma.studentBranch.findFirst({
    where: { studentId, student: { companyId } },
    select: { branchId: true },
  });
  console.log('StudentBranch:', studentBranch);

  // 3. All enrollments (debug)
  const allEnrollments = await prisma.enrollment.findMany({
    where: { studentId },
    select: { id: true, status: true, deletedAt: true, group: { select: { branchId: true, companyId: true, deletedAt: true } } },
  });
  console.log('\nBarcha enrollmentlar:');
  for (const e of allEnrollments) {
    console.log(`  id=${e.id.slice(0,8)} status=${e.status} deletedAt=${e.deletedAt} groupBranch=${e.group.branchId} groupCompany=${e.group.companyId}`);
  }

  // 4. Student info
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, firstName: true, companyId: true, status: true },
  });
  console.log('\nStudent:', student);
}

main().catch(console.error).finally(() => prisma.$disconnect());
