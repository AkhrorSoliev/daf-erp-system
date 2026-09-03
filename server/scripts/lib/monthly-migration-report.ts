/**
 * Migratsiya rejasini bazadan MUSTAQIL hisoblaydi.
 *
 * Sof funksiya bo'lgani muhim: CEO ko'radigan raqamlar prod'ga tegmasdan
 * sinaladi, va `--dry-run` bilan `--apply` AYNAN bir xil arifmetikani
 * ishlatadi — hisobotda ko'rgan raqam bilan bazaga tushgan raqam
 * bir-biridan farq qila olmaydi.
 */
import { applyDiscount, clampDiscount } from '../../src/billing/monthly-price';

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
}

export interface StudentPlan {
  studentId: number;
  studentName: string;
  groups: string[];
  oldBalance: number;
  prepaidRefund: number;
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
    s.oldBalance + s.prepaidRefund + s.reversedSeptember - s.monthlyCharge;
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
    // plannedLessons === 0 (oyda shu guruh uchun dars kuni yo'q) —
    // MonthlyChargeService.createChargeForEnrollment shu holatda hech
    // qanday hisob yozmaydi (`if (plannedLessons === 0) return null;`).
    // Dry-run va apply BIR XIL arifmetikani ishlatishi kerak, shuning
    // uchun bu yerda ham hisob 0 — `coveredLessons >= plannedLessons`
    // (0 >= 0) to'liq narxni to'lab qo'yishi mumkin edi.
    const monthlyChargeFull =
      r.chargeable === false || r.plannedLessons <= 0
        ? 0
        : Math.round(
            r.coveredLessons >= r.plannedLessons
              ? r.monthlyPrice
              : (r.monthlyPrice * r.coveredLessons) / r.plannedLessons,
          );
    // Markazning ulushi — createChargeForEnrollment bilan bitta nusxadan
    // (task-9c-brief.md): 709 000 so'm/oy uch o'quvchida shu qadam
    // tushib qolgani sababli edi.
    const monthlyCharge = applyDiscount(
      monthlyChargeFull,
      clampDiscount(r.discountPercent ?? 0),
    );

    const existing = byStudent.get(r.studentId);
    if (existing) {
      existing.groups.push(r.groupName);
      existing.prepaidRefund += prepaidRefund;
      existing.monthlyCharge += monthlyCharge;
      continue;
    }

    byStudent.set(r.studentId, {
      studentId: r.studentId,
      studentName: r.studentName,
      groups: [r.groupName],
      oldBalance: r.balance,
      prepaidRefund,
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
    'studentId,ism,guruhlar,eski_balans,prepaid_qaytdi,02_09_bekor,sentabr_hisobi,yangi_balans,holat';
  const lines = plan.students.map((s) =>
    [
      s.studentId,
      `"${s.studentName}"`,
      `"${s.groups.join('; ')}"`,
      s.oldBalance,
      s.prepaidRefund,
      s.reversedSeptember,
      s.monthlyCharge,
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
