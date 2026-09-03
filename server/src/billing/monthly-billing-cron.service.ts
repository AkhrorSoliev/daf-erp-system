import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { MonthlyChargeService } from './monthly-charge.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Oylik to'lovni sozlangan kunda hisoblab, balansdan yechadi.
 *
 * Kunlik ishlaydi va "bugun sozlangan kunmi?" deb tekshiradi —
 * `SalaryCronService` bilan bir xil naqsh. Sozlangan kun —
 * `payment.chargeDayOfMonth` (`/settings` paneli, boshlang'ich 1),
 * KOMPANIYA bo'yicha o'qiladi — shuning uchun tekshiruv har bir
 * kompaniya uchun ALOHIDA, sikl ICHIDA bajariladi, sikldan oldin emas.
 *
 * Vaqti 03:10 — oylik maosh cron'i (02:00) tugab bo'lgach ishlaydi.
 * Daqiqa ATAYLAB 0 emas: `mock-exam-deadline-cron` aynan 03:00:00 da
 * turadi, va oyning 1-kuni bu yerdan 370 ta Serializable tranzaksiya
 * boshlanadi — ikkovi bir soniyaga to'g'ri kelmasligi kerak.
 * `MonthlyChargeService.createChargesForPeriod` o'zi idempotent (unique
 * kalit + "hisobi yo'q" so'rov filtri), shuning uchun bu ikkalasi orasida
 * tartib zaruriy emas — faqat resurs bahsini kamaytirish uchun ajratilgan.
 *
 * Bu yerda faqat OY BOSHIDAGI (sozlangan kun) yozadigan cron bor. Kunlik
 * bo'shliqni topib tuzatuvchi qorovul alohida faylda —
 * `monthly-billing-watchdog.service.ts` — chunki bu kod bazasida har bir
 * cron o'z faylida, bitta `@Cron` bilan yashaydi. Qorovul HAM shu
 * sozlamani hurmat qiladi: aks holda u sozlangan kundan oldin ham
 * "hisobi yo'q" bo'shliqni "tuzatib", sozlamani ma'nosiz qilib qo'yardi.
 */
@Injectable()
export class MonthlyBillingCronService {
  private readonly logger = new Logger(MonthlyBillingCronService.name);

  constructor(
    private prisma: PrismaService,
    private monthlyChargeService: MonthlyChargeService,
    private settingsService: SettingsService,
  ) {}

  @Cron('10 3 * * *', { timeZone: 'Asia/Tashkent' })
  async chargeMonthlyFees(): Promise<void> {
    const today = tashkentDateStr(new Date());
    const todayDay = Number(today.slice(8, 10));
    const periodYear = Number(today.slice(0, 4));
    const periodMonth = Number(today.slice(5, 7));

    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });

    for (const company of companies) {
      try {
        // Har kompaniyaning O'ZINING `payment.chargeDayOfMonth`i bor
        // (filial override kompaniyadan ustun bo'lishi mumkin, lekin bu
        // cron filial darajasida yurmaydi — shuning uchun kompaniya
        // qiymati o'qiladi). Bugun shu kun bo'lmasa — bu kompaniya shu
        // safar chetlab o'tiladi.
        const chargeDayOfMonth = await this.settingsService.get(
          company.id,
          'payment.chargeDayOfMonth',
        );
        if (todayDay !== chargeDayOfMonth) continue;

        const res = await this.monthlyChargeService.createChargesForPeriod({
          companyId: company.id,
          periodYear,
          periodMonth,
        });
        this.logger.log(
          `Kompaniya ${company.id}: ${periodYear}-${periodMonth} oylik hisobi — ` +
            `${res.created} yozildi, ${res.skipped} o'tkazildi, ` +
            `jami ${res.totalCharged} so'm`,
        );
      } catch (error) {
        this.logger.error(
          `Kompaniya ${company.id}: oylik hisob yaratish yiqildi`,
          error,
        );
      }
    }
  }
}
