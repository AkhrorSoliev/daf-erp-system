import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export type CenterActivityBucket = 'daily' | 'weekly' | 'monthly';

export class CenterActivityQueryDto {
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

  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  bucket?: CenterActivityBucket;
}
