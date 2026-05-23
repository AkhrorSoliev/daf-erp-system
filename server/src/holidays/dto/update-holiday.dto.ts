import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

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
