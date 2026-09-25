/**
 * Migratsiya rejasini bazadan MUSTAQIL hisoblaydi.
 *
 * Sof funksiya bo'lgani muhim: CEO ko'radigan raqamlar prod'ga tegmasdan
 * sinaladi, va `--dry-run` bilan `--apply` AYNAN bir xil arifmetikani
 * ishlatadi — hisobotda ko'rgan raqam bilan bazaga tushgan raqam
 * bir-biridan farq qila olmaydi.
 */
import {
  applyDiscount,
  clampDiscount,
  proratedMonthlyAmount,
} from '../../src/billing/monthly-price';

export interface MigrationRow {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  branchId: number;
  /** O'quvchining migratsiyadan oldingi balansi. */
  balance: number;
  prepaidLessons: number;
  /** Eski paket bo'yicha dars narxi — FAQAT ko'rsatish uchun. */
  packPerLessonCost: number;
  /**
   * Prepaid qaytarishning ANIQ summasi (`EnrollmentBillingService.
   * prepaidRefundValue` bilan bir xil arifmetika: batch summasi minus
   * sarflangan darslar). Berilmasa `prepaidLessons * packPerLessonCost` ga
   * tushadi — lekin o'sha ko'paytma sikl yaxlitlash qoldig'i tufayli bir necha
   * so'mga farq qiladi, shuning uchun `--apply` bashorat bilan haqiqatni
   * qator-qator solishtirganda AYNAN shu maydon ishlatiladi.
   */
  prepaidRefundTotal?: number;
  /**
   * Guruh ACTIVE emas (masalan PAUSED). `MonthlyChargeService.
   * createChargeForEnrollment` bunday guruhga hisob YOZMAYDI
   * (`statusEnum !== ACTIVE` -> null), shuning uchun bashorat ham 0 hisoblaydi
   * — aks holda CEO ko'rgan raqam hech qachon yozilmaydigan hisobni sanardi.
   * Berilmasa `true` (hisoblanadi).
   */
  chargeable?: boolean;
  monthlyPrice: number;
  plannedLessons: number;
  coveredLessons: number;
  /**
   * `Student.discountPercent` (0-100). `MonthlyChargeService.createChargeForEnrollment`
   * bilan AYNAN bir xil joyda qo'llanadi — aks holda bu bashorat haqiqiy
   * xizmat yozadigan raqamdan farq qilib qoladi.
   */
  discountPercent?: number;
  /**
   * Value of this month's lessons that a pack bought BEFORE the month already
   * paid for (carried-in-lessons.ts). Credited back once, next to the monthly
   * charge that bills those lessons again.
   */
  carriedInCredit?: number;
  carriedInLessons?: number;
  /**
   * A carried-in credit withheld for a manual decision: the pack's lessons
   * were partly given back by a freeze or cash refund, so the ledger cannot
   * say which September lessons it still paid for (carried-in-lessons.ts).
   */
  carriedInHeld?: number;
  /** Lessons before the month that the month's own pack paid for. */
  earlyLessonsInMonthPacks?: number;
  /**
   * What this enrollment's lessons of the month would cost on the old pack
   * model (covered lessons x the pack's base lesson price, discounted).
   * Report-only: flags the students the switch charges MORE for the month;
   * the CEO decides what to do about them.
   */
  oldSystemMonthCost?: number;
}

export interface StudentPlan {
  studentId: number;
  studentName: string;
  groups: string[];
  oldBalance: number;
  prepaidRefund: number;
  carriedInCredit: number;
  carriedInLessons: number;
  carriedInHeld: number;
  earlyLessonsInMonthPacks: number;
  oldSystemMonthCost: number;
  /**
   * How much more the monthly model charges this student for the month than
   * the old pack model would — 0 unless the gap exceeds rounding.
   */
  monthlyCostsMore: number;
  reversedSeptember: number;
  monthlyCharge: number;
  newBalance: number;
  state: 'PAID' | 'CURRENT_MONTH_PENDING' | 'OLD_DEBT';
}

export interface MigrationPlan {
  students: StudentPlan[];
  biggestChanges: StudentPlan[];
  summary: {
    studentCount: number;
    paidCount: number;
    currentMonthPendingCount: number;
    oldDebtCount: number;
    totalPrepaidRefund: number;
    totalReversedSeptember: number;
    totalMonthlyCharge: number;
    totalCarriedInCredit: number;
    carriedInStudentCount: number;
    carriedInLessons: number;
    carriedInHeldCount: number;
    carriedInHeldTotal: number;
    earlyLessonsInMonthPacks: number;
    monthlyCostsMoreCount: number;
    monthlyCostsMoreTotal: number;
    currentMonthDebt: number;
    oldDebt: number;
    positiveBalanceAfter: number;
  };
}

