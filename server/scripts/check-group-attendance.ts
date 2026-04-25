import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const groupId = process.argv[2];
  const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  if (!groupId) {
    console.error(
      'Usage: npx ts-node scripts/check-group-attendance.ts <groupId> [YYYY-MM-DD]',
    );
    process.exit(1);
  }

  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Date: ${date}`);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      lessonStartTime: true,
      lessonEndTime: true,
      exactDays: true,
      branchId: true,
      deletedAt: true,
      teachers: {
        select: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      enrollments: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          student: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!group) {
    console.log(`Group ${groupId} NOT FOUND.`);
    return;
  }

  console.log(`\nGroup: ${group.name}`);
  console.log(`  Status: ${group.status}`);
  console.log(
    `  Period: ${group.startDate?.toISOString().slice(0, 10)} → ${group.endDate?.toISOString().slice(0, 10)}`,
  );
  console.log(`  Time: ${group.lessonStartTime} – ${group.lessonEndTime}`);
  console.log(`  exactDays: ${JSON.stringify(group.exactDays)}`);
  console.log(`  Branch: ${group.branchId}`);
  console.log(`  Deleted: ${group.deletedAt}`);
  console.log(`  Teachers: ${group.teachers.length}`);
  console.log(`  Active enrollments: ${group.enrollments.length}`);

  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();
  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  console.log(
    `\nRequested date is ${dayNames[dayOfWeek]} (weekday number ${dayOfWeek}).`,
  );

  const holidays = await prisma.holiday.findMany({
    where: {
      date: new Date(date + 'T00:00:00Z'),
    },
    select: { id: true, name: true },
  });
  console.log(`Holidays matching ${date}: ${JSON.stringify(holidays)}`);

  const attendance = await prisma.attendance.findMany({
    where: {
      groupId,
      date: new Date(date + 'T00:00:00Z'),
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      markedMethod: true,
      createdAt: true,
    },
  });

  console.log(`\nAttendance rows for ${date}: ${attendance.length}`);
  for (const a of attendance.slice(0, 10)) {
    console.log(
      `  student=${a.studentId} status=${a.status} method=${a.markedMethod} at=${a.createdAt.toISOString()}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
