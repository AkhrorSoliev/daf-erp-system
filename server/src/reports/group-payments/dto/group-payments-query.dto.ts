import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  KESIMLAR,
  TARTIBLAR,
  type Kesim,
  type Tartib,
} from '../group-payments.math';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?oy=` — the drawer's month (spec B5 §5.3). The range is checked in `parseReportMonth`. */
export class GroupDrawerQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: "Oy YYYY-MM ko'rinishida bo'lishi kerak" })
  oy?: string;
}

/** The table's filters without the page — what the Excel takes (spec B5 §5.4). */
export class GroupPaymentsFilterDto extends GroupDrawerQueryDto {
  @IsOptional()
  @IsIn(KESIMLAR, { message: "Kesim guruh, ustoz yoki kurs bo'lishi kerak" })
  kesim?: Kesim;

  @IsOptional()
  @IsString({ message: "Qidiruv matn bo'lishi kerak" })
  @MaxLength(100, { message: 'Qidiruv 100 belgidan oshmasin' })
  q?: string;

  @IsOptional()
  @IsIn(TARTIBLAR, { message: "Saralash foiz, qoldi yoki nomi bo'lishi kerak" })
  tartib?: Tartib;

  @IsOptional()
  @IsIn(['1'], { message: "«Faqat qarzi borlar» qiymati 1 bo'ladi" })
  qarzdor?: '1';
}

/** `GET /reports/group-payments` (spec B5 §5.2). */
export class GroupPaymentsQueryDto extends GroupPaymentsFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Sahifa butun son bo'lishi kerak" })
  @Min(1, { message: "Sahifa 1 dan kichik bo'lmaydi" })
  sahifa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Qatorlar soni butun son bo'lishi kerak" })
  @Min(10, { message: "Qatorlar soni 10 dan 50 gacha bo'ladi" })
  @Max(50, { message: "Qatorlar soni 10 dan 50 gacha bo'ladi" })
  soni?: number;
}
