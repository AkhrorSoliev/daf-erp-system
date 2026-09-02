/**
 * Oylik to'lov arifmetikasi.
 *
 * `lesson-price.ts` paket narxini darslarga bo'lsa, bu modul teskarisini
 * qiladi: oy narxi e'lon qilingan raqam, dars narxi esa undan kelib
 * chiqadi. Shuning uchun to'liq oy HECH QACHON qayta hisoblanmaydi — u
 * aynan e'lon qilingan narx, aks holda 450 000 x 13/13 kabi ifodalar
 * yaxlitlashda bir-ikki so'm siljitib, sikl narxidagi qoldiq muammosini
 * boshqa nom bilan qaytarardi.
 *
 * Sof funksiyalar: hisob servisi Serializable tranzaksiya va qulflar
 * ichida ishlaydi, o'quvchidan qancha olinishini hal qiladigan arifmetika
 * esa ularsiz ham sinaladigan bo'lishi kerak.
 */

/** Oy narxining bitta darsga to'g'ri keladigan ulushi. */
export function perLessonCostForMonth(
  monthlyPrice: number,
  plannedLessons: number,
): number {
  if (plannedLessons <= 0 || monthlyPrice <= 0) return 0;
  return Math.round(monthlyPrice / plannedLessons);
}

/**
 * O'quvchi shu oy uchun qancha to'laydi.
 *
 * To'liq oyni o'taydigan o'quvchi aynan `monthlyPrice` to'laydi. Proratsiya
 * faqat o'rtada qo'shilganda ishlaydi — qolgan darslar ulushi.
 */
export function proratedMonthlyAmount(
  monthlyPrice: number,
  plannedLessons: number,
  coveredLessons: number,
): number {
  if (plannedLessons <= 0 || monthlyPrice <= 0) return 0;
  if (coveredLessons <= 0) return 0;
  if (coveredLessons >= plannedLessons) return monthlyPrice;
  return Math.round((monthlyPrice * coveredLessons) / plannedLessons);
}

/**
 * O'quvchi chegirmasini (`Student.discountPercent`) 0–100 oralig'iga qisadi.
 *
 * Ikkala yo'l (12 talik `LessonBillingService` va oylik
 * `MonthlyChargeService`) BITTA nusxadan foydalanadi — ikkinchi nusxa
 * ilgari aynan shu arifmetikada tafovut yasagan (Task 6).
 */
export function clampDiscount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

/**
 * Chegirmani summaga qo'llaydi — markazning ulushini qisqartiradi.
 *
 * `perLessonCost` (yoki `EnrollmentMonthlyCharge.perLessonCost`) ATAYLAB
 * chegirmasiz qoladi: o'qituvchi haqi undan hisoblanadi, chegirmani faqat
 * markaz ko'taradi (`Student.discountPercent` izohiga qara).
 */
export function applyDiscount(
  fullAmount: number,
  discountPercent: number,
): number {
  if (discountPercent <= 0) return fullAmount;
  if (discountPercent >= 100) return 0;
  return Math.round((fullAmount * (100 - discountPercent)) / 100);
}

export interface LessonCreditResult {
  /** Shu oyda sarflangan kredit darslari soni. */
  creditLessonsUsed: number;
  /** Ularning pul ifodasi. */
  creditAmount: number;
  /** Balansdan yechiladigan yakuniy summa — hech qachon manfiy emas. */
  chargedAmount: number;
  /** Sig'magani — keyingi oyga suriladi. */
  carriedCreditLessons: number;
}

/**
 * O'tgan oyning uzrli darslarini shu oy hisobidan chegiradi.
 *
 * Kredit BUTUN dars birligida sarflanadi: yarim dars chegirish o'quvchiga
 * tushuntirib bo'lmaydigan raqam yasaydi. Sig'magani kuymaydi — keyingi
 * oyga suriladi.
 */
export function applyLessonCredit(
  grossAmount: number,
  perLessonCost: number,
  creditLessons: number,
): LessonCreditResult {
  const credit = Math.max(0, Math.trunc(creditLessons));
  if (credit === 0 || perLessonCost <= 0 || grossAmount <= 0) {
    return {
      creditLessonsUsed: 0,
      creditAmount: 0,
      chargedAmount: Math.max(0, grossAmount),
      carriedCreditLessons: credit,
    };
  }

  const affordable = Math.floor(grossAmount / perLessonCost);
  const used = Math.min(credit, affordable);
  const creditAmount = used * perLessonCost;

  return {
    creditLessonsUsed: used,
    creditAmount,
    chargedAmount: grossAmount - creditAmount,
    carriedCreditLessons: credit - used,
  };
}
