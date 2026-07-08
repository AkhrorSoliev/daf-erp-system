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

  // Comparison controls for the Excel report's "Taqqoslash" sheet.
  // `compare` is a CSV of the requested bases: "prev" (previous equal-length
  // period), "yoy" (same period last year), "custom" (compareStartDate/End).
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
