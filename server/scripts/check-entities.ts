import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const branches = await prisma.branch.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });
  const courses = await prisma.course.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });
  const groups = await prisma.group.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      branchId: true,
      courseId: true,
      companyId: true,
      exactDays: true,
      lessonStartTime: true,
      teachers: { select: { teacherId: true } },
    },
  });
  const reasons = await prisma.studentExitReason.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });

  console.log('=== Branches ===');
  console.table(branches);
  console.log('=== Courses ===');
  console.table(courses);
  console.log('=== Groups (first 5) ===');
  console.table(groups.slice(0, 5));
  console.log('Total groups:', groups.length);
  const groupsWithTeachers = groups.filter((g) => g.teachers.length > 0);
  console.log('Groups with teachers:', groupsWithTeachers.length);
  console.log('=== Departure reasons ===');
  console.table(reasons);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
