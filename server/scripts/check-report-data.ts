/**
 * Sanity-check the /reports/departed-students data shape by calling the
 * underlying service methods directly.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const COMPANY_ID = 1001;

async function main() {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = sixMonthsAgo;

  // Summary metrics
  const dropped = await prisma.enrollment.count({
    where: {
      status: 'DROPPED',
      deletedAt: null,
      statusChangedAt: { gte: start, lte: end },
      student: { companyId: COMPANY_ID, deletedAt: null },
    },
  });
  const activeAtStart = await prisma.enrollment.count({
    where: {
      createdAt: { lt: start },
      deletedAt: null,
      student: { companyId: COMPANY_ID, deletedAt: null },
      OR: [
        { status: { in: ['ACTIVE', 'FROZEN'] } },
        { statusChangedAt: { gte: start } },
      ],
    },
  });
  const teacherChanges = await prisma.groupTeacherHistory.count({
    where: { createdAt: { gte: start, lte: end } },
  });

  console.log(`Window: ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);
  console.log(`  Dropped in window: ${dropped}`);
  console.log(`  Active at start (denominator): ${activeAtStart}`);
  console.log(`  Churn rate: ${activeAtStart > 0 ? ((dropped / activeAtStart) * 100).toFixed(1) : 0}%`);
  console.log(`  Teacher changes in window: ${teacherChanges}`);

  // Reasons breakdown
  const byReason = await prisma.enrollment.groupBy({
    by: ['departureReasonId'],
    where: {
      status: 'DROPPED',
      deletedAt: null,
      statusChangedAt: { gte: start, lte: end },
      student: { companyId: COMPANY_ID, deletedAt: null },
    },
    _count: { _all: true },
  });
  const reasonIds = byReason.map((r) => r.departureReasonId).filter((v): v is string => !!v);
  const reasonNames = await prisma.studentExitReason.findMany({
    where: { id: { in: reasonIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(reasonNames.map((r) => [r.id, r.name]));
  console.log('\n=== Reasons ===');
  for (const r of byReason.sort((a, b) => b._count._all - a._count._all)) {
    const name = r.departureReasonId
      ? nameById.get(r.departureReasonId) ?? 'Noma\'lum'
      : "Sababi ko'rsatilmagan";
    console.log(`  ${r._count._all.toString().padStart(3)}  ${name}`);
  }

  // Per-branch breakdown
  const perBranch = await prisma.enrollment.findMany({
    where: {
      status: 'DROPPED',
      deletedAt: null,
      statusChangedAt: { gte: start, lte: end },
      student: { companyId: COMPANY_ID, deletedAt: null },
    },
    select: {
      group: { select: { branch: { select: { id: true, name: true } } } },
    },
  });
  const branchCounts = new Map<string, number>();
  for (const e of perBranch) {
    const key = e.group?.branch?.name ?? 'Unknown';
    branchCounts.set(key, (branchCounts.get(key) ?? 0) + 1);
  }
  console.log('\n=== Per-branch ===');
  for (const [name, count] of Array.from(branchCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}  ${name}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
