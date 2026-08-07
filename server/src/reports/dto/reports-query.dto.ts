import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  // Optional sheet groups for the Excel export: CSV of
  // "buxgalteriya" | "marketing" | "qarzdorlar". Absent = the ten defaults.
  // (It replaced `compare`/`compareStartDate`/`compareEndDate` — the workbook
  // no longer builds a comparison sheet for them to drive.)
  @IsOptional()
  @IsString()
  include?: string;
}
