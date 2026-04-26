/**
 * Backfill snapshot tables for /reports/activity historical accuracy.
 *
 * For each existing entity, create one initial snapshot row representing
 * the current state with validFrom = createdAt. Future updates will close
 * old snapshots and open new ones via service hooks.
 *
 * Tables backfilled:
 *   - RoomCapacitySnapshot
 *   - GroupScheduleSnapshot
 *   - CoursePriceSnapshot
 *   - EnrollmentStateLog (1 row for createdAt + optional 1 row for current
 *     status if it differs from ACTIVE and statusChangedAt is set)
 *
 * Idempotent: Skips entities that already have at least one snapshot row,
 * so it's safe to re-run.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/backfill-activity-snapshots.ts --dry-run   # preview
 *   npx ts-node scripts/backfill-activity-snapshots.ts             # apply
 */
import { PrismaClient, EnrollmentStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

async function backfillRoomCapacities() {
  console.log('\n=== Room capacity snapshots ===');
  const rooms = await prisma.room.findMany({
    where: { deletedAt: null, capacity: { not: null } },
    select: {
      id: true,
      name: true,
      capacity: true,
      createdAt: true,
      _count: { select: { capacitySnapshots: true } },
    },
  });

  const toBackfill = rooms.filter((r) => r._count.capacitySnapshots === 0);
  console.log(
    `Total rooms: ${rooms.length}. Need backfill: ${toBackfill.length}.`,
  );

  if (DRY_RUN || toBackfill.length === 0) return;

  for (const r of toBackfill) {
    await prisma.roomCapacitySnapshot.create({
      data: {
        roomId: r.id,
        capacity: r.capacity!,
        validFrom: r.createdAt,
        validTo: null,
      },
    });
  }
  console.log(`✓ Inserted ${toBackfill.length} room capacity snapshots.`);
}

async function backfillGroupSchedules() {
  console.log('\n=== Group schedule snapshots ===');
  const groups = await prisma.group.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
      courseId: true,
      createdAt: true,
      _count: { select: { scheduleSnapshots: true } },
    },
  });

  const toBackfill = groups.filter((g) => g._count.scheduleSnapshots === 0);
  console.log(
    `Total groups: ${groups.length}. Need backfill: ${toBackfill.length}.`,
  );

  if (DRY_RUN || toBackfill.length === 0) return;

  for (const g of toBackfill) {
    await prisma.groupScheduleSnapshot.create({
      data: {
        groupId: g.id,
        exactDays: g.exactDays,
        lessonStartTime: g.lessonStartTime,
        lessonEndTime: g.lessonEndTime,
        courseId: g.courseId,
        validFrom: g.createdAt,
        validTo: null,
      },
    });
  }
  console.log(`✓ Inserted ${toBackfill.length} group schedule snapshots.`);
}

async function backfillCoursePrices() {
  console.log('\n=== Course price snapshots ===');
  const courses = await prisma.course.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      price: true,
      createdAt: true,
      _count: { select: { priceSnapshots: true } },
    },
  });

  const toBackfill = courses.filter((c) => c._count.priceSnapshots === 0);
  console.log(
    `Total courses: ${courses.length}. Need backfill: ${toBackfill.length}.`,
  );

  if (DRY_RUN || toBackfill.length === 0) return;

  for (const c of toBackfill) {
    await prisma.coursePriceSnapshot.create({
      data: {
        courseId: c.id,
        price: c.price,
        validFrom: c.createdAt,
        validTo: null,
      },
    });
  }
  console.log(`✓ Inserted ${toBackfill.length} course price snapshots.`);
}

async function backfillEnrollmentStates() {
  console.log('\n=== Enrollment state log ===');
  const enrollments = await prisma.enrollment.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      statusChangedAt: true,
      createdAt: true,
      _count: { select: { stateLog: true } },
    },
  });

  const toBackfill = enrollments.filter((e) => e._count.stateLog === 0);
  console.log(
    `Total enrollments: ${enrollments.length}. Need backfill: ${toBackfill.length}.`,
  );

  if (DRY_RUN || toBackfill.length === 0) return;

  let initialEvents = 0;
  let transitionEvents = 0;

  for (const e of toBackfill) {
    // 1) Initial CREATE event — assume started ACTIVE at createdAt
    await prisma.enrollmentStateLog.create({
      data: {
        enrollmentId: e.id,
        status: EnrollmentStatus.ACTIVE,
        transitionAt: e.createdAt,
      },
    });
    initialEvents++;

    // 2) If current status differs from ACTIVE and we have a transition timestamp,
    //    record the transition event.
    if (e.status !== EnrollmentStatus.ACTIVE && e.statusChangedAt) {
      await prisma.enrollmentStateLog.create({
        data: {
          enrollmentId: e.id,
          status: e.status,
          transitionAt: e.statusChangedAt,
        },
      });
      transitionEvents++;
    }
  }

  console.log(
    `✓ Inserted ${initialEvents} initial events + ${transitionEvents} transition events.`,
  );
}

async function main() {
  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  await backfillRoomCapacities();
  await backfillGroupSchedules();
  await backfillCoursePrices();
  await backfillEnrollmentStates();

  if (DRY_RUN) {
    console.log('\nDry run — no changes written.');
  } else {
    console.log('\n✅ Backfill complete.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
