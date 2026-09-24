/**
 * `--apply` ning pul harakatlantiruvchi yadrosi — bitta O'QUVCHI uchun,
 * bitta Serializable tranzaksiya ichida.
 *
 * Nima uchun bitta funksiya, bitta o'quvchi: talab shu — 370 tadan bittasi
 * xato bersa, qolgan 369 tasi to'xtamasligi kerak, va qayta ishga tushirish
 * (resume) hech kimni ikki marta hisoblamasligi kerak. Shu ikkalasi bitta
 * yechim bilan yopiladi: har o'quvchi — barcha yozilishlari bilan birga —
 * o'zining alohida tranzaksiyasida, va har bir qadam o'zi idempotent (allaqachon
 * bajarilgan bo'lsa, hech narsa qilmaydi). Xatolik shu tranzaksiyani qaytaradi,
 * qolganlariga tegmaydi.
 *
 * Pul yozadigan HAR bir qadam mavjud servisga delegatsiya qiladi — bu yerda
 * yangi arifmetika YO'Q:
 *  1. `EnrollmentBillingService.refundPrepaidToBalance` — qulflangan
 *     prepaid'ni balansga qaytaradi (allaqachon 0 bo'lsa — no-op).
 *  2. `TransactionsWriteService.reverseTransaction` — sentabrning eski
 *     (LESSON_PACK) LESSON_DEDUCTION qatorlarini teskari qiladi. ATAYLAB
 *     `reverseMonthlyFee` EMAS: o'sha metod faqat `metadata.mode ===
 *     'MONTHLY_PERIOD'` qatorlarni qabul qiladi va boshqasini rad etadi —
 *     bu qatorlar hali LESSON_PACK davridan, `reverseTransaction` esa har
 *     qanday tur uchun ishlaydigan umumiy teskari qiluvchi (ADR-0004:
 *     summasi asl qatorning ishorasidan, `Math.abs` yo'q).
 *  3. `Enrollment.prepaidLessonsRemaining`/`cycleLessonIndex` nolga.
 *  4. `MonthlyChargeService.createChargeForEnrollment` — xuddi cron
 *     ishlatadigan yo'lning o'zi.
 *  5. `SalaryAccrualService.reverseAccrualForAttendance` + `createAccrual` —
 *     sentabr davridagi har bir o'tilgan (billable) darsni YANGI muzlatilgan
 *     narxda qayta hisoblaydi. AVVAL reverse, KEYIN create — aks holda
 *     `SalaryAccrual.amount` yozuv va pul (Transaction + o'qituvchi balansi)
 *     bir-biridan uzilib qoladi (`accrueMonthlySalary` sharhi,
 *     `lesson-billing.service.ts`).
 *
 * ## Nega `Course.paymentModel` bu YERDA almashtirilmaydi (2026-09-03)
 *
 * Avval 4-qadam `Course.paymentModel = MONTHLY` edi — HAR O'QUVCHINING
 * tranzaksiyasi ichida. `paymentModel` esa KURS darajasidagi maydon:
 * prodda bitta "Standart" kursda 51 guruh, ~370 yozilish bor. Ya'ni
 * BIRINCHI o'quvchi commit bo'lgan lahzada, ishlab turgan backend qolgan
 * ~300 ta HALI KO'CHMAGAN kursdoshni MONTHLY deb ko'ra boshlardi:
 *
 *   - `MonthlyBillingWatchdogService` har kuni 04:00 da
 *     `createChargesForPeriod` chaqiradi va uning yagona istisnosi "shu davr
 *     uchun hisobi bor". Ko'chmagan har bir faol yozilish shartga TUSHADI ->
 *     to'liq oylik hisob yoziladi: prepaid'i qaytarilmagan, sentabr
 *     yechimlari bekor qilinmagan. ~300 x 450 000 ~ 135 mln so'm.
 *   - Bundan tuzalib bo'lmasdi: qorovul yozgan hisob o'sha yozilishni
 *     migratsiyaning O'Z qamrovidan chiqarardi (`monthlyCharges: { none }`),
 *     shuning uchun haqiqiy ishga tushirish uni O'TKAZIB YUBORIB, 0 kod
 *     bilan "muvaffaqiyat" deb chiqardi.
 *   - Cron kutish ham shart emas: `processAttendanceBilling` o'sha zahoti
 *     oylik shoxga o'tardi — darslar hisoblanmay qolardi, o'qituvchi haqi
 *     esa markaz hisobidan (`centerFunded`) ketardi.
 *
 * Shuning uchun bayroq bu funksiyadan CHIQARILDI. Uni butun o'tish
 * tugagandan KEYIN, alohida yakuniy qadam sifatida `migrate-to-monthly.ts`
 * (`flipCoursesToMonthly`) qo'yadi — va faqat o'sha kursda hisobsiz qolgan
 * yozilish qolmagan bo'lsa. `--limit` bilan ishlaganda bayroq UMUMAN
 * almashmaydi.
 *
 * Kursning bu yerda almashmagani hisob yozishga xalaqit bermaydi:
 * `createChargeForEnrollment` ga uzatiladigan `ChargeableEnrollment`
 * nusxasida `paymentModel` allaqachon MONTHLY deb beriladi (pastga qarang).
 *
 * ## Nega prepaid qaytarish BEKOR QILISHDAN OLDIN (2026-09-03 tuzatish)
 *
 * Avvalgi tartib teskari edi (avval bekor, keyin prepaid) va IKKI xato berardi:
 *
 * 1. **Narx ikki barobar.** `prepaidRefundValue` prepaid'ning bahosini eng
 *    so'nggi BEKOR QILINMAGAN `LESSON_DEDUCTION` qatoridan oladi
 *    (`findFirst({ reversedAt: null }, orderBy createdAt desc)`).
 *    `reverseTransaction` esa aslini `reversedAt` bilan belgilab, YANGI
 *    teskari qatorni AYNI o'sha `type`/`enrollmentId` bilan, lekin
 *    `metadata`SIZ yozadi. Shu sababli qidiruv o'sha metadatasiz teskari
 *    qatorga tushib, `lessonsCovered = 0` ko'rardi va chegirmasiz
 *    `course.price / lessonPaymentCount` zaxira yo'liga qulardi. Dev'da
 *    o'lchandi: 450 000 lik kurs, 50% chegirma, 11 dars qolgan — bekor
 *    qilishdan OLDIN 206 250, KEYIN 412 500. Aynan ikki barobar.
 * 2. **Bir batch ikki marta qaytardi.** `FULL_CYCLE`/`PARTIAL` yechimi
 *    `prepaidLessonsRemaining`ni O'ZI o'rnatadi. O'sha yechimni bekor qilish
 *    butun batchni balansga qaytaradi; ustiga prepaid qaytarish o'sha
 *    batchning sarflanmagan qismini IKKINCHI marta qaytarardi.
 *
 * Ikkalasi bitta qoida bilan yopiladi: prepaid'ni qoplab turgan batch
 * ANIQLANADI (hech narsa bekor qilinmasdan oldin), va
 *   - batch shu davr ichida bo'lsa (ya'ni uni 2-qadam BEKOR QILADI) —
 *     prepaid qaytarish O'TKAZIB YUBORILADI, hisoblagich shunchaki nolga
 *     tushadi (pul bekor qilish orqali qaytadi);
 *   - batch davrdan oldingi bo'lsa (masalan avgust) — prepaid qaytariladi,
 *     va endi bu bekor qilishdan OLDIN bo'lgani uchun to'g'ri (chegirmali)
 *     narxda hisoblanadi.
 *
 * Natija bashorat bilan qator-qator solishtiriladi
 * (`EnrollmentToMigrate.expectedPrepaidRefund`) — mos kelmasa tranzaksiya
 * qaytariladi.
 *
 * Davomat (`Attendance`) qatorlariga UMUMAN tegilmaydi — darslar bo'lib
 * o'tgan, tarixda qoladi. Faqat pul tomoni ko'chadi.
 */
