import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REVIEW_REASON_MAX, REVIEW_REASON_TOO_LONG } from '../task-input';
export class TaskReviewDto {
  @IsIn(['ACCEPT', 'RETURN']) action: 'ACCEPT' | 'RETURN';
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(REVIEW_REASON_MAX, { message: REVIEW_REASON_TOO_LONG })
  reason?: string;
}
