/**
 * READ-ONLY — broader May-teacher census, to catch teachers who taught in May
 * but were since removed/reassigned from the group (so current GroupTeacher
 * misses them). Signals: who MARKED May attendance, all Teacher-role users,
 * and config status. Mutates nothing.
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

  // All Teacher-role users (active + archived).
  const teachers = await prisma.user.findMany({
    where: { companyId: COMPANY, roles: { some: { role: { name: 'Teacher' } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      isActive: true,
      deletedAt: true,
      salaryConfigs: { select: { isActive: true } },
    },
  });
  console.log(`Total Teacher-role users (active+archived): ${teachers.length}`);
  const activeTeachers = teachers.filter((t) => !t.deletedAt && t.isActive);
  console.log(`  active: ${activeTeachers.length} | archived/inactive: ${teachers.length - activeTeachers.length}`);

  // Who MARKED May PRESENT/LATE attendance (proxy for "active in May").
  const mayAtts = await prisma.attendance.findMany({
    where: {
      companyId: COMPANY,
      status: { in: ['PRESENT', 'LATE'] },
      date: { gte: MAY1, lt: JUN1 },
    },
    select: { markedById: true },
  });
  const markedByIds = [...new Set(mayAtts.map((a) => a.markedById).filter(Boolean))] as number[];
  const markers = await prisma.user.findMany({
    where: { id: { in: markedByIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  const teacherMarkers = markers.filter((m) => m.roles.some((r) => r.role.name === 'Teacher'));
  console.log(`\nDistinct users who marked May attendance: ${markedByIds.length} (of which Teacher-role: ${teacherMarkers.length})`);

  const activeConfigTeacher = new Set(
    teachers.filter((t) => t.salaryConfigs.some((c) => c.isActive)).map((t) => t.id),
  );

  console.log('\n================ ALL Teacher-role users ================');
  for (const t of teachers.sort((a, b) => a.id - b.id)) {
    const hasCfg = activeConfigTeacher.has(t.id);
    const markedMay = teacherMarkers.some((m) => m.id === t.id);
    console.log(
      `#${t.id} ${t.firstName} ${t.lastName} | status=${t.status} ${t.deletedAt ? 'ARCHIVED' : ''} | activeCfg=${hasCfg ? 'yes' : 'NO'} | markedMayAtt=${markedMay ? 'yes' : 'no'}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
