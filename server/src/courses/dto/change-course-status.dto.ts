import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CourseStatus } from '@prisma/client';

export class ChangeCourseStatusDto {
  @IsEnum(CourseStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(CourseStatus).join(', ')}`,
  })
  status: CourseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
