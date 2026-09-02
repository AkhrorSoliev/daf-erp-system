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
 *  1. `TransactionsWriteService.reverseTransaction` — sentabrning eski
 *     (LESSON_PACK) LESSON_DEDUCTION qatorlarini teskari qiladi. ATAYLAB
 *     `reverseMonthlyFee` EMAS: o'sha metod faqat `metadata.mode ===
 *     'MONTHLY_PERIOD'` qatorlarni qabul qiladi va boshqasini rad etadi —
 *     bu qatorlar hali LESSON_PACK davridan, `reverseTransaction` esa har
 *     qanday tur uchun ishlaydigan umumiy teskari qiluvchi (ADR-0004:
 *     summasi asl qatorning ishorasidan, `Math.abs` yo'q).
 *  2. `EnrollmentBillingService.refundPrepaidToBalance` — qulflangan
 *     prepaid'ni balansga qaytaradi (allaqachon 0 bo'lsa — no-op).
 *  3. `Enrollment.prepaidLessonsRemaining`/`cycleLessonIndex` nolga.
 *  4. `Course.paymentModel = MONTHLY`.
 *  5. `MonthlyChargeService.createChargeForEnrollment` — xuddi cron
 *     ishlatadigan yo'lning o'zi.
 *  6. `SalaryAccrualService.reverseAccrualForAttendance` + `createAccrual` —
 *     sentabr davridagi har bir o'tilgan (billable) darsni YANGI muzlatilgan
 *     narxda qayta hisoblaydi. AVVAL reverse, KEYIN create — aks holda
 *     `SalaryAccrual.amount` yozuv va pul (Transaction + o'qituvchi balansi)
 *     bir-biridan uzilib qoladi (`accrueMonthlySalary` sharhi,
 *     `lesson-billing.service.ts`).
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
  createAccrual: (params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    attendanceId: string;
    lessonDate: Date;
    perLessonCost: number;
    companyId: number;
    deductionTransactionId?: string | null;
    tx: Prisma.TransactionClient;
  }) => Promise<unknown>;
}

/** Migratsiya qamrovidagi bitta yozilish — `courseId` alohida, chunki
 * `Course.paymentModel` shu yerdan yangilanadi (ChargeableEnrollment buni
 * o'z ichiga olmaydi). */
export interface EnrollmentToMigrate {
  enrollment: ChargeableEnrollment;
  courseId: string;
  discountPercent: number;
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
  reversedSeptember: number;
  monthlyCharge: number;
  newBalance: number;
  reversedDeductionCount: number;
  accrualsRecomputed: number;
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

  let prepaidRefund = 0;
  let reversedSeptember = 0;
  let monthlyCharge = 0;
  let reversedDeductionCount = 0;
  let accrualsRecomputed = 0;

  for (const item of params.enrollments) {
    const enr = item.enrollment;

    // ── 1. Sentabrning eski (LESSON_PACK) LESSON_DEDUCTION qatorlarini
    // teskari qilish. Idempotent: allaqachon teskari qilingan qator
    // `reversedAt: null` filtrida ko'rinmaydi — qayta ishga tushirish
    // hech narsa topmaydi va 0 qo'shadi. ──────────────────────────────────
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
      reversedDeductionCount += 1;
    }

    // ── 2. Qulflangan prepaid'ni balansga qaytarish. Allaqachon 0 bo'lsa
    // (avvalgi urinishda bajarilgan yoki umuman bo'lmagan) — null, no-op. ──
    const refund = await deps.refundPrepaidToBalance(tx, {
      enrollmentId: enr.id,
      reason: `${reason} — oldindan to'langan darslar balansga qaytarildi`,
      performedById: params.performedById,
    });
    if (refund) prepaidRefund += refund.refunded;

    // ── 3. Hisoblagichlarni nolga (idempotent — allaqachon 0 bo'lsa ham
    // zararsiz). ─────────────────────────────────────────────────────────
    await tx.enrollment.update({
      where: { id: enr.id },
      data: { prepaidLessonsRemaining: 0, cycleLessonIndex: 0 },
    });

    // ── 4. Kursni MONTHLY'ga o'tkazish (idempotent — updateMany allaqachon
    // MONTHLY bo'lsa ham qayta yozadi, xato bermaydi). Bir nechta guruh bir
    // xil kursni bo'lishishi mumkin — shu YERDA bir marta yozilgani ularning
    // barchasiga tegadi (kurs darajasidagi maydon). ─────────────────────
    await tx.course.updateMany({
      where: { id: item.courseId },
      data: { paymentModel: PaymentModel.MONTHLY },
    });

    // ── 5. Sentabr oylik hisobini yaratish — cron ishlatadigan XUDDI SHU
    // yo'l. Chegirma o'tkaziladi (default 0'ga tushib qolmaydi). Avvaldan
    // mavjud bo'lsa (qayta ishga tushirish), servis o'zi topib qaytaradi —
    // lekin bu holda pul YANGI harakatlanmagan, shuning uchun
    // `monthlyCharge` yig'indisiga faqat HAQIQIY YANGI yozuv qo'shiladi
    // (pastdagi `existingCharge` tekshiruvi). Aks holda qayta ishga
    // tushirish "kutilgan balans" formulasini ikki marta hisoblab, haqiqiy
    // xatosiz o'quvchini soxta xato deb to'xtatib qo'yardi. ───────────────
    const existingCharge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: enr.id,
          periodYear: params.periodYear,
          periodMonth: params.periodMonth,
        },
      },
      select: { id: true },
    });

    const chargeableEnrollment: ChargeableEnrollment = {
      ...enr,
      group: {
        ...enr.group,
        course: { ...enr.group.course, paymentModel: PaymentModel.MONTHLY },
      },
    };
    const charge = await deps.createChargeForEnrollment(tx, {
      enrollment: chargeableEnrollment,
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      companyId: params.companyId,
      performedById: params.performedById,
      discountPercent: item.discountPercent,
    });

    const isFreshCharge = !!charge && !existingCharge;
    if (isFreshCharge) {
      monthlyCharge += charge.chargedAmount;
    }

    // ── 6. Sentabr davridagi o'tilgan darslar uchun o'qituvchi haqini
    // YANGI muzlatilgan narxda qayta hisoblash. Faqat YANGI hisob
    // yaratilganda (yuqoridagi bilan bir xil sabab — qayta ishga tushirish
    // shu qadamni ikkinchi marta takrorlamasligi kerak: birinchi
    // muvaffaqiyatli urinishda accrual allaqachon yangi narxda). ─────────
    if (isFreshCharge && charge) {
      const lessons = await tx.attendance.findMany({
        where: {
          groupId: enr.groupId,
          studentId: params.studentId,
          date: { gte: params.periodGte, lt: params.periodLt },
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
          await deps.createAccrual({
            teacherId,
            studentId: params.studentId,
            groupId: lesson.groupId,
            attendanceId: lesson.id,
            lessonDate: lesson.date,
            perLessonCost: charge.perLessonCost,
            companyId: params.companyId,
            deductionTransactionId: charge.transactionId,
            tx,
          });
          accrualsRecomputed += 1;
        }
      }
    }
  }

  const expectedNewBalance =
    oldBalance + prepaidRefund + reversedSeptember - monthlyCharge;
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
    reversedSeptember,
    monthlyCharge,
    newBalance,
    reversedDeductionCount,
    accrualsRecomputed,
  };
}
