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

  /**
   * @deprecated A group's branch is fixed at creation and is IGNORED here.
   *
   * The field is kept only so an older client that still sends it does not get
   * rejected by `forbidNonWhitelisted` mid-deploy. `GroupsWriteService.update`
   * discards it. Moving a group between branches would silently re-attribute
   * its students, lesson deductions and salary accruals, so it needs a
   * dedicated, explicit operation — not a side effect of editing the name.
   */
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

  /** Optional — when teachers are changed, admins may pick a reason. */
  @IsOptional()
  @IsString()
  changeReasonId?: string;
}
