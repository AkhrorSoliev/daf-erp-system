import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

function toArray<T = string>(value: unknown): T[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0) as T[];
}

export class StudentPaymentsReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @Transform(({ value }) => toArray<string>(value)?.map((v) => Number(v)))
  @IsArray()
  @IsInt({ each: true })
  teacherIds?: number[];

  @IsOptional()
  @Transform(({ value }) => toArray<string>(value))
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  methods?: PaymentMethod[];

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;
}
