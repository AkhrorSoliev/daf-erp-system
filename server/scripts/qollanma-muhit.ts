/**
 * qollanma-muhit — qo'llanma skrinshotlari uchun lokal `daf_docs` bazasida
 * kerakli holatlarni yaratadi. Seed'dan KEYIN ishlaydi (`qollanma-baza.sh`).
 *
 * Seed faqat dars paketi kurslarini yaratadi, shuning uchun «Guruhdan
 * chiqarish» oynasida «Pul (shartnoma bo'yicha)» bloki chiqmaydi. Bu skript:
 *   1. «Standart Deutsch A1» kursini oylik to'lovga o'tkazadi;
 *   2. shu kurs guruhlaridagi faol yozilishlarni oy boshidan boshlangan qiladi;
 *   3. joriy oy hisobini production'dagi `createChargesForPeriod` bilan yozadi;
 *   4. skrinshot skriptiga id'larni `client/scripts/.qollanma-stsenariy.json` ga yozadi.
 *
 * AppModule ko'tarilmaydi (Telegram, cron'lar) — `migrate-to-monthly.ts`
 * dagi kichik modul naqshi.
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  PaymentModel,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { TransactionsReadService } from '../src/transactions/transactions-read.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
import { EnrollmentBillingService } from '../src/billing/enrollment-billing.service';
import { MonthlyChargeService } from '../src/billing/monthly-charge.service';
import { SettingsService } from '../src/settings/settings.service';
import { RedisService } from '../src/redis/redis.service';
import { EntityHistoryService } from '../src/common/entity-history/entity-history.service';
import { tashkentDateStr } from '../src/attendance/shared/date-utils';
import { docsBazasiniTekshir } from './lib/qollanma-baza';

const COMPANY_ID = 1001;
const OYLIK_KURS_ID = 'course-standart-a1';
const STSENARIY_FAYLI = path.resolve(
  __dirname,
  '../../client/scripts/.qollanma-stsenariy.json',
);

/** daf_docs tarixi skrinshotlarga kerak emas. */
const tarixsiz = () => Promise.resolve(undefined);

@Module({
  imports: [PrismaModule],
  providers: [
    CashMovementsService,
    TransactionsWriteService,
    TransactionsReadService,
    TransactionsService,
    SalaryAccrualService,
    EnrollmentBillingService,
    MonthlyChargeService,
    SettingsService,
    { provide: RedisService, useValue: null },
    {
      provide: EntityHistoryService,
      useValue: {
        recordCreate: tarixsiz,
        recordUpdate: tarixsiz,
        recordDelete: tarixsiz,
        recordStatusChange: tarixsiz,
        recordRestore: tarixsiz,
      },
    },
  ],
})
class QollanmaMuhitModule {}

async function main() {
  docsBazasiniTekshir(process.env.DATABASE_URL);
  const app = await NestFactory.createApplicationContext(QollanmaMuhitModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const oylik = app.get(MonthlyChargeService);
    const [yil, oy] = tashkentDateStr(new Date()).split('-').map(Number);

    await prisma.course.update({
      where: { id: OYLIK_KURS_ID },
      data: { paymentModel: PaymentModel.MONTHLY },
    });
    const yozilishlar = await prisma.enrollment.updateMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: {
          courseId: OYLIK_KURS_ID,
          statusEnum: GroupStatus.ACTIVE,
          deletedAt: null,
        },
      },
      data: { startDate: new Date(Date.UTC(yil, oy - 1, 1)) },
    });
    const natija = await oylik.createChargesForPeriod({
      companyId: COMPANY_ID,
      periodYear: yil,
      periodMonth: oy,
    });

    // Skrinshot o'quvchisi: seed'dan dars paketi qoldig'i qolgan yozilishlar
    // chiqarib tashlanadi, tartib esa har qayta yig'ishda bir xil bo'ladi.
    const hisob = await prisma.enrollmentMonthlyCharge.findFirst({
      where: {
        periodYear: yil,
        periodMonth: oy,
        status: MonthlyChargeStatus.CHARGED,
        enrollment: {
          status: EnrollmentStatus.ACTIVE,
          prepaidLessonsRemaining: 0,
        },
      },
      orderBy: [{ enrollment: { studentId: 'asc' } }, { enrollmentId: 'asc' }],
      select: { enrollment: { select: { studentId: true, groupId: true } } },
    });
    if (!hisob) throw new Error('Oylik hisob yozilmadi — seed ishlaganmi?');

    const stsenariy = {
      oy: `${yil}-${String(oy).padStart(2, '0')}`,
      oylikOquvchiId: hisob.enrollment.studentId,
      oylikGuruhId: hisob.enrollment.groupId,
    };
    fs.writeFileSync(
      STSENARIY_FAYLI,
      `${JSON.stringify(stsenariy, null, 2)}\n`,
    );
    console.log(
      `Oylik kurs: ${yozilishlar.count} yozilish, ${natija.created} ta hisob, ${natija.skipped} ta o'tkazib yuborildi (xato bo'lsa, yuqoridagi logda). Fayl: ${STSENARIY_FAYLI}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((xato: unknown) => {
  console.error(xato instanceof Error ? xato.message : xato);
  process.exit(1);
});
