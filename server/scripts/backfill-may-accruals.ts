/**
 * STEP 2 of the May 2026 salary backfill — write the missing accruals.
 *
 * Prerequisite: run backfill-may-salary-configs.ts --apply first, so a config
 * version covers May (otherwise createAccrual finds no rate and returns null).
 *
 * For every lesson-based teacher, walks their live groups' May PRESENT/LATE
 * attendances that are COVERED (active LESSON_DEDUCTION, not salaryDeferred)
 * and have NO existing non-reversed accrual — exactly the "owed now" set from
 * may-salary-reconcile.ts — and delegates to `SalaryAccrualService.createAccrual`
 * (the same code path live attendance uses). createAccrual:
 *   - finds the now-backdated version → writes the accrual at the parent rate,
 *   - mirrors the amount into User.balance via a SALARY_ACCRUAL transaction,
 *   - does NOT carry over (May payments are CALCULATED, not APPROVED/PAID),
 *   - is idempotent (upsert by unique key + balance-mirror guard).
 *
 * After this, run `POST /salary/calculate { asOfDate: "2026-05-15" }` (STEP 3)
 * to sweep the accruals into per-teacher May SalaryPayment rows.
 *
 * Side effect: each teacher's User.balance rises by their May earnings (same as
 * live accrual). Review the per-teacher amount the dry-run prints before
 * applying. No notifications fire (runs outside the event flow).
 *
 * The service is instantiated directly on a raw PrismaClient (no NestFactory),
 * so Redis/Telegram are never bootstrapped. Accruals are written in small
 * per-batch transactions (BATCH lessons each) to stay well under the
 * interactive-transaction timeout when run from a laptop against Neon.
 *
 * Mutates nothing unless `--apply` is passed.
 *   railway run npx ts-node scripts/backfill-may-accruals.ts            # dry-run
 *   railway run npx ts-node scripts/backfill-may-accruals.ts --apply    # commit
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
dotenv.config({ quiet: true } as any);

const APPLY = process.argv.includes('--apply');
const COMPANY = 1001;
const MAY1 = new Date('2026-05-01T00:00:00.000Z');
const JUN1 = new Date('2026-06-01T00:00:00.000Z');
const BATCH = 10; // lessons per transaction — keeps each tx well under timeout
// Departed teacher who taught some May lessons in groups since reassigned to
// other teachers. His lessons are credited to HIM separately
// (backfill-dostonbek-may.ts), so exclude them here to avoid crediting the
// current group teacher for lessons they didn't teach.
const DOSTONBEK = 10004;
const f = (n: number) => n.toLocaleString('en-US');

class DryRunAbort extends Error {
  constructor() {
    super('DRY_RUN_ABORT');
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
// createAccrual only depends on the Prisma client surface — instantiate the
// service directly (no Nest DI, no Redis/Telegram bootstrap).
const accrualService = new SalaryAccrualService(prisma as any);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  console.log(`Mode: ${APPLY ? 'APPLY (commit)' : 'DRY RUN (rolls back)'}\n`);

  // 1) lesson-based teachers (skip FIXED_MONTHLY).
  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { companyId: COMPANY, isActive: true },
    select: { userId: true, salaryType: true },
  });
  const teacherIds = [
    ...new Set(
      configs.filter((c) => c.salaryType !== 'FIXED_MONTHLY').map((c) => c.userId),
    ),
  ];

  // 2) teacher → live (non-deleted) groups.
  const gts = await prisma.groupTeacher.findMany({
    where: { teacherId: { in: teacherIds } },
    select: { teacherId: true, groupId: true },
  });
  const groups = await prisma.group.findMany({
    where: { id: { in: [...new Set(gts.map((g) => g.groupId))] } },
    select: { id: true, deletedAt: true },
  });
  const liveGroup = new Set(groups.filter((g) => !g.deletedAt).map((g) => g.id));
  const teacherGroups = new Map<number, string[]>();
  for (const gt of gts) {
    if (!liveGroup.has(gt.groupId)) continue;
    const arr = teacherGroups.get(gt.teacherId) ?? [];
    arr.push(gt.groupId);
    teacherGroups.set(gt.teacherId, arr);
  }
  const liveGroupIds = [...new Set([...teacherGroups.values()].flat())];

  // 3) May PRESENT/LATE attendances in those groups.
  const atts = await prisma.attendance.findMany({
    where: {
      groupId: { in: liveGroupIds },
      status: { in: ['PRESENT', 'LATE'] },
      date: { gte: MAY1, lt: JUN1 },
    },
    select: { id: true, studentId: true, groupId: true, date: true, markedById: true },
  });
  const attIds = atts.map((a) => a.id);

  // 4) active LESSON_DEDUCTION per attendance (coverage + perLessonCost + id).
  const dedByAtt = new Map<
    string,
    { txId: string; perLessonCost: number; deferred: boolean }
  >();
  for (let i = 0; i < attIds.length; i += 1000) {
    const chunkIds = attIds.slice(i, i + 1000);
    const deds = await prisma.transaction.findMany({
      where: {
        attendanceId: { in: chunkIds },
        type: 'LESSON_DEDUCTION',
        reversedAt: null,
      },
      select: { id: true, attendanceId: true, metadata: true },
    });
    for (const t of deds) {
      const md = (t.metadata ?? {}) as Record<string, unknown>;
      dedByAtt.set(t.attendanceId!, {
        txId: t.id,
        perLessonCost: Number(md.perLessonCost ?? 0),
        deferred: md.salaryDeferred === true,
      });
    }
  }

  // 5) existing non-reversed accruals → skip set "attId:teacherId".
  const accSet = new Set<string>();
  for (let i = 0; i < attIds.length; i += 1000) {
    const chunkIds = attIds.slice(i, i + 1000);
    const accs = await prisma.salaryAccrual.findMany({
      where: {
        attendanceId: { in: chunkIds },
        userId: { in: teacherIds },
        reversedAt: null,
      },
      select: { attendanceId: true, userId: true },
    });
    for (const a of accs) accSet.add(`${a.attendanceId}:${a.userId}`);
  }

  const attsByGroup = new Map<string, typeof atts>();
  for (const a of atts) {
    const arr = attsByGroup.get(a.groupId) ?? [];
    arr.push(a);
    attsByGroup.set(a.groupId, arr as any);
  }

  let grandLessons = 0;
  let grandAmount = 0;

  for (const teacherId of teacherIds) {
    const gids = teacherGroups.get(teacherId) ?? [];
    const candidates: {
      studentId: number;
      groupId: string;
      attendanceId: string;
      lessonDate: Date;
      perLessonCost: number;
      deductionTransactionId: string;
    }[] = [];

    for (const gid of gids) {
      for (const a of attsByGroup.get(gid) ?? []) {
        if (a.markedById === DOSTONBEK) continue; // belongs to departed teacher
        const ded = dedByAtt.get(a.id);
        if (!ded || ded.deferred) continue; // B.1 / debtor-deferred
        if (accSet.has(`${a.id}:${teacherId}`)) continue; // already accrued
        candidates.push({
          studentId: a.studentId,
          groupId: gid,
          attendanceId: a.id,
          lessonDate: a.date,
          perLessonCost: ded.perLessonCost,
          deductionTransactionId: ded.txId,
        });
      }
    }
    if (candidates.length === 0) continue;

    const who = await prisma.user.findUnique({
      where: { id: teacherId },
      select: { firstName: true, lastName: true },
    });

    let written = 0;
    let amount = 0;
    let nulls = 0;
    let failed = 0;

    for (const batch of chunk(candidates, BATCH)) {
      // Retry transient Neon drops ("Connection terminated unexpectedly") up to
      // 4 attempts. createAccrual is idempotent (upsert + balance-mirror guard)
      // so retrying a rolled-back batch is safe. Batch-local counters reset each
      // attempt so a retried batch never double-counts.
      let attempt = 0;
      for (;;) {
        let bw = 0;
        let bamt = 0;
        let bn = 0;
        try {
          await prisma.$transaction(
            async (tx) => {
              bw = 0;
              bamt = 0;
              bn = 0;
              for (const c of batch) {
                const accrual = await accrualService.createAccrual({
                  teacherId,
                  studentId: c.studentId,
                  groupId: c.groupId,
                  attendanceId: c.attendanceId,
                  lessonDate: c.lessonDate,
                  perLessonCost: c.perLessonCost,
                  companyId: COMPANY,
                  deductionTransactionId: c.deductionTransactionId,
                  tx,
                });
                if (accrual) {
                  bw++;
                  bamt += accrual.amount;
                } else {
                  bn++;
                }
              }
              if (!APPLY) throw new DryRunAbort();
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              maxWait: 20000,
              timeout: 120000,
            },
          );
          written += bw;
          amount += bamt;
          nulls += bn;
          break;
        } catch (e) {
          if (e instanceof DryRunAbort) {
            written += bw;
            amount += bamt;
            nulls += bn;
            break;
          }
          if (++attempt < 4) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            continue;
          }
          failed += batch.length;
          console.error(
            `   batch error after ${attempt} retries (${who?.firstName} ${who?.lastName}): ${e instanceof Error ? e.message : String(e)}`,
          );
          break;
        }
      }
    }

    console.log(
      `#${teacherId} ${who?.firstName} ${who?.lastName}: ${written} accrual(s), amount ${f(amount)}` +
        (nulls ? `, ${nulls} null (no version/coverage!)` : '') +
        (failed ? `, ${failed} FAILED` : ''),
    );
    grandLessons += written;
    grandAmount += amount;
  }

  console.log(
    `\n${APPLY ? 'Wrote' : 'Would write'}: ${grandLessons} accrual(s), total ${f(grandAmount)} so'm`,
  );
  console.log(
    'Cross-check vs may-salary-reconcile.ts "OWED NOW — PRESENT/LATE covered (net)" = 22,616,753.',
  );
  if (!APPLY) console.log('Re-run with --apply to commit.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
