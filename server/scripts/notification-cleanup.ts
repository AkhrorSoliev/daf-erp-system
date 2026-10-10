/**
 * One-off (spec 2026-10-07 §8). Before the phase-5 bell no alert ever closed,
 * so some accounts held 450–780 unread rows. Run once, right after the deploy
 * that applies the migration `20261010120000_notification_action_state`:
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/notification-cleanup.ts [--apply]
 *
 * It closes (`resolvedAt`) the action rows whose job was already done — closed
 * tasks, lessons with a register / an answer / a cancellation / a move, overdue
 * promises whose debt is cleared — then resolves every other action row older
 * than 7 days (only a `TASK_*` row whose task is still open keeps waiting) and
 * marks unread rows older than 7 days read. Nothing is deleted. Without
 * `--apply` it is a dry run on a read-only connection (checked, else it stops)
 * that prints what each step would write; with it, all steps run in one
 * transaction. Both end with the ten largest badges. A repeat run finds
 * nothing left to do.
 */
import { printHeader, printTable, run, section } from './lib/check-cli';
import { BADGE_TOP, cleanupSteps } from './lib/notification-cleanup';

const APPLY = process.argv.includes('--apply');

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

// check-cli has already loaded .env; its makePrisma() reads the variable later.
if (!APPLY && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL);
}

run(async (prisma) => {
  printHeader(`Notification cleanup (${APPLY ? 'APPLY' : 'dry run'})`);
  if (!APPLY) {
    const [ro] = await prisma.$queryRaw<
      { default_transaction_read_only: string }[]
    >`SHOW default_transaction_read_only`;
    if (ro?.default_transaction_read_only !== 'on') {
      throw new Error('Read-only connection was not established — stopping');
    }
  }

  const steps = cleanupSteps(new Date());
  section(APPLY ? 'Yozildi' : 'Yoziladi (sinov)');
  const rows: (string | number)[][] = [];
  if (APPLY) {
    await prisma.$transaction(
      async (tx) => {
        for (const step of steps) {
          rows.push([step.name, await tx.$executeRaw(step.apply)]);
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  } else {
    for (const step of steps) {
      const [r] = await prisma.$queryRaw<{ n: number }[]>(step.count);
      rows.push([step.name, r?.n ?? 0]);
    }
  }
  printTable(['Qadam', 'Qatorlar'], rows, ['l', 'r']);

  section("Eng katta raqamlar (qo'ng'iroqcha)");
  const top =
    await prisma.$queryRaw<{ userId: number; n: number }[]>(BADGE_TOP);
  printTable(
    ['Xodim', 'Raqam'],
    top.map((t) => [t.userId, t.n]),
    ['r', 'r'],
  );
});
