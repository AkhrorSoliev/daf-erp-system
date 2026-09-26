/**
 * One-off: close the enrollments left ACTIVE or FROZEN in groups that were
 * deleted before deletion closed them. Logic and tests:
 * `scripts/lib/deleted-group-enrollment-repair.ts`.
 *
 * Dry run (default, read-only) — counts only, never an id or a name:
 *   cd server && railway run npx ts-node scripts/repair-deleted-group-enrollments.ts
 *
 * Apply (writes; only once the fix that closes enrollments on deletion is
 * deployed, so no new ones appear, and after the dry run has been reviewed):
 *   cd server && railway run npx ts-node scripts/repair-deleted-group-enrollments.ts --apply --ha-men-tasdiqlayman
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntityHistoryService } from '../src/common/entity-history';
import { printHeader } from './lib/check-cli';
import {
  applyClose,
  findStrandedEnrollments,
  splitByMoney,
  summarize,
} from './lib/deleted-group-enrollment-repair';

function printSummary(label: string, summary: ReturnType<typeof summarize>) {
  console.log(
    `${label}: ${summary.enrollments} ta yozilish, ${summary.students} ta o'quvchi, ${summary.groups} ta guruh`,
  );
  console.log(`  holati: ${JSON.stringify(summary.byStatus)}`);
  console.log(
    `  guruh o'chirilgan oy: ${JSON.stringify(summary.byDeletionMonth)}`,
  );
  console.log(
    `  guruh o'chirilgandan keyin o'zgargan (o'sha o'zgarish vaqtida yopiladi): ${summary.closingAfterDeletion}`,
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--ha-men-tasdiqlayman')) {
    console.error(
      "--apply yolg'iz ishlamaydi: o'quvchilar o'chirilgan guruhdan chiqariladi.\n" +
        "Avval quruq ishga tushirib sonlarni ko'rib chiqing, keyin:\n" +
        '  npx ts-node scripts/repair-deleted-group-enrollments.ts --apply --ha-men-tasdiqlayman',
    );
    process.exit(1);
  }

  const prisma = new PrismaService();
  try {
    printHeader(
      `O'chirilgan guruhda qolgan yozilishlar — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );

    const { toClose, withMoney } = splitByMoney(
      await findStrandedEnrollments(prisma),
    );
    printSummary(
      "Yopiladi (DROPPED, guruh o'chirilgan vaqtga)",
      summarize(toClose),
    );
    printSummary("Pul bog'langan — tegilmaydi, qo'lda", summarize(withMoney));

    if (!apply) {
      console.log('\nDRY RUN — bazaga hech narsa yozilmadi.');
      return;
    }

    const history = new EntityHistoryService(prisma, new EventEmitter2());
    let applied = 0;
    let skipped = 0;
    for (const row of toClose) {
      if ((await applyClose(prisma, history, row)) === 'applied') applied++;
      else skipped++;
    }
    console.log(`\nYopildi: ${applied}. O'tkazib yuborildi: ${skipped}.`);

    const left = splitByMoney(await findStrandedEnrollments(prisma));
    console.log(
      `Qoldi: yopilmagan ${left.toClose.length}, pul bog'langan ${left.withMoney.length}.`,
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
