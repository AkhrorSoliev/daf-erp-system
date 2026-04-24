import { IsIn } from 'class-validator';
import { DepartedStudentsSummaryQueryDto } from './departed-students-summary-query.dto';

export class DepartedStudentsGroupByQueryDto extends DepartedStudentsSummaryQueryDto {
  @IsIn(['course', 'teacher', 'branch'])
  groupBy: 'course' | 'teacher' | 'branch';
}
