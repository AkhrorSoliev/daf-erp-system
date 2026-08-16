import { IsOptional, IsString } from 'class-validator';

/**
 * Query for the "Xodimlar stavkalari" list (non-teaching staff + their current
 * rate). Deliberately NOT paginated: a centre has a handful of employees, and a
 * rate list whose point is "who is still missing one" must not hide a page of
 * them behind a pager.
 */
export class SalaryStaffConfigQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
