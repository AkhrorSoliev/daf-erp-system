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
import { SettingsService } from '../settings/settings.service';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { lessonDatesInMonth } from './planned-lessons';
import {
  applyDiscount,
  applyLessonCredit,
  clampDiscount,
  perLessonCostForMonth,
  proratedMonthlyAmount,
} from './monthly-price';
import { chargeStartDate } from './charge-start-date';

/** Hisob yaratish uchun kerakli yozilish shakli. */
export interface ChargeableEnrollment {
  id: string;
  studentId: number;
  groupId: string;
  status: EnrollmentStatus;
  startDate: Date | null;
  /** Where the charge starts when `startDate` is empty (`chargeStartDate`). */
  createdAt: Date;
  group: {
    id: string;
    branchId: number;
    companyId: number;
    statusEnum: GroupStatus;
    /** A charge never covers lessons before the group opened. */
    startDate: Date | null;
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
    private settingsService: SettingsService,
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
      /**
       * `Student.discountPercent` (0-100). Chaqiruvchi buni o'zining
       * mavjud so'rovidan uzatadi (N+1 emas) — bu servis o'quvchini
       * qayta o'qimaydi. Faqat markazning ulushini qisqartiradi:
       * `EnrollmentMonthlyCharge.perLessonCost` ATAYLAB chegirmasiz
       * qoladi, chunki Task 6 o'qituvchi haqini shu maydondan hisoblaydi
       * (`Student.discountPercent` izohiga qara).
       */
      discountPercent?: number;
      /**
       * Oldindan hal qilingan `payment.excusedCreditEnabled` /
       * `payment.excusedCreditMonthlyCap`. Berilsa — bu servis
       * `settingsService`ga UMUMAN murojaat qilmaydi. `createChargesForPeriod`
       * buni FILIAL boshiga bir marta o'qib (370+ yozilishli tsiklda emas)
       * shu yerga uzatadi — Redis o'chganda (kesh DBga tushadi) bu N+1
       * so'rov to'foniga yo'l qo'ymaslik uchun. Berilmasa (masalan
       * `StudentEnrollmentService`ning bitta yozilish uchun chaqiruvi),
       * avvalgidek o'zi `settingsService`dan o'qiydi.
       */
      excusedCredit?: { enabled: boolean; monthlyCap: number | null };
    },
  ) {
    const { enrollment: enr, periodYear, periodMonth } = params;
    const discountPercent = clampDiscount(params.discountPercent ?? 0);

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
    // Faqat KUCHDAGI hisob qayta hisoblashni to'sadi. `REVERSED` — admin shu
    // oyni butunlay bekor qilgan holat (`reverseMonthlyCharge`): o'sha oy
    // QAYTA hisoblanishi kerak, aks holda bitta bosish bir oylik o'qishni
    // bepul qilib qo'yardi. `@@unique([enrollmentId, periodYear,
    // periodMonth])` ikkinchi qator yozishga yo'l qo'ymaydi, shuning uchun
    // pastda o'sha qatorning O'ZI qayta yoziladi (create emas, update).
    if (existing && existing.status === MonthlyChargeStatus.CHARGED) {
      return existing;
    }

    const { excludedDates, addedDates } = await this.resolveMonthPlan(
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
      addedDates,
    });
    const plannedLessons = groupDates.length;
    if (plannedLessons === 0) return null;

    // O'quvchining ulushi — o'rtada qo'shilgan bo'lsa kamroq. SANALARNING
    // O'ZI ham saqlanadi: `reverseChargeForDeparture` "ketgan kungacha
    // nechtasi qoplangan edi" degan savolga JONLI kalendardan emas, shu
    // muzlatilgan ro'yxatdan javob berishi kerak (schema izohi).
    const fromDate = chargeStartDate(enr);
    // Ko'chirilgan dars `coveredDates` ga ASL kuni bilan emas, o'zi ROSTDAN
    // o'tiladigan kuni bilan tushadi — reja bilan bir xil kalendardan.
    // Aks holda oy o'rtasida ketgan o'quvchi hali o'tilmagan darsni
    // "qoplangan" deb qoldirib ketardi: `reverseChargeForDeparture` faqat
    // `d > ketgan kun` bo'lganlarini qaytaradi, bayram kuni esa ketish
    // kunidan OLDIN turardi (1-sentabr bayrami 25-sentabrga ko'chirilgan,
    // o'quvchi 10-sentabrda ketgan — bitta dars puli markazda qolib
    // ketardi). `fromDate` ham shu yerda qo'llanadi: o'quvchi qo'shilishidan
    // OLDIN o'tilgan qoplama darsini u olmagan, demak to'lamaydi ham.
    const scheduledDates = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
      addedDates,
      fromDate,
    });
    // A student taken out of a group and put back into the SAME group in the
    // same month has two enrollments there. The earlier one's charge keeps
    // every date up to the day they left (`reverseChargeForDeparture` returns
    // only the later ones), so those lessons are paid already: covering them
    // again here would bill one lesson twice.
    const paidElsewhere = await this.datesPaidByOtherCharges(tx, {
      enrollmentId: enr.id,
      studentId: enr.studentId,
      groupId: enr.groupId,
      periodYear,
      periodMonth,
    });
    const coveredDates = scheduledDates.filter((d) => !paidElsewhere.has(d));
    const coveredLessons = coveredDates.length;
    if (coveredLessons === 0) return null;

    const monthlyPrice = enr.group.course.price;
    // CHEGIRMASIZ — o'qituvchi haqi (Task 6) va bu qatorning o'zi shu
    // ikkisidan hisoblanadi.
    const perLessonCostFull = perLessonCostForMonth(
      monthlyPrice,
      plannedLessons,
    );
    const grossAmountFull = proratedMonthlyAmount(
      monthlyPrice,
      plannedLessons,
      coveredLessons,
    );
    // Markazning ulushi — o'quvchi aynan shuni to'laydi. Kredit ham shu
    // chegirmali narxda sarflanadi: aks holda chegirmali o'quvchi to'lagan
    // pulidan ikki barobar ko'p kredit olardi (task-9c-brief.md).
    const grossAmountStudent = applyDiscount(grossAmountFull, discountPercent);
    const perLessonCostStudent = applyDiscount(
      perLessonCostFull,
      discountPercent,
    );

    const rawCarried = await this.carriedCredit(
      tx,
      enr.id,
      periodYear,
      periodMonth,
    );
    // `payment.excusedCreditEnabled` / `payment.excusedCreditMonthlyCap` —
    // sozlamalar panelidan boshqariladi (filial override kompaniyadan
    // ustun). `params.excusedCredit` berilgan bo'lsa (`createChargesForPeriod`
    // shunday chaqiradi — filial boshiga BIR MARTA o'qib, shu yerga uzatadi)
    // bu yerda HECH QANDAY so'rov ketmaydi. Berilmasa (masalan
    // `StudentEnrollmentService`ning bitta yozilish uchun chaqiruvi) — o'zi
    // `settingsService`dan o'qiydi; Redis sog'lom bo'lsa bu kesh o'qishi,
    // lekin Redis o'chganda DBga tushadi — shuning uchun issiq (370+
    // yozilishli) tsikl HECH QACHON shu yo'ldan o'tmasligi kerak (aks
    // holda Redis o'chgan aynan o'sha vaqtda N+1 so'rov to'foniga aylanadi).
    // O'chirilgan bo'lsa — bu oyga HECH QANDAY kredit o'tmaydi (o'tgan
    // oydan qolgan kredit ham shu bilan yo'qoladi, chunki yangi yozuvning
    // `excusedLessons`i 0 bo'lib qoladi — keyingi oy uni ko'rmaydi).
    // Cheklangan bo'lsa — bu oyga ko'pi bilan N dars kiradi.
    const excusedCreditEnabled = params.excusedCredit
      ? params.excusedCredit.enabled
      : await this.settingsService.get(
          params.companyId,
          'payment.excusedCreditEnabled',
          enr.group.branchId,
        );
    const excusedCreditMonthlyCap = params.excusedCredit
      ? params.excusedCredit.monthlyCap
      : await this.settingsService.get(
          params.companyId,
          'payment.excusedCreditMonthlyCap',
          enr.group.branchId,
        );
    const carried = !excusedCreditEnabled
      ? 0
      : excusedCreditMonthlyCap != null
        ? Math.min(rawCarried, excusedCreditMonthlyCap)
        : rawCarried;
    // Cheklov (`excusedCreditMonthlyCap`) shu OYGA ko'pi bilan N dars
    // kiritadi — lekin N dan oshgan qism KUYDIRILMAYDI, faqat SHU oyda
    // ishlatilmaydi. `deferredByCap` o'sha qismni ushlab qoladi va pastda
    // `excusedLessons`ga qo'shiladi, xuddi "sig'magan" (affordability bilan
    // chegaralangan) kredit kabi — ikkalasi ham keyingi oy `carriedCredit()`
    // orqali ko'rinadi. `excusedCreditEnabled=false` holatida rawCarried
    // ATAYLAB butunlay tashlanadi (yuqoridagi izoh) — bu faqat cheklov
    // o'zi sabab bo'lgan holatga tegishli.
    const deferredByCap =
      excusedCreditEnabled && excusedCreditMonthlyCap != null
        ? Math.max(0, rawCarried - excusedCreditMonthlyCap)
        : 0;
    const credit = applyLessonCredit(
      grossAmountStudent,
      perLessonCostStudent,
      carried,
    );

    const chargeData = {
      enrollmentId: enr.id,
      studentId: enr.studentId,
      groupId: enr.groupId,
      branchId: enr.group.branchId,
      companyId: params.companyId,
      periodYear,
      periodMonth,
      plannedLessons,
      perLessonCost: perLessonCostFull,
      monthlyPrice,
      coveredLessons,
      coveredDates,
      // Muzlatilgan-chiqarilgan to'plam qayta boshlanadi: bu qator YANGI
      // hisob (yoki `REVERSED` dan qayta CHARGED'ga qaytgan hisob) — eski
      // `frozenOutDates` (agar `existing` REVERSED bo'lgan bo'lsa) shu
      // yerdan boshlab hech qanday ma'noga ega emas, chunki `coveredDates`
      // ham shu yerda yangidan yozilmoqda. Buni ATAYLAB tiklamaslik
      // muzlatish/qaytish to'plamini eskirgan holatda qoldirardi — keyingi
      // muzlatish YANGI (to'liq) `coveredDates`dan emas, ESKI qoldiq
      // to'plamdan ayirardi (2026-09 review, NEW-1: reverse -> re-charge ->
      // freeze zanjirida 276 920 so'm kam qaytarilgan holat).
      frozenOutDates: [],
      creditLessons: credit.creditLessonsUsed,
      creditAmount: credit.creditAmount,
      chargedAmount: credit.chargedAmount,
      // Sig'magan kredit kuymaydi: keyingi oy uni ko'rishi uchun shu
      // oyning uzrli sanog'ida qoldiriladi. Cheklov tashlab yuborgan qism
      // (`deferredByCap`) ham xuddi shunday — faqat SURILADI, hech qachon
      // yo'qolmaydi.
      excusedLessons: credit.carriedCreditLessons + deferredByCap,
      discountPercent,
    };

    // `existing` bu yergacha yetib kelsa u FAQAT `REVERSED` bo'lishi mumkin
    // (yuqoridagi qorovul `CHARGED`ni qaytarib yuborgan). Bekor qilingan oy
    // qayta hisoblanadi: eski `transactionId` bo'shatiladi, chunki pastda
    // YANGI ledger qatori yoziladi va eskisi allaqachon teskari qilingan.
    const charge = existing
      ? await tx.enrollmentMonthlyCharge.update({
          where: { id: existing.id },
          data: {
            ...chargeData,
            status: MonthlyChargeStatus.CHARGED,
            transactionId: null,
          },
        })
      : await tx.enrollmentMonthlyCharge.create({ data: chargeData });

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
        perLessonCost: perLessonCostFull,
        creditLessons: credit.creditLessonsUsed,
        discountPercent,
        fullAmount: grossAmountFull,
      },
      tx,
    );

    // Hisob yozildi — demak bu davrning darslari endi O'QUVCHI zimmasida.
    // Markaz oldindan qoplab qo'ygan accrual'lar shu daqiqada UNDIRILGAN
    // hisoblanadi (pastdagi izohga qara).
    await this.setCenterTopUpForPeriod(tx, {
      studentId: enr.studentId,
      groupId: enr.groupId,
      companyId: params.companyId,
      periodYear,
      periodMonth,
      fronted: false,
    });

    return tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: { transactionId: transaction.id },
    });
  }

  /**
   * Lesson dates of this month that another CHARGED charge of the same
   * student in the same group still covers: its `coveredDates` minus the ones
   * it has returned (`frozenOutDates`). A charge written before
   * `coveredDates` existed stores no dates and so takes nothing away.
   */
  private async datesPaidByOtherCharges(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      studentId: number;
      groupId: string;
      periodYear: number;
      periodMonth: number;
    },
  ): Promise<Set<string>> {
    const others = await tx.enrollmentMonthlyCharge.findMany({
      where: {
        studentId: params.studentId,
        groupId: params.groupId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        status: MonthlyChargeStatus.CHARGED,
        enrollmentId: { not: params.enrollmentId },
      },
      select: { coveredDates: true, frozenOutDates: true },
    });
    const paid = new Set<string>();
    for (const other of others) {
      const returned = new Set(other.frozenOutDates ?? []);
      for (const d of other.coveredDates ?? []) {
        if (!returned.has(d)) paid.add(d);
      }
    }
    return paid;
  }

  /**
   * Davrning markaz qoplagan darslarini «undirildi» / «yana markazda» deb
   * belgilaydi — FAQAT BAYROQ, IKKI YO'NALISHDA.
   *
   * Nima uchun kerak: `SalaryAccrual.isCenterTopUp` "markaz bu darsni hali
   * o'z pulidan qoplab turibdi" degani. 12 talik yo'lda u o'z-o'zidan
   * tozalanadi — keyinroq kelgan to'lov darsni yopganda `createAccrual`
   * o'sha tabiiy kalit bilan QAYTA chaqiriladi (`centerFunded: false`) va
   * upsert bayroqni FALSE ga qaytaradi. OYLIK yo'lda esa o'tgan darsga hech
   * qachon qayta accrual yozilmaydi: `accrueMonthlySalary` hisob BOR-YO'QLIGIGA
   * qarab `centerFunded: !charge` deb bir marta yozadi, xolos. Natijada
   * bayroq abadiy yoqilgan qolib, oylik kartadagi `centerStillFronted` va
   * «Markaz qopladi» raqamlari markaz haqiqatda undirmagan pulni oshirib
   * ko'rsatardi.
   *
   * Nega aynan hisob yozilgan/bekor qilingan payt: oylik modelda "o'quvchi
   * qopladi" degani `EnrollmentMonthlyCharge` qatorining `CHARGED` bo'lib
   * turishi — `accrueMonthlySalary` ning O'ZI ham aynan shu mezondan
   * foydalanadi (`centerFunded: !charge`, va `findChargeForLesson` faqat
   * `CHARGED` ni qaytaradi). Hisob balans yetarli-yetarsizligiga qaramay
   * yoziladi (qarzdorda balans manfiyga ketadi), shuning uchun bu yerdagi
   * mezon accrual yozilgandagi mezonning aynan teskarisi — ikkisi hech
   * qachon farq qila olmaydi.
   *
   * IKKI YO'NALISH ham shu sababdan zarur. Hisob bekor qilinganda
   * (`reverseMonthlyCharge`) `findChargeForLesson` o'sha oy uchun endi
   * `null` qaytaradi, ya'ni SHU PAYTDAN KEYIN yoziladigan accrual'lar
   * to'g'ri ravishda `centerFunded: true` bo'ladi — bekor qilishdan OLDIN
   * yozilganlari esa `false` bo'lib qotib qolardi. Bitta oy, bitta
   * yozilish, ikki dars — va ular kim qoplayotgani haqida bir-biriga zid
   * javob berardi.
   *
   * PUL QIMIRLAMAYDI. `amount` ga tegilmaydi, `createAccrual` chaqirilmaydi,
   * ledger'ga hech nima yozilmaydi — shuning uchun `applyAccrualToBalance`
   * idempotentligiga tayanish ham shart emas: u umuman ishga tushmaydi.
   * (Aks holda accrual'ni qayta yozish `lesson-billing.service.ts` dagi
   * `accrueMonthlySalary` izohi ogohlantirgan holatga olib borardi:
   * `reverseAccrualForAttendance` siz qayta narxlash `SalaryAccrual.amount`
   * ni yangilaydi-yu, Transaction va o'qituvchi balansi eski narxda qolib
   * ketadi.)
   *
   * `wasCenterTopUp` HECH QACHON yozilmaydi — u yopishqoq: undirilgan
   * qo'shimchalar sanaladigan bo'lib qolishi kerak (X/Y/Z lifecycle).
   * Orqaga qaytarishda esa u FILTR bo'lib xizmat qiladi: faqat markaz
   * haqiqatda qoplagan qator yana «markazda» bo'la oladi. Bu
   * `isCenterTopUp ⊆ wasCenterTopUp` invariantini saqlaydi — aks holda
   * «hali qoplanmoqda» (Z) «qoplangan edi» (X) dan katta bo'lib ketardi.
   *
   * `reversedAt: null` — bekor qilingan accrual hech bir payroll yig'indisiga
   * kirmaydi, shuning uchun uning bayrog'i ham o'zgartirilmaydi: tarixiy
   * qator qanday bo'lsa shundayligicha qoladi.
   *
   * `lessonDate` — `@db.Date` ustuni, shuning uchun chegara SURILMAGAN UTC
   * sanalari bilan va yuqorisi OCHIQ (`lt`) beriladi (`PeriodBounds` qoidasi).
   */
  private async setCenterTopUpForPeriod(
    tx: Prisma.TransactionClient,
    params: {
      studentId: number;
      groupId: string;
      companyId: number;
      periodYear: number;
      periodMonth: number;
      /** `false` — hisob yozildi (undirildi); `true` — hisob bekor qilindi. */
      fronted: boolean;
    },
  ): Promise<void> {
    await tx.salaryAccrual.updateMany({
      where: {
        companyId: params.companyId,
        studentId: params.studentId,
        groupId: params.groupId,
        reversedAt: null,
        // Faqat holati haqiqatan o'zgaradiganlar.
        isCenterTopUp: !params.fronted,
        // Orqaga qaytarish faqat markaz haqiqatda qoplagan qatorlarga.
        ...(params.fronted ? { wasCenterTopUp: true } : {}),
        lessonDate: {
          gte: new Date(Date.UTC(params.periodYear, params.periodMonth - 1, 1)),
          lt: new Date(Date.UTC(params.periodYear, params.periodMonth, 1)),
        },
      },
      data: { isCenterTopUp: params.fronted },
    });
  }

  /**
   * Butun bir oylik hisobni BEKOR qiladi (admin tuzatishi).
   *
   * `reverseChargeForDeparture` dan farqi: u oyning QOLGAN qismini
   * qaytaradi va hisob `CHARGED` bo'lib qolaveradi; bu esa "bu oy umuman
   * hisoblanmasligi kerak edi" degan to'liq bekor qilish.
   *
   * IKKI yozuv birga o'zgaradi va ular ajralib qolmasligi SHART:
   *   1. ledger — `TransactionsWriteService.reverseMonthlyFee` orqali
   *      (umumiy `reverseTransaction` EMAS: u kassa bilan sinxronlashadigan
   *      turlarni ham qabul qiladi va `metadata.mode` ni tekshirmaydi);
   *   2. `EnrollmentMonthlyCharge.status` -> `REVERSED`.
   *
   * Ikkinchisisiz oy JIMGINA bepul bo'lib qolardi: `createChargeForEnrollment`
   * ham, cron/qorovulning "hisobi yo'q" so'rovi ham hisob QATORI borligini
   * ko'rib, o'sha oyni boshqa hech qachon yozmasdi.
   *
   * Ledger qatoriga mos hisob topilmasa — pul TEGILMAYDI (xato tashlanadi,
   * chaqiruvchining tranzaksiyasi qaytadi). "Balans tiklandi, lekin qaysi
   * oyligi noma'lum" degan holat qolmasligi kerak; teskari qilingan
   * qatorning O'ZINI qayta bekor qilishga urinish ham shu yerda to'xtaydi.
   */
  async reverseMonthlyCharge(
    tx: Prisma.TransactionClient,
    params: {
      transactionId: string;
      companyId: number;
      reason: string;
      performedById?: number;
    },
  ): Promise<{ chargeId: string }> {
    const charge = await tx.enrollmentMonthlyCharge.findFirst({
      where: { transactionId: params.transactionId },
      select: {
        id: true,
        status: true,
        // Markaz qoplagani bayrog'ini qaytarish uchun
        // (`setCenterTopUpForPeriod`).
        studentId: true,
        groupId: true,
        periodYear: true,
        periodMonth: true,
      },
    });
    if (!charge) {
      throw new BadRequestException(
        `Bu ledger qatoriga bog'langan oylik hisob topilmadi: ${params.transactionId}`,
      );
    }
    if (charge.status !== MonthlyChargeStatus.CHARGED) {
      throw new BadRequestException(
        `Oylik hisob allaqachon bekor qilingan: ${charge.id}`,
      );
    }

    await this.transactionsWrite.reverseMonthlyFee(
      {
        transactionId: params.transactionId,
        companyId: params.companyId,
        reason: params.reason,
        performedById: params.performedById,
      },
      tx,
    );

    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: { status: MonthlyChargeStatus.REVERSED },
    });

    // Hisob bekor qilindi — bu oyning darslari yana MARKAZ zimmasida.
    // `createChargeForEnrollment` dagi o'girishning aynan teskarisi; usiz
    // bekor qilishdan oldin yozilgan accrual'lar «o'quvchi qopladi» bo'lib
    // qotib qolardi, keyin yoziladiganlari esa `centerFunded: true` bo'lardi.
    await this.setCenterTopUpForPeriod(tx, {
      studentId: charge.studentId,
      groupId: charge.groupId,
      companyId: params.companyId,
      periodYear: charge.periodYear,
      periodMonth: charge.periodMonth,
      fronted: true,
    });

    return { chargeId: charge.id };
  }

  /**
   * Muzlatish PULINI (yoki haqiqiy ketishda qolgan oy pulini) balansga
   * qaytaradi — `departureDate`dan KEYINGI, hali "muzlatib chiqarilmagan"
   * sanalarni `frozenOutDates`ga qo'shadi.
   *
   * Ikkita chaqiruvchisi bor va ikkalasi ham xuddi shu funksiyani ishlatadi:
   * (1) `students-status.service.ts`ning FROZEN bloki — bu YERDA
   * `departureDate` aslida "muzlatish sanasi"; (2) `status-cascade.service
   * .ts`ning DROPPED/COMPLETED shoxi — bu YERDA haqiqiy ketish sanasi. Ikkala
   * holatda ham semantika bir xil: "shu sanadan KEYINGI darslar endi
   * qoplanmaydi, puli qaytadi" — shuning uchun bitta funksiya ikkalasiga
   * ham xizmat qiladi.
   *
   * QOIDA (2026-09 review, HIGH-1/2/3 — ildiz sabab data-modelda edi):
   * `coveredLessons` shunchaki SON, `coveredDates`ning "boshidan N tasi"
   * qoplangan deb faraz qilardi. Bu muzlatish uchun xavfsiz edi (faqat
   * pastdan kesardi — prefiks qisqarardi), lekin qaytish YUQORIDAN
   * (suffiks) qo'shadi — `prefiks ∪ suffiks` endi SON bilan ifodalanmaydi.
   * Shuning uchun bu funksiya (va uning ko'zgusi, `restoreChargeForReturn`)
   * endi TO'PLAM bilan ishlaydi: `frozenOutDates` — `coveredDates`ning
   * hozir "chiqarilgan" qism-to'plami. Muzlatish shu to'plamga qo'shadi
   * (`∪`), qaytish undan ayiradi (`\`). Union/difference FIKSIRLANGAN
   * to'plam ustida QURILISHIGA KO'RA idempotent — qayta chaqirilganda
   * qo'shiladigan/ayiriladigan narsa yo'q bo'lib chiqadi, kalendardan
   * qayta hisoblashga yoki oldingi "necha dars o'tgan edi" holatini eslab
   * qolishga hojat qolmaydi. `coveredLessons = coveredDates.length -
   * frozenOutDates.length` — endi shunchaki HOSILA, moslik uchun saqlanadi.
   *
   * SANA CHEGARASI KONVENSIYASI (MEDIUM, 2026-09 review): muzlatish
   * `departureDate`NING O'ZINI iste'mol qilingan deb hisoblaydi —
   * `d <= departureDate` qoplangan qoladi, faqat `d > departureDate`
   * chiqariladi. `restoreChargeForReturn`da bu ATAYLAB ASIMMETRIK: qaytish
   * kunining o'zi TIKLANMAYDI (`d > returnDate` bo'lganlarigina qayta
   * hisoblanadi) — ya'ni aynan dars kunida qaytgan o'quvchi o'sha darsni
   * BEPUL oladi. Bu ikkala funksiyada ham bir xil konvensiya: chegara sanasi
   * har doim "hozirgi tomonga" tegishli (muzlatishda — hali qoplangan
   * tomonga; qaytishda — hali muzlatilgan tomonga qoladi).
   *
   * `null` qaytaradi: hisob topilmasa, `REVERSED` bo'lsa, yoki
   * qaytariladigan narsa bo'lmasa (idempotent).
   *
   * Chaqiruvchi Serializable tranzaksiya ichida bo'lishi SHART — `tx` shu
   * tranzaksiyaning mijozi.
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

    const coveredDates = charge.coveredDates ?? [];
    const frozenOutBefore = charge.frozenOutDates ?? [];

    // `remaining`/`frozenOutAfter`: ikkita yo'l bor, `coveredDates`ning
    // bo'sh yoki bo'sh emasligiga qarab.
    let remaining: number;
    let frozenOutAfter: string[] | null = null;

    if (coveredDates.length > 0) {
      // TO'PLAM yo'li (HIGH-1/2/3 tuzatishi): `coveredDates`dan hali
      // chiqarilmagan va `departureDate`dan KEYINGI sanalar yangidan
      // `frozenOutDates`ga qo'shiladi. Union — ikkinchi marta xuddi shu
      // (yoki oldinroq) sana bilan chaqirilsa, bu sanalar allaqachon
      // to'plamda bo'lgani uchun `newlyOut` bo'sh chiqadi va `null`
      // qaytariladi (qurilishiga ko'ra idempotent — pastga qarang).
      const frozenOutSet = new Set(frozenOutBefore);
      const newlyOut = coveredDates.filter(
        (d) => d > day && !frozenOutSet.has(d),
      );
      remaining = newlyOut.length;
      if (remaining === 0) return null;
      frozenOutAfter = [...frozenOutBefore, ...newlyOut].sort();
    } else {
      // `coveredDates` ustuni qo'shilishidan OLDIN yozilgan qator (hisob
      // hech qachon `coveredLessons = 0` bilan yozilmaydi, shuning uchun
      // bo'sh massiv aynan shuni bildiradi). Bunday qatorda sanalarning
      // o'zi yo'q — `frozenOutDates` to'plam sifatida ishlay olmaydi, eski
      // SON-asosli xatti-harakat saqlanadi (muqobili "hech narsa
      // qaytarmaslik" bo'lardi).
      const { excludedDates, addedDates } = await this.resolveMonthPlanDates(
        tx,
        charge.groupId,
        enr.group.branchId,
        periodYear,
        periodMonth,
      );
      const lessonsThroughDeparture = lessonDatesInMonth({
        year: periodYear,
        month: periodMonth,
        exactDays: enr.group.exactDays,
        excludedDates,
        addedDates,
        fromDate: enr.startDate ? tashkentDateStr(enr.startDate) : null,
        toDate: day,
      }).length;
      remaining = Math.max(0, charge.coveredLessons - lessonsThroughDeparture);
      if (remaining === 0) return null;
    }

    // `charge.perLessonCost` ATAYLAB chegirmasiz (o'qituvchi haqi undan
    // hisoblanadi) — qaytariladigan summa esa o'quvchi TO'LAGAN narxda
    // bo'lishi kerak, aks holda chegirmali o'quvchi ortiqcha qaytarib
    // olardi (`discountPercent` default 0 — chegirmasiz yozilishlar uchun
    // bu qatorning natijasi o'zgarmaydi).
    const discountedPerLessonCost = applyDiscount(
      charge.perLessonCost,
      clampDiscount(charge.discountPercent ?? 0),
    );
    const refunded = Math.min(
      remaining * discountedPerLessonCost,
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
        // Lets the payment statement fold this refund into the month's
        // lessons without parsing the description.
        metadata: {
          kind: 'monthly-release',
          enrollmentId: params.enrollmentId,
          period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
          lessons: remaining,
          ...(frozenOutAfter
            ? {
                dates: frozenOutAfter.filter(
                  (d) => !frozenOutBefore.includes(d),
                ),
              }
            : {}),
        },
      },
      tx,
    );

    const newCoveredLessons = frozenOutAfter
      ? coveredDates.length - frozenOutAfter.length
      : charge.coveredLessons - remaining;

    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: {
        coveredLessons: newCoveredLessons,
        chargedAmount: charge.chargedAmount - refunded,
        ...(frozenOutAfter ? { frozenOutDates: frozenOutAfter } : {}),
      },
    });

    return { refunded };
  }

  /**
   * `reverseChargeForDeparture`ning KO'ZGUSI: muzlatishdan chiqqan
   * (FROZEN -> ACTIVE) yozilishga oyning qolgan qismini QAYTA hisoblaydi.
   *
   * Task 1 muzlatishda oyning qolgan darslari pulini balansga qaytardi
   * (`reverseChargeForDeparture` shu yo'l bilan chaqiriladi). Bu funksiya
   * teskarisi: o'quvchi qaytganda, qaytgan kundan keyingi darslar puli
   * QAYTA balansdan yechiladi — aks holda o'quvchi oyning qolgan qismini
   * TEKIN o'qiydi (pul balansda yotadi, dars berilgan, hech qanday hisob
   * yo'q).
   *
   * TO'PLAM MODELI (2026-09 review, HIGH-1/2/3): `reverseChargeForDeparture`
   * `frozenOutDates`ga sanalar QO'SHADI (`∪`), bu funksiya ULARDAN
   * `returnDate`dan KEYINGI qismini AYIRADI (`\`). Difference FIKSIRLANGAN
   * to'plamdan ATAYLAB idempotent: qaytgan sanalar to'plamdan chiqib
   * ketgach, xuddi shu `returnDate` bilan qayta chaqirilsa ayiriladigan
   * narsa qolmaydi — kalendarga yoki `coveredLessons`ning avvalgi qiymatiga
   * qarab "hali qaytarilmadimi" degan taxminga hojat yo'q.
   *
   * SANA CHEGARASI: `returnDate`NING O'ZI qaytarilmaydi — faqat undan
   * KEYINGI sanalar (`d > returnDate`) qayta hisoblanadi.
   * `reverseChargeForDeparture`dagi bilan bir xil konvensiya (uning
   * sinf-darajasidagi izohiga qarang): dars kunining o'zida qaytgan
   * o'quvchi o'sha darsni BEPUL oladi (ataylab, muzlatish tomonining
   * ko'zgusi).
   *
   * `null` qaytaradi: hisob topilmasa, `REVERSED` bo'lsa, hech narsa
   * muzlatib chiqarilmagan bo'lsa, yoki qaytariladigan narsa bo'lmasa
   * (idempotent — yuqoriga qarang).
   *
   * Chaqiruvchi Serializable tranzaksiya ichida bo'lishi SHART — `tx` shu
   * tranzaksiyaning mijozi.
   */
  async restoreChargeForReturn(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      returnDate: Date;
      companyId: number;
      reason: string;
      performedById?: number;
      /**
       * Optional: "bugun" Toshkent 'YYYY-MM-DD' shaklida, BIR martalik
       * chaqiruvchi uchun emas — bir necha o'nlab/yuzlab yozilishni ketma-ket
       * qayta ishlaydigan BATCH chaqiruvchi uchun (`StatusCascadeService`,
       * FROZEN -> ACTIVE shoxi). Har bir tranzaksiya `maxWait 10s / timeout
       * 15s`gacha cho'zilishi mumkin — yuzlab yozilishli sikl real vaqtda
       * Toshkent yarim tunidan o'tib ketishi mumkin. Agar bu funksiya HAR
       * safar `new Date()`ni o'zi qayta hisoblasa, sikl o'rtasida soat kun
       * almashtirib yuboradi va hali bitta ham iteratsiya bajarmagan
       * `returnDate` keyingi iteratsiyalarda to'satdan "backdated" deb rad
       * etilardi (`reverseChargeForDeparture`da xuddi shu sabab bilan xuddi
       * shu muammo bo'lgan — 2026-09 sharh, 3-bosqich). Batch chaqiruvchi
       * shu YERDA BIR marta hisoblangan "bugun"ni har bir iteratsiyaga
       * bab-baravar uzatadi — shunda butun partiya BITTA soatga qarab
       * baholanadi, har biri o'z "hozir"iga emas.
       */
      today?: string;
    },
  ): Promise<{ charged: number; lessons: number } | null> {
    const day = tashkentDateStr(params.returnDate);
    const today = params.today ?? tashkentDateStr(new Date());
    if (day < today) {
      throw new BadRequestException(
        "restoreChargeForReturn: returnDate bugundan oldingi sana bo'lishi mumkin emas — reverseChargeForDeparture dagi bilan bir xil himoya (backdated kirish kelajakdagi chaqiruvchilarni jim xatodan asraydi)",
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
      select: { studentId: true, group: { select: { branchId: true } } },
    });
    if (!enr) return null;

    const coveredDates = charge.coveredDates ?? [];
    const frozenOutBefore = charge.frozenOutDates ?? [];
    // Bo'sh to'plam = "hech narsa muzlatib chiqarilmagan" (hech qachon
    // muzlatilmagan yozilish, YOKI `frozenOutDates` ustuni qo'shilishidan
    // OLDIN yozilgan qator — ikkalasida ham qaytaradigan narsa yo'q).
    if (frozenOutBefore.length === 0) return null;

    // `returnDate`dan KEYIN turgan, hozir muzlatib chiqarilgan sanalar —
    // aynan shular qaytadan qoplanadi. `<= returnDate` bo'lganlari
    // (muzlatish davomida o'tib ketgan darslar) ABADIY chiqarilgan bo'lib
    // qoladi — sinf-darajasidagi izohdagi sabab bilan.
    const toRestore = frozenOutBefore.filter((d) => d > day);
    const missing = toRestore.length;
    if (missing === 0) return null;

    const toRestoreSet = new Set(toRestore);
    const frozenOutAfter = frozenOutBefore.filter((d) => !toRestoreSet.has(d));
    const coveredLessonsNow = coveredDates.length - frozenOutAfter.length;

    // `charge.perLessonCost` ATAYLAB chegirmasiz (o'qituvchi haqi undan
    // hisoblanadi) — qayta hisoblanadigan summa esa o'quvchi TO'LAYDIGAN
    // chegirmali narxda bo'lishi kerak, `reverseChargeForDeparture` dagi
    // bilan bir xil qoida.
    const discountedPerLessonCost = applyDiscount(
      charge.perLessonCost,
      clampDiscount(charge.discountPercent ?? 0),
    );
    const rechargeRaw = missing * discountedPerLessonCost;

    // SIMMETRIK QOPQOQ (HIGH-3 tuzatishi, 2026-09 review — va 2026-09
    // ikkinchi re-review, NEW-2: birinchi versiyasi TOMONI o'zi noto'g'ri
    // edi). Muzlatish tomoni qaytarishni `min(remaining*cost,
    // chargedAmount)` bilan qopqoqlaydi — chunki qoplangan darslarning bir
    // qismi KREDIT bilan (naqd emas) to'langan bo'lishi mumkin, va naqd
    // qaytarish shu naqd miqdoridan oshmasligi kerak. Bu tomon shu
    // qopqoqni QAYTARMASA, muzlatishda qopqoq ishlagan holatlarda
    // (`remaining*cost > chargedAmount`) keyinroq qaytishda `missing*cost`
    // XOM holda qo'shilib, aslida hech qachon qaytarilmagan naqd pul
    // "yaratilardi" — o'quvchidan HAQIQATDA olingandan ko'proq naqd
    // yechilardi.
    //
    // QOPQOQ FORMULASI: reviewer'ning kamaytirishi — `chargedAmount_now =
    // A0 − Σrefunded + Σcharged`, shuning uchun `Σcharged <= Σrefunded`
    // ANIQ o'shanda ushlaydiki, `chargedAmount` hech qachon o'zining
    // yaratilish qiymati `A0`dan OSHMASA. Muzlatish faqat pasaytiradi;
    // qaytish `ceiling(k) = k·perLessonCost_chegirmali − creditAmount`gacha
    // ko'taradi. Bu invariant faqat `N·perLessonCost_chegirmali <= A0`
    // bo'lganda ushlaydi — bu esa dars narxi YUQORIGA dumaloqlanganda
    // (masalan 450 000/14=32 142.857 -> 32 143, 14x32 143=450 002>450 000)
    // BUZILADI. Birinchi versiyada shu YERDA `coveredLessonsNow *
    // discountedPerLessonCost` ishlatilgan edi — bu YUQORIDAGI aynan shu
    // buzilishga olib kelardi (naiv "count x cost" chizig'i `A0` yaratilgan
    // "proratsiya" chizig'idan FARQLI dumaloqlanadi).
    //
    // TO'G'RI qopqoq — `A0`NING O'ZI qanday hisoblangan bo'lsa, ceiling ham
    // AYNAN SHU (proratsiya) chiziqda hisoblanadi: `monthlyPrice` va
    // `plannedLessons` qatorda saqlanadi, shuning uchun ikkinchi mustaqil
    // yaxlitlash yo'li YO'Q — bitta chiziq, ikki nuqtada baholanadi.
    // `creditLessons`/`creditAmount`/`excusedLessons`ning o'ziga HECH
    // QACHON tegilmaydi — ular hisob YARATILGANDA bir marta belgilanadi va
    // shu FIKS holicha qoladi.
    const grossNow = proratedMonthlyAmount(
      charge.monthlyPrice,
      charge.plannedLessons,
      coveredLessonsNow,
    );
    const grossNowDiscounted = applyDiscount(
      grossNow,
      clampDiscount(charge.discountPercent ?? 0),
    );
    const ceiling = Math.max(0, grossNowDiscounted - charge.creditAmount);
    // `ceiling - chargedAmount` manfiy bo'lishi mumkin (masalan, yaxlitlash
    // chekkasida) — tashqi `Math.max(0, ...)` `chargedAmount`ni HECH QACHON
    // KAMAYTIRMASLIKNI kafolatlaydi: bu funksiya faqat QAYTA HISOBLAYDI,
    // hech qachon qaytarmaydi (`reverseChargeForDeparture`ning ishi).
    const charged = Math.max(
      0,
      Math.min(rechargeRaw, ceiling - charge.chargedAmount),
    );
    const chargedAmountAfter = charge.chargedAmount + charged;

    if (charged > 0) {
      // Balansdan MANFIY summa bilan yechish — `reverseChargeForDeparture`
      // musbat summa bilan qaytarganining aksi. Yangi pul metodi
      // yozilmaydi.
      await this.transactionsWrite.createAdjustment(
        {
          studentId: enr.studentId,
          amount: -charged,
          companyId: params.companyId,
          branchId: enr.group.branchId,
          description: `${params.reason} — qaytgandan keyingi ${missing} dars qayta hisoblandi`,
          performedById: params.performedById,
        },
        tx,
      );
    }

    // TO'PLAM yozuvi PUL harakatidan MUSTAQIL ravishda doim yoziladi —
    // qopqoq `charged`ni 0 gacha bosib qo'ysa ham (2026-09 re-review,
    // kosmetik topilma). `missing > 0` bo'lgani uchun bu sanalar HAQIQATDA
    // qaytgan (o'quvchi ularga keladi) — pul cheklovi buni o'zgartirmaydi.
    // Bu yerda ERTAROQ `return` qilish (pul harakati bo'lmasa) sanalarni
    // ABADIY "muzlatib chiqarilgan" holda qoldirar edi — `coveredLessons =
    // coveredDates.length - frozenOutDates.length` hosila invariantini
    // buzib.
    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: {
        coveredLessons: coveredLessonsNow,
        chargedAmount: chargedAmountAfter,
        frozenOutDates: frozenOutAfter,
      },
    });

    return { charged, lessons: missing };
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
            // `status` ATAYLAB shu yerda: bekor qilingan (`REVERSED`) hisob
            // yozilishni qamrovdan CHIQARMASLIGI kerak, aks holda admin
            // bitta oylik hisobni bekor qilsa o'sha oy hech qachon qayta
            // yozilmasdi va bir oylik o'qish jimgina bepulga aylanardi.
            status: MonthlyChargeStatus.CHARGED,
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        startDate: true,
        createdAt: true,
        // Chegirma shu YERDA, bir so'rovda o'qiladi — enrollment boshiga
        // alohida so'rov (N+1) emas.
        student: { select: { discountPercent: true } },
        group: {
          select: {
            id: true,
            branchId: true,
            companyId: true,
            statusEnum: true,
            startDate: true,
            exactDays: true,
            course: { select: { price: true, paymentModel: true } },
          },
        },
      },
    });

    let created = 0;
    let skipped = 0;
    let totalCharged = 0;

    // `payment.excusedCreditEnabled`/`MonthlyCap` filial darajasida
    // qulflanadi (override kompaniyadan ustun) — shuning uchun "butunlay
    // bitta o'qish" TO'G'RI EMAS (filial override'ini yo'qotib qo'yadi),
    // lekin "har enrollment uchun o'qish" ham KERAK EMAS: bitta company
    // bir necha o'nlab enrollmentga ega bo'lgan hovlichada odatda bir necha
    // filial bor, ko'pi bilan. Shu Map filial boshiga BIR MARTA o'qiydi va
    // qolgan barcha shu filialdagi yozilishlar shu keshlangan qiymatdan
    // foydalanadi — Redis sog'lom bo'lganda ham (kamroq round-trip), Redis
    // o'chganda ham (endi 2×filial soni so'rov, 2×370 emas).
    const excusedCreditByBranch = new Map<
      number,
      { enabled: boolean; monthlyCap: number | null }
    >();
    const resolveExcusedCredit = async (branchId: number) => {
      const cached = excusedCreditByBranch.get(branchId);
      if (cached) return cached;
      const [enabled, monthlyCap] = await Promise.all([
        this.settingsService.get(
          params.companyId,
          'payment.excusedCreditEnabled',
          branchId,
        ),
        this.settingsService.get(
          params.companyId,
          'payment.excusedCreditMonthlyCap',
          branchId,
        ),
      ]);
      const resolved = { enabled, monthlyCap };
      excusedCreditByBranch.set(branchId, resolved);
      return resolved;
    };

    for (const enr of enrollments) {
      try {
        const excusedCredit = await resolveExcusedCredit(enr.group.branchId);
        const charge = await this.prisma.$transaction(
          (tx) =>
            this.createChargeForEnrollment(tx, {
              enrollment: enr as ChargeableEnrollment,
              periodYear: params.periodYear,
              periodMonth: params.periodMonth,
              companyId: params.companyId,
              performedById: params.performedById,
              discountPercent: enr.student?.discountPercent ?? 0,
              excusedCredit,
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
   * Oyning MUZLATILADIGAN rejasi — DAVOMAT KALENDARINING KO'ZGUSI.
   *
   * Qaytaradi:
   *  - `excludedDates` — jadvaldagi kunlardan CHIQADIGANLARI;
   *  - `addedDates` — jadvalda yo'q, lekin oyga QO'SHILADIGAN kunlar
   *    (ko'chirilgan darsning yangi kuni).
   *
   * QOIDA BITTA: reja soni oyda ROSTDAN o'tiladigan darslar soniga teng
   * bo'lishi shart. `plannedLessons` endi ikki narsani belgilaydi — bir
   * darsning muzlatilgan narxi (oy narxi / reja) va FIXED_PER_STUDENT
   * o'qituvchi haqining bo'luvchisi (1-javob: haq oydagi dars soniga
   * bog'liq bo'lmasligi kerak). Reja davomatdan bitta kunga farq qilsa,
   * ustoz oyning 12/13 yoki 14/13 ulushini oladi.
   *
   * Shuning uchun bu metod `AttendanceReadService.applyLessonModifications`
   * ni AYNAN takrorlaydi — u "qaysi kun dars kuni" degan savolning yagona
   * javobi:
   *  - bayram kuni asos ro'yxatdan chiqadi (davomatda ham bayram asos
   *    kunlar ichida yo'q);
   *  - bekor qilingan dars chiqadi VA o'sha kunga ko'chirib kelishni ham
   *    to'sadi (davomatdagi `exclude` to'plami);
   *  - ko'chirilgan darsning ASL kuni chiqadi — yangi kun qayerda
   *    bo'lishidan qat'i nazar;
   *  - ko'chirilgan darsning YANGI kuni shu oy ichida bo'lsa qo'shiladi.
   *    Kun allaqachon jadvalda bo'lsa TO'PLAM uni takrorlamaydi, ya'ni oyga
   *    ikkinchi dars qo'shilmaydi.
   *
   * Ilgari bu yerda faqat BAYRAM ko'chirishlari hisobga olinardi
   * (`newDate` shu oy ichida + asl kun bayram bo'lishi shart edi), shuning
   * uchun uchta oddiy ko'chirish rejani davomatdan ayirib yuborardi:
   * keyingi oyga surish (so'rov qatorni umuman qaytarmasdi), jadvaldagi
   * kunga surish (bayram emas deb tashlab ketilardi) va boshqa oydan
   * ko'chirib kelish (reja 13, davomat 14).
   *
   * Bayramning shu oy ichidagi qoplamasi endi ALOHIDA qoida emas: bayram
   * rejadan chiqadi, qoplama kuni esa qo'shiladi — sanoq o'zgarmaydi va
   * `coveredDates` ga dars ROSTDAN o'tiladigan kun tushadi. Qoplama bekor
   * qilingan bo'lsa (1-topilma) yangi kun `vetoed` ichida bo'lgani uchun
   * umuman qo'shilmaydi va bayram rejadan chiqib ketaveradi — alohida
   * "teskari yozuv" qoidasi kerak emas.
   *
   * CHEKLOV — HISOBDAN KEYIN YOZILGAN KO'CHIRISH KO'RINMAYDI. Bu yerda
   * faqat hisob yozilayotgan DAQIQADA bazada turgan qatorlar ko'rinadi.
   * `MonthlyBillingCronService` hisobni oyning belgilangan kunida yozadi va
   * `createChargeForEnrollment` `CHARGED` qatorni qayta hisoblamaydi,
   * `plannedLessons` ni esa boshqa hech kim yangilamaydi. Bu MA'LUM va
   * QABUL QILINGAN kamchilik (dizayn hujjati §4): to'liq yechim
   * `lesson-reschedule.created/updated/deleted` da hisobni qayta
   * hisoblashni talab qiladi va u pul qatorlariga (`TransactionsWrite
   * Service`) ham tegadi — alohida vazifa.
   *
   * Bayramlar `buildHolidayDateSet` orqali olinadi — u ko'p kunlik
   * bayramlarni (date..endDate), filial qamrovini (global + shu filial) va
   * `deletedAt`/`status` filtrlarini to'g'ri hisobga oladi.
   */
  private async resolveMonthPlan(
    tx: Prisma.TransactionClient,
    groupId: string,
    branchId: number,
    year: number,
    month: number,
  ): Promise<{ excludedDates: string[]; addedDates: string[] }> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExclusive = new Date(Date.UTC(year, month, 1));
    const monthEndInclusive = new Date(Date.UTC(year, month, 0));
    const monthStartStr = tashkentDateStr(monthStart);
    const monthEndStr = tashkentDateStr(monthEndInclusive);

    const [group, holidayDates, cancellations, reschedules] = await Promise.all(
      [
        tx.group.findUnique({
          where: { id: groupId },
          select: { startDate: true, endDate: true },
        }),
        buildHolidayDateSet(tx, monthStart, monthEndInclusive, branchId),
        tx.lessonCancellation.findMany({
          where: {
            groupId,
            deletedAt: null,
            date: { gte: monthStart, lt: monthEndExclusive },
          },
          select: { date: true },
        }),
        // ASL kun YOKI yangi kun shu oyga tegsa — qator kerak. Faqat `newDate`
        // bo'yicha so'rash keyingi oyga surilgan darsni ko'rinmas qilardi,
        // faqat `originalDate` bo'yicha so'rash esa boshqa oydan ko'chirib
        // kelingan darsni. `AttendanceReadService` ham aynan shu OR ni yozadi.
        tx.lessonReschedule.findMany({
          where: {
            groupId,
            deletedAt: null,
            OR: [
              { originalDate: { gte: monthStart, lt: monthEndExclusive } },
              { newDate: { gte: monthStart, lt: monthEndExclusive } },
            ],
          },
          select: { originalDate: true, newDate: true },
        }),
      ],
    );

    // `vetoed` — davomatdagi `exclude` to'plami: bu kunlarda dars YO'Q va
    // bu kunlarga boshqa darsni ko'chirib kelib ham bo'lmaydi.
    const vetoed = new Set<string>();
    for (const c of cancellations) vetoed.add(tashkentDateStr(c.date));
    for (const r of reschedules) vetoed.add(tashkentDateStr(r.originalDate));

    // Bayram asos ro'yxatdan chiqadi, LEKIN ko'chirib kelishni to'smaydi:
    // admin darsni ataylab bayram kuniga ko'chirgan bo'lsa davomat o'sha
    // kuni dars deb sanaydi (`applyLessonModifications` aynan shunday).
    const excluded = new Set<string>(vetoed);
    for (const day of holidayDates) excluded.add(day);

    // Guruhning FAOL OYNASI — ko'chirib kelingan kunga (va FAQAT unga)
    // qo'llanadi. `AttendanceReadService.getLessonDates` butun oyni
    // `[group.startDate, group.endDate]` ga qisadi, shuning uchun o'sha
    // oynadan tashqariga ko'chirilgan dars davomatda HECH QACHON o'tmaydi;
    // uni rejaga qo'shish `plannedLessons`ni oshirib, dars narxini
    // pasaytirar va `FIXED_PER_STUDENT` bo'luvchisini kattalashtirardi.
    // Misol: guruh 20.09 da tugaydi, dars 29.08 -> 25.09 ga ko'chirilgan —
    // reja 14, davomat 9.
    //
    // ASOS RO'YXAT esa ATAYLAB qisilmaydi. Guruh oy o'rtasida boshlansa
    // `plannedLessons` baribir butun oyning dars kunlari bo'lib qoladi:
    // dars narxi `oy narxi / plannedLessons` va u BARCHA guruhlarda bir xil
    // bo'lishi kerak. 7 ga qisilsa, 15-sentabrda boshlangan guruhning bitta
    // darsi 64 286 so'mga chiqib ketardi (450 000 / 7), ya'ni o'quvchi
    // guruhi kech boshlangani uchun ikki baravar to'lardi. Hozirgi holda
    // u 450 000 x 7/13 to'laydi va ustoz ham o'sha ulushni oladi —
    // ikkalasi ham proporsional. Demak bu yerda «reja = davomat» tengligi
    // ataylab buziladi; buning sababi dizayn hujjati §4 da yozilgan.
    const groupStartStr = group?.startDate
      ? tashkentDateStr(group.startDate)
      : null;
    const groupEndStr = group?.endDate ? tashkentDateStr(group.endDate) : null;

    const added = new Set<string>();
    for (const r of reschedules) {
      const newDay = tashkentDateStr(r.newDate);
      if (newDay < monthStartStr || newDay > monthEndStr) continue;
      if (groupStartStr && newDay < groupStartStr) continue;
      if (groupEndStr && newDay > groupEndStr) continue;
      if (vetoed.has(newDay)) continue;
      added.add(newDay);
    }

    return { excludedDates: [...excluded], addedDates: [...added] };
  }

  /**
   * Oyning dars kunlari rejasi: CHIQADIGAN va QO'SHILADIGAN kunlar,
   * 'YYYY-MM-DD' ro'yxatlari. Ikkalasi ham `lessonDatesInMonth` ga
   * uzatiladi — qoidaning to'liq bayoni `resolveMonthPlan` JSDoc'ida.
   *
   * PUBLIC ataylab: `LessonBillingService.fallbackMonthlyPerLessonCost`,
   * `scripts/migrate-to-monthly.ts` va `scripts/verify-monthly-migration.ts`
   * HAM shu metoddan o'qiydi — "oyda qaysi kunlar dars kuni" mantig'ining
   * ikkinchi nusxasi yozilmaydi (Task 6 buzilgan sabab shu edi).
   *
   * Nomi ATAYLAB o'zgardi (`resolveExcludedDates` emas): chiqadigan
   * kunlarni olib, qo'shiladiganlarini unutgan chaqiruvchi rejani davomatdan
   * kam sanaydi. Endi bunday chaqiruvchi kompilyatsiyadan o'tmaydi.
   */
  async resolveMonthPlanDates(
    tx: Prisma.TransactionClient,
    groupId: string,
    branchId: number,
    year: number,
    month: number,
  ): Promise<{ excludedDates: string[]; addedDates: string[] }> {
    return this.resolveMonthPlan(tx, groupId, branchId, year, month);
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

  /**
   * Dars sanasiga to'g'ri keladigan KUCHDAGI oylik hisob (o'qituvchi haqi
   * uchun).
   *
   * `REVERSED` qator `null` bilan bir xil ko'rinadi va bu ATAYLAB: bekor
   * qilingan oyda o'quvchidan pul olinmagan, demak o'qituvchining haqi
   * chaqiruvchining zaxira yo'liga (`centerFunded`) tushishi kerak. Aks
   * holda accrual allaqachon teskari qilingan ledger qatoriga bog'lanardi.
   */
  async findChargeForLesson(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    lessonDate: Date,
  ) {
    const day = tashkentDateStr(lessonDate);
    const charge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId,
          periodYear: Number(day.slice(0, 4)),
          periodMonth: Number(day.slice(5, 7)),
        },
      },
    });
    return charge?.status === MonthlyChargeStatus.CHARGED ? charge : null;
  }
}
