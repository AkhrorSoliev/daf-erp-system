import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * No `branchId`, on purpose. Whose a holiday is (one branch, or the whole
 * centre) gets fixed at creation, like a group's branch. The global
 * ValidationPipe (`forbidNonWhitelisted`) refuses an edit that sends one, so
 * nobody turns a branch holiday into a centre-wide one or moves it. To move
 * one, delete it and create it again.
 */
export class UpdateHolidayDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Sana to'g'ri formatda bo'lishi kerak (YYYY-MM-DD)" },
  )
  date?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Tugash sanasi to'g'ri formatda bo'lishi kerak (YYYY-MM-DD)" },
  )
  endDate?: string;
}
