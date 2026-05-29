import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEFAULT_GROUP_REMOVAL_REASONS = [
  { name: "O'qishni tashladi", appliesTo: ['GROUP_REMOVAL', 'EXPEL'] as const },
  { name: "Boshqa guruhga ko'chdi", appliesTo: ['GROUP_REMOVAL'] as const },
  { name: 'Filial almashdi', appliesTo: ['GROUP_REMOVAL'] as const },
  { name: 'Kursni tugatdi', appliesTo: ['GROUP_REMOVAL'] as const },
  { name: 'Boshqa sabab', appliesTo: ['GROUP_REMOVAL', 'FREEZE', 'EXPEL', 'INACTIVE', 'ARCHIVE'] as const },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🔍 DRY RUN — hech narsa yozilmaydi\n' : '✏️  YOZISH rejimi\n');

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });
  console.log(`${companies.length} ta company topildi.\n`);

  for (const company of companies) {
    console.log(`── Company #${company.id} (${company.name}) ──`);

    const existing = await prisma.studentExitReason.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((r) => r.name));

    for (const reason of DEFAULT_GROUP_REMOVAL_REASONS) {
      if (existingNames.has(reason.name)) {
        console.log(`  ⏩ ${reason.name} — allaqachon bor, o'tkazildi`);
        continue;
      }

      if (dryRun) {
        console.log(`  ➕ ${reason.name} — qo'shilar edi (appliesTo: ${reason.appliesTo.join(', ')})`);
        continue;
      }

      await prisma.studentExitReason.create({
        data: {
          name: reason.name,
          appliesTo: [...reason.appliesTo],
          companyId: company.id,
        },
      });
      console.log(`  ✅ ${reason.name} — qo'shildi`);
    }
    console.log('');
  }

  console.log(dryRun ? '\n🔍 DRY RUN tugadi — yozilmadi' : '\n✅ Tugadi');
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
