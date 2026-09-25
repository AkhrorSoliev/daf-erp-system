import { IsInt, IsOptional, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** Query for the date-ranged departed-students charts (dynamics). */
export class DepartedStudentsRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "startDate YYYY-MM-DD formatda bo'lishi kerak",
  })
  startDate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "endDate YYYY-MM-DD formatda bo'lishi kerak",
  })
  endDate: string;
}
