/**
 * Seed realistic data for the /reports/departed-students page:
 *   - diverse departure reasons
 *   - ~120 new students with varied enrollment dates
 *   - ~80 DROPPED enrollments spread across the last 6 months
 *   - contracts with unpaid balance (drives "Yo'qotilgan daromad")
 *   - 8 GroupTeacherHistory events with follow-up attendance so the
 *     "Guruh o'zgarishi — Saqlab qolish vositasi" cards have data
 *   - drops some students within the 5-lesson window after those events
 *     so the retention metric shows non-zero numbers
 *
 * Idempotent: re-running only tops up what's missing. Seeded students are
 * tagged with `comment = 'SEED:departed-report'` and are the only ones this
 * script ever mutates.
 *
 * Run:  npx ts-node scripts/seed-departed-students-report.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const COMPANY_ID = 1001;
const SEED_MARKER = 'SEED:departed-report';

const TEACHER_CHANGE_REASONS = [
  'Ustoz ishdan ketdi',
  'Jadval moslashmadi',
  'Amaliyot natijasi past',
  'Tashkiliy qayta taqsimlash',
  'Vaqtincha almashtirish',
  'Ustoz so\'rovi bilan',
];

const TRANSFER_REASONS = [
  'Daraja past',
  'Daraja yuqori',
  'Vaqt mos kelmadi',
  'Ustoz so\'rovi bilan',
  'Jadval o\'zgarishi',
  'Filial almashtirildi',
];

// 10 real reasons with weights — first 3 are intentionally heavier so the
// Top-3 stacked bar chart has a clear winner and a long tail.
const DEPARTURE_REASONS: { name: string; weight: number }[] = [
  { name: 'Moliyaviy qiyinchilik', weight: 28 },
  { name: "Vaqt yetmasligi", weight: 22 },
  { name: "Ustoz bilan kelisha olmaslik", weight: 18 },
  { name: "Joy o'zgarishi (ko'chib ketish)", weight: 8 },
  { name: "Boshqa kursga o'tish", weight: 7 },
  { name: "Sog'liq sababli", weight: 5 },
  { name: "Darslar qiyin", weight: 4 },
  { name: 'Jadval mos kelmadi', weight: 3 },
  { name: 'Ish sababli', weight: 3 },
  { name: "Boshqa shaxsiy sabablar", weight: 2 },
];

const FIRST_NAMES = [
  'Asliddin', 'Bekzod', 'Dilshod', 'Ergashali', 'Feruz', 'Gulshan', 'Hasan',
  "Ismoil", 'Jasur', 'Kamol', 'Laziz', 'Madina', 'Nodira', 'Olim', 'Parvina',
  'Qobil', 'Rasul', 'Sardor', "Tohir", 'Umid', 'Vohid', 'Xolida', 'Yusuf',
  'Zafar', 'Aziza', "Bahodir", 'Dildora', 'Eldor', 'Fatima', 'Gulnoza',
];
const LAST_NAMES = [
  'Karimov', 'Yo\'ldoshev', 'Toshmatov', 'Saidov', 'Rahimov', 'Mirzayev',
  'Abdullayev', 'Ergashev', 'Usmonov', 'Boboyev', 'Nazarov', 'Qodirov',
  'Kamolov', 'Rustamov', 'Xudoyberdiyev', 'Jo\'rayev', 'Pardayev',
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function weightedPick<T>(items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.item;
  }
  return items[items.length - 1].item;
}

/** Walk forward from `after` and return the first `count` dates matching `exactDays`. */
function projectLessonDates(
  after: Date,
  exactDays: string[],
  count: number,
): Date[] {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const wantedDays = new Set(exactDays.map((d) => dayMap[d.toLowerCase()]));
  const dates: Date[] = [];
  const cursor = new Date(after);
  cursor.setHours(0, 0, 0, 0);
  // Start strictly after `after`
  cursor.setDate(cursor.getDate() + 1);
  let safety = 0;
  while (dates.length < count && safety++ < 120) {
    if (wantedDays.has(cursor.getDay())) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function ensureReasons() {
  // Remove placeholder reasons if they exist.
  await prisma.studentExitReason.deleteMany({
    where: { companyId: COMPANY_ID, name: { in: ['sabab-1', 'sabab-2'] } },
  });

  for (const r of DEPARTURE_REASONS) {
    await prisma.studentExitReason.upsert({
      where: { companyId_name: { companyId: COMPANY_ID, name: r.name } },
      update: {},
      create: {
        name: r.name,
        appliesTo: ['GROUP_REMOVAL'],
        companyId: COMPANY_ID,
      },
    });
  }
  const reasons = await prisma.studentExitReason.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`✓ Departure reasons ensured (${reasons.length})`);
  return reasons;
}

async function ensureTeacherChangeReasons() {
  for (const name of TEACHER_CHANGE_REASONS) {
    await prisma.groupTeacherChangeReason.upsert({
      where: { companyId_name: { companyId: COMPANY_ID, name } },
      update: {},
      create: { name, companyId: COMPANY_ID },
    });
  }
  const all = await prisma.groupTeacherChangeReason.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`✓ Teacher change reasons ensured (${all.length})`);
  return all;
}

