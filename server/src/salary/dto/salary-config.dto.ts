import {
  IsInt,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  Min,
} from 'class-validator';
import { SalaryType } from '@prisma/client';

// All three DTOs share the same effectiveFrom shape: optional YYYY-MM-DD
// (interpreted as 00:00 Tashkent in the service). Defaults to "today" when
// omitted. The service rejects values that go backwards or that fall inside
// an already-closed salary payment period.
export class CreateSalaryConfigDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsEnum(SalaryType)
  salaryType: SalaryType;

  @IsInt()
  @Min(1)
  value: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class GlobalSalaryConfigDto {
  @IsEnum(SalaryType)
  salaryType: SalaryType;

  @IsInt()
  @Min(1)
  value: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class UpdateSalaryConfigDto {
  @IsOptional()
  @IsEnum(SalaryType)
  salaryType?: SalaryType;

  @IsOptional()
  @IsInt()
  @Min(1)
  value?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
