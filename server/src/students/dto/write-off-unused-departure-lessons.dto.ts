import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One date the CEO ticked in «Foydalanilmagan darslar qarzini bekor qilish». */
export class UnusedDepartureDayDto {
  @IsString()
  enrollmentId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

/** Body for `POST /students/:id/unused-departure-lessons/write-off`. */
export class WriteOffUnusedDepartureLessonsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UnusedDepartureDayDto)
  dates!: UnusedDepartureDayDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
