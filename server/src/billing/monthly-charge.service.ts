import { Injectable, Logger } from '@nestjs/common';
import { EnrollmentStatus, GroupStatus, PaymentModel, Prisma } from '@prisma/client';
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

    const carried = await this.carriedCredit(tx, enr.id, periodYear, periodMonth);
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
