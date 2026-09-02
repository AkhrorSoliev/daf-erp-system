import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  PaymentModel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsWriteService } from '../transactions/transactions-write.service';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { lessonDatesInMonth } from './planned-lessons';
import {
  applyLessonCredit,
  perLessonCostForMonth,
  proratedMonthlyAmount,
} from './monthly-price';

/** Hisob yaratish uchun kerakli yozilish shakli. */
export interface ChargeableEnrollment {
  id: string;
  studentId: number;
  groupId: string;
  status: EnrollmentStatus;
  startDate: Date | null;
  group: {
    id: string;
    branchId: number;
    companyId: number;
    statusEnum: GroupStatus;
    exactDays: string[];
    course: { price: number; paymentModel: PaymentModel };
  };
}

/**
 * Oylik to'lov hisoblarini yaratadi va boshqaradi.
 *
 * Bu servis `EnrollmentMonthlyCharge` ni yozadigan YAGONA joy: dars narxi
 * ikki xil yo'l bilan hisoblanib, o'quvchi bilan o'qituvchi turli raqamga
 * qarab qolmasligi uchun.
 *
 * `createChargeForEnrollment` o'quvchi holatini (Student.status) TEKSHIRMAYDI
 * — `ChargeableEnrollment` bunday ma'lumotni umuman tashimaydi. Bu ATAYLAB
 * shunday: chaqiruvchi (masalan, oylik siklni yurituvchi cron) o'zining
 * so'rovida `student: { status: 'ACTIVE', deletedAt: null }` bilan filtrlaydi.
 * Yangi chaqiruvchi qo'shilganda shu filtrni takrorlashni unutmaslik kerak —
 * aks holda o'chirilgan yoki faol bo'lmagan o'quvchiga hisob yozilishi mumkin.
 */
@Injectable()
export class MonthlyChargeService {
  private readonly logger = new Logger(MonthlyChargeService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsWrite: TransactionsWriteService,
  ) {}

