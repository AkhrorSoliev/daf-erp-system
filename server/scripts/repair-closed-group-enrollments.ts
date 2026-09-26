/**
 * One-off: close the enrollments left FROZEN in groups that were cancelled or
 * completed before closing a group closed them. Logic and tests:
 * `scripts/lib/closed-group-enrollment-repair.ts`.
 *
 * Dry run (default, read-only) — counts only, never an id or a name:
 *   cd server && railway run npx ts-node scripts/repair-closed-group-enrollments.ts
 *
 * Apply (writes; only once the fix that closes FROZEN enrollments with their
 * group is deployed, so no new ones appear, and after the dry run has been
 * reviewed):
 *   cd server && railway run npx ts-node scripts/repair-closed-group-enrollments.ts --apply --ha-men-tasdiqlayman
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntityHistoryService } from '../src/common/entity-history';
import { printHeader } from './lib/check-cli';
import {
  applyClose,
  findStrandedEnrollments,
  splitForRepair,
  summarize,
} from './lib/closed-group-enrollment-repair';

function printSummary(label: string, summary: ReturnType<typeof summarize>) {
  console.log(
    `${label}: ${summary.enrollments} ta yozilish, ${summary.students} ta o'quvchi, ${summary.groups} ta guruh`,
  );
  console.log(`  guruh holati: ${JSON.stringify(summary.byGroupStatus)}`);
  console.log(`  guruh yopilgan oy: ${JSON.stringify(summary.byCloseMonth)}`);
  console.log(
    `  guruh yopilgandan keyin o'zgargan (o'sha o'zgarish vaqtida yopiladi): ${summary.closingAfterGroupClosed}`,
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--ha-men-tasdiqlayman')) {
    console.error(
      "--apply yolg'iz ishlamaydi: muzlatilgan o'quvchilar yopilgan guruhdan chiqariladi.\n" +
        "Avval quruq ishga tushirib sonlarni ko'rib chiqing, keyin:\n" +
        '  npx ts-node scripts/repair-closed-group-enrollments.ts --apply --ha-men-tasdiqlayman',
    );
    process.exit(1);
  }

  const prisma = new PrismaService();
  try {
    printHeader(
      `Yopilgan guruhda muzlatilgan qolgan yozilishlar — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );

    const { toClose, withMoney, undatedGroup } = splitForRepair(
      await findStrandedEnrollments(prisma),
    );
    printSummary(
      'Yopiladi (DROPPED, guruh yopilgan vaqtga)',
      summarize(toClose),
    );
    printSummary("Pul bog'langan — tegilmaydi, qo'lda", summarize(withMoney));
    printSummary(
      "Guruh yopilgan sana yo'q — tegilmaydi, qo'lda",
      summarize(undatedGroup),
    );

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

    const left = splitForRepair(await findStrandedEnrollments(prisma));
    console.log(
      `Qoldi: yopilmagan ${left.toClose.length}, pul bog'langan ${left.withMoney.length}, sanasiz ${left.undatedGroup.length}.`,
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
