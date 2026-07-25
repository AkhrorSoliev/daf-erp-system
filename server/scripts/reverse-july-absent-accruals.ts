/**
 * FAZA 1 — bir martalik tuzatish. BR-06/08/11 (amal 2026-07): ABSENT ("kelmadi")
 * darsi ustozga haq keltirmaydi. Faza 1 kodi faqat YANGI accrualларни to'xtatadi;
 * Iyul boshidan deploy'gacha yozib qo'yilgan ABSENT teacher accruallari hali
 * bazada — oy-oxiri (01.08) settlementда ustozga to'lanib ketardi. Bu skript
 * ularni qaytaradi (idempotent — kompensatsion SALARY_ACCRUAL tx yozib,
 * User.balance ni kamaytiradi).
 *
 * Scope (qat'iy): attendance.status = ABSENT + lessonDate >= 2026-07-01 +
 * reversedAt IS NULL + salaryPaymentId IS NULL (Iyul hali yakunlanmagan) +
 * attendanceId IS NOT NULL. Pre-July (BR-12) va withdrawal (attendanceId NULL)
 * accruallari TEGILMAYDI. Center-funded ABSENT hali yo'q (top-up settlementда).
 *
 * ISHLATISH:
 *   Dry-run (default): railway run npx ts-node scripts/reverse-july-absent-accruals.ts
 *   Bajarish        : railway run npx ts-node scripts/reverse-july-absent-accruals.ts --execute
 *
 * Faza 1 DEPLOY'idan KEYIN, 01.08 settlement'idan OLDIN bir marta ishlatiladi.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { run, printHeader, section, som, printTable, day, dbEnvLabel } from './lib/check-cli';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';

const COMPANY_ID = 1001;
const JULY_START = new Date('2026-07-01');
const REASON = "BR-06/08/11: ABSENT dars ustozga haq keltirmaydi (01.07.2026+)";

interface Target {
  id: string;
  userId: number;
  studentId: number;
  groupId: string;
  lessonDate: Date;
  attendanceId: string;
  amount: number;
}

async function main(prisma: PrismaClient) {
  const execute = process.argv.includes('--execute');
  printHeader('IYUL ABSENT ACCRUAL REVERSAL' + (execute ? ' — EXECUTE' : ' — DRY-RUN'));
  console.log(`  Baza: ${dbEnvLabel()}  ·  companyId=${COMPANY_ID}`);

  const targets = await prisma.$queryRaw<Target[]>`
    SELECT sa.id, sa."userId", sa."studentId", sa."groupId",
           sa."lessonDate", sa."attendanceId", sa.amount
    FROM "SalaryAccrual" sa
    JOIN "Attendance" a ON a.id = sa."attendanceId"
    WHERE a.status::text = 'ABSENT'
      AND sa."lessonDate" >= ${JULY_START}
      AND sa."reversedAt" IS NULL
      AND sa."salaryPaymentId" IS NULL
      AND sa."attendanceId" IS NOT NULL
      AND sa."companyId" = ${COMPANY_ID}
    ORDER BY sa."lessonDate" ASC, sa."userId" ASC
  `;

  const total = targets.reduce((s, t) => s + t.amount, 0);
  section(`Nishon accruallar: ${targets.length} ta · jami ${som(total)} so'm`);
  if (targets.length === 0) {
    console.log('  ✅ Qaytariladigan Iyul ABSENT accrual yo‘q. Hech narsa qilinmaydi.');
    return;
  }
  printTable(
    ['accrualId', 'ustoz', "o'quvchi", 'sana', 'summa'],
    targets.slice(0, 15).map((t) => [t.id.slice(0, 8), t.userId, t.studentId, day(t.lessonDate), som(t.amount)]),
    ['l', 'l', 'l', 'l', 'r'],
  );
  if (targets.length > 15) console.log(`  … va yana ${targets.length - 15} ta`);

  if (!execute) {
    console.log('\n  DRY-RUN — hech narsa o‘zgartirilmadi. Bajarish uchun: --execute');
    return;
  }

  const svc = new SalaryAccrualService(prisma as unknown as PrismaService);
  let reversed = 0;
  let skipped = 0;
  for (const t of targets) {
    const res = await prisma.$transaction(
      (tx) =>
        svc.reverseAccrualForAttendance({
          teacherId: t.userId,
          studentId: t.studentId,
          groupId: t.groupId,
          lessonDate: t.lessonDate,
          reversalReason: REASON,
          tx,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 30_000 },
    );
    if (res) reversed += 1;
    else skipped += 1; // allaqachon qaytarilgan / topilmadi (idempotent)
  }

  section('Natija');
  console.log(`  Qaytarildi : ${reversed} ta`);
  console.log(`  O‘tkazildi (idempotent) : ${skipped} ta`);
  console.log('  ✅ Ustoz balanslari yangilandi. Endi 01.08 settlement ABSENT uchun to‘lamaydi.');
}

run(main);
