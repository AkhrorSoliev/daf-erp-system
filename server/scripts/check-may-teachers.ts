/**
 * READ-ONLY — who actually TAUGHT in May vs who the backfill covers.
 *
 * The backfill (and reconcile) only consider teachers with an ACTIVE
 * EmployeeSalaryConfig. This finds every teacher linked (via GroupTeacher) to a
 * group that had a May PRESENT/LATE lesson, and flags those WITHOUT an active
 * config (would be missed) + their user status. Mutates nothing.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const COMPANY = 1001;
const MAY1 = new Date('2026-05-01T00:00:00.000Z');
const JUN1 = new Date('2026-06-01T00:00:00.000Z');

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host, '\n');

  // 1) groups with a May PRESENT/LATE lesson
  const mayAtts = await prisma.attendance.findMany({
    where: {
      companyId: COMPANY,
      status: { in: ['PRESENT', 'LATE'] },
      date: { gte: MAY1, lt: JUN1 },
    },
    select: { groupId: true },
  });
  const mayGroupIds = [...new Set(mayAtts.map((a) => a.groupId))];
  console.log(`Groups with May PRESENT/LATE lessons: ${mayGroupIds.length}`);

  // 2) every teacher linked to those groups (current GroupTeacher)
  const gts = await prisma.groupTeacher.findMany({
    where: { groupId: { in: mayGroupIds } },
    select: { teacherId: true, groupId: true },
  });
  const taughtTeacherIds = [...new Set(gts.map((g) => g.teacherId))];
  console.log(`Distinct teachers linked to those groups (GroupTeacher): ${taughtTeacherIds.length}`);

  // 3) who has an ACTIVE config (the backfill set)
  const activeConfigs = await prisma.employeeSalaryConfig.findMany({
    where: { companyId: COMPANY, isActive: true },
    select: { userId: true },
  });
  const activeConfigSet = new Set(activeConfigs.map((c) => c.userId));
  console.log(`Teachers with ACTIVE salary config (backfill set): ${activeConfigSet.size}\n`);

  // 4) teacher details + any config (incl. inactive)
  const users = await prisma.user.findMany({
    where: { id: { in: taughtTeacherIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      isActive: true,
      deletedAt: true,
      roles: { select: { role: { select: { name: true } } } },
      salaryConfigs: {
        select: { isActive: true, salaryType: true, value: true, groupId: true },
      },
    },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const missing: typeof users = [];
  for (const tid of taughtTeacherIds) {
    if (!activeConfigSet.has(tid)) missing.push(userMap.get(tid)!);
  }

  console.log('================ TAUGHT IN MAY BUT NO ACTIVE CONFIG ================');
  if (missing.length === 0) {
    console.log('(none — every May-teaching teacher has an active config)');
  } else {
    for (const u of missing.filter(Boolean)) {
      const roles = u.roles.map((r) => r.role.name).join(',');
      const cfgs = u.salaryConfigs
        .map((c) => `${c.salaryType}:${c.value}${c.isActive ? '' : '(inactive)'}${c.groupId ? '(group)' : ''}`)
        .join(' | ') || 'NO CONFIG AT ALL';
      // how many May covered lessons would this teacher be owed for?
      const myGroups = [...new Set(gts.filter((g) => g.teacherId === u.id).map((g) => g.groupId))];
      const myAtts = await prisma.attendance.count({
        where: {
          groupId: { in: myGroups },
          status: { in: ['PRESENT', 'LATE'] },
          date: { gte: MAY1, lt: JUN1 },
        },
      });
      console.log(
        `#${u.id} ${u.firstName} ${u.lastName} [${roles}] status=${u.status} active=${u.isActive} ${u.deletedAt ? 'ARCHIVED' : ''}`,
      );
      console.log(`   configs: ${cfgs}`);
      console.log(`   May PRESENT/LATE lessons in their groups: ${myAtts}`);
    }
  }

  console.log('\n================ SUMMARY ================');
  console.log(`Taught in May: ${taughtTeacherIds.length} | With active config: ${activeConfigSet.size} | MISSING: ${missing.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
