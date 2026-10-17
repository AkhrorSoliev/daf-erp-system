import { BadRequestException } from '@nestjs/common';
import { KpiRuleMode, PaymentModel } from '@prisma/client';

/**
 * Sozlamalar registri — `/settings` panelining yagona manbasi.
 *
 * Bu yerda RO'YXATGA OLINMAGAN kalit `SettingsService`ga uzatilsa dastur
 * xatosi hisoblanadi (404 emas): chaqiruvchi kompilyatsiya vaqtida
 * `SettingKey` ittifoqidan tashqariga chiqolmaydi, shuning uchun bunday
 * holat faqat ichki xato (masalan, ro'yxatga qo'shishni unutish) bo'lishi
 * mumkin.
 *
 * Har bir yozuv: boshlang'ich qiymat (baza bo'sh bo'lsa ishlatiladi) va
 * `parse` — kiruvchi qiymatni (baza qatoridan ham, `PATCH` so'rovidan ham)
 * tipli qiymatga aylantiradi yoki noto'g'ri bo'lsa lotin-o'zbekcha xabar
 * bilan `BadRequestException` tashlaydi.
 *
 * FAQAT haqiqiy iste'molchisi bor sozlamalar shu yerda. `payment.
 * prorationMethod` va `payment.debtGraceDays` ATAYLAB yo'q — dizayn
 * hujjatida (bo'lim 8) sanalgan bo'lsa ham, ularni o'qiydigan kod hali
 * yo'q va bo'sh tugma panelni yolg'onga aylantiradi.
 */

export type SettingKey =
  | 'payment.defaultModel'
  | 'payment.excusedCreditEnabled'
  | 'payment.excusedCreditMonthlyCap'
  | 'payment.chargeDayOfMonth'
  | 'payment.debtWriteOffEnabled'
  | 'payment.monthlyNoticesEnabled'
  | 'payment.noRefundAfterPercent'
  | 'payment.admissionRuleEnabled'
  | 'payment.trialLessonEnabled'
  | 'payment.attendanceOpensMinutesBefore'
  | 'payment.admissionMinPaidPercent'
  | 'payment.paidThroughReminderDays'
  | 'lessonRating.enabled'
  | 'leads.maxUntouched'
  | 'leads.firstActionHours'
  | 'leads.followUpDays'
  | 'kpi.enabled'
  | 'kpi.leadPaid.mode'
  | 'kpi.leadPaid.value'
  | 'kpi.promiseKept.mode'
  | 'kpi.promiseKept.value';

export interface SettingValueMap {
  'payment.defaultModel': PaymentModel;
  'payment.excusedCreditEnabled': boolean;
  'payment.excusedCreditMonthlyCap': number | null;
  'payment.chargeDayOfMonth': number;
  'payment.debtWriteOffEnabled': boolean;
  'payment.monthlyNoticesEnabled': boolean;
  'payment.noRefundAfterPercent': number;
  'payment.admissionRuleEnabled': boolean;
  'payment.trialLessonEnabled': boolean;
  'payment.attendanceOpensMinutesBefore': number;
  'payment.admissionMinPaidPercent': number;
  'payment.paidThroughReminderDays': number;
  'lessonRating.enabled': boolean;
  'leads.maxUntouched': number;
  'leads.firstActionHours': number;
  'leads.followUpDays': number;
  'kpi.enabled': boolean;
  'kpi.leadPaid.mode': KpiRuleMode;
  'kpi.leadPaid.value': number;
  'kpi.promiseKept.mode': KpiRuleMode;
  'kpi.promiseKept.value': number;
}

interface SettingDefinition<K extends SettingKey> {
  key: K;
  /** Bazada qator yo'q bo'lsa (na filial, na kompaniya darajasida) qaytadigan qiymat. */
  defaultValue: SettingValueMap[K];
  /** Uzbek-tilida tushunarli xato bilan tekshiradi va tipga keltiradi. */
  parse: (raw: unknown) => SettingValueMap[K];
  /**
   * `true` bo'lsa — bu sozlama FAQAT kompaniya darajasida yoziladi
   * (`branchId: null`). Filial darajasidagi yozishga urinish
   * `SettingsService.set` da rad etiladi.
   *
   * Buni faqat sozlamani HAQIQATDA o'qigan kod ham filial bo'yicha
   * o'qisa qo'y — aks holda saqlangan filial qiymati hech qachon
   * ishlatilmaydigan "dekorativ" boshqaruvga aylanadi (`payment.
   * chargeDayOfMonth` shu sabab bilan qo'shildi: oylik hisob-kitob
   * cron/watchdog kompaniya darajasida ishlaydi, `branchId` bilan
   * hech qachon o'qimaydi — filial qiymati saqlansa ham HECH QACHON
   * ishlatilmasdi).
   *
   * IKKINCHI sabab — SIYOSAT. Sozlama filial bo'yicha o'qilsa ham,
   * qiymatni filialda O'ZGARTIRISH huquqi noto'g'ri bo'lishi mumkin:
   * `payment.debtWriteOffEnabled` ni CEO butun kompaniya uchun hal qildi,
   * va `PATCH /settings/payment` Branch Director'ga ham ochiq — filial
   * darajasida yozishga ruxsat bersak, direktor taqiqni o'ziga qayta
   * yoqib olardi. Bunday kalit ham shu bayroq bilan qulflanadi.
   */
  companyLevelOnly?: boolean;
}

