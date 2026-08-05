/**
 * LOCAL ONLY — fills `DailyFinancialSnapshot` with plausible fake days so the
 * expectation chart can be reviewed before a single real day has been written.
 *
 * The chart is worth looking at before it ships, and it needs a month of
 * history to look like anything. Rather than wait a month, this seeds one.
 *
 * REFUSES TO RUN against production. The guard is the `RAILWAY_*` environment
 * (present under `railway run`, absent locally) plus an explicit
 * `--i-know-this-is-not-prod` flag. Deleting real snapshot rows would destroy
 * the one record in this system that cannot be rebuilt.
 *
 * Usage:
 *   cd server && npx ts-node scripts/seed-dummy-snapshots.ts --i-know-this-is-not-prod
 *   cd server && npx ts-node scripts/seed-dummy-snapshots.ts --clean   # o'chirish
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const SEED_TAG = 'dummy-snapshots';
const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

function assertNotProduction() {
  const railway = Object.keys(process.env).filter((k) =>
    k.startsWith('RAILWAY_'),
  );
  if (railway.length > 0) {
    console.error(
      `❌ Railway muhiti aniqlandi (${railway.slice(0, 3).join(', ')}…).\n` +
        '   Bu skript faqat lokal dev bazasi uchun. Prod suratlarini o\'chirish —\n' +
        '   tizimdagi qayta tiklab bo\'lmaydigan yagona yozuvni yo\'qotish demakdir.',
    );
    process.exit(1);
  }
  if (!process.argv.includes('--i-know-this-is-not-prod')) {
    console.error(
      "❌ Tasdiq bayrog'i yo'q.\n" +
        '   npx ts-node scripts/seed-dummy-snapshots.ts --i-know-this-is-not-prod',
    );
    process.exit(1);
  }
}

async function main() {
  const clean = process.argv.includes('--clean');
  if (!clean) assertNotProduction();

  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  });
  if (!company) throw new Error('no company');
  const branches = await prisma.branch.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });

  const now = new Date(Date.now() + 5 * 60 * 60 * 1000); // Tashkent
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const today = now.getUTCDate();

  // Two months: the previous one in full (so the chart can be judged on a
  // complete shape) and the current one up to today (so it matches reality).
  const months = [
    { y: m === 1 ? y - 1 : y, m: m === 1 ? 12 : m - 1, upTo: 0 },
    { y, m, upTo: today },
  ];
  const rangeStart = new Date(Date.UTC(months[0].y, months[0].m - 1, 1));
  const rangeEnd = new Date(Date.UTC(y, m, 1));

  if (clean) {
    const del = await prisma.dailyFinancialSnapshot.deleteMany({
      where: { companyId: company.id, date: { gte: rangeStart, lt: rangeEnd } },
    });
    const logs = await prisma.enrollmentStateLog.deleteMany({
      where: { reason: SEED_TAG },
    });
    const hist = await prisma.entityHistory.deleteMany({
      where: { newValues: { path: ['__seed'], equals: SEED_TAG } },
    });
    console.log(
      `${del.count} ta surat, ${logs.count} ta enrollment log, ${hist.count} ta tarix qatori o'chirildi.`,
    );
    return;
  }

  // The curve is built FROM events rather than smoothed, so every visible step
  // has a matching row in the tables the chart reads its explanations from.
  // Days not listed drift by a hair — below the chart's 0.3% marker threshold.
  const FULL_MONTH = 156_000_000;
  const EVENTS: {
    day: number;
    impact: number;
    joined?: number;
    left?: number;
    groupStopped?: boolean;
    holiday?: boolean;
  }[] = [
    { day: 4, impact: +1_900_000, joined: 4 },
    { day: 12, impact: -3_400_000, left: 6, groupStopped: true },
    { day: 19, impact: -2_100_000, holiday: true },
    { day: 24, impact: +1_200_000, joined: 3 },
  ];

  const rows: any[] = [];
  const eventRows: {
    date: Date;
    joined: number;
    left: number;
    groupStopped: boolean;
    holiday: boolean;
  }[] = [];

  for (const spec of months) {
    const lastDay = new Date(Date.UTC(spec.y, spec.m, 0)).getUTCDate();
    const upTo = spec.upTo === 0 ? lastDay : Math.min(spec.upTo, lastDay);
    let expected = FULL_MONTH;

    for (let day = 1; day <= upTo; day++) {
      const progress = day / lastDay;
      const ev = EVENTS.find((e) => e.day === day);
      // A slow bleed plus the day's event — the bleed keeps the line from
      // looking like a staircase of flats.
      expected -= Math.round(FULL_MONTH * 0.0004);
      if (ev) {
        expected += ev.impact;
        eventRows.push({
          date: new Date(Date.UTC(spec.y, spec.m - 1, day, 9, 0, 0)),
          joined: ev.joined ?? 0,
          left: ev.left ?? 0,
          groupStopped: !!ev.groupStopped,
          holiday: !!ev.holiday,
        });
      }
      const held = Math.round(expected * progress);
      const collected = Math.round(held * (0.62 + 0.2 * progress));
      const date = new Date(Date.UTC(spec.y, spec.m - 1, day));

      for (const branchId of [null, ...branches.map((b) => b.id)] as (
        | number
        | null
      )[]) {
        const share = branchId === null ? 1 : 1 / Math.max(1, branches.length);
        rows.push({
          companyId: company.id,
          branchId,
          date,
          totalDebt: Math.round(28_000_000 * share * (1 - 0.1 * progress)),
          debtorCount: Math.round(208 * share),
          activeStudents: Math.round(404 * share),
          mtdIncome: Math.round(collected * share * 1.18),
          expectedValue: Math.round(expected * share),
          lessonsHeldValue: Math.round(held * share),
          collectedForMonth: Math.round(collected * share),
        });
      }
    }
  }

  await prisma.dailyFinancialSnapshot.deleteMany({
    where: { companyId: company.id, date: { gte: rangeStart, lt: rangeEnd } },
  });
  for (const r of rows) {
    await prisma.dailyFinancialSnapshot.create({ data: r });
  }

  // Matching event rows, so the chart's "Nima bo'ldi" list is populated from
  // the SAME tables production reads — not from a parallel fake source.
  await prisma.enrollmentStateLog.deleteMany({ where: { reason: SEED_TAG } });
  await prisma.entityHistory.deleteMany({
    where: { newValues: { path: ['__seed'], equals: SEED_TAG } },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { deletedAt: null, group: { companyId: company.id } },
    select: { id: true },
    take: 40,
  });
  const anyGroup = await prisma.group.findFirst({
    where: { companyId: company.id },
    select: { id: true },
  });

  let cursor = 0;
  for (const ev of eventRows) {
    for (let i = 0; i < ev.joined; i++) {
      const e = enrollments[cursor++ % Math.max(1, enrollments.length)];
      if (!e) break;
      await prisma.enrollmentStateLog.create({
        data: {
          enrollmentId: e.id,
          status: 'ACTIVE',
          transitionAt: ev.date,
          reason: SEED_TAG,
        },
      });
    }
    for (let i = 0; i < ev.left; i++) {
      const e = enrollments[cursor++ % Math.max(1, enrollments.length)];
      if (!e) break;
      await prisma.enrollmentStateLog.create({
        data: {
          enrollmentId: e.id,
          status: 'DROPPED',
          transitionAt: ev.date,
          reason: SEED_TAG,
        },
      });
    }
    if (ev.groupStopped && anyGroup) {
      await prisma.entityHistory.create({
        data: {
          entityType: 'Group',
          entityId: anyGroup.id,
          action: 'STATUS_CHANGE',
          companyId: company.id,
          createdAt: ev.date,
          newValues: { statusEnum: 'PAUSED', __seed: SEED_TAG },
        },
      });
    }
    if (ev.holiday) {
      await prisma.entityHistory.create({
        data: {
          entityType: 'Holiday',
          entityId: 'dummy-holiday',
          action: 'CREATE',
          companyId: company.id,
          createdAt: ev.date,
          newValues: { name: 'Sinov bayrami', __seed: SEED_TAG },
        },
      });
    }
  }

  const monthLabels = months
    .map((s2) => `${s2.y}-${String(s2.m).padStart(2, '0')}`)
    .join(', ');
  console.log(`\n${company.name} — ${monthLabels}`);
  console.log(
    `${rows.length} ta soxta qator yozildi (${branches.length + 1} qamrov: kompaniya + ${branches.length} filial)\n`,
  );
  const companyRows = rows.filter((x) => x.branchId === null);
  console.log('  Sana        Kutilayotgan      O\'tilgan          Yig\'ilgan');
  console.log('  ──────────  ────────────────  ────────────────  ────────────────');
  for (const r of companyRows.filter(
    (_, i) => i % 5 === 0 || i === companyRows.length - 1,
  )) {
    console.log(
      `  ${r.date.toISOString().slice(0, 10)}  ${fmt(r.expectedValue).padStart(16)}  ` +
        `${fmt(r.lessonsHeldValue).padStart(16)}  ${fmt(r.collectedForMonth).padStart(16)}`,
    );
  }
  console.log(
    "\n  Tozalash:  npx ts-node scripts/seed-dummy-snapshots.ts --clean\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