async function ensureTransferReasons() {
  for (const name of TRANSFER_REASONS) {
    await prisma.enrollmentTransferReason.upsert({
      where: { companyId_name: { companyId: COMPANY_ID, name } },
      update: {},
      create: { name, companyId: COMPANY_ID },
    });
  }
  const all = await prisma.enrollmentTransferReason.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    select: { id: true, name: true },
  });
  console.log(`✓ Transfer reasons ensured (${all.length})`);
  return all;
}

async function backfillTeacherChangeReasons(
  reasons: { id: string; name: string }[],
) {
  // Fill changeReasonId on ~70% of existing GroupTeacherHistory rows with no reason.
  const unset = await prisma.groupTeacherHistory.findMany({
    where: { changeReasonId: null },
    select: { id: true, triggeredByDismissal: true },
  });
  if (unset.length === 0 || reasons.length === 0) {
    console.log(`✓ No GroupTeacherHistory rows to backfill`);
    return;
  }
  const dismissalReason = reasons.find((r) => r.name === 'Ustoz ishdan ketdi');
  const others = reasons.filter((r) => r.name !== 'Ustoz ishdan ketdi');
  let updated = 0;
  for (const row of unset) {
    if (Math.random() > 0.7) continue; // skip 30%
    const reason =
      row.triggeredByDismissal && dismissalReason
        ? dismissalReason
        : rand(others.length ? others : reasons);
    await prisma.groupTeacherHistory.update({
      where: { id: row.id },
      data: { changeReasonId: reason.id },
    });
    updated++;
  }
  console.log(`✓ Backfilled changeReasonId on ${updated} history rows`);
}

async function seedTransferredEnrollments(
  reasons: { id: string; name: string }[],
  groups: { id: string; branchId: number; courseId: string }[],
) {
  const existing = await prisma.enrollment.count({
    where: { status: 'TRANSFERRED', deletedAt: null },
  });
  const target = 30;
  if (existing >= target) {
    console.log(
      `✓ TRANSFERRED enrollments: ${existing} already present — skipping`,
    );
    return;
  }

  // Pick seeded students whose enrollment is ACTIVE and flip to TRANSFERRED,
  // pointing to a different group.
  const pool = await prisma.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      student: { companyId: COMPANY_ID, comment: SEED_MARKER, deletedAt: null },
    },
    select: { id: true, groupId: true },
    take: target - existing,
  });
  let created = 0;
  for (const e of pool) {
    const targetGroup = rand(groups.filter((g) => g.id !== e.groupId));
    if (!targetGroup) continue;
    const reason = reasons.length > 0 ? rand(reasons) : null;
    const transferredAt = daysAgo(randInt(1, 170));
    await prisma.enrollment.update({
      where: { id: e.id },
      data: {
        status: 'TRANSFERRED',
        statusChangedAt: transferredAt,
        statusChangeReason: "Guruh o'zgartirildi",
        transferredToId: targetGroup.id,
        transferReasonId: reason?.id ?? null,
      },
    });
    created++;
  }
  console.log(`✓ Created ${created} TRANSFERRED enrollments`);
}

async function getNextStudentId(): Promise<number> {
  const maxStudent = await prisma.student.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return Math.max(10000, (maxStudent?.id ?? 9999) + 1);
}

