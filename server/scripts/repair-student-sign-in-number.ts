/**
 * ADR-0032 one-off: bring every live student's sign-in account to the number
 * on their card. Logic and tests: `scripts/lib/student-sign-in-repair.ts`.
 *
 * Dry run (default, read-only) — counts and student ids, never phone numbers:
 *   cd server && railway run npx ts-node scripts/repair-student-sign-in-number.ts
 *
 * Apply (writes; only after the CEO has seen the dry run and said yes):
 *   cd server && railway run npx ts-node scripts/repair-student-sign-in-number.ts --apply --ha-men-tasdiqlayman
 *
 * Idempotent: an account already on its card's number is not a candidate, and
 * a row whose card or account changed after planning is skipped, so a second
 * run only picks up what the first left behind.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntityHistoryService } from '../src/common/entity-history';
import { printHeader } from './lib/check-cli';
import {
  applyRepair,
  chainedPlans,
  findDriftedStudents,
  planRepairs,
  type RepairPlan,
} from './lib/student-sign-in-repair';

const ids = (plans: RepairPlan[]) =>
  plans.map((p) => p.studentId).join(', ') || '—';

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--ha-men-tasdiqlayman')) {
    console.error(
      "--apply yolg'iz ishlamaydi: o'quvchilarning kirish raqami qayta yoziladi.\n" +
        "Avval quruq ishga tushirib, sonlarni CEO bilan ko'rib chiqing, keyin:\n" +
        '  npx ts-node scripts/repair-student-sign-in-number.ts --apply --ha-men-tasdiqlayman',
    );
    process.exit(1);
  }

  const prisma = new PrismaService();
  try {
    printHeader(
      `Kirish raqami kartadagi raqamga (ADR-0032) — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );

    const plans = await planRepairs(prisma, await findDriftedStudents(prisma));
    const cleared = plans.filter((p) => p.loginHolderId !== null);
    const chained = chainedPlans(plans);

    console.log(
      `Kirish raqami kartadan farq qiladigan o'quvchilar: ${plans.length}`,
    );
    console.log(
      `  - kirish nomi ham karta raqamiga o'tadi:  ${plans.length - cleared.length}`,
    );
    console.log(
      `  - kirish nomi bo'sh qoladi (raqam band):   ${cleared.length}`,
    );
    for (const p of cleared) {
      console.log(
        `      o'quvchi #${p.studentId} — raqamni hisob #${p.loginHolderId} band qilgan`,
      );
    }
    console.log(
      `  - bir-biriga bog'liq (tartibga qaram):     ${chained.length} [${ids(chained)}]`,
    );
    console.log(`O'quvchilar: ${ids(plans)}`);

    if (!apply) {
      console.log('\nDRY RUN — bazaga hech narsa yozilmadi.');
      return;
    }
    if (chained.length > 0) {
      console.error(
        "\nTO'XTATILDI: bir-biriga bog'liq qatorlar bor — natija tartibga bog'liq bo'lardi. Qo'lda ko'rib chiqing.",
      );
      process.exitCode = 1;
      return;
    }

    const history = new EntityHistoryService(prisma, new EventEmitter2());
    let applied = 0;
    const skipped: RepairPlan[] = [];
    for (const plan of plans) {
      if ((await applyRepair(prisma, history, plan)) === 'applied') applied++;
      else skipped.push(plan);
    }

    const left = await findDriftedStudents(prisma);
    console.log(
      `\nYozildi: ${applied}. O'tkazib yuborildi: ${skipped.length} [${ids(skipped)}]`,
    );
    console.log(`Hozir ham farq qiladi: ${left.length}`);
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
