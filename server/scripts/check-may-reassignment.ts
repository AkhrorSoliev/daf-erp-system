/**
 * READ-ONLY — detect May groups where the teacher who MARKED the May lessons
 * differs from the CURRENT GroupTeacher (reassignment / departed teacher).
 * Those lessons would be MISATTRIBUTED by a current-GroupTeacher backfill.
 * Mutates nothing.
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

  // May PRESENT/LATE attendances with who marked them.
  const atts = await prisma.attendance.findMany({
    where: {
      companyId: COMPANY,
      status: { in: ['PRESENT', 'LATE'] },
      date: { gte: MAY1, lt: JUN1 },
    },
    select: { groupId: true, markedById: true },
  });
  const mayGroupIds = [...new Set(atts.map((a) => a.groupId))];

  // current group teachers
  const gts = await prisma.groupTeacher.findMany({
    where: { groupId: { in: mayGroupIds } },
    select: { teacherId: true, groupId: true },
  });
  const curTeacherByGroup = new Map<string, number[]>();
  for (const gt of gts) {
    const arr = curTeacherByGroup.get(gt.groupId) ?? [];
    arr.push(gt.teacherId);
    curTeacherByGroup.set(gt.groupId, arr);
  }

  // all relevant users (markers + current teachers)
  const allUserIds = [
    ...new Set([
      ...atts.map((a) => a.markedById).filter(Boolean),
      ...gts.map((g) => g.teacherId),
    ]),
  ] as number[];
  const users = await prisma.user.findMany({
    where: { id: { in: allUserIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      deletedAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));
  const isTeacher = (id: number) =>
    uMap.get(id)?.roles.some((r) => r.role.name === 'Teacher') ?? false;
  const name = (id: number) => {
    const u = uMap.get(id);
    return u ? `#${id} ${u.firstName} ${u.lastName}${u.deletedAt ? '(ARCHIVED)' : ''}` : `#${id}`;
  };
  const groups = await prisma.group.findMany({
    where: { id: { in: mayGroupIds } },
    select: { id: true, name: true },
  });
  const gName = new Map(groups.map((g) => [g.id, g.name]));

  // per-group: count May lessons by teacher-marker; compare to current teacher.
  const attsByGroup = new Map<string, typeof atts>();
  for (const a of atts) {
    const arr = attsByGroup.get(a.groupId) ?? [];
    arr.push(a);
    attsByGroup.set(a.groupId, arr as any);
  }

  let mismatchGroups = 0;
  let mismatchLessons = 0;
  const ownedByDeparted = new Map<number, number>(); // teacherId → lessons marked

  console.log('================ GROUPS WHERE MAY MARKER ≠ CURRENT TEACHER ================');
  for (const gid of mayGroupIds) {
    const cur = curTeacherByGroup.get(gid) ?? [];
    const groupAtts = attsByGroup.get(gid) ?? [];
    // count lessons per teacher-marker
    const byMarker = new Map<number, number>();
    for (const a of groupAtts) {
      if (a.markedById && isTeacher(a.markedById)) {
        byMarker.set(a.markedById, (byMarker.get(a.markedById) ?? 0) + 1);
      }
    }
    // is there a teacher-marker who is NOT the current teacher?
    const offRoster = [...byMarker.keys()].filter((m) => !cur.includes(m));
    if (offRoster.length > 0) {
      mismatchGroups++;
      const lessons = offRoster.reduce((s, m) => s + (byMarker.get(m) ?? 0), 0);
      mismatchLessons += lessons;
      console.log(
        `Group #${gName.get(gid)} — current: ${cur.map(name).join(', ') || 'none'}`,
      );
      for (const m of offRoster) {
        console.log(`     marked by (off current roster): ${name(m)} → ${byMarker.get(m)} lesson(s)`);
        ownedByDeparted.set(m, (ownedByDeparted.get(m) ?? 0) + (byMarker.get(m) ?? 0));
      }
    }
  }
  if (mismatchGroups === 0) console.log('(none — current teacher matches the May marker in every group)');

  console.log('\n================ SUMMARY ================');
  console.log(`May groups: ${mayGroupIds.length} | groups w/ marker≠current: ${mismatchGroups} | misattributable lessons: ${mismatchLessons}`);
  console.log('\nTeacher-markers off the current roster (potential departed/reassigned):');
  for (const [tid, n] of [...ownedByDeparted.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${name(tid)} → ${n} May lesson(s) they marked`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
