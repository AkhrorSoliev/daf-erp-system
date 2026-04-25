import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const groupId = process.argv[2];
  const dateStr = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  if (!groupId) {
    console.error(
      'Usage: npx ts-node scripts/check-attendance-notifications.ts <groupId> [YYYY-MM-DD]',
    );
    process.exit(1);
  }

  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Date: ${dateStr}`);

  // Tashkent day boundaries translated to UTC instants
  const tashkentDayStart = new Date(`${dateStr}T00:00:00+05:00`);
  const tashkentDayEnd = new Date(`${dateStr}T23:59:59+05:00`);
  console.log(
    `Tashkent day boundaries (UTC): ${tashkentDayStart.toISOString()} → ${tashkentDayEnd.toISOString()}`,
  );

  const attendanceTypes = [
    'LESSON_STARTED',
    'ATTENDANCE_ADMIN_ALERT',
    'ATTENDANCE_TEACHER_WARNING',
    'ATTENDANCE_MISSING_TEACHER',
    'ATTENDANCE_MISSING_ADMIN',
    'ATTENDANCE_COMPLETED',
  ];

  const notifs = await prisma.notification.findMany({
    where: {
      relatedEntityType: 'Group',
      relatedEntityId: groupId,
      type: { in: attendanceTypes as any[] },
      createdAt: { gte: tashkentDayStart, lte: tashkentDayEnd },
    },
    select: {
      id: true,
      type: true,
      title: true,
      userId: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `\nAttendance notifications for group ${groupId} on ${dateStr}: ${notifs.length}`,
  );
  for (const n of notifs) {
    const roles = n.user.roles.map((r) => r.role.name).join(',');
    const tashkentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(n.createdAt);
    console.log(
      `  [${tashkentTime}] ${n.type} → user ${n.userId} (${n.user.firstName} ${n.user.lastName}) [${roles}]`,
    );
  }

  // Also list cron-eligible recipients (teachers + branch admins) for sanity
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      branchId: true,
      teachers: {
        select: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (group) {
    console.log(`\nGroup teachers (should get teacher notifications):`);
    for (const gt of group.teachers) {
      console.log(
        `  #${gt.teacher.id} ${gt.teacher.firstName} ${gt.teacher.lastName}`,
      );
    }

    const admins = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: { some: { role: { name: 'Administrator' } } },
        branches: { some: { branchId: group.branchId ?? -1 } },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    console.log(
      `\nBranch #${group.branchId} Administrators (should get admin alerts):`,
    );
    for (const a of admins) {
      console.log(`  #${a.id} ${a.firstName} ${a.lastName}`);
    }
  }

  // Sample recent notifications of these types across the whole DB to check if the cron is even firing
  const recentAny = await prisma.notification.findMany({
    where: { type: { in: attendanceTypes as any[] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { type: true, createdAt: true, relatedEntityId: true },
  });
  console.log(`\nMost recent attendance notifications system-wide:`);
  for (const n of recentAny) {
    console.log(
      `  ${n.createdAt.toISOString()} ${n.type} group=${n.relatedEntityId}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
