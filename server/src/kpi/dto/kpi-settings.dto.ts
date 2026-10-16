import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { KpiRuleMode } from '@prisma/client';

/** One result type's price (spec §7.4); a percent above 100 is refused by `KpiSettingsService`. */
export class KpiRuleDto {
  @IsIn([KpiRuleMode.FIXED, KpiRuleMode.PERCENT], {
    message: "Usul FIXED yoki PERCENT bo'lishi kerak",
  })
  mode!: KpiRuleMode;

  @IsInt({ message: "Qiymat butun son bo'lishi kerak" })
  @Min(0, { message: "Qiymat manfiy bo'lmaydi" })
  @Max(10_000_000, { message: 'Qiymat 10 000 000 dan oshmasin' })
  value!: number;
}

/** `PATCH /kpi/settings` (CEO). */
export class KpiSettingsDto {
  @IsOptional()
  @IsBoolean({ message: "Kalit ha yoki yo'q bo'lishi kerak" })
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => KpiRuleDto)
  leadPaid?: KpiRuleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => KpiRuleDto)
  promiseKept?: KpiRuleDto;
}
