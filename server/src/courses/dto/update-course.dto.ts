import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  level?: string;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