async function seedStudentsAndEnrollments(
  reasons: { id: string; name: string }[],
  groups: { id: string; branchId: number; courseId: string }[],
) {
  const existing = await prisma.student.count({
    where: { companyId: COMPANY_ID, comment: SEED_MARKER, deletedAt: null },
  });
  const target = 120;
  const toCreate = Math.max(0, target - existing);
  console.log(`Seeded students: ${existing}/${target} — creating ${toCreate} more`);

  if (toCreate === 0) return;

  const reasonWeighted = DEPARTURE_REASONS.map((r) => {
    const match = reasons.find((x) => x.name === r.name);
    return match ? { item: match.id, weight: r.weight } : null;
  }).filter((x): x is { item: string; weight: number } => x !== null);

  let nextId = await getNextStudentId();

  for (let i = 0; i < toCreate; i++) {
    const firstName = rand(FIRST_NAMES);
    const lastName = rand(LAST_NAMES);
    // 9-digit phone, uniqueness guarded by studentId suffix.
    const phone = `91${String(nextId).padStart(7, '0').slice(-7)}`;
    const group = rand(groups);

    // Enrollment date: 7–24 months ago. Most predate the 6-month report
    // window so they count in the churn-rate denominator.
    const enrolledAt = daysAgo(randInt(210, 730));

    // 55% of seeded students are DROPPED in the last 6 months; the rest stay
    // ACTIVE to keep the denominator healthy (realistic churn < 50%).
    const isDropped = Math.random() < 0.55;

    // Departure clustered in the last 6 months so it lands inside the chart window.
    const departedAt = isDropped
      ? daysAgo(randInt(1, 170))
      : null;

    const reasonId = isDropped ? weightedPick(reasonWeighted) : null;

    try {
      const student = await prisma.student.create({
        data: {
          id: nextId,
          firstName,
          lastName,
          phone,
          gender: Math.random() < 0.5 ? 'MALE' : 'FEMALE',
          companyId: COMPANY_ID,
          comment: SEED_MARKER,
          status: isDropped ? 'ACTIVE' : 'ACTIVE',
          branches: { create: { branchId: group.branchId } },
        },
      });

      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          groupId: group.id,
          createdAt: enrolledAt,
          status: isDropped ? 'DROPPED' : 'ACTIVE',
          statusChangedAt: departedAt,
          statusChangeReason: isDropped ? 'Seed data' : null,
          departureReasonId: reasonId,
        },
      });

      // Contract: paid/total values give a mix of lost and recovered revenue.
      const total = randInt(1_500_000, 5_000_000);
      const paid = Math.floor(total * (isDropped ? 0.35 : 0.7));
      await prisma.contract.create({
        data: {
          contractNumber: `DAF-SEED-${String(student.id).padStart(6, '0')}`,
          studentId: student.id,
          groupId: group.id,
          branchId: group.branchId,
          courseId: group.courseId,
          companyId: COMPANY_ID,
          totalAmount: total,
          paidAmount: paid,
          status: isDropped ? 'ACTIVE' : 'ACTIVE', // keep ACTIVE so lost-revenue logic includes it
          createdAt: enrolledAt,
        },
      });

      nextId++;
    } catch (err) {
      console.warn(`  ! skip student ${nextId}:`, (err as Error).message);
      nextId++;
    }
  }
  console.log(`✓ Students + enrollments + contracts seeded`);
}

