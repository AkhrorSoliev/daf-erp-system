import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  level?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['odd', 'even'])
  days?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exactDays?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: "Vaqt formati HH:mm bo'lishi kerak",
  })
  lessonStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: "Vaqt formati HH:mm bo'lishi kerak",
  })
  lessonEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(300)
  @Type(() => Number)
  lessonMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  teacherIds?: number[];
}
