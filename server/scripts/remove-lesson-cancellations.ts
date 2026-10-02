/**
 * Delete lesson cancellations made by mistake, through the same
 * `LessonCancellationsService.remove` the group page calls (ADR-0063): the
 * monthly money each one gave back is taken back, and «Dars bo'ldimi?» is
 * asked again — a new task for the branch's administrators.
 *
 * Written for 01.10.2026: a CEO in Farg'ona read «guruh mavjud emas» for eight
 * Namangan groups and cancelled their lessons (1 667 518 so'm to 58 students).
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/remove-lesson-cancellations.ts \
 *     --ids=<cancellation id,…> --as=<approving CEO user id> \
 *     [--apply --expect=<N>]
 *
 * Without `--apply` the connection is read-only and the take-back rule runs on
 * a recorder: it prints, per cancellation, who would be charged how much, who
 * keeps the money and who gets the new task. `--apply` needs `--expect`, the
 * number of live cancellations the dry run listed.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { MonthlyChargeService } from '../src/billing/monthly-charge.service';
import { LessonBillingService } from '../src/billing/lesson-billing.service';
import { SettingsService } from '../src/settings/settings.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
import { EntityHistoryService } from '../src/common/entity-history/entity-history.service';
import { LessonCancellationsService } from '../src/lesson-cancellations/lesson-cancellations.service';
import { restoreCancelledLesson } from '../src/billing/cancelled-lesson-release';
import { lessonTaskAssigneeIds } from '../src/unmarked-lessons/lesson-task';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const APPLY = args.includes('--apply');
const IDS = (arg('ids') ?? '').split(',').filter(Boolean);
const AS = Number(arg('as'));
const EXPECT = arg('expect') === undefined ? null : Number(arg('expect'));

const fmt = (n: number) => n.toLocaleString('ru-RU');

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

/** The take-back rule with its two writes recorded instead of made. */
async function planRestore(
  prisma: PrismaService,
  cancellationId: string,
  companyId: number,
) {
  const studentOf = new Map<string, number | null>();
  const tx = {
    transaction: {
      findMany: async (q: Prisma.TransactionFindManyArgs) => {
        const rows = await prisma.transaction.findMany({
          ...q,
          select: { ...q.select, studentId: true },
        });
        for (const r of rows) studentOf.set(r.id, r.studentId);
        return rows;
      },
    },
    enrollmentMonthlyCharge: {
      findUnique: (q: Prisma.EnrollmentMonthlyChargeFindUniqueArgs) =>
        prisma.enrollmentMonthlyCharge.findUnique(q),
      update: () => Promise.resolve({}),
    },
    enrollmentStateLog: {
      findFirst: (q: Prisma.EnrollmentStateLogFindFirstArgs) =>
        prisma.enrollmentStateLog.findFirst(q),
    },
  };
  const charged: { studentId: number | null; txId: string }[] = [];
  const writes = {
    reverseTransaction: (txId: string) => {
      charged.push({ studentId: studentOf.get(txId) ?? null, txId });
      return Promise.resolve({});
    },
  };
  const result = await restoreCancelledLesson(tx as never, writes as never, {
    cancellationId,
    companyId,
    reason: 'dry run',
  });
  return { result, charged };
}

async function main() {
  if (IDS.length === 0 || !AS) {
    throw new Error(
      'Usage: --ids=<cancellation id,…> --as=<CEO user id> [--apply --expect=<N>]',
    );
  }
  if (APPLY && EXPECT === null) {
    throw new Error('--apply needs --expect=<N> from the dry run');
  }
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL!);
  const prisma = new PrismaService();
  // remove()'s 15 s budget is sized for Railway, next to the database. From a
  // laptop each query takes ~200 ms, and a 13-student cancellation runs ~130
  // of them. Same transaction, same Serializable isolation, more time.
  const runTransaction = prisma.$transaction.bind(prisma) as (
    ...a: unknown[]
  ) => Promise<unknown>;
  (prisma as unknown as { $transaction: unknown }).$transaction = (
    fn: unknown,
    options?: Record<string, unknown>,
  ) =>
    typeof fn === 'function'
      ? runTransaction(fn, { ...options, maxWait: 30_000, timeout: 120_000 })
      : runTransaction(fn, options);
  if (!APPLY) {
    const [ro] = await prisma.$queryRaw<
      { default_transaction_read_only: string }[]
    >`SHOW default_transaction_read_only`;
    if (ro?.default_transaction_read_only !== 'on') {
      throw new Error('Read-only connection was not established — stopping');
    }
  }

  const caller = await prisma.user.findFirst({
    where: {
      id: AS,
      deletedAt: null,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { firstName: true, lastName: true },
  });
  if (!caller) throw new Error(`#${AS} is not a live CEO`);

  const cancellations = await prisma.lessonCancellation.findMany({
    where: { id: { in: IDS }, deletedAt: null },
    select: {
      id: true,
      date: true,
      reason: true,
      companyId: true,
      group: {
        select: {
          id: true,
          name: true,
          branchId: true,
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  });
  const missing = IDS.filter((id) => !cancellations.some((c) => c.id === id));
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} as ${caller.firstName} ${caller.lastName} (#${AS}) — ` +
      `${cancellations.length} live of ${IDS.length}` +
      (missing.length ? `; not live: ${missing.join(', ')}` : ''),
  );
  if (APPLY && cancellations.length !== EXPECT) {
    throw new Error(
      `Expected ${EXPECT}, found ${cancellations.length} — nothing written`,
    );
  }

  const service = new LessonCancellationsService(
    prisma,
    // remove() never bills attendance.
    {} as LessonBillingService,
    new MonthlyChargeService(
      prisma,
      new TransactionsWriteService(prisma, new CashMovementsService(prisma)),
      {} as SettingsService,
      {} as SalaryAccrualService,
    ),
    new EntityHistoryService(prisma, new EventEmitter2()),
    { emit: () => true } as unknown as EventEmitter2,
  );

  let total = 0;
  for (const c of cancellations) {
    const day = c.date.toISOString().slice(0, 10);
    console.log(
      `\n${c.group.branch.name} · ${c.group.name} · ${day} · «${c.reason}» · ${c.id}`,
    );
    const marked = await prisma.attendance.count({
      where: { groupId: c.group.id, date: c.date },
    });
    const assignees = await prisma.user.findMany({
      where: {
        id: {
          in: await lessonTaskAssigneeIds(
            prisma,
            c.companyId,
            c.group.branchId,
          ),
        },
      },
      select: { id: true, firstName: true },
      orderBy: { id: 'asc' },
    });
    console.log(
      `  attendance rows: ${marked} → ${marked ? 'question NOT re-asked' : 'question re-asked'}; ` +
        `task to: ${assignees.map((u) => `${u.firstName} (#${u.id})`).join(', ')}`,
    );

    if (!APPLY) {
      const { result, charged } = await planRestore(prisma, c.id, c.companyId);
      console.log(
        `  take back: ${result.students} students, ${fmt(result.restored)} so'm; kept: ${result.kept}` +
          (charged.length
            ? `\n  students: ${charged.map((x) => `#${x.studentId}`).join(' ')}`
            : ''),
      );
      total += result.restored;
      continue;
    }
    const res = await service.remove(c.id, c.companyId, AS, ['CEO']);
    console.log(
      `  deleted · taken back ${res.restoredStudents} students, ${fmt(res.restoredAmount)} so'm; kept ${res.keptStudents}`,
    );
    total += res.restoredAmount;
  }
  console.log(
    `\nTotal ${APPLY ? 'taken back' : 'to take back'}: ${fmt(total)} so'm`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