import {
  AttendanceStatus,
  PaymentModel,
  Prisma,
  TransactionType,
} from '@prisma/client';
import type { ChargeableEnrollment } from '../../src/billing/monthly-charge.service';
import {
  addMonthsToMonthKey,
  utcMidnightFromDateStr,
} from '../../src/common/date/tashkent';
import type { CarriedIn } from './carried-in-lessons';

// CLAUDE.md "Status transition matrix": ABSENT ham billable — dars o'tilgan
// bo'lsa, to'langan hisoblanadi. Faqat EXCUSED hisoblanmaydi.
const BILLABLE_STATUSES: ReadonlySet<AttendanceStatus> = new Set([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.ABSENT,
]);

export interface ApplyMigrationDeps {
  reverseTransaction: (
    originalId: string,
    params: { performedById?: number; reason?: string },
    tx: Prisma.TransactionClient,
  ) => Promise<{ amount: number }>;
  refundPrepaidToBalance: (
    tx: Prisma.TransactionClient,
    params: { enrollmentId: string; reason?: string; performedById?: number },
  ) => Promise<{ refunded: number; lessons: number } | null>;
  createChargeForEnrollment: (
    tx: Prisma.TransactionClient,
    params: {
      enrollment: ChargeableEnrollment;
      periodYear: number;
      periodMonth: number;
      companyId: number;
      performedById?: number;
      discountPercent?: number;
    },
  ) => Promise<{
    chargedAmount: number;
    perLessonCost: number;
    transactionId: string | null;
    /**
     * Shu oyning muzlatilgan dars soni. `createAccrual`ga `lessonDivisor`
     * sifatida ELTILADI — aks holda oylik kursda `FIXED_PER_STUDENT`
     * o'qituvchi 12 ga bo'lib olardi, migratsiya hisoboti esa
     * (`migrate-to-monthly.ts` dagi `teacherPayDelta`) o'sha raqamni
     * `plannedLessons`ga bo'lib ko'rsatardi — CEOga aytilgan summa
     * ledgerdagidan farq qilardi.
     */
    plannedLessons: number;
  } | null>;
  reverseAccrualForAttendance: (params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    lessonDate: Date;
    reversedById?: number;
    reversalReason?: string;
    tx: Prisma.TransactionClient;
  }) => Promise<unknown>;
  /**
   * `null` qaytishi MUMKIN (`SalaryAccrualService.createAccrual`:
   * `deductionTransactionId` yo'q, yoki dars davri ham, joriy davr ham
   * yopilgan). Tip ATAYLAB `unknown` emas — 6-qadam AVVAL reverse qiladi,
   * shuning uchun jim `null` o'qituvchining o'sha darsini yo'q qilardi.
   */
  createAccrual: (params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    attendanceId: string;
    lessonDate: Date;
    perLessonCost: number;
    companyId: number;
    deductionTransactionId?: string | null;
    /**
     * Oylik kursdagi `FIXED_PER_STUDENT` bo'luvchisi. ATAYLAB MAJBURIY,
     * `createAccrual`ning o'zida ixtiyoriy bo'lsa ham: bu skript FAQAT
     * oylik yo'lni yozadi, va maydon tipda umuman yo'q bo'lganda
     * `npm run typecheck` uzatilmaganini ko'ra olmasdi.
     */
    lessonDivisor: number;
    tx: Prisma.TransactionClient;
  }) => Promise<{ id: string } | null>;
  /**
   * The month's lessons a pack bought BEFORE the month paid for
   * (carried-in-lessons.ts). Read before anything is written: once step 2
   * reverses the month's own packs, the coverage FIFO would push those
   * lessons into the earlier pack and over-credit it.
   */
  computeCarriedIn: (
    tx: Prisma.TransactionClient,
    enrollment: { id: string; startDate: Date | null },
  ) => Promise<CarriedIn>;
  /** TransactionsWriteService.createAdjustment — books the carried-in credit. */
  createAdjustment: (
    params: {
      studentId: number;
      amount: number;
      description: string;
      branchId?: number;
      companyId: number;
      performedById?: number;
      metadata?: Prisma.InputJsonValue;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<{ id: string }>;
}

/** Migratsiya qamrovidagi bitta yozilish — `courseId` alohida, chunki
 * yakuniy `Course.paymentModel` qadami (`flipCoursesToMonthly`) shu
 * ro'yxatdan qaysi kurslarni almashtirishni biladi (ChargeableEnrollment
 * buni o'z ichiga olmaydi). */
export interface EnrollmentToMigrate {
  enrollment: ChargeableEnrollment;
  courseId: string;
  discountPercent: number;
  /**
   * Guruh ACTIVE (ya'ni `createChargeForEnrollment` unga hisob yozadi).
   * `false` — PAUSED guruh: sentabr yechimlari BEKOR QILINMAYDI va oylik
   * hisob YOZILMAYDI (o'tilmagan darsga hisob yo'q, o'tilgan darsga esa
   * o'rniga hech narsa qo'yilmasa bekor qilish sovg'a bo'lardi). Prepaid
   * baribir qaytariladi va kurs baribir MONTHLY'ga o'tadi — yakuniy qadam
   * bayroqni kurs darajasida almashtiradi, va MONTHLY
   * yo'lida `prepaidLessonsRemaining` umuman o'qilmaydi
   * (`lesson-billing.service.ts` MONTHLY shoxida prepaid mantig'iga
   * yetib bormaydi), ya'ni qaytarilmagan prepaid abadiy qotib qolardi.
   */
  chargeable: boolean;
  /**
   * Bashorat (`--dry-run` CSV) shu yozilish uchun kutgan prepaid qaytarish
   * summasi. Haqiqiy natija bundan farq qilsa tranzaksiya qaytariladi —
   * "hisobotda ko'rgan raqam bazaga tushmadi" holati jim o'tmasligi kerak.
   */
  expectedPrepaidRefund: number;
  /**
   * Prepaid qaytarish O'TKAZIB YUBORILGANDA (davr ichidagi batch uni
   * qoplaydi): bekor qilish qaytarishi KUTILAYOTGAN summa. Aks holda 0.
   *
   * Nega kerak: "prepaid'ni qoplab turgan batch — eng so'nggi bekor
   * qilinmagan `LESSON_DEDUCTION`" degan qoida haqiqiy LESSON_PACK oqimida
   * to'g'ri, lekin bu FARAZ. Agar prodda qo'lda tuzatilgan qator uni buzsa,
   * yozilishning prepaid'i qaytarilMASDAN nolga tushardi va HAMMA tekshiruv
   * baribir o'tardi: bashorat ham xuddi shu qoidani ishlatadi, prepaid oxirida
   * 0 bo'ladi, balans formulasi ham to'g'ri chiqadi. Shuning uchun o'tkazib
   * yuborish faraziga qarshi HAQIQIY dalil talab qilinadi: bekor qilingan
   * qatorlar ichida aynan o'sha batch bormi va qaytgan summa shu qiymatdan
   * kam emasmi.
   */
  prepaidCoveredByReversal: number;
  /**
   * The carried-in credit the dry-run promised for this enrollment. It is
   * recounted inside the transaction; a mismatch aborts the student, the same
   * guard `expectedPrepaidRefund` has.
   */
  expectedCarriedIn: { lessons: number; value: number };
}

export interface ApplyStudentParams {
  tx: Prisma.TransactionClient;
  deps: ApplyMigrationDeps;
  studentId: number;
  companyId: number;
  performedById?: number;
  periodYear: number;
  periodMonth: number;
  /** Sentabr oyi (yoki --period) boshlanishi, tashkentDayRangeUtc dan. */
  periodGte: Date;
  /** Davr oxiridan KEYINGI kun boshi — [periodGte, periodLt) yarim ochiq. */
  periodLt: Date;
  enrollments: EnrollmentToMigrate[];
}

export interface ApplyStudentResult {
  studentId: number;
  oldBalance: number;
  prepaidRefund: number;
  /** Money credited back for lessons an earlier pack had already paid for. */
  carriedInCredit: number;
  reversedSeptember: number;
  monthlyCharge: number;
  newBalance: number;
  reversedDeductionCount: number;
  accrualsRecomputed: number;
  /** Shu o'quvchi uchun HAQIQATDA yozilgan yangi oylik hisob soni. */
  chargesCreated: number;
  /**
   * Hisob yozilmagan yozilishlar soni: PAUSED guruh, yoki
   * `createChargeForEnrollment` null qaytargan holat (oyda dars kuni yo'q,
   * yozilish oy tugagandan keyin boshlangan). Bular qamrovda QOLADI —
   * `verify-monthly-migration.ts` ularni nomma-nom ko'rsatadi.
   */
  chargesSkipped: number;
  /**
   * Aynan qaysi yozilishlar hisobsiz qoldi (`chargesSkipped` ning nomlari).
   *
   * Yakuniy `Course.paymentModel` qadami shularsiz ishlay olmaydi: u
   * "bu kursda hisobsiz qolgan yozilish bormi" deb so'raydi, va BILIB
   * o'tkazib yuborilganlar (PAUSED guruh, oyda dars kuni yo'q) javobni
   * abadiy "ha" qilib, bayroqni hech qachon almashtirmasdi.
   */
  skippedEnrollmentIds: string[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Bitta davomat sanasi uchun o'qituvchilarni aniqlaydi.
 *
 * `LessonBillingService.resolveTeachersForLesson`ning ko'chirmasi — o'sha
 * metod `private`, eksport qilinmagan. Pul yozmaydi (faqat o'qiydi), shuning
 * uchun bu yerda mustaqil so'rov sifatida takrorlash "pul mantig'ini qayta
 * yozish" degani emas — TransactionsWriteService/SalaryAccrualService/
 * EnrollmentBillingService kabi HAQIQIY yozuvchi servislar hammasi
 * chaqiriladi, faqat "kimga" degan qidiruv ikki joyda bor.
 */
async function resolveTeachersForLesson(
  tx: Prisma.TransactionClient,
  groupId: string,
  lessonDate: Date,
): Promise<number[]> {
  const override = await tx.lessonTeacherOverride.findFirst({
    where: { groupId, date: lessonDate, deletedAt: null },
    select: { teacherIds: true },
  });
  if (override) return override.teacherIds;
  const groupTeachers = await tx.groupTeacher.findMany({
    where: { groupId },
    select: { teacherId: true },
  });
  return groupTeachers.map((t) => t.teacherId);
}

export async function applyMigrationForStudent(
  params: ApplyStudentParams,
): Promise<ApplyStudentResult> {
  const { tx, deps } = params;

  const studentBefore = await tx.student.findUniqueOrThrow({
    where: { id: params.studentId },
    select: { balance: true },
  });
  const oldBalance = studentBefore.balance;

  const reason =
    `Oylik to'lovga o'tish migratsiyasi — ` +
    `${params.periodYear}-${pad2(params.periodMonth)}`;

  // Attendance.date is @db.Date: bound it by UTC-midnight dates. The
  // Tashkent-shifted periodGte/periodLt are for timestamp columns only.
  const periodKey = `${params.periodYear}-${pad2(params.periodMonth)}`;
  const monthFirstDate = utcMidnightFromDateStr(`${periodKey}-01`);
  const nextMonthFirstDate = utcMidnightFromDateStr(
    `${addMonthsToMonthKey(periodKey, 1)}-01`,
  );

  let prepaidRefund = 0;
  let carriedInCredit = 0;
  let reversedSeptember = 0;
  let monthlyCharge = 0;
  let reversedDeductionCount = 0;
  let accrualsRecomputed = 0;
  let chargesCreated = 0;
  let chargesSkipped = 0;
  const skippedEnrollmentIds: string[] = [];

  for (const item of params.enrollments) {
    const enr = item.enrollment;

    // ── 0. HECH NARSA BEKOR QILINMASDAN OLDIN: prepaid'ni qoplab turgan
    // batchni aniqlash. Fayl boshidagi "Nega prepaid qaytarish bekor
    // qilishdan oldin" izohiga qarang — bu ikkita xatoning (2x narx va
    // ikki marta qaytarish) yagona kaliti. ────────────────────────────────
    const fundingBatch = await tx.transaction.findFirst({
      where: {
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        enrollmentId: enr.id,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    const fundedInPeriod =
      !!fundingBatch &&
      fundingBatch.createdAt >= params.periodGte &&
      fundingBatch.createdAt < params.periodLt;

    // ── 0b. Lessons of the month an earlier pack already paid for. Counted
    // BEFORE step 1 and step 2 write anything. Only a chargeable enrollment
    // is credited — a PAUSED one keeps its pack billing. ─────────────────
    const carriedIn = item.chargeable
      ? await deps.computeCarriedIn(tx, enr)
      : { lessons: 0, value: 0, batches: [] };
    if (
      carriedIn.value !== item.expectedCarriedIn.value ||
      carriedIn.lessons !== item.expectedCarriedIn.lessons
    ) {
      throw new Error(
        `Yozilish ${enr.id}: avgust darslari bashorati ${item.expectedCarriedIn.lessons} dars / ${item.expectedCarriedIn.value}, ` +
          `haqiqatda ${carriedIn.lessons} dars / ${carriedIn.value}. Migratsiya to'xtatildi, hech narsa yozilmadi.`,
      );
    }

    // ── 1. Qulflangan prepaid'ni balansga qaytarish. Allaqachon 0 bo'lsa
    // (avvalgi urinishda bajarilgan yoki umuman bo'lmagan) — null, no-op.
    // Batch shu davr ichida VA u 2-qadamda bekor qilinadigan bo'lsa —
    // o'tkazib yuboriladi: bekor qilish o'sha pulni allaqachon qaytaradi. ──
    const skipPrepaidRefund = item.chargeable && fundedInPeriod;
    let enrollmentPrepaidRefund = 0;
    if (!skipPrepaidRefund) {
      const refund = await deps.refundPrepaidToBalance(tx, {
        enrollmentId: enr.id,
        reason: `${reason} — oldindan to'langan darslar balansga qaytarildi`,
        performedById: params.performedById,
      });
      if (refund) enrollmentPrepaidRefund = refund.refunded;
    }
    if (enrollmentPrepaidRefund !== item.expectedPrepaidRefund) {
      throw new Error(
        `Yozilish ${enr.id}: prepaid qaytarish bashorati ${item.expectedPrepaidRefund}, ` +
          `haqiqatda ${enrollmentPrepaidRefund}. Migratsiya to'xtatildi, hech narsa yozilmadi.`,
      );
    }
    prepaidRefund += enrollmentPrepaidRefund;

    // ── 2. Sentabrning eski (LESSON_PACK) LESSON_DEDUCTION qatorlarini
    // teskari qilish. Idempotent: allaqachon teskari qilingan qator
    // `reversedAt: null` filtrida ko'rinmaydi — qayta ishga tushirish
    // hech narsa topmaydi va 0 qo'shadi.
    //
    // PAUSED guruhda (chargeable=false) BEKOR QILINMAYDI: o'rniga qo'yiladigan
    // oylik hisob yo'q, demak bekor qilish o'tilgan darsni bepul qilib
    // qo'yardi. ──────────────────────────────────────────────────────────
    const reversedIds: string[] = [];
    let enrollmentReversed = 0;
    if (item.chargeable) {
      const deductions = await tx.transaction.findMany({
        where: {
          type: TransactionType.LESSON_DEDUCTION,
          reversedAt: null,
          enrollmentId: enr.id,
          createdAt: { gte: params.periodGte, lt: params.periodLt },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      for (const d of deductions) {
        const reversal = await deps.reverseTransaction(
          d.id,
          { performedById: params.performedById, reason },
          tx,
        );
        // Asl qator manfiy edi -> teskarisi musbat (ADR-0004, Math.abs yo'q —
        // ishora reverseTransaction'ning o'zidan, shu yerda faqat yig'indiga
        // qo'shiladi).
        reversedSeptember += reversal.amount;
        enrollmentReversed += reversal.amount;
        reversedDeductionCount += 1;
        reversedIds.push(d.id);
      }
    }

    // ── 2b. O'TKAZIB YUBORISH FARAZINI ISBOTLASH. Prepaid qaytarilmagan
    // bo'lsa, "uni bekor qilish qopladi" degan gap DALIL bilan tasdiqlanishi
    // kerak — aks holda prepaid jimgina yo'qolardi va bitta ham tekshiruv
    // yiqilmasdi (`prepaidCoveredByReversal` izohiga qarang). ─────────────
    if (skipPrepaidRefund) {
      if (!fundingBatch || !reversedIds.includes(fundingBatch.id)) {
        throw new Error(
          `Yozilish ${enr.id}: prepaid qaytarish o'tkazib yuborildi, chunki uni ` +
            `${fundingBatch?.id ?? '(topilmagan)'} batchi qoplaydi deb hisoblangan edi — ` +
            `lekin o'sha qator bekor qilinganlar ichida YO'Q. ` +
            `Migratsiya to'xtatildi, hech narsa yozilmadi.`,
        );
      }
      if (enrollmentReversed < item.prepaidCoveredByReversal) {
        throw new Error(
          `Yozilish ${enr.id}: bekor qilish ${enrollmentReversed} qaytardi, ` +
            `qaytarilmagan prepaid esa ${item.prepaidCoveredByReversal} turadi — ` +
            `farq o'quvchidan yo'qolardi. Migratsiya to'xtatildi, hech narsa yozilmadi.`,
        );
      }
    }

    // ── 3. Hisoblagichlarni nolga (idempotent — allaqachon 0 bo'lsa ham
    // zararsiz). ─────────────────────────────────────────────────────────
    await tx.enrollment.update({
      where: { id: enr.id },
      data: { prepaidLessonsRemaining: 0, cycleLessonIndex: 0 },
    });

    // ── 4. Sentabr oylik hisobini yaratish — cron ishlatadigan XUDDI SHU
    // yo'l. Chegirma o'tkaziladi (default 0'ga tushib qolmaydi). Avvaldan
    // mavjud bo'lsa (qayta ishga tushirish), servis o'zi topib qaytaradi —
    // lekin bu holda pul YANGI harakatlanmagan, shuning uchun
    // `monthlyCharge` yig'indisiga faqat HAQIQIY YANGI yozuv qo'shiladi
    // (pastdagi `existingCharge` tekshiruvi). Aks holda qayta ishga
    // tushirish "kutilgan balans" formulasini ikki marta hisoblab, haqiqiy
    // xatosiz o'quvchini soxta xato deb to'xtatib qo'yardi. ───────────────
    const existingCharge = item.chargeable
      ? await tx.enrollmentMonthlyCharge.findUnique({
          where: {
            enrollmentId_periodYear_periodMonth: {
              enrollmentId: enr.id,
              periodYear: params.periodYear,
              periodMonth: params.periodMonth,
            },
          },
          select: { id: true },
        })
      : null;

    const chargeableEnrollment: ChargeableEnrollment = {
      ...enr,
      group: {
        ...enr.group,
        course: { ...enr.group.course, paymentModel: PaymentModel.MONTHLY },
      },
    };
    const charge = item.chargeable
      ? await deps.createChargeForEnrollment(tx, {
          enrollment: chargeableEnrollment,
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
          companyId: params.companyId,
          performedById: params.performedById,
          discountPercent: item.discountPercent,
        })
      : null;

    const isFreshCharge = !!charge && !existingCharge;
    if (isFreshCharge) {
      monthlyCharge += charge.chargedAmount;
      chargesCreated += 1;
    } else if (!existingCharge) {
      // Hisob YOZILMADI: PAUSED guruh, oyda dars kuni yo'q, yoki yozilish
      // oy tugagandan keyin boshlangan. Yozilish qamrovda qoladi.
      chargesSkipped += 1;
      skippedEnrollmentIds.push(enr.id);
    }

    // ── 4b. Credit the carried-in lessons back, once. Only next to a FRESH
    // charge: that charge is what bills those lessons again, and writing it
    // takes the enrollment out of scope, so a rerun can never credit twice.
    //
    // `marker` starting with 'overcharge' is what makes
    // reports-financial.service.ts net this row out of recognized revenue:
    // the earlier pack already recognized these lessons, and the monthly
    // charge recognizes them a second time. ─────────────────────────────
    if (isFreshCharge && carriedIn.value > 0) {
      await deps.createAdjustment(
        {
          studentId: params.studentId,
          amount: carriedIn.value,
          description: `${reason} — ${carriedIn.lessons} ta dars oldingi oyda to'langan edi, qaytarildi`,
          branchId: enr.group.branchId,
          companyId: params.companyId,
          performedById: params.performedById,
          metadata: {
            marker: 'overcharge-monthly-carried-in',
            migration: 'monthly-carried-in',
            period: periodKey,
            enrollmentId: enr.id,
            lessons: carriedIn.lessons,
            batches: carriedIn.batches.map((b) => ({
              deductionId: b.deductionId,
              lessons: b.lessons,
              value: b.value,
            })),
          },
        },
        tx,
      );
      carriedInCredit += carriedIn.value;
    }

    // ── 5. Sentabr davridagi o'tilgan darslar uchun o'qituvchi haqini
    // YANGI muzlatilgan narxda qayta hisoblash. Faqat YANGI hisob
    // yaratilganda (yuqoridagi bilan bir xil sabab — qayta ishga tushirish
    // shu qadamni ikkinchi marta takrorlamasligi kerak: birinchi
    // muvaffaqiyatli urinishda accrual allaqachon yangi narxda). ─────────
    if (isFreshCharge && charge) {
      // I4: `createAccrual` `deductionTransactionId` bo'lmasa jim `null`
      // qaytaradi. Bu yerda AVVAL reverse qilinadi, shuning uchun jim null
      // o'qituvchining o'sha darsini yo'q qilardi — tekshiruv shu bosqichda,
      // bitta ham reverse yozilmasdan oldin.
      if (!charge.transactionId) {
        throw new Error(
          `Yozilish ${enr.id}: oylik hisob yozildi, lekin ledger qatori (transactionId) yo'q — ` +
            `o'qituvchi haqini bog'lash mumkin emas. Migratsiya to'xtatildi, hech narsa yozilmadi.`,
        );
      }
      const lessons = await tx.attendance.findMany({
        where: {
          groupId: enr.groupId,
          studentId: params.studentId,
          date: { gte: monthFirstDate, lt: nextMonthFirstDate },
          status: { in: [...BILLABLE_STATUSES] },
        },
        select: { id: true, date: true, groupId: true },
      });
      for (const lesson of lessons) {
        const teacherIds = await resolveTeachersForLesson(
          tx,
          lesson.groupId,
          lesson.date,
        );
        for (const teacherId of teacherIds) {
          await deps.reverseAccrualForAttendance({
            teacherId,
            studentId: params.studentId,
            groupId: lesson.groupId,
            lessonDate: lesson.date,
            reversedById: params.performedById,
            reversalReason: `${reason} — narx muzlatildi`,
            tx,
          });
          const accrual = await deps.createAccrual({
            teacherId,
            studentId: params.studentId,
            groupId: lesson.groupId,
            attendanceId: lesson.id,
            lessonDate: lesson.date,
            perLessonCost: charge.perLessonCost,
            // Oylik yo'lda bo'luvchi — oyning muzlatilgan dars soni, kursdagi
            // `lessonPaymentCount` (12) emas. CEO (21.09.2026, 1-javob):
            // ustoz oyligi oydagi dars soniga bog'liq emas. Usiz migratsiya
            // ledgerga `value/12` yozar, CEOga ko'rsatilgan hisobot esa
            // `value/plannedLessons` deb aytardi.
            lessonDivisor: charge.plannedLessons,
            companyId: params.companyId,
            deductionTransactionId: charge.transactionId,
            tx,
          });
          if (!accrual) {
            throw new Error(
              `O'qituvchi ${teacherId}, dars ${lesson.id}: eski hisob bekor qilindi, ` +
                `yangisi YOZILMADI (createAccrual null qaytardi — oylik davri yopiq bo'lishi mumkin). ` +
                `Migratsiya to'xtatildi, hech narsa yozilmadi.`,
            );
          }
          accrualsRecomputed += 1;
        }
      }
    }
  }

  const expectedNewBalance =
    oldBalance +
    prepaidRefund +
    carriedInCredit +
    reversedSeptember -
    monthlyCharge;
  const studentAfter = await tx.student.findUniqueOrThrow({
    where: { id: params.studentId },
    select: { balance: true },
  });
  const newBalance = studentAfter.balance;

  if (newBalance !== expectedNewBalance) {
    throw new Error(
      `O'quvchi ${params.studentId}: kutilgan ${expectedNewBalance}, chiqdi ${newBalance}. ` +
        `Migratsiya to'xtatildi, hech narsa yozilmadi.`,
    );
  }

  return {
    studentId: params.studentId,
    oldBalance,
    prepaidRefund,
    carriedInCredit,
    reversedSeptember,
    monthlyCharge,
    newBalance,
    reversedDeductionCount,
    accrualsRecomputed,
    chargesCreated,
    chargesSkipped,
    skippedEnrollmentIds,
  };
}
