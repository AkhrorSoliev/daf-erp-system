import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentModel } from '@prisma/client';

/**
 * `PATCH /settings/payment` tanasi — barcha maydonlar ixtiyoriy, faqat
 * yuborilgan kalitlar yangilanadi. Haqiqiy tekshiruv (qiymat qabul
 * qilinadigan diapazonda ekanligi) `SettingsService.set` orqali
 * `SETTING_DEFINITIONS`da qayta bajariladi — bu DTO faqat shaklni (tur,
 * oraliq) tekshiradi, ikkinchi qatlam himoyasi sifatida.
 */
export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsEnum(PaymentModel)
  defaultModel?: PaymentModel;

  @IsOptional()
  @IsBoolean()
  excusedCreditEnabled?: boolean;

  // `null` — "limitsiz". `@IsOptional()` null va undefined ikkalasini ham
  // qoldiradi (class-validator), shuning uchun `IsInt`/`Min` faqat son
  // kelganda ishlaydi. `@Transform` `Number(null) === 0`ga aylantirib
  // qo'yishning oldini oladi — null null bo'lib qoladi.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value === null || value === undefined ? value : Number(value)))
  excusedCreditMonthlyCap?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  @Type(() => Number)
  chargeDayOfMonth?: number;

  // Faqat CEO uchun ma'noli — qaysi filialga yozish. Branch Director bu
  // maydondan qat'i nazar faqat o'z filialiga yoza oladi (kontrollerda
  // majburlanadi); CEO uchun berilmasa — kompaniya darajasida yoziladi.
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;
}
