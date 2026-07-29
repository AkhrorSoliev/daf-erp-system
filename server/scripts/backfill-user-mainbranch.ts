/**
 * backfill-user-mainbranch — mainBranch NULL bo'lgan xodimlarga yagona UserBranch
 * filialini yozadi.
 *
 * NEGA: `resolveMonthlyScope` va `batchPay` mainBranch NULL bo'lganda fail-OPEN
 * ishlaydi — filtr butunlay tushib qoladi va bir filial direktori IKKALA filial
 * oyligini ko'radi/to'laydi (audit P24/P96). Yagona filialga biriktirilgan xodim
 * uchun mainBranch deterministik tiklanadi.
 *
 * QOIDALAR:
 *   - CEO roli TASHLAB KETILADI — CEO ataylab barcha filiallarga kiradi va
 *     mainBranch NULL bo'lishi normal holat.
 *   - Faqat AYNAN BITTA UserBranch qatori bo'lgan xodim yangilanadi.
 *     0 ta yoki >1 ta bo'lsa — qo'lda hal qilinadi (hisobotda ko'rsatiladi).
 *
 * Usage (server/ ichidan):
 *   railway run npx ts-node scripts/backfill-user-mainbranch.ts --dry-run
 *   railway run npx ts-node scripts/backfill-user-mainbranch.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL yo'q");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DRY_RUN = process.argv.includes('--dry-run');
const STAFF_ROLES = ['CEO', 'Branch Director', 'Administrator', 'Teacher', 'Cashier'];

async function main() {
  console.log(`DB host: ${new URL(connectionString!).host}`);
  console.log(`RAILWAY: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? '(local .env)'}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      mainBranch: null,
      roles: { some: { role: { name: { in: STAFF_ROLES } } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      roles: { select: { role: { select: { name: true } } } },
      branches: { select: { branchId: true } },
    },
    orderBy: { id: 'asc' },
  });

  let updated = 0;
  const skipped: string[] = [];

  for (const u of candidates) {
    const name = `${u.firstName} ${u.lastName}`.trim();
    const roles = u.roles.map((r) => r.role.name);
    const branchIds = u.branches.map((b) => b.branchId);

    if (roles.includes('CEO')) {
      skipped.push(`  #${u.id} ${name} — CEO, ataylab tashlab ketildi`);
      continue;
    }
    if (branchIds.length !== 1) {
      skipped.push(
        `  #${u.id} ${name} — ${branchIds.length} ta filial (${branchIds.join(',') || "yo'q"}), qo'lda hal qilinsin`,
      );
      continue;
    }

    const branchId = branchIds[0];
    console.log(
      `  #${u.id} ${name} [${roles.join(',')}] ${u.status} — mainBranch = ${branchId} ${DRY_RUN ? '(yoziladi)' : 'YOZILDI'}`,
    );
    if (!DRY_RUN) {
      await prisma.user.update({ where: { id: u.id }, data: { mainBranch: branchId } });
    }
    updated++;
  }

  if (skipped.length) {
    console.log('\nTashlab ketilganlar:');
    skipped.forEach((s) => console.log(s));
  }

  console.log(`\n${DRY_RUN ? 'Yangilanadi' : 'Yangilandi'}: ${updated} ta, tashlab ketildi: ${skipped.length} ta`);
}

main()
  .catch((e) => {
    console.error('XATO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
