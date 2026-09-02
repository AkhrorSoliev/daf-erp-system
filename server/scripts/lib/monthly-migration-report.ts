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
  /** Eski paket bo'yicha dars narxi — prepaid qaytarish shu bo'yicha. */
  packPerLessonCost: number;
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

export function buildMigrationPlan(input: MigrationInput): MigrationPlan {
  const byStudent = new Map<number, StudentPlan>();

  for (const r of input.rows) {
    const prepaidRefund = r.prepaidLessons * r.packPerLessonCost;
    // plannedLessons === 0 (oyda shu guruh uchun dars kuni yo'q) —
    // MonthlyChargeService.createChargeForEnrollment shu holatda hech
    // qanday hisob yozmaydi (`if (plannedLessons === 0) return null;`).
    // Dry-run va apply BIR XIL arifmetikani ishlatishi kerak, shuning
    // uchun bu yerda ham hisob 0 — `coveredLessons >= plannedLessons`
    // (0 >= 0) to'liq narxni to'lab qo'yishi mumkin edi.
    const monthlyChargeFull =
      r.plannedLessons <= 0
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

  const students = [...byStudent.values()];
  for (const s of students) {
    s.newBalance =
      s.oldBalance + s.prepaidRefund + s.reversedSeptember - s.monthlyCharge;
    if (s.newBalance >= 0) {
      s.state = 'PAID';
    } else if (-s.newBalance <= s.monthlyCharge) {
      s.state = 'CURRENT_MONTH_PENDING';
    } else {
      s.state = 'OLD_DEBT';
    }
  }

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

function sum<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((acc, x) => acc + f(x), 0);
}

const som = (n: number) => n.toLocaleString('ru-RU');

export function renderSummary(plan: MigrationPlan): string {
  const s = plan.summary;
  return [
    '='.repeat(72),
    'MIGRATSIYA REJASI — HECH NARSA YOZILMADI',
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