  /**
   * Bitta yozilish uchun bir oylik hisob yaratadi va balansdan yechadi.
   *
   * `null` qaytaradi: kurs oylik emas, guruh/yozilish faol emas, yoki oyda
   * dars yo'q. Idempotent — hisob allaqachon bo'lsa o'shani qaytaradi (unique
   * cheklov emas, ushbu oldindan tekshiruv ishlaydi — takroriy ishga
   * tushirish P2002 ga tayanmaydi).
   *
   * Chaqiruvchi Serializable tranzaksiya ichida bo'lishi SHART — `tx`
   * shu tranzaksiyaning mijozi.
   */
  async createChargeForEnrollment(
    tx: Prisma.TransactionClient,
    params: {
      enrollment: ChargeableEnrollment;
      periodYear: number;
      periodMonth: number;
      companyId: number;
      performedById?: number;
    },
  ) {
    const { enrollment: enr, periodYear, periodMonth } = params;

    if (enr.group.course.paymentModel !== PaymentModel.MONTHLY) return null;
    if (enr.status !== EnrollmentStatus.ACTIVE) return null;
    if (enr.group.statusEnum !== GroupStatus.ACTIVE) return null;

    const existing = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: enr.id,
          periodYear,
          periodMonth,
        },
      },
    });
    if (existing) return existing;

    const excludedDates = await this.resolveExcludedDates(
      tx,
      enr.groupId,
      enr.group.branchId,
      periodYear,
      periodMonth,
    );

    // Guruhning oyi — narxni belgilaydi va MUZLATILADI.
    const groupDates = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
    });
    const plannedLessons = groupDates.length;
    if (plannedLessons === 0) return null;

    // O'quvchining ulushi — o'rtada qo'shilgan bo'lsa kamroq.
    const coveredLessons = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
      fromDate: enr.startDate ? tashkentDateStr(enr.startDate) : null,
    }).length;
    if (coveredLessons === 0) return null;

    const monthlyPrice = enr.group.course.price;
    const perLessonCost = perLessonCostForMonth(monthlyPrice, plannedLessons);
    const grossAmount = proratedMonthlyAmount(
      monthlyPrice,
      plannedLessons,
      coveredLessons,
    );

    const carried = await this.carriedCredit(
      tx,
      enr.id,
      periodYear,
      periodMonth,
    );
    const credit = applyLessonCredit(grossAmount, perLessonCost, carried);

    const charge = await tx.enrollmentMonthlyCharge.create({
      data: {
        enrollmentId: enr.id,
        studentId: enr.studentId,
        groupId: enr.groupId,
        branchId: enr.group.branchId,
        companyId: params.companyId,
        periodYear,
        periodMonth,
        plannedLessons,
        perLessonCost,
        monthlyPrice,
        coveredLessons,
        creditLessons: credit.creditLessonsUsed,
        creditAmount: credit.creditAmount,
        chargedAmount: credit.chargedAmount,
        // Sig'magan kredit kuymaydi: keyingi oy uni ko'rishi uchun shu
        // oyning uzrli sanog'ida qoldiriladi.
        excusedLessons: credit.carriedCreditLessons,
      },
    });

    const transaction = await this.transactionsWrite.chargeMonthlyFee(
      {
        studentId: enr.studentId,
        amount: credit.chargedAmount,
        enrollmentId: enr.id,
        companyId: params.companyId,
        branchId: enr.group.branchId,
        periodYear,
        periodMonth,
        monthlyPrice,
        plannedLessons,
        coveredLessons,
        perLessonCost,
        creditLessons: credit.creditLessonsUsed,
      },
      tx,
    );

    return tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: { transactionId: transaction.id },
    });
  }

  /**
   * O'quvchi oy o'rtasida ketdi: o'tmagan darslar ulushini balansga qaytaradi.
   *
   * Butun oy hisobi teskari qilinmaydi — o'tgan darslar to'langan bo'lib
   * qolishi kerak (`EnrollmentMonthlyCharge.status` `CHARGED` bo'lib qoladi,
   * asl `chargeMonthlyFee` tranzaksiyasi ham tegilmaydi). Faqat qolgan
   * darslar ulushi qaytariladi va qaytariladigan summa hech qachon
   * yechilgandan oshmaydi (kredit tufayli oz yechilgan oy).
   *
   * IDEMPOTENT — takroriy chaqiruv (qo'sh bosish, tarmoq qayta urinishi
   * committed bo'lib qolgan so'rovni qayta yuborishi) ikkinchi marta
   * qaytarmaydi. `remaining` KALENDARDAN emas — hisobning O'ZI saqlab
   * turgan `charge.coveredLessons`dan chiqariladi: "departureDate holatida
   * shu kungacha qoplanishi kerak bo'lgan darslar soni"
   * (`lessonsThroughDeparture`) hisoblab, joriy `coveredLessons`dan
   * ayiriladi. Birinchi chaqiruv shu farqni qaytaradi VA `coveredLessons`ni
   * aynan o'sha farqga kamaytiradi — shuning uchun ikkinchi chaqiruvda farq
   * 0 bo'lib qoladi, chunki `status` doim `CHARGED` bo'lib qolaveradi (u
   * yagona himoya bo'la olmaydi). Faqat kalendardan hisoblangan avvalgi
   * versiya (`lessonDatesInMonth(...).filter(d => d > day)`) BUG edi: u har
   * safar bir xil sonni qaytarib, chaqirilgan safar sayin qayta-qayta pul
   * yechardi — faqat `chargedAmount` qopqog'i bilan chegaralangan, haqiqiy
   * pul.
   *
   * `departureDate` bugundan OLDINGI sana bo'lishi MUMKIN EMAS: bu funksiya
   * "departureDate'dan keyingi darslar hali o'tilmagan" deb faraz qiladi —
   * bu faqat bugun yoki kelajakdagi sana uchun to'g'ri. Orqaga sanaladigan
   * (backdated) chiqish allaqachon o'qitilgan va o'qituvchiga hisoblangan
   * darslarni ham "qolgan" deb hisoblab qaytarib yuborardi — bu holda
   * `SalaryAccrual` bilan sinxronsizlik yuzaga kelardi (garchi bu funksiya
   * hech qachon accrual'ga to'g'ridan-to'g'ri tegmasa ham — pastga qarang).
   * Yagona hozirgi chaqiruvchi (`removeFromGroup`) doim `new Date()`ni
   * yuboradi; bu tekshiruv KELAJAKDAGI chaqiruvchilar uchun himoya —
   * xato jim yuz bermasligi kerak.
   *
   * Bu servis TEACHER accrual'lariga MUTLAQO tegmaydi: qaytarilayotgan
   * darslar hali o'tilmagan (ketgan kundan KEYINGI sanalar), shuning uchun
   * ularga hech qanday `SalaryAccrual` yozuvi yo'q — reverse qilinadigan
   * narsa yo'q. O'qituvchi haqi (`accrueMonthlySalary`) har bir davomat
   * uchun alohida, `EnrollmentMonthlyCharge.perLessonCost` (bu yerda
   * o'zgartirilmaydigan, muzlatilgan qiymat) asosida hisoblanadi. Yuqoridagi
   * backdated-taqiq shu invariantni KUCHAB QO'YADI — accrual'siz qolishning
   * yagona sababi "bu darslar hali o'tilmagan" degan faraz edi.
   */
  async reverseChargeForDeparture(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      departureDate: Date;
      companyId: number;
      reason: string;
      performedById?: number;
      /**
       * Optional: "bugun" Toshkent 'YYYY-MM-DD' shaklida, BIR martalik
       * chaqiruvchi uchun emas — bir necha o'nlab/yuzlab yozilishni ketma-ket
       * qayta ishlaydigan BATCH chaqiruvchi uchun (`StatusCascadeService`).
       * Har bir tranzaksiya `maxWait 10s / timeout 15s`gacha cho'zilishi
       * mumkin — yuzlab yozilishli sikl real vaqtda Toshkent yarim tunidan
       * o'tib ketishi mumkin. Agar bu funksiya HAR safar `new Date()`ni
       * o'zi qayta hisoblasa, sikl o'rtasida soat kun almashtirib yuboradi:
       * kecha ochilgan (hali bitta ham iteratsiya bajarmagan) `departureDate`
       * keyingi iteratsiyalarda to'satdan "backdated" deb rad etiladi — bu
       * esa qo'riqsiz sikl(dan) chiqib, butun cascade'ni to'xtatib qo'yardi
       * (2026-09 sharh, 3-bosqich). Batch chaqiruvchi shu YERDA BIR marta
       * hisoblangan "bugun"ni har bir iteratsiyaga bab-baravar uzatadi —
       * shunda butun partiya BITTA soatga qarab baholanadi, har biri o'z
       * "hozir"iga emas. Yagona bitta-yozilishli chaqiruvchi
       * (`removeFromGroup`) buni bermaydi — pastda `new Date()`ga tushadi,
       * bu yerda hech qanday xavf yo'q.
       */
      today?: string;
    },
  ): Promise<{ refunded: number } | null> {
    const day = tashkentDateStr(params.departureDate);
    const today = params.today ?? tashkentDateStr(new Date());
    if (day < today) {
      throw new BadRequestException(
        "reverseChargeForDeparture: departureDate bugundan oldingi sana bo'lishi mumkin emas — aks holda allaqachon o'tilgan (va o'qituvchiga hisoblangan) darslar ham 'qolgan' deb hisoblanib qaytarilib qolardi",
      );
    }

    const periodYear = Number(day.slice(0, 4));
    const periodMonth = Number(day.slice(5, 7));

    const charge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: params.enrollmentId,
          periodYear,
          periodMonth,
        },
      },
    });
    if (!charge || charge.status !== MonthlyChargeStatus.CHARGED) return null;

    const enr = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        studentId: true,
        startDate: true,
        group: { select: { branchId: true, exactDays: true } },
      },
    });
    if (!enr) return null;

    const excludedDates = await this.resolveExcludedDates(
      tx,
      charge.groupId,
      enr.group.branchId,
      periodYear,
      periodMonth,
    );

    // "departureDate holatida shu kungacha (kiritilgan holda) qoplanishi
    // kerak bo'lgan darslar soni" — createChargeForEnrollment'dagi
    // coveredLessons bilan BIR XIL usulda hisoblanadi (o'sha `fromDate`,
    // faqat bu yerda `toDate=day`). `remaining` shu bilan HOZIRGI
    // `charge.coveredLessons` orasidagi FARQ — kalendardan emas, hisobning
    // o'zidan. Shu orqali idempotent (yuqoridagi izohga qarang).
    const lessonsThroughDeparture = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
      fromDate: enr.startDate ? tashkentDateStr(enr.startDate) : null,
      toDate: day,
    }).length;

    const remaining = Math.max(
      0,
      charge.coveredLessons - lessonsThroughDeparture,
    );
    if (remaining === 0) return null;

    const refunded = Math.min(
      remaining * charge.perLessonCost,
      charge.chargedAmount,
    );
    if (refunded <= 0) return null;

    await this.transactionsWrite.createAdjustment(
      {
        studentId: enr.studentId,
        amount: refunded,
        companyId: params.companyId,
        branchId: enr.group.branchId,
        description: `${params.reason} — o'tmagan ${remaining} dars qaytarildi`,
        performedById: params.performedById,
      },
      tx,
    );

    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: {
        coveredLessons: charge.coveredLessons - remaining,
        chargedAmount: charge.chargedAmount - refunded,
      },
    });

    return { refunded };
  }

  /**
   * Bir kompaniyaning barcha oylik yozilishlariga bir davr uchun hisob yozadi.
   *
   * Ikki chaqiruvchi bor: oy boshi cron'i (`MonthlyBillingCronService`, har
   * oyning 1-kuni, JORIY davr uchun) va kunlik qorovul
   * (`MonthlyBillingWatchdogService`, har kuni, shu KUNNING davri uchun) —
   * ikkalasi ham xuddi shu metodni chaqiradi. Ular orasida farq yo'q: bu
   * metod tabiatan idempotent, shuning uchun qorovulning har kunlik
   * qayta-chaqiruvi allaqachon hisoblangan yozilishlarga tegmaydi.
   *
   * So'rov o'zi `monthlyCharges: { none: {...davr...} }` bilan filtrlaydi —
   * ya'ni faqat ANIQ shu davr uchun hisobi yo'q yozilishlarni qaytaradi.
   * Bu ikki narsani beradi: (1) tekshirish bitta so'rovda — 370 ta yozilish
   * uchun ham N+1 emas, chunki Prisma buni bitta NOT EXISTS pastki
   * so'roviga aylantiradi; (2) qorovul kod TAKRORLAMAYDI — "kimga hisob
   * yetishmayapti" so'rovi shu YERDA, yagona manbada.
   *
   * Har yozilish O'ZINING Serializable tranzaksiyasida ishlanadi: bitta
   * o'quvchidagi xato qolgan 369 tasini to'xtatmasligi kerak. Idempotent —
   * unique kalit takroriy yozuvni to'sadi, shuning uchun cron ikki marta
   * ishlasa ham zarar yo'q.
   */
  async createChargesForPeriod(params: {
    companyId: number;
    periodYear: number;
    periodMonth: number;
    performedById?: number;
  }): Promise<{ created: number; skipped: number; totalCharged: number }> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: {
          deletedAt: null,
          companyId: params.companyId,
          statusEnum: GroupStatus.ACTIVE,
          course: { paymentModel: PaymentModel.MONTHLY, deletedAt: null },
        },
        student: { deletedAt: null, status: 'ACTIVE' },
        monthlyCharges: {
          none: {
            periodYear: params.periodYear,
            periodMonth: params.periodMonth,
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        startDate: true,
        group: {
          select: {
            id: true,
            branchId: true,
            companyId: true,
            statusEnum: true,
            exactDays: true,
            course: { select: { price: true, paymentModel: true } },
          },
        },
      },
    });

    let created = 0;
    let skipped = 0;
    let totalCharged = 0;

    for (const enr of enrollments) {
      try {
        const charge = await this.prisma.$transaction(
          (tx) =>
            this.createChargeForEnrollment(tx, {
              enrollment: enr as ChargeableEnrollment,
              periodYear: params.periodYear,
              periodMonth: params.periodMonth,
              companyId: params.companyId,
              performedById: params.performedById,
            }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (charge) {
          created++;
          totalCharged += charge.chargedAmount;
        } else {
          skipped++;
        }
      } catch (err) {
        skipped++;
        this.logger.error(
          `Oylik hisob yozilmadi: enrollment=${enr.id} ` +
            `davr=${params.periodYear}-${params.periodMonth}`,
          err,
        );
      }
    }

    return { created, skipped, totalCharged };
  }

  /** O'tgan oyning sarflanmagan uzrli darslari. */
  private async carriedCredit(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<number> {
    const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
    const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;

    const prev = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId,
          periodYear: prevYear,
          periodMonth: prevMonth,
        },
      },
      select: { excusedLessons: true },
    });
    return Math.max(0, prev?.excusedLessons ?? 0);
  }

  /**
   * Bayramlar + bekor qilingan darslar, 'YYYY-MM-DD' ro'yxati.
   *
   * Bayramlar `buildHolidayDateSet` orqali olinadi — u ko'p kunlik
   * bayramlarni (date..endDate), filial qamrovini (global + shu filial) va
   * `deletedAt`/`status` filtrlarini to'g'ri hisobga oladi. Bularni shu
   * yerda qaytadan yozish oson xato qiladi (masalan, faqat `date`
   * ustunini tekshirib, oy ichiga tushgan ko'p kunlik bayramni o'tkazib
   * yuborish).
   *
   * PUBLIC ataylab: `LessonBillingService`ning zaxira narx hisob-kitobi
   * (`fallbackMonthlyPerLessonCost`, cron ulgurmagan holat uchun) HAM shu
   * metoddan foydalanadi — aks holda ikkita mustaqil "qaysi kunlar
   * hisobga kirmaydi" mantig'i bir-biridan uzoqlashib, bayram yoki
   * bekor qilingan dars bo'lgan oyda zaxira narx REAL hisobdan farq
   * qilib qolardi (narx "muzlatilmagan" emas, sonli NOTO'G'RI bo'lardi).
   */
  async resolveExcludedDates(
    tx: Prisma.TransactionClient,
    groupId: string,
    branchId: number,
    year: number,
    month: number,
  ): Promise<string[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExclusive = new Date(Date.UTC(year, month, 1));
    const monthEndInclusive = new Date(Date.UTC(year, month, 0));

    const [holidayDates, cancellations] = await Promise.all([
      buildHolidayDateSet(tx, monthStart, monthEndInclusive, branchId),
      tx.lessonCancellation.findMany({
        where: {
          groupId,
          deletedAt: null,
          date: { gte: monthStart, lt: monthEndExclusive },
        },
        select: { date: true },
      }),
    ]);

    const excluded = new Set(holidayDates);
    for (const c of cancellations) excluded.add(tashkentDateStr(c.date));
    return [...excluded];
  }

  /**
   * Uzrli dars sanog'ini o'sha dars tushgan oyning hisobiga yozadi.
   * `delta`: +1 uzrli bo'ldi, -1 tuzatish (uzrli -> keldi).
   */
  async recordExcusedLesson(
    tx: Prisma.TransactionClient,
    params: { enrollmentId: string; lessonDate: Date; delta: number },
  ): Promise<void> {
    const day = tashkentDateStr(params.lessonDate);
    const periodYear = Number(day.slice(0, 4));
    const periodMonth = Number(day.slice(5, 7));

    const charge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: params.enrollmentId,
          periodYear,
          periodMonth,
        },
      },
      select: { id: true },
    });
    if (!charge) {
      // Bu oy uchun hisob hali yaratilmagan (masalan cron ulgurmagan) —
      // BU YERDA hisob shoshilinch YARATILMAYDI: davomat belgilash admin
      // uchun kutilmagan yechimga aylanmasligi kerak. Kredit shu holatda
      // yo'qoladi — bu xatolik jurnalga yoziladi, shunda bo'shliq ko'rinib
      // turadi. 7-vazifadagi cron o'z-o'zini tuzatish tomonini olib boradi.
      this.logger.error(
        `Oylik hisob topilmadi: enrollment=${params.enrollmentId} ` +
          `davr=${periodYear}-${String(periodMonth).padStart(2, '0')} ` +
          `sana=${day} — uzrli dars krediti (delta=${params.delta}) yozilmadi`,
      );
      return;
    }

    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: { excusedLessons: { increment: params.delta } },
    });
  }

  /** Dars sanasiga to'g'ri keladigan oylik hisob (o'qituvchi haqi uchun). */
  async findChargeForLesson(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    lessonDate: Date,
  ) {
    const day = tashkentDateStr(lessonDate);
    return tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId,
          periodYear: Number(day.slice(0, 4)),
          periodMonth: Number(day.slice(5, 7)),
        },
      },
    });
  }
}
