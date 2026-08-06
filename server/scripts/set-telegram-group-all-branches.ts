/**
 * One-off: declare which approved Telegram groups watch EVERY branch.
 *
 * `TelegramGroup.branchId = NULL` used to carry two meanings — "nobody assigned
 * this yet" and "this is the org-wide monitoring chat". Closing the leak that
 * sent one branch's payments and attendance into another branch's chat made the
 * two indistinguishable, and the org-wide groups went silent for operational
 * events (they still receive the 21:00 report and announcements, which do not
 * go through the branch filter).
 *
 * `receivesAllBranches` separates them. Which groups get it is a decision about
 * real chats with real people in them, so it is made HERE and named group by
 * group — not inferred in the migration from `branchId IS NULL`, which is
 * precisely the predicate that cannot tell the two cases apart.
 *
 *   npx ts-node scripts/set-telegram-group-all-branches.ts               # dry run
 *   npx ts-node scripts/set-telegram-group-all-branches.ts --apply
 *   npx ts-node scripts/set-telegram-group-all-branches.ts --apply --off "<title>"
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Named, not matched by a rule. A title is a human's label for a human's chat;
 * "every approved group with no branch" would sweep in a group that is simply
 * waiting to be assigned, which is the mistake this whole field exists to stop
 * being invisible.
 */
const WATCH_ALL_BRANCHES = [
  'DaF Sprachzentrum Organisation',
  'Sotuv bo\'limi-DaF Sprachzentrum',
];

async function main() {
  const apply = process.argv.includes('--apply');
  const offIdx = process.argv.indexOf('--off');
  const turnOff = offIdx !== -1 ? process.argv[offIdx + 1] : null;

  const groups = await prisma.telegramGroup.findMany({
    where: { status: 'APPROVED', deletedAt: null },
    select: {
      id: true,
      title: true,
      chatId: true,
      branchId: true,
      receivesAllBranches: true,
      branch: { select: { name: true } },
    },
    orderBy: { addedAt: 'asc' },
  });

  console.log(`Tasdiqlangan guruhlar (${groups.length} ta):\n`);
  for (const g of groups) {
    const scope = g.receivesAllBranches
      ? 'BARCHA FILIALLAR'
      : g.branch
        ? `filial: ${g.branch.name}`
        : 'BELGILANMAGAN (operatsion xabar olmaydi)';
    console.log(`  ${g.title}\n    ${scope}   chat ${g.chatId}`);
  }

  const targets = turnOff
    ? groups.filter((g) => g.title === turnOff && g.receivesAllBranches)
    : groups.filter(
        (g) => WATCH_ALL_BRANCHES.includes(g.title) && !g.receivesAllBranches,
      );

  console.log(
    `\n${turnOff ? 'O\'chiriladigan' : 'Belgilanadigan'}: ${targets.length} ta`,
  );
  for (const t of targets) console.log(`  • ${t.title}`);

  const missing = turnOff
    ? []
    : WATCH_ALL_BRANCHES.filter((t) => !groups.some((g) => g.title === t));
  if (missing.length) {
    console.log(
      `\nOGOHLANTIRISH — bu nomlar tasdiqlangan guruhlar ichida topilmadi:`,
    );
    for (const m of missing) console.log(`  • ${m}`);
    console.log('  (nomi o\'zgargan bo\'lishi mumkin — yuqoridagi ro\'yxatga solishtiring)');
  }

  if (!apply) {
    console.log('\nDRY RUN — hech narsa yozilmadi. Qo\'llash: --apply');
    return;
  }
  if (targets.length === 0) {
    console.log('\nO\'zgartirish kerak bo\'lgan guruh yo\'q.');
    return;
  }

  const result = await prisma.telegramGroup.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { receivesAllBranches: !turnOff },
  });
  console.log(`\n${result.count} ta guruh yangilandi.`);

  const after = await prisma.telegramGroup.findMany({
    where: { status: 'APPROVED', deletedAt: null },
    select: { title: true, branchId: true, receivesAllBranches: true },
  });
  const silent = after.filter((g) => g.branchId == null && !g.receivesAllBranches);
  console.log(
    `Tekshiruv — operatsion xabar olmaydigan guruhlar: ${silent.length} ta` +
      (silent.length ? ` (${silent.map((g) => g.title).join(', ')})` : ''),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
