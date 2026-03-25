import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Company
  const company = await prisma.company.upsert({
    where: { id: 1001 },
    update: {},
    create: { id: 1001, name: 'DaF Sprachzentrum' },
  });
  console.log('Company:', company.name);

  // 2. Branches
  const branches = [
    { id: 1001, name: "Farg'ona", companyId: 1001 },
    { id: 1002, name: 'Namangan', companyId: 1001 },
    { id: 1003, name: 'Qarshi', companyId: 1001 },
  ];
  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      update: {},
      create: branch,
    });
    console.log('Branch:', branch.name);
  }

  // 3. Roles
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

  // 4. Users
  const password = await bcrypt.hash('123456', 10);

  const users = [
    {
      id: 1001,
      name: 'Abdulloh Karimov',
      login: 'ceo',
      phone: '901234567',
      companyId: 1001,
      mainBranch: 1001,
      roleIds: [1],
      branchIds: [1001, 1002, 1003],
    },
    {
      id: 1002,
      name: 'Sardor Aliyev',
      login: 'admin',
      phone: '901234568',
      companyId: 1001,
      mainBranch: 1001,
      roleIds: [3],
      branchIds: [1001],
    },
    {
      id: 1003,
      name: 'Dilshod Rahimov',
      login: 'teacher',
      phone: '901234569',
      companyId: 1001,
      mainBranch: 1002,
      roleIds: [4],
      branchIds: [1002],
    },
  ];

  for (const u of users) {
    const exists = await prisma.user.findUnique({ where: { id: u.id } });
    if (!exists) {
      await prisma.user.create({
        data: {
          id: u.id,
          name: u.name,
          login: u.login,
          password,
          phone: u.phone,
          companyId: u.companyId,
          mainBranch: u.mainBranch,
          roles: { create: u.roleIds.map((roleId) => ({ roleId })) },
          branches: { create: u.branchIds.map((branchId) => ({ branchId })) },
        },
      });
      console.log(`User: ${u.name} (login: ${u.login})`);
    } else {
      console.log(`User: ${u.name} — already exists`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
