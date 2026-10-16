import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class RatingMonthDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month 'YYYY-MM' ko'rinishida bo'lishi kerak",
  })
  month?: string;
}

export class RatingLowQueryDto extends RatingMonthDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;
}

export class RatingSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
