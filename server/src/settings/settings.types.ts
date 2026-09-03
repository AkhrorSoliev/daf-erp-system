import { BadRequestException } from '@nestjs/common';
import { PaymentModel } from '@prisma/client';

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
  | 'payment.chargeDayOfMonth';

export interface SettingValueMap {
  'payment.defaultModel': PaymentModel;
  'payment.excusedCreditEnabled': boolean;
  'payment.excusedCreditMonthlyCap': number | null;
  'payment.chargeDayOfMonth': number;
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

function parseNullableNonNegativeInt(key: SettingKey, raw: unknown): number | null {
  if (raw === null) return null;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw;
  throw new BadRequestException(
    `${key} faqat manfiy bo'lmagan butun son yoki null bo'lishi mumkin, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function parseChargeDayOfMonth(raw: unknown): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 28) {
    return raw;
  }
  throw new BadRequestException(
    `payment.chargeDayOfMonth 1 dan 28 gacha bo'lgan butun son bo'lishi kerak (fevral oyi uchun cheklov), kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

export const SETTING_DEFINITIONS: {
  [K in SettingKey]: SettingDefinition<K>;
} = {
  'payment.defaultModel': {
    key: 'payment.defaultModel',
    defaultValue: PaymentModel.MONTHLY,
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
};

export const SETTING_KEYS = Object.keys(
  SETTING_DEFINITIONS,
) as SettingKey[];

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
