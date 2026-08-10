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

  // ACCEPTED AND IGNORED — one release only. `forbidNonWhitelisted` 400s any
  // unknown param, and client/server deploy separately here, so a page served
  // from before this release would lose its download entirely. Delete once the
  // frontend release has landed. Nothing may READ these.
  @IsOptional()
  @IsString()
  compare?: string;

  @IsOptional()
  @IsString()
  compareStartDate?: string;

  @IsOptional()
  @IsString()
  compareEndDate?: string;
}
