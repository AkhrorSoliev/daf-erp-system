import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateHolidayDto {
  @IsNotEmpty({ message: "Bayram nomi bo'sh bo'lmasligi kerak" })
  @IsString()
  @MaxLength(200)
  name: string;

  @IsNotEmpty({ message: "Sana ko'rsatilishi shart" })
  @IsDateString(
    {},
    { message: "Sana to'g'ri formatda bo'lishi kerak (YYYY-MM-DD)" },
  )
  date: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "Tugash sanasi to'g'ri formatda bo'lishi kerak (YYYY-MM-DD)" },
  )
  endDate?: string;

  /**
   * The branch the holiday closes. Absent (or null) = the whole centre, which
   * only the CEO may declare (`HolidaysService.create`). Fixed at creation:
   * `UpdateHolidayDto` deliberately has no such field.
   */
  @IsOptional()
  @IsInt({ message: "Filial noto'g'ri ko'rsatilgan" })
  branchId?: number | null;
}