function parsePaymentModel(raw: unknown): PaymentModel {
  if (raw === PaymentModel.LESSON_PACK || raw === PaymentModel.MONTHLY) {
    return raw;
  }
  throw new BadRequestException(
    `payment.defaultModel faqat "LESSON_PACK" yoki "MONTHLY" bo'lishi mumkin, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseBoolean(key: SettingKey, raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  throw new BadRequestException(
    `${key} faqat true/false bo'lishi mumkin, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseNullableNonNegativeInt(
  key: SettingKey,
  raw: unknown,
): number | null {
  if (raw === null) return null;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw;
  throw new BadRequestException(
    `${key} faqat manfiy bo'lmagan butun son yoki null bo'lishi mumkin, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseChargeDayOfMonth(raw: unknown): number {
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= 28
  ) {
    return raw;
  }
  throw new BadRequestException(
    `payment.chargeDayOfMonth 1 dan 28 gacha bo'lgan butun son bo'lishi kerak (fevral oyi uchun cheklov), kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parsePercent(key: SettingKey, raw: unknown): number {
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 100
  ) {
    return raw;
  }
  throw new BadRequestException(
    `${key} 0 dan 100 gacha bo'lgan butun son bo'lishi kerak, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseOpensMinutesBefore(raw: unknown): number {
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 60
  ) {
    return raw;
  }
  throw new BadRequestException(
    `payment.attendanceOpensMinutesBefore 0 dan 60 gacha bo'lgan butun son bo'lishi kerak, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseReminderDays(raw: unknown): number {
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 10
  ) {
    return raw;
  }
  throw new BadRequestException(
    `payment.paidThroughReminderDays 0 dan 10 gacha bo'lgan butun son bo'lishi kerak, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

/** A whole number in `[min, max]`, refused with the key's name otherwise. */
function parseIntInRange(
  key: string,
  raw: unknown,
  min: number,
  max: number,
): number {
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= min &&
    raw <= max
  ) {
    return raw;
  }
  throw new BadRequestException(
    `${key} ${min} dan ${max} gacha bo'lgan butun son bo'lishi kerak, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseKpiMode(key: SettingKey, raw: unknown): KpiRuleMode {
  if (raw === KpiRuleMode.FIXED || raw === KpiRuleMode.PERCENT) return raw;
  throw new BadRequestException(
    `${key} faqat "FIXED" yoki "PERCENT" bo'lishi mumkin, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

/** A rule's value: whole so'm up to 10 000 000; a percent is held to 0–100 by `KpiSettingsService`. */
const KPI_VALUE_MAX = 10_000_000;

export const SETTING_DEFINITIONS: {
  [K in SettingKey]: SettingDefinition<K>;
} = {
  'payment.defaultModel': {
    key: 'payment.defaultModel',
    // Cutover'gacha LESSON_PACK: `Course.paymentModel` ustuni ham shu
    // DEFAULT bilan — sxema chiqsa mavjud kurslar o'zgarmaydi. Bu sozlama
    // esa YANGI kursga qo'llanadi (`CoursesService.create`); MONTHLY bo'lsa
    // kod chiqqan kuni yaratilgan birinchi kurs jimgina oylik bo'lib
    // qolardi. `--apply` kuni CEO Sozlamalar → To'lov dan MONTHLY qiladi.
    defaultValue: PaymentModel.LESSON_PACK,
    parse: parsePaymentModel,
  },
  'payment.excusedCreditEnabled': {
    key: 'payment.excusedCreditEnabled',
    defaultValue: true,
    parse: (raw) => parseBoolean('payment.excusedCreditEnabled', raw),
  },
  'payment.excusedCreditMonthlyCap': {
    key: 'payment.excusedCreditMonthlyCap',
    defaultValue: null,
    parse: (raw) =>
      parseNullableNonNegativeInt('payment.excusedCreditMonthlyCap', raw),
  },
  'payment.chargeDayOfMonth': {
    key: 'payment.chargeDayOfMonth',
    defaultValue: 1,
    parse: parseChargeDayOfMonth,
    // Cron (`MonthlyBillingCronService`) va qorovul (`MonthlyBillingWatchdogService`)
    // buni FAQAT `companyId` bilan o'qiydi — `branchId` argumenti umuman
    // yo'q. Filial darajasida saqlab qo'yish shuning uchun hech qachon
    // ishlatilmaydigan qiymat yozardi (dekorativ boshqaruv).
    companyLevelOnly: true,
  },
  'payment.debtWriteOffEnabled': {
    key: 'payment.debtWriteOffEnabled',
    // CEO (21.09.2026, 9-javob): «Qarz kechirilishi bo'lmaydi» — qarz
    // butun tarixi bilan saqlanadi. Boshlang'ich `false`. O'chirib tashlash
    // o'rniga sozlama: prodda allaqachon yozilgan DEBT_WRITE_OFF qatorlari
    // bor va ularning tarixi «Kechirilganlar» tabida ko'rinib turishi
    // kerak. Iste'molchi — `StudentEnrollmentService` (eligibility + ikkala
    // yozish yo'li), o'quvchi guruhining `branchId`si bilan o'qiydi.
    defaultValue: false,
    parse: (raw) => parseBoolean('payment.debtWriteOffEnabled', raw),
    // O'QISH filial bo'yicha, YOZISH esa faqat kompaniya darajasida.
    // `PATCH /settings/payment` Branch Director'ga ham ochiq va kontroller
    // uning yozuvini jimgina o'z filialiga qulflaydi (`resolveWriteBranchId`
    // hech qachon rad etmaydi) — filial qiymati kompaniya qiymatidan ustun
    // bo'lgani uchun direktor CEO butun kompaniya uchun taqiqlagan amalni
    // AYNAN O'ZIGA qayta yoqib olardi. Qarz kechirish tugmalari esa aynan
    // Branch Director va Administrator qo'lida (`students.controller.ts`).
    // Shu bayroq bilan `SettingsService.set` har qanday filial yozuvini rad
    // etadi: yagona qiymatni faqat CEO o'zgartiradi.
    companyLevelOnly: true,
  },
  'payment.monthlyNoticesEnabled': {
    key: 'payment.monthlyNoticesEnabled',
    // CEO (27.09.2026): every monthly-course student gets the month's bill
    // and the 2nd-lesson reminder by Telegram (ADR-0042). Switching them off
    // is a toggle, not a deploy.
    defaultValue: true,
    parse: (raw) => parseBoolean('payment.monthlyNoticesEnabled', raw),
    // `MonthlyPaymentNoticeCronService` reads it by company only.
    companyLevelOnly: true,
  },
  'payment.noRefundAfterPercent': {
    key: 'payment.noRefundAfterPercent',
    // Contract 6.2 (ADR-0043): a student who leaves after more than this
    // share of the month's lessons were held gets no money back.
    defaultValue: 40,
    parse: (raw) => parsePercent('payment.noRefundAfterPercent', raw),
    // One contract for every branch: a branch director must not move the
    // threshold for their own branch.
    companyLevelOnly: true,
  },
  'payment.admissionRuleEnabled': {
    key: 'payment.admissionRuleEnabled',
    // Contract 3.2 (ADR-0047): from the month's 2nd lesson an unpaid student
    // is not admitted. A switch so the rule can be turned off without a
    // deploy (CEO, 28.09.2026). Off: every student is admitted, the payment
    // dialog shows no reach. Read by `LessonAdmissionService` per company.
    defaultValue: true,
    parse: (raw) => parseBoolean('payment.admissionRuleEnabled', raw),
    companyLevelOnly: true,
  },
  'payment.trialLessonEnabled': {
    key: 'payment.trialLessonEnabled',
    // Contract 3.5 (ADR-0048): a first-timer leaving after one lesson gets
    // the whole month back and the teacher is not paid for it. Off: the
    // ordinary departure rule. Read by `MonthlyChargeService` per company.
    defaultValue: true,
    parse: (raw) => parseBoolean('payment.trialLessonEnabled', raw),
    companyLevelOnly: true,
  },
  'payment.attendanceOpensMinutesBefore': {
    key: 'payment.attendanceOpensMinutesBefore',
    // ADR-0047: the attendance window opens this many minutes before the
    // lesson starts and closes when it ends. Read by
    // `AttendanceValidationService` per company; the client reads it from
    // the roster's `opensMinutesBefore`.
    defaultValue: 10,
    parse: parseOpensMinutesBefore,
    companyLevelOnly: true,
  },
  'payment.admissionMinPaidPercent': {
    key: 'payment.admissionMinPaidPercent',
    // Contract 3.2 as amended on 02.10.2026 (ADR-0064): from a group's 2nd
    // lesson of the month at least this share of the month's charge must be
    // paid. 0: only the lessons held are asked for (ADR-0047 as it was). Read
    // by `LessonAdmissionService` and the 19:50 notices, per company.
    defaultValue: 50,
    parse: (raw) => parsePercent('payment.admissionMinPaidPercent', raw),
    companyLevelOnly: true,
  },
  'payment.paidThroughReminderDays': {
    key: 'payment.paidThroughReminderDays',
    // Contract 3.7 (ADR-0064): a part payer is reminded from this many
    // calendar days before the first lesson their payments do not reach.
    // 0: no such reminder. Read by `MonthlyPaymentNoticeCronService`.
    defaultValue: 3,
    parse: parseReminderDays,
    companyLevelOnly: true,
  },
  'lessonRating.enabled': {
    key: 'lessonRating.enabled',
    // Darsdan keyin o'quvchidan Telegram'da baho so'rash (spec 2026-10-13).
    // O'chiq chiqadi — CEO «Dars baholari» sahifasida yoqadi.
    // `LessonRatingSenderService` kompaniya bo'yicha o'qiydi.
    defaultValue: false,
    parse: (raw) => parseBoolean('lessonRating.enabled', raw),
    companyLevelOnly: true,
  },
  // Lead owner (ADR-0093): read by `LeadOwnershipService` per company; the
  // CEO changes them on Sozlamalar → «Lidlar egaligi».
  'leads.maxUntouched': {
    key: 'leads.maxUntouched',
    defaultValue: 10,
    parse: (raw) => parseIntInRange('leads.maxUntouched', raw, 1, 100),
    companyLevelOnly: true,
  },
  'leads.firstActionHours': {
    key: 'leads.firstActionHours',
    defaultValue: 2,
    parse: (raw) => parseIntInRange('leads.firstActionHours', raw, 1, 24),
    companyLevelOnly: true,
  },
  'leads.followUpDays': {
    key: 'leads.followUpDays',
    defaultValue: 3,
    parse: (raw) => parseIntInRange('leads.followUpDays', raw, 1, 14),
    companyLevelOnly: true,
  },
  // Admin KPI (ADR-0096): read by `KpiSettingsService` per company; the CEO
  // changes them on Sozlamalar → «KPI sozlamalari» (`PATCH /kpi/settings`).
  'kpi.enabled': {
    key: 'kpi.enabled',
    defaultValue: true,
    parse: (raw) => parseBoolean('kpi.enabled', raw),
    companyLevelOnly: true,
  },
  'kpi.leadPaid.mode': {
    key: 'kpi.leadPaid.mode',
    defaultValue: KpiRuleMode.FIXED,
    parse: (raw) => parseKpiMode('kpi.leadPaid.mode', raw),
    companyLevelOnly: true,
  },
  'kpi.leadPaid.value': {
    key: 'kpi.leadPaid.value',
    defaultValue: 50_000,
    parse: (raw) =>
      parseIntInRange('kpi.leadPaid.value', raw, 0, KPI_VALUE_MAX),
    companyLevelOnly: true,
  },
  'kpi.promiseKept.mode': {
    key: 'kpi.promiseKept.mode',
    defaultValue: KpiRuleMode.FIXED,
    parse: (raw) => parseKpiMode('kpi.promiseKept.mode', raw),
    companyLevelOnly: true,
  },
  'kpi.promiseKept.value': {
    key: 'kpi.promiseKept.value',
    defaultValue: 20_000,
    parse: (raw) =>
      parseIntInRange('kpi.promiseKept.value', raw, 0, KPI_VALUE_MAX),
    companyLevelOnly: true,
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as string[]).includes(value);
}

export function getSettingDefinition<K extends SettingKey>(
  key: K,
): SettingDefinition<K> {
  const def = SETTING_DEFINITIONS[key];
  if (!def) {
    // Dastur xatosi: kalit SettingKey ittifoqidan tashqarida bo'lishi
    // mumkin emas — bu yerga yetib kelsa registrga yozishni unutgan.
    throw new Error(`Noma'lum sozlama kaliti (registrga qo'shilmagan): ${key}`);
  }
  return def;
}
