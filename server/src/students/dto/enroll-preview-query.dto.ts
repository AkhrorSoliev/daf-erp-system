import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class EnrollPreviewQueryDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  // The day the enroll dialog would send, in the format `enrollToGroup`
  // accepts; omitted means today, as there.
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Boshlanish sanasi YYYY-MM-DD formatida bo'lishi kerak",
  })
  startDate?: string;

  // Was the student at today's lesson? Only meaningful when it already ended.
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  attendedTodayLesson?: boolean;
}
