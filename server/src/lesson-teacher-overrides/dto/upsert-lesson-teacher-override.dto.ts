import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertLessonTeacherOverrideDto {
  // Full effective roster for this lesson (not a delta). Empty list is
  // rejected — for "no teacher" use case the right tool is a
  // LessonCancellation, not an override with zero teachers.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  teacherIds: number[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
