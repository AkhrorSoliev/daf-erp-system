/**
 * seed-demo-payment-card — FAQAT DEV BAZA UCHUN.
 *
 * O'quvchi #10460 (Javohirbek Hamraliyev) ning PRODdagi haqiqiy ledgerini
 * dev bazada aynan tiklaydi, shunda «Bu pul nimaga ketdi» kartasini
 * localhostda bir xil raqamlar bilan ko'rish mumkin.
 *
 * Idempotent: qayta yugurtirilsa avvalgi demo o'quvchini tozalab qayta quradi.
 *
 *   npx ts-node --transpile-only scripts/seed-demo-payment-card.ts
 */
import { PrismaClient, TransactionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const PROD_HOST = 'ep-orange-bonus';
const DEMO_PHONE = '900000460';
const PER_LESSON = 33333;

/** [sana, tur, summa, dars sanalari?] — PRODdagi zanjirning aynan o'zi. */
const LEDGER: Array<{
  at: string;
  kind: 'PAYMENT' | 'DEDUCTION';
  amount: number;
  lessons?: string[];
}> = [
  { at: '2026-05-07T09:35', kind: 'PAYMENT', amount: 400000 },
  {
    at: '2026-05-16T11:04',
    kind: 'DEDUCTION',
    amount: -400000,
    lessons: [
      '2026-05-07', '2026-05-09', '2026-05-12', '2026-05-14',
      '2026-05-16', '2026-05-19', '2026-05-21', '2026-05-23',
      '2026-05-26', '2026-05-28', '2026-05-30', '2026-06-02',
    ],
  },
  { at: '2026-06-06T11:31', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-04'] },
  { at: '2026-06-09T11:26', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-06'] },
  { at: '2026-06-11T11:40', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-09'] },
  { at: '2026-06-13T11:32', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-11'] },
  { at: '2026-06-16T10:52', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-13'] },
  { at: '2026-06-18T11:21', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-16'] },
  { at: '2026-06-20T12:09', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-18'] },
  { at: '2026-06-25T03:54', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-06-20'] },
  { at: '2026-06-25T09:56', kind: 'PAYMENT', amount: 400000 },
  {
    at: '2026-06-25T11:16',
    kind: 'DEDUCTION',
    amount: -133332,
    lessons: ['2026-06-23', '2026-06-25', '2026-06-27', '2026-06-30'],
  },
  { at: '2026-07-07T10:51', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-04'] },
  { at: '2026-07-09T10:39', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-07'] },
  { at: '2026-07-11T11:28', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-09'] },
  { at: '2026-07-14T11:24', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-11'] },
  { at: '2026-07-16T10:42', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-14'] },
  { at: '2026-07-16T12:01', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-16'] },
  { at: '2026-07-18T11:28', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-07-18'] },
  { at: '2026-07-21T09:18', kind: 'PAYMENT', amount: 400000 },
  {
    at: '2026-07-21T10:27',
    kind: 'DEDUCTION',
    amount: -166665,
    lessons: ['2026-07-21', '2026-07-23', '2026-07-25', '2026-07-28', '2026-07-30'],
  },
  { at: '2026-08-04T11:31', kind: 'DEDUCTION', amount: -33333, lessons: ['2026-08-04'] },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes(PROD_HOST)) {
    throw new Error('BU SKRIPT PRODDA ISHLAMAYDI — faqat dev baza uchun.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const group = await prisma.group.findFirst({
    where: { deletedAt: null, statusEnum: 'ACTIVE' },
    select: { id: true, name: true, companyId: true, branchId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!group) throw new Error('Dev bazada faol guruh topilmadi');

  // Idempotentlik — avvalgi demoni tozalaymiz.
  const prev = await prisma.student.findFirst({
    where: { phone: DEMO_PHONE },
    select: { id: true },
  });
  if (prev) {
    await prisma.transaction.deleteMany({ where: { studentId: prev.id } });
    await prisma.payment.deleteMany({ where: { studentId: prev.id } });
    await prisma.attendance.deleteMany({ where: { studentId: prev.id } });
    await prisma.enrollment.deleteMany({ where: { studentId: prev.id } });
    await prisma.studentBranch.deleteMany({ where: { studentId: prev.id } });
    await prisma.student.delete({ where: { id: prev.id } });
    console.log(`Avvalgi demo o'quvchi #${prev.id} tozalandi`);
  }

  const student = await prisma.student.create({
    data: {
      firstName: 'Javohirbek',
      lastName: 'Hamraliyev (DEMO)',
      phone: DEMO_PHONE,
      status: 'ACTIVE',
      balance: 0,
      companyId: group.companyId,
      branches: { create: [{ branchId: group.branchId }] },
    },
    select: { id: true },
  });

  const enrollment = await prisma.enrollment.create({
    data: {
      studentId: student.id,
      groupId: group.id,
      status: 'ACTIVE',
      startDate: new Date('2026-05-01T00:00:00Z'),
      prepaidLessonsRemaining: 0,
    },
    select: { id: true },
  });

  // Har dars sanasi uchun bitta davomat — kartadagi sana oralig'i shundan.
  const attByDate = new Map<string, string>();
  for (const row of LEDGER) {
    for (const d of row.lessons ?? []) {
      if (attByDate.has(d)) continue;
      const a = await prisma.attendance.create({
        data: {
          groupId: group.id,
          studentId: student.id,
          date: new Date(`${d}T00:00:00Z`),
          status: 'PRESENT',
          companyId: group.companyId,
        },
        select: { id: true },
      });
      attByDate.set(d, a.id);
    }
  }

  let balance = 0;
  for (const row of LEDGER) {
    const createdAt = new Date(`${row.at}:00Z`);
    const balanceBefore = balance;
    balance += row.amount;

    if (row.kind === 'PAYMENT') {
      const payment = await prisma.payment.create({
        data: {
          studentId: student.id,
          amount: row.amount,
          method: 'CASH',
          status: 'COMPLETED',
          source: 'ADMIN_MANUAL',
          companyId: group.companyId,
          branchId: group.branchId,
          createdAt,
        },
        select: { id: true },
      });
      await prisma.transaction.create({
        data: {
          type: TransactionType.PAYMENT,
          amount: row.amount,
          balanceBefore,
          balanceAfter: balance,
          studentId: student.id,
          paymentId: payment.id,
          companyId: group.companyId,
          branchId: group.branchId,
          description: "To'lov qabul qilindi",
          createdAt,
        },
      });
      continue;
    }

    const lessons = row.lessons ?? [];
    const mode =
      lessons.length >= 12
        ? 'FULL_CYCLE'
        : Math.abs(row.amount) > Math.max(0, balanceBefore)
          ? 'SINGLE_UNCOVERED'
          : 'PARTIAL';

    await prisma.transaction.create({
      data: {
        type: TransactionType.LESSON_DEDUCTION,
        amount: row.amount,
        balanceBefore,
        balanceAfter: balance,
        studentId: student.id,
        enrollmentId: enrollment.id,
        companyId: group.companyId,
        branchId: group.branchId,
        description: 'Darslar uchun yechildi',
        metadata: {
          mode,
          perLessonCost: PER_LESSON,
          lessonsCovered: lessons.length,
        },
        createdAt,
      },
    });

    // Har dars uchun 0 so'mlik iste'mol — sana oralig'ini shu beradi.
    for (const d of lessons) {
      await prisma.transaction.create({
        data: {
          type: TransactionType.LESSON_CONSUMPTION,
          amount: 0,
          balanceBefore: balance,
          balanceAfter: balance,
          studentId: student.id,
          enrollmentId: enrollment.id,
          attendanceId: attByDate.get(d),
          companyId: group.companyId,
          branchId: group.branchId,
          description: 'Dars ishlatildi',
          metadata: { perLessonCost: PER_LESSON },
          createdAt: new Date(`${row.at}:01Z`),
        },
      });
    }
  }

  await prisma.student.update({
    where: { id: student.id },
    data: { balance },
  });

  console.log(`\n✓ Demo o'quvchi tayyor: #${student.id}`);
  console.log(`  guruh: ${group.name}`);
  console.log(`  balans: ${balance.toLocaleString('ru-RU')} so'm (kutilgan: -33 325)`);
  console.log(`\n  http://localhost:3000/students/profile/${student.id}?tab=tolovlar\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