export interface MigrationInput {
  rows: MigrationRow[];
  /** studentId -> 02.09 da yechilgan va qaytariladigan summa. */
  reversedDeductions: Record<number, number>;
}

/**
 * Bitta o'quvchi qatorini yakunlaydi: `newBalance` va `state`ni
 * `oldBalance`/`prepaidRefund`/`reversedSeptember`/`monthlyCharge`dan
 * hisoblaydi. Mutatsiya qiladi (chaqiruvchi qulay bo'lishi uchun) va
 * o'sha obyektni qaytaradi.
 *
 * Eksport qilingan: `buildMigrationPlan` (bashorat, taxminiy raqamlar) va
 * migratsiyaning `--apply` yo'li (haqiqiy, bazaga yozilgan raqamlar) BIR XIL
 * arifmetikadan foydalanishi kerak — aks holda ikkovi orasidagi tafovut
 * "bashorat xato edi" bilan "kod xato ishladi"ni ajratib bo'lmaydigan qilib
 * qo'yardi.
 */
export function finalizeStudentPlan(s: StudentPlan): StudentPlan {
  s.newBalance =
    s.oldBalance +
    s.prepaidRefund +
    s.carriedInCredit +
    s.reversedSeptember -
    s.monthlyCharge;
  if (s.newBalance >= 0) {
    s.state = 'PAID';
  } else if (-s.newBalance <= s.monthlyCharge) {
    s.state = 'CURRENT_MONTH_PENDING';
  } else {
    s.state = 'OLD_DEBT';
  }
  return s;
}

/**
 * `StudentPlan[]` (allaqachon `newBalance`/`state`dan tashqari to'ldirilgan)
 * dan to'liq `MigrationPlan` yasaydi — sarhisob va "eng katta 20 ta"
 * bo'limlari bilan. `buildMigrationPlan` (bashorat) VA migratsiyaning
 * `--apply` natija-hisoboti (haqiqiy raqamlar) shu YAGONA joydan
 * foydalanadi, shunda ikkovi orasida sarhisob arifmetikasi mos kelmay
 * qolish xavfi yo'q.
 */
export function buildPlanFromStudents(students: StudentPlan[]): MigrationPlan {
  for (const s of students) finalizeStudentPlan(s);

  const summary = {
    studentCount: students.length,
    paidCount: students.filter((s) => s.state === 'PAID').length,
    currentMonthPendingCount: students.filter(
      (s) => s.state === 'CURRENT_MONTH_PENDING',
    ).length,
    oldDebtCount: students.filter((s) => s.state === 'OLD_DEBT').length,
    totalPrepaidRefund: sum(students, (s) => s.prepaidRefund),
    totalReversedSeptember: sum(students, (s) => s.reversedSeptember),
    totalMonthlyCharge: sum(students, (s) => s.monthlyCharge),
    totalCarriedInCredit: sum(students, (s) => s.carriedInCredit),
    carriedInStudentCount: students.filter((s) => s.carriedInCredit > 0).length,
    carriedInLessons: sum(students, (s) => s.carriedInLessons),
    carriedInHeldCount: students.filter((s) => s.carriedInHeld > 0).length,
    carriedInHeldTotal: sum(students, (s) => s.carriedInHeld),
    earlyLessonsInMonthPacks: sum(students, (s) => s.earlyLessonsInMonthPacks),
    monthlyCostsMoreCount: students.filter((s) => s.monthlyCostsMore > 0)
      .length,
    monthlyCostsMoreTotal: sum(students, (s) => s.monthlyCostsMore),
    // Qarzning qancha qismi shu oyniki, qancha qismi eskidan qolgani.
    currentMonthDebt: sum(students, (s) =>
      s.newBalance < 0 ? Math.min(-s.newBalance, s.monthlyCharge) : 0,
    ),
    oldDebt: sum(students, (s) =>
      s.newBalance < 0 ? Math.max(0, -s.newBalance - s.monthlyCharge) : 0,
    ),
    positiveBalanceAfter: sum(students, (s) => Math.max(0, s.newBalance)),
  };

  const biggestChanges = [...students]
    .sort(
      (a, b) =>
        Math.abs(b.newBalance - b.oldBalance) -
        Math.abs(a.newBalance - a.oldBalance),
    )
    .slice(0, 20);

  return { students, biggestChanges, summary };
}

