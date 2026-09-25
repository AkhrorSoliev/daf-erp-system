import { IsOptional, IsString } from 'class-validator';
import { DepartedStudentsSummaryQueryDto } from './departed-students-summary-query.dto';

/**
 * Query for the teacher-change events list — the "Jami o'zgarishlar" dialog.
 * The page's filters plus an optional reason.
 *
 * It must be a CLASS: an intersection type on `@Query()` is emitted as
 * `Object`, which the global ValidationPipe does not validate or transform, so
 * `courseId=a,b` reached Prisma as a string and the dialog failed with a 500.
 */
export class DepartedStudentsTeacherChangesQueryDto extends DepartedStudentsSummaryQueryDto {
  /** Exact change reason id. Use "null" (literal string) for "no reason". */
  @IsOptional()
  @IsString()
  reasonId?: string;
}
