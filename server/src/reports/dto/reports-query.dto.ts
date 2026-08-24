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
  // (It replaced `compare`/`compareStartDate`/`compareEndDate`, which were
  // kept as accepted-and-ignored params for one release and removed on
  // 2026-08-24 — the frontend release landed on 2026-08-10 and has been
  // redeployed many times since.)
  @IsOptional()
  @IsString()
  include?: string;
}
