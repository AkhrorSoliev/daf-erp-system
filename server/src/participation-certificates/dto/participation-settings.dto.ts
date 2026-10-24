import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

const MIN = { message: "Foiz 0 dan kam bo'lmaydi" };
const MAX = { message: 'Foiz 100 dan oshmasin' };
const INT = { message: "Foiz butun son bo'lishi kerak" };

/** The app threshold of each level the Student App teaches. */
export class MinAppPercentDto {
  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  A1?: number;

  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  A2?: number;

  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  B1?: number;
}

/** `PATCH /participation-certificates/settings` (CEO). */
export class ParticipationSettingsDto {
  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  minAttendancePercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => MinAppPercentDto)
  minAppPercent?: MinAppPercentDto;

  /** Fewest counted lessons (attended + absent). */
  @IsOptional()
  @IsInt({ message: "Darslar soni butun son bo'lishi kerak" })
  @Min(1, { message: "Darslar soni 1 dan kam bo'lmaydi" })
  @Max(200, { message: 'Darslar soni 200 dan oshmasin' })
  minLessons?: number;

  /** Most late lessons, percent of the lessons attended. */
  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  maxLatePercent?: number;
}