export function buildMigrationPlan(input: MigrationInput): MigrationPlan {
  const byStudent = new Map<number, StudentPlan>();

  for (const r of input.rows) {
    // Aniq summa bo'lsa o'sha — `prepaidLessons * packPerLessonCost` bir necha
    // so'm yaxlitlash farqi beradi (izohga qarang).
    const prepaidRefund =
      r.prepaidRefundTotal ?? r.prepaidLessons * r.packPerLessonCost;
    // Proratsiya YAGONA manbadan — `proratedMonthlyAmount`. Bu yerda
    // ilgari o'sha formulaning qo'lda yozilgan nusxasi turardi va u bir
    // marta ALLAQACHON adashgan edi (`plannedLessons === 0` da
    // `coveredLessons >= plannedLessons` sharti 0 >= 0 bo'lib, oyda dars
    // kuni bo'lmagan guruhga to'liq oy narxini yozib qo'yardi — holbuki
    // `createChargeForEnrollment` bu holatda `null` qaytaradi).
    const monthlyChargeFull =
      r.chargeable === false
        ? 0
        : proratedMonthlyAmount(
            r.monthlyPrice,
            r.plannedLessons,
            r.coveredLessons,
          );
    // Markazning ulushi — createChargeForEnrollment bilan bitta nusxadan
    // (task-9c-brief.md): 709 000 so'm/oy uch o'quvchida shu qadam
    // tushib qolgani sababli edi.
    const monthlyCharge = applyDiscount(
      monthlyChargeFull,
      clampDiscount(r.discountPercent ?? 0),
    );
    // The credit offsets the monthly charge that bills those lessons again;
    // with no charge there is nothing to offset, and --apply writes none.
    const carriedInCredit =
      monthlyChargeFull > 0 ? (r.carriedInCredit ?? 0) : 0;
    const carriedInLessons =
      monthlyChargeFull > 0 ? (r.carriedInLessons ?? 0) : 0;
    const carriedInHeld = monthlyChargeFull > 0 ? (r.carriedInHeld ?? 0) : 0;
    const earlyLessonsInMonthPacks =
      r.chargeable === false ? 0 : (r.earlyLessonsInMonthPacks ?? 0);
    const oldSystemMonthCost =
      r.chargeable === false ? 0 : (r.oldSystemMonthCost ?? 0);
    // Both models round per lesson, so on the same per-lesson price they can
    // still differ by up to a so'm per lesson (400 000 / 12 billed as
    // 12 x 33 333 = 399 996). Only a gap beyond that is a real price rise.
    const extra = monthlyCharge - oldSystemMonthCost;
    const monthlyCostsMore =
      r.oldSystemMonthCost !== undefined && extra > r.coveredLessons + 1
        ? extra
        : 0;

    const existing = byStudent.get(r.studentId);
    if (existing) {
      existing.groups.push(r.groupName);
      existing.prepaidRefund += prepaidRefund;
      existing.monthlyCharge += monthlyCharge;
      existing.carriedInCredit += carriedInCredit;
      existing.carriedInLessons += carriedInLessons;
      existing.carriedInHeld += carriedInHeld;
      existing.earlyLessonsInMonthPacks += earlyLessonsInMonthPacks;
      existing.oldSystemMonthCost += oldSystemMonthCost;
      existing.monthlyCostsMore += monthlyCostsMore;
      continue;
    }

    byStudent.set(r.studentId, {
      studentId: r.studentId,
      studentName: r.studentName,
      groups: [r.groupName],
      oldBalance: r.balance,
      prepaidRefund,
      carriedInCredit,
      carriedInLessons,
      carriedInHeld,
      earlyLessonsInMonthPacks,
      oldSystemMonthCost,
      monthlyCostsMore,
      reversedSeptember: input.reversedDeductions[r.studentId] ?? 0,
      monthlyCharge,
      newBalance: 0,
      state: 'PAID',
    });
  }

  return buildPlanFromStudents([...byStudent.values()]);
}

function sum<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((acc, x) => acc + f(x), 0);
}

const som = (n: number) => n.toLocaleString('ru-RU');

/**
 * `title` standart bo'yicha dry-run sarlavhasi — `--apply`ning haqiqiy
 * natija hisoboti (`migrate-to-monthly.ts`) o'ziniki bilan almashtiradi,
 * chunki u YOZDI, "HECH NARSA YOZILMADI" degan matn u yerda noto'g'ri
 * bo'lardi. Arifmetika (`plan.summary`) ikkalasida ham AYNAN bir xil —
 * faqat sarlavha matni farq qiladi.
 */
