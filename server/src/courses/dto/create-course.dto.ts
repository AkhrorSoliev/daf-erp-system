import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCourseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  lessonDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  courseDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  lessonMinutes?: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsInt()
  @Type(() => Number)
  branchId: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  companyId?: number;
}
