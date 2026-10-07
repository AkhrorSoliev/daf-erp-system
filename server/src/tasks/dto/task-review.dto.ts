import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class TaskReviewDto {
  @IsIn(['ACCEPT', 'RETURN']) action: 'ACCEPT' | 'RETURN';
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
