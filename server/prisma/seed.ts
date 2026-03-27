import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 0. Bazani to'liq tozalash
  console.log('🗑️  Bazani tozalash...');
  await prisma.enrollment.deleteMany();
  await prisma.group.deleteMany();
  await prisma.room.deleteMany();
  await prisma.userBranch.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.course.deleteMany();
  await prisma.role.deleteMany();
  await prisma.company.deleteMany();
  console.log('✅ Baza tozalandi\n');

  // 1. Rollar
  const roles = [
    { id: 1, name: 'CEO' },
    { id: 2, name: 'Branch Director' },
    { id: 3, name: 'Administrator' },
    { id: 4, name: 'Teacher' },
    { id: 5, name: 'Cashier' },
  ];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {},
      create: role,
    });
    console.log('Role:', role.name);
  }

  // 2. Company
  const company = await prisma.company.create({
    data: { id: 1001, name: 'DaF Sprachzentrum' },
  });
  console.log('\nCompany:', company.name);

  // 3. CEO user (branchsiz — to'liq nazorat)
  const password = await bcrypt.hash('123456', 10);
  const ceo = await prisma.user.create({
    data: {
      name: 'CEO Admin',
      login: 'ceo',
      password,
      companyId: company.id,
      roles: { create: [{ roleId: 1 }] },
    },
  });
  console.log(`\nCEO: login=ceo, parol=123456 (id: ${ceo.id})`);

  // Sequence larni to'g'rilash
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), (SELECT MAX(id) FROM "User"))`,
  );
  console.log('\n✅ Tayyor! CEO login bilan kiring va filiallar qo\'shing.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
