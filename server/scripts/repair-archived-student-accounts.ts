/**
 * ADR-0033 one-off: close the sign-in accounts of archived cards, give the
 * students those accounts crowded out their own number as login, and open an
 * account for every live card without one. Logic and tests:
 * `scripts/lib/archived-student-account-repair.ts`.
 *
 * Dry run (default, read-only) — counts and ids, never a phone or a password:
 *   cd server && railway run npx ts-node scripts/repair-archived-student-accounts.ts
 *
 * Apply (writes; only after the CEO has seen the dry run and said yes):
 *   cd server && railway run npx ts-node scripts/repair-archived-student-accounts.ts --apply --ha-men-tasdiqlayman
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntityHistoryService } from '../src/common/entity-history';
import { printHeader } from './lib/check-cli';
import {
  applyClose,
  applyLogin,
  applyOpen,
  findAccountsToClose,
  findCardsOnClosedAccount,
  findCardsWithoutAccount,
  findLoginsToFill,
} from './lib/archived-student-account-repair';

const list = (ids: Array<number | null>) =>
  ids.map((id) => (id === null ? 'kartasiz' : `#${id}`)).join(', ') || '—';

async function runAll<T>(
  plans: T[],
  apply: (plan: T) => Promise<'applied' | 'skipped'>,
): Promise<{ applied: number; skipped: T[] }> {
  let applied = 0;
  const skipped: T[] = [];
  for (const plan of plans) {
    if ((await apply(plan)) === 'applied') applied++;
    else skipped.push(plan);
  }
  return { applied, skipped };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--ha-men-tasdiqlayman')) {
    console.error(
      "--apply yolg'iz ishlamaydi: o'quvchilarning kirish hisoblari yopiladi va ochiladi.\n" +
        "Avval quruq ishga tushirib, sonlarni CEO bilan ko'rib chiqing, keyin:\n" +
        '  npx ts-node scripts/repair-archived-student-accounts.ts --apply --ha-men-tasdiqlayman',
    );
    process.exit(1);
  }

  const prisma = new PrismaService();
  try {
    printHeader(
      `O'quvchi kirish hisobi kartaga ergashadi (ADR-0033) — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );

    const toClose = await findAccountsToClose(prisma);
    const closing = toClose.map((p) => p.accountId);
    const toFill = await findLoginsToFill(prisma, closing);
    const toOpen = await findCardsWithoutAccount(prisma, closing);
    const stranded = await findCardsOnClosedAccount(prisma);

    console.log(`1. Yopiladigan hisoblar: ${toClose.length}`);
    console.log(`   kartalari: ${list(toClose.map((p) => p.studentId))}`);
    console.log(
      `2. Kirish nomi karta raqamiga o'tadigan o'quvchilar: ${toFill.length}`,
    );
    console.log(`   ${list(toFill.map((p) => p.studentId))}`);
    console.log(`3. Hisob ochiladigan o'quvchilar: ${toOpen.length}`);
    console.log(
      `   kirish nomi = raqam: ${list(toOpen.filter((p) => p.loginIsPhone).map((p) => p.studentId))}`,
    );
    console.log(
      `   kirish nomi bo'sh:   ${list(toOpen.filter((p) => !p.loginIsPhone).map((p) => p.studentId))}`,
    );
    console.log(
      `Yopiq hisobga bog'langan tirik karta (tegilmaydi): ${list(stranded)}`,
    );

    if (!apply) {
      console.log('\nDRY RUN — bazaga hech narsa yozilmadi.');
      return;
    }

    const history = new EntityHistoryService(prisma, new EventEmitter2());

    const closed = await runAll(toClose, (p) => applyClose(prisma, history, p));
    console.log(
      `\n1. Yopildi: ${closed.applied}. O'tkazildi: ${list(closed.skipped.map((p) => p.studentId))}`,
    );

    // Re-planned against the database as it is now: step 1 freed the numbers.
    const filled = await runAll(await findLoginsToFill(prisma), (p) =>
      applyLogin(prisma, history, p),
    );
    console.log(
      `2. Kirish nomi yozildi: ${filled.applied}. O'tkazildi: ${list(filled.skipped.map((p) => p.studentId))}`,
    );

    const opened = await runAll(await findCardsWithoutAccount(prisma), (p) =>
      applyOpen(prisma, history, p),
    );
    console.log(
      `3. Hisob ochildi: ${opened.applied}. O'tkazildi: ${list(opened.skipped.map((p) => p.studentId))}`,
    );

    const [leftClose, leftFill, leftOpen] = await Promise.all([
      findAccountsToClose(prisma),
      findLoginsToFill(prisma),
      findCardsWithoutAccount(prisma),
    ]);
    console.log(
      `\nQoldi: yopilmagan ${leftClose.length}, kirish nomisiz ${leftFill.length}, hisobsiz ${leftOpen.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Importing this file (a test, another script) must not run it.
if (require.main === module) {
  main().catch((error) => {
    console.error('FAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
