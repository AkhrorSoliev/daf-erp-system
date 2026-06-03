import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCourseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  lessonDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  courseDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  lessonMinutes?: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  price: number;

  // Bitta to'lov sikli qoplaydigan darslar soni. Odatda 12 (standart) yoki 20
  // (intensiv). @Max guardrail bo'lib, xato kiritilgan 13/21/120 kabi qiymatlar
  // sikl o'lchami va per-lesson narxni buzib yuborishining oldini oladi. Aniq
  // {12,20} enum emas — maydon ataylab o'zgaruvchan, faqat aqlli chegara.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  lessonPaymentCount?: number;

  @IsInt()
  @Type(() => Number)
  branchId: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  companyId?: number;
}
