import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { MonthlyChargeService } from './monthly-charge.service';

/**
 * O'z-o'zini tuzatuvchi kunlik qorovul.
 *
 * `MonthlyBillingCronService` oyning 1-kuni barcha oylik yozilishlarga
 * hisob yozadi. Agar shu cron ISHLAMASA (deploy, baza uzilishi, boshqa
 * xato) yoki bir yozilish o'sha kuni xato bilan o'tkazib yuborilsa
 * (`createChargesForPeriod`ning `skipped`i), hisob yo'qligi hech qachon
 * o'z-o'zidan tuzalmasdi — `MonthlyChargeService.recordExcusedLesson`
 * ATAYLAB bo'shliqni davomat orqali TO'LDIRMAYDI (admin davomat
 * belgilaganda kutilmagan yechim chiqmasligi kerak). Shu bo'shliqni
 * yopadigan yagona joy — SHU qorovul.
 *
 * Har kuni ishlaydi (faqat 1-kun emas) va JORIY kun tegishli davr uchun
 * `createChargesForPeriod`ni chaqiradi — bu xuddi oy boshi cron'i
 * chaqiradigan metodning o'zi, chunki u allaqachon "hisobi yo'q
 * yozilishlarni top va yoz" so'rovi bilan ishlaydi (yagona manba, ikkinchi
 * nusxa yo'q). Shu bilan bir qatorda o'rtada qo'shilgan yangi yozilishlar
 * ham (masalan, 15-kuni ro'yxatdan o'tgan o'quvchi) shu yerda o'z birinchi
 * hisobini oladi — ular oy boshi cron'i o'tganidan keyin paydo bo'lgani
 * uchun undan umuman o'tkazib yuborilgan bo'lardi.
 *
 * Xavfsizlik: har kuni ishlashi kerak va HECH NARSA topmasa ham zarar
 * keltirmasligi shart — `createChargesForPeriod`ning so'zi "hisobi yo'q"
 * filtri bo'sh natija qaytarsa, pastdagi tsikl shunchaki bo'sh o'tadi.
 */
@Injectable()
export class MonthlyBillingWatchdogService {
  private readonly logger = new Logger(MonthlyBillingWatchdogService.name);

  constructor(
    private prisma: PrismaService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  @Cron('0 4 * * *', { timeZone: 'Asia/Tashkent' })
  async healMissingCharges(): Promise<void> {
    const today = tashkentDateStr(new Date());
    const periodYear = Number(today.slice(0, 4));
    const periodMonth = Number(today.slice(5, 7));

    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });

    for (const company of companies) {
      try {
        const res = await this.monthlyChargeService.createChargesForPeriod({
          companyId: company.id,
          periodYear,
          periodMonth,
        });

        if (res.created > 0) {
          // Bo'sh natija — kundalik norma. Bo'sh BO'LMAGAN natija esa oy
          // boshi cron'i (yoki oldingi qorovul yugurishi) kimnidir
          // o'tkazib yuborganini bildiradi — buni ADMIN darhol ko'rishi
          // kerak, shuning uchun error darajasida, "DIQQAT" bilan.
          this.logger.error(
            `DIQQAT: kompaniya ${company.id} — ${periodYear}-${periodMonth} ` +
              `davri uchun ${res.created} ta yozilishda oylik hisob ` +
              `YETISHMAGAN edi, qorovul tomonidan tuzatildi (jami ` +
              `${res.totalCharged} so'm). Bu oy boshi cron'i ishlamagani ` +
              `yoki kechikkanidan dalolat berishi mumkin — tekshiring.`,
          );
        } else {
          this.logger.debug(
            `Kompaniya ${company.id}: ${periodYear}-${periodMonth} — ` +
              `bo'shliq topilmadi.`,
          );
        }

        if (res.skipped > 0) {
          this.logger.error(
            `Kompaniya ${company.id}: ${periodYear}-${periodMonth} — ` +
              `${res.skipped} ta yozilish qorovul aylanishida ham xato ` +
              `bilan o'tkazib yuborildi. Batafsili yuqoridagi xatolik ` +
              `qatorlarida.`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Kompaniya ${company.id}: qorovul aylanishi yiqildi`,
          error,
        );
      }
    }
  }
}
