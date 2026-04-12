import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class TodayScheduleQueryDto {
  @Type(() => Number)
  @IsInt()
  branchId: number;

  @IsOptional()
  @IsString()
  date?: string;
}
