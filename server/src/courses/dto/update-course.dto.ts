import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentModel } from '@prisma/client';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  price?: number;

  // Sikl darslari soni — create-course.dto bilan bir xil guardrail. @Max(50)
  // xato kiritilgan qiymatlar (13/21/120) sikl o'lchami va per-lesson narxni
  // buzishining oldini oladi.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  lessonPaymentCount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Mavjud kursning to'lov modelini almashtirish — pul bilan bog'liq qaror,
  // shuning uchun har o'zgarish `EntityHistory`ga yoziladi (odatiy
  // `CoursesService.update` oqimi orqali, alohida kod yo'q).
  @IsOptional()
  @IsEnum(PaymentModel)
  paymentModel?: PaymentModel;
}