export function renderSummary(
  plan: MigrationPlan,
  title = 'MIGRATSIYA REJASI — HECH NARSA YOZILMADI',
): string {
  const s = plan.summary;
  return [
    '='.repeat(72),
    title,
    '='.repeat(72),
    `O'quvchi soni:                 ${s.studentCount}`,
    '',
    `Qaytariladigan prepaid:        ${som(s.totalPrepaidRefund)} so'm`,
    `Bekor qilinadigan 02.09:       ${som(s.totalReversedSeptember)} so'm`,
    `Hisoblanadigan sentabr oyligi: ${som(s.totalMonthlyCharge)} so'm`,
    `Avgustda to'langan sentabr darslari: ${s.carriedInStudentCount} o'quvchi, ${s.carriedInLessons} dars — ${som(s.totalCarriedInCredit)} so'm qaytadi`,
    `  qo'lda ko'rilsin (muzlatish yoki pul qaytarishdan keyin): ${s.carriedInHeldCount} o'quvchi — ${som(s.carriedInHeldTotal)} so'm yozilmaydi`,
    `Sentabr paketi to'lagan avgust darslari: ${s.earlyLessonsInMonthPacks} dars (0 kutiladi; bo'lsa — bepul qoladi, qo'lda ko'rilsin)`,
    `Oylik 12 talikdan qimmat chiqadi:     ${s.monthlyCostsMoreCount} o'quvchi — jami ${som(s.monthlyCostsMoreTotal)} so'm (qaror CEO da)`,
    '',
    'MIGRATSIYADAN KEYINGI HOLAT',
    `  To'langan (musbat balans):   ${s.paidCount} ta — ${som(s.positiveBalanceAfter)} so'm`,
    `  Shu oy kutilmoqda:           ${s.currentMonthPendingCount} ta — ${som(s.currentMonthDebt)} so'm`,
    `  Eski qarzi bor:              ${s.oldDebtCount} ta — ${som(s.oldDebt)} so'm`,
    '='.repeat(72),
  ].join('\n');
}

export function renderStudentCsv(plan: MigrationPlan): string {
  const head =
    'studentId,ism,guruhlar,eski_balans,prepaid_qaytdi,avgust_darslari,avgust_darslari_qaytdi,avgust_qolda_korilsin,02_09_bekor,sentabr_hisobi,12_talikda_sentabr,oylik_qimmatroq,yangi_balans,holat';
  const lines = plan.students.map((s) =>
    [
      s.studentId,
      `"${s.studentName}"`,
      `"${s.groups.join('; ')}"`,
      s.oldBalance,
      s.prepaidRefund,
      s.carriedInLessons,
      s.carriedInCredit,
      s.carriedInHeld,
      s.reversedSeptember,
      s.monthlyCharge,
      s.oldSystemMonthCost,
      s.monthlyCostsMore,
      s.newBalance,
      s.state,
    ].join(','),
  );
  return [head, ...lines].join('\n');
}

/**
 * Migratsiyadan keyin qamrovda qolgan yozilishlar KUTILGANMI?
 *
 * Qamrovdan chiqishning yagona yo'li — shu davr uchun `EnrollmentMonthlyCharge`
 * yozilishi. Ikki toifa buni hech qachon qila olmaydi:
 *   - `chargesSkipped` — PAUSED guruh (I2: ataylab hisobsiz), yoki
 *     `createChargeForEnrollment` null qaytargan holat (oyda dars kuni yo'q,
 *     yozilish oy tugagach boshlangan);
 *   - yiqilgan o'quvchilarning barcha yozilishlari (tranzaksiya qaytdi).
 *
 * Shuning uchun qoldiq "> 0 bo'lsa xato" EMAS, ANIQ solishtiriladi. Avvalgi
 * "> 0" varianti to'g'ri bajarilgan to'liq ishni ham 1 kod bilan yiqitardi
 * (prodda 7 ta PAUSED yozilish bor) — bu esa operatorni aynan shu tekshiruvni
 * e'tiborsiz qoldirishga o'rgatardi.
 *
 * `limited` (`--limit` bilan ishlangan) — tegilmagan nishonlar ham qamrovda
 * qoladi, shuning uchun tekshiruv o'tkazib yuboriladi.
 */
export function scopeResidueVerdict(params: {
  remainingInScope: number;
  chargesSkipped: number;
  failedEnrollments: number;
  limited: boolean;
}): { expected: number; unexplained: number; ok: boolean } {
  const expected = params.chargesSkipped + params.failedEnrollments;
  const unexplained = params.remainingInScope - expected;
  return { expected, unexplained, ok: params.limited || unexplained === 0 };
}
