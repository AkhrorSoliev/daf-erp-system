/**
 * Cleanup invalid photo URLs from the database.
 *
 * Nulls out Student.photo, User.photo values that are not valid http(s) URLs.
 * These are typically blob: URLs saved by a broken edit form — they point to
 * an object in the browser's memory and become invalid on page reload.
 *
 * Safe to re-run — only touches rows with invalid URLs.
 *
 * Usage (from server/ directory):
 *   npx ts-node scripts/cleanup-invalid-photos.ts --dry-run   # preview
 *   npx ts-node scripts/cleanup-invalid-photos.ts             # apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

function isInvalidPhoto(photo: string | null): boolean {
  if (!photo) return false;
  return !/^https?:\/\//i.test(photo);
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  const students = await prisma.student.findMany({
    where: { photo: { not: null } },
    select: { id: true, firstName: true, lastName: true, photo: true },
  });
  const invalidStudents = students.filter((s) => isInvalidPhoto(s.photo));

  const users = await prisma.user.findMany({
    where: { photo: { not: null } },
    select: { id: true, firstName: true, lastName: true, photo: true },
  });
  const invalidUsers = users.filter((u) => isInvalidPhoto(u.photo));

  console.log(
    `Found ${invalidStudents.length} student(s) with invalid photo URLs`,
  );
  for (const s of invalidStudents) {
    const preview = (s.photo ?? '').slice(0, 60);
    console.log(`  Student #${s.id} ${s.firstName} ${s.lastName}: ${preview}`);
  }

  console.log(`Found ${invalidUsers.length} user(s) with invalid photo URLs`);
  for (const u of invalidUsers) {
    const preview = (u.photo ?? '').slice(0, 60);
    console.log(`  User #${u.id} ${u.firstName} ${u.lastName}: ${preview}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — no changes written.');
    return;
  }

  if (invalidStudents.length > 0) {
    await prisma.student.updateMany({
      where: { id: { in: invalidStudents.map((s) => s.id) } },
      data: { photo: null },
    });
    console.log(`Nulled ${invalidStudents.length} student photo(s).`);
  }

  if (invalidUsers.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: invalidUsers.map((u) => u.id) } },
      data: { photo: null },
    });
    console.log(`Nulled ${invalidUsers.length} user photo(s).`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
