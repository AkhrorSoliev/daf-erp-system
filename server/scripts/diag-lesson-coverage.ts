/**
 * READ-ONLY diagnostic for audit P3 (H1): what would an honest "yig'im %" be?
 *
 * Compares three candidate denominators for the collection ratio, per month:
 *
 *   A) CURRENT (Telegram)  = MTD cash in  ÷ recognizedRevenueForecast
 *                            — the `exactDays × 4` forecast; can exceed 100%.
 *   B) CASH ÷ RECOGNIZED   = period cash  ÷ value of lessons held AND paid
 *                            — the audit's section-3 proposal (mixed basis).
 *   C) LESSON COVERAGE     = value of lessons held AND paid
 *                            ÷ value of ALL billable lessons held
 *                            — pure accrual, structurally <= 100%.
 *
 * "Billable" mirrors the biller: PRESENT / LATE / ABSENT (EXCUSED never bills).
 * A lesson counts as PAID when it carries a live LESSON_CONSUMPTION row.
 * Unpaid lessons are priced the way the biller would have priced them:
 * contract per-lesson if any, else course.price / lessonPaymentCount with the
 * student's discountPercent applied.
 *
 * Usage:  railway run npx ts-node scripts/diag-lesson-coverage.ts [YYYY-MM ...]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const TZ = 5 * 60 * 60 * 1000;

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

async function monthReport(companyId: number, monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  // Attendance.date is @db.Date -> unshifted UTC date bounds, upper exclusive.
  const startDate = new Date(Date.UTC(y, m - 1, 1));
  const endDateExcl = new Date(Date.UTC(y, m, 1));
  // Payment.createdAt is a real timestamp -> Tashkent-shifted instants.
  const startTs = new Date(Date.UTC(y, m - 1, 1) - TZ);
  const endTsExcl = new Date(Date.UTC(y, m, 1) - TZ);

  const atts = await prisma.attendance.findMany({
    where: {
      companyId,
      status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
      date: { gte: startDate, lt: endDateExcl },
    },
    select: {
      id: true,
      studentId: true,
      student: { select: { discountPercent: true } },
      group: {
        select: {
          id: true,
          course: { select: { price: true, lessonPaymentCount: true } },
          contracts: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { studentId: true, totalAmount: true },
          },
        },
      },
    },
  });

  const attIds = atts.map((a) => a.id);
  const consByAtt = new Map<string, number>();
  for (let i = 0; i < attIds.length; i += 1000) {
    const cons = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'LESSON_CONSUMPTION',
        reversedAt: null,
        attendanceId: { in: attIds.slice(i, i + 1000) },
      },
      select: { attendanceId: true, metadata: true },
    });
    for (const c of cons) {
      if (c.attendanceId == null) continue;
      const meta = c.metadata as { perLessonCost?: number } | null;
      consByAtt.set(c.attendanceId, meta?.perLessonCost ?? -1);
    }
  }

  // What the biller would charge for this lesson (used for unpaid lessons and
  // as the fallback for legacy consumption rows with no metadata).
  const listPrice = (a: (typeof atts)[number]) => {
    const lpc = a.group.course.lessonPaymentCount || 12;
    const contract = a.group.contracts.find((c) => c.studentId === a.studentId);
    if (contract) return Math.round(contract.totalAmount / lpc);
    const disc = Math.max(0, Math.min(100, a.student?.discountPercent ?? 0));
    return Math.round((Math.round(a.group.course.price / lpc) * (100 - disc)) / 100);
  };

  let covered = 0;
  let uncovered = 0;
  let coveredCount = 0;
  let uncoveredCount = 0;
  for (const a of atts) {
    const per = consByAtt.get(a.id);
    if (per === undefined) {
      uncovered += listPrice(a);
      uncoveredCount++;
    } else {
      covered += per >= 0 ? per : listPrice(a);
      coveredCount++;
    }
  }
  const heldValue = covered + uncovered;

  // Cash actually received in the month (the Telegram/overview "Tushum").
  const cash = await prisma.payment.aggregate({
    where: {
      companyId,
      status: 'COMPLETED',
      createdAt: { gte: startTs, lt: endTsExcl },
    },
    _sum: { amount: true },
  });
  const cashIn = cash._sum.amount ?? 0;

  // The current forecast denominator, reproduced exactly (exactDays * 4).
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      group: { deletedAt: null, statusEnum: 'ACTIVE', companyId },
    },
    select: {
      studentId: true,
      student: { select: { discountPercent: true } },
      group: {
        select: {
          exactDays: true,
          course: { select: { price: true, lessonPaymentCount: true } },
          contracts: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { studentId: true, totalAmount: true },
          },
        },
      },
    },
  });
  const forecast = enrollments.reduce((sum, e) => {
    const lpc = e.group.course.lessonPaymentCount || 12;
    const lessonsPerMonth = (e.group.exactDays?.length ?? 0) * 4;
    const contract = e.group.contracts.find((c) => c.studentId === e.studentId);
    let per: number;
    if (contract) per = Math.round(contract.totalAmount / lpc);
    else {
      const disc = Math.max(0, Math.min(100, e.student?.discountPercent ?? 0));
      per = Math.round((Math.round(e.group.course.price / lpc) * (100 - disc)) / 100);
    }
    return sum + per * lessonsPerMonth;
  }, 0);

  console.log(`\n══════════ ${monthKey} ══════════`);
  console.log(`Billable davomat        : ${fmt(atts.length)} ta  (${fmt(coveredCount)} to'langan / ${fmt(uncoveredCount)} to'lanmagan)`);
  console.log(`O'tilgan darslar qiymati: ${fmt(heldValue)}`);
  console.log(`  shundan qoplangan     : ${fmt(covered)}`);
  console.log(`  shundan qoplanmagan   : ${fmt(uncovered)}`);
  console.log(`Kassa tushumi (oy)      : ${fmt(cashIn)}`);
  console.log(`Prognoz (exactDays x 4) : ${fmt(forecast)}`);
  console.log('');
  console.log(`  A) HOZIRGI  kassa / prognoz          = ${pct(cashIn, forecast)}`);
  console.log(`  B) kassa / qoplangan darslar         = ${pct(cashIn, covered)}`);
  console.log(`  C) qoplangan / o'tilgan darslar      = ${pct(covered, heldValue)}   <-- <= 100% kafolatlangan`);
}

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('no company');
  console.log(`Company: ${company.name} (#${company.id})`);

  const args = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  const now = new Date(Date.now() + TZ);
  const months = args.length
    ? args
    : [
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        `${now.getUTCFullYear()}-${String(now.getUTCMonth()).padStart(2, '0')}`,
      ];

  for (const mk of months) await monthReport(company.id, mk);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
