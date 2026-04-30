import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const id = Number(process.argv[2]);
  if (!id) {
    console.error('Usage: npx ts-node scripts/check-student-refund-eligibility.ts <studentId>');
    process.exit(1);
  }

  console.log(`DB host: ${new URL(process.env.DATABASE_URL ?? '').host}\n`);

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      balance: true,
      companyId: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  if (!student) {
    console.log(`Student #${id} NOT FOUND.`);
    return;
  }

  console.log('=== STUDENT ===');
  console.log(JSON.stringify(student, null, 2));

  console.log('\n=== ENROLLMENTS ===');
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: id },
    select: {
      id: true,
      groupId: true,
      status: true,
      prepaidLessonsRemaining: true,
      group: { select: { id: true, name: true, status: true, courseId: true } },
    },
    orderBy: { id: 'desc' },
  });
  console.log(JSON.stringify(enrollments, null, 2));

  console.log('\n=== ALL CONTRACTS (any status, any deletedAt) ===');
  const contracts = await prisma.contract.findMany({
    where: { studentId: id },
    select: {
      id: true,
      contractNumber: true,
      status: true,
      totalAmount: true,
      paidAmount: true,
      groupId: true,
      courseId: true,
      companyId: true,
      startDate: true,
      deletedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(JSON.stringify(contracts, null, 2));

  console.log('\n=== ACTIVE-CONTRACT QUERY (mirrors refunds-eligibility.service.ts) ===');
  const activeContract = await prisma.contract.findFirst({
    where: {
      studentId: id,
      companyId: student.companyId,
      deletedAt: null,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, contractNumber: true, status: true },
  });
  console.log(activeContract ?? 'NULL — bu sabab "O\'quvchida faol shartnoma yo\'q" xatoligi chiqadi');

  console.log('\n=== RECENT PAYMENTS ===');
  const payments = await prisma.payment.findMany({
    where: { studentId: id },
    select: {
      id: true,
      contractId: true,
      amount: true,
      method: true,
      status: true,
      source: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(JSON.stringify(payments, null, 2));

  console.log('\n=== TRANSACTIONS (all types) ===');
  const txs = await prisma.transaction.findMany({
    where: { studentId: id },
    select: {
      id: true,
      type: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      contractId: true,
      reversedAt: true,
      reversedTransactionId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(JSON.stringify(txs, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