async function seedTeacherChangeHistory(
  groups: {
    id: string;
    exactDays: string[];
    teachers: { teacherId: number }[];
    branchId: number;
  }[],
) {
  const existing = await prisma.groupTeacherHistory.count();
  const target = 8;
  if (existing >= target) {
    console.log(`✓ GroupTeacherHistory: ${existing} events already present — skipping`);
    return;
  }

  // Pick a pool of teachers to swap in (must be teachers not currently in the group).
  const allTeachers = await prisma.user.findMany({
    where: {
      roles: { some: { roleId: 4 } },
      deletedAt: null,
      isActive: true,
      companyId: COMPANY_ID,
    },
    select: { id: true },
  });

  // Target groups: ones with at least 1 teacher AND a stable schedule.
  const eligible = groups.filter(
    (g) => g.teachers.length > 0 && g.exactDays.length > 0,
  );
  const pickGroups = eligible
    .sort(() => Math.random() - 0.5)
    .slice(0, target - existing);

  for (const g of pickGroups) {
    const oldTeacherIds = g.teachers.map((t) => t.teacherId);
    const candidates = allTeachers
      .filter((t) => !oldTeacherIds.includes(t.id))
      .sort(() => Math.random() - 0.5);
    if (candidates.length === 0) continue;
    const newTeacherId = candidates[0].id;

    // Change happened 20-60 days ago so 5 lessons had time to be recorded.
    const changeDate = daysAgo(randInt(20, 60));
    changeDate.setHours(9, 0, 0, 0);

    const triggeredByDismissal = Math.random() < 0.3;

    await prisma.groupTeacherHistory.create({
      data: {
        groupId: g.id,
        previousTeacherIds: oldTeacherIds,
        newTeacherIds: [newTeacherId],
        changeType: 'REPLACED',
        triggeredByDismissal,
        createdAt: changeDate,
      },
    });

    // Seed ~7 lesson dates with attendance AFTER the change so the 5-lesson
    // cutoff is computable. Re-use enrollments currently in that group.
    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        groupId: g.id,
        status: { in: ['ACTIVE', 'DROPPED'] },
        createdAt: { lt: changeDate },
        student: { companyId: COMPANY_ID, deletedAt: null },
      },
      select: { id: true, studentId: true, status: true, statusChangedAt: true },
      take: 10,
    });

    if (activeEnrollments.length === 0) continue;

    const lessonDates = projectLessonDates(changeDate, g.exactDays, 7);
    const today = new Date();
    const pastLessonDates = lessonDates.filter((d) => d <= today);

    for (const date of pastLessonDates) {
      for (const e of activeEnrollments) {
        try {
          await prisma.attendance.upsert({
            where: {
              groupId_studentId_date: {
                groupId: g.id,
                studentId: e.studentId,
                date,
              },
            },
            update: {},
            create: {
              groupId: g.id,
              studentId: e.studentId,
              date,
              status:
                Math.random() < 0.1
                  ? 'ABSENT'
                  : Math.random() < 0.05
                    ? 'LATE'
                    : 'PRESENT',
              markedMethod: 'MANUAL',
              companyId: COMPANY_ID,
            },
          });
        } catch {
          // ignore duplicate violations
        }
      }
    }

    // Drop 1-2 enrollments within the 5-lesson window so the retention metric
    // has non-zero values. Pick students whose enrollment is still ACTIVE
    // (not already dropped) and move them to DROPPED with a date between the
    // change and the 5th lesson.
    if (pastLessonDates.length >= 2) {
      const cutoffIdx = Math.min(4, pastLessonDates.length - 1);
      const cutoffDate = pastLessonDates[cutoffIdx];
      const dropCount = Math.min(2, activeEnrollments.length);
      const victims = activeEnrollments
        .filter((e) => e.status === 'ACTIVE')
        .slice(0, dropCount);
      for (const e of victims) {
        const departedAt = new Date(changeDate);
        departedAt.setDate(
          departedAt.getDate() +
            randInt(1, Math.max(1, cutoffIdx * 2)),
        );
        if (departedAt > cutoffDate) departedAt.setTime(cutoffDate.getTime());

        const reasonId = (
          await prisma.studentExitReason.findFirst({
            where: { companyId: COMPANY_ID, deletedAt: null },
            select: { id: true },
          })
        )?.id;

        await prisma.enrollment.update({
          where: { id: e.id },
          data: {
            status: 'DROPPED',
            statusChangedAt: departedAt,
            statusChangeReason: 'Seed: dropped after teacher change',
            departureReasonId: reasonId,
          },
        });
      }
    }
  }
  const total = await prisma.groupTeacherHistory.count();
  console.log(`✓ GroupTeacherHistory events: ${total}`);
}

async function main() {
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log('');

  const reasons = await ensureReasons();

  const groups = await prisma.group.findMany({
    where: {
      companyId: COMPANY_ID,
      deletedAt: null,
    },
    select: {
      id: true,
      branchId: true,
      courseId: true,
      exactDays: true,
      teachers: { select: { teacherId: true } },
    },
  });
  console.log(`✓ Found ${groups.length} groups`);

  await seedStudentsAndEnrollments(reasons, groups);
  await seedTeacherChangeHistory(groups);

  const teacherChangeReasons = await ensureTeacherChangeReasons();
  await backfillTeacherChangeReasons(teacherChangeReasons);

  const transferReasons = await ensureTransferReasons();
  await seedTransferredEnrollments(transferReasons, groups);

  // Final summary
  const [total, dropped, transferred, history] = await Promise.all([
    prisma.enrollment.count({ where: { deletedAt: null } }),
    prisma.enrollment.count({ where: { status: 'DROPPED', deletedAt: null } }),
    prisma.enrollment.count({
      where: { status: 'TRANSFERRED', deletedAt: null },
    }),
    prisma.groupTeacherHistory.count(),
  ]);
  console.log('');
  console.log('=== Final state ===');
  console.log(`  Enrollments total: ${total}`);
  console.log(`  Enrollments DROPPED: ${dropped}`);
  console.log(`  Enrollments TRANSFERRED: ${transferred}`);
  console.log(`  Teacher change events: ${history}`);
  console.log(`  Departure reasons: ${reasons.length}`);
  console.log(`  Teacher change reasons: ${teacherChangeReasons.length}`);
  console.log(`  Transfer reasons: ${transferReasons.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
