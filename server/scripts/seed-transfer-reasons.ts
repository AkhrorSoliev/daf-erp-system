/**
 * Seeds the starter EnrollmentTransferReason list.
 *
 * The table was empty in production, which made every teacher-changing group
 * transfer impossible: both the dialog and
 * StudentEnrollmentService.enroll() require a reason, and there was no UI left
 * to add one (the editor died with the report charts in 05c82f4 / a851829).
 * Sozlamalar → Sabablar now owns this list; this script only puts the first
 * rows in so the block lifts immediately.
 *
 * Idempotent: a name that already exists (including one that was soft
 * deleted) is left untouched.
 *
 * Usage:
 *   railway run --service caring-courage npx tsx scripts/seed-transfer-reasons.ts        # dry run
 *   railway run --service caring-courage npx tsx scripts/seed-transfer-reasons.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const REASONS = [
  'Ustoz almashdi',
  'Jadval mos kelmadi',
  'Daraja mos kelmadi',
  "O'quvchi so'radi",
  'Boshqa sabab',
];

async function main() {
  const apply = process.argv.includes('--apply');

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });
  if (companies.length !== 1) {
    throw new Error(
      `Kutilgani 1 ta kompaniya, topilgani ${companies.length} ta. ` +
        'Skript bir kompaniyali baza uchun yozilgan — qo\'lda tekshiring.',
    );
  }
  const company = companies[0];
  console.log(`Kompaniya: ${company.name} (#${company.id})`);

  const existing = await prisma.enrollmentTransferReason.findMany({
    where: { companyId: company.id },
    select: { name: true, deletedAt: true },
  });
  const existingNames = new Set(existing.map((r) => r.name));
  console.log(
    `Mavjud yozuvlar: ${existing.length} ta ` +
      `(${existing.filter((r) => !r.deletedAt).length} ta faol)`,
  );

  const toCreate = REASONS.filter((name) => !existingNames.has(name));
  if (toCreate.length === 0) {
    console.log("Hammasi allaqachon mavjud — o'zgartirish kerak emas.");
    return;
  }

  console.log(`\nQo'shiladigan ${toCreate.length} ta sabab:`);
  toCreate.forEach((n) => console.log(`  + ${n}`));

  if (!apply) {
    console.log('\nDRY RUN — hech narsa yozilmadi. --apply bilan qayta ishga tushiring.');
    return;
  }

  const result = await prisma.enrollmentTransferReason.createMany({
    data: toCreate.map((name) => ({ name, companyId: company.id })),
  });
  console.log(`\n${result.count} ta sabab yozildi.`);

  const after = await prisma.enrollmentTransferReason.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  console.log('\nHozirgi faol ro\'yxat:');
  after.forEach((r) => console.log(`  ${r.name}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
