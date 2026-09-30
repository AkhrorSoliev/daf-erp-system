/**
 * Cancel past lessons that were never held, through the real cancellation
 * path, so monthly payers get those lessons' money back (ADR-0053).
 *
 * A day the centre did not hold is usually a day nobody marked: no
 * attendance, no cancellation, no reschedule — while the monthly charge has
 * already billed it. Cancelling it in the admin panel works too, but it also
 * sends the teacher and the group a Telegram message about a lesson weeks in
 * the past. This script calls the same `LessonCancellationsService.create`
 * with the notification event dropped.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/cancel-unheld-lessons.ts \
 *     --group=<group id or name> --dates=YYYY-MM-DD,YYYY-MM-DD \
 *     --reason="Dars o'tmagan" --as=<approving CEO user id> [--apply]
 *
 * Without `--apply` the connection is read-only: it prints, per day, whether
 * the day can be cancelled and who gets how much. With `--apply` each day is
 * cancelled in its own transaction and the students' balances are printed.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { MonthlyChargeService } from '../src/billing/monthly-charge.service';
import { LessonBillingService } from '../src/billing/lesson-billing.service';
import { SettingsService } from '../src/settings/settings.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
import { EntityHistoryService } from '../src/common/entity-history/entity-history.service';
import { LessonCancellationsService } from '../src/lesson-cancellations/lesson-cancellations.service';
import { cancelledLessonRelease } from '../src/billing/departure-release';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const APPLY = args.includes('--apply');
const GROUP = arg('group') ?? '';
const DATES = (arg('dates') ?? '').split(',').filter(Boolean);
const REASON = arg('reason') ?? '';
const AS = Number(arg('as'));

const fmt = (n: number) => n.toLocaleString('ru-RU');

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

async function main() {
  if (!GROUP || DATES.length === 0 || !REASON.trim() || !AS) {
    throw new Error(
      'Usage: --group=<id|name> --dates=YYYY-MM-DD[,…] --reason="…" --as=<CEO user id> [--apply]',
    );
  }
  if (DATES.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    throw new Error('Dates must be YYYY-MM-DD');
  }
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL!);
  const prisma = new PrismaService();

  const ceo = await prisma.user.findFirst({
    where: {
      id: AS,
      deletedAt: null,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { id: true },
  });
  if (!ceo) throw new Error(`--as=${AS} is not a live CEO account`);

  const groups = await prisma.group.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: GROUP }, { name: GROUP }],
    },
    select: {
      id: true,
      name: true,
      companyId: true,
      branch: { select: { name: true } },
    },
  });
  if (groups.length !== 1) {
    throw new Error(
      `--group=${GROUP} matched ${groups.length} live groups: ${groups
        .map((g) => `${g.id} (${g.branch?.name})`)
        .join(', ')}`,
    );
  }
  const group = groups[0];
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} · ${group.name} · ${group.branch?.name}`,
  );

  const today = new Date().toISOString().slice(0, 10);
  const studentIds = new Set<number>();
  for (const day of DATES) {
    if (day >= today) throw new Error(`${day}: not a past day`);
    const date = new Date(`${day}T00:00:00.000Z`);
    const [cancelled, attendance, charges] = await Promise.all([
      prisma.lessonCancellation.findFirst({
        where: { groupId: group.id, date, deletedAt: null },
        select: { id: true },
      }),
      prisma.attendance.count({ where: { groupId: group.id, date } }),
      prisma.enrollmentMonthlyCharge.findMany({
        where: {
          groupId: group.id,
          status: 'CHARGED',
          coveredDates: { has: day },
        },
        select: {
          studentId: true,
          coveredDates: true,
          frozenOutDates: true,
          perLessonCost: true,
          discountPercent: true,
          chargedAmount: true,
        },
        orderBy: { studentId: 'asc' },
      }),
    ]);
    console.log(`\n${day}`);
    if (cancelled) {
      console.log('  already cancelled — skipped');
      continue;
    }
    if (attendance > 0) {
      // Attendance says the lesson was held; this script is for days that
      // were not. Cancel such a day in the admin panel, knowingly.
      console.log(`  ${attendance} attendance rows exist — skipped`);
      continue;
    }
    let total = 0;
    let paid = 0;
    for (const c of charges) {
      const release = cancelledLessonRelease(c, day);
      if (!release) continue;
      total += release.amount;
      paid += 1;
      studentIds.add(c.studentId);
      console.log(`  #${c.studentId}  +${fmt(release.amount)}`);
    }
    console.log(`  ${paid} students · total +${fmt(total)}`);

    if (!APPLY) continue;
    const history = new EntityHistoryService(prisma, new EventEmitter2());
    const service = new LessonCancellationsService(
      prisma,
      // No attendance on the day, so the per-attendance reversal never runs.
      {} as LessonBillingService,
      new MonthlyChargeService(
        prisma,
        new TransactionsWriteService(prisma, new CashMovementsService(prisma)),
        {} as SettingsService,
        // Only the trial-lesson release reads it (ADR-0048), never a cancellation.
        {} as SalaryAccrualService,
      ),
      history,
      // The notification listener is not wired here: no Telegram message
      // about a lesson weeks in the past.
      { emit: () => true } as unknown as EventEmitter2,
    );
    const row = await service.create(
      { groupId: group.id, date: day, reason: REASON.trim() },
      group.companyId,
      AS,
      ['CEO'],
    );
    console.log(`  cancelled · ${row.id}`);
  }

  if (APPLY && studentIds.size > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: [...studentIds] } },
      select: { id: true, balance: true },
      orderBy: { id: 'asc' },
    });
    console.log('\nBalances now');
    for (const s of students) console.log(`  #${s.id}  ${fmt(s.balance)}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
