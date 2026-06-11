/**
 * Generalized phantom-attendance correction. Flips the given billable
 * attendances (PRESENT/LATE/ABSENT) → EXCUSED through the REAL billing
 * pipeline (LessonBillingService.processAttendanceBilling) so balance,
 * prepaid and salary accruals are reversed correctly, append-only.
 *
 * USE ONLY for confirmed phantoms (student wasn't in the group on those
 * dates — verify via scripts/check-group-running.ts first).
 *
 *   railway run npx ts-node scripts/fix-debt-phantom.ts <studentId> <d1,d2,...>          # dry run
 *   railway run npx ts-node scripts/fix-debt-phantom.ts <studentId> <d1,d2,...> --apply  # execute
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, AttendanceStatus } from '@prisma/client';

import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LessonBillingService } from '../src/billing/lesson-billing.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { TransactionsReadService } from '../src/transactions/transactions-read.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';

@Module({
  imports: [PrismaModule],
  providers: [
    TransactionsWriteService,
    TransactionsReadService,
    TransactionsService,
    SalaryAccrualService,
    LessonBillingService,
  ],
})
class FixModule {}

const STUDENT_ID = Number(process.argv[2]);
const DATES = (process.argv[3] ?? '').split(',').filter(Boolean);
const APPLY = process.argv.includes('--apply');
const BILLABLE: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.ABSENT,
];

function d(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

async function main() {
  if (!STUDENT_ID || !DATES.length) {
    console.error(
      'Usage: fix-debt-phantom.ts <studentId> <d1,d2,...> [--apply]',
    );
    process.exit(1);
  }
  console.log(`DB: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(`Mode: ${APPLY ? '*** APPLY ***' : 'DRY RUN'}`);
  console.log(`Student #${STUDENT_ID} | dates: ${DATES.join(', ')}\n`);

  const app = await NestFactory.createApplicationContext(FixModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const billing = app.get(LessonBillingService);

  try {
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: STUDENT_ID },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        balance: true,
        companyId: true,
      },
    });
    console.log(
      `${student.firstName} ${student.lastName} | balans (oldin): ${student.balance.toLocaleString()}\n`,
    );

    // F-3: capture each attendance's OWN group so the reversal restores the
    // prepaid unit on the right enrollment. Picking the student's first
    // enrollment would corrupt a multi-group student.
    const targets: {
      attendanceId: string;
      lessonDate: Date;
      status: AttendanceStatus;
      groupId: string;
      branchId: number;
    }[] = [];
    for (const ds of DATES) {
      const att = await prisma.attendance.findFirst({
        where: { studentId: STUDENT_ID, date: d(ds) },
        select: {
          id: true,
          date: true,
          status: true,
          groupId: true,
          group: { select: { branchId: true } },
        },
      });
      if (!att) {
        console.log(`  ${ds}: davomat yo'q — skip`);
        continue;
      }
      if (!BILLABLE.includes(att.status)) {
        console.log(`  ${ds}: ${att.status} (billable emas) — skip`);
        continue;
      }
      const dedNet = await prisma.transaction.aggregate({
        where: { attendanceId: att.id, type: 'LESSON_DEDUCTION' },
        _sum: { amount: true },
      });
      targets.push({
        attendanceId: att.id,
        lessonDate: att.date,
        status: att.status,
        groupId: att.groupId,
        branchId: att.group.branchId,
      });
      console.log(
        `  ${ds}: ${att.status} → EXCUSED | guruh ${att.groupId} | net deduction tied: ${(dedNet._sum.amount ?? 0).toLocaleString()}`,
      );
    }

    if (!APPLY) {
      console.log(
        `\n(DRY RUN — ${targets.length} dars qaytariladi. --apply bilan ishga tushiring.)`,
      );
      return;
    }
    if (!targets.length) {
      console.log("\nQaytariladigan dars yo'q.");
      return;
    }

    // F-8: audit whatever actually committed, even if the loop throws part-way
    // — write the EntityHistory in `finally` keyed on the reversed dates only.
    const done: string[] = [];
    try {
      for (const t of targets) {
        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: STUDENT_ID, groupId: t.groupId },
          select: { id: true },
        });
        if (!enrollment) {
          console.log(
            `  ${t.lessonDate.toISOString().slice(0, 10)}: enrollment topilmadi (guruh ${t.groupId}) — skip`,
          );
          continue;
        }
        await prisma.$transaction(
          async (tx) => {
            await tx.attendance.update({
              where: { id: t.attendanceId },
              data: {
                status: AttendanceStatus.EXCUSED,
                note: "Tuzatildi: o'quvchi bu sanada guruhda yo'q edi (xato retroaktiv davomat).",
              },
            });
            await billing.processAttendanceBilling(tx, {
              attendanceId: t.attendanceId,
              enrollmentId: enrollment.id,
              studentId: STUDENT_ID,
              groupId: t.groupId,
              branchId: t.branchId,
              lessonDate: t.lessonDate,
              oldStatus: t.status,
              newStatus: AttendanceStatus.EXCUSED,
              companyId: student.companyId,
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 15000,
          },
        );
        done.push(t.lessonDate.toISOString().slice(0, 10));
        console.log(`  reversed: ${t.lessonDate.toISOString().slice(0, 10)}`);
      }
    } finally {
      if (done.length) {
        await prisma.entityHistory.create({
          data: {
            entityType: 'Student',
            entityId: String(STUDENT_ID),
            action: 'UPDATE',
            newValues: {
              action: 'DAVOMAT_TUZATILDI',
              izoh: `Xato retroaktiv darslar EXCUSED ga o'tkazildi: ${done.join(', ')}. O'quvchi bu sanalarda guruhda yo'q edi.`,
              darslar: done,
            },
            companyId: student.companyId,
          },
        });
      }
    }

    const after = await prisma.student.findUniqueOrThrow({
      where: { id: STUDENT_ID },
      select: { balance: true },
    });
    console.log(`\nBalans (keyin): ${after.balance.toLocaleString()} so'm`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
