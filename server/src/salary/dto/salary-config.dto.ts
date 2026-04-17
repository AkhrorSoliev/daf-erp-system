import {
  IsInt,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
} from 'class-validator';
import { SalaryType } from '@prisma/client';

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
}

export class GlobalSalaryConfigDto {
  @IsEnum(SalaryType)
  salaryType: SalaryType;

  @IsInt()
  @Min(1)
  value: number;
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
}
