/**
 * set-tg-group-branch — allaqachon TASDIQLANGAN Telegram guruhiga filial belgilaydi.
 *
 * NEGA: `approve-tg-group.ts` faqat PENDING guruhni tasdiqlaydi va APPROVED
 * bo'lganini rad etadi. Filialsiz (branchId = null) APPROVED guruh esa broadcast
 * filtrida `OR: [{ branchId }, { branchId: null }]` sababli HAR QANDAY filialning
 * hodisasini oladi (audit P71) — ikkinchi filial ochilgach bu ma'lumot oqishiga
 * aylanadi.
 *
 * Usage (server/ ichidan):
 *   railway run npx ts-node scripts/set-tg-group-branch.ts                          # ro'yxat
 *   railway run npx ts-node scripts/set-tg-group-branch.ts --all-null-to 1 --dry-run
 *   railway run npx ts-node scripts/set-tg-group-branch.ts --all-null-to 1
 *   railway run npx ts-node scripts/set-tg-group-branch.ts --set <groupId> <branchId>
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

async function listGroups() {
  const groups = await prisma.telegramGroup.findMany({
    where: { deletedAt: null },
    orderBy: { title: 'asc' },
    select: { id: true, title: true, status: true, companyId: true, branchId: true } as any,
  });
  console.log('\n=== Telegram guruhlari ===');
  console.table(
    groups.map((g: any) => ({
      id: g.id,
      title: String(g.title).slice(0, 34),
      status: g.status,
      companyId: g.companyId ?? '—',
      branchId: g.branchId ?? '❌ NULL',
    })),
  );
}

async function assertBranch(branchId: number, companyId: number | null) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });
  if (!branch) throw new Error(`Filial #${branchId} topilmadi`);
  if (companyId != null && branch.companyId !== companyId) {
    throw new Error(
      `Filial #${branchId} boshqa kompaniyaga tegishli (${branch.companyId} ≠ ${companyId})`,
    );
  }
  return branch;
}

async function main() {
  console.log(`DB host: ${new URL(connectionString!).host}`);
  console.log(`RAILWAY: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local .env)'}`);

  const allIdx = argv.indexOf('--all-null-to');
  const setIdx = argv.indexOf('--set');

  if (allIdx === -1 && setIdx === -1) {
    await listGroups();
    console.log('\nBelgilash uchun:');
    console.log('  --all-null-to <branchId> [--dry-run]   filialsiz hamma guruhga');
    console.log('  --set <groupId> <branchId>             bitta guruhga\n');
    return;
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  if (allIdx !== -1) {
    const branchId = Number(argv[allIdx + 1]);
    if (!Number.isInteger(branchId)) throw new Error('--all-null-to <branchId> talab qilinadi');

    const targets = await prisma.telegramGroup.findMany({
      where: { deletedAt: null, branchId: null } as any,
      select: { id: true, title: true, status: true, companyId: true } as any,
    });
    if (!targets.length) {
      console.log('Filialsiz guruh yo\'q — hech narsa qilinmadi.');
      return;
    }
    for (const g of targets as any[]) {
      const branch = await assertBranch(branchId, g.companyId ?? null);
      console.log(
        `  "${g.title}" [${g.status}] → filial #${branch.id} ${branch.name} ${DRY_RUN ? '(yoziladi)' : 'YOZILDI'}`,
      );
      if (!DRY_RUN) {
        await prisma.telegramGroup.update({ where: { id: g.id }, data: { branchId } as any });
      }
    }
    console.log(`\n${DRY_RUN ? 'Yangilanadi' : 'Yangilandi'}: ${targets.length} ta`);
    return;
  }

  const groupId = argv[setIdx + 1];
  const branchId = Number(argv[setIdx + 2]);
  if (!groupId || !Number.isInteger(branchId)) {
    throw new Error('--set <groupId> <branchId> talab qilinadi');
  }
  const group = await prisma.telegramGroup.findFirst({
    where: { id: groupId, deletedAt: null },
    select: { id: true, title: true, companyId: true, branchId: true } as any,
  });
  if (!group) throw new Error(`Guruh ${groupId} topilmadi`);
  const branch = await assertBranch(branchId, (group as any).companyId ?? null);
  console.log(
    `  "${(group as any).title}" ${(group as any).branchId ?? 'NULL'} → filial #${branch.id} ${branch.name} ${DRY_RUN ? '(yoziladi)' : 'YOZILDI'}`,
  );
  if (!DRY_RUN) {
    await prisma.telegramGroup.update({ where: { id: groupId }, data: { branchId } as any });
  }
}

main()
  .catch((e) => {
    console.error('XATO:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
