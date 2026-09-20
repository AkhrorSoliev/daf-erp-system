import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  activatedTill?: string;

  @IsOptional()
  @IsString()
  customCss?: string;

  @IsOptional()
  @IsString()
  customCssLead?: string;

  @IsOptional()
  @IsString()
  leadSuccessText?: string;

  // DaF faollik normasi (dizayn 3.4). Chegaralar: daqiqa 1..1440, savol 1..500,
  // kunlar 1..7. `sariq < haftalik` o'zaro sharti servisda — DTO bitta maydonni
  // ko'radi, ikkisini birga emas.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  dafKunlikDaqiqa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  dafKunlikSavol?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dafHaftalikKun?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dafSariqKun?: number;
}
